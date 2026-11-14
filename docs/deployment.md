# Local-first deployment

## Current boundary

A local FastAPI service and Next.js App Router interface are implemented and integrated. The web app displays authentic IRSA/SPHEREx cutout previews from a selectable detector channel. The API and frontend have been built and smoke-tested locally. The preview stretch is for visual browsing only; there is no calibrated photometry, registered difference image, variability result, public hosting, or public demo URL.

The UI uses a fixed ICRS coordinate. Barnard's Star proper motion has not been applied, so the displayed cutouts are not verified as centered on the star at every epoch. Do not describe them as a verified stellar light curve or discovery.

No host, credentials, public domain, cloud account, or paid service has been selected or activated. GitHub CLI credentials are expired, and no remote repository exists.

## Run locally

From the repository root, start the API:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r services/api/requirements.txt
uvicorn services.api.app:app --reload
```

In another terminal:

```sh
cd apps/web
npm ci
AETHERTRACE_API_URL=http://127.0.0.1:8000 npm run dev
```

Open <http://localhost:3000>. The Next.js rewrite proxies `/api/*` to FastAPI. See [API instructions](../services/api/README.md) and [frontend instructions](../apps/web/README.md).

## Local contract review

With Node.js 20.9 or newer and npm, run:

```sh
npx --yes @redocly/cli@2.78.0 lint packages/contracts/openapi.yaml --extends minimal
```

The command downloads the pinned open-source linter from npm if it is not already cached; it does not require project credentials or a cloud account. Alternatively, parse the YAML locally with PyYAML:

```sh
python3 -c 'import yaml; yaml.safe_load(open("packages/contracts/openapi.yaml"))'
```

The GitHub Actions workflow runs the same OpenAPI lint on pushes to `main` and `feat/infrastructure`, pull requests, and manual dispatch. It validates the contract only; it does not build or deploy an application.

## Deployment gate

Before public deployment, add measured science only after the proper-motion-aware photometry and validation gates pass, choose and review a host, verify public IRSA access and timeout/error behavior, and document cost/credential requirements. This local-first prototype does not require a cloud provider.
