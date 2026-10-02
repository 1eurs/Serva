# Serva MCP

An [MCP](https://modelcontextprotocol.io) server that gives an AI assistant everything a
**café owner** can do — nothing more.

It doesn't reimplement any business logic or touch the database. It calls the same REST API the
dashboard uses, authenticating with a scoped **API key** (preferred) or the owner's login. So the
AI is bound by the owner's own permissions, enforced server-side: if the account can't do it,
neither can the AI — and a **read-only key** can't write at all.

## Tools

One tool per business area; each takes an `action`. 15 tools, ~110 actions.

| Tool | Covers | Key actions |
|------|--------|-------------|
| `serva_account` | Who the MCP is acting as; account security | `me`, `update_profile`, `change_password`†, `change_email`†, `logout`† |
| `serva_orders` | Live board, order flow, payments | `list`, `live`, `get`, `create`, `accept`, `decline`, `ready`, `complete`, `mark_paid`, `split`, `qr_activity`, `cancel`†, `mark_failed`† |
| `serva_menu` | Categories & items | `list_*`, `get_item`, `create_*`, `update_*`, `set_availability`, `delete_category`†, `delete_item`† |
| `serva_stock` | The shelf, recipes, usage | `list`, `create`, `update`, `receive`, `count`, `usage`, `rules`, `set_rule`, `recipes`, `set_recipe`, `delete`† |
| `serva_till` | The cash drawer | `status`, `open`, `close`, `sessions` |
| `serva_analytics` | Every dashboard insight (incl. Pro) | `today`, `orders`, `best_selling`, `daily`, `daypart`, `payment_methods`, `item_conversion`, `market_basket`, `staff`, `funnel`, `kitchen_timing`, `forecast`, `customers`, `customer_base`, `customer_directory`, `benchmark` |
| `serva_tables` | Tables & QR codes | `list`, `create`, `update`, `regenerate_qr`, `delete`† |
| `serva_staff` | Team & invites | `list`, `create`, `update`, `set_branch`, `activate`, `invite`, `invites_list`, `invite_resend`, `deactivate`†, `invite_revoke`† |
| `serva_loyalty` | Stamp-card program | `get_program`, `update_program`, `branch_activity`, `members` |
| `serva_coupons` | Per-item discount codes | `list`, `suggest`, `lookup`, `create`, `update`, `delete`† |
| `serva_customers` | Blocked phones | `list`, `block`, `unblock` |
| `serva_restaurant` | Profile, look, plan, branches | `get`, `update`, `update_theme`, `update_menu_info`, `update_receipt`, `subscription`, `features`, `branches`, `branch_create`, `branch_update`, `branch_activate`, `branch_deactivate`† |
| `serva_reports` | End-of-day report | `daily` (saves a PDF, returns the path) |
| `serva_uploads` | Image uploads | `upload_menu_image`, `upload_logo` (local file → hosted URL) |
| `serva_print` | Print-station queue | `pending`, `pull`, `enqueue`, `station`, `ack` |

† **Destructive** — refused unless the server is started with `SERVA_ALLOW_DESTRUCTIVE=1`.
`change_password`/`change_email` change the *owner's own* login — the credentials this MCP
authenticates with — so after using them you must update `SERVA_USERNAME`/`SERVA_PASSWORD`.

### The only thing not exposed

The two Server-Sent-Event streams (`orders/stream`, `qr-activity/stream`) aren't tools: a tool
call returns once and can't hold a live stream open. Their point-in-time equivalents are covered
by `serva_orders action=live` and `serva_orders action=qr_activity`. Everything else an owner's
permissions can reach is a tool.

## Setup

```bash
cd mcp
npm install
npm run build
```

Configure via environment (see `.env.example`):

| Var | Default | Meaning |
|-----|---------|---------|
| `SERVA_API_BASE` | `http://localhost:8080` | Backend base URL |
| `SERVA_API_KEY` | — | **Preferred.** A scoped, revocable key (`serva_sk_…`). When set, username/password are ignored |
| `SERVA_USERNAME` / `SERVA_PASSWORD` | — | Fallback auth (owner login) if no key is set |
| `SERVA_ALLOW_DESTRUCTIVE` | `0` | `1` to allow deletes / deactivations / cancels. Moot with a read-only key |
| `SERVA_REPORT_DIR` | OS temp dir | Where `serva_reports` writes the PDF |

### Authentication — use an API key

A key is the safe way to hand this to an AI: no owner password on disk, revocable on its own, and
a **read-only** key is refused by the server for *any* write (every non-GET → 403), so the agent
can read the whole café and change nothing. Mint one as the owner:

```bash
# owner logs in once to mint; the key is shown only in this response
curl -sX POST "$SERVA_API_BASE/api/dashboard/api-keys" \
  -H "Authorization: Bearer <owner-jwt>" -H 'content-type: application/json' \
  -d '{"label":"My AI","scope":"READ_ONLY"}'          # or "FULL" for read+write
# → { "data": { "key": "serva_sk_…" } }   ← put this in SERVA_API_KEY
```

List (`GET /api/dashboard/api-keys`) shows label, scope, last-4 and last-used — never the key.
Revoke with `DELETE /api/dashboard/api-keys/{id}`; the key stops working immediately.

## Wiring it into a client

**Claude Code:**

```bash
claude mcp add serva \
  --env SERVA_API_BASE=https://serva.om \
  --env SERVA_API_KEY=serva_sk_... \
  -- node /home/m7m2od/Serva/mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "serva": {
      "command": "node",
      "args": ["/home/m7m2od/Serva/mcp/dist/index.js"],
      "env": {
        "SERVA_API_BASE": "https://serva.om",
        "SERVA_API_KEY": "serva_sk_..."
      }
    }
  }
}
```

The transport is stdio, so the AI client launches the server itself — nothing to keep running.

## Running against staging

Staging uses the repo's seeded demo owner (`owner@mutrah.coffee` / café *Mutrah Coffee*),
created/refreshed by `npm run seed:staging`. Those are public demo credentials, so they live
in the committed `.env.staging`.

```bash
# manual run (Node loads the env file natively — no dotenv dep)
npm run start:staging

# or wire it into an MCP client, pointed at the staging env file
claude mcp add serva-staging -- \
  node --env-file=/home/m7m2od/Serva/mcp/.env.staging /home/m7m2od/Serva/mcp/dist/index.js
```

Destructive actions are off in `.env.staging` — staging is shared. This is *config pointed at
staging*, not a server-side deployment: the client still launches `dist/index.js` locally.

## Notes

- **Branch scope.** Branch-scoped tools default to the account's own branch. If the owner
  isn't pinned to one branch, pass `branchId` (list them with `serva_restaurant action=branches`).
  The AI can orient itself any time with `serva_account action=me`.
- **Errors** come back as the backend's own message + `errorCode`, as tool errors — never crashes.
- **Auth.** With an API key the key is sent as the bearer directly (no login, no refresh); a
  revoked key surfaces as a clean error. With a username/password the server logs in and
  refreshes the JWT on a 401, like the dashboard's `api.ts`. A key is preferred — nothing to
  rotate by hand, and a read-only one can't write.
