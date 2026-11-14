"""Verify the shipped, provenance-backed observation examples."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from PIL import Image

WEB = Path(__file__).parents[1] / "apps/web"


def test_curated_previews_match_manifest_and_share_one_grid():
    for name in ("comet", "barnard"):
        manifest = json.loads((WEB / "components" / f"{name}-data.json").read_text())
        dimensions = set()
        for frame in manifest["frames"]:
            path = WEB / "public" / frame["image"].lstrip("/")
            assert hashlib.sha256(path.read_bytes()).hexdigest() == frame["preview_sha256"]
            assert frame["id"].startswith("ivo://irsa.ipac/spherex_dr1?")
            assert urlparse(frame["source"]).hostname == "irsa.ipac.caltech.edu"
            with Image.open(path) as preview:
                dimensions.add(preview.size)
                preview.verify()
        assert len(dimensions) == 1


def test_barnard_worked_pair_fails_wavelength_and_center_mask_gates():
    report = json.loads((WEB / "components/barnard-data.json").read_text())
    a, b = report["frames"]
    assert abs(a["wavelength"] - b["wavelength"]) > (a["bandwidth"] + b["bandwidth"]) / 2
    assert a["rejected_bits"] and b["rejected_bits"]
    assert a["astrometry_flag"] == b["astrometry_flag"] == 0
    assert 0 < report["aligned_pixels"] <= report["grid_pixels"]
    assert report["status"] == "INSUFFICIENT_DATA"


def test_barnard_method_images_match_worked_pair():
    from services.api.alignment import EXCLUDED_PIXEL_COLOR

    report = json.loads((WEB / "components/barnard-data.json").read_text())
    original, mask = (report["method_images"][part] for part in ("original", "mask"))
    for entry in (original, mask):
        path = WEB / "public" / entry["image"].lstrip("/")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]
    mask_path = WEB / "public" / mask["image"].lstrip("/")
    with Image.open(mask_path) as image:
        excluded = np.all(np.asarray(image) == EXCLUDED_PIXEL_COLOR, axis=-1)
    assert excluded.size == report["grid_pixels"]
    assert excluded.sum() == report["grid_pixels"] - report["aligned_pixels"]
    for frame in report["frames"]:
        with Image.open(WEB / "public" / frame["image"].lstrip("/")) as preview:
            assert np.array_equal(np.all(np.asarray(preview) == EXCLUDED_PIXEL_COLOR, axis=-1), excluded)
