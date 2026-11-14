# Science validation protocol

The current API deliberately reports `INSUFFICIENT_DATA` until image
measurement and uncertainty propagation are implemented. An opt-in FITS inspection
reports native dimensions, finite image values, nonzero flag values, positive
variance values, and the presence of the spectral WCS extension for each frame.
These independent counts help people inspect the source products before applying
scientific masks, wavelength calibration, or registration. The gates below define
the acceptance cases for a future comparison pipeline. Contract-level tests in
`tests/test_contract_validation.py` check the OpenAPI schema.

## Required comparison gates

| Concern | Reject or mark inconclusive when | Evidence to retain |
| --- | --- | --- |
| Time | Either epoch is missing/invalid, both selections resolve to the same observation, or exposure timing cannot be established | Original observation IDs and timestamps, including timezone and exposure interval where available |
| Wavelength | Channel/band mapping is missing or products do not cover the same compatible spectral interval | Release, product IDs, spectral WCS, channel/band mapping and units |
| Release/calibration | Releases or processing/calibration are incompatible and no validated cross-release normalization exists | Release names, calibration/processing versions and normalization provenance |
| Masks | No common usable samples remain, or invalid, flagged, saturated, non-finite or zero/negative-variance samples enter statistics | Both source masks/quality flags, combined mask, exclusion counts and reasons |
| Registration | Alignment is absent, fails, or leaves residual misalignment large enough to explain candidate structure | Transform, method/software/version, fit diagnostics and resampling footprint |
| Uncertainty | Either variance is absent/invalid or propagated uncertainty omits resampling weights, background terms or known covariance | Input variance provenance, propagation method/assumptions and output uncertainty |
| False positives | Candidate strength is not assessed against correlated noise, background/registration residuals, detector artifacts, mask edges and the number of searched locations/channels | Null/control diagnostics, thresholds, searched area/channels and limitations |

For a linear resampling operation with weights `w_i`, independent input pixels
give `Var(sum(w_i x_i)) = sum(w_i^2 Var(x_i))`. This formula is insufficient
when input covariance is material; covariance terms or a conservative validated
approximation must then be included. A raw difference image alone cannot
establish astrophysical change.

## Minimal adversarial cases for the implementation

1. Synthetic observations with distinct timestamps but incompatible wavelength
   intervals must not be compared as a candidate.
2. Otherwise-compatible observations with no overlapping usable pixels must
   return `INSUFFICIENT_DATA` or `INCONCLUSIVE`, never a change candidate.
3. A known subpixel translation with a masked bad pixel must preserve the mask
   and propagate variance through the actual resampling weights.
4. Identical synthetic scenes with noise, background offset, registration
   error, and masked edges must not produce an unqualified detection; a planted
   signal is only a pipeline-recovery check, not an astrophysical finding.

The current contract requires unique product ID, observation start and end,
release, detector channel, spectral wavelength bounds, and provenance. The
representative `wavelength_um` is optional and nullable; quality flags and
variance availability are optional. The API gates comparisons on equal channel
and wavelength bounds. The contract does not yet define mask representation,
registration diagnostics, variance arrays, or false-positive thresholds. Those
must be made explicit in implementation behavior and evidence before science
validation can pass; this stream does not change the shared contract.
