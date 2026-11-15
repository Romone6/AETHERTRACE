import unittest
from collections import OrderedDict
from io import BytesIO

import pytest

try:
    import fastapi  # noqa: F401
    import httpx  # noqa: F401
except ModuleNotFoundError as error:
    raise unittest.SkipTest("install services/api/requirements.txt to run FastAPI route tests") from error

from fastapi.testclient import TestClient

from services.api import app as api

client = TestClient(api.app)

# Synthetic route fixture for contract tests; this is not archive data.
ROW_A = {
    "obs_id": "2025W33_2C_0321_1", "t_min": "60902.864715", "t_max": "60902.864900",
    "em_min": "1.63010e-6", "em_max": "2.43460e-6",
    "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/example.fits",
    "quality_flags": "0",
    "obs_publisher_did": "ivo://irsa.ipac/spherex_dr1?2025W33_2C_0321_1/D3",
    "energy_bandpassname": "SPHEREx-D3",
}
ROW_B = {**ROW_A, "obs_id": "2026W19_1A_0403_1", "obs_publisher_did": "ivo://irsa.ipac/spherex_dr1?2026W19_1A_0403_1/D3", "t_min": "61165.082972", "t_max": "61165.083000"}


@pytest.fixture(autouse=True)
def isolate_cutout_cache(monkeypatch):
    monkeypatch.setattr(api, "_cutout_cache", OrderedDict())
    monkeypatch.setattr(api, "_preview_cache", OrderedDict())


def test_shared_contract_routes(monkeypatch):
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, ROW_B], api.SIA_PARAMETERS))
    assert client.get("/api/targets").json()[0]["id"] == "barnards-star"
    observations = client.get("/api/observations", params={"target": "barnards-star"}).json()
    assert len(observations) == 2
    assert observations[0]["id"] == ROW_A["obs_publisher_did"]
    assert observations[0]["provenance"]["archive_fields"] == ROW_A
    comparison = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"], "epoch_b": ROW_B["obs_publisher_did"],
    }).json()
    assert comparison["status"] == "INSUFFICIENT_DATA"
    assert "difference_url" not in comparison
    assert "statistics" not in comparison
    assert client.get("/api/candidates", params={"target": "barnards-star"}).json() == []
    shifted = {**ROW_B, "em_min": "2.4e-6", "em_max": "3.0e-6"}
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, shifted], api.SIA_PARAMETERS))
    incompatible = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"], "epoch_b": shifted["obs_publisher_did"],
    })
    assert incompatible.status_code == 422


def test_comparison_optionally_inspects_synthetic_fits_cutouts(monkeypatch):
    import numpy as np
    from astropy.io import fits

    def encode_cutout(*extensions):
        output = BytesIO()
        fits.HDUList([fits.PrimaryHDU(), *extensions]).writeto(output)
        return output.getvalue()

    image = np.array([[1, np.nan, 2], [3, 4, np.inf]], dtype=np.float32)
    flags = np.array([[0, 1, 2], [0, 0, 4]], dtype=np.int16)
    variance = np.array([[1, 2, 0], [-1, np.nan, np.inf]], dtype=np.float32)
    row_b = {**ROW_B, "access_url": ROW_B["access_url"].replace("example.fits", "second.fits")}
    payloads = {
        ROW_A["access_url"]: encode_cutout(
            fits.ImageHDU(data=image, name="IMAGE"),
            fits.ImageHDU(data=flags, name="FLAGS"),
            fits.ImageHDU(data=variance, name="VARIANCE"),
            fits.BinTableHDU(name="WCS-WAVE"),
        ),
        row_b["access_url"]: encode_cutout(
            fits.ImageHDU(data=image, name="IMAGE"),
            fits.ImageHDU(data=flags[:, :2], name="FLAGS"),
        ),
    }
    requests = []

    def fake_fetch(url, data=None):
        source_url, _, query = url.partition("?")
        requests.append(source_url)
        assert query == "center=269.446280%2C4.768000&size=0.05"
        return payloads[source_url], {}

    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, row_b], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    params = {"target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"], "epoch_b": row_b["obs_publisher_did"]}
    default = client.get("/api/compare", params=params)
    assert default.status_code == 200
    assert not requests
    assert "statistics" not in default.json()

    response = client.get("/api/compare", params={**params, "inspect_cutouts": "true"})
    assert response.status_code == 200
    assert sorted(requests) == sorted(payloads)
    result = response.json()
    assert result["status"] == "INSUFFICIENT_DATA"
    assert "difference_url" not in result
    assert "uncertainty" not in result
    assert result["statistics"]["fits_inspection"] == {
        "observation_a": {
            "status": "available", "width": 3, "height": 2, "finite_image_pixels": 4,
            "flagged_pixels": 3, "positive_variance_pixels": 2, "spectral_wcs_present": True,
        },
        "observation_b": {
            "status": "available", "width": 3, "height": 2, "finite_image_pixels": 4,
            "flagged_pixels": None, "positive_variance_pixels": None, "spectral_wcs_present": False,
        },
    }
    preview = client.get("/api/preview", params={"target": params["target"], "observation_id": params["epoch_a"]})
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert len(requests) == 2

    requests.clear()
    shifted = {**row_b, "em_min": "2.4e-6", "em_max": "3.0e-6"}
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, shifted], api.SIA_PARAMETERS))
    assert client.get("/api/compare", params={**params, "inspect_cutouts": "true"}).status_code == 422
    assert not requests


