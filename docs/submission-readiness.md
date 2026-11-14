# NASA Space Apps 2026 submission readiness

Checked 2026-11-14. This is an internal preparation record, not a submitted project page. The official [2026 event page](https://www.spaceappschallenge.org/2026/) says the hackathon runs November 14–15, teams may have up to six participants, and eligible Global Judging requires event registration and a project submitted through the Project tab from 9:00 AM on November 14 until 11:59 PM local time on November 15. The [official 2026 challenge list](https://www.spaceappschallenge.org/2026/challenges/) identifies **Planet X and SPHEREx** (Challenge 12). The official [participant terms](https://www.spaceappschallenge.org/legal/) require appropriate license documentation and citation of every source used.

## Selected challenge: Planet X and SPHEREx

The official challenge statement calls for a **public-facing web tool** that displays images of the sky from the SPHEREx mission and makes it easy for people to see how the images change over time. Its context describes SPHEREx as mapping the whole sky every six months in 102 near-infrared bands, returning images of more than a billion objects; comets, asteroids, stars, brown dwarfs, and possible new planets are examples of objects that may shift between images. These are the challenge's objective and context, not features already implemented here. See the official [2026 challenge list](https://www.spaceappschallenge.org/2026/challenges/) and challenge statement reproduced on Space Apps team pages (for example [LSP'26](https://www.spaceappschallenge.org/2026/find-a-team/lsp26/)).

## Honest project description

**Working name:** AETHERTRACE

**Current state:** A runnable local prototype. FastAPI queries public IRSA SIA for SPHEREx DR1 products and serves FITS cutouts plus display-only PNG previews. A Next.js interface lists the records and scrubs through images in one detector channel at a time. The API response preserves unique product IDs, time intervals, wavelength bounds, channel, source URLs, and original archive metadata. Local API, browser, contract-lint, and production-build checks have passed.

**Data and evidence:** A live DR1 query returned 240 Level-2 records with 240 unique `obs_publisher_did` identifiers, 122 distinct exposure start times, and 42 D3 products. Two D3 FITS cutouts were parsed; the API returned 232×232 PNG previews for both verified epochs. These previews are percentile/asinh display stretches, not calibrated measurements. The target position is fixed and Barnard's Star proper motion has not been applied, so frames are not yet verified as centered on the star. No source photometry, registration, uncertainty propagation, change statistic, detection, comparison result, or scientific discovery is claimed. See [science query evidence](science-query-evidence.md).

## Submission preflight

- [ ] Record **Planet X and SPHEREx** as the team's challenge in the Space Apps Project Tab and explain the fit. This preparation identifies the matching official statement; team registration/selection was not changed here.
- [ ] Confirm participant registration, Local Event or Universal Event, team membership (maximum six), and team lead directly on Space Apps. No account was created or changed for this preparation.
- [x] Build a runnable local demonstration and test it. API tests: 11 passed; OpenAPI lint and Next.js production build pass; the local browser loaded 240 records and a 42-frame D3 sequence.
- [ ] Write the final project page around features that actually work; distinguish prototype, planned work, and limitations.
- [ ] Cite NASA/partner data, software, libraries, media, and other sources used; include license documentation for solution materials as required by the participant terms.
- [ ] Add public project-code and demo links only after they exist and are accessible. No remote repository or public deployment is configured; GitHub CLI authentication is expired.
- [ ] Submit through the team's Project tab by the official local-time deadline. Do not treat this document or a Git commit as an event submission.

## Judging and submission details still to confirm

The official 2026 event page establishes registration, team size, submission location, window, and Global Judging eligibility; the participant terms establish source-citation and licensing obligations. I did not find a 2026 global judging rubric, scoring weights, or a 2026 Project Submission Guide in the official pages reviewed. Some 2026 Local Event pages reproduce criteria, but that local-event content is not a substitute for the Global Organizing Team's guide. Check the official Resources page and selected Local Event instructions; follow the live Project Tab form for any additional fields or deliverables. The deadline above is confirmed and unchanged.

## Official sources

- [2026 NASA Space Apps Challenge: timeline, team size, submission and Global Offers](https://www.spaceappschallenge.org/2026/)
- [Official 2026 challenge list including Challenge 12, Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/)
- [2026 Participant Terms and Conditions: rights, licenses, source citations](https://www.spaceappschallenge.org/legal/)
- [NASA Science announcement of the 2026 event and focus areas](https://science.nasa.gov/universe/nasa-welcomes-all-ages-experience-levels-for-space-apps-challenge/)
- [2026 Resources page](https://www.spaceappschallenge.org/resources/) — consult for the current guide and judging materials; a 2026 global rubric was not confirmed during this review.
