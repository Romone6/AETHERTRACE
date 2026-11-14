# Decision log

## 2026-11-14 — New local repository

The proposed `/home/m/Projects/aethertrace` did not exist, so a new local Git repository is the lowest-risk bootstrap. The current chat workspace contained an empty Git metadata directory that Git could not recognize; it was left untouched.

## 2026-11-14 — Start with IRSA SIA/TAP products

IRSA documents public SPHEREx QR3 and DR1, programmatic SIA/TAP access, FITS images and dedicated cutouts. Use archive metadata and small cutouts rather than downloading hundreds-of-megabytes MEFs for initial development. No target suitability or astrophysical result is assumed until queried.
