"""Refresh Barnard’s Star blink previews from the verified source cutouts."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from astropy.io import fits

from services.api.alignment import align_pair, display_pair
from services.api.display import percentile_limits

WEB = Path(__file__).resolve().parents[1] / "apps/web"


def render(first: Path, second: Path):
    manifest = WEB / "public/observations/barnard/processing.json"
    report = json.loads(manifest.read_text())
    for path, frame in zip((first, second), report["frames"], strict=True):
        if hashlib.sha256(path.read_bytes()).hexdigest() != frame["sha256"]:
            raise ValueError(f"{path} does not match the verified source cutout")
    with fits.open(first) as a, fits.open(second) as b:
        pair = align_pair(a, b)
        previews = display_pair(pair)
    if report["aligned_pixels"] != int(pair.common.sum()) or report["grid_pixels"] != pair.common.size:
        raise ValueError("Source alignment does not match the verified footprint")
    for frame, png in zip(report["frames"], previews, strict=True):
        (WEB / "public" / frame["image"].lstrip("/")).write_bytes(png)
        frame["preview_sha256"] = hashlib.sha256(png).hexdigest()
    report["blink_display"] = {
        "percentiles": [1, 99.5],
        "asinh_strength": 10,
        "shared_limits_mjy_sr": percentile_limits(np.concatenate((pair.a[pair.common], pair.b[pair.common]))),
    }
    manifest.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    args = parser.parse_args()
    render(args.first, args.second)
