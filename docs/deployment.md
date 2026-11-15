# AETHERTRACE deployment

## Current boundary

The FastAPI service and Next.js frontend are live at [aethertrace.vercel.app](https://aethertrace.vercel.app/) and can also run locally. The live archive serves SPHEREx DR1 metadata and FITS previews. The bundled demo includes four false-color fields, a six-frame 3I/ATLAS replay, the Hubble reference image, and a saved Barnard’s Star comparison. The previews support visual browsing. Scientific brightness and variability measurements require further validation.

The UI uses a fixed ICRS coordinate. Barnard's Star proper motion has not been applied, so the displayed cutouts are not verified as centered on the star at every epoch. Do not describe them as a verified stellar light curve or discovery.

The [source repository](https://github.com/Romone6/AETHERTRACE) is public.

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

## Production preview and release

Build and run the web app with the deployed API origin set at build time so the same-origin `/api/*` rewrite uses the intended service. Run the API from the repository root. Use separate terminals for local production rehearsal.

```sh
.venv/bin/uvicorn services.api.app:app --host 127.0.0.1 --port 8000
```

```sh
npm --prefix apps/web ci
AETHERTRACE_API_URL=http://127.0.0.1:8000 npm --prefix apps/web run build
AETHERTRACE_API_URL=http://127.0.0.1:8000 npm --prefix apps/web run start
```

For a hosted preview, replace the local API origin with the deployed HTTPS origin. From the public preview, verify:

- The homepage opens the comet replay. Its six frames play, freeze, and reopen from a copied link. The Explorer observation section loads the credited Hubble reference.
- `/api/targets` and a live IRSA catalog request succeed. Open a specific archive exposure, verify its image, and download its FITS cutout.
- A fresh session with archive requests blocked still loads the comet, field composites, and saved DR1 exposures for all four sky fields. Exercise the homepage exposure toggle and both Explorer stretches. An outage notice identifies saved records.
- Run the same checks at a narrow mobile width and confirm the release commit matches the public demo. Add that public link to the README and submission materials.

### Vercel preview

Run the staging script from the repository root. It builds a temporary project with the frontend and FastAPI as separate Vercel Services under one domain. The release package contains the application and public observation assets and excludes local environment files and build caches.

```sh
aether_stage="$(bash scripts/stage_vercel_preview.sh)"
cd "$aether_stage"
npx --yes vercel@latest --yes
```

For an account-owned deployment, sign in to the Vercel CLI. The same stage also supports `npx --yes vercel@latest deploy --temporary` in a signed-out session. The temporary workflow builds locally and requires `uv` 0.9.25 or newer for FastAPI. It returns an expiry and a claim link. Claim the deployment before expiry if it will be used for submission.

The preview routes `/api/*` to FastAPI and other paths to Next.js. After deploying, run the public checks above in a signed-out browser and confirm that the intended audience can open the preview.
