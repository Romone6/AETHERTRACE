# AETHERTRACE production and submission preflight

Reviewed November 15, 2026 for **Planet X and SPHEREx**, Challenge 12. Submit before **11:59 p.m. November 15 in your Local Event’s time zone**. For the Universal Event, use the Team Owner’s local time. For a Sydney event or a Sydney-based Universal Event owner, that is 11:59 p.m. AEDT. [Official 2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) · [2026 challenge list](https://www.spaceappschallenge.org/2026/challenges/)

## Project Name

AETHERTRACE

## High-Level Project Summary

AETHERTRACE makes NASA’s SPHEREx infrared archive easier to explore over time. Anyone can browse exposures, replay 3I/ATLAS across six archived frames, and see which measurements are usable in an aligned comparison. The site connects each display to its source so students and curious observers can see where the evidence comes from and what it supports.

## Links for the Project tab

- **Challenge** — Planet X and SPHEREx
- **Link to Project Demo** — [28-second English demo](https://aethertrace.vercel.app/demo/aethertrace.mp4) · [GitHub backup](https://raw.githubusercontent.com/Romone6/AETHERTRACE/refs/heads/feat/multipage-aethertrace/apps/web/public/demo/aethertrace.mp4)
- **Link to Final Project** — [aethertrace.vercel.app](https://aethertrace.vercel.app/)
- **Source and documentation** — [Audited GitHub branch](https://github.com/Romone6/AETHERTRACE/tree/feat/multipage-aethertrace) · [Public image methods](https://aethertrace.vercel.app/method)

## Detailed Project Description

Explore Orion, Andromeda, the Pleiades, or Barnard’s Star through a false-color composite and individual SPHEREx exposures. The archive preserves exposure time, detector, wavelength range, and source product. Visitors can switch between enhanced grayscale and linear contrast, then open the original FITS cutout when the live archive is available. Saved examples keep the core experience usable during an outage.

The 3I/ATLAS timeline replays six SPHEREx D6 observations from two passes on December 14, 2025. Its marker follows IRSA’s predicted sky positions. A separately credited July 2025 Hubble image shows the comet in visible light. The Barnard’s Star worked example illustrates why time-separated observations can be useful to inspect even when differing wavelengths and flagged center pixels prevent a brightness measurement.

The Next.js frontend uses a Python FastAPI service to query IRSA and render display previews from FITS using Astropy, NumPy, and Pillow. The optional display-space simulation fills gaps by averaging neighboring colors, with every estimate marked by amber hatching. It provides illustrative context. Scientific measurements require calibrated source data and a suitable uncertainty analysis.

## Use of Super Intelligence (SI)

Yes. OpenAI Codex assisted with application code, processing scripts, test automation, and documentation. The site discloses that assistance in its page metadata and Method section. The application displays NASA and ESA archive imagery. The submitted video uses screen captures from the app and the credited Hubble image. The optional gap fill uses deterministic image processing, and its estimated pixels are visibly marked. [Public development disclosure](https://aethertrace.vercel.app/method#development-disclosure)

## NASA Data

NASA SPHEREx Data Release 1 from the NASA/IPAC Infrared Science Archive powers both the archive explorer and the comet replay. The project uses DR1 spectral images for the individual FITS cutouts and the Spectral All-Sky Cube for the four field composites. The IRSA 3I/ATLAS observation table supplies the comet’s predicted positions. [DR1 Spectral Images](https://doi.org/10.26131/IRSA678) · [DR1 Spectral All-Sky Cube](https://doi.org/10.26131/IRSA679) · [IRSA comet archive](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html)

## Release checks

| Check | Result |
| --- | --- |
| Build and contract | Next.js production build and clean staged frontend build passed. The local Vercel Services rehearsal reached Next.js pages and FastAPI routes, including a live IRSA catalog query. OpenAPI lint passed. |
| Exposures | Desktop Chromium opened the single-exposure view and both Explorer stretches for all four fields. It opened an exact archive record and retried a preview after an injected 502. A real FITS download completed for each field. Orion returned an intermittent 502 on an earlier attempt. |
| Archive unavailable | With all API requests blocked, mobile Chromium displayed the saved exposures for all four fields, both stretches, the measured and simulated field views, saved archive records, and the comet replay. Five actual DR1 exposures are bundled. The saved manifest preserves source IDs and FITS and PNG hashes. |
| Other flows | All six pages opened. The Barnard example blinked between its epochs, and Evidence supported shared grayscale, enhanced color, and alternative native cutout stretches. The comet replay advanced and froze, a copied link restored the frame and simulation setting, and the Hubble image loaded. An automated axe check found no violations in the tested views. |
| Dependencies and tests | npm audit reported zero known vulnerabilities. pip-audit flagged Pillow 12.3.0. The backend was upgraded to Pillow 13.0.0 and the repeat scan reported no known vulnerabilities. All 38 Python tests passed. |

## Space Agency Partner Data and Other References

- NASA SPHEREx DR1 is a NASA-funded JPL and Caltech project. Cite [DR1 Spectral Images, DOI 10.26131/IRSA678](https://doi.org/10.26131/IRSA678) and the [DR1 Spectral All-Sky Cube, DOI 10.26131/IRSA679](https://doi.org/10.26131/IRSA679). Use the mission acknowledgement from the [IRSA DR1 overview](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html). The comet track uses predicted positions from the [IRSA 3I/ATLAS archive](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html).
- The Barnard’s Star example uses [ESA Gaia DR3](https://gea.esac.esa.int/archive/) source 4472832130942575872. The [worked example record](../apps/web/public/observations/barnard/processing.json) documents the astrometric propagation and wavelength checks.
- The Hubble image is credited to NASA, ESA, D. Jewitt (UCLA) and image processing to J. DePasquale (STScI). The image and walkthrough show the credit. [ESA/Hubble image](https://esahubble.org/images/heic2509b/) · [CC BY 4.0 terms](https://esahubble.org/copyright/)
- The application bundles IBM Plex Sans and Serif under SIL OFL 1.1. Its notice travels with the fonts. [Bundled font notice](../apps/web/public/fonts/OFL.txt) · [IBM Plex source](https://github.com/IBM/plex)
- Direct runtime libraries include [Next.js](https://github.com/vercel/next.js), [React and React DOM](https://github.com/facebook/react), and [FastAPI](https://github.com/fastapi/fastapi) (MIT), [Uvicorn](https://github.com/encode/uvicorn) and [Astropy](https://github.com/astropy/astropy) (BSD-3-Clause), [NumPy](https://github.com/numpy/numpy) (BSD-3-Clause and bundled component notices), and [Pillow](https://github.com/python-pillow/Pillow) (MIT-CMU). Package distributions contain their full notices.
- Original AETHERTRACE code uses Apache 2.0. The source repository records the separate rights for reused material and the tools used to build and demonstrate the site. [License and third-party notices](../NOTICE.md)

## Your submission checklist

1. Sign in, confirm your event and team, then open **Profile → My Team → Project → Edit**. For global judging, all members must be registered, accepted at the same event, and listed on the team page. The 2026 guide allows one to six members for Local Event teams and two to six for Universal Event teams. [2026 Judging and Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/)
2. Select **Planet X and SPHEREx** and fill every required field with the sections above. Use English for the form and linked materials. The guide accepts a public video of 30 seconds or less or an English deck of up to seven slides. A video spoken in another language requires English subtitles. Video and document files are linked from public hosts. The form accepts optional JPG, PNG, or GIF images up to 10 MB.
3. Confirm the demo and final project both open without sign-in or access requests. Submit materials you have rights to share, include the source and license credits, and omit any likeness of a person under 18. [Participant terms](https://www.spaceappschallenge.org/legal/)
4. Read the submission requirements, Participant Terms and Conditions, and Privacy Policy. Check **Terms and Conditions** and **Confirm All Work is Original**. Click **Submit for Judging** before the deadline and confirm the success banner. Saving progress alone leaves the project in draft. You can edit and resubmit before the deadline. The team’s latest submission is the one reviewed. [Official 2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)
