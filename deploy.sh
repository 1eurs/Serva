#!/usr/bin/env bash
#
# Serva deploy pipeline.
#
#   ./deploy.sh staging      build, ship to the Pi, smoke-test https://staging.serva.om
#   ./deploy.sh prod         ship the build staging already proved to https://serva.om
#   ./deploy.sh status       what each environment is running right now
#
# The point of the two targets being one script is that they deploy the SAME ARTIFACT.
# The jar is built once, here, and both hosts wrap that exact file in a thin image — the
# Pi on an arm64 base, the VPS on x86_64, which Java does not care about. Nothing is
# rebuilt from source on either host.
#
# That is what makes "we tested it on staging" mean anything. Before this, each host ran
# its own Maven build, so the two environments ran two binaries that merely came from the
# same directory. `prod` therefore refuses to deploy a build staging has not seen: it
# compares the fingerprint of what you just built against the fingerprint the Pi recorded,
# and stops if they differ. --force is there for the day you genuinely need it, and it
# says so out loud when used.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

STAGING_HOST="${STAGING_HOST:-pi}"
STAGING_DIR="${STAGING_DIR:-/home/pi/serva-staging}"
STAGING_URL="https://staging.serva.om"

PROD_HOST="${PROD_HOST:-serva-vps}"
PROD_DIR="${PROD_DIR:-/opt/cafeqr}"
PROD_URL="https://serva.om"

