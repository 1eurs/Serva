import { carColorOf } from '../../lib/carColors';
import { Money } from '../../lib/Money';
import { Ltr } from '../../lib/i18n';
import { receiptDateTime } from '../../lib/format';
import { parseReceiptSettings, type ReceiptLanguage, type ReceiptSettings, type ReceiptStyle } from '../../lib/receiptSettings';
import type { OrderResponse, PaymentMethod, Restaurant } from '../../lib/types';

/* 80mm receipt markup for one order — bilingual (ع/EN) by default, English-only when the café
   chose that in Receipt settings — rasterized to an image and sent to
   RawBT by ReceiptCapture.tsx — both the auto-print-on-complete flow and the manual "🖨 Print
   invoice" buttons (KDS board, order history — see receiptPrinter.tsx) render this exact
   markup, so every print path stays visually identical.

   Per-café customization (style preset, logo, footer, VAT/CR numbers) comes from
   restaurant.receiptSettingsJson (see lib/receiptSettings.ts); the profile's live preview
   passes its unsaved draft via settingsOverride.

   Character-art styles (retro/fancy/ticket) rely on system-font glyphs (═ ─ ╌ ✂ ✦ ★) —
   safe because the receipt is rasterized by the device browser, never by the printer. */

/* Every word the slip prints, per language. The bilingual column is byte-for-byte what every
   café printed before the switch existed, so choosing nothing changes nothing. English-only
   drops the Arabic half of each label and flips the sheet to left-to-right; the layout CSS
   uses logical start/end alignment, so nothing else has to know. */
const LABELS: Record<ReceiptLanguage, {
  invoice: string; invoiceRetro: string; order: string; date: string; type: string; customer: string;
  table: string; car: string; subtotal: string; vat: string; total: string; payment: string;
  notPaid: string; thanks: string; vatNo: string; crNo: string; pay: Record<PaymentMethod, string>;
}> = {
  bilingual: {
    invoice: 'فاتورة / Invoice', invoiceRetro: '*** فاتورة / INVOICE ***',
    order: 'رقم الطلب / Order', date: 'التاريخ / Date', type: 'النوع / Type', customer: 'العميل / Customer',
    table: 'طاولة / Table', car: 'سيارة / Car',
    subtotal: 'المجموع / Subtotal', vat: 'الضريبة / VAT', total: 'الإجمالي / Total', payment: 'الدفع / Payment',
    notPaid: 'غير مدفوع / NOT PAID', thanks: 'شكراً لزيارتكم / Thank you',
    vatNo: 'الرقم الضريبي / VAT No', crNo: 'السجل التجاري / CR No',
    pay: { CASH: 'نقداً / Cash', CARD: 'بطاقة / Card', ONLINE: 'إلكتروني / Online', OTHER: 'أخرى / Other',
           SPLIT: 'مقسوم / Split' },
  },
  en: {
    invoice: 'Invoice', invoiceRetro: '*** INVOICE ***',
    order: 'Order', date: 'Date', type: 'Type', customer: 'Customer',
    table: 'Table', car: 'Car',
    subtotal: 'Subtotal', vat: 'VAT', total: 'Total', payment: 'Payment',
    notPaid: 'NOT PAID', thanks: 'Thank you',
    vatNo: 'VAT No', crNo: 'CR No',
    pay: { CASH: 'Cash', CARD: 'Card', ONLINE: 'Online', OTHER: 'Other', SPLIT: 'Split' },
  },
};

/* Long repeated strings clipped by the divider's overflow:hidden — an easy way to get
   full-width character rules without measuring the paper in ch units. */
const DIVIDERS: Record<ReceiptStyle, string | null> = {
  classic: null, // CSS dashed border
  minimal: null, // CSS solid border
  bold: null,    // CSS thick border
  retro: '='.repeat(72),
  fancy: '· '.repeat(60),
  ticket: '• '.repeat(60),
};

function Divider({ style }: { style: ReceiptStyle }) {
  const text = DIVIDERS[style];
  if (!text) return <div className="inv-hr" />;
  return <div className="inv-hr-txt" aria-hidden>{text}</div>;
}

/* The footer is the one line on the slip the café types freely, and it mixes scripts:
   "تابعونا @serva.om — Follow us". Left to the bidi algorithm inside an RTL slip, the @ is a
   neutral between an Arabic run and a Latin run and takes the paragraph's direction, so it
   printed on the wrong end ("Follow us@"). Every run of non-Arabic words is wrapped as an
   LTR isolate instead, and each line decides its own base direction from its first strong
   character, so an all-English line reads as English. Words, not characters: a lone "·" or
   "—" between two Latin words stays with them. */
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const STRONG_LTR = /[A-Za-z0-9@#]/;
function bidiRuns(line: string): { text: string; ltr: boolean }[] {
  const runs: { text: string; ltr: boolean }[] = [];
  for (const word of line.split(/(\s+)/)) {
    if (!word) continue;
    const ltr = !ARABIC.test(word) && STRONG_LTR.test(word);
    const neutral = !ARABIC.test(word) && !STRONG_LTR.test(word);
    const last = runs[runs.length - 1];
    if (last && (neutral || last.ltr === ltr)) last.text += word;
    else runs.push({ text: word, ltr });
  }
  return runs;
}
function BidiText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\r?\n/).map((line, i) => (
        <div key={i} style={{ unicodeBidi: 'plaintext' }}>
          {bidiRuns(line).map((run, k) => (run.ltr ? <bdi key={k} dir="ltr">{run.text}</bdi> : run.text))}
        </div>
      ))}
    </>
  );
}

