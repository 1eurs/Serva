/* Turning a rendered receipt into the bytes a thermal printer understands.
 *
 * Extracted from ReceiptCapture/printer so there is exactly one copy of it: the dashboard
 * uses it when a staff device prints, and the print-station page (features/print) uses it
 * when a headless station renders a job. Two renderers drifting apart is the failure this
 * module exists to prevent — a receipt that prints correctly from a tablet and wrongly from
 * the station app would be nearly impossible to diagnose from a café's description.
 *
 * Everything here is DOM-only (a canvas in, bytes out) and free of React, so it runs the
 * same inside a dashboard tab and inside an Android WebView. */

/** Printable dots across, by paper width. 8 dots/mm over the printable area: 72mm and 48mm. */
export const PAPER_DOTS: Record<80 | 58, number> = { 80: 576, 58: 384 };

// Sending a decoded PNG to a printing app lets its own image pipeline dither and lighten the
// slip — text printed dark on the same hardware, proving the printer was never the problem.
// So the canvas is reduced to pure black and white here and handed over with nothing left to
// reprocess.
const CONTRAST = 1.8;
const THRESHOLD = 185;

/** In place: hard-threshold to pure black/white, then thicken every stroke by one dot. */
export function binarizeCanvas(canvas: HTMLCanvasElement): void {
  // willReadFrequently: this reads the whole canvas back twice, which Chrome otherwise
  // does the slow way. Measurably cheaper on a counter tablet.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  // Pass 1: hard threshold (into a compact per-pixel mask).
  const black = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < black.length; p++, i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = 128 + (gray - 128) * CONTRAST;
    black[p] = boosted > THRESHOLD ? 0 : 1;
  }
  // Pass 2: 1px dilation (left + up neighbours). These printers fire raster graphics visibly
  // fainter than their built-in text font — one extra dot per stroke gives each glyph more
  // heated surface, which reads as darker print without touching hardware density.
  //
  // Except where that one dot is the whole difference between a glyph and a blob. A white
  // pixel with black on BOTH sides is not background, it is a gap doing work: the counter of
  // an Arabic letter, the space between the bars of the rial symbol, the split between the
  // dots of a ش. Inking it does not darken anything, it deletes a shape — the rial symbol
  // printed as a solid lozenge and small Arabic dots merged into a bar. Strokes still
  // thicken everywhere else, so the print is no lighter than the roll it was tuned on.
  for (let p = 0, i = 0, y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++, i += 4) {
      let on = black[p] || (x > 0 && black[p - 1]) || (y > 0 && black[p - width]);
      if (on && !black[p]) {
        const channel =
          (x > 0 && x < width - 1 && black[p - 1] === 1 && black[p + 1] === 1) ||
          (y > 0 && y < height - 1 && black[p - width] === 1 && black[p + width] === 1);
        if (channel) on = false;
      }
      const v = on ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Packs an already-1-bit canvas into a single ESC/POS "GS v 0" raster command — MSB-first,
 *  1 bit per pixel, 1 = black.
 *
 *  Deliberately ONE monolithic command: this exact format printed pixel-perfect on the real
 *  hardware. A banded variant (raster bands + ESC J feeds over blank stretches) produced
 *  wrong spacing and garbled headers on the actual printer — don't reintroduce it without
 *  printing on the device. */
export function buildEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = Math.ceil(width / 8);
  const raster = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < bytesPerRow; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x < width && data[(y * width + x) * 4] < 128) byte |= 0x80 >> bit;
      }
      raster[y * bytesPerRow + byteX] = byte;
    }
  }
  // One dot (0.125mm — invisible on paper) in the bottom-left corner: printing apps trim
  // trailing all-blank raster lines from a job, which silently deleted the receipt's baked-in
  // bottom margin and made prints end flush against the cut. A single inked dot on the last
  // row makes the full height "real", so the paper actually feeds through the padding.
  raster[(height - 1) * bytesPerRow] |= 0x80;

  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00, // GS v 0, mode = normal
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  const out = new Uint8Array(header.length + raster.length);
  out.set(header, 0);
  out.set(raster, header.length);
  return out;
}

/** A complete job for a printer nothing else is framing: initialise, the raster, enough feed
 *  to clear the tear bar, then a partial cut.
 *
 *  RawBT and Cleanter each wrap whatever they are given with their own init and cut, which is
 *  why {@link buildEscPosRaster} omits both. A station writing straight to a socket has no
 *  such wrapper, so it must send the framing itself or the slip never advances and never cuts. */
export function buildEscPosJob(canvas: HTMLCanvasElement): Uint8Array {
  const raster = buildEscPosRaster(canvas);
  const init = new Uint8Array([0x1b, 0x40]);              // ESC @ — reset to a known state
  const feed = new Uint8Array([0x1b, 0x64, 0x04]);        // ESC d 4 — 4 lines past the head
  const cut = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);   // GS V B 0 — feed and partial cut
  const out = new Uint8Array(init.length + raster.length + feed.length + cut.length);
  let at = 0;
  for (const part of [init, raster, feed, cut]) { out.set(part, at); at += part.length; }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Char-by-char avoids apply/spread argument limits on large receipts (Android WebView).
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
