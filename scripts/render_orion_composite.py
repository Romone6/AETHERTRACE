"""Render the homepage's Orion plate from the SPHEREx DR1 FITS cubes."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.visualization import make_lupton_rgb
from astropy.wcs import WCS
from PIL import Image

OUTPUT = Path(__file__).resolve().parents[1] / "apps/web/public/observations"
ARCHIVE = (
    "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/"
    "hips5_cube/hips_20261026/Norder5/Dir0"
)
TILES = ("Npix5359_cube.fits", "Npix5701_cube.fits")
BANDS = (("Red", 3.3), ("Green", 2.2), ("Blue", 1.25))
CENTER = (83.822083, -5.31)
PIXEL_SCALE = 12.9
WIDTH, HEIGHT = 376, 196
STRETCH, Q = 0.16, 9


def read_tile(path, sky):
    with fits.open(path) as cube:
        cube.verify("exception")
        image, hits = cube["IMAGE"], cube["NHITS"]
        if cube[0].header["TELESCOP"] != "SPHEREx" or image.header["BUNIT"] != "MJy/sr":
            raise ValueError(f"Unexpected cube metadata in {path}")
        table = cube["SPECTRAL_CHANNELS"].data
        spectral = table["WAVELENGTH"]
        indices = [int(np.argmin(np.abs(spectral - wavelength))) for _, wavelength in BANDS]
        bands = [
            {
                "color": color,
                "plane": index + 1,
                "detector": int(table[index]["DETECTOR"]),
                "subchannel": int(table[index]["SUBCHAN"]),
                "wavelength_um": round(float(spectral[index]), 3),
                "min_um": round(float(table[index]["WL_MIN"]), 3),
                "max_um": round(float(table[index]["WL_MAX"]), 3),
            }
            for (color, _), index in zip(BANDS, indices)
        ]
        x, y = WCS(image.header, fobj=cube).celestial.world_to_pixel(sky)
        height, width = image.shape[1:]
        inside = (x >= -0.5) & (x < width - 0.5) & (y >= -0.5) & (y < height - 0.5)
        x = np.rint(x[inside]).astype(int).clip(0, width - 1)
        y = np.rint(y[inside]).astype(int).clip(0, height - 1)
        values = np.stack([image.section[index, :, :][y, x] for index in indices])
        counts = np.stack([hits.section[index, :, :][y, x] for index in indices])
        dates = {key: cube[0].header[key] for key in ("DATE-BEG", "DATE-END")}

    support = np.zeros(inside.shape, dtype=int)
    support[inside] = np.where(np.isfinite(values).all(axis=0), counts.min(axis=0), 0)
    pixels = np.full((len(BANDS), *inside.shape), np.nan, dtype=np.float32)
    pixels[:, inside] = values
    with path.open("rb") as source:
        checksum = hashlib.file_digest(source, "sha256").hexdigest()
    return pixels, support, bands, {
        "product": path.name,
        "fits_url": f"{ARCHIVE}/{path.name}",
        "sha256": checksum,
        "earliest_input_utc": dates["DATE-BEG"],
        "latest_input_utc": dates["DATE-END"],
    }


def render(directory):
    projection = WCS(naxis=2)
    projection.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    projection.wcs.crval = CENTER
    projection.wcs.crpix = [(WIDTH + 1) / 2, (HEIGHT + 1) / 2]
    projection.wcs.cdelt = np.array([-PIXEL_SCALE, PIXEL_SCALE]) / 3600
    y, x = np.indices((HEIGHT, WIDTH))
    sky = projection.pixel_to_world(x, HEIGHT - 1 - y)

    best = np.zeros((HEIGHT, WIDTH), dtype=int)
    mosaic = np.full((len(BANDS), HEIGHT, WIDTH), np.nan, dtype=np.float32)
    sources, bands = [], None
    for name in TILES:
        pixels, support, tile_bands, source = read_tile(directory / name, sky)
        if bands is not None and bands != tile_bands:
            raise ValueError("Spectral channel tables disagree")
        bands = tile_bands
        use_tile = support > best
        mosaic[:, use_tile] = pixels[:, use_tile]
        best[use_tile] = support[use_tile]
        sources.append(source)

    covered = best > 0
    if not covered.any():
        raise ValueError("No pixels have coverage in all three bands")
    levels = np.percentile(mosaic[:, covered], [5, 99.85], axis=1)
    if np.any(levels[1] <= levels[0]):
        raise ValueError("A selected band has no usable display range")
    normalized = np.zeros_like(mosaic)
    normalized[:, covered] = np.clip(
        (mosaic[:, covered] - levels[0, :, None]) / (levels[1] - levels[0])[:, None], 0, 1
    )
    # Astropy maps zero intensity to black after evaluating its division.
    with np.errstate(invalid="ignore", divide="ignore"):
        rgb = make_lupton_rgb(*normalized, stretch=STRETCH, Q=Q)
    image = Image.fromarray(np.dstack((rgb, covered.astype(np.uint8) * 255)))
    output = OUTPUT / "orion-composite.webp"
    image.save(output, lossless=True, exact=True, method=6)
    manifest = {
        "title": "Orion Nebula",
        "release": "SPHEREx DR1",
        "product": "All-Sky Cube",
        "release_url": "https://www.ipac.caltech.edu/doi/10.26131/IRSA679",
        "image": output.name,
        "image_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "size_px": [WIDTH, HEIGHT],
        "center_icrs_deg": list(CENTER),
        "projection": "TAN, north up and east left",
        "pixel_scale_arcsec": PIXEL_SCALE,
        "coverage_fraction": covered.mean(),
        "bands": bands,
        "sources": sources,
        "processing": {
            "sampling": "Nearest native pixel with finite brightness and positive NHITS in all three bands. In overlaps prefer the highest minimum NHITS across the bands.",
            "display": "Per-band percentile normalization and clipping followed by the Lupton asinh RGB stretch. Missing coverage is transparent.",
            "input_units": "MJy/sr",
            "percentiles": [5, 99.85],
            "display_levels_by_percentile_rgb": levels.tolist(),
            "lupton_stretch": STRETCH,
            "lupton_q": Q,
        },
    }
    (OUTPUT / "orion-composite.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fits_directory", type=Path, help="Directory holding the two FITS cubes")
    render(parser.parse_args().fits_directory)
