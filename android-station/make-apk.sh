#!/usr/bin/env bash
#
# Build the station app and drop it where the dashboard serves it from.
#
# The guide in Settings → Branch & printer links to /downloads/serva-station.apk, which is
# published with the frontend — so the download can never point at a build the server does
# not have. Run this whenever the app changes, then deploy as usual.
#
# Bump versionCode in app/build.gradle.kts first, or Android will refuse to install the new
# one over the old.
set -euo pipefail
cd "$(dirname "$0")"

: "${ANDROID_HOME:=/opt/homebrew/share/android-commandlinetools}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
[ -d "$ANDROID_HOME" ] || { echo "ANDROID_HOME not found at $ANDROID_HOME" >&2; exit 1; }
[ -f keystore/signing.properties ] || {
  echo "keystore/signing.properties missing." >&2
  echo "It is deliberately not in git. Restore it from your password manager — an APK signed" >&2
  echo "with a different key CANNOT update one already installed in a café." >&2
  exit 1
}
echo "sdk.dir=$ANDROID_HOME" > local.properties

./gradlew :app:assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../frontend-react/public/downloads/serva-station.apk
VERSION=$(grep -E '^\s*versionName' app/build.gradle.kts | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo
echo "→ frontend-react/public/downloads/serva-station.apk (v$VERSION, $(du -h ../frontend-react/public/downloads/serva-station.apk | cut -f1))"
echo "  Deploy to publish it: ./deploy.sh staging"
