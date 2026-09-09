import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT, Ltr, type Dict } from '../../lib/i18n';
import { useFeatures } from '../../lib/plan';
import type { LoyaltyProgram, LoyaltyMemberRow, Restaurant } from '../../lib/types';

const DICT: Dict = {
  ar: {
    proTitle: 'الولاء ليس ضمن باقتك', proSub: 'رقِّ باقتك لتشغيل بطاقة الأختام ومكافأة العملاء.',
    members: 'الأعضاء', noMembers: 'لا أعضاء بعد — سيظهرون هنا بمجرد جمع العملاء لأختامهم.', search: 'بحث بالاسم أو الجوال', noMatch: 'لا نتائج',
    stMembers: 'عضو', stReady: 'مكافأة متاحة', stRedeemed: 'مكافأة مستبدلة',
    cphone: 'الجوال', cname: 'الاسم', cstamps: 'الأختام', crewards: 'متاحة', clifetime: 'الإجمالي', credeemed: 'مستبدلة',
    loyaltySettings: 'إعدادات الولاء',
  },
  en: {
    proTitle: 'Loyalty is not part of your plan', proSub: 'Upgrade your plan to run a stamp card and reward your regulars.',
    members: 'Members', noMembers: 'No members yet — they’ll appear here once customers start collecting stamps.', search: 'Search name or phone', noMatch: 'No matches',
    stMembers: 'members', stReady: 'rewards available', stRedeemed: 'redeemed',
    cphone: 'Phone', cname: 'Name', cstamps: 'Stamps', crewards: 'Available', clifetime: 'Lifetime', credeemed: 'Redeemed',
    loyaltySettings: 'Loyalty settings',
  },
};

export default function LoyaltyPage({ onOpenSetup }: { onOpenSetup?: () => void }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);

  const features = useFeatures();
  const pro = features.has('LOYALTY');

  const programQ = useQuery({ queryKey: ['loyalty-program', rid], queryFn: () => api.get<LoyaltyProgram>('/api/loyalty/program'), enabled: pro });
  const membersQ = useQuery({ queryKey: ['loyalty-members', rid], queryFn: () => api.get<LoyaltyMemberRow[]>('/api/loyalty/members'), enabled: pro });

  const members = membersQ.data ?? [];

  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => m.phone.toLowerCase().includes(needle) || (m.name ?? '').toLowerCase().includes(needle));
  }, [members, q]);
  const stats = useMemo(() => ({
    members: members.length,
    ready: members.reduce((s, m) => s + m.availableRewards, 0),
    redeemed: members.reduce((s, m) => s + m.rewardsRedeemed, 0),
  }), [members]);

  if (!features.ready) {
    return <div className="tables-wrap"><div className="center"><div className="spinner" /></div></div>;
  }
  if (!pro) {
    return (
      <div className="tables-wrap">
        <div className="empty" style={{ marginTop: 56 }}>
          <div className="big">🎟️</div>
          <h3>{t('proTitle')}</h3>
          <p>{t('proSub')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tables-wrap loy-page">
      <section className="loy-people">
        <div className="loy-people-hd">
          <h3>{t('members')}</h3>
          <div className="loy-people-right">
            {members.length > 0 && (
              <div className="loy-figs">
                <span><b className="num">{stats.members}</b> {t('stMembers')}</span>
                <span><b className="num">{stats.ready}</b> {t('stReady')}</span>
                <span><b className="num">{stats.redeemed}</b> {t('stRedeemed')}</span>
              </div>
            )}
            {onOpenSetup && <button className="btn sm ghost" onClick={onOpenSetup}>⚙ {t('loyaltySettings')}</button>}
          </div>
        </div>

        {membersQ.isLoading ? (
          <div className="center"><div className="spinner" /></div>
        ) : members.length === 0 ? (
          <div className="empty"><div className="big">👥</div><p>{t('noMembers')}</p></div>
        ) : (
          <>
            <input className="loy-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('cphone')}</th><th>{t('cname')}</th><th>{t('cstamps')}</th>
                  <th>{t('crewards')}</th><th className="hide-sm">{t('clifetime')}</th><th className="hide-sm">{t('credeemed')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.phone}>
                    <td className="num"><Ltr>{m.phone}</Ltr></td>
                    <td>{m.name || '—'}</td>
                    <td className="num">{m.stamps}{programQ.data ? ` / ${programQ.data.stampsRequired}` : ''}</td>
                    <td className="num">{m.availableRewards || '—'}</td>
                    <td className="num hide-sm">{m.lifetimeStamps}</td>
                    <td className="num hide-sm">{m.rewardsRedeemed}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="loy-nomatch">{t('noMatch')}</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
