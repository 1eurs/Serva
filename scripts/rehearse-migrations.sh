#!/usr/bin/env bash
# Rehearses a deploy's database migrations against a COPY of live production,
# before the real containers are touched. Runs ON serva-vps, called by
# deploy-vps.sh once the new backend image is built and before it goes live.
#
# The risk this closes: Flyway runs on application startup, so until now every
# migration met production data for the very first time in production, during a
# deploy, with customers ordering. A migration that works on an empty test
# database and fails on real rows — a NOT NULL added to a column with existing
# nulls, a unique index on data that already has duplicates — took the café down
# and left no way back except a restore.
#
# What this does instead:
#   1. dumps live production (and KEEPS that dump as a pre-deploy restore point)
#   2. restores it into a throwaway Postgres
#   3. boots the NEW backend image against that throwaway database
#   4. tears it down, and fails loudly if the boot did not succeed
#
# Step 3 boots the whole application rather than running Flyway alone, on
# purpose: that way it checks both that the migrations apply to real data AND
# that Hibernate's schema validation still agrees with the entities afterwards.
# A migration and an entity that disagree fail at startup, which is exactly the
# failure this is meant to catch before it reaches a customer.
set -euo pipefail

IMAGE="${1:-cafeqr-backend:deploy}"
NET=cafeqr-net
DB_NAME=serva-rehearsal-db
BACKUP_DIR=/opt/backups
STAMP="$(date -u +%F-%H%M%S)"
PREDEPLOY_DUMP="$BACKUP_DIR/cafeqr-predeploy-$STAMP.sql.gz"
BOOT_TIMEOUT=120

cleanup() {
    docker rm -f "$DB_NAME" >/dev/null 2>&1 || true
    docker rm -f serva-rehearsal-app >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "    [1/4] dumping live production"
mkdir -p "$BACKUP_DIR"
docker exec cafeqr-db pg_dump -U cafeqr cafeqr | gzip > "$PREDEPLOY_DUMP"
if [ "$(stat -c%s "$PREDEPLOY_DUMP")" -lt 1024 ]; then
    echo "ERROR: pre-deploy dump is suspiciously small; refusing to continue." >&2
    exit 1
fi
echo "          kept as $PREDEPLOY_DUMP ($(stat -c%s "$PREDEPLOY_DUMP") bytes) — restore point if this deploy goes wrong"

echo "    [2/4] restoring it into a throwaway database"
docker rm -f "$DB_NAME" >/dev/null 2>&1 || true
docker run -d --name "$DB_NAME" --network "$NET" \
    -e POSTGRES_DB=cafeqr -e POSTGRES_USER=cafeqr -e POSTGRES_PASSWORD=rehearsal \
    postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
    docker exec "$DB_NAME" pg_isready -U cafeqr -d cafeqr >/dev/null 2>&1 && break
    sleep 1
done
gzip -dc "$PREDEPLOY_DUMP" | docker exec -i "$DB_NAME" psql -U cafeqr -d cafeqr -q -v ON_ERROR_STOP=1 >/dev/null

echo "    [3/4] booting the new image against that copy (migrates + validates schema)"
# Deliberately NOT given the production .env: with no mail or WhatsApp
# credentials the notification providers stay in their 'log' mode, so a
# rehearsal can never send a real email or message to a real customer.
# APP_JWT_SECRET only has to be non-default, since SecretValidation refuses the
# committed one outside the dev profile.
set +e
docker run --rm --name serva-rehearsal-app --network "$NET" \
    -e SPRING_PROFILES_ACTIVE=prod \
    -e SPRING_DATASOURCE_URL="jdbc:postgresql://$DB_NAME:5432/cafeqr" \
    -e SPRING_DATASOURCE_USERNAME=cafeqr \
    -e SPRING_DATASOURCE_PASSWORD=rehearsal \
    -e APP_JWT_SECRET="$(head -c 48 /dev/urandom | base64 -w0)" \
    -e JAVA_TOOL_OPTIONS="-Xms128m -Xmx512m" \
    "$IMAGE" \
    > /tmp/rehearsal-$STAMP.log 2>&1 &
run_pid=$!

booted=0
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
    if grep -q "Started CafeQrApplication" /tmp/rehearsal-$STAMP.log 2>/dev/null; then
        booted=1
        break
    fi
    # A failed migration or a schema mismatch kills the process; stop waiting.
    if ! kill -0 "$run_pid" 2>/dev/null; then
        break
    fi
    sleep 1
done
docker rm -f serva-rehearsal-app >/dev/null 2>&1 || true
wait "$run_pid" 2>/dev/null
set -e

if [ "$booted" != "1" ]; then
    echo "" >&2
    echo "ERROR: the new build did NOT start against a copy of production." >&2
    echo "       Nothing has been deployed and production has not been touched." >&2
    echo "       This is the migration failing on real data, or Hibernate disagreeing" >&2
    echo "       with the schema it produced. Last 40 lines:" >&2
    echo "" >&2
    tail -40 "/tmp/rehearsal-$STAMP.log" >&2
    exit 1
fi

echo "    [4/4] rehearsal passed — migrations apply to production data and the schema validates"
rm -f "/tmp/rehearsal-$STAMP.log"
