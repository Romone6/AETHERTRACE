"""Rebuild the 3I/ATLAS display from the source cutouts pinned in its processing record."""

import argparse
import hashlib
import json
from pathlib import Path

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from PIL import Image

from services.api.alignment import _sample
from services.api.display import asinh_grayscale, percentile_limits

PUBLIC = Path(__file__).resolve().parents[1] / "apps/web/public"
MANIFEST = PUBLIC / "observations/comet/processing.json"
ENLARGEMENT = 8


def save_preview(pixels, path):
    height, width = pixels.shape[:2]
    Image.fromarray(np.flipud(pixels)).resize(
        (width * ENLARGEMENT, height * ENLARGEMENT), Image.Resampling.NEAREST
    ).save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(paths):
    report = json.loads(MANIFEST.read_text())
    count = report["grid"]["pixels"]
    sky_wcs = WCS(naxis=2)
    sky_wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    sky_wcs.wcs.crval = [report["grid"]["ra"], report["grid"]["dec"]]
    sky_wcs.wcs.crpix = [(count + 1) / 2] * 2
    sky_wcs.wcs.cdelt = np.array([-1, 1]) * report["grid"]["arcsec_per_pixel"] / 3600
    y, x = np.indices((count, count))
    sky = sky_wcs.pixel_to_world(x, y)
    values, footprints = [], []
    for frame, path in zip(report["frames"], paths, strict=True):
        if hashlib.sha256(path.read_bytes()).hexdigest() != frame["sha256"]:
            raise ValueError(f"{path} does not match the source cutout for {frame['id']}")
        with fits.open(path) as hdus:
            hdu = hdus["IMAGE"]
            detector_x, detector_y = WCS(hdu.header, naxis=2).celestial.world_to_pixel(sky)
            pixels, _, footprint = _sample(
                hdu.data, np.zeros_like(hdu.data), np.isfinite(hdu.data), detector_x, detector_y
            )
        values.append(pixels)
        footprints.append(footprint)

    common = np.logical_and.reduce(footprints)
    if common.sum() != report["common_pixels"] or common.size != report["total_pixels"]:
        raise ValueError("The rendered footprint does not match the verified footprint")
    display = report["display"]
    low, high = percentile_limits(np.concatenate([pixels[common] for pixels in values]), display["percentiles"])
    for frame, pixels in zip(report["frames"], values, strict=True):
        preview = asinh_grayscale(pixels, common, low, high, strength=display["asinh_strength"])
        frame["preview_sha256"] = save_preview(preview, PUBLIC / frame["image"].lstrip("/"))

    overlay = np.zeros((*common.shape, 4), dtype=np.uint8)
    overlay[~common] = (56, 109, 174, 255)
    path = MANIFEST.with_name("coverage.png")
    report["scale"] = [low, high]
    report["coverage_overlay"] = {
        "image": "/observations/comet/coverage.png",
        "sha256": save_preview(overlay, path),
        "description": "Blue marks pixels outside the shared finite footprint. The overlay does not represent quality flags.",
    }
    MANIFEST.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cutouts", nargs=3, type=Path, help="Verified FITS cutouts in chronological order")
    render(parser.parse_args().cutouts)
