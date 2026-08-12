/**
 * Seeds a realistic stock setup for the Mutrah Coffee demo café, via the REAL API.
 *
 * The Stock feature is only legible once it has data — an empty inventory page can't
 * show you what it's for. This walks the whole chain the product expects:
 *
 *   1. items      what you buy      (beans, milk, cups…)  — base unit + purchase unit + cost
 *   2. levels     when to reorder   (alert threshold + restock target, per branch)
 *   3. receive    a delivery lands  — this is what actually puts stock on hand
 *   4. recipes    menu item → ingredients ("a Cortado is 18 g beans + 120 ml milk")
 *
 * After step 4 it runs itself: accepting an order draws stock automatically, and an item
 * whose ingredients ran out stops being sellable.
 *
 * Idempotent: skips any stock item whose English name already exists.
 *
 *   node scripts/seed-stock.mjs
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

/* base unit is the unit you COUNT in; purchase unit is how it arrives from the supplier */
const ITEMS = [
  { nameEn: 'Espresso beans',  nameAr: 'حبوب إسبريسو', kind: 'INGREDIENT', baseUnit: 'G',     purchaseUnitLabel: '1 kg bag',   purchaseUnitSize: 1000, costPerBaseUnit: 0.0085, category: 'Coffee', countFrequency: 'WEEKLY', par: 6000,  reorder: 2000, receive: 5000 },
  { nameEn: 'Fresh milk',      nameAr: 'حليب طازج',    kind: 'INGREDIENT', baseUnit: 'ML',    purchaseUnitLabel: '2 L carton', purchaseUnitSize: 2000, costPerBaseUnit: 0.0006, category: 'Dairy',  countFrequency: 'DAILY',  par: 24000, reorder: 8000, receive: 20000 },
  { nameEn: 'Oat milk',        nameAr: 'حليب شوفان',   kind: 'INGREDIENT', baseUnit: 'ML',    purchaseUnitLabel: '1 L carton', purchaseUnitSize: 1000, costPerBaseUnit: 0.0014, category: 'Dairy',  countFrequency: 'WEEKLY', par: 8000,  reorder: 3000, receive: 2500 },
  { nameEn: 'Cardamom',        nameAr: 'هيل',          kind: 'INGREDIENT', baseUnit: 'G',     purchaseUnitLabel: '250 g pack', purchaseUnitSize: 250,  costPerBaseUnit: 0.0180, category: 'Spice',  countFrequency: 'MONTHLY', par: 800,  reorder: 250,  receive: 600 },
  { nameEn: 'Saffron',         nameAr: 'زعفران',       kind: 'INGREDIENT', baseUnit: 'G',     purchaseUnitLabel: '10 g tin',   purchaseUnitSize: 10,   costPerBaseUnit: 1.9000, category: 'Spice',  countFrequency: 'MONTHLY', par: 40,    reorder: 12,   receive: 25 },
  { nameEn: 'Date syrup',      nameAr: 'دبس التمر',    kind: 'INGREDIENT', baseUnit: 'ML',    purchaseUnitLabel: '750 ml jar', purchaseUnitSize: 750,  costPerBaseUnit: 0.0032, category: 'Pantry', countFrequency: 'MONTHLY', par: 3000, reorder: 900,  receive: 700 },
  { nameEn: 'Takeaway cup 8oz', nameAr: 'كوب سفري ٨',  kind: 'GOOD',       baseUnit: 'PIECE', purchaseUnitLabel: 'sleeve of 50', purchaseUnitSize: 50, costPerBaseUnit: 0.0250, category: 'Packaging', countFrequency: 'WEEKLY', par: 600, reorder: 200, receive: 450 },
  { nameEn: 'Cup lid 8oz',     nameAr: 'غطاء كوب ٨',   kind: 'GOOD',       baseUnit: 'PIECE', purchaseUnitLabel: 'sleeve of 50', purchaseUnitSize: 50, costPerBaseUnit: 0.0120, category: 'Packaging', countFrequency: 'WEEKLY', par: 600, reorder: 200, receive: 120 },
];

/* menu item name → what one serving actually consumes */
const RECIPES = {
  'Cortado':            [['Espresso beans', 18], ['Fresh milk', 120]],
  'V60 Pour-over':      [['Espresso beans', 22]],
  'Iced Spanish Latte': [['Espresso beans', 18], ['Fresh milk', 200]],
  'Cardamom Coffee':    [['Espresso beans', 16], ['Cardamom', 2]],
  'Saffron Karak':      [['Fresh milk', 180], ['Saffron', 0.15], ['Cardamom', 1]],
  'Frankincense Latte': [['Espresso beans', 18], ['Fresh milk', 200]],
  'Luqaimat · Date Syrup': [['Date syrup', 40]],
};

