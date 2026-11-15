"""Create explicitly masked estimates in gaps of bundled display images."""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

PUBLIC = Path(__file__).resolve().parents[1] / "apps/web/public"
ROOT = PUBLIC / "observations"
OUTPUT = ROOT / "simulation"
RELAXATION_PASSES = 48


def adjacent_sum(values):
    total = np.zeros_like(values)
    total[1:] += values[:-1]
    total[:-1] += values[1:]
    total[:, 1:] += values[:, :-1]
    total[:, :-1] += values[:, 1:]
    return total


def complete(rgb, missing):
    """Propagate orthogonal neighbor averages, then relax the estimated region."""
    pixels = rgb.astype(np.float32)
    pixels[missing] = 0
    known = ~missing
    if not known.any():
        raise ValueError("Completion requires measured input pixels")
    while not known.all():
        counts = adjacent_sum(known.astype(np.uint8))
        frontier = ~known & (counts > 0)
        pixels[frontier] = adjacent_sum(pixels)[frontier] / counts[frontier, None]
        known |= frontier

    neighbors = adjacent_sum(np.ones(missing.shape, dtype=np.uint8))[missing, None]
    for _ in range(RELAXATION_PASSES):
        pixels[missing] = adjacent_sum(pixels)[missing] / neighbors
    return np.rint(pixels).astype(np.uint8)


def render(image_path, coverage=None):
    with Image.open(image_path) as image:
        rgba = np.asarray(image.convert("RGBA"))
    if coverage:
        with Image.open(coverage) as mask:
            missing = np.asarray(mask.getchannel("A")) > 0
    else:
        missing = rgba[..., 3] == 0
    rgb = complete(rgba[..., :3], missing)
    y, x = np.indices(missing.shape)
    overlay = np.zeros(missing.shape + (4,), dtype=np.uint8)
    overlay[missing, :3] = [255, 182, 84]
    overlay[missing, 3] = np.where(((x + y) % 7)[missing] < 2, 160, 48)
    name = image_path.stem
    completion = OUTPUT / f"{name}-complete.webp"
    mask = OUTPUT / f"{name}-estimated.png"
    Image.fromarray(rgb).save(completion, lossless=True, method=6)
    Image.fromarray(overlay).save(mask, optimize=True)
    return {
        "completion": completion.relative_to(PUBLIC).as_posix(),
        "mask": mask.relative_to(PUBLIC).as_posix(),
        "source_sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
        "completion_sha256": hashlib.sha256(completion.read_bytes()).hexdigest(),
        "mask_sha256": hashlib.sha256(mask.read_bytes()).hexdigest(),
        "estimated_pixels": int(missing.sum()),
        "total_pixels": int(missing.size),
        **({"coverage": coverage.relative_to(PUBLIC).as_posix()} if coverage else {}),
    }


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    inputs = [(ROOT / f"{field}-composite.webp", None) for field in (
        "orion", "andromeda", "pleiades", "barnard-field", "orion-4005"
    )]
    for directory in (ROOT / "comet", ROOT / "comet/later"):
        report = json.loads((directory / "processing.json").read_text())
        coverage = PUBLIC / report["smooth_display"]["coverage_overlay"]["image"].lstrip("/")
        inputs.extend((PUBLIC / frame["smooth_image"].lstrip("/"), coverage) for frame in report["frames"])
    catalog = {
        "method": "Display-space RGB gap fill. Average known orthogonal neighbors in successive rings, then relax the estimated pixels with fixed measured boundaries.",
        "relaxation_passes": RELAXATION_PASSES,
        "mask": "Amber hatching marks all estimated pixels. Estimates are not calibrated measurements.",
        "displays": {path.relative_to(PUBLIC).as_posix(): render(path, coverage) for path, coverage in inputs},
    }
    (ROOT / "simulation.json").write_text(json.dumps(catalog, indent=2) + "\n")