/** ✂ tear-line used by the ticket style at both ends of the slip. */
function TearLine() {
  return <div className="inv-tear" aria-hidden>{'✂ ' + '╌ '.repeat(60)}</div>;
}

export default function ReceiptSheet({ order, restaurant: r, tableNumber, settingsOverride }: {
  order: OrderResponse; restaurant: Restaurant | undefined; tableNumber: string | null;
  settingsOverride?: ReceiptSettings;
}) {
  const s = settingsOverride ?? parseReceiptSettings(r?.receiptSettingsJson);
  const en = s.language === 'en';
  const L = LABELS[s.language];
  const cc = carColorOf(order.carColor);
  const typeLine = order.orderType === 'DINE_IN'
    ? `${L.table}${tableNumber ? ` ${tableNumber}` : ''}`
    : `${L.car}${order.carPlate ? ` · ${order.carPlate}` : ''}${cc ? ` · ${en ? cc.en : `${cc.ar} / ${cc.en}`}` : ''}`;
  // English-only: the English name leads and the Arabic one is not printed at all. Bilingual:
  // Arabic leads, English follows underneath when the café has one and it differs.
  const nameLine = en ? (r?.nameEn || r?.name || r?.nameAr || '') : (r?.nameAr || r?.nameEn || r?.name || '');
  const subName = !en && r?.nameAr && r?.nameEn && r.nameAr !== r.nameEn ? r.nameEn : null;
  const showVat = !!r?.vatEnabled || order.vatAmount > 0;
  const paid = order.paymentStatus === 'PAID' && !!order.paymentMethod;
  const noteLines = order.items.reduce((sum, item) => sum + (item.note ? 1 : 0), 0);
  const receiptHeightMm = Math.min(600, Math.max(130, 92 + order.items.length * 11 + noteLines * 6));

  return (
    <div className={`invoice-sheet rcpt-${s.style}${en ? ' rcpt-en' : ''}`} dir={en ? 'ltr' : 'rtl'}>
      <style>{`@page{size:80mm ${receiptHeightMm}mm;margin:0}@media print{html,body{width:80mm;margin:0!important;background:#fff!important}}`}</style>
      {s.style === 'ticket' && <TearLine />}
      {s.showLogo && r?.logoUrl && (
        <div className="inv-logo-wrap"><img className="inv-logo" src={r.logoUrl} alt="" /></div>
      )}
      {s.style === 'fancy' && <div className="inv-ornament" aria-hidden>─── ✦ ───</div>}
      <div className="inv-name">{nameLine}</div>
      {subName && <div className="inv-sub">{subName}</div>}
      {s.style === 'fancy' && <div className="inv-ornament" aria-hidden>─── ✦ ───</div>}
      {s.showPhone && r?.phone && <div className="inv-sub num"><Ltr>{r.phone}</Ltr></div>}
      {s.vatNumber && <div className="inv-sub num">{L.vatNo}: {s.vatNumber}</div>}
      {s.crNumber && <div className="inv-sub num">{L.crNo}: {s.crNumber}</div>}
      {s.style === 'ticket' ? (
        <div className="inv-ticket-no"><span>{L.invoice}</span><b className="num"><Ltr>#{order.dailyNumber}</Ltr></b></div>
      ) : (
        <div className="inv-title">{s.style === 'retro' ? L.invoiceRetro : L.invoice}</div>
      )}
      {s.style !== 'ticket' && (
        <div className="inv-row"><span>{L.order}</span><span className="amt"><Ltr>#{order.dailyNumber}</Ltr></span></div>
      )}
      <div className="inv-row"><span>{L.date}</span><span className="amt"><Ltr>{receiptDateTime(order.createdAt)}</Ltr></span></div>
      <div className="inv-row"><span>{L.type}</span><span>{typeLine}</span></div>
      {order.customerName && <div className="inv-row"><span>{L.customer}</span><span>{order.customerName}</span></div>}
      <Divider style={s.style} />
      {order.items.map((i, n) => (
        <div className="inv-item" key={n}>
          <div className="inv-row">
            <span><span className="num"><Ltr>{i.quantity}×</Ltr></span> {en ? (i.nameEn || i.nameAr) : (i.nameAr || i.nameEn)}
              {!en && i.nameAr && i.nameEn && i.nameAr !== i.nameEn && <span className="inv-en"> {i.nameEn}</span>}</span>
            <Money value={i.lineTotal} className="amt" />
          </div>
          {i.note && <div className="inv-note">↳ {i.note}</div>}
        </div>
      ))}
      <Divider style={s.style} />
      <div className="inv-row"><span>{L.subtotal}</span><Money value={order.subtotal} className="amt" /></div>
      {showVat && (
        <div className="inv-row"><span>{L.vat}{r?.vatRate ? ` ${r.vatRate}%` : ''}</span><Money value={order.vatAmount} className="amt" /></div>
      )}
      <div className="inv-row inv-total"><span>{L.total}</span><Money value={order.total} className="amt" /></div>
      {/* Counter cafés start the kitchen from this slip and settle at the counter, so the
          payment line is always there — the counter reads PAID / NOT PAID off the paper. */}
      <div className={'inv-row' + (paid ? '' : ' inv-unpaid')}><span>{L.payment}</span>
        <span>{paid ? L.pay[order.paymentMethod!] : L.notPaid}</span></div>
      <Divider style={s.style} />
      <div className="inv-thanks">{s.style === 'fancy' ? `✦ ${L.thanks} ✦` : L.thanks}</div>
      {s.footerText && <div className="inv-footer"><BidiText text={s.footerText} /></div>}
      {s.style === 'ticket' && <TearLine />}
    </div>
  );
}
