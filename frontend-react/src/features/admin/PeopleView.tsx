// Every account on the platform, and the two things support actually needs to do to one:
// get somebody back into their own account, and turn an account off.
//
// A locked-out owner used to be unfixable from here — the emailed reset link is useless to
// someone whose email is the thing they lost. The temporary password below is shown once,
// never stored in readable form, and the reset is written to the audit log.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useI18n, useT, nameOf, personName } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { PasswordReset, Restaurant, UserResponse } from '../../lib/types';
import { DICT } from './dict';
import { hue } from './shared';

export default function PeopleView({ restaurants }: { restaurants: Restaurant[] }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [resetting, setResetting] = useState<UserResponse | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<UserResponse[]>('/api/users'),
  });

  const cafes = useMemo(() => new Map(restaurants.map((r) => [r.id, r])), [restaurants]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = !q ? users : users.filter((u) => {
      const cafe = u.restaurantId ? cafes.get(u.restaurantId) : undefined;
      return [u.username, u.email, u.fullName, u.fullNameEn, u.fullNameAr,
              cafe?.nameEn, cafe?.nameAr, cafe?.slug]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
    // Platform admins first, then owners, then staff — the order support looks in.
    const rank = (u: UserResponse) =>
      u.permissions.includes('PLATFORM_ADMIN') ? 0 : u.owner ? 1 : 2;
    return [...matching].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  }, [users, query, cafes]);

  const toggle = useMutation({
    mutationFn: (u: UserResponse) =>
      api.patch<UserResponse>(`/api/users/${u.id}/${u.active ? 'deactivate' : 'activate'}`),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast(u.active ? t('enabled') : t('disabled'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="acontent">
      <div className="ph" style={{ marginBottom: 14 }}>{t('peopleSub')}</div>

      <div className="toolbar">
        <div className="search">🔎<input placeholder={t('peopleSearch')} value={query}
          onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="rslug">{rows.length} {t('of')} {users.length}</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>{t('peopleUser')}</th>
            <th>{t('peopleCafe')}</th>
            <th className="hide-xs">{t('peopleRole')}</th>
            <th>{t('peopleStatus')}</th>
            <th />
          </tr></thead>
          <tbody>
            {rows.map((u) => {
              const cafe = u.restaurantId ? cafes.get(u.restaurantId) : undefined;
              const isAdmin = u.permissions.includes('PLATFORM_ADMIN');
              return (
                <tr key={u.id} className="norow">
                  <td>
                    <div className="rcell">
                      <div className="rlogo" style={{ background: hue(u.id) }}>
                        {personName(u, lang).charAt(0)}
                      </div>
                      <div>
                        <div className="rname" dir="auto">{personName(u, lang)}</div>
                        <div className="rslug" dir="ltr">{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td dir="auto">{cafe ? nameOf(cafe, lang) : <span className="rslug">{t('peopleNoCafe')}</span>}</td>
                  <td className="hide-xs">
                    <span className={'chip ' + (isAdmin ? 'ent' : u.owner ? 'ok' : '')}>
                      <span className="d" />
                      {isAdmin ? t('peopleAdmin') : u.owner ? t('peopleOwner') : t('peopleStaff')}
                    </span>
                  </td>
                  <td>
                    <span className={'chip ' + (u.active ? 'ok' : u.pendingInvite ? 'warn' : '')}>
                      <span className="d" />
                      {u.active ? t('active') : u.pendingInvite ? t('peoplePending') : t('inactive')}
                    </span>
                  </td>
                  <td className="acts">
                    {/* Another admin's password and account are off limits here — an admin who
                        loses theirs uses the normal reset, so no one account can take the others. */}
                    {!isAdmin && (
                      <>
                        <button className="btn sm ghost" onClick={() => setResetting(u)}>{t('peopleReset')}</button>
                        <button className={'btn sm ' + (u.active ? 'danger' : '')}
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(u)}>
                          {u.active ? t('deactivate') : t('activate')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserResponse; onClose: () => void }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const [result, setResult] = useState<PasswordReset | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = useMutation({
    mutationFn: () => api.post<PasswordReset>(`/api/admin/users/${user.id}/reset-password`),
    onSuccess: setResult,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard is blocked in some browsers without a secure context; the password is
      // on screen anyway, which is the part that matters.
      toast(t('peopleResetDone'));
    }
  };

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('peopleResetT')}</h3>
        <div className="ph">{personName(user, lang)} · <span className="num" dir="ltr">{user.username}</span></div>

        {!result ? (
          <>
            <div className="ph">{t('peopleResetSub')}</div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
              <button className="btn" disabled={reset.isPending} onClick={() => reset.mutate()}>
                {reset.isPending ? '…' : t('peopleResetGo')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field"><label>{t('peopleResetDone')}</label>
              <div className="pw-reveal">
                <code dir="ltr">{result.temporaryPassword}</code>
                <button className="btn sm ghost" onClick={copy}>{copied ? t('peopleCopied') : t('peopleCopy')}</button>
              </div>
            </div>
            <div className="ph">{result.emailed ? t('peopleResetMailed') : t('peopleResetNotMailed')}</div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('closeBtn')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
