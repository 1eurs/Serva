import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toCanvas } from 'html-to-image';
import ReceiptSheet from './ReceiptSheet';
import { printRasterViaRawBt, getPrintApp, getPaperWidth, recordPrintAttempt, setPrinterVerified } from '../../lib/printer';
import { PAPER_DOTS, binarizeCanvas, buildEscPosRaster } from '../../lib/escpos';
import { receiptFontCss } from '../../lib/receiptFont';
import { cleanterPrintImage, describeCleanterFailure } from '../../lib/cleanter';
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
  /** Fired by the app (a ticket arriving, an order completing), not by a tap. */
  auto?: boolean;
  /** A station job or a test print: this device's own, never handed onward, and retried by
   *  the server queue rather than inside the printing app. See PrintOptions. */
  local?: boolean;
  /** Told whether the printing app took the job — see PrintOptions in receiptPrinter.tsx. */
  onResult?: (ok: boolean) => void;
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

/** Mounted once at the Shell level. Renders ReceiptSheet off-screen (same markup as the manual
 *  invoice), rasterizes it once laid out, and hands that to whichever printing app this
 *  device uses — so the auto-printed receipt is pixel-identical to the one staff print
 *  manually, Arabic and all. The PDF save rides the same render, so a kept file and a
 *  printed slip are the same invoice. */
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
        const app = forPdf ? null : getPrintApp();
        const paper = getPaperWidth();
        // Exactly once, whatever happens below — the queue's ack hangs off it, and a job
        // whose result never arrives would sit pending until the freshness window drops it.
        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          pending.onResult?.(ok);
        };
        try {
          // Scale the export to an exact, known pixel width instead of relying on
          // pixelRatio (which varies per device and previously produced inconsistent
          // widths/margins from one tablet to another).
          const rect = ref.current.getBoundingClientRect();
          const canvasWidth = forPdf ? PDF_WIDTH_PX
            : app === 'cleanter' ? PAPER_DOTS[paper]
              : TARGET_PRINT_WIDTH_PX;
          const canvasHeight = Math.round(canvasWidth * (rect.height / rect.width));
          // The café's own typeface has to be embedded or the rasteriser cannot see it —
          // see receiptFont.ts. The station's renderer does exactly the same, so a slip is
          // the same slip whichever device prints it, and the PDF matches both.
          const fontCss = await receiptFontCss(ref.current);
          const canvas = await toCanvas(ref.current, {
            backgroundColor: '#fff', pixelRatio: 1, canvasWidth, canvasHeight,
            fontEmbedCSS: fontCss, skipFonts: !fontCss,
          });
          if (cancelled) return;
          if (forPdf) {
            const jpeg = await canvasToJpeg(canvas);
            if (cancelled) return;
            const pdf = buildJpegPdf(jpeg, canvas.width, canvas.height, RECEIPT_WIDTH_MM);
            downloadBlob(pdf, `invoice-${pending.order.orderNumber}.pdf`);
            settle(true);
            // A download is invisible on a tablet — no browser chrome, no downloads shelf —
            // so the toast is the only thing telling staff the tap did anything.
            toast(lang === 'ar' ? '✓ حُفظت الفاتورة PDF' : '✓ Invoice saved as PDF');
          } else if (app === 'station') {
            // Unreachable through printReceipt, which delegates before queueing; kept so a
            // direct caller cannot make this device pretend to print.
            toast(lang === 'ar' ? 'الطباعة تتم من جهاز الطباعة' : 'Printing happens on the station device');
            settle(false);
          } else if (app === 'cleanter') {
            binarizeCanvas(canvas);
            const png = canvas.toDataURL('image/png').split(',')[1] ?? '';
            // bidi-ok: never rendered here — it labels the job in Cleanter's own (LTR) job
            // list, so a failed ticket can be found and reprinted from the tablet.
            const reference = `#${pending.order.dailyNumber} ${pending.order.orderNumber}`;
            // Retry lives in exactly one place. A station job is retried by the server queue
            // (it stays pending until acked), so it goes to Cleanter's synchronous endpoint and
            // is acked only on a real print. An auto print with no server job behind it — a
            // receipt on completion, printed right here — has nowhere else to retry, so it
            // goes to Cleanter's own queue and is treated as printed once accepted.
            const result = await cleanterPrintImage(png, { reference, paperWidth: paper, queue: !!pending.auto && !pending.local });
            recordPrintAttempt({
              at: Date.now(), app: 'cleanter', ok: result.ok,
              queued: result.ok ? result.queued : undefined,
              reason: result.ok ? undefined : result.reason,
              code: result.ok ? undefined : result.code,
            });
            settle(result.ok);
            if (result.ok) {
              // Cleanter confirmed the printer took it — the fact the RawBT guide has to ask
              // the owner for.
              setPrinterVerified(pending.order.branchId, true);
              if (!pending.auto) toast(lang === 'ar' ? '✓ طُبعت' : '✓ Printed');
            } else {
              toast(describeCleanterFailure(result, lang).short);
            }
          } else {
            binarizeCanvas(canvas);
            printRasterViaRawBt(buildEscPosRaster(canvas));
            // The scheme handoff reports nothing, so "handed over" is the only success this
            // path can ever claim. A queued job is acked here and not retried; RawBT cannot
            // tell us otherwise, and reprinting on a guess would spit duplicates.
            settle(true);
          }
        } catch {
          // A failed save is silent otherwise — the file just never appears in downloads.
          if (!cancelled && forPdf) toast(lang === 'ar' ? 'تعذّر حفظ الفاتورة' : "Couldn't save the invoice");
        } finally {
          if (!cancelled) { settle(false); onDone(); }
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
