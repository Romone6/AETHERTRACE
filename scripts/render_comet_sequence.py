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
DEFAULT_MANIFEST = PUBLIC / "observations/comet/processing.json"
ENLARGEMENT = 8
SMOOTH_SAMPLING = 16
ENHANCED_PERCENTILES = (3, 98)
ENHANCED_STRENGTH = 12
# Increasing display intensity, from black through teal and amber to white.
COLOR_STOPS = ((0, "#000000"), (48, "#123646"), (104, "#26857f"),
               (166, "#c48d52"), (220, "#f9be76"), (255, "#fff5db"))


def brightness_palette():
    levels, colors = zip(*COLOR_STOPS)
    rgb = [[int(color[i:i + 2], 16) for i in (1, 3, 5)] for color in colors]
    channels = [np.interp(np.arange(256), levels, channel) for channel in np.array(rgb).T]
    return np.rint(np.column_stack(channels)).astype(np.uint8)


def save_preview(pixels, path, enlargement=ENLARGEMENT):
    height, width = pixels.shape[:2]
    Image.fromarray(np.flipud(pixels)).resize(
        (width * enlargement, height * enlargement), Image.Resampling.NEAREST
    ).save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sky_grid(grid, sampling):
    count = grid["pixels"] * sampling
    scale = grid["arcsec_per_pixel"] / sampling
    sky_wcs = WCS(naxis=2)
    sky_wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    sky_wcs.wcs.crval = [grid["ra"], grid["dec"]]
    sky_wcs.wcs.crpix = [(count + 1) / 2] * 2
    sky_wcs.wcs.cdelt = np.array([-1, 1]) * scale / 3600
    y, x = np.indices((count, count))
    return sky_wcs.pixel_to_world(x, y)


def render(paths, manifest):
    report = json.loads(manifest.read_text())
    location = "/" + manifest.parent.relative_to(PUBLIC).as_posix()
    grids = (sky_grid(report["grid"], 1), sky_grid(report["grid"], SMOOTH_SAMPLING))
    samples = []
    for frame, path in zip(report["frames"], paths, strict=True):
        if hashlib.sha256(path.read_bytes()).hexdigest() != frame["sha256"]:
            raise ValueError(f"{path} does not match the source cutout for {frame['id']}")
        with fits.open(path) as hdus:
            hdu = hdus["IMAGE"]
            wcs = WCS(hdu.header, naxis=2).celestial
            finite = np.isfinite(hdu.data)
            variance = np.zeros_like(hdu.data)
            samples.append([_sample(hdu.data, variance, finite, *wcs.world_to_pixel(sky)) for sky in grids])

    coarse, fine = zip(*samples, strict=True)
    common = np.logical_and.reduce([valid for _, _, valid in coarse])
    fine_common = np.logical_and.reduce([valid for _, _, valid in fine])
    fine_common &= common.repeat(SMOOTH_SAMPLING, axis=0).repeat(SMOOTH_SAMPLING, axis=1)
    if not common.any() or common.sum() != report.get("common_pixels", common.sum()):
        raise ValueError("The rendered footprint does not match the verified footprint")
    report["common_pixels"] = int(common.sum())
    report["total_pixels"] = int(common.size)
    display = report["display"]
    pool = np.concatenate([pixels[common] for pixels, _, _ in coarse])
    low, high = percentile_limits(pool, display["percentiles"])
    enhanced_low, enhanced_high = percentile_limits(pool, ENHANCED_PERCENTILES)
    palette = brightness_palette()
    for frame, (pixels, _, _), (fine_pixels, _, _) in zip(report["frames"], coarse, fine, strict=True):
        preview = asinh_grayscale(pixels, common, low, high, strength=display["asinh_strength"])
        frame["preview_sha256"] = save_preview(preview, PUBLIC / frame["image"].lstrip("/"))
        enhanced = asinh_grayscale(pixels, common, enhanced_low, enhanced_high, strength=ENHANCED_STRENGTH)
        frame["enhanced_image"] = frame["image"].removesuffix(".png") + "-enhanced.png"
        frame["enhanced_sha256"] = save_preview(palette[enhanced], PUBLIC / frame["enhanced_image"].lstrip("/"))

        smooth = asinh_grayscale(fine_pixels, fine_common, enhanced_low, enhanced_high, strength=ENHANCED_STRENGTH)
        frame["smooth_image"] = frame["image"].removesuffix(".png") + "-smooth.png"
        frame["smooth_sha256"] = save_preview(palette[smooth], PUBLIC / frame["smooth_image"].lstrip("/"), 1)

    fine_overlay = np.zeros((*fine_common.shape, 4), dtype=np.uint8)
    fine_overlay[~fine_common] = (56, 109, 174, 255)
    report["smooth_display"] = {
        "grid_pixels_per_side": int(fine_common.shape[0]),
        "display_arcsec_per_sample": report["grid"]["arcsec_per_pixel"] / SMOOTH_SAMPLING,
        "covered_samples": int(fine_common.sum()),
        "sampling": "Direct bilinear sampling of each native FITS image through its WCS. The display retains only the original shared footprint where every fine-grid exposure also has finite support.",
        "coverage_overlay": {
            "image": f"{location}/coverage-smooth.png",
            "sha256": save_preview(fine_overlay, manifest.with_name("coverage-smooth.png"), 1),
        },
    }

    overlay = np.zeros((*common.shape, 4), dtype=np.uint8)
    overlay[~common] = (56, 109, 174, 255)
    path = manifest.with_name("coverage.png")
    report["scale"] = [low, high]
    report["enhanced_display"] = {
        "percentiles": list(ENHANCED_PERCENTILES),
        "asinh_strength": ENHANCED_STRENGTH,
        "shared_limits_mjy_sr": [enhanced_low, enhanced_high],
        "palette_quantity": "Stretched brightness in one D6 exposure, not wavelength",
        "palette_stops": [{"level": level, "color": color} for level, color in COLOR_STOPS],
    }
    report["coverage_overlay"] = {
        "image": f"{location}/coverage.png",
        "sha256": save_preview(overlay, path),
        "description": "Blue marks pixels outside the shared finite footprint. The overlay does not represent quality flags.",
    }
    manifest.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cutouts", nargs=3, type=Path, help="Verified FITS cutouts in chronological order")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    render(args.cutouts, args.manifest.resolve())
