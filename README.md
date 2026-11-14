# AETHERTRACE

**Explore the infrared universe. Discover what changes. Understand the evidence.**

A local explorer prototype for authentic SPHEREx imagery with archive search, FITS previews, and traceable observation metadata. Scientific change detection requires calibrated, registered measurements.

## Current status

- IRSA SIA v2 returned 240 DR1 Level-2 records for the Barnard's Star field query, including 42 D3 products across 122 distinct exposure start times.
- The Next.js interface displays time-ordered cutout previews within a selected detector channel. The cutout center uses a fixed coordinate; Barnard's Star proper motion has not been applied, so the displayed cutouts are not verified as centered on the star.
- The API preserves unique product IDs, exposure intervals, wavelength bounds, channel, and source-row provenance. Comparisons remain `INSUFFICIENT_DATA`; no variability result is claimed. See [query evidence](docs/science-query-evidence.md) and [scientific feasibility](docs/scientific-feasibility.md).
- The Evidence page displays two source cutouts side by side with FITS quality counts, source links, and the limits of visual comparison.
- Source code is available in the public [GitHub repository](https://github.com/Romone6/AETHERTRACE). The demo runs locally.

## Run locally

See [API setup](services/api/README.md) and [web app setup](apps/web/README.md).

See [architecture](docs/architecture.md), [decision log](docs/decision-log.md), [stream status](docs/agent-status.md), and [API contract](packages/contracts/openapi.yaml).

No cloud services or paid offers have been activated.

Infrastructure status: [local-first deployment boundary](docs/deployment.md), [NASA Space Apps 2026 submission readiness](docs/submission-readiness.md), and [Global Offers audit](docs/global-offers-ledger.md). CI currently lints the OpenAPI contract; it does not deploy an application.
