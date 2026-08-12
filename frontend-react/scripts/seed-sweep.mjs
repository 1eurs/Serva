/**
 * Seeds the shelf sweep's untested half.
 *
 * seed-stock.mjs leaves every item with a par level and a reorder point already set,
 * which is the state a café reaches AFTER someone has configured it. The sweep's whole
 * argument is that nobody ever does that — so the path that matters most is the one
 * where an item has no par at all and the first sweep asks "how much do you keep when
 * this is fully stocked?" while you are standing in front of the shelf.
 *
 * This adds the things a café adds later, off an invoice, and never gets round to
 * configuring: no levels, no stock on hand. Run it after seed-stock.mjs and the demo
 * account then exercises every state the sweep can be in:
 *
 *   Espresso beans / Fresh milk   par set, well stocked   → drag the gauge
 *   Oat milk                      par set, near reorder   → drag across the notch
 *   Cup lid 8oz                   par set, below reorder  → already on the order list
 *   everything below              no par at all           → the par question, then the gauge
 *
 *   node scripts/seed-sweep.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:8080';
const OWNER = { username: 'owner@mutrah.coffee', password: 'Owner123!' };

let token = null;
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const env = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: env?.data ?? env, env };
}

/* Deliberately no par / reorder and no opening delivery: these are the items the sweep
   has to configure by itself. Categories are real ones from the seeded set so the sweep
   walks them in a believable stockroom order. */
const UNCONFIGURED = [
  { nameEn: 'Pistachio spread', nameAr: 'معجون فستق',   kind: 'INGREDIENT', baseUnit: 'G',     purchaseUnitLabel: '1 kg tub',      purchaseUnitSize: 1000, costPerBaseUnit: 0.0140, category: 'Pantry' },
  { nameEn: 'Vanilla syrup',    nameAr: 'شراب فانيلا',  kind: 'INGREDIENT', baseUnit: 'ML',    purchaseUnitLabel: '750 ml bottle', purchaseUnitSize: 750,  costPerBaseUnit: 0.0021, category: 'Pantry' },
  { nameEn: 'Rose water',       nameAr: 'ماء ورد',      kind: 'INGREDIENT', baseUnit: 'ML',    purchaseUnitLabel: '500 ml bottle', purchaseUnitSize: 500,  costPerBaseUnit: 0.0026, category: 'Pantry' },
  { nameEn: 'Takeaway cup 12oz', nameAr: 'كوب سفري ١٢', kind: 'GOOD',       baseUnit: 'PIECE', purchaseUnitLabel: 'sleeve of 50',  purchaseUnitSize: 50,   costPerBaseUnit: 0.0310, category: 'Packaging' },
  { nameEn: 'Paper napkins',    nameAr: 'مناديل ورقية', kind: 'GOOD',       baseUnit: 'PIECE', purchaseUnitLabel: 'pack of 200',   purchaseUnitSize: 200,  costPerBaseUnit: 0.0009, category: 'Packaging' },
  { nameEn: 'Croissant',        nameAr: 'كرواسون',      kind: 'GOOD',       baseUnit: 'PIECE', purchaseUnitLabel: 'tray of 24',    purchaseUnitSize: 24,   costPerBaseUnit: 0.1900, category: 'Bakery' },
];

async function main() {
  const login = await api('/api/auth/login', { method: 'POST', body: OWNER });
  if (!login.ok) throw new Error('owner login failed: ' + JSON.stringify(login.env));
  token = login.data.accessToken;
  const rid = login.data.user?.restaurantId ?? login.data.restaurantId ?? 1;

  const branches = await api(`/api/restaurants/${rid}/branches`);
  const blist = branches.data?.content ?? branches.data ?? [];
  const branchId = blist[0]?.id;
  if (!branchId) throw new Error('no branch found');
  console.log('✓ owner logged in · branch #' + branchId);

  const existing = await api(`/api/dashboard/stock/items?branchId=${branchId}`);
  const have = new Set((existing.data ?? []).map((i) => i.nameEn));

  let added = 0;
  for (const it of UNCONFIGURED) {
    if (have.has(it.nameEn)) { console.log('• exists: ' + it.nameEn); continue; }
    const r = await api('/api/dashboard/stock/items', {
      method: 'POST',
      body: { ...it, wastePct: 0, allergens: [], branchId },
    });
    if (!r.ok) { console.log('✗ ' + it.nameEn + ': ' + JSON.stringify(r.env).slice(0, 160)); continue; }
    added++;
    console.log('✓ unconfigured: ' + it.nameEn);
  }

  /* Push oat milk under its reorder point so the sweep opens with something already
     on the order list — an empty order list makes the payoff screen unreadable. */
  const items = (await api(`/api/dashboard/stock/items?branchId=${branchId}`)).data ?? [];
  const oat = items.find((i) => i.nameEn === 'Oat milk');
  if (oat && oat.onHand > 2600) {
    await api('/api/dashboard/stock/waste', {
      method: 'POST',
      body: { branchId, stockItemId: oat.id, quantityBase: oat.onHand - 2600, reason: 'EXPIRED', note: 'Demo: opened cartons past date' },
    });
    console.log('✓ oat milk pushed near its reorder point');
  }

  const o = (await api(`/api/dashboard/stock/overview?branchId=${branchId}`)).data ?? {};
  /* `items` was re-fetched after the creates, so it already includes them — counting
     `added` on top of it would report every new item twice. */
  const unset = items.filter((i) => i.parLevel == null && i.reorderPoint == null).length;
  console.log('\n──────────── SWEEP READY ────────────');
  console.log('items total    : ' + items.length);
  console.log('no par set     : ' + unset + '  (these ask the par question first)');
  console.log('low / out      : ' + (o.lowCount ?? 0) + ' / ' + (o.outCount ?? 0));
  console.log('Open: /dashboard/stock  →  "Shelf sweep"');
}

main().catch((e) => { console.error('seed-sweep failed:', e.message); process.exit(1); });
