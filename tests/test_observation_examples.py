"""Verify the shipped, provenance-backed observation examples."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from PIL import Image

WEB = Path(__file__).parents[1] / "apps/web"


def test_comet_coverage_overlay_matches_the_shared_display_footprint():
    root = WEB / "public/observations/comet"
    manifest = json.loads((root / "processing.json").read_text())
    coverage = manifest["coverage_overlay"]
    overlay_path = WEB / "public" / coverage["image"].lstrip("/")
    assert hashlib.sha256(overlay_path.read_bytes()).hexdigest() == coverage["sha256"]
    with Image.open(overlay_path) as overlay:
        masked = np.asarray(overlay.getchannel("A")) > 0
    assert masked.sum() == (manifest["total_pixels"] - manifest["common_pixels"]) * 64
    for frame in manifest["frames"]:
        with Image.open(WEB / "public" / frame["image"].lstrip("/")) as image:
            assert np.all(np.asarray(image)[masked] == 0)


def test_curated_previews_match_manifest_and_share_one_grid():
    for name in ("comet", "barnard"):
        manifest = json.loads((WEB / "public/observations" / name / "processing.json").read_text())
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
    report = json.loads((WEB / "public/observations/barnard/processing.json").read_text())
    a, b = report["frames"]
    assert abs(a["wavelength"] - b["wavelength"]) > (a["bandwidth"] + b["bandwidth"]) / 2
    assert a["rejected_bits"] and b["rejected_bits"]
    assert a["astrometry_flag"] == b["astrometry_flag"] == 0
    assert 0 < report["aligned_pixels"] <= report["grid_pixels"]
    assert report["status"] == "INSUFFICIENT_DATA"


def test_barnard_method_images_match_worked_pair():
    from services.api.alignment import EXCLUDED_PIXEL_COLOR

    report = json.loads((WEB / "public/observations/barnard/processing.json").read_text())
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


def test_fixed_field_composites_share_bands_and_preserve_the_coverage_mask():
    root = WEB / "public/observations"
    for field in ("orion", "andromeda", "pleiades", "barnard-field"):
        report = json.loads((root / f"{field}-composite.json").read_text())
        path = root / report["image"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == report["image_sha256"]
        assert [(band["color"], band["wavelength_um"]) for band in report["bands"]] == [
            ("Red", 3.293), ("Green", 2.189), ("Blue", 1.254),
        ]
        with Image.open(path) as image:
            assert image.size == tuple(report["size_px"])
            alpha = np.asarray(image.getchannel("A"))
            assert set(np.unique(alpha)) <= {0, 255}
            assert (alpha == 255).mean() == report["coverage_fraction"]
            assert report["coverage_fraction"] > 0
        assert report["sources"]
        for source in report["sources"]:
            assert urlparse(source["fits_url"]).hostname == "irsa.ipac.caltech.edu"
            assert len(source["sha256"]) == 64
