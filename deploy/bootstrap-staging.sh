#!/usr/bin/env bash
#
# One-time setup for the Serva staging box (the Pi). Safe to re-run.
#
# Creates, on the Pi:
#   /home/pi/serva-staging/deploy/.env.staging   generated secrets, never shared with prod
#   a dedicated `serva-staging` Cloudflare tunnel + its systemd service
#
# It deliberately does NOT touch the existing `pi-sites` tunnel. That one is token-run,
# so its routing lives in the Cloudflare dashboard rather than in a file, and adding a
# hostname to it would mean editing state this script cannot see or roll back. A separate
# locally-managed tunnel keeps staging's routing in a file next to everything else, and
# means a mistake here cannot take the personal sites down.
#
set -euo pipefail

STAGING_HOST="${STAGING_HOST:-pi}"
STAGING_DIR="${STAGING_DIR:-/home/pi/serva-staging}"
TUNNEL_NAME="${TUNNEL_NAME:-serva-staging}"
HOSTNAME_="${STAGING_HOSTNAME:-staging.serva.om}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

command -v cloudflared >/dev/null || die "cloudflared is not installed on this Mac (brew install cloudflared)"
[ -f ~/.cloudflared/cert.pem ] || die "no ~/.cloudflared/cert.pem — run: cloudflared tunnel login"

ZONE="${HOSTNAME_#*.}"

# `cloudflared tunnel login` writes ~/.cloudflared/cert.pem and OVERWRITES whatever was
# there, and each cert authorizes exactly one zone. With two zones on the account that
# turns logging in for one into losing the other. So certs are kept per-zone beside it and
# selected with --origincert; cert.pem stays whatever the last login left.
ORIGINCERT=""
if [ -f ~/.cloudflared/cert-"$ZONE".pem ]; then
  ORIGINCERT="--origincert $HOME/.cloudflared/cert-$ZONE.pem"
  bold "Using the saved $ZONE cert."
fi

tunnel_id_of() {
  cloudflared $ORIGINCERT tunnel list --output json 2>/dev/null \
    | python3 -c "import sys,json;m=[t['id'] for t in json.load(sys.stdin) if t['name']=='$TUNNEL_NAME'];print(m[0] if m else '')"
}

step "Creating the $TUNNEL_NAME tunnel (if it does not exist)"
TUNNEL_ID="$(tunnel_id_of)"
if [ -n "$TUNNEL_ID" ]; then
  bold "Tunnel $TUNNEL_NAME already exists."
else
  cloudflared $ORIGINCERT tunnel create "$TUNNEL_NAME"
  TUNNEL_ID="$(tunnel_id_of)"
fi
[ -n "$TUNNEL_ID" ] || die "could not resolve the id of tunnel $TUNNEL_NAME"
bold "Tunnel id: $TUNNEL_ID"

step "Pointing $HOSTNAME_ at it"
#
# `cloudflared tunnel route dns` writes into whichever zone ~/.cloudflared/cert.pem was
# issued for. A cert scoped to a different zone does not fail — it SUCCEEDS, by treating
# the hostname as a subdomain of the zone it does own, so asking for staging.serva.om with
# an m7m2od.com cert silently creates staging.serva.om.m7m2od.com and reports success.
# That record is useless and points at the wrong tunnel, so check the zone first rather
# than trusting the exit code.
CERT_PATH="$HOME/.cloudflared/cert.pem"
[ -n "$ORIGINCERT" ] && CERT_PATH="$HOME/.cloudflared/cert-$ZONE.pem"
# The origin cert carries a scoped API token and the zone it was issued for. Reading them
# here answers both questions at once: is this cert allowed to touch $ZONE, and what do we
# authenticate with if it is.
read -r CERT_ZONE API_TOKEN ZONE_ID <<EOF
$(CERT_PATH="$CERT_PATH" ZONE="$ZONE" python3 - <<'PYEOF'
import re, base64, json, os, urllib.request
d = json.loads(base64.b64decode(re.sub(r"\s", "",
    re.search(r"TOKEN-----(.*?)-----END", open(os.environ["CERT_PATH"]).read(), re.S).group(1))))
req = urllib.request.Request("https://api.cloudflare.com/client/v4/zones?per_page=50",
                             headers={"Authorization": "Bearer " + d["apiToken"]})
zones = json.load(urllib.request.urlopen(req))["result"]
match = [z["id"] for z in zones if z["name"] == os.environ["ZONE"]]
print(",".join(z["name"] for z in zones), d["apiToken"], match[0] if match else "-")
PYEOF
)
EOF
if printf '%s' "$CERT_ZONE" | tr ',' '\n' | grep -qx "$ZONE"; then
  # NOT `cloudflared tunnel route dns`. That command reads ~/.cloudflared/config.yml and
  # uses the tunnel named THERE, ignoring the one passed as an argument — so on a machine
  # that also runs a cloudflared tunnel of its own it points the hostname at that tunnel
  # instead, reports success, and the site 404s because the tunnel it chose has no ingress
  # rule for the name. Writing the record over the API says exactly which tunnel, once.
  CF_ZONE_ID="$ZONE_ID" CF_TOKEN="$API_TOKEN" CF_TARGET="$TUNNEL_ID.cfargotunnel.com" \
  CF_NAME="${HOSTNAME_%%.*}" CF_FQDN="$HOSTNAME_" python3 - <<'PYEOF'
import json, os, urllib.request
zone, tok = os.environ["CF_ZONE_ID"], os.environ["CF_TOKEN"]
def cf(path, method="GET", body=None):
    r = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r))
