# Scientific feasibility

## Gate: archive path and multi-epoch coverage verified; image analysis pending

On 2026-11-14, the public IRSA SIA v2 endpoint returned HTTP 200 for this Barnard's Star cone query (no credentials):

```bash
curl -sS -X POST https://irsa.ipac.caltech.edu/SIA \
  -F 'COLLECTION=spherex_dr1' \
  -F 'POS=CIRCLE 269.446280 4.768000 0.01' \
  -F 'RESPONSEFORMAT=CSV' \
  -F 'MAXREC=500'
```

The repeat query returned 240 Level-2 science image records: 122 distinct exposure start times on 26 UTC observing days, spanning MJD 60902.864715 to 61165.082972 (2025-08-15 to 2026-05-05). All six detector channels are represented; D3 appears in 42 records and covers 1.63010–2.43460 μm. The query returns timestamps, product URLs, wavelength coverage, pixel scale, flags/provenance fields and anonymous cloud URLs. `data/manifests/barnards-star-sia-summary.json` records the exact query and representative products.

Two same-release DR1 D3 image cutouts from the first and last epoch above were retrieved through the documented IRSA cutout URL interface. Both returned HTTP 200 as FITS, parsed with Astropy as 7-HDU files with IMAGE, FLAGS, VARIANCE, ZODI, EPSF and WCS-WAVE extensions. Each IMAGE/VARIANCE plane is 29×29 with finite data. This verifies discovery and extraction, not a measured astrophysical change.

Barnard's Star is high-proper-motion. Propagate the source coordinates to each observation epoch, compare matched wavelength channels and compatible processing releases, register on the background sky, and inspect pixel flags, variance, saturation/nonlinearity and local background. The archive's position coverage alone does not establish reliable source photometry or significant variability. QR2 is no longer returned in archive/VO searches; IRSA describes DR1 + QR3 as the uniformly processed image set. Current analysis uses DR1 only.

## Sources

- [IRSA SIA v2 interface and query constraints](https://irsa.ipac.caltech.edu/ibe/sia.html)
- [SPHEREx archive user guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/)
- [SPHEREx release overview](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html)
- [SPHEREx cutout service](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html)
- [SPHEREx photometry caveats and outputs](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html)

## Remaining feasibility work

- Reproduce source coordinates at each epoch from a cited astrometric catalog.
- Check FITS header wavelength and flux calibration details and rejection flags.
- Register and compare matched D3 images and propagate variance.
- Assess if measured changes survive conservative quality cuts.
- Propagate the target position to each frame and verify cutout centering before source-level claims.
- Deploy the local explorer publicly only after the API and data-use path are reviewed.

No discovery or variability result is claimed yet.
