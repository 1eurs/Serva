import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toCanvas } from 'html-to-image';
import ReceiptSheet from './ReceiptSheet';
import { printRasterViaRawBt, buildEscPosRaster } from '../../lib/printer';
import { buildJpegPdf, canvasToJpeg, downloadBlob } from '../../lib/pdf';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { OrderResponse, Restaurant } from '../../lib/types';

/** Where a rendered receipt goes: the thermal printer, or a PDF file the owner keeps. */
export type ReceiptOutput = 'printer' | 'pdf';

export interface PendingReceipt {
  order: OrderResponse;
  restaurant: Restaurant | undefined;
  tableNumber: string | null;
  output: ReceiptOutput;
}

// Measured directly on the actual printer with a dot-ruler test print — the documented
// 640 (80mm x 8 dots/mm) was too wide and got clipped, so this is empirical, not spec-derived.
// Forcing the exported canvas to this exact width — rather than leaving it to the source
// node's CSS size times whatever devicePixelRatio the tablet happens to have — is what
// keeps the printed receipt's margins/scale consistent.
const TARGET_PRINT_WIDTH_PX = 600;

// The PDF is read on screens and reprinted from other people's printers, so it gets the
// 80mm slip at ~300dpi instead of the printer's own 600-dot head. Same markup, same
// proportions — just not thrown away at the printer's resolution.
const PDF_WIDTH_PX = 944;
const RECEIPT_WIDTH_MM = 80;

// Sending a decoded PNG to RawBT let RawBT's own image pipeline dither/lighten it — text
// printed dark on the same printer, proving the printer's hardware was never the issue, so we
// pre-binarize here AND send pre-built ESC/POS raster bytes (see printer.ts), leaving RawBT
// nothing to reprocess at all.
const CONTRAST = 1.8;
const THRESHOLD = 185;

function binarizeCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  // Pass 1: hard threshold to pure black/white (into a compact per-pixel mask).
  const black = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < black.length; p++, i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = 128 + (gray - 128) * CONTRAST;
    black[p] = boosted > THRESHOLD ? 0 : 1;
  }
  // Pass 2: 1px dilation (left + up neighbors). This printer fires raster graphics visibly
  // fainter than its built-in text font — thickening every stroke by one dot gives each
  // glyph more heated surface, reading as darker print without touching hardware density.
  for (let p = 0, i = 0, y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++, i += 4) {
      const on = black[p] || (x > 0 && black[p - 1]) || (y > 0 && black[p - width]);
      const v = on ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Mounted once at the Shell level. Renders ReceiptSheet off-screen (same markup as the manual
 *  invoice), rasterizes it to a PNG once laid out, and hands that to RawBT — so the auto-printed
 *  receipt is pixel-identical to the one staff print manually, Arabic and all. The PDF save
 *  rides the same render, so a kept file and a printed slip are the same invoice. */
export default function ReceiptCapture({ pending, onDone }: {
  pending: PendingReceipt | null;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { lang } = useI18n();
  const toast = useToast();

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let raf2 = 0;
    // Two rAFs: one for the portal to commit to the DOM, one for layout/fonts to settle
    // before capture — a single frame can race the initial paint.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(async () => {
        if (cancelled || !ref.current) return;
        const forPdf = pending.output === 'pdf';
        try {
          // Scale the export to an exact, known pixel width instead of relying on
          // pixelRatio (which varies per device and previously produced inconsistent
          // widths/margins from one tablet to another).
          const rect = ref.current.getBoundingClientRect();
          const canvasWidth = forPdf ? PDF_WIDTH_PX : TARGET_PRINT_WIDTH_PX;
          const canvasHeight = Math.round(canvasWidth * (rect.height / rect.width));
          // skipFonts: the print path binarizes to pure black/white right after anyway, and
          // keeping it on for the PDF is what makes the saved file match the printed slip.
          const canvas = await toCanvas(ref.current, {
            backgroundColor: '#fff', pixelRatio: 1, canvasWidth, canvasHeight, skipFonts: true,
          });
          if (cancelled) return;
          if (forPdf) {
            const jpeg = await canvasToJpeg(canvas);
            if (cancelled) return;
            const pdf = buildJpegPdf(jpeg, canvas.width, canvas.height, RECEIPT_WIDTH_MM);
            downloadBlob(pdf, `invoice-${pending.order.orderNumber}.pdf`);
            // A download is invisible on a tablet — no browser chrome, no downloads shelf —
            // so the toast is the only thing telling staff the tap did anything.
            toast(lang === 'ar' ? '✓ حُفظت الفاتورة PDF' : '✓ Invoice saved as PDF');
          } else {
            binarizeCanvas(canvas);
            printRasterViaRawBt(buildEscPosRaster(canvas));
          }
        } catch {
          // A failed save is silent otherwise — the file just never appears in downloads.
          if (!cancelled && forPdf) toast(lang === 'ar' ? 'تعذّر حفظ الفاتورة' : "Couldn't save the invoice");
        } finally {
          if (!cancelled) onDone();
        }
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending) return null;
  return createPortal(
    <div className="receipt-capture-sheet" ref={ref}>
      <ReceiptSheet order={pending.order} restaurant={pending.restaurant} tableNumber={pending.tableNumber} />
    </div>,
    document.body,
  );
}