async function main() {
  const login = await api('/api/auth/login', { method: 'POST', body: OWNER });
  if (!login.ok) throw new Error('owner login failed: ' + JSON.stringify(login.env));
  token = login.data.accessToken;
  const rid = login.data.user?.restaurantId ?? login.data.restaurantId ?? 1;
  console.log('✓ owner logged in');

  const branches = await api(`/api/restaurants/${rid}/branches`);
  const blist = branches.data?.content ?? branches.data ?? [];
  const branchId = blist[0]?.id;
  if (!branchId) throw new Error('no branch found');
  console.log('• branch #' + branchId);

  // 1) items -----------------------------------------------------------------
  const existing = await api(`/api/dashboard/stock/items?branchId=${branchId}`);
  const byName = new Map((existing.data ?? []).map((i) => [i.nameEn, i]));
  const ids = new Map();

  for (const it of ITEMS) {
    if (byName.has(it.nameEn)) {
      ids.set(it.nameEn, byName.get(it.nameEn).id);
      console.log('• exists: ' + it.nameEn);
      continue;
    }
    const r = await api('/api/dashboard/stock/items', {
      method: 'POST',
      body: {
        nameEn: it.nameEn, nameAr: it.nameAr, kind: it.kind, baseUnit: it.baseUnit,
        purchaseUnitLabel: it.purchaseUnitLabel, purchaseUnitSize: it.purchaseUnitSize,
        costPerBaseUnit: it.costPerBaseUnit, wastePct: 0, category: it.category,
        countFrequency: it.countFrequency, allergens: [], branchId,
      },
    });
    if (!r.ok) { console.log('✗ ' + it.nameEn + ': ' + JSON.stringify(r.env).slice(0, 160)); continue; }
    ids.set(it.nameEn, r.data.id);
    console.log('✓ item: ' + it.nameEn);
  }

  // 2) levels — the thresholds that make "low" and "out" mean something --------
  for (const it of ITEMS) {
    const id = ids.get(it.nameEn);
    if (!id) continue;
    await api(`/api/dashboard/stock/items/${id}/levels`, {
      method: 'PATCH',
      body: { branchId, parLevelBase: it.par, reorderPointBase: it.reorder },
    });
  }
  console.log('✓ levels set for ' + ids.size + ' items');

  // 3) receive — deliberately under-stocks lids and oat milk so the Today tab has
  //    something to actually show (lids land below their reorder point, oat milk near it)
  const lines = ITEMS.filter((it) => ids.get(it.nameEn))
    .map((it) => ({ stockItemId: ids.get(it.nameEn), quantityBase: it.receive, unitCost: it.costPerBaseUnit }));
  const rec = await api('/api/dashboard/stock/receive', {
    method: 'POST',
    body: { branchId, lines, note: 'Opening delivery (demo seed)' },
  });
  console.log(rec.ok ? '✓ received opening delivery' : '✗ receive failed: ' + JSON.stringify(rec.env).slice(0, 200));

  // 4) recipes — the step that makes the whole thing automatic -----------------
  const menu = await api('/api/menu/items?size=200');
  const mlist = menu.data?.content ?? menu.data ?? [];
  let linked = 0;
  for (const [name, parts] of Object.entries(RECIPES)) {
    const mi = mlist.find((m) => m.nameEn === name);
    if (!mi) continue;
    const recipeLines = parts
      .filter(([n]) => ids.get(n))
      .map(([n, q]) => ({ stockItemId: ids.get(n), quantityBase: q, orderTypeScope: 'ALL' }));
    if (!recipeLines.length) continue;
    const r = await api(`/api/dashboard/stock/menu-items/${mi.id}/recipe`, {
      method: 'PUT',
      body: { stockMode: 'RECIPE', lines: recipeLines, optionRecipes: [] },
    });
    if (r.ok) { linked++; console.log('✓ recipe: ' + name); }
    else console.log('✗ recipe ' + name + ': ' + JSON.stringify(r.env).slice(0, 160));
  }

  const overview = await api(`/api/dashboard/stock/overview?branchId=${branchId}`);
  const o = overview.data ?? {};
  console.log('\n──────────── STOCK READY ────────────');
  console.log('items          : ' + ids.size);
  console.log('recipes linked : ' + linked);
  console.log('inventory value: ' + (o.inventoryValue ?? '—'));
  console.log('low / out      : ' + (o.lowCount ?? 0) + ' / ' + (o.outCount ?? 0));
  console.log('Open: /dashboard/stock');
}

main().catch((e) => { console.error('seed-stock failed:', e.message); process.exit(1); });
