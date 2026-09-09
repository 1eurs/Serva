#!/usr/bin/env node
/**
 * Print a receipt without a printer, and look at what the head would have burned.
 *
 * Drives the real thing end to end — /print/render in a real browser, the real rasteriser,
 * the real ESC/POS over a real socket — with fake-printer.mjs standing in for the hardware.
 * Nothing here re-implements any part of the pipeline, so what lands on disk is what a café
 * would tear off the roll, minus only how dark the head burns it.
 *
 *   node fake-printer.mjs &            # the printer
 *   node render-check.mjs              # the receipt
 *
 *   BASE=https://serva.om node render-check.mjs      # check what production renders
 *   STYLE=retro LANG=en node render-check.mjs        # a style / an English-only slip
 *   PAPER=58 node render-check.mjs                   # the narrow roll
 *
 * The sample order is deliberately awkward: bilingual names, a note, a long line, four
 * items, VAT — the things that break at 203dpi. Zoom the PNG to 8x before judging: what
 * matters is whether the counters of the glyphs and the gaps in the rial symbol survived
 * being crushed to one bit.
 */
import { chromium } from 'playwright-core';
import { connect } from 'node:net';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const PRINTER_HOST = process.env.PRINTER_HOST ?? '127.0.0.1';
const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100);
const PAPER = Number(process.env.PAPER ?? 80) === 58 ? 58 : 80;

const order = {
  id: 1, orderNumber: 'ORD-20260908-0042', dailyNumber: 42, trackingToken: 't',
  restaurantId: 1, branchId: 1, tableId: 5, customerName: 'Ahmed', orderType: 'DINE_IN',
  status: 'COMPLETED', paymentStatus: 'PAID', paymentMethod: 'CASH',
  subtotal: 7.15, vatAmount: 0.36, total: 7.51,
  items: [
    { nameEn: 'Cappuccino', nameAr: 'كابتشينو', quantity: 2, price: 1.3, lineTotal: 2.6, note: 'Extra hot, oat milk' },
    { nameEn: 'Spanish Latte', nameAr: 'سبانيش لاتيه', quantity: 1, price: 1.65, lineTotal: 1.65 },
    { nameEn: 'Cheesecake slice', nameAr: 'شريحة تشيز كيك', quantity: 1, price: 1.8, lineTotal: 1.8 },
    { nameEn: 'Still water 500ml', nameAr: 'ماء 500 مل', quantity: 2, price: 0.55, lineTotal: 1.1 },
  ],
  createdAt: new Date().toISOString(),
};
const restaurant = {
  id: 1, nameEn: 'Serva Café', nameAr: 'مقهى سيرفا', vatEnabled: true, vatRate: 5,
  phone: '+968 9123 4567',
  receiptSettingsJson: JSON.stringify({
    style: process.env.STYLE ?? 'classic',
    language: process.env.LANG === 'en' ? 'en' : 'bilingual',
    footerText: 'Thank you · شكراً\n@serva.om',
  }),
};

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text()); });
await page.goto(`${BASE}/print/render`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.servaRenderReady === true, null, { timeout: 20_000 });

const started = Date.now();
const result = await page.evaluate(
  async (req) => await window.servaRenderJob(req),
  { order, restaurant, tableNumber: '5', paperWidth: PAPER },
);
await browser.close();
if (!result.ok) { console.error('render failed:', result.error); process.exit(1); }
console.log(`rendered ${result.width}x${result.height} in ${Date.now() - started}ms`);

await new Promise((resolve, reject) => {
  const s = connect(PRINTER_PORT, PRINTER_HOST, () => { s.write(Buffer.from(result.base64, 'base64')); s.end(); });
  s.on('close', resolve);
  s.on('error', (e) => reject(new Error(`no printer on ${PRINTER_HOST}:${PRINTER_PORT} — start fake-printer.mjs (${e.message})`)));
});
console.log('sent to the printer — the PNG it wrote is the slip');
