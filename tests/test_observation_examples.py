"""Verify the shipped, provenance-backed observation examples."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

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
