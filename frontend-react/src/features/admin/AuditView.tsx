// What the platform admins did, newest first.
//
// Read-only by design: an audit log you can tidy up is not an audit log. The rows carry the
// café's name as it was at the time rather than a live join, so the history still reads
// correctly after a café is renamed or an admin account is gone.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useT } from '../../lib/i18n';
import type { AuditEntry } from '../../lib/types';
import { DICT } from './dict';
import { ago } from './shared';

/** Actions worth colouring: the ones that took something away. */
const TONE: Record<string, string> = {
  CAFE_DEACTIVATED: 'bad',
  USER_DEACTIVATED: 'bad',
  PASSWORD_RESET: 'warn',
  IMPERSONATED: 'warn',
  BROADCAST_SENT: 'warn',
  CAFE_CREATED: 'ok',
  LEAD_CONVERTED: 'ok',
  PAYMENT_RECORDED: 'ok',
  CAFE_ACTIVATED: 'ok',
  CAFE_RENEWED: 'ok',
};

export default function AuditView({ onOpenCafe, focus = null, onClearFocus }: {
  onOpenCafe: (restaurantId: number) => void;
  /** A café carried in from its drawer: show only what was done to this one. */
  focus?: number | null;
  onClearFocus?: () => void;
}) {
  const t = useT(DICT);
  const { data: all = [] } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<AuditEntry[]>('/api/admin/audit?limit=200'),
    refetchInterval: 60_000,
  });
  const entries = focus == null ? all
    : all.filter((e) => e.targetType === 'RESTAURANT' && e.targetId === focus);
  const focusLabel = focus == null ? null
    : all.find((e) => e.targetId === focus && e.targetLabel)?.targetLabel ?? `#${focus}`;

  return (
    <div className="acontent">
      {focus != null ? (
        <div className="focus-bar">
          <span className="fb-t">{t('auditForCafe')}</span>
          <span className="fb-n" dir="auto">{focusLabel}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={onClearFocus}>{t('auditClearFocus')}</button>
        </div>
      ) : (
        <div className="ph" style={{ marginBottom: 14 }}>{t('auditSub')}</div>
      )}

      {entries.length === 0 ? (
        <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('auditEmpty')}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th className="when">{t('auditWhen')}</th>
              <th className="hide-xs">{t('auditWho')}</th>
              <th>{t('auditWhat')}</th>
              <th>{t('auditTarget')}</th>
              <th className="hide-sm">{t('auditDetail')}</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => {
                // A translated verb where we have one; the raw action is still better than
                // a blank cell when a new action lands before its translation does.
                const verb = t(`act_${e.action}`);
                const clickable = e.targetType === 'RESTAURANT' && e.targetId != null;
                return (
                  <tr key={e.id} className={clickable ? '' : 'norow'}
                    onClick={clickable ? () => onOpenCafe(e.targetId!) : undefined}>
                    <td className="when"><span className="num" title={new Date(e.at).toLocaleString()}>{ago(e.at, t)}</span></td>
                    <td className="hide-xs"><span className="num" dir="ltr">{e.actorName ?? '—'}</span></td>
                    <td>
                      <span className={'chip ' + (TONE[e.action] ?? '')}>
                        <span className="d" />{verb.startsWith('act_') ? e.action : verb}
                      </span>
                    </td>
                    <td dir="auto">{e.targetLabel ?? (e.targetId != null ? `#${e.targetId}` : t('none'))}</td>
                    <td className="hide-sm rslug" dir="ltr">{e.detail ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
