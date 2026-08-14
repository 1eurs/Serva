import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useI18n, useT, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { Money } from '../../lib/Money';
import { carColorOf, carColorLabel } from '../../lib/carColors';
import type { OrderSummaryResponse, PageResponse, OrderResponse, OrderStatus } from '../../lib/types';
import { useReceiptPrinter } from './receiptPrinter';

const DICT: Dict = {
  ar: { cur: 'ر.ع', all: 'الكل', table: 'طاولة', car: 'خدمة السيارة', carPlate: 'لوحة السيارة', thNo: 'الطلب', thTime: 'الوقت', thType: 'النوع', thStatus: 'الحالة', thPay: 'الدفع', thTotal: 'الإجمالي',
        prev: 'السابق', next: 'التالي', page: 'صفحة', none: 'لا طلبات', markPaid: 'تحديد كمدفوع', paid: 'مدفوع', unpaid: 'غير مدفوع', items: 'الأصناف', timeline: 'التسلسل الزمني',
        customer: 'العميل', note: 'ملاحظة العميل', carColor: 'لون السيارة', subtotal: 'المجموع', vat: 'الضريبة', total: 'الإجمالي', close: 'إغلاق', detail: 'تفاصيل الطلب', printInv: 'طباعة الفاتورة', savePdf: 'حفظ الفاتورة PDF',
        st_PENDING: 'جديد', st_ACCEPTED: 'قيد التنفيذ', st_PREPARING: 'تحضير', st_READY: 'جاهز', st_COMPLETED: 'مكتمل', st_DECLINED: 'مرفوض', st_CANCELLED: 'ملغى',
        ts_createdAt: 'أُنشئ', ts_acceptedAt: 'قُبل', ts_preparingAt: 'بدأ التحضير', ts_readyAt: 'جاهز', ts_completedAt: 'اكتمل', ts_declinedAt: 'رُفض', ts_cancelledAt: 'أُلغي' },
  en: { cur: 'OMR', all: 'All', table: 'Table', car: 'Outdoor car', carPlate: 'Car plate', thNo: 'Order', thTime: 'Time', thType: 'Type', thStatus: 'Status', thPay: 'Payment', thTotal: 'Total',
        prev: 'Prev', next: 'Next', page: 'Page', none: 'No orders', markPaid: 'Mark paid', paid: 'Paid', unpaid: 'Unpaid', items: 'Items', timeline: 'Timeline',
        customer: 'Customer', note: 'Customer note', carColor: 'Car color', subtotal: 'Subtotal', vat: 'VAT', total: 'Total', close: 'Close', detail: 'Order detail', printInv: 'Print invoice', savePdf: 'Save invoice as PDF',
        st_PENDING: 'New', st_ACCEPTED: 'In progress', st_PREPARING: 'Preparing', st_READY: 'Ready', st_COMPLETED: 'Completed', st_DECLINED: 'Declined', st_CANCELLED: 'Cancelled',
        ts_createdAt: 'Created', ts_acceptedAt: 'Accepted', ts_preparingAt: 'Preparing', ts_readyAt: 'Ready', ts_completedAt: 'Completed', ts_declinedAt: 'Declined', ts_cancelledAt: 'Cancelled' },
};

// Filter tabs reflect the simplified lifecycle (Accepted = "in progress"; Cancelled covers
// declines too). PREPARING/DECLINED still render in detail views for any legacy row.
const STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED'];
const COLOR: Record<OrderStatus, string> = {
  PENDING: 'var(--pending)', ACCEPTED: 'var(--accepted)', PREPARING: 'var(--preparing)',
  READY: 'var(--ready)', COMPLETED: 'var(--faint)', DECLINED: 'var(--bad)', CANCELLED: 'var(--faint)',
};
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const orderTypeLabel = (o: { orderType: string; carPlate?: string | null }, t: (key: string) => string) => {
  if (o.orderType === 'DINE_IN') return `🪑 ${t('table')}`;
  if (o.orderType === 'CAR') return `🚗 ${t('car')}${o.carPlate ? ` · ${o.carPlate}` : ''}`;
  return `🚗 ${t('car')}`;
};

