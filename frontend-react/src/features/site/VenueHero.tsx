import { useEffect, useRef, useState } from 'react';
import { Ltr } from '../../lib/i18n';
import type { Lang } from '../../lib/types';
import { Cup, Money, omr } from './DayScenes';
import { Icon, type IconName } from './icons';

/* ─────────────────────────────────────────────────────────────────────────
   The /v2 hero's "pick your venue" data, and the product it redraws: the
   dashboard's order board on a counter tablet, with a guest's phone in front
   of it. Everything shown is a made-up venue — no customer's real orders.
   ───────────────────────────────────────────────────────────────────────── */

type L = { en: string; ar: string };
export type VenueKey = 'cafe' | 'restaurant' | 'food-truck' | 'juice';
type Col = 'new' | 'prep' | 'ready';
type Order = { col: Col; no: string; where: L; ago: number; lines: { q: number; n: L }[] };
type Item = { n: L; p: number; fill: string; crema?: string; rim?: string };

export type Venue = {
  key: VenueKey; icon: IconName; label: L;
  /** The words the headline swaps in: "One system for your ___." */
  noun: L;
  setupLabel: L; setup: L[];
  spot: L; items: Item[]; orders: Order[];
};

const car = (colorEn: string, colorAr: string, plate: string): L => ({ en: `Car · ${colorEn} · ${plate}`, ar: `سيارة · ${colorAr} · ${plate}` });
const table = (n: number): L => ({ en: `Table ${n}`, ar: `طاولة ${n}` });
const pager = (n: number): L => ({ en: `Pager ${n}`, ar: `بيجر ${n}` });