body = {"type": "CNAME", "name": os.environ["CF_NAME"], "content": os.environ["CF_TARGET"],
        "proxied": True, "comment": "Serva staging - serva-staging tunnel"}
existing = cf(f"/zones/{zone}/dns_records?name=" + os.environ["CF_FQDN"])["result"]
if existing:
    cf(f"/zones/{zone}/dns_records/{existing[0]['id']}", "PUT", body)
else:
    cf(f"/zones/{zone}/dns_records", "POST", body)
print("  " + os.environ["CF_FQDN"] + " -> " + os.environ["CF_TARGET"])
PYEOF
  bold "DNS set."
else
  cat >&2 <<MSG

  ---------------------------------------------------------------------
  DNS NOT SET. This machine's Cloudflare cert covers [$CERT_ZONE],
  not '$ZONE', and routing with it would create the wrong record.

  Do ONE of these, then re-run this script:

    a) Log in for $ZONE. NOTE: 'cloudflared tunnel login' REFUSES when a cert.pem
       already exists — and still exits 0 — so cert.pem must be moved out of the
       way first, or you silently keep the old zone's cert under a new name:

         mv ~/.cloudflared/cert.pem ~/.cloudflared/cert.pem.bak
         cloudflared tunnel login                          # pick $ZONE in the browser
         cp ~/.cloudflared/cert.pem ~/.cloudflared/cert-$ZONE.pem
         ./deploy/bootstrap-staging.sh

    b) add the record by hand in the Cloudflare dashboard:
         Type    CNAME
         Name    ${HOSTNAME_%%.*}
         Target  $TUNNEL_ID.cfargotunnel.com
         Proxy   on (orange cloud)
  ---------------------------------------------------------------------

MSG
fi

step "Installing the tunnel on $STAGING_HOST"
ssh "$STAGING_HOST" "mkdir -p ~/.cloudflared $STAGING_DIR/deploy"
LOCAL_SUM="$(shasum -a 256 ~/.cloudflared/"$TUNNEL_ID".json | awk '{print $1}')"
REMOTE_SUM="$(ssh "$STAGING_HOST" "sha256sum ~/.cloudflared/$TUNNEL_ID.json 2>/dev/null | awk '{print \$1}'" || true)"
if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
  bold "Credentials already on $STAGING_HOST and identical — left alone."
else
  # cloudflared writes these 400, which scp cannot overwrite. Open it, copy, close it.
  ssh "$STAGING_HOST" "chmod u+w ~/.cloudflared/$TUNNEL_ID.json 2>/dev/null || true"
  scp -q ~/.cloudflared/"$TUNNEL_ID".json "$STAGING_HOST:~/.cloudflared/"
  ssh "$STAGING_HOST" "chmod 400 ~/.cloudflared/$TUNNEL_ID.json"
  bold "Credentials installed."
fi

# Ingress: one hostname to the staging web container's loopback port, everything else
# refused. The catch-all matters — without it the tunnel would answer for hostnames it was
# never meant to serve.
ssh "$STAGING_HOST" "cat > ~/.cloudflared/$TUNNEL_NAME.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /home/pi/.cloudflared/$TUNNEL_ID.json
protocol: quic
loglevel: info

ingress:
  - hostname: $HOSTNAME_
    service: http://localhost:8090
  - service: http_status:404
EOF"

step "Registering it as a service (separate from the pi-sites tunnel)"
ssh "$STAGING_HOST" "sudo tee /etc/systemd/system/cloudflared-$TUNNEL_NAME.service >/dev/null <<EOF
[Unit]
Description=cloudflared tunnel for $HOSTNAME_
After=network-online.target
Wants=network-online.target

[Service]
User=pi
ExecStart=/usr/bin/cloudflared --no-autoupdate --config /home/pi/.cloudflared/$TUNNEL_NAME.yml tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-$TUNNEL_NAME"

step "Generating staging secrets"
# Generated here and never copied from production: staging holds junk data, but a shared
# JWT secret would mean a token minted on the Pi is valid against the real site.
if ssh "$STAGING_HOST" "test -f $STAGING_DIR/deploy/.env.staging"; then
  bold ".env.staging already exists — left alone (secrets are generated once)."
else
  ssh "$STAGING_HOST" "cat > $STAGING_DIR/deploy/.env.staging <<EOF
# Serva staging. Generated by bootstrap-staging.sh — not shared with production.
POSTGRES_PASSWORD=\$(openssl rand -hex 24)
APP_JWT_SECRET=\$(openssl rand -hex 48)

# Nothing leaves this box. 'log' means the app writes what it would have sent and stops
# there — staging must never mail a real café, and the seeded data uses real addresses.
APP_EMAIL_PROVIDER=log
APP_SMS_PROVIDER=log
APP_EMAIL_FROM=staging@serva.om
APP_ADMIN_ALERT_EMAIL=staging@serva.om

APP_BILLING_CURRENCY=OMR
APP_BILLING_BANK_NAME=Staging Bank
APP_BILLING_ACCOUNT_NAME=Serva Staging
APP_BILLING_ACCOUNT_NUMBER=0000000000
APP_BILLING_IBAN=OM00STAGING0000000000
EOF
chmod 600 $STAGING_DIR/deploy/.env.staging"
  bold "Generated fresh staging secrets."
fi

step "Done"
bold "Staging host ready. Now run:  ./deploy.sh staging"
echo "DNS may take a minute to propagate the first time."
