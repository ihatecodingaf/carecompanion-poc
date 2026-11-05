#!/usr/bin/env bash
# Build the public demo site: landing page + patient + doctor apps, all running
# against the in-browser demo backend (packages/demo-api). Output: _site/
#
#   BASE_PATH=/carecompanion-poc/ ./scripts/build-demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE_PATH:-/}"
rm -rf _site && mkdir -p _site

pnpm install --frozen-lockfile --filter "@care-ai/patient..." --filter "@care-ai/doctor..."
for app in patient doctor; do
  (cd "apps/$app" && BASE_PATH="${BASE}${app}/" pnpm exec vite build --mode demo)
  cp -r "apps/$app/dist" "_site/$app"
done
cp demo/index.html demo/404.html _site/
touch _site/.nojekyll
echo "Demo site ready in _site/ (base: ${BASE})"
