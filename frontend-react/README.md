# Serva. — Frontend (React)

Production-style React app for all three Serva. surfaces, in the **Onyx** dark theme,
RTL/Arabic-first with an EN toggle, wired to the **real Spring Boot API**.

- **App A — Customer** (`/r/:slug/b/:branchId/t/:tableToken`, `/cart`, `/order/:trackingToken`)
- **App B — Serva. dashboard / KDS** (`/dashboard`)
- **App C — Platform admin** (`/admin`)

## Stack
Vite + React + TypeScript · React Router · TanStack Query · Zustand (cart) ·
lightweight i18n context · native `EventSource` for SSE. No CORS needed — the Vite
dev server proxies `/api` and `/files` to `http://localhost:8080`.

## Run

```bash
# 1) backend must be up on :8080 (docker compose up -d from the repo root)
# 2) seed demo data through the real API (idempotent)
npm install
npm run seed      # prints the demo slug / branch / table token + logins

# 3) start the app
npm run dev       # http://localhost:5173
```

## Load test

Hits the real Spring API the way a Friday rush does — public menu, presence, QR
orders, customer + kitchen SSE, live board, staff pad, print-station pull, a
daily stock cap, and extra tenant cafés. Open the dashboard in a browser while
it runs; a green report with no board is only half a test.

```bash
# backend on :8080, demo café seeded
npm run loadtest          # every scenario (~2–4 min)
npm run loadtest:quick    # shorter timings
node scripts/load-test.mjs rush      # one scenario
node scripts/load-test.mjs soak|backlog|stock|ceiling|tenants
```

`API_BASE`, `CUSTOMERS`, `DURATION_S`, `TENANTS`, `CEILING_VUS` override defaults.
Orders stay in the database. Tenants reuse `loadtest-cafe-N` / `loadtestN@serva.local`.

Against **staging** (same routes as prod, log-only email/SMS, empty DB). From the repo root or `frontend-react/`:

```bash
npm run seed:staging
npm run loadtest:staging
```

Production (`https://serva.om`) is refused. A rush against Mutrah would land
real tickets on a live board and the ceiling scenario can stall every café on
the box (Hikari pool is 10). There is no safe default for that.

Open `http://localhost:5173/` for the launcher (links to all three apps + demo logins).

## Demo logins (dev)
- Owner (dashboard): `owner@mutrah.coffee` / `Owner123!`
- Platform admin: `admin@cafeqr.local` / `Admin123!`

If you reset the DB or regenerate the QR, re-run `npm run seed` and update
`src/lib/demo.ts` with the printed table token.

## Where things live
```
src/lib/        api client (envelope + JWT refresh), types, i18n, cart, sse, auth, format
src/features/customer   App A  (MenuPage / CartPage / TrackPage)
src/features/dashboard  App B  (KDS board + order actions)
src/features/admin      App C  (restaurants + subscriptions)
src/features/auth       shared login
scripts/seed.mjs        demo data seeder (uses the real API)
scripts/load-test.mjs   rush / soak / backlog / stock / ceiling / tenants
```

Every network call goes through `src/lib/api.ts`; search for endpoint paths to trace
a screen to its backend route.