FORCE=false
TARGET="${1:-}"
shift || true
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
step()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die()   { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- build

# One number that identifies exactly what is about to run.
#
# It covers the jar and every file of the built frontend, because a deploy is both — a
# backend fix shipped with last week's bundle is a different thing from the one that was
# tested, and a fingerprint over the jar alone would call them equal.
fingerprint() {
  {
    shasum -a 256 target/app.jar | awk '{print $1}'
    find frontend-react/dist -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort
  } | shasum -a 256 | awk '{print $1}' | cut -c1-16
}

build() {
  step "Building frontend"
  (cd frontend-react && npm run build)

  step "Building backend jar"
  mvn -q -B clean package -DskipTests
  # Spring Boot stamps the version into the filename; the image expects one name.
  cp -f target/cafeqr-backend-*.jar target/app.jar

  FP="$(fingerprint)"
  GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  DIRTY=""
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    DIRTY=" +uncommitted"
  fi
  bold "Build $FP  (git $GIT_SHA$DIRTY)"
}

# ---------------------------------------------------------------- ship

# rsync the artifact and the compose assets, then build the thin image on the host.
#
# rsync rather than `docker save | docker load`: a saved image is every layer every time,
# ~400MB over the wire on each deploy, while the jar is ~70MB and rsync only sends the
# parts of it that changed. The base image is pulled once and cached after that.
ship() {
  local host="$1" dir="$2" compose="$3"
  ssh "$host" "mkdir -p $dir/deploy"
  rsync -az --delete "$ROOT/frontend-react/dist/" "$host:$dir/deploy/dist/"
  rsync -az "$ROOT/target/app.jar" "$ROOT/deploy/Dockerfile.thin" \
            "$ROOT/deploy/$compose" "$ROOT/deploy/nginx.staging.conf" \
            "$ROOT/deploy/nginx.security-headers.conf" \
            "$host:$dir/deploy/"
}

# Waits for a specific status code, not merely "something answered".
#
# Staging is probed through nginx at the API rather than at the web root, because nginx
# returns 200 for the app shell from the instant it starts — a good half-minute before the
# JVM behind it can serve anything. Waiting on that reports success and then hands a
# still-booting backend to the smoke test.
wait_healthy() {
  local host="$1" probe="$2" want="$3" name="$4"
  step "Waiting for $name to answer ($want on $probe)"
  for i in $(seq 1 60); do
    if [ "$(ssh "$host" "curl -s -o /dev/null -w '%{http_code}' $probe" 2>/dev/null || true)" = "$want" ]; then
      echo
      bold "$name is up"
      return 0
    fi
    printf '  %s/60…\r' "$i"
    sleep 5
  done
  echo
  return 1
}

# Resolve through DNS-over-HTTPS rather than the deploying machine's resolver.
#
# Not a workaround for a broken lookup — it removes this machine's DNS cache from the
# result. A laptop that asked for a hostname before the record existed caches the NXDOMAIN
# and keeps returning it for minutes afterwards, which makes a perfectly healthy deploy
# report "app shell returned 000" and fail its own smoke test. Everything else about the
# request stays real: real DNS answer, real TLS, real Cloudflare edge, real tunnel, real
# origin. Only the stale cache is skipped.
DOH=(--doh-url https://1.1.1.1/dns-query)

# A deploy that returns 200 on /actuator/health has proved the JVM started, and nothing
# else. These check the things that actually break on a release: that the migrations ran
# to the version this build expects, that the frontend nginx is serving is the frontend we
# just shipped, and that the API is reachable through the real hostname rather than only
# on loopback.
smoke() {
  local url="$1" host="$2" composedir="$3" project="$4"
  local COMPOSE_ENV="${5:-}"
  step "Smoke-testing $url"
  local fail=0

  local db_version
  db_version=$(ssh "$host" "cd $composedir && docker compose $COMPOSE_ENV -p $project exec -T db psql -U cafeqr -d cafeqr -tAc \
    \"SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1\"" 2>/dev/null | tr -d '\r' || echo '?')
  local want
  want=$(ls src/main/resources/db/migration/V*.sql | sed -E 's/.*\/V([0-9]+)__.*/\1/' | sort -n | tail -1)
  if [ "$db_version" = "$want" ]; then
    echo "  ✓ schema at V$db_version"
  else
    warn "  ✗ schema is at '$db_version', this build expects V$want"; fail=1
  fi

  local code
  code=$(curl -s "${DOH[@]}" -o /dev/null -w '%{http_code}' "$url/"); code="${code:-000}"
  [ "$code" = "200" ] && echo "  ✓ app shell served ($code)" || { warn "  ✗ app shell returned $code"; fail=1; }

  # The index must point at the bundle from THIS build, not a cached one.
  #
  # Both sides are read the same way — out of an index.html — because "the entry bundle" is
  # a fact only that file knows. Globbing the assets directory for index-*.js instead was
  # wrong the moment a dependency shipped its code in an index.js: Vite names that shared
  # chunk index-<hash>.js too, and `ls | head -1` then compares against whichever hash sorts
  # first in ASCII rather than against the entry. A healthy deploy failed its own smoke test
  # that way, which is worse than no check — it teaches you to ignore the check.
  local live_asset built_asset
  live_asset=$(curl -s "${DOH[@]}" "$url/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
  built_asset=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' frontend-react/dist/index.html 2>/dev/null | head -1)
  if [ -n "$live_asset" ] && [ "$live_asset" = "$built_asset" ]; then
    echo "  ✓ serving this build's bundle ($live_asset)"
  else
    warn "  ✗ serving '$live_asset', built '$built_asset'"; fail=1
  fi

  # An unauthenticated API call that must answer 401, not 000 (unroutable) or 502 (backend
  # down behind a web server that is still up).
  code=$(curl -s "${DOH[@]}" -o /dev/null -w '%{http_code}' "$url/api/dashboard/features"); code="${code:-000}"
  [ "$code" = "401" ] && echo "  ✓ API reachable and refusing anonymous callers (401)" \
                      || { warn "  ✗ /api/dashboard/features returned $code, expected 401"; fail=1; }

  if [ "$fail" = 1 ] && [ "$code" = "000" ]; then
    warn "  (000 on every check usually means this machine cannot reach $url at all —"
    warn "   check the tunnel, or flush DNS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder)"
  fi
  return $fail
}

record() { ssh "$1" "printf '%s\n' '$2' > $3/deploy/.deployed-fingerprint"; }
read_fp() { ssh "$1" "cat $2/deploy/.deployed-fingerprint 2>/dev/null" 2>/dev/null | tr -d '\r' || true; }

# ---------------------------------------------------------------- targets

case "$TARGET" in
  staging)
    build
    step "Shipping to $STAGING_HOST:$STAGING_DIR"
    ship "$STAGING_HOST" "$STAGING_DIR" "docker-compose.staging.yml"
    ssh "$STAGING_HOST" "test -f $STAGING_DIR/deploy/.env.staging" \
      || die "$STAGING_HOST:$STAGING_DIR/deploy/.env.staging is missing — run deploy/bootstrap-staging.sh first"

    step "Building image and restarting on the Pi"
    ssh "$STAGING_HOST" "cd $STAGING_DIR/deploy && \
      docker build -q -f Dockerfile.thin -t serva-staging-backend:latest . >/dev/null && \
      docker compose --env-file .env.staging -p serva-staging -f docker-compose.staging.yml \
        up -d --remove-orphans"

    wait_healthy "$STAGING_HOST" "http://localhost:8090/api/dashboard/features" 401 "staging" || {
      ssh "$STAGING_HOST" "cd $STAGING_DIR/deploy && docker compose --env-file .env.staging -p serva-staging logs --tail=60 backend" >&2
      die "staging never came up"
    }
    if smoke "$STAGING_URL" "$STAGING_HOST" "$STAGING_DIR/deploy" "serva-staging" "--env-file .env.staging"; then
      record "$STAGING_HOST" "$FP" "$STAGING_DIR"
      step "Staging is live"
      bold "$STAGING_URL  —  build $FP"
      echo "Test it, then: ./deploy.sh prod"
    else
      die "staging is up but failed its smoke test — not recording this build as tested"
    fi
    ;;

  prod)
    [ -f target/app.jar ] && [ -d frontend-react/dist ] \
      || die "nothing built. Run ./deploy.sh staging first — prod ships what staging tested, it does not rebuild."

    FP="$(fingerprint)"
    bold "Promoting build $FP"

    # Rebuilding here would defeat the whole check, so the artifact is used as-is. The
    # cost is that edits made since the build are simply not in it — which is correct, but
    # surprising enough at 2am to be worth saying out loud.
    if [ -n "$(find src frontend-react/src pom.xml -newer target/app.jar 2>/dev/null | head -1)" ]; then
      warn "Source files have changed since this artifact was built."
      warn "Those changes are NOT in it. Re-run ./deploy.sh staging to build and test them."
    fi

    tested="$(read_fp "$STAGING_HOST" "$STAGING_DIR")"
    if [ "$tested" != "$FP" ]; then
      if [ "$FORCE" = true ]; then
        warn "FORCED: staging last passed '$tested', you are deploying '$FP'."
        warn "This build has not been tested anywhere. Proceeding because --force was given."
      else
        echo >&2
        die "This build ($FP) is not the one staging tested (${tested:-none}).
       Run ./deploy.sh staging first, or ./deploy.sh prod --force to override."
      fi
    else
      bold "Build $FP matches what staging tested."
    fi

    step "Shipping to $PROD_HOST:$PROD_DIR"
    rsync -az --delete "$ROOT/frontend-react/dist/" "$PROD_HOST:$PROD_DIR/frontend-react/dist/"
    ssh "$PROD_HOST" "mkdir -p $PROD_DIR/deploy"
    rsync -az "$ROOT/target/app.jar" "$ROOT/deploy/Dockerfile.thin" "$PROD_HOST:$PROD_DIR/deploy/"
    rsync -az "$ROOT/src" "$ROOT/pom.xml" "$ROOT/docker-compose.yml" "$PROD_HOST:$PROD_DIR/"

    ssh "$PROD_HOST" "grep -q '^POSTGRES_PASSWORD=' $PROD_DIR/.env" \
      || die "remote .env has no POSTGRES_PASSWORD"

    step "Building image and restarting on the VPS"
    ssh "$PROD_HOST" "cd $PROD_DIR/deploy && \
      docker build -q -f Dockerfile.thin -t cafeqr-backend:deploy . >/dev/null && \
      cd $PROD_DIR && docker compose up -d"

    wait_healthy "$PROD_HOST" "http://localhost:8080/actuator/health" 200 "production" || {
      ssh "$PROD_HOST" "cd $PROD_DIR && docker compose logs --tail=100 backend" >&2
      die "production never came up"
    }
    smoke "$PROD_URL" "$PROD_HOST" "$PROD_DIR" "cafeqr" || warn "production is up but a smoke check failed — look above"
    record "$PROD_HOST" "$FP" "$PROD_DIR"
    ssh "$PROD_HOST" "docker image prune -f >/dev/null && docker builder prune -af >/dev/null" || true
    step "Production is live"
    bold "$PROD_URL  —  build $FP"
    ;;

  status)
    printf '%-12s %-18s %s\n' ENV BUILD URL
    printf '%-12s %-18s %s\n' staging "$(read_fp "$STAGING_HOST" "$STAGING_DIR" || echo -)" "$STAGING_URL"
    printf '%-12s %-18s %s\n' prod    "$(read_fp "$PROD_HOST" "$PROD_DIR" || echo -)"       "$PROD_URL"
    if [ -f target/app.jar ]; then
      printf '%-12s %-18s %s\n' "local build" "$(fingerprint)" "(working tree)"
    fi
    ;;

  *)
    cat >&2 <<USAGE
Usage: ./deploy.sh <staging|prod|status> [--force]

  staging   build, ship to the Pi, smoke-test https://staging.serva.om
  prod      ship the build staging proved to https://serva.om
  status    what each environment is running

  --force   (prod only) deploy a build staging has not tested
USAGE
    exit 2
    ;;
esac
