"""FastAPI endpoints for IRSA SPHEREx DR1 metadata and cutouts."""

import csv
import io
import base64
import math
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from enum import Enum
from threading import Lock
from time import monotonic, sleep
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Response
from pydantic import BaseModel

from services.api.science import COLLECTION, comparison, compatible_epochs, inspect_fits_cutout, observation_from_row

IRSA_SIA = "https://irsa.ipac.caltech.edu/SIA"
TARGETS = {
    target_id: {
        "id": target_id,
        "name": name,
        "ra_deg": ra,
        "dec_deg": dec,
        "source": "Fixed ICRS field center used for the IRSA SPHEREx archive query.",
    }
    for target_id, name, ra, dec in (
        ("barnards-star", "Barnard's Star", 269.446280, 4.768000),
        ("andromeda", "Andromeda Galaxy (M31)", 10.684708, 41.268750),
        ("orion-nebula", "Orion Nebula (M42)", 83.822083, -5.391111),
        ("pleiades", "Pleiades (M45)", 56.750000, 24.116700),
    )
}
SIA_PARAMETERS = {
    "COLLECTION": COLLECTION,
    "RESPONSEFORMAT": "CSV",
    "MAXREC": "500",
}
MAX_CUTOUT_BYTES = 20 * 1024 * 1024
DEFAULT_CUTOUT_SIZE = 0.05
CUTOUT_CACHE_ENTRIES = 4
CUTOUT_CACHE_TTL_SECONDS = 120
_cutout_cache: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
_cutout_cache_lock = Lock()
_preview_cache: OrderedDict[tuple[str, str, float], tuple[float, bytes, str]] = OrderedDict()


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


def _archive_rows(target: dict[str, Any]) -> tuple[list[dict[str, str]], dict[str, str]]:
    parameters = {
        **SIA_PARAMETERS,
        "POS": f"CIRCLE {target['ra_deg']:.6f} {target['dec_deg']:.6f} 0.01",
    }
    encoded = urllib.parse.urlencode(parameters).encode()
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
        return rows, parameters
    except (UnicodeDecodeError, csv.Error, ValueError) as error:
        raise HTTPException(502, "IRSA returned invalid SIA CSV") from error


def _target(target_id: str) -> dict[str, Any]:
    target = TARGETS.get(target_id)
    if target is None:
        raise HTTPException(404, "unknown target")
    return target


def _observations(target: dict[str, Any]) -> list[dict[str, Any]]:
    rows, parameters = _archive_rows(target)
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
    return list(TARGETS.values())


@app.get("/api/observations", response_model=list[ObservationModel], response_model_exclude_none=True)
def list_observations(target: str = Query(...)):
    return _observations(_target(target))


@app.get("/api/compare", response_model=ComparisonModel, response_model_exclude_none=True)
def compare_observations(
    target: str = Query(...),
    epoch_a: str = Query(...),
    epoch_b: str = Query(...),
    inspect_cutouts: bool = False,
    align_cutouts: bool = False,
):
    target_info = _target(target)
    if epoch_a == epoch_b:
        raise HTTPException(422, "epoch_a and epoch_b must identify different observations")
    observations = _observations(target_info)
    by_id = {item["id"]: item for item in observations}
    try:
        observation_a, observation_b = by_id[epoch_a], by_id[epoch_b]
    except KeyError as error:
        raise HTTPException(422, "epoch_a and epoch_b must match returned observation IDs") from error
    if not compatible_epochs(observation_a, observation_b):
        raise HTTPException(422, "observations have incompatible releases or wavelength intervals")
    result = comparison(target, observation_a, observation_b)
    if inspect_cutouts or align_cutouts:
        result["statistics"] = {
            "fits_inspection": {
                "observation_a": _cutout_inspection(observation_a, target_info),
                "observation_b": _cutout_inspection(observation_b, target_info),
            },
        }
    if align_cutouts:
        result["statistics"]["visual_alignment"] = _aligned_preview(observation_a, observation_b, target_info)
    return result


def _aligned_preview(observation_a, observation_b, target):
    from astropy.io import fits
    from services.api.alignment import align_pair, display_pair

    try:
        products = [_download_cutout(item.get("product_url", ""), target, DEFAULT_CUTOUT_SIZE)
                    for item in (observation_a, observation_b)]
        with fits.open(io.BytesIO(products[0])) as image_a, fits.open(io.BytesIO(products[1])) as image_b:
            pair = align_pair(image_a, image_b)
            png_a, png_b = display_pair(pair)
        return {
            "status": "available",
            "common_pixels": int(pair.common.sum()),
            "png_a": base64.b64encode(png_a).decode("ascii"),
            "png_b": base64.b64encode(png_b).decode("ascii"),
        }
    except (HTTPException, OSError, ValueError, TypeError, KeyError):
        return {"status": "unavailable"}


@app.get("/api/candidates", response_model=list[CandidateModel])
def list_candidates(target: str = Query(...)):
    _target(target)
    # Candidate generation waits for calibrated, registered measurements.
    return []