def test_comparison_keeps_archive_provenance_when_cutout_diagnostics_fail(monkeypatch):
    from urllib.error import URLError

    from astropy.io import fits

    row_b = {**ROW_B, "access_url": ROW_B["access_url"].replace("example.fits", "second.fits")}
    missing_image = BytesIO()
    fits.PrimaryHDU().writeto(missing_image)

    def fake_fetch(url, data=None):
        if url.startswith(row_b["access_url"]):
            raise URLError("synthetic cutout outage")
        return missing_image.getvalue(), {}

    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, row_b], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    response = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"],
        "epoch_b": row_b["obs_publisher_did"], "inspect_cutouts": "true",
    })
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "INSUFFICIENT_DATA"
    assert result["observation_a"]["provenance"]["archive_fields"] == ROW_A
    assert result["observation_b"]["provenance"]["archive_fields"] == row_b
    assert result["statistics"]["fits_inspection"] == {
        "observation_a": {"status": "unavailable"},
        "observation_b": {"status": "unavailable"},
    }


def test_targets_use_their_own_archive_query_and_cutout_center(monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    seen = []
    columns = list(ROW_A)
    csv_payload = (",".join(columns) + "\n" + ",".join(ROW_A.values()) + "\n").encode()

    def fake_fetch(url, data=None):
        if data:
            seen.append(parse_qs(data.decode())["POS"][0])
            return csv_payload, {}
        seen.append(parse_qs(urlsplit(url).query)["center"][0])
        return b"SIMPLE  =" + bytes(2871), {}

    monkeypatch.setattr(api, "_fetch", fake_fetch)
    targets = client.get("/api/targets").json()
    assert {item["id"] for item in targets} == {"barnards-star", "andromeda", "orion-nebula", "pleiades"}
    for target in targets:
        params = {"target": target["id"]}
        observations = client.get("/api/observations", params=params)
        assert observations.status_code == 200
        center = f"{target['ra_deg']:.6f},{target['dec_deg']:.6f}"
        assert seen[-1] == f"CIRCLE {center.replace(',', ' ')} 0.01"
        cutout = client.get("/api/archive/cutout", params={**params, "observation_id": ROW_A["obs_publisher_did"]})
        assert cutout.status_code == 200
        assert cutout.headers["x-cutout-center-icrs"] == center
        assert seen[-1] == center


def test_sia_post_uses_coordinator_verified_dr1_query(monkeypatch):
    seen = {}
    payload = ("obs_id,t_min,t_max,em_min,em_max\n"
               "example,60902,60902.1,1.63e-6,2.43e-6\n").encode()

    def fake_fetch(url, data=None):
        seen["url"], seen["form"] = url, data.decode()
        return payload, {}

    monkeypatch.setattr(api, "_fetch", fake_fetch)
    rows, _ = api._archive_rows(api.TARGETS["barnards-star"])
    from urllib.parse import parse_qs
    assert seen["url"] == "https://irsa.ipac.caltech.edu/SIA"
    assert parse_qs(seen["form"]) == {
        "COLLECTION": ["spherex_dr1"], "POS": ["CIRCLE 269.446280 4.768000 0.01"],
        "RESPONSEFORMAT": ["CSV"], "MAXREC": ["500"],
    }
    assert rows[0]["obs_id"] == "example"


def test_cutout_uses_dr1_product_url_and_preserves_source_headers(monkeypatch):
    seen = {}

    def fake_fetch(url, data=None):
        seen["url"] = url
        return b"SIMPLE  =" + bytes(2871), {}

    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    response = client.get("/api/archive/cutout", params={
        "target": "barnards-star", "observation_id": ROW_A["obs_publisher_did"], "size": "0.05",
    })
    assert response.status_code == 200
    assert response.headers["x-source-url"] == ROW_A["access_url"]
    assert "center=269.446280%2C4.768000" in seen["url"]
    assert "size=0.05" in seen["url"]


def test_cutout_retries_once_after_transient_archive_503(monkeypatch):
    from urllib.error import HTTPError

    requests = []

    def fake_fetch(url, data=None):
        requests.append(url)
        if len(requests) == 1:
            raise HTTPError(url, 503, "temporarily unavailable", {"Retry-After": "0"}, BytesIO())
        return b"SIMPLE  =" + bytes(2871), {}

    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    response = client.get("/api/archive/cutout", params={
        "target": "barnards-star", "observation_id": ROW_A["obs_publisher_did"],
    })
    assert response.status_code == 200
    assert len(requests) == 2
    assert requests[0] == requests[1]


def test_cutout_reuses_successful_download_until_expiry(monkeypatch):
    requests = []
    now = [0.0]
    monkeypatch.setattr(api, "monotonic", lambda: now[0])

    def fake_fetch(url, data=None):
        requests.append(url)
        return b"SIMPLE  =" + bytes(2871), {}

    # A distinct synthetic URL does not share the other route fixtures' source URL.
    row = {**ROW_A, "access_url": ROW_A["access_url"].replace("example.fits", "cached.fits")}
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([row], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    params = {"target": "barnards-star", "observation_id": row["obs_publisher_did"]}
    first = client.get("/api/archive/cutout", params=params)
    second = client.get("/api/archive/cutout", params=params)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert len(requests) == 1

    now[0] += api.CUTOUT_CACHE_TTL_SECONDS
    assert client.get("/api/archive/cutout", params=params).status_code == 200
    assert len(requests) == 2


def test_preview_renders_fits_image_as_display_only_png(monkeypatch):
    import numpy as np
    from astropy.io import fits
    from fastapi import Response

    output = BytesIO()
    image = fits.ImageHDU(data=np.arange(25, dtype=np.float32).reshape(5, 5), name="IMAGE")
    fits.HDUList([fits.PrimaryHDU(), image]).writeto(output)
    monkeypatch.setattr(api, "get_cutout", lambda *args: Response(
        output.getvalue(), media_type="application/fits", headers={"X-Source-URL": "https://irsa.ipac.caltech.edu/product.fits"},
    ))
    response = client.get("/api/preview", params={"target": "barnards-star", "observation_id": ROW_A["obs_id"]})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-scientific-use"] == "visual-preview-only"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert response.headers["x-display-stretch"] == "percentile-1-99.5-asinh"
    linear = client.get("/api/preview", params={
        "target": "barnards-star", "observation_id": ROW_A["obs_id"], "stretch": "linear",
    })
    assert linear.status_code == 200
    assert linear.headers["x-display-stretch"] == "percentile-1-90-linear"
    assert linear.content != response.content



def test_cached_preview_remains_available_when_source_fails(monkeypatch):
    from fastapi import HTTPException, Response

    from services.api.test_alignment import frame

    data = BytesIO()
    frame(0, 4.0).writeto(data)
    source = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/example.fits"
    monkeypatch.setattr(api, "get_cutout", lambda *args: Response(
        data.getvalue(), headers={"X-Source-URL": source},
    ))
    params = {"target": "barnards-star", "observation_id": ROW_A["obs_publisher_did"]}
    first = client.get("/api/preview", params=params)

    def offline(*args):
        raise HTTPException(502, "archive unavailable")

    monkeypatch.setattr(api, "get_cutout", offline)
    second = client.get("/api/preview", params=params)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert second.headers["x-source-url"] == source
    assert client.get("/api/preview", params={**params, "target": "andromeda"}).status_code == 502


def test_aligned_comparison_returns_two_rendered_images_without_change_claim(monkeypatch):
    import base64

    from services.api.test_alignment import frame

    row_b = {**ROW_B, "access_url": ROW_A["access_url"].replace("example", "example_b")}
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, row_b], {}))
    payloads = {}
    for row, shift in ((ROW_A, 0), (row_b, 0.5)):
        data = BytesIO()
        frame(shift, 4.0 + shift).writeto(data)
        payloads[row["access_url"]] = data.getvalue()
    monkeypatch.setattr(api, "_download_cutout", lambda url, *args, **kwargs: payloads[url])

    result = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"],
        "epoch_b": ROW_B["obs_publisher_did"], "align_cutouts": True,
    })
    assert result.status_code == 200
    body = result.json()
    assert body["status"] == "INSUFFICIENT_DATA"
    alignment = body["statistics"]["visual_alignment"]
    assert alignment["common_pixels"] > 25
    for key in ("png_a", "png_b"):
        assert base64.b64decode(alignment[key]).startswith(b"\x89PNG\r\n\x1a\n")


def test_alignment_reuses_the_same_cutout_attempts_as_inspection(monkeypatch):
    from fastapi import HTTPException
    from services.api.test_alignment import frame

    row_b = {**ROW_B, "access_url": ROW_A["access_url"].replace("example", "example_b")}
    monkeypatch.setattr(api, "_archive_rows", lambda _target: ([ROW_A, row_b], {}))
    data = BytesIO()
    frame(0, 4.0).writeto(data)
    requests = []

    def download(url, *args, **kwargs):
        requests.append(url)
        if url == row_b["access_url"]:
            raise HTTPException(502, "archive unavailable")
        return data.getvalue()

    monkeypatch.setattr(api, "_download_cutout", download)
    response = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"],
        "epoch_b": ROW_B["obs_publisher_did"], "align_cutouts": True,
    })
    assert response.status_code == 200
    assert requests == [ROW_A["access_url"], row_b["access_url"]]
    statistics = response.json()["statistics"]
    assert statistics["fits_inspection"]["observation_a"]["status"] == "available"
    assert statistics["visual_alignment"]["status"] == "unavailable"
