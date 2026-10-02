#!/usr/bin/env bash
#
# Build the Windows station and drop it where the dashboard serves it from.
#
# Settings → Branch & printer links to /downloads/serva-station-setup.exe, published with the
# frontend like the APK. Unlike the APK it is NOT committed: at ~100MB it is over GitHub's file
# limit. So run this before deploying from a fresh clone — deploy rsyncs the frontend with
# --delete, and a build without the file removes the download from the server.
#
# Bump "version" in package.json first, so a café can tell which build it is running.
set -euo pipefail
cd "$(dirname "$0")"

npm ci
npx electron-builder --win
cp dist/serva-station-setup.exe ../frontend-react/public/downloads/serva-station-setup.exe
VERSION=$(node -p "require('./package.json').version")
echo
echo "→ frontend-react/public/downloads/serva-station-setup.exe (v$VERSION, $(du -h dist/serva-station-setup.exe | cut -f1))"
echo "  Deploy to publish it: ./deploy.sh staging"
