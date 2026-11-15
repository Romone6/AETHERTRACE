"""Verify the shipped, provenance-backed observation examples."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import pytest
from PIL import Image

WEB = Path(__file__).parents[1] / "apps/web"


def test_simulated_showcases_preserve_measured_pixels_and_mark_every_fill():
    public = WEB / "public"
    catalog = json.loads((public / "observations/simulation.json").read_text())
    assert len(catalog["displays"]) == 11
    for original, assets in catalog["displays"].items():
        for path, checksum in (
            (original, "source_sha256"), (assets["completion"], "completion_sha256"), (assets["mask"], "mask_sha256"),
        ):
            assert hashlib.sha256((public / path).read_bytes()).hexdigest() == assets[checksum]
        with Image.open(public / original) as image:
            rgba = np.asarray(image.convert("RGBA"))
        if "coverage" in assets:
            with Image.open(public / assets["coverage"]) as image:
                missing = np.asarray(image.getchannel("A")) > 0
        else:
            missing = rgba[..., 3] == 0
        with Image.open(public / assets["completion"]) as image:
            completed = np.asarray(image.convert("RGBA"))
        with Image.open(public / assets["mask"]) as image:
            estimated = np.asarray(image.getchannel("A")) > 0
        assert missing.any() and (~missing).any()
        assert np.array_equal(estimated, missing)
        assert np.all(completed[..., 3] == 255)
        assert np.array_equal(completed[~missing], rgba[~missing])
        assert np.any(completed[missing, :3] != rgba[missing, :3])


def test_orion_supplement_has_measured_coverage_at_the_core():
    root = WEB / "public/observations"
    manifest = json.loads((root / "orion-4005-composite.json").read_text())
    assert [band["wavelength_um"] for band in manifest["bands"]] == [4.005]
    image_path = root / manifest["image"]
    assert hashlib.sha256(image_path.read_bytes()).hexdigest() == manifest["image_sha256"]
    with Image.open(root / "orion-composite.webp") as composite, Image.open(image_path) as supplement:
        assert composite.size == supplement.size
        assert np.asarray(composite.getchannel("A"))[120, 188] == 0
        assert np.asarray(supplement.getchannel("A"))[120, 188] == 255


def test_saved_demo_contains_exact_barnard_records_and_native_previews():
    root = WEB / "public/observations/barnard"
    snapshot = json.loads((root / "saved-exposures.json").read_text())
    aligned = json.loads((root / "processing.json").read_text())
    assert {entry["observation"]["id"] for entry in snapshot["exposures"]} == {frame["id"] for frame in aligned["frames"]}
    for entry in snapshot["exposures"]:
        source = next(frame for frame in aligned["frames"] if frame["id"] == entry["observation"]["id"])
        assert entry["input_sha256"] == source["sha256"]
        assert entry["observation"]["product_url"] == source["source"]
        path = WEB / "public" / entry["preview"].lstrip("/")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["preview_sha256"]
        with Image.open(path) as image:
            assert image.mode == "L"
            shape = image.size
        linear_path = WEB / "public" / entry["linear_preview"].lstrip("/")
        assert hashlib.sha256(linear_path.read_bytes()).hexdigest() == entry["linear_sha256"]
        assert path.read_bytes() != linear_path.read_bytes()
        with Image.open(linear_path) as image:
            assert image.mode == "L" and image.size == shape


def test_saved_sky_fields_ship_two_stretches_for_each_verified_archive_record():
    public = WEB / "public"
    catalog = json.loads((public / "observations/saved-exposures/manifest.json").read_text())
    assert set(catalog) == {"andromeda", "orion-nebula", "pleiades"}
    for entries in catalog.values():
        (entry,) = entries
        record = entry["observation"]
        assert record["release"] == "DR1"
        assert record["id"] == record["provenance"]["archive_fields"]["obs_publisher_did"]
        assert urlparse(record["product_url"]).hostname == "irsa.ipac.caltech.edu"
        assert entry["inspection"]["finite_image_pixels"] > 0
        for field, checksum in (("preview", "preview_sha256"), ("linear_preview", "linear_sha256")):
            path = public / entry[field].lstrip("/")
            assert hashlib.sha256(path.read_bytes()).hexdigest() == entry[checksum]
            with Image.open(path) as image:
                assert image.mode == "L"
                assert image.getextrema()[1] > image.getextrema()[0]


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
            standard = np.asarray(image).copy()
        enhanced_path = WEB / "public" / frame["enhanced_image"].lstrip("/")
        assert hashlib.sha256(enhanced_path.read_bytes()).hexdigest() == frame["enhanced_sha256"]
        with Image.open(enhanced_path) as image:
            enhanced = np.asarray(image)
            assert image.mode == "RGB"
            assert enhanced.shape[:2] == standard.shape
            assert np.any(enhanced[..., 0] != enhanced[..., 1])
            assert np.all(enhanced[masked] == 0)
            assert np.median(enhanced[~masked]) > np.median(standard[~masked])


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


@pytest.mark.parametrize("pass_directory", ["", "later"])
def test_comet_smooth_render_preserves_missing_coverage(pass_directory):
    root = WEB / "public/observations/comet" / pass_directory
    report = json.loads((root / "processing.json").read_text())
    smooth = report["smooth_display"]
    with Image.open(WEB / "public" / smooth["coverage_overlay"]["image"].lstrip("/")) as image:
        masked = np.asarray(image.getchannel("A")) > 0
    assert masked.shape == (656, 656)
    with Image.open(root / "coverage.png") as image:
        original_mask = np.asarray(image.getchannel("A")) > 0
    original_mask = original_mask.repeat(2, axis=0).repeat(2, axis=1)
    assert np.all(masked[original_mask])
    for frame in report["frames"]:
        path = WEB / "public" / frame["smooth_image"].lstrip("/")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == frame["smooth_sha256"]
        with Image.open(path) as image:
            pixels = np.asarray(image)
            assert pixels.shape == (656, 656, 3)
            assert np.all(pixels[masked] == 0)
            assert np.unique(pixels[~masked], axis=0).shape[0] > 128


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
