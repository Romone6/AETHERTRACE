"""Package verified archive FITS cutouts as saved single-exposure previews."""

import argparse
import hashlib
import io
import json
from pathlib import Path

from astropy.io import fits

from services.api.app import TARGETS
from services.api.display import render_cutout_png
from services.api.science import inspect_fits_cutout

ROOT = Path(__file__).resolve().parents[1] / "apps/web/public/observations/barnard"
SKY_FIELDS = ("andromeda", "orion-nebula", "pleiades")


def package_exposure(root, stem, observation, payload):
    entry = {
        "observation": observation,
        "inspection": inspect_fits_cutout(payload),
        "input_sha256": hashlib.sha256(payload).hexdigest(),
    }
    for stretch, field in (("asinh", "preview"), ("linear", "linear_preview")):
        png = render_cutout_png(payload, stretch=stretch)
        name = f"{stem}-{stretch}.png"
        (root / name).write_bytes(png)
        entry[field] = f"/observations/{root.name}/{name}"
        entry["preview_sha256" if stretch == "asinh" else "linear_sha256"] = hashlib.sha256(png).hexdigest()
    return entry


def render_sky_fields(cutouts):
    root = ROOT.parent / "saved-exposures"
    root.mkdir(exist_ok=True)
    catalog = {}
    for field, cutout in zip(SKY_FIELDS, cutouts, strict=True):
        observation = json.loads(cutout.with_suffix(".json").read_text())
        payload = cutout.read_bytes()
        with fits.open(io.BytesIO(payload)) as hdus:
            header = hdus["IMAGE"].header
            product = f"{header['OBSID']}/D{header['DETECTOR']}"
        if observation["release"] != "DR1" or observation["id"] != f"ivo://irsa.ipac/spherex_dr1?{product}":
            raise ValueError(f"{cutout} does not match its DR1 archive record")
        catalog[field] = [package_exposure(root, field, observation, payload)]
    (root / "manifest.json").write_text(json.dumps(catalog, indent=2) + "\n")


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
    parser.add_argument("cutouts", nargs="+", type=Path, help="Verified FITS cutouts, each with its sibling archive record JSON")
    parser.add_argument("--sky-fields", action="store_true", help="Take cutouts in Andromeda, Orion, Pleiades order")
    args = parser.parse_args()
    if len(args.cutouts) != (len(SKY_FIELDS) if args.sky_fields else 2):
        parser.error("provide three sky-field cutouts or two Barnard cutouts")
    (render_sky_fields if args.sky_fields else render)(args.cutouts)
