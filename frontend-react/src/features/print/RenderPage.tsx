import { useEffect, useRef, useState } from 'react';
import ReceiptSheet from '../dashboard/ReceiptSheet';
// The receipt's layout — two-column rows, dividers, the six style presets — lives in the
// dashboard stylesheet under .receipt-capture-sheet. Importing the very same file rather
// than extracting a copy is the point: a station's slip and a tablet's slip cannot then
// disagree about anything. Without it the rows collapse into one run of text, which is
// exactly what the first station print produced.
import '../dashboard/dashboard.css';
import { PAPER_DOTS, binarizeCanvas, buildEscPosJob, bytesToBase64 } from '../../lib/escpos';
import { receiptFontCss } from '../../lib/receiptFont';
import type { OrderResponse, Restaurant } from '../../lib/types';

/**
 * The renderer a headless print station drives.
 *
 * A station — the Android app, or the Node stand-in in `station/` — has no browser of its
 * own to lay out a bilingual receipt in, and no thermal printer can shape Arabic from text.
 * So it loads this page once in an offscreen WebView, and for every job hands it the order
 * and gets back the exact bytes to write to the printer's socket:
 *
 *     const { ok, base64 } = await window.servaRenderJob({ order, restaurant, tableNumber, paperWidth });
 *
 * Why a page on the server rather than a renderer inside the app: this is the same React
 * component, the same CSS and the same rasteriser the dashboard prints with, so a receipt
 * cannot look one way from a tablet and another from the station. It also means a change to
 * a receipt style ships with a normal deploy instead of an app update in every café.
 *
 * Public on purpose, and it carries no data of its own: everything printed arrives in the
 * call. Opening the URL by hand shows an empty slip, or a sample with ?demo=1.
 */

/**
 * Frames on this page always arrive.
 *
 * The station loads this page in a WebView that is never on screen, inside an app that is
 * usually behind the dashboard or under a dark screen. Whether such a page still receives
 * animation frames is the phone maker's decision, and both this page and the rasteriser
 * (html-to-image parks every decoded image on a frame) wait on one. A frame that never
 * comes is a ticket that never prints, and the station "works only while the app is open".
 * So a frame is the real one when frames are flowing, and a short timer when they are not.
 * A render page has no animation to keep honest, so nothing is lost.
 */
const nativeFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  let done = false;
  const once = (now: number) => { if (!done) { done = true; callback(now); } };
  const id = nativeFrame(once);
  window.setTimeout(() => once(performance.now()), 250);
  return id;
};

export interface RenderRequest {
  order: OrderResponse;
  restaurant: Restaurant | null;
  tableNumber: string | null;
  paperWidth: 80 | 58;
}
export interface RenderResult {
  ok: boolean;
  /** ESC/POS for the whole job — initialise, raster, feed, cut — base64 encoded. */
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

declare global {
  interface Window {
    servaRenderJob?: (request: RenderRequest | string) => Promise<RenderResult>;
    /** Present as soon as the page can take work, so a station can poll for readiness. */
    servaRenderReady?: boolean;
  }
}

const SAMPLE: RenderRequest = {
  order: {
    id: 0, orderNumber: 'ORD-DEMO', dailyNumber: 12, trackingToken: '', restaurantId: 0, branchId: 0,
    tableId: null, customerName: 'Print test', orderType: 'DINE_IN', status: 'COMPLETED',
    paymentStatus: 'PAID', paymentMethod: 'CASH', subtotal: 4.4, vatAmount: 0.22, total: 4.62,
    items: [
      { nameEn: 'Cappuccino', nameAr: 'كابتشينو', quantity: 2, price: 1.3, lineTotal: 2.6 },
      { nameEn: 'Cheesecake', nameAr: 'تشيز كيك', quantity: 1, price: 1.8, lineTotal: 1.8 },
    ],
    createdAt: new Date().toISOString(),
  } as OrderResponse,
  restaurant: { nameEn: 'Serva Café', nameAr: 'مقهى سيرفا', vatEnabled: true, vatRate: 5 } as Restaurant,
  tableNumber: '5',
  paperWidth: 80,
};

export default function RenderPage() {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState<RenderRequest | null>(
    new URLSearchParams(location.search).has('demo') ? SAMPLE : null,
  );
  // A render is: put the order in state, wait for React to paint it, rasterise the node.
  // The resolver is parked here across those frames.
  const pending = useRef<((result: RenderResult) => void) | null>(null);

  useEffect(() => {
    window.servaRenderJob = (raw) => new Promise<RenderResult>((resolve) => {
      let req: RenderRequest;
      try {
        req = typeof raw === 'string' ? (JSON.parse(raw) as RenderRequest) : raw;
        if (!req?.order?.items) throw new Error('missing order');
      } catch (e) {
        resolve({ ok: false, error: `bad request: ${e instanceof Error ? e.message : 'unparseable'}` });
        return;
      }
      // One at a time. A station prints jobs in order, and overlapping renders would race
      // for the single off-screen node.
      if (pending.current) { resolve({ ok: false, error: 'a render is already in flight' }); return; }
      pending.current = resolve;
      setRequest({ ...req, paperWidth: req.paperWidth === 58 ? 58 : 80 });
    });
    window.servaRenderReady = true;
    return () => { delete window.servaRenderJob; delete window.servaRenderReady; };
  }, []);

  useEffect(() => {
    const resolve = pending.current;
    if (!request || !resolve) return;
    let cancelled = false;
    const finish = (result: RenderResult) => {
      if (cancelled) return;
      pending.current = null;
      resolve(result);
    };
    // Two frames: one for React to commit the slip, one for layout and fonts to settle. A
    // single frame can race the first paint and rasterise a half-laid-out sheet.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          const node = sheetRef.current;
          if (!node) throw new Error('sheet not mounted');
          await (document.fonts?.ready ?? Promise.resolve());
          const { toCanvas } = await import('html-to-image');
          // An off-screen WebView sometimes reports 0×0 on the first paint. Dividing by
          // width then produced Infinity, which allocated a canvas big enough to kill the
          // station. Wait one beat, then refuse rather than OOM.
          let rect = node.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) {
            await new Promise((r) => setTimeout(r, 400));
            rect = node.getBoundingClientRect();
          }
          if (rect.width < 8 || rect.height < 8) {
            throw new Error('receipt did not lay out');
          }
          const ratio = rect.height / rect.width;
          if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('receipt layout was invalid');
          // Force the exact printable width rather than trusting devicePixelRatio, which
          // differs per device and produced inconsistent margins from one tablet to another.
          const canvasWidth = PAPER_DOTS[request.paperWidth];
          const canvasHeight = Math.max(32, Math.min(8_000, Math.round(canvasWidth * ratio)));
          const fontCss = await receiptFontCss(node);
          const canvas = await toCanvas(node, {
            backgroundColor: '#fff', pixelRatio: 1, canvasWidth, canvasHeight,
            fontEmbedCSS: fontCss, skipFonts: !fontCss,
          });
          binarizeCanvas(canvas);
          finish({ ok: true, base64: bytesToBase64(buildEscPosJob(canvas)), width: canvas.width, height: canvas.height });
        } catch (e) {
          finish({ ok: false, error: e instanceof Error ? e.message : 'render failed' });
        }
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(raf1); };
  }, [request]);

  return (
    <div className="receipt-capture-sheet" ref={sheetRef} style={{ position: 'fixed', top: 0, left: 0 }}>
      {request && (
        <ReceiptSheet order={request.order} restaurant={request.restaurant ?? undefined}
          tableNumber={request.tableNumber} />
      )}
    </div>
  );
}
