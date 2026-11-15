"""Loss-aware mapping from IRSA SIA rows to the shared API contract."""

import math
from datetime import datetime, timedelta, timezone
from io import BytesIO
from urllib.parse import urlsplit

COLLECTION = "spherex_dr1"
VERIFIED_VARIANCE_IDS = {
    "ivo://irsa.ipac/spherex_dr1?2025W33_2C_0321_1/D3",
    "ivo://irsa.ipac/spherex_dr1?2026W19_1A_0403_1/D3",
}


def _value(row, name):
    return next((value for key, value in row.items() if isinstance(key, str) and key.casefold() == name.casefold() and value not in (None, "")), None)


def _finite(value, name):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"SIA row is missing a valid {name}") from None
    if not math.isfinite(number):
        raise ValueError(f"SIA row is missing a valid {name}")
    return number


def _mjd_to_iso(value):
    instant = datetime(1858, 11, 17, tzinfo=timezone.utc) + timedelta(days=_finite(value, "t_min"))
    return instant.isoformat(timespec="microseconds").replace("+00:00", "Z")


def observation_from_row(row, source_url, query_parameters=None):
    """Map required fields while retaining the complete original SIA record."""
    row_id = _value(row, "obs_publisher_did") or _value(row, "obs_id")
    if not row_id:
        raise ValueError("SIA row is missing obs_id/obs_publisher_did")
    t_min = _finite(_value(row, "t_min"), "t_min")
    t_max = _finite(_value(row, "t_max"), "t_max")
    em_min = _finite(_value(row, "em_min"), "em_min")
    em_max = _finite(_value(row, "em_max"), "em_max")
    channel = _value(row, "energy_bandpassname")
    if not channel:
        raise ValueError("SIA row is missing energy_bandpassname")
    if t_max < t_min or em_min <= 0 or em_max < em_min:
        raise ValueError("SIA row has invalid time or wavelength bounds")
    product_url = _value(row, "access_url")
    if product_url:
        parsed = urlsplit(product_url)
        if (parsed.scheme != "https" or parsed.hostname != "irsa.ipac.caltech.edu"
                or parsed.port not in (None, 443) or not parsed.path.startswith("/ibe/data/spherex/")):
            raise ValueError("SIA access_url is outside the IRSA SPHEREx archive")
    flags = [f"{key}={value}" for key, value in row.items()
             if isinstance(key, str) and value not in (None, "")
             and any(token in key.casefold() for token in ("flag", "quality"))]
    item = {
        "id": row_id,
        "observed_at": _mjd_to_iso(t_min),
        "observed_end": _mjd_to_iso(t_max),
        "release": "DR1",
        "channel": channel,
        "wavelength_um": ((em_min + em_max) / 2) * 1e6,
        "wavelength_min_um": em_min * 1e6,
        "wavelength_max_um": em_max * 1e6,
        "provenance": {
            "source": "IRSA SIA2",
            "collection": COLLECTION,
            "query_url": source_url,
            "query_parameters": query_parameters or {},
            "time_bounds_mjd": {"t_min": t_min, "t_max": t_max},
            "time_semantics": "observed_at is the SIA t_min lower bound; original bounds are retained",
            "wavelength_bounds_um": {"em_min": em_min * 1e6, "em_max": em_max * 1e6},
            "wavelength_semantics": "wavelength_um is the midpoint of the SIA wavelength bounds",
            "archive_fields": dict(row),
        },
    }
    if product_url:
        item["product_url"] = product_url
    if flags:
        item["quality_flags"] = flags
    if row_id in VERIFIED_VARIANCE_IDS:
        item["variance_available"] = True
    return item


def comparison(target, observation_a, observation_b):
    return {
        "target": target,
        "observation_a": observation_a,
        "observation_b": observation_b,
        "status": "INSUFFICIENT_DATA",
        "limitations": [
            "The visual comparison provides no variability result. A measurement requires source photometry and its uncertainty.",
            "Proper motion and coordinate epoch must be checked before registration.",
            "Calibration consistency, spectral WCS, flags, masks, variance, background, and image registration require review.",
        ],
    }


def compatible_epochs(observation_a, observation_b):
    """Require an identical release and archived wavelength interval before pairing."""
    return (
        observation_a["release"] == observation_b["release"]
        and observation_a["provenance"]["collection"] == observation_b["provenance"]["collection"]
        and observation_a.get("channel") == observation_b.get("channel")
        and observation_a["provenance"]["wavelength_bounds_um"] == observation_b["provenance"]["wavelength_bounds_um"]
    )


def _real_image_plane(hdus, name):
    try:
        plane = hdus[name].data
    except (KeyError, OSError, ValueError, TypeError, OverflowError):
        return None
    if plane is None or plane.ndim != 2 or not plane.size or plane.dtype.kind not in "iuf":
        return None
    return plane


def inspect_fits_cutout(payload):
    """Summarize the cutout planes independently before science processing."""
    import numpy as np
    from astropy.io import fits

    try:
        with fits.open(BytesIO(payload), memmap=False) as hdus:
            image = _real_image_plane(hdus, "IMAGE")
            if image is None:
                return {"status": "unavailable"}

            flags = _real_image_plane(hdus, "FLAGS")
            variance = _real_image_plane(hdus, "VARIANCE")
            return {
                "status": "available",
                "width": image.shape[1],
                "height": image.shape[0],
                "finite_image_pixels": int(np.count_nonzero(np.isfinite(image))),
                "flagged_pixels": (
                    int(np.count_nonzero(np.isfinite(flags) & (flags != 0)))
                    if flags is not None and flags.shape == image.shape else None
                ),
                "positive_variance_pixels": (
                    int(np.count_nonzero(np.isfinite(variance) & (variance > 0)))
                    if variance is not None and variance.shape == image.shape else None
                ),
                "spectral_wcs_present": "WCS-WAVE" in hdus,
            }
    except (OSError, ValueError, TypeError, OverflowError):
        return {"status": "unavailable"}
