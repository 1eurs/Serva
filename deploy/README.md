# Deploying Serva

Two environments, one artifact.

```
                    ./deploy.sh staging          ./deploy.sh prod
  working tree  ─────────────────────────▶  Pi  ──────────────────────▶  Hetzner VPS
                                    staging.serva.om              serva.om
```

## The one rule

**The jar is built once, on your Mac, and both hosts run that exact file.**

`./deploy.sh staging` builds. `./deploy.sh prod` does **not** — it ships `target/app.jar`
as it stands, because that is the file staging tested. A Spring Boot jar is not
reproducible (timestamps land in the manifest and in every entry), so rebuilding from
identical source yields a different fingerprint, and a promote that rebuilt could never
match. If you edit code after testing, prod warns you that your edits are not in the
artifact and tells you to run `staging` again.

Before this, each host ran its own Maven build. Two hosts, two builds, two binaries — so
"it worked on staging" was a statement about a *different* binary that happened to come
from the same directory. `deploy.sh prod` now refuses to ship a build that staging has not
seen, by comparing a fingerprint of the jar and the frontend bundle against the one the Pi
recorded when it last passed its smoke test.

Java bytecode does not care that the Pi is arm64 and the VPS is x86_64. Only the base
image differs, and each host pulls its own.

## Everyday use

```bash
./deploy.sh staging     # build, ship to the Pi, smoke-test staging.serva.om
                        # ... go test it by hand ...
./deploy.sh prod        # ship that same build to serva.om
./deploy.sh status      # what each environment is running
```

`./deploy.sh prod --force` skips the staging check. It says so loudly when you use it.

## What the smoke test actually checks

A 200 from `/actuator/health` proves the JVM started and nothing else. After every deploy:

| check | catches |
|---|---|
| schema is at the newest `V*.sql` in the tree | a migration that silently did not run |
| `/` returns 200 | nginx up, files in the right place |
| the served `index.html` points at **this build's** hashed bundle | a stale bundle, a half-finished rsync |
| `/api/dashboard/features` returns **401** | backend unreachable (000), or up-but-broken behind a web server that is fine (502) |

Staging is only recorded as tested if all four pass.

## First-time setup

```bash
./deploy/bootstrap-staging.sh
```

Creates the `serva-staging` Cloudflare tunnel, its systemd service on the Pi, and a
`.env.staging` with freshly generated secrets. Safe to re-run — it never overwrites
secrets that already exist.

If the script says **DNS NOT SET**, your `~/.cloudflared/cert.pem` is scoped to a zone
other than `serva.om`. Run `cloudflared tunnel login` and pick `serva.om`, then re-run.

## How staging differs from production, and why

| | production | staging | why |
|---|---|---|---|
| profile | `prod` | `staging` | same logging and SQL settings as prod — a staging box that logs every statement is slower than the thing it is testing, and hides timing bugs |
| admin | created once over HTTP | seeded `admin@cafeqr.local` / `Admin123!` | the DB starts empty by design, and prod's one-shot registration endpoint would need redoing by hand every reset |
| email / SMS | Brevo, Infobip | `log` — written, never sent | staging must not mail a real café |
| JWT secret | prod's | its own, generated | a shared secret means a token minted on the Pi is valid against the real site |
| database | real | empty | no customer data leaves the VPS |
| memory | 1GB heap, no cap | 512MB heap, hard caps | the Pi also runs mizan-demo; the caps are a fence, so a staging leak kills a staging container rather than someone else's Keycloak |
| TLS | nginx + Certbot on the host | terminated by the tunnel | the Pi has no public IP; cloudflared is the only way in |
| robots | indexable | `noindex` + `Disallow: /` | same product on the same registered domain — a crawler that finds staging will rank it against the real site |

## Rolling staging back to nothing

```bash
ssh pi "cd /home/pi/serva-staging/deploy && \
  docker compose --env-file .env.staging -p serva-staging down -v"
```

`-v` drops the database volume too, which is the point: the next deploy re-runs every
migration from V1 on an empty schema. That is the cheapest way to find out whether a
fresh install still works, and it is a thing production can never tell you.
