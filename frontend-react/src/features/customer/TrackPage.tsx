import { useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { OrderTracking, OrderStatus } from '../../lib/types';
import { omr } from '../../lib/format';
import { useI18n, useT, Ltr, type Dict } from '../../lib/i18n';
import { useOrderStream } from '../../lib/sse';
import { useAudioArm, playChime, vibrate } from '../../lib/alerts';
import { menuPathOf, useVenue } from './venue';
import { CustomerFrame } from './CustomerFrame';
import { StampCard } from './StampCard';
import './loyalty.css';

// Accepted = "being prepared" now (Preparing merged in); the stepper is 3 stops.
const FLOW: OrderStatus[] = ['PENDING', 'ACCEPTED', 'READY'];
const DICT: Dict = {
  ar: { title: 'تتبّع الطلب', orderNo: 'رقم الطلب', cur: 'ر.ع', min: 'د', subtotal: 'المجموع الفرعي', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي', back: 'العودة للقائمة', estPrep: 'الوقت المقدّر', thanks: 'شكراً لك',
        head_PENDING: 'تم الإرسال — بانتظار المقهى', head_ACCEPTED: 'قيد التحضير', head_PREPARING: 'قيد التحضير', head_READY: 'جاهز للتقديم', head_COMPLETED: 'اكتمل الطلب', head_DECLINED: 'اعتُذر عن الطلب', head_CANCELLED: 'أُلغي الطلب',
        st_PENDING: 'أرسلنا طلبك', st_ACCEPTED: 'يُحضَّر الآن', st_PREPARING: 'يُحضَّر الآن', st_READY: 'جاهز!',
        sorry_DECLINED: 'نعتذر منك، لم يتمكن المقهى من استلام هذا الطلب', sorry_CANCELLED: 'نعتذر منك، أُلغي هذا الطلب من المقهى',
        maybeWhy: 'يحدث هذا عادةً عند ضغط الطلبات أو إغلاق المقهى مؤقتاً.',
        sorrySub: 'لم يُحتسب عليك أي مبلغ، ويسعدنا خدمتك في طلب جديد ☕', reasonLbl: 'سبب الاعتذار', orderAgain: 'اطلب من جديد',
        loyReward: 'مكافأة الولاء', loyEarned: 'أُضيف ختم إلى بطاقتك ✓', loyMinA: 'تُحتسب الأختام للطلبات فوق', loyCard: 'بطاقة أختامك', viewRewards: 'عرض كل مكافآتي',
        of: 'من', moreOne: 'ختم واحد على', moreN: 'أختام على', counter: 'استبدل مكافأتك المجانية عند الدفع', ready: 'مكافأة جاهزة', readyN: 'مكافآت جاهزة' },
  en: { title: 'Track order', orderNo: 'Order', cur: 'OMR', min: 'min', subtotal: 'Subtotal', vat: 'VAT', total: 'Total', back: 'Back to menu', estPrep: 'Estimated', thanks: 'Thank you',
        head_PENDING: 'Sent — waiting for the cafe', head_ACCEPTED: 'Being prepared', head_PREPARING: 'Being prepared', head_READY: 'Ready to serve', head_COMPLETED: 'Completed', head_DECLINED: 'Order declined', head_CANCELLED: 'Order cancelled',
        st_PENDING: 'Order sent', st_ACCEPTED: 'Being prepared', st_PREPARING: 'Being prepared', st_READY: 'Ready!',
        sorry_DECLINED: "We're sorry — the cafe couldn't take this order", sorry_CANCELLED: "We're sorry — this order was cancelled by the cafe",
        maybeWhy: 'This usually happens when the cafe is very busy or temporarily closed.',
        sorrySub: "You haven't been charged — we'd love to serve you on a fresh order ☕", reasonLbl: 'Reason', orderAgain: 'Order again',
        loyReward: 'Loyalty reward', loyEarned: 'A stamp was added to your card ✓', loyMinA: 'Stamps count on orders over', loyCard: 'Your stamp card', viewRewards: 'View all my rewards',
        of: 'of', moreOne: 'more stamp for', moreN: 'more stamps for', counter: 'Redeem your free reward at checkout', ready: 'Reward ready', readyN: 'rewards ready' },
};

export default function TrackPage() {
  const { trackingToken = '' } = useParams();
  const { lang } = useI18n();
  const t = useT(DICT);
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const { slug, branchId, tableToken, orderType } = useVenue();

  const key = ['order', trackingToken];
  const { data: o, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<OrderTracking>(`/api/public/orders/${trackingToken}`, { auth: false }),
    refetchInterval: 20_000, // safety net alongside SSE
  });

  // live updates — refetch on any order.* event
  useOrderStream(trackingToken ? `/api/public/orders/${trackingToken}/stream` : null, () => {
    qc.invalidateQueries({ queryKey: key });
  });

  // chime + buzz the customer's phone the moment the cafe accepts the order and
  // again when it's ready — handy for car-service waiting in the lot.
  useAudioArm();
  const prevStatus = useRef<OrderStatus | null>(null);
  useEffect(() => {
    if (!o) return;
    const was = prevStatus.current;
    prevStatus.current = o.status;
    if (was && was !== o.status && (o.status === 'ACCEPTED' || o.status === 'READY')) {
      playChime();
      vibrate([60, 70, 60]);
    }
    // also nudge on bad news so a customer waiting in the car doesn't sit there unaware
    if (was && was !== o.status && (o.status === 'DECLINED' || o.status === 'CANCELLED')) {
      vibrate([180, 80, 180]);
    }
  }, [o?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuPath = menuPathOf(slug, branchId, tableToken, orderType);

  if (isLoading || !o) return <CustomerFrame><div className="center"><div className="spinner" /></div></CustomerFrame>;

  const idx = FLOW.indexOf(o.status);
  const bad = o.status === 'DECLINED' || o.status === 'CANCELLED';

  return (
    <CustomerFrame>
      <header className="c-vhdr">
        <button className="c-back" onClick={() => nav(menuPath)} aria-label="back"><span className="arr">›</span></button>
        <h2>{t('title')}</h2>
      </header>

      <div className="c-vbody">
        <div className="c-track">
          <div className="no"><span className="lbl">{t('orderNo')}</span><span className="num"><Ltr>#{o.dailyNumber}</Ltr></span></div>
          <div className="state">{!bad && <span className="c-pulse" />}{t('head_' + o.status)}</div>
          {!bad && (
            <div className="sub">
              {o.status === 'ACCEPTED' && o.prepTimeMinutes
                ? <>{t('estPrep')} ~ <span className="num">{o.prepTimeMinutes}</span> {t('min')}</>
                : (o.customerName ? `${t('thanks')}${lang === 'ar' ? '،' : ','} ${o.customerName}` : t('thanks'))}
            </div>
          )}
        </div>

        {bad ? (
          <div className="c-sorry">
            <div className="big">🙏</div>
            <h3>{t('sorry_' + o.status)}</h3>
            {o.declineReason
              ? <p className="why">{t('reasonLbl')}: {o.declineReason}</p>
              : <p className="why">{t('maybeWhy')}</p>}
            <p className="next">{t('sorrySub')}</p>
          </div>
        ) : (
          <div className="c-stepper">
            {FLOW.map((st, i) => {
              const cls = i < idx ? 'done' : i === idx ? 'active' : '';
              const icon = i < idx ? '✓' : i === idx ? '●' : String(i + 1);
              return (
                <div className={'c-step ' + cls} key={st}>
                  <div className="dot">{icon}</div>
                  <div className="txt"><b>{t('st_' + st)}</b></div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {o.items.map((it, i) => (
            <div className="c-totals" style={{ marginBottom: 0, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} key={i}>
              <span><span className="num"><Ltr>{it.quantity}×</Ltr></span> {lang === 'ar' ? (it.nameAr || it.nameEn) : (it.nameEn || it.nameAr)}</span>
              <span className="num">{omr(it.lineTotal)} {t('cur')}</span>
            </div>
          ))}
        </div>

        <div className="c-totals" style={{ marginTop: 14 }}>
          <div className="row"><span>{t('subtotal')}</span><span className="num">{omr(o.subtotal)} {t('cur')}</span></div>
          {o.vatAmount > 0 && <div className="row"><span>{t('vat')}</span><span className="num">{omr(o.vatAmount)} {t('cur')}</span></div>}
          {o.loyaltyRewardDiscount != null && o.loyaltyRewardDiscount > 0 && (
            <div className="row loy-discount"><span>🎁 {o.loyaltyRewardLabel || t('loyReward')}</span><span className="num">−{omr(o.loyaltyRewardDiscount)} {t('cur')}</span></div>
          )}
          <div className="row grand"><span>{t('total')}</span><span className="num">{omr(o.total)} {t('cur')}</span></div>
        </div>

        {!bad && o.loyalty?.enabled && (
          <div style={{ marginTop: 16 }}>
            {o.status === 'COMPLETED' && o.stampEarned && (
              <div className="loy-earned"><span className="ic">🎟️</span> {t('loyEarned')}</div>
            )}
            {o.status === 'COMPLETED' && !o.stampEarned && o.loyalty.minOrderAmount && (
              <div className="loy-note"><span className="ic">🎟️</span> {t('loyMinA')} <b className="num">{omr(o.loyalty.minOrderAmount)}</b> {t('cur')}</div>
            )}
            <div style={{ marginTop: o.status === 'COMPLETED' ? 12 : 0, cursor: 'pointer' }}
              onClick={() => nav('/loyalty', { state: { from: loc.pathname } })} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && nav('/loyalty', { state: { from: loc.pathname } })}>
              <StampCard name={t('loyCard')} rewardLabel={o.loyalty.rewardLabel || ''}
                stamps={o.loyalty.stamps} stampsRequired={o.loyalty.stampsRequired}
                availableRewards={o.loyalty.availableRewards}
                cardColor={o.loyalty.cardColor} cardBg={o.loyalty.cardBg} stampIcon={o.loyalty.stampIcon} cardMotif={o.loyalty.cardMotif}
                footer={o.loyalty.availableRewards > 0
                  ? <><span className="loy-progress">{t('counter')}</span>
                      <span className="loy-ready">★ {o.loyalty.availableRewards > 1
                        ? <><span className="num">{o.loyalty.availableRewards}</span> {t('readyN')}</> : t('ready')}</span></>
                  : (() => { const rem = Math.max(0, o.loyalty.stampsRequired - o.loyalty.stamps);
                      return <span className="loy-progress"><b className="num">{o.loyalty.stamps}</b> {t('of')} <span className="num">{o.loyalty.stampsRequired}</span>
                        {rem > 0 && <> · {rem} {rem === 1 ? t('moreOne') : t('moreN')} {o.loyalty.rewardLabel}</>}</span>; })()} />
            </div>
            <button className="loy-link" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => nav('/loyalty', { state: { from: loc.pathname } })}>{t('viewRewards')}</button>
          </div>
        )}

        {bad && (
          <button className="btn full" style={{ marginTop: 18 }} onClick={() => nav(menuPath)}>
            {t('orderAgain')}
          </button>
        )}
      </div>
    </CustomerFrame>
  );
}
