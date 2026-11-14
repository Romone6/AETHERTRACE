import unittest
from io import BytesIO

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


def test_shared_contract_routes(monkeypatch):
    monkeypatch.setattr(api, "_archive_rows", lambda: ([ROW_A, ROW_B], api.SIA_PARAMETERS))
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
    monkeypatch.setattr(api, "_archive_rows", lambda: ([ROW_A, shifted], api.SIA_PARAMETERS))
    incompatible = client.get("/api/compare", params={
        "target": "barnards-star", "epoch_a": ROW_A["obs_publisher_did"], "epoch_b": shifted["obs_publisher_did"],
    })
    assert incompatible.status_code == 422


def test_sia_post_uses_coordinator_verified_dr1_query(monkeypatch):
    seen = {}
    payload = ("obs_id,t_min,t_max,em_min,em_max\n"
               "example,60902,60902.1,1.63e-6,2.43e-6\n").encode()

    def fake_fetch(url, data=None):
        seen["url"], seen["form"] = url, data.decode()
        return payload, {}

    monkeypatch.setattr(api, "_fetch", fake_fetch)
    rows, _ = api._archive_rows()
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

    monkeypatch.setattr(api, "_archive_rows", lambda: ([ROW_A], api.SIA_PARAMETERS))
    monkeypatch.setattr(api, "_fetch", fake_fetch)
    response = client.get("/api/archive/cutout", params={
        "target": "barnards-star", "observation_id": ROW_A["obs_publisher_did"], "size": "0.05",
    })
    assert response.status_code == 200
    assert response.headers["x-source-url"] == ROW_A["access_url"]
    assert "center=269.446280%2C4.768000" in seen["url"]
    assert "size=0.05" in seen["url"]


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
