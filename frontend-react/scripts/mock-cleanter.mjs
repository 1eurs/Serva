/**
 * A stand-in for the Cleanter bridge, so the printing path can be worked on without an
 * Android tablet, a Bluetooth printer, or a roll of paper.
 *
 *   node scripts/mock-cleanter.mjs            # then open the dashboard on THIS machine
 *
 * It speaks the same HTTP contract the real app does (localhost:9100, /health, /print,
 * /jobs) and — the point of it — writes every receipt it is sent to scripts/.mock-prints/
 * as a PNG. That file is exactly the image the thermal head would have burned, so you can
 * look at a receipt instead of guessing: wrong margins, clipped Arabic, a logo that
 * binarised to mud, all visible without hardware.
 *
 * What it CANNOT tell you, because it replaces the two links in the chain that only
 * hardware can answer: whether Cleanter's own JSON→ESC/POS conversion renders our PNG the
 * way we expect, and whether the printer's head prints it dark enough. Those need paper.
 *
 * Chrome only allows a page to reach localhost from a page that is itself local (a dev
 * server on 127.0.0.1) or from an https:// page whose Local Network Access permission the
 * user granted. Against `npm run dev` there is no gate at all, which is why this is a
 * development tool and not a substitute for testing the permission flow on a real phone.
 *
 * Failure modes are switchable at runtime, because the guide's error states are the half
 * of this feature nobody can test by being lucky:
 *   curl localhost:9100/__mode/ok         printer answers, receipts print
 *   curl localhost:9100/__mode/offline    503 bluetooth_disabled, printer reports a problem
 *   curl localhost:9100/__mode/unpaired   503 printer_not_paired
 *   curl localhost:9100/__mode/legacy     an old build with no /jobs — exercises the fallback
 *   curl localhost:9100/__mode            what mode is it in, and what has it printed
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 9100;
const OUT_DIR = new URL('./.mock-prints/', import.meta.url).pathname;
const MODES = {
  ok: null,
  offline: { error: 'bluetooth_disabled', detail: 'Bluetooth is switched off.', fix: 'Turn Bluetooth on, then print again.' },
  unpaired: { error: 'printer_not_paired', detail: 'The selected printer is no longer paired.', fix: 'Pair the printer again in Android settings.' },
  legacy: null, // prints, but answers 404 on /jobs like a pre-1.3.0 build
};

let mode = 'ok';
const printed = [];
mkdirSync(OUT_DIR, { recursive: true });

/* The real app answers the older Private Network Access preflight; without these headers
   the browser never sends the actual request and the failure looks like "not installed". */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Private-Network': 'true',
};
const json = (res, status, body) => {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
};

/** Width and height live at fixed offsets in a PNG's IHDR — enough to report the size we
 *  were sent without pulling in an image library. */
const pngSize = (base64) => {
  const buf = Buffer.from(base64, 'base64');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
};

const savePrint = (body, path) => {
  const image = body.content?.find((block) => block.type === 'image');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = (body.reference ?? 'receipt').replace(/[^\w#-]+/g, '_');
  const record = {
    at: new Date().toISOString(), path, mode,
    paperWidth: body.paperWidth ?? '(app default)',
    reference: body.reference ?? null,
    cut: body.cut !== false,
    blocks: body.content?.map((b) => b.type) ?? [],
  };
  if (image?.base64) {
    const file = join(OUT_DIR, `${stamp}_${label}.png`);
    writeFileSync(file, Buffer.from(image.base64, 'base64'));
    Object.assign(record, pngSize(image.base64), { file, dither: image.dither });
  }
  printed.unshift(record);
  const size = record.width ? `${record.width}x${record.height}` : 'no image';
  console.log(`${path}  ${record.reference ?? ''}  ${record.paperWidth}mm  ${size}  ${record.file ?? ''}`);
  return record;
};

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    const asMode = pathname.match(/^\/__mode\/(\w+)$/);
    if (asMode) {
      if (!(asMode[1] in MODES)) return json(res, 400, { error: 'unknown mode', modes: Object.keys(MODES) });
      mode = asMode[1];
      console.log(`\n-- mode: ${mode}\n`);
      return json(res, 200, { mode });
    }
    if (pathname === '/__mode') return json(res, 200, { mode, modes: Object.keys(MODES), printedCount: printed.length, printed: printed.slice(0, 10) });

    if (pathname === '/health') {
      const problem = MODES[mode];
      return json(res, 200, {
        status: 'ok',
        version: mode === 'legacy' ? '1.2.0' : '1.5.0',
        printer: problem
          ? { connected: false, address: '00:11:22:33:44:55', problem: problem.error }
          : { connected: true, name: 'Mock BT Printer', address: '00:11:22:33:44:55' },
      });
    }

    if (pathname === '/print' || pathname === '/jobs') {
      // Pre-1.3.0 builds have no queue endpoint; the client must fall back to /print.
      if (pathname === '/jobs' && mode === 'legacy') return json(res, 404, { error: 'not_found' });
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad_json' }); }
      if (!Array.isArray(body.content)) return json(res, 400, { error: 'invalid_request', detail: 'content must be an array' });
      const problem = MODES[mode];
      if (problem) {
        console.log(`${pathname}  refused: ${problem.error}`);
        return json(res, 503, problem);
      }
      savePrint(body, pathname);
      return pathname === '/jobs'
        ? json(res, 202, { status: 'queued', jobId: `mock-${printed.length}`, statusUrl: `/jobs/mock-${printed.length}` })
        : json(res, 200, { status: 'printed', jobId: `mock-${printed.length}` });
    }

    json(res, 404, { error: 'unknown_endpoint' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock Cleanter listening on http://localhost:${PORT}  (mode: ${mode})`);
  console.log(`receipts are written to ${OUT_DIR}\n`);
});
