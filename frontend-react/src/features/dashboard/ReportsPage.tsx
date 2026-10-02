import { useEffect, useState } from 'react';
import { ApiError, fetchBlob } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { omanDate } from '../../lib/format';
import './reports.css';

/**
 * The daily report, one branch's day at a time. The owner walks the days with prev/next (or the
 * date field), sees the page inline, and opens or saves the PDF. The branch is whichever the
 * dashboard's own switcher has selected — reports never need a second one.
 */
export default function ReportsPage({ branchId }: { branchId?: number }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const today = omanDate();
  const [date, setDate] = useState(today);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = () => {
    const qs = new URLSearchParams({ date });
    if (branchId != null) qs.set('branchId', String(branchId));
    return `/api/dashboard/reports/daily?${qs.toString()}`;
  };

  // Fetch the day's PDF whenever the day or branch changes. The bytes ride an authed request, so
  // they become an object URL the <iframe> can show; the previous one is revoked on the way out.
  useEffect(() => {
    if (branchId == null) { setPdfUrl(null); setErr(null); return; }
    let cancelled = false;
    let objectUrl: string | undefined;
    setLoading(true);
    setErr(null);
    fetchBlob(url())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : (ar ? 'تعذّر إنشاء التقرير' : 'Could not build the report'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, date]);

  const pretty = new Date(date + 'T00:00:00').toLocaleDateString(ar ? 'ar' : 'en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="rpt">
      <div className="rpt-bar">
        <div className="rpt-nav" role="group" aria-label={ar ? 'اليوم' : 'Day'}>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}
            aria-label={ar ? 'تاريخ التقرير' : 'Report date'} />
        </div>
        <div className="rpt-day">{pretty}</div>
      </div>

      <div className="rpt-view">
        {branchId == null
          ? <div className="rpt-msg">{ar ? 'اختر فرعاً لعرض تقريره.' : 'Select a branch to see its report.'}</div>
          : err
            ? <div className="rpt-msg rpt-err">{err}</div>
            : (
              <>
                {loading && <div className="rpt-msg">{ar ? 'يُجهّز التقرير…' : 'Preparing report…'}</div>}
                {pdfUrl && !loading && (
                  <iframe className="rpt-frame" title={ar ? 'التقرير اليومي' : 'Daily report'} src={pdfUrl} />
                )}
              </>
            )}
      </div>
    </div>
  );
}
