#!/usr/bin/env bash
# Create a clean Vercel Services project without local state or secrets.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage="$(mktemp -d "${TMPDIR:-/tmp}/aether-vercel.XXXXXX")"
mkdir -p "$stage/frontend" "$stage/backend/services/api"

for entry in app components public package.json package-lock.json tsconfig.json; do
  cp -R "$repo_root/apps/web/$entry" "$stage/frontend/"
done
for file in app.py alignment.py display.py science.py; do
  cp "$repo_root/services/api/$file" "$stage/backend/services/api/"
done
python3 - "$repo_root/services/api/requirements.txt" "$stage/backend/pyproject.toml" <<'PY'
import json
from pathlib import Path
import sys

requirements = Path(sys.argv[1]).read_text().splitlines()
dependencies = [item.strip() for item in requirements if item.strip() and not item.lstrip().startswith("#")]
project = '[project]\nname = "aethertrace-api"\nversion = "0.1.0"\nrequires-python = ">=3.12,<3.13"\n'
Path(sys.argv[2]).write_text(project + "dependencies = " + json.dumps(dependencies) + "\n")
PY
printf 'from services.api.app import app\n' > "$stage/backend/main.py"
printf '3.12\n' > "$stage/backend/.python-version"

cat > "$stage/vercel.json" <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "frontend": { "root": "frontend/", "framework": "nextjs" },
    "backend": {
      "root": "backend/",
      "framework": "fastapi",
      "entrypoint": "main:app",
      "devCommand": "uv run uvicorn main:app --host 127.0.0.1 --port $PORT"
    }
  },
  "rewrites": [
    { "source": "/api", "destination": { "service": "backend" } },
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
JSON

printf '%s\n' "$stage"
