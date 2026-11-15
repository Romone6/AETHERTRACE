"""Package the verified Barnard pair as native-grid previews for the saved demo."""

import argparse
import hashlib
import json
from pathlib import Path

from services.api.app import TARGETS
from services.api.display import render_cutout_png
from services.api.science import inspect_fits_cutout

ROOT = Path(__file__).resolve().parents[1] / "apps/web/public/observations/barnard"


def render(cutouts):
    provenance = json.loads((ROOT / "processing.json").read_text())
    exposures = []
    for index, (cutout, frame) in enumerate(zip(cutouts, provenance["frames"], strict=True), start=1):
        payload = cutout.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        observation = json.loads(cutout.with_suffix(".json").read_text())
        if digest != frame["sha256"] or observation["id"] != frame["id"] or observation["product_url"] != frame["source"]:
            raise ValueError(f"{cutout} or its record does not match the verified Barnard pair")
        png = render_cutout_png(payload)
        image_name = f"saved-native-{index}.png"
        (ROOT / image_name).write_bytes(png)
        linear_name = f"saved-linear-{index}.png"
        linear = render_cutout_png(payload, stretch="linear")
        (ROOT / linear_name).write_bytes(linear)
        exposures.append({
            "observation": observation,
            "inspection": inspect_fits_cutout(payload),
            "preview": f"/observations/barnard/{image_name}",
            "linear_preview": f"/observations/barnard/{linear_name}",
            "linear_sha256": hashlib.sha256(linear).hexdigest(),
            "input_sha256": digest,
            "preview_sha256": hashlib.sha256(png).hexdigest(),
        })
    snapshot = {"target": "barnards-star", "targets": list(TARGETS.values()), "release": "DR1", "exposures": exposures}
    (ROOT / "saved-exposures.json").write_text(json.dumps(snapshot, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cutouts", nargs=2, type=Path, help="Verified FITS cutouts, each with its sibling archive record JSON")
    render(parser.parse_args().cutouts)
