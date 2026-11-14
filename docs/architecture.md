# Architecture (initial)

## Contract-first layout

- `packages/contracts/openapi.yaml`: canonical public API contract; shared changes are reviewed on `main`.
- `services/api/`: Python API and archive/analysis workstream.
- `apps/web/`: browser interface workstream.
- `tests/`: cross-component and validation workstream.
- `docs/`: evidence, deployment and submission records.

The first science path is a public IRSA SIA/TAP search for real SPHEREx products, followed by small server-side cutouts. Archive metadata and quality/variance products must travel with rendered data. Comparisons only use compatible releases, wavelengths, calibrations and epochs; aligned flux differences are candidates for review, not discoveries.

## Current constraints

The source workspace was an empty, invalid Git repository. A clean repository was created at `/home/m/Projects/aethertrace`. GitHub CLI is installed but its saved login for `Romone6` is expired. No existing project directory was overwritten. Deployment credentials and paid cloud accounts are absent and will not be assumed.
