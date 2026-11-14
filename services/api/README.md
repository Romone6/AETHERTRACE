# Science API

Python 3.10+: `python -m venv .venv && . .venv/bin/activate && pip install -r services/api/requirements.txt && uvicorn services.api.app:app --reload`. Run route tests after `pip install -r services/api/requirements-dev.txt` with `pytest services/api`.

If `/api/observations` returns `IRSA SIA request failed` and Python reports `CERTIFICATE_VERIFY_FAILED` when opening `https://irsa.ipac.caltech.edu/SIA`, start the API with a current CA bundle from the activated environment.

```sh
python -m pip install certifi
SSL_CERT_FILE="$(python -m certifi)" uvicorn services.api.app:app --reload
```

- `GET /api/health`
- `GET /api/targets` lists the fixed ICRS field centers for Barnard's Star, Andromeda (M31), the Orion Nebula (M42), and the Pleiades (M45).
- `GET /api/observations?target=barnards-star` queries `spherex_dr1` with a 0.01-degree cone around the selected field center. Original SIA fields, IDs, product URLs, time bounds, wavelength bounds, and available quality fields remain in `provenance`. The same field selection determines the center used by the cutout and preview routes.
- `GET /api/compare?target=barnards-star&epoch_a=<product-id>&epoch_b=<product-id>` rejects identical, release-incompatible, channel-incompatible, or wavelength-incompatible products. Compatible IDs return `INSUFFICIENT_DATA` until image measurement and uncertainty propagation are implemented. Add `inspect_cutouts=true` to receive the FITS diagnostics below.
- `GET /api/candidates?target=barnards-star` currently returns an empty array; candidate generation awaits measured, calibrated, registered data.
- `GET /api/archive/cutout?target=barnards-star&observation_id=<observation-id>&size=0.05` looks up the source URL from DR1 SIA and returns its IRSA cutout as FITS. The source URL and cutout center/size are response headers.
- `GET /api/preview?target=barnards-star&observation_id=<observation-id>&size=0.05` renders the IMAGE HDU for display only (`X-Scientific-Use: visual-preview-only`).

The cutout endpoint uses an `access_url` from the exact DR1 SIA result and accepts only HTTPS IRSA SPHEREx archive products. Product IDs use `obs_publisher_did`, which is unique across detector channels; the archive `obs_id` alone is not. Variance is marked available only for the two D3 products parsed in the coordinator evidence. Proper motion, coordinate epoch, calibration, spectral WCS, flags, background, registration, and uncertainty remain part of the scientific review; archive access alone is not evidence of variability.

The preview uses Astropy, NumPy, and Pillow to stretch and resize pixels for display; it does not compute photometry or comparisons.

## FITS inspection

With `inspect_cutouts=true`, the API fetches a 0.05° fixed-coordinate FITS cutout for each compatible observation, using the same source product as the cutout and preview routes. The response includes `statistics.fits_inspection.observation_a` and `observation_b`. Each result has `status: "available"` when a real-valued, nonempty 2D IMAGE plane can be read, or `status: "unavailable"` when the archive fetch or IMAGE read fails. One unavailable frame does not discard the other frame's diagnostics or either frame's source metadata.

Each cutout request retries an upstream HTTP 503 once after the server's numeric `Retry-After` of up to five seconds, or after one second if the header is absent.

Comparison, preview and download requests can reuse default-sized FITS cutouts for two minutes. The process keeps up to four entries at up to 20 MiB each and fetches custom-sized cutouts directly from IRSA.

The available result includes these coverage checks.

- `width` and `height` count IMAGE columns and rows.
- `finite_image_pixels` counts IMAGE samples that are neither infinite nor NaN.
- `flagged_pixels` counts finite nonzero FLAGS values. A nonzero value can encode processing information or detector status and does not by itself determine rejection.
- `positive_variance_pixels` counts finite VARIANCE values strictly greater than zero. This count excludes zero, negative and nonfinite values.
- `spectral_wcs_present` reports the presence of a WCS-WAVE extension. It does not validate its contents.

The FLAGS and VARIANCE counts are independent of each other and of IMAGE finiteness. A missing, unreadable, nonnumeric or differently shaped plane yields a null count. These checks do not determine the usable joint mask, calibrate a measurement, or perform registration. See [IRSA's SPHEREx data product documentation](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-products/).
