# Aethertrace web app

This is the Next.js App Router frontend. It reads targets, observations, and comparisons from the canonical API contract at `../../packages/contracts/openapi.yaml`. The frontend also bundles four field composites, the 3I/ATLAS walkthrough, and two source-verified Barnard’s Star records with previews for archive outages.

## Local development

Requires Node.js 20.9 or newer.

Start the API in a terminal from the repository root:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r services/api/requirements.txt
uvicorn services.api.app:app --reload
```

Then start the web app from `apps/web`:

```sh
npm install
AETHERTRACE_API_URL=http://127.0.0.1:8000 npm run dev
```

The Next.js rewrite proxies `/api/*` to the API origin. Set `AETHERTRACE_API_URL` for another API host. Open <http://localhost:3000>. When the archive or API is unavailable, the comet walkthrough and field composites still load. Choose Barnard’s Star for two labeled saved exposures and their comparison.

## Production

Build and run the API separately, then configure the API origin for Next.js:

```sh
AETHERTRACE_API_URL=https://your-api.example npm run build
AETHERTRACE_API_URL=https://your-api.example npm start
```
