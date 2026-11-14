"""FastAPI endpoints for IRSA SPHEREx DR1 metadata and cutouts."""

import csv
import io
import math
import urllib.error
import urllib.parse
import urllib.request
from enum import Enum
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Response
from pydantic import BaseModel

from services.api.science import COLLECTION, comparison, compatible_epochs, observation_from_row

IRSA_SIA = "https://irsa.ipac.caltech.edu/SIA"
TARGET = {
    "id": "barnards-star",
    "name": "Barnard's Star",
    "ra_deg": 269.446280,
    "dec_deg": 4.768000,
    "source": "Coordinator-verified IRSA SIA query center; catalog epoch and proper-motion propagation are not established.",
}
SIA_PARAMETERS = {
    "COLLECTION": COLLECTION,
    "POS": "CIRCLE 269.446280 4.768000 0.01",
    "RESPONSEFORMAT": "CSV",
    "MAXREC": "500",
}
MAX_CUTOUT_BYTES = 20 * 1024 * 1024


class TargetModel(BaseModel):
    id: str
    name: str
    ra_deg: float
    dec_deg: float
    source: str


class ObservationModel(BaseModel):
    id: str
    observed_at: str
    observed_end: str
    release: str
    channel: str
    wavelength_um: float
    wavelength_min_um: float
    wavelength_max_um: float
    product_url: str | None = None
    provenance: dict[str, Any]
    quality_flags: list[str] | None = None
    variance_available: bool | None = None


class ComparisonStatus(str, Enum):
    NO_SIGNIFICANT_CHANGE = "NO_SIGNIFICANT_CHANGE"
    CANDIDATE_CHANGE = "CANDIDATE_CHANGE"
    INCONCLUSIVE = "INCONCLUSIVE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    PROCESSING_ERROR = "PROCESSING_ERROR"


class ComparisonModel(BaseModel):
    target: str
    observation_a: ObservationModel
    observation_b: ObservationModel
    status: ComparisonStatus
    difference_url: str | None = None
    statistics: dict[str, Any] | None = None
    uncertainty: dict[str, Any] | None = None
    limitations: list[str]


CandidateModel = ComparisonModel


app = FastAPI(title="AETHERTRACE API", version="0.1.0")


class SameIRSAHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname != "irsa.ipac.caltech.edu" or parsed.port not in (None, 443):
            raise urllib.error.URLError("IRSA redirected outside its HTTPS host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch(url: str, data: bytes | None = None) -> tuple[bytes, Any]:
    headers = {"User-Agent": "AETHERTRACE/0.1"}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.build_opener(SameIRSAHostRedirect).open(request, timeout=30) as response:
        return response.read(), response.headers


def _archive_rows() -> tuple[list[dict[str, str]], dict[str, str]]:
    encoded = urllib.parse.urlencode(SIA_PARAMETERS).encode()
    try:
        payload, _ = _fetch(IRSA_SIA, encoded)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise HTTPException(502, "IRSA SIA request failed") from error
    try:
        reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")))
        if not reader.fieldnames or not any(name.casefold() == "obs_id" for name in reader.fieldnames):
            raise ValueError("SIA CSV is missing its observation identifier column")
        rows = []
        for row in reader:
            extra = row.pop(None, None)
            if extra:
                row["_extra_values"] = extra
            rows.append(row)
        return rows, {name: value for name, value in SIA_PARAMETERS.items()}
    except (UnicodeDecodeError, csv.Error, ValueError) as error:
        raise HTTPException(502, "IRSA returned invalid SIA CSV") from error


def _target(target_id: str) -> dict[str, Any]:
    if target_id != TARGET["id"]:
        raise HTTPException(404, "unknown target")
    return TARGET


def _observations() -> list[dict[str, Any]]:
    rows, parameters = _archive_rows()
    try:
        return [observation_from_row(row, IRSA_SIA, parameters) for row in rows]
    except ValueError as error:
        raise HTTPException(502, "IRSA metadata cannot be represented by the shared observation contract") from error


def _number(value: float, label: str, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HTTPException(422, f"{label} must be numeric") from None
    if not math.isfinite(number) or number <= 0 or number > maximum:
        raise HTTPException(422, f"{label} must be greater than 0 and at most {maximum}")
    return number


@app.get("/api/health", response_model=dict[str, str])
def health():
    return {"status": "ok"}


@app.get("/api/targets", response_model=list[TargetModel])
def list_targets():
    return [TARGET]


@app.get("/api/observations", response_model=list[ObservationModel], response_model_exclude_none=True)
def list_observations(target: str = Query(...)):
    _target(target)
    return _observations()


@app.get("/api/compare", response_model=ComparisonModel, response_model_exclude_none=True)
def compare_observations(target: str = Query(...), epoch_a: str = Query(...), epoch_b: str = Query(...)):
    _target(target)
    if epoch_a == epoch_b:
        raise HTTPException(422, "epoch_a and epoch_b must identify different observations")
    observations = _observations()
    by_id = {item["id"]: item for item in observations}
    try:
        observation_a, observation_b = by_id[epoch_a], by_id[epoch_b]
    except KeyError as error:
        raise HTTPException(422, "epoch_a and epoch_b must match returned observation IDs") from error
    if not compatible_epochs(observation_a, observation_b):
        raise HTTPException(422, "observations have incompatible releases or wavelength intervals")
    return comparison(target, observation_a, observation_b)


@app.get("/api/candidates", response_model=list[CandidateModel])
def list_candidates(target: str = Query(...)):
    _target(target)
    # Candidate generation waits for calibrated, registered measurements.
    return []


@app.get("/api/archive/cutout")
def get_cutout(
    target: str = Query(...),
    observation_id: str = Query(...),
    size: float = Query(0.05, gt=0, le=0.1),
):
    target_info = _target(target)
    size = _number(size, "size", 0.1)
    rows, _ = _archive_rows()
    row = next((item for item in rows if (
        item.get("obs_publisher_did") == observation_id
        or (not item.get("obs_publisher_did") and item.get("obs_id") == observation_id)
    )), None)
    if row is None:
        raise HTTPException(404, "observation not found in the DR1 SIA result")
    source_url = row.get("access_url", "")
    parsed = urlsplit(source_url)
    if (parsed.scheme != "https" or parsed.hostname != "irsa.ipac.caltech.edu"
            or parsed.port not in (None, 443) or not parsed.path.startswith("/ibe/data/spherex/")):
        raise HTTPException(502, "IRSA returned an invalid SPHEREx product URL")
    cutout_url = source_url + ("&" if parsed.query else "?") + urllib.parse.urlencode({
        "center": f"{target_info['ra_deg']:.6f},{target_info['dec_deg']:.6f}", "size": f"{size:g}",
    })
    try:
        payload, _ = _fetch(cutout_url)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise HTTPException(502, "IRSA cutout request failed") from error
    if len(payload) > MAX_CUTOUT_BYTES:
        raise HTTPException(502, "IRSA cutout exceeded the 20 MiB limit")
    if not payload.startswith(b"SIMPLE  ="):
        raise HTTPException(502, "IRSA response is not an uncompressed FITS file")
    return Response(payload, media_type="application/fits", headers={
        "Content-Disposition": 'attachment; filename="spherex-cutout.fits"',
        "X-Source-URL": source_url,
        "X-Cutout-Center-ICRS": f"{target_info['ra_deg']:.6f},{target_info['dec_deg']:.6f}",
        "X-Cutout-Size-Deg": f"{size:g}",
    })


@app.get("/api/preview")
def get_preview(
    target: str = Query(...),
    observation_id: str = Query(...),
    size: float = Query(0.05, gt=0, le=0.1),
):
    """Render a display-only PNG preview from an archive FITS IMAGE extension."""
    import numpy as np
    from astropy.io import fits
    from PIL import Image

    fits_response = get_cutout(target, observation_id, size)
    try:
        with fits.open(io.BytesIO(fits_response.body), memmap=False) as hdus:
            image_hdu = next((hdu for hdu in hdus if hdu.name.upper() == "IMAGE" and hdu.data is not None), None)
            if image_hdu is None:
                raise ValueError("FITS product has no IMAGE extension")
            pixels = np.asarray(image_hdu.data, dtype=np.float32)
            finite = np.isfinite(pixels)
            if pixels.ndim != 2 or not finite.any():
                raise ValueError("FITS IMAGE extension has no finite 2D pixels")
            low, high = np.nanpercentile(pixels[finite], [1, 99.5])
            if not np.isfinite(low) or not np.isfinite(high) or high <= low:
                high = low + 1
            scaled = np.clip((pixels - low) / (high - low), 0, 1)
            stretched = np.arcsinh(10 * scaled) / np.arcsinh(10)
            grayscale = np.where(finite, stretched * 255, 0).astype(np.uint8)
            preview = Image.fromarray(grayscale).resize(
                (grayscale.shape[1] * 8, grayscale.shape[0] * 8),
                resample=Image.Resampling.NEAREST,
            )
            output = io.BytesIO()
            preview.save(output, format="PNG", optimize=True)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "IRSA FITS image could not be rendered") from error
    return Response(output.getvalue(), media_type="image/png", headers={
        "Cache-Control": "public, max-age=86400",
        "X-Source-URL": fits_response.headers["X-Source-URL"],
        "X-Display-Stretch": "percentile-1-99.5-asinh",
        "X-Scientific-Use": "visual-preview-only",
    })


@app.get("/api/preview")
def get_preview(target: str = Query(...), observation_id: str = Query(...), size: float = Query(0.05, gt=0, le=0.1)):
    """Return a labeled display preview; this is not photometry or a change measurement."""
    import numpy as np
    from astropy.io import fits
    from PIL import Image

    fits_response = get_cutout(target, observation_id, size)
    try:
        with fits.open(io.BytesIO(fits_response.body), memmap=False) as hdus:
            image_hdu = next((hdu for hdu in hdus if hdu.name.upper() == "IMAGE" and hdu.data is not None), None)
            if image_hdu is None:
                raise ValueError("FITS product has no IMAGE extension")
            pixels = np.asarray(image_hdu.data, dtype=np.float32)
            finite = np.isfinite(pixels)
            if pixels.ndim != 2 or not finite.any():
                raise ValueError("FITS IMAGE extension has no finite 2D pixels")
            low, high = np.nanpercentile(pixels[finite], [1, 99.5])
            if not np.isfinite(low) or not np.isfinite(high) or high <= low:
                high = low + 1
            scaled = np.clip((pixels - low) / (high - low), 0, 1)
            stretched = np.arcsinh(10 * scaled) / np.arcsinh(10)
            grayscale = np.where(finite, stretched * 255, 0).astype(np.uint8)
            preview = Image.fromarray(grayscale, mode="L").resize(
                (max(1, grayscale.shape[1] * 8), max(1, grayscale.shape[0] * 8)),
                resample=Image.Resampling.NEAREST,
            )
            output = io.BytesIO()
            preview.save(output, format="PNG", optimize=True)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "IRSA FITS image could not be rendered") from error
    return Response(output.getvalue(), media_type="image/png", headers={
        "Cache-Control": "public, max-age=86400",
        "X-Source-URL": fits_response.headers["X-Source-URL"],
        "X-Display-Stretch": "percentile-1-99.5-asinh",
        "X-Scientific-Use": "visual-preview-only",
    })
