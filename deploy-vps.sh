#!/usr/bin/env bash
set -euo pipefail

# Deploys Serva to serva-vps (Hetzner, x86_64) — the current production host.
# Builds the frontend locally (no node/npm on the VPS), rsyncs source + the
# built frontend to /opt/cafeqr, and builds the backend image natively on
# the VPS itself (no cross-arch emulation needed, unlike the old Pi flow).
#
# Never touches the remote .env wholesale — secrets there are prod-only and
# must not be clobbered by whatever's in the local .env.

VPS_HOST="${VPS_HOST:-serva-vps}"   # SSH alias (already has the right user/key)
VPS_DIR="${VPS_DIR:-/opt/cafeqr}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# Preflight
#
# This script rsyncs the WORKING TREE, not a git ref. That is the whole reason
# these checks exist: a green tick on GitHub says something about a commit, and
# what ships is whatever happens to be on disk. Without this, "CI is green" and
# "what is running in the café is tested" are two unrelated statements.
#
# Every check is a refusal to deploy, never a silent fix, and DEPLOY_SKIP_CHECKS=1
# overrides the lot — at 2am with a café down, a safety net you cannot cut is
# just another outage.
# ---------------------------------------------------------------------------
preflight() {
    if [ "${DEPLOY_SKIP_CHECKS:-0}" = "1" ]; then
        echo "!!  DEPLOY_SKIP_CHECKS=1 — shipping without verifying. You own this one."
        return 0
    fi

    echo "==> Preflight"
    cd "$ROOT"

    # 1. Uncommitted changes. These WOULD ship, and nothing has ever tested them.
    if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
        echo "ERROR: the working tree is dirty, and rsync ships it as-is." >&2
        echo "       Commit (or stash) first, so what runs in production is a commit you can" >&2
        echo "       name, roll back to, and check CI for. Override: DEPLOY_SKIP_CHECKS=1" >&2
        git status --short >&2
        exit 1
    fi

    local sha branch
    sha="$(git rev-parse HEAD)"
    branch="$(git rev-parse --abbrev-ref HEAD)"

    # 2. HEAD must exist on the remote, or there is nothing for CI to have tested
    #    and nothing to recover from if this machine dies.
    if ! git branch -r --contains "$sha" 2>/dev/null | grep -q .; then
        echo "ERROR: HEAD ($(git rev-parse --short HEAD)) is not on any remote branch." >&2
        echo "       Push it first. Override: DEPLOY_SKIP_CHECKS=1" >&2
        exit 1
    fi

    # 3. CI verdict for this exact commit. Absence of a verdict is not consent:
    #    "no run found" is treated as a failure, since it means untested.
    if command -v gh >/dev/null 2>&1; then
        local conclusion
        conclusion="$(gh run list --commit "$sha" --workflow CI --limit 1 \
                        --json conclusion --jq '.[0].conclusion // "none"' 2>/dev/null || echo "unknown")"
        case "$conclusion" in
            success)
                echo "    CI: success for $(git rev-parse --short HEAD) on $branch" ;;
            none|"")
                echo "ERROR: no CI run found for $(git rev-parse --short HEAD)." >&2
                echo "       It may still be queued — check, or override: DEPLOY_SKIP_CHECKS=1" >&2
                exit 1 ;;
            unknown)
                echo "    CI: could not be reached (gh not authenticated?) — continuing." ;;
            *)
                echo "ERROR: CI concluded '$conclusion' for $(git rev-parse --short HEAD)." >&2
                echo "       Fix it, or override: DEPLOY_SKIP_CHECKS=1" >&2
                exit 1 ;;
        esac
    else
        echo "    CI: gh not installed — skipping the CI check."
    fi

    echo "    Deploying $(git rev-parse --short HEAD) ($branch)"
}

preflight

echo "==> Building frontend"
cd "$ROOT/frontend-react"
npm run build
cd "$ROOT"

echo ""
echo "==> Syncing backend source + compose files to $VPS_HOST:$VPS_DIR"
rsync -avz --delete \
  --exclude '.git' --exclude '.DS_Store' --exclude '.claude' --exclude '.agents' \
  --exclude 'target' --exclude 'node_modules' --exclude 'dist' \
  "$ROOT/src" "$ROOT/pom.xml" "$ROOT/Dockerfile" "$ROOT/.dockerignore" \
  "$ROOT/docker-compose.yml" "$ROOT/scripts" \
  "$VPS_HOST:$VPS_DIR/"

echo ""
echo "==> Syncing built frontend"
rsync -avz --delete "$ROOT/frontend-react/dist/" "$VPS_HOST:$VPS_DIR/frontend-react/dist/"

echo ""
echo "==> Verifying POSTGRES_PASSWORD is present in the remote .env"
ssh "$VPS_HOST" "grep -q '^POSTGRES_PASSWORD=' $VPS_DIR/.env" || {
  echo "ERROR: remote .env has no POSTGRES_PASSWORD set." >&2
  echo "docker-compose.yml now requires it — set it (matching the live DB password) before deploying." >&2
  exit 1
}

echo ""
echo "==> Building backend image natively on the VPS (x86_64)"
ssh "$VPS_HOST" "cd $VPS_DIR && docker compose build backend"

echo ""
echo "==> Rehearsing migrations against a copy of production"
# Flyway runs at application startup, so without this every migration would meet
# production data for the first time in production, mid-service, with no way back
# but a restore. This boots the new image against a throwaway copy first, and also
# leaves a dump taken moments before the deploy as a restore point.
if [ "${DEPLOY_SKIP_CHECKS:-0}" = "1" ]; then
    echo "!!  DEPLOY_SKIP_CHECKS=1 — skipping the rehearsal too."
else
    ssh "$VPS_HOST" "cd $VPS_DIR && bash scripts/rehearse-migrations.sh cafeqr-backend:deploy" || {
        echo "" >&2
        echo "ERROR: migration rehearsal failed — production was NOT touched." >&2
        exit 1
    }
fi

echo ""
echo "==> Restarting containers"
ssh "$VPS_HOST" "cd $VPS_DIR && docker compose up -d"

echo ""
echo "==> Waiting for backend health..."
healthy=false
for i in $(seq 1 12); do
  status=$(ssh "$VPS_HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/actuator/health" 2>/dev/null || true)
  if [ "$status" = "200" ]; then
    echo "Backend is UP (HTTP 200)"
    healthy=true
    break
  fi
  echo "  attempt $i/12 — waiting..."
  sleep 5
done
if [ "$healthy" != "true" ]; then
  echo "Backend failed its health check; recent logs:" >&2
  ssh "$VPS_HOST" "cd $VPS_DIR && docker compose logs --tail=100 backend" >&2 || true
  exit 1
fi

echo ""
echo "==> Removing superseded images and obsolete build cache"
ssh "$VPS_HOST" "docker image prune -f && docker builder prune -af"

echo ""
echo "==> Done! Deployed at https://serva.om"
