# AETHERTRACE production and submission preflight

Reviewed November 15, 2026 for **Planet X and SPHEREx**, Challenge 12. Space Apps accepts submissions from the Project tab on the team's page until **11:59 p.m. local time on November 15**. Confirm the event and submission fields in the signed-in Project tab. [2026 event timeline](https://www.spaceappschallenge.org/2026/) · [2026 challenge list](https://www.spaceappschallenge.org/2026/challenges/)

## Project description

AETHERTRACE lets people browse NASA SPHEREx infrared observations through time. Choose a sky field, inspect its false-color composite, and open an individual exposure with its time, detector, wavelength range, and source record. Replay six December 2025 observations of interstellar comet 3I/ATLAS across two passes, follow the predicted positions, and compare the infrared view with a credited July 2025 Hubble image.

The Evidence page shows how wavelength differences and quality flags limit what can be inferred from visually aligned Barnard’s Star exposures. The optional simulated completion fills display gaps from their neighboring colors and marks all estimates with amber hatching. The demo supports visual exploration. The original FITS data and further calibration are needed for scientific measurement.

## Project tab links

- **Project name** — AETHERTRACE
- **Challenge** — Planet X and SPHEREx
- **Live solution** — [aethertrace.vercel.app](https://aethertrace.vercel.app/)
- **Demonstration** — [14-second walkthrough](https://raw.githubusercontent.com/Romone6/AETHERTRACE/refs/heads/feat/multipage-aethertrace/docs/media/comet-walkthrough.mp4). The [interactive replay](https://aethertrace.vercel.app/comet) follows the same six exposures.
- **Source and documentation** — [Audited GitHub branch](https://github.com/Romone6/AETHERTRACE/tree/feat/multipage-aethertrace) · [Public image methods](https://aethertrace.vercel.app/method)

## Release checks

| Check | Result |
| --- | --- |
| Build and contract | Next.js production build and clean staged frontend build passed. The local Vercel Services rehearsal reached Next.js pages and FastAPI routes, including a live IRSA catalog query. OpenAPI lint passed. |
| Exposures | Desktop Chromium opened the single-exposure view and both Explorer stretches for all four fields. It opened an exact archive record and retried a preview after an injected 502. A real FITS download completed for each field. Orion returned an intermittent 502 on an earlier attempt. |
| Archive unavailable | With all API requests blocked, mobile Chromium displayed the saved exposures for all four fields, both stretches, the measured and simulated field views, saved archive records, and the comet replay. Five actual DR1 exposures are bundled. The saved manifest preserves source IDs and FITS and PNG hashes. |
| Other flows | All six pages opened. The Barnard example blinked between its epochs, and Evidence supported shared grayscale, enhanced color, and alternative native cutout stretches. The comet replay advanced and froze, a copied link restored the frame and simulation setting, and the Hubble image loaded. An automated axe check found no violations in the tested views. |
| Dependencies and tests | npm audit reported zero known vulnerabilities. pip-audit flagged Pillow 12.3.0. The backend was upgraded to Pillow 13.0.0 and the repeat scan reported no known vulnerabilities. All 38 Python tests passed. |

## Credits for the project form

- NASA SPHEREx DR1 is a NASA-funded JPL and Caltech project. Cite [DR1 Spectral Images, DOI 10.26131/IRSA678](https://doi.org/10.26131/IRSA678) and the [DR1 Spectral All-Sky Cube, DOI 10.26131/IRSA679](https://doi.org/10.26131/IRSA679). Use the mission acknowledgement from the [IRSA DR1 overview](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html). The comet track uses predicted positions from the [IRSA 3I/ATLAS archive](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html).
- The Barnard’s Star example uses [ESA Gaia DR3](https://gea.esac.esa.int/archive/) source 4472832130942575872. The [worked example record](../apps/web/public/observations/barnard/processing.json) documents the astrometric propagation and wavelength checks.
- The Hubble image is credited to NASA, ESA, D. Jewitt (UCLA) and image processing to J. DePasquale (STScI). The image and walkthrough show the credit. [ESA/Hubble image](https://esahubble.org/images/heic2509b/) · [CC BY 4.0 terms](https://esahubble.org/copyright/)
- The application bundles IBM Plex Sans and Serif under SIL OFL 1.1. Its notice travels with the fonts. [Bundled font notice](../apps/web/public/fonts/OFL.txt) · [IBM Plex source](https://github.com/IBM/plex)
- Direct runtime libraries include [Next.js](https://github.com/vercel/next.js), [React and React DOM](https://github.com/facebook/react), and [FastAPI](https://github.com/fastapi/fastapi) (MIT), [Uvicorn](https://github.com/encode/uvicorn) and [Astropy](https://github.com/astropy/astropy) (BSD-3-Clause), [NumPy](https://github.com/numpy/numpy) (BSD-3-Clause and bundled component notices), and [Pillow](https://github.com/python-pillow/Pillow) (MIT-CMU). Package distributions contain their full notices.

## Before publishing and submitting

- [x] Prepare the audited source revision and walkthrough on the submission branch. [Source and media](https://github.com/Romone6/AETHERTRACE/tree/feat/multipage-aethertrace)
- [ ] Include the third-party credits and license details above. The repository has no project license file. NASA's terms specify Apache 2.0 for original submitted content when the submitter leaves the license unspecified. [Participant terms](https://www.spaceappschallenge.org/legal/)
- [x] Claim the Vercel deployment and configure the production address. The public homepage responded, and a signed-out browser tested the saved Evidence enhancement flow. The API health endpoint, live Orion catalog, PNG preview, and FITS download responded successfully. [Public AETHERTRACE demo](https://aethertrace.vercel.app/) · [Deployment runbook](deployment.md)
- [ ] Add the public demo, release source, credits, and [14-second walkthrough](media/comet-walkthrough.mp4) to the project's submission materials. Confirm the source of the decorative homepage sky background before finalizing the credits. Check the selected event's requirements and submit from its Project tab.
