/* Save a receipt as a PDF file, with no PDF library.

   The page is a single rasterized image, for the same reason the thermal print is
   (ReceiptCapture.tsx): the invoice is bilingual, and embedding real text would mean shipping
   and subsetting an Arabic font. A picture of the already-laid-out sheet keeps the saved file
   identical to the printed one, Arabic shaping and all.

   No compressor here either — /DCTDecode means "this stream is a JPEG", so the bytes the
   canvas hands us go in verbatim. */

const PT_PER_MM = 72 / 25.4;

/** Each char's low byte, which is what canvas base64/PDF syntax bytes already are. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** JPEG (not PNG): PDF can embed a JPEG stream as-is, whereas a canvas PNG would have to be
 *  unwrapped to its Flate stream and split from its alpha channel first. */
export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** One-page PDF holding one JPEG, scaled to a page `pageWidthMm` wide and proportionally tall —
 *  so an 80mm receipt prints 1:1 on a thermal printer and still reads on a phone. */
export function buildJpegPdf(
  jpeg: Uint8Array, pxWidth: number, pxHeight: number, pageWidthMm: number,
): Blob {
  const w = +(pageWidthMm * PT_PER_MM).toFixed(2);
  const h = +(w * (pxHeight / pxWidth)).toFixed(2);

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? latin1(chunk) : chunk;
    parts.push(bytes);
    size += bytes.length;
  };
  // The xref table is byte offsets, so every object records where it started. The EOLs around
  // a stream are framing and don't count towards /Length.
  const obj = (n: number, dict: string, stream?: Uint8Array) => {
    offsets[n] = size;
    push(`${n} 0 obj\n${dict}\n`);
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
    push('endobj\n');
  };

  const content = latin1(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
  // The binary comment marks the file as binary for tools that sniff the first bytes.
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] `
       + '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  obj(4, '<< /Type /XObject /Subtype /Image '
       + `/Width ${pxWidth} /Height ${pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
       + `/Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  obj(5, `<< /Length ${content.length} >>`, content);

  const xref = size;
  const rows = [1, 2, 3, 4, 5]
    .map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
    .join('');
  push(`xref\n0 6\n0000000000 65535 f \n${rows}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Hands the file to the browser's own downloads. Deliberately not the Web Share sheet: the
 *  capture is async, so by the time the file exists the tap's user gesture is gone and a
 *  share() call would just throw on mobile. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
