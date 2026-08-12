/**
 * Seeds the yield number — "one pack makes about N servings" — on the demo café.
 *
 * This is the half of the promise that says "you know your cup cost". A gram-level
 * bill of materials is correct and nobody fills it in; how far a pack goes is the same
 * fact, said the way the trade says it, and it is one guess per item instead of five
 * numbers per dish.
 *
 * Run after seed-stock.mjs. Safe to re-run — it only PATCHes the yield.
 *
 *   node scripts/seed-yield.mjs
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

/* What a café would actually answer, standing at the machine. Rough on purpose — the
   whole argument for this number is that a rough answer beats an unanswered recipe. */
const YIELD = {
  'Espresso beans': 55,      // 1 kg bag ≈ 55 drinks at ~18 g
  'Fresh milk': 10,          // 2 L carton ≈ 10 lattes at ~200 ml
  'Oat milk': 5,             // 1 L carton ≈ 5 drinks
  'Cardamom': 125,           // 250 g pack, ~2 g a cup
  'Saffron': 66,             // 10 g tin, a pinch a cup
  'Date syrup': 18,          // 750 ml jar, ~40 ml a serving
  'Takeaway cup 8oz': 50,    // a sleeve is 50 cups
  'Cup lid 8oz': 50,
  'Takeaway cup 12oz': 50,
  'Paper napkins': 200,
  'Croissant': 24,           // a tray of 24 is 24 servings
  'Vanilla syrup': 37,       // 750 ml, ~20 ml a drink
  'Rose water': 100,         // 500 ml, ~5 ml a drink
  'Pistachio spread': 33,    // 1 kg tub, ~30 g a serving
};

async function main() {
  const login = await api('/api/auth/login', { method: 'POST', body: OWNER });
  if (!login.ok) throw new Error('owner login failed: ' + JSON.stringify(login.env));
  token = login.data.accessToken;

  const items = (await api('/api/dashboard/stock/items?branchId=1')).data ?? [];
  let set = 0;
  for (const item of items) {
    const servings = YIELD[item.nameEn];
    if (!servings) { console.log('• no yield defined: ' + item.nameEn); continue; }
    /* PATCH takes the whole item, so echo back what is already there and change one field. */
    const r = await api(`/api/dashboard/stock/items/${item.id}`, {
      method: 'PATCH',
      body: {
        nameEn: item.nameEn, nameAr: item.nameAr, kind: item.kind, baseUnit: item.baseUnit,
        purchaseUnitLabel: item.purchaseUnitLabel, purchaseUnitSize: item.purchaseUnitSize,
        costPerBaseUnit: item.costPerBaseUnit, wastePct: item.wastePct,
        batchYieldBase: item.batchYieldBase, category: item.category,
        countFrequency: item.countFrequency, allergens: item.allergens,
        supplierId: item.supplierId, servingsPerPack: servings,
      },
    });
    if (!r.ok) { console.log('✗ ' + item.nameEn + ': ' + JSON.stringify(r.env).slice(0, 140)); continue; }
    set++;
    const d = r.data;
    const cost = d.servingCost != null ? Number(d.servingCost).toFixed(4) : '—';
    console.log(`✓ ${item.nameEn.padEnd(20)} ${servings} per pack → ${d.servingQuantityBase} ${item.baseUnit.toLowerCase()} · ${cost} OMR a serving`);
  }

  console.log('\n──────────── YIELDS READY ────────────');
  console.log('yields set : ' + set + ' of ' + items.length);
  console.log('Now open Menu → any drink → Stock & recipe → tick what is in it.');
}

main().catch((e) => { console.error('seed-yield failed:', e.message); process.exit(1); });