export default function OrdersPage({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const qs = new URLSearchParams({ page: String(page), size: '20', sort: 'createdAt,desc' });
  if (branchId) qs.set('branchId', String(branchId));
  if (status) qs.set('status', status);

  const { data, isLoading } = useQuery({
    queryKey: ['orders-history', branchId, status, page],
    queryFn: () => api.get<PageResponse<OrderSummaryResponse>>(`/api/dashboard/orders?${qs.toString()}`),
  });
  const rows = data?.content ?? [];

  return (
    <div className="tables-wrap">
      <div className="toolbar">
        <div className="seg">
          <button className={status === '' ? 'on' : ''} onClick={() => { setStatus(''); setPage(0); }}>{t('all')}</button>
          {STATUSES.map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => { setStatus(s); setPage(0); }}>{t('st_' + s)}</button>)}
        </div>
      </div>

      {isLoading ? <div className="center"><div className="spinner" /></div>
        : rows.length === 0 ? <div className="empty"><div className="big">🧾</div><h3>{t('none')}</h3></div>
        : (
          <>
            <table className="tbl orders-tbl">
              <thead><tr>
                <th>{t('thNo')}</th><th className="hide-sm">{t('thTime')}</th><th className="hide-sm">{t('thType')}</th>
                <th>{t('thStatus')}</th><th className="hide-sm">{t('thPay')}</th><th>{t('thTotal')}</th>
              </tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o.id)}>
                    <td><span className="num" style={{ fontWeight: 600 }}>{o.orderNumber}</span></td>
                    <td className="hide-sm"><span className="num" style={{ color: 'var(--muted)' }}>{fmt(o.createdAt)}</span></td>
                    <td className="hide-sm">{orderTypeLabel(o, t)}</td>
                    <td><span className="chip" style={{ color: COLOR[o.status] }}><span className="d" style={{ background: COLOR[o.status] }} />{t('st_' + o.status)}</span></td>
                    <td className="hide-sm"><span className={'chip' + (o.paymentStatus === 'PAID' ? ' ok' : '')}><span className="d" />{o.paymentStatus === 'PAID' ? t('paid') : t('unpaid')}</span></td>
                    <td><Money value={o.total} className="num" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <button className="btn sm ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ {t('prev')}</button>
              <span className="num">{t('page')} {(data?.page ?? 0) + 1} / {data?.totalPages ?? 1}</span>
              <button className="btn sm ghost" disabled={data?.last} onClick={() => setPage((p) => p + 1)}>{t('next')} ›</button>
            </div>
          </>
        )}

      <div className={'drawer-bg' + (selected ? ' open' : '')} onClick={() => setSelected(null)} />
      <aside className={'drawer' + (selected ? ' open' : '')}>
        {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} />}
      </aside>
    </div>
  );
}

function OrderDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const printReceipt = useReceiptPrinter();
  const { data: o } = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderResponse>(`/api/dashboard/orders/${id}`) });

  const pay = useMutation({
    mutationFn: () => api.post(`/api/payments/orders/${id}/mark-paid`, { method: 'CARD' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['orders-history'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  if (!o) return <div className="drawer-hd"><div className="spinner" /></div>;
  const TS: (keyof OrderResponse)[] = ['createdAt', 'acceptedAt', 'preparingAt', 'readyAt', 'completedAt', 'declinedAt', 'cancelledAt'];

  return (
    <>
      <div className="drawer-hd">
        <div><div style={{ fontWeight: 700, fontSize: 17 }} className="num">{o.orderNumber}</div>
          <div className="rslug">{orderTypeLabel(o, t)} · <span style={{ color: COLOR[o.status] }}>{t('st_' + o.status)}</span></div></div>
        <button className="x" onClick={onClose}>✕</button>
      </div>
      <div className="drawer-bd">
        {(o.customerName || o.customerPhone) && (
          <div className="sect"><h4>{t('customer')}</h4>
            <div className="kv"><span className="k">{o.customerName || '—'}</span><span className="v num">{o.customerPhone || ''}</span></div>
            {o.customerNote && <div className="kv"><span className="k">{t('note')}</span><span className="v">{o.customerNote}</span></div>}
          </div>
        )}
        {o.orderType === 'CAR' && (o.carPlate || o.carColor) && (
          <div className="sect"><h4>{t('car')}</h4>
            {o.carPlate && <div className="kv"><span className="k">{t('carPlate')}</span><span className="v num">{o.carPlate}</span></div>}
            {o.carColor && (
              <div className="kv"><span className="k">{t('carColor')}</span>
                <span className="v carcol"><span className="cc-dot" style={{ background: carColorOf(o.carColor)?.hex ?? o.carColor }} />{carColorLabel(o.carColor, lang)}</span>
              </div>
            )}
          </div>
        )}
        <div className="sect"><h4>{t('items')}</h4>
          {o.items.map((i, n) => (
            <div className="kv" key={n}>
              <span className="k"><span className="num">{i.quantity}×</span> {lang === 'ar' ? (i.nameAr || i.nameEn) : (i.nameEn || i.nameAr)}{i.note ? ` · ${i.note}` : ''}</span>
              <Money value={i.lineTotal} className="v num" />
            </div>
          ))}
          <div className="kv"><span className="k">{t('subtotal')}</span><Money value={o.subtotal} className="v num" /></div>
          <div className="kv"><span className="k">{t('vat')}</span><Money value={o.vatAmount} className="v num" /></div>
          <div className="kv"><span className="k" style={{ fontWeight: 700, color: 'var(--text)' }}>{t('total')}</span><Money value={o.total} className="v num" style={{ color: 'var(--accent-text)', fontSize: 16 }} /></div>
        </div>
        <div className="sect"><h4>{t('timeline')}</h4>
          {TS.filter((k) => o[k]).map((k) => (
            <div className="kv" key={k}><span className="k">{t('ts_' + k)}</span><span className="v num" style={{ fontSize: 12 }}>{fmt(o[k] as string)}</span></div>
          ))}
        </div>
      </div>
      <div className="drawer-ft">
        <button className="btn ghost" onClick={() => printReceipt(o)}>🖨 {t('printInv')}</button>
        <button className="btn ghost glyph" title={t('savePdf')} aria-label={t('savePdf')}
          onClick={() => printReceipt(o, 'pdf')}>📄</button>
        {o.paymentStatus === 'PAID'
          ? <button className="btn ghost" disabled>✓ {t('paid')}{o.paymentMethod ? ` · ${o.paymentMethod}` : ''}</button>
          : <button className="btn" disabled={pay.isPending} onClick={() => pay.mutate()}>{t('markPaid')}</button>}
      </div>
    </>
  );
}