export const VENUES: Venue[] = [
  {
    key: 'cafe', icon: 'cafe', label: { en: 'Café', ar: 'مقهى' }, noun: { en: 'café', ar: 'مقهاك' },
    setupLabel: { en: 'Café setup', ar: 'تجهيز المقهى' },
    setup: [{ en: 'Counter POS', ar: 'نقاط البيع' }, { en: 'QR ordering', ar: 'الطلب بـ QR' }, { en: 'Car orders', ar: 'طلبات السيارة' }, { en: 'Loyalty stamps', ar: 'أختام الولاء' }],
    spot: table(4),
    items: [
      { n: { en: 'Spanish latte', ar: 'سبانش لاتيه' }, p: 1.8, fill: '#B98A5E', crema: '#E6CBA8' },
      { n: { en: 'Flat white', ar: 'فلات وايت' }, p: 1.6, fill: '#8C5A36', crema: '#D9B38C' },
      { n: { en: 'Cardamom croissant', ar: 'كرواسون بالهيل' }, p: 1.2, fill: '#D9A45B', rim: '#F4F1EA' },
    ],
    orders: [
      { col: 'new', no: '0142', where: table(4), ago: 1, lines: [{ q: 1, n: { en: 'Spanish latte', ar: 'سبانش لاتيه' } }, { q: 1, n: { en: 'Flat white', ar: 'فلات وايت' } }] },
      { col: 'new', no: '0143', where: car('white', 'بيضاء', '21547'), ago: 0, lines: [{ q: 2, n: { en: 'Iced latte', ar: 'آيس لاتيه' } }] },
      { col: 'prep', no: '0140', where: table(2), ago: 4, lines: [{ q: 1, n: { en: 'Matcha latte', ar: 'ماتشا لاتيه' } }, { q: 1, n: { en: 'Cardamom croissant', ar: 'كرواسون بالهيل' } }] },
      { col: 'prep', no: '0139', where: pager(12), ago: 6, lines: [{ q: 1, n: { en: 'Cortado', ar: 'كورتادو' } }] },
      { col: 'ready', no: '0137', where: table(7), ago: 9, lines: [{ q: 2, n: { en: 'Flat white', ar: 'فلات وايت' } }] },
    ],
  },
  {
    key: 'restaurant', icon: 'restaurant', label: { en: 'Restaurant', ar: 'مطعم' }, noun: { en: 'restaurant', ar: 'مطعمك' },
    setupLabel: { en: 'Restaurant setup', ar: 'تجهيز المطعم' },
    setup: [{ en: 'Table QR codes', ar: 'QR لكل طاولة' }, { en: 'Kitchen printing', ar: 'طباعة المطبخ' }, { en: 'Order board', ar: 'لوحة الطلبات' }, { en: 'Multiple branches', ar: 'فروع متعددة' }],
    spot: table(6),
    items: [
      { n: { en: 'Chicken machboos', ar: 'مكبوس دجاج' }, p: 3.5, fill: '#D9913F', crema: '#F3D39A', rim: '#F4F1EA' },
      { n: { en: 'Margherita', ar: 'مارغريتا' }, p: 3.2, fill: '#D8553A', crema: '#F4E3C3', rim: '#F4F1EA' },
      { n: { en: 'Fattoush', ar: 'فتوش' }, p: 1.5, fill: '#7FB069', crema: '#D9E8C4', rim: '#F4F1EA' },
    ],
    orders: [
      { col: 'new', no: '0217', where: table(6), ago: 1, lines: [{ q: 1, n: { en: 'Margherita', ar: 'مارغريتا' } }, { q: 2, n: { en: 'Chicken machboos', ar: 'مكبوس دجاج' } }] },
      { col: 'new', no: '0218', where: table(3), ago: 0, lines: [{ q: 1, n: { en: 'Fattoush', ar: 'فتوش' } }, { q: 1, n: { en: 'Lentil soup', ar: 'شوربة عدس' } }] },
      { col: 'prep', no: '0214', where: table(1), ago: 7, lines: [{ q: 2, n: { en: 'Mixed grill', ar: 'مشاوي مشكّلة' } }] },
      { col: 'prep', no: '0215', where: { en: 'Takeaway · Hamad', ar: 'سفري · حمد' }, ago: 5, lines: [{ q: 1, n: { en: 'Shawarma plate', ar: 'صحن شاورما' } }] },
      { col: 'ready', no: '0212', where: table(5), ago: 12, lines: [{ q: 1, n: { en: 'Hummus', ar: 'حمّص' } }, { q: 1, n: { en: 'Mutabbal', ar: 'متبّل' } }] },
    ],
  },
  {
    key: 'food-truck', icon: 'truck', label: { en: 'Food truck', ar: 'عربة طعام' }, noun: { en: 'food truck', ar: 'عربة طعامك' },
    setupLabel: { en: 'Food truck setup', ar: 'تجهيز عربة الطعام' },
    setup: [{ en: 'One phone is enough', ar: 'يكفي هاتف واحد' }, { en: 'Pagers', ar: 'البيجر' }, { en: 'Order tracking', ar: 'تتبع الطلب' }, { en: 'Sold-out switch', ar: 'إخفاء النافد' }],
    spot: { en: 'Scan at the window', ar: 'امسح عند النافذة' },
    items: [
      { n: { en: 'Karak tea', ar: 'شاي كرك' }, p: 0.3, fill: '#C8955F', crema: '#EBD2B0' },
      { n: { en: 'Chips Oman sandwich', ar: 'ساندويتش شيبس عُمان' }, p: 0.8, fill: '#E3B04B', crema: '#F6E3B0', rim: '#F4F1EA' },
      { n: { en: 'Loaded fries', ar: 'بطاطس محمّلة' }, p: 1.5, fill: '#E7B44A', crema: '#C0392B', rim: '#F4F1EA' },
    ],
    orders: [
      { col: 'new', no: '0388', where: pager(21), ago: 0, lines: [{ q: 3, n: { en: 'Karak tea', ar: 'شاي كرك' } }] },
      { col: 'new', no: '0389', where: pager(22), ago: 1, lines: [{ q: 1, n: { en: 'Chips Oman sandwich', ar: 'ساندويتش شيبس عُمان' } }] },
      { col: 'prep', no: '0386', where: pager(18), ago: 3, lines: [{ q: 2, n: { en: 'Loaded fries', ar: 'بطاطس محمّلة' } }] },
      { col: 'prep', no: '0387', where: pager(19), ago: 4, lines: [{ q: 1, n: { en: 'Karak tea', ar: 'شاي كرك' } }, { q: 1, n: { en: 'Zinger wrap', ar: 'راب زنجر' } }] },
      { col: 'ready', no: '0385', where: pager(17), ago: 6, lines: [{ q: 2, n: { en: 'Chips Oman sandwich', ar: 'ساندويتش شيبس عُمان' } }] },
    ],
  },
  {
    key: 'juice', icon: 'juice', label: { en: 'Juice & desserts', ar: 'عصائر وحلويات' }, noun: { en: 'juice bar', ar: 'محلّ عصائرك' },
    setupLabel: { en: 'Juice & dessert setup', ar: 'تجهيز محل العصائر' },
    setup: [{ en: 'Fast POS', ar: 'نقاط بيع سريعة' }, { en: 'Car orders', ar: 'طلبات السيارة' }, { en: 'Stock', ar: 'المخزون' }, { en: 'Loyalty stamps', ar: 'أختام الولاء' }],
    spot: { en: 'Car service', ar: 'خدمة السيارات' },
    items: [
      { n: { en: 'Avocado juice', ar: 'عصير أفوكادو' }, p: 1.8, fill: '#9DBF6A', crema: '#DCEBC0' },
      { n: { en: 'Mango juice', ar: 'عصير مانجو' }, p: 1.2, fill: '#F2A93B', crema: '#F9D98A' },
      { n: { en: 'Kunafa cup', ar: 'كوب كنافة' }, p: 1.5, fill: '#E0A04A', crema: '#F2D49B', rim: '#F4F1EA' },
    ],
    orders: [
      { col: 'new', no: '0512', where: car('grey', 'رمادية', '88310'), ago: 0, lines: [{ q: 1, n: { en: 'Avocado juice', ar: 'عصير أفوكادو' } }, { q: 1, n: { en: 'Kunafa cup', ar: 'كوب كنافة' } }] },
      { col: 'new', no: '0513', where: { en: 'Counter', ar: 'الكاونتر' }, ago: 1, lines: [{ q: 2, n: { en: 'Mango juice', ar: 'عصير مانجو' } }] },
      { col: 'prep', no: '0510', where: table(3), ago: 3, lines: [{ q: 1, n: { en: 'Strawberry smoothie', ar: 'سموذي فراولة' } }] },
      { col: 'prep', no: '0511', where: { en: 'Counter', ar: 'الكاونتر' }, ago: 4, lines: [{ q: 1, n: { en: 'Saffron milk cake', ar: 'كيكة الحليب بالزعفران' } }] },
      { col: 'ready', no: '0509', where: { en: 'Pickup · Noor', ar: 'استلام · نور' }, ago: 7, lines: [{ q: 2, n: { en: 'Lemon mint', ar: 'ليمون ونعناع' } }] },
    ],
  },
];

