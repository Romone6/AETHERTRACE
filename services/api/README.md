# Science API

Python 3.10+: `python -m venv .venv && . .venv/bin/activate && pip install -r services/api/requirements.txt && uvicorn services.api.app:app --reload`. Run route tests after `pip install -r services/api/requirements-dev.txt` with `pytest services/api`.

- `GET /api/health`
- `GET /api/targets` returns the Barnard's Star query center and its source caveat.
- `GET /api/observations?target=barnards-star` POSTs the coordinator-verified SIA form query for `spherex_dr1` and returns rows conforming to the shared `Observation` schema. Original SIA fields, IDs, product URLs, time bounds, wavelength bounds, and available quality fields remain in `provenance`.
- `GET /api/compare?target=barnards-star&epoch_a=<product-id>&epoch_b=<product-id>` rejects identical, channel-incompatible, or wavelength-incompatible products and returns `INSUFFICIENT_DATA` for compatible IDs until image measurement is implemented. It never returns a fabricated difference, statistic, or uncertainty.
- `GET /api/candidates?target=barnards-star` currently returns an empty array; candidate generation awaits measured, calibrated, registered data.
- `GET /api/archive/cutout?target=barnards-star&observation_id=<observation-id>&size=0.05` looks up the source URL from DR1 SIA and returns its IRSA cutout as FITS. The source URL and cutout center/size are response headers.
- `GET /api/preview?target=barnards-star&observation_id=<observation-id>&size=0.05` renders the IMAGE HDU for display only (`X-Scientific-Use: visual-preview-only`).

The cutout endpoint uses an `access_url` from the exact DR1 SIA result and accepts only HTTPS IRSA SPHEREx archive products. Product IDs use `obs_publisher_did`, which is unique across detector channels; the archive `obs_id` alone is not. Variance is marked available only for the two D3 products parsed in the coordinator evidence. Proper motion, coordinate epoch, calibration, spectral WCS, flags, background, registration, and uncertainty remain part of the scientific review; archive access alone is not evidence of variability.

The preview uses Astropy, NumPy, and Pillow to stretch and resize pixels for display; it does not compute photometry or comparisons.
