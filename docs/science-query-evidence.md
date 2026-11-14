# IRSA science query evidence

## Coordinator-verified DR1 query

The coordinator verified this anonymous public SIA query against IRSA:

```text
POST https://irsa.ipac.caltech.edu/SIA
Content-Type: application/x-www-form-urlencoded
COLLECTION=spherex_dr1
POS=CIRCLE 269.446280 4.768000 0.01
RESPONSEFORMAT=CSV
MAXREC=500
```

URL-encoded form body: `COLLECTION=spherex_dr1&POS=CIRCLE+269.446280+4.768000+0.01&RESPONSEFORMAT=CSV&MAXREC=500`

Result: HTTP 200; 240 Level-2 science rows; 122 unique `t_min` epochs across 26 UTC days; MJD `60902.864715`–`61165.082972`. The response contained 42 D3 rows spanning `1.63010e-6`–`2.43460e-6` m across six detector channels.

## Coordinator-verified cutouts

Two DR1 D3 products were cut out with `center=269.446280,4.768000&size=0.05`:

| Source observation ID | `t_min` (MJD) | HTTP | Bytes | FITS result |
|---|---:|---:|---:|---|
| `2025W33_2C_0321_1` | 60902.864715 | 200 | 4,049,280 | 7 HDUs: PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE |
| `2026W19_1A_0403_1` | 61165.082972 | 200 | 4,049,280 | 7 HDUs: PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE |

Astropy parsed both MEFs. Each IMAGE and VARIANCE extension was 29×29 with 837 finite pixels. The evidence packet supplied the observation IDs and cutout query, but not the literal SIA `access_url` values; the API therefore looks up each source ID in the live DR1 response and retains its returned product URL verbatim.

This verifies public archive discovery and successful cutout retrieval only. It does **not** establish variability. Proper motion and coordinate epoch, release/calibration consistency, spectral WCS, flags and masks, background, pixel registration, and uncertainty propagation must be reviewed before measurement. No flux comparison has been run.

## API semantics and limits

`services/api/app.py` uses the exact DR1 collection and search parameters above. It uses `obs_publisher_did` as the product ID because `obs_id` repeats across detector channels; the complete source CSV row remains in `provenance.archive_fields`. `channel` is copied from `energy_bandpassname`. `observed_at`/`observed_end` map SIA `t_min`/`t_max`; wavelength bounds are retained and `wavelength_um` is a representative midpoint only. Variance availability is true only for the two verified D3 product IDs. API behavior is aligned to the shared OpenAPI `Observation` schema.

The live API was then exercised through FastAPI: all 240 rows returned with 240 unique product IDs, 42 D3 channel products were present, a two-epoch D3 comparison returned `INSUFFICIENT_DATA`, and the two verified D3 epochs rendered 232×232 PNG previews. The previews use a display stretch and are not measurements.

The TAP route was not needed for this SIA/cutout path and has not been verified by this evidence. No target metadata or measurements are synthesized from the two cutouts.