@app.get("/api/archive/cutout")
def get_cutout(
    target: str = Query(...),
    observation_id: str = Query(...),
    size: float = Query(DEFAULT_CUTOUT_SIZE, gt=0, le=0.1),
):
    target_info = _target(target)
    size = _number(size, "size", 0.1)
    rows, _ = _archive_rows(target_info)
    row = next((item for item in rows if (
        item.get("obs_publisher_did") == observation_id
        or (not item.get("obs_publisher_did") and item.get("obs_id") == observation_id)
    )), None)
    if row is None:
        raise HTTPException(404, "observation not found in the DR1 SIA result")
    source_url = row.get("access_url") or ""
    payload = _download_cutout(source_url, target_info, size)
    return Response(payload, media_type="application/fits", headers={
        "Content-Disposition": 'attachment; filename="spherex-cutout.fits"',
        "X-Source-URL": source_url,
        "X-Cutout-Center-ICRS": f"{target_info['ra_deg']:.6f},{target_info['dec_deg']:.6f}",
        "X-Cutout-Size-Deg": f"{size:g}",
    })


def _download_cutout(source_url: str, target_info: dict[str, Any], size: float) -> bytes:
    parsed = urlsplit(source_url)
    if (parsed.scheme != "https" or parsed.hostname != "irsa.ipac.caltech.edu"
            or parsed.port not in (None, 443) or not parsed.path.startswith("/ibe/data/spherex/")):
        raise HTTPException(502, "IRSA returned an invalid SPHEREx product URL")
    cutout_url = source_url + ("&" if parsed.query else "?") + urllib.parse.urlencode({
        "center": f"{target_info['ra_deg']:.6f},{target_info['dec_deg']:.6f}", "size": f"{size:g}",
    })
    if size == DEFAULT_CUTOUT_SIZE:
        with _cutout_cache_lock:
            entry = _cutout_cache.pop(cutout_url, None)
            if entry is not None and entry[0] > monotonic():
                _cutout_cache[cutout_url] = entry
                return entry[1]
    try:
        try:
            payload, _ = _fetch(cutout_url)
        except urllib.error.HTTPError as error:
            if error.code != 503:
                raise
            retry_after = (error.headers or {}).get("Retry-After", "1")
            # Do not make the caller wait for a long outage or ignore a longer server hint.
            if not retry_after.isascii() or not retry_after.isdecimal() or len(retry_after) > 2 or int(retry_after) > 5:
                raise
            error.close()
            sleep(int(retry_after))
            payload, _ = _fetch(cutout_url)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise HTTPException(502, "IRSA cutout request failed") from error
    if len(payload) > MAX_CUTOUT_BYTES:
        raise HTTPException(502, "IRSA cutout exceeded the 20 MiB limit")
    if not payload.startswith(b"SIMPLE  ="):
        raise HTTPException(502, "IRSA response is not an uncompressed FITS file")
    if size == DEFAULT_CUTOUT_SIZE:
        with _cutout_cache_lock:
            _cutout_cache[cutout_url] = (monotonic() + CUTOUT_CACHE_TTL_SECONDS, payload)
            _cutout_cache.move_to_end(cutout_url)
            if len(_cutout_cache) > CUTOUT_CACHE_ENTRIES:
                _cutout_cache.popitem(last=False)
    return payload


def _cutout_inspection(observation: dict[str, Any], target_info: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = _download_cutout(observation.get("product_url", ""), target_info, size=DEFAULT_CUTOUT_SIZE)
    except HTTPException:
        return {"status": "unavailable"}
    return inspect_fits_cutout(payload)


@app.get("/api/preview")
def get_preview(target: str = Query(...), observation_id: str = Query(...), size: float = Query(DEFAULT_CUTOUT_SIZE, gt=0, le=0.1)):
    """Return a labeled display preview; this is not photometry or a change measurement."""
    import numpy as np
    from astropy.io import fits
    from PIL import Image

    _target(target)
    size = _number(size, "size", 0.1)
    key = target, observation_id, size
    with _cutout_cache_lock:
        cached = _preview_cache.pop(key, None)
        if cached is not None and cached[0] > monotonic():
            _preview_cache[key] = cached
            return _preview_response(cached[1], cached[2])
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
                (max(1, grayscale.shape[1] * 8), max(1, grayscale.shape[0] * 8)),
                resample=Image.Resampling.NEAREST,
            )
            output = io.BytesIO()
            preview.save(output, format="PNG", optimize=True)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "IRSA FITS image could not be rendered") from error
    png, source = output.getvalue(), fits_response.headers["X-Source-URL"]
    if len(png) <= 512 * 1024:
        with _cutout_cache_lock:
            _preview_cache[key] = (monotonic() + 3600, png, source)
            _preview_cache.move_to_end(key)
            if len(_preview_cache) > 64:
                _preview_cache.popitem(last=False)
    return _preview_response(png, source)


def _preview_response(png: bytes, source: str):
    return Response(png, media_type="image/png", headers={
        "Cache-Control": "public, max-age=86400",
        "X-Source-URL": source,
        "X-Display-Stretch": "percentile-1-99.5-asinh",
        "X-Scientific-Use": "visual-preview-only",
    })