export const isVenue = (v: string | null): v is VenueKey => VENUES.some((x) => x.key === v);

const COLS: { key: Col; label: L; dot: string }[] = [
  { key: 'new', label: { en: 'New', ar: 'جديد' }, dot: 'bg-amber-500' },
  { key: 'prep', label: { en: 'Preparing', ar: 'قيد التحضير' }, dot: 'bg-violet-500' },
  { key: 'ready', label: { en: 'Ready', ar: 'جاهز' }, dot: 'bg-sv-mint' },
];

/** Scale a fixed-size drawing to its container, so the mock stays pixel-true on a phone. */
function useFitScale(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / designWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);
  return [ref, scale] as const;
}

const W = 640;
const H = 520;

export function HeroDevices({ venue, lang }: { venue: Venue; lang: Lang }) {
  const [ref, scale] = useFitScale(W);
  const ago = (n: number) => (n === 0 ? (lang === 'ar' ? 'الآن' : 'now') : lang === 'ar' ? `${n} د` : `${n} min`);
  const cart = venue.items[0].p + venue.items[1].p;
  return (
    <div ref={ref} className="relative w-full" style={{ height: H * scale }} aria-hidden="true">
      <div className="absolute top-0 origin-top-left rtl:origin-top-right" style={{ width: W, height: H, transform: `scale(${scale})`, insetInlineStart: 0 }}>
        {/* the counter tablet, showing the order board */}
        <div className="absolute start-0 top-0 w-[560px] rounded-[26px] bg-[#06150F] p-[10px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <div className="flex h-[380px] overflow-hidden rounded-[18px] bg-sv-mist text-sv-ink">
            <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-e border-sv-line bg-white py-3 text-sv-slate">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#34e2a4] to-sv-green font-display text-[13px] font-bold text-white">S</span>
              <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-sv-tint text-sv-green"><Icon name="board" size={17} /></span>
              <Icon name="pos" size={17} />
              <Icon name="qr" size={17} />
              <Icon name="chart" size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-11 items-center justify-between border-b border-sv-line bg-white px-3">
                <span className="text-[13px] font-semibold">{lang === 'ar' ? 'الطلبات · الفرع الرئيسي' : 'Orders · Main branch'}</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sv-green">
                  <span className="sv-live relative h-1.5 w-1.5 rounded-full bg-sv-mint text-sv-mint" />
                  {lang === 'ar' ? 'مباشر' : 'Live'}
                </span>
              </div>
              <div key={venue.key} className="sv-swap grid grid-cols-3 gap-2 p-2.5">
                {COLS.map((c) => {
                  const orders = venue.orders.filter((o) => o.col === c.key);
                  return (
                    <div key={c.key} className="min-w-0">
                      <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold">
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                        {c.label[lang]}
                        <span className="text-sv-slate">{orders.length}</span>
                      </div>
                      <div className="space-y-2">
                        {orders.map((o) => (
                          <div key={o.no} className={`rounded-xl bg-white p-2.5 shadow-sm ring-1 ${c.key === 'new' && o.ago === 0 ? 'ring-2 ring-amber-300' : 'ring-sv-line'}`}>
                            <div className="flex items-center justify-between font-mono text-[10px] text-sv-slate">
                              <Ltr>#{o.no}</Ltr><span className="font-sans">{ago(o.ago)}</span>
                            </div>
                            <p className="mt-1 truncate text-[12px] font-semibold">{o.where[lang]}</p>
                            <ul className="mt-1 space-y-0.5 text-[11px] text-sv-slate">
                              {o.lines.map((l) => (
                                <li key={l.n.en} className="truncate"><Ltr>{l.q} ×</Ltr> {l.n[lang]}</li>
                              ))}
                            </ul>
                            {c.key === 'new' && (
                              <span className="mt-2 block rounded-md bg-sv-green py-1 text-center text-[10.5px] font-medium text-white">{lang === 'ar' ? 'قبول' : 'Accept'}</span>
                            )}
                            {c.key === 'ready' && (
                              <span className="mt-2 block rounded-md border border-sv-line py-1 text-center text-[10.5px] font-medium">{lang === 'ar' ? 'تم التسليم' : 'Served'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* a guest's phone, ordering from the QR — in front of the Ready column, which has
            one card and room below it, so nothing on the board is hidden */}
        <div className="absolute bottom-0 end-0 w-[196px] rounded-[30px] bg-[#06150F] p-[6px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <div key={venue.key} className="sv-swap overflow-hidden rounded-[24px] bg-white text-sv-ink">
            <div className="px-3.5 pb-2 pt-4">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-sv-line" />
              <p className="truncate text-[10px] text-sv-slate">{venue.spot[lang]}</p>
              <p className="text-[14px] font-semibold">{lang === 'ar' ? 'القائمة' : 'Menu'}</p>
            </div>
            <ul className="space-y-0.5 px-1.5">
              {venue.items.map((it, i) => (
                <li key={it.n.en} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
                  <span className="origin-center scale-[0.85]"><Cup fill={it.fill} crema={it.crema} rim={it.rim} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium">{it.n[lang]}</span>
                    <Money n={it.p} lang={lang} className="text-[10px]" />
                  </span>
                  <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${i < 2 ? 'bg-sv-green text-white' : 'border border-sv-line text-sv-slate'}`}>{i < 2 ? '1' : '+'}</span>
                </li>
              ))}
            </ul>
            <div className="p-2.5">
              <div className="flex items-center justify-between rounded-xl bg-sv-green px-3 py-2.5 text-white">
                <span className="text-[11px] font-medium">{lang === 'ar' ? 'أرسل الطلب' : 'Place order'}</span>
                <span className="tnum text-[11px] font-semibold"><Ltr>{omr(cart)}</Ltr></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
