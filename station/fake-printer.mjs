#!/usr/bin/env node
/**
 * A thermal printer that exists only to be looked at.
 *
 * Listens on 9100 like the real thing, answers the ESC/POS real-time status channel like the
 * real thing, decodes the raster it is sent and writes it back out as a PNG — so "the bytes
 * arrived" can be checked against "and they were the right receipt". Enough of a printer that
 * Serva Station cannot tell the difference: the scanner finds it, the pick list says it
 * answered as a printer, the test slip prints, and tickets come out as images.
 *
 *   node fake-printer.mjs                 # then point a phone or tablet at this machine
 *
 * Failure modes, which are the half of printing nobody can test by being lucky:
 *   PAPER=out   node fake-printer.mjs     # roll finished — the app must refuse to print
 *   PAPER=dumb  node fake-printer.mjs     # a clone that ignores the status channel entirely
 *   PORT=9101   node fake-printer.mjs     # exercise the fallback ports the scan tries
 *
 * What it CANNOT tell you, because these are the two links only hardware answers: whether the
 * head burns the 1-bit raster dark enough, and whether the paper actually cuts. Those need paper.
 */
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 9100);
const OUT = process.env.OUT ?? new URL('./.fake-prints/', import.meta.url).pathname;
// PAPER=out answers "roll finished"; PAPER=dumb ignores the status channel, the way a lot of
// cheap clones do — the app must treat silence as unknown, never as a fault.
const PAPER = process.env.PAPER ?? 'ok';
mkdirSync(OUT, { recursive: true });
let n = 0;

const CRC = (() => { const t = new Int32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; } return t; })();
const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** 8-bit greyscale PNG from a 1-bit-per-pixel MSB-first raster. */
function png(raster, width, height, bytesPerRow) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const bit = (raster[y * bytesPerRow + (x >> 3)] >> (7 - (x & 7))) & 1;
      raw[y * (width + 1) + 1 + x] = bit ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function decode(buf) {
  const seen = { init: false, cut: false, feed: 0, raster: null, trailing: 0 };
  let i = 0;
  while (i < buf.length) {
    if (buf[i] === 0x1b && buf[i + 1] === 0x40) { seen.init = true; i += 2; continue; }               // ESC @
    if (buf[i] === 0x1b && buf[i + 1] === 0x64) { seen.feed += buf[i + 2]; i += 3; continue; }        // ESC d n
    if (buf[i] === 0x1d && buf[i + 1] === 0x56) { seen.cut = true; i += buf[i + 2] >= 0x41 ? 4 : 3; continue; } // GS V
    if (buf[i] === 0x1d && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) {                              // GS v 0
      const bytesPerRow = buf.readUInt16LE(i + 4), height = buf.readUInt16LE(i + 6);
      const start = i + 8, size = bytesPerRow * height;
      seen.raster = { data: buf.subarray(start, start + size), bytesPerRow, height, width: bytesPerRow * 8 };
      i = start + size; continue;
    }
    seen.trailing++; i++;
  }
  return seen;
}

const at = () => new Date().toISOString().slice(11, 19);

createServer((socket) => {
  const from = socket.remoteAddress?.replace('::ffff:', '') ?? '?';
  const parts = [];
  let statusAsks = 0;
  socket.on('data', (d) => {
    // DLE EOT n — real-time status. Answered inline and NOT added to the job, exactly as a
    // printer does, so the app can tell a printer from anything else sitting on this port.
    // Every frame in the packet has to go: the app asks twice in a row, and TCP is free to
    // deliver both asks as one read.
    let keepFrom = 0;
    for (let i = 0; i + 2 < d.length; i++) {
      if (d[i] !== 0x10 || d[i + 1] !== 0x04) continue;
      if (i > keepFrom) parts.push(d.subarray(keepFrom, i));
      statusAsks++;
      if (PAPER !== 'dumb') {
        // Fixed bits 1 and 4 are in every status byte; the rest is the answer.
        let b = 0x12;
        if (d[i + 2] === 4 && PAPER === 'out') b |= 0x60;   // both roll-end bits: paper gone
        if (d[i + 2] === 1 && PAPER === 'out') b |= 0x08;   // ...which also means offline
        socket.write(Buffer.from([b]));
      }
      i += 2;
      keepFrom = i + 1;
    }
    if (keepFrom < d.length) parts.push(d.subarray(keepFrom));
  });
  socket.on('end', () => {
    const buf = Buffer.concat(parts);
    // A connection carrying no job is the scan, or the check before a print. Say so — "did the
    // phone reach this machine at all" is the question a failed setup actually needs answered.
    if (!buf.length) {
      console.log(statusAsks
        ? `${at()} ${from} asked how I am, ${PAPER === 'dumb' ? 'ignored it (dumb clone)' : `told it: ${PAPER}`}`
        : `${at()} ${from} connected and said nothing — a port probe, which is what the scan does first`);
      return;
    }
    const d = decode(buf);
    n++;
    let file = null;
    if (d.raster) {
      file = `${OUT}/${Date.now()}-${String(n).padStart(3, '0')}.png`;  // restart-safe
      writeFileSync(file, png(d.raster.data, d.raster.width, d.raster.height, d.raster.bytesPerRow));
    }
    console.log(`${at()} ${from} printed #${n}: ${JSON.stringify({ bytes: buf.length, init: d.init, cut: d.cut, feed: d.feed,
      raster: d.raster ? `${d.raster.width}x${d.raster.height}` : null, unknownBytes: d.trailing })}`);
    if (file) console.log(`         → ${file}`);
  });
  socket.on('error', () => {});
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`fake printer listening on ${PORT} (paper: ${PAPER}), receipts → ${OUT}`);
  console.log(lan.length
    ? `point Serva Station at: ${lan.join(' or ')}   — the scan should find it by itself`
    : 'no LAN address found — a phone on the WiFi will not be able to reach this machine');
});
