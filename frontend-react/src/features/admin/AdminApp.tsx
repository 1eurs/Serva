// The platform console shell: one screen per admin job, and the café drawer they all open.
//
// The views themselves live in their own files — this is the rail, the café table, and the
// drawer that every other view links into, so "show me that café" always lands in the same
// place no matter which screen asked.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, changeEmail, logout, startImpersonation, updateProfile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, nameOf, personName, Ltr } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { omr } from '../../lib/format';
import type { Lead, Restaurant, Subscription, SubscriptionStatus, BillingCycle, BranchResponse, AdminRestaurantStats, Plan, PricingPlan, CategoryResponse, MenuItemResponse, AuditEntry, Impersonation, PlanFeatureMatrix, Feature } from '../../lib/types';
import { IMPORT_SAMPLE, parseImport, normalizeGroups, type ImpCat } from '../../lib/menuImport';
import { BRAND } from '../../lib/brand';
import Login from '../auth/Login';
import { DICT } from './dict';
import { Kpi, ago, activation, hue, pulseClass, planLabelKey, SUB_CLASS as subClass, weekDelta } from './shared';
import PipelineView from './PipelineView';
import BillingView from './BillingView';
import PeopleView from './PeopleView';
import AuditView from './AuditView';
import HealthView from './HealthView';
import OnboardWizard from './OnboardWizard';
import './admin.css';

const SUB_STATUSES: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'];
const CYCLES: BillingCycle[] = ['MONTHLY', 'YEARLY', 'ONE_TIME'];

/** The rail, in the order an admin's day runs: who wants in → who is in → money → people → proof → health. */
const VIEWS = [
  { key: 'pipeline', icon: '📥', title: 'navPipeline', heading: 'pipelineTitle' },
  { key: 'restaurants', icon: '🏪', title: 'navRestaurants', heading: 'restaurants' },
  { key: 'billing', icon: '💰', title: 'navBilling', heading: 'billTitle' },
  { key: 'people', icon: '👤', title: 'navPeople', heading: 'peopleTitle' },
  { key: 'plans', icon: '💳', title: 'navPlans', heading: 'plansTitle' },
  { key: 'health', icon: '🩺', title: 'navHealth', heading: 'healthTitle' },
  { key: 'audit', icon: '🗒️', title: 'navAudit', heading: 'auditTitle' },
] as const;
type View = typeof VIEWS[number]['key'];

export default function AdminApp() {
  const { authed, user } = useAuth();
  const t = useT(DICT);
  if (!authed) return <Login mark={BRAND.name} title={t('loginTitle')} subtitle={t('loginSub')} />;
  if (!user?.permissions?.includes('PLATFORM_ADMIN')) return <Navigate to="/dashboard" replace />;
  return <AdminInner />;
}

function AdminInner() {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: raw } = useQuery({
    queryKey: ['admin-restaurants'],
    queryFn: () => api.get<any>('/api/admin/restaurants?size=500'),
  });
  const restaurants: Restaurant[] = Array.isArray(raw) ? raw : raw?.content ?? [];

  // Per-cafe activity (orders, revenue, last order, activation counts), one cheap grouped
  // query server-side. Every view reads this same map rather than asking per café.
  const { data: statsRaw } = useQuery({
    queryKey: ['admin-restaurant-stats'],
    queryFn: () => api.get<AdminRestaurantStats[]>('/api/admin/restaurants/stats'),
    refetchInterval: 60_000,
  });
  const stats = useMemo(() => new Map((statsRaw ?? []).map((s) => [s.restaurantId, s])), [statsRaw]);

  // The rail badge counts untouched requests. It shares the pipeline's own query rather than
  // fetching every lead a second time on a second timer.
  const { data: leadCount = 0 } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: () => api.get<Lead[]>('/api/admin/leads'),
    refetchInterval: 120_000,
    select: (leads) => leads.filter((l) => l.status === 'NEW').length,
  });

  const [view, setView] = useState<View>('restaurants');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [modal, setModal] = useState<'create' | 'sub' | null>(null);
  /** A café carried from its drawer into the billing or audit screen, so the link lands on
   *  that café's rows rather than on the whole platform's. Cleared from inside those views. */
  const [focusCafe, setFocusCafe] = useState<number | null>(null);

  /** Leave the drawer for a screen that can actually act on what the drawer only summarised. */
  const goView = (v: View, restaurantId: number) => {
    setFocusCafe(restaurantId);
    setSelected(null);
    setView(v);
  };

  /**
   * Every view links to a café the same way: open its drawer, wherever you were.
   *
   * The café is usually already in the loaded list, but not always — one just created from a
   * lead hasn't been refetched yet, and a café past the first page was never there. Falling
   * back to fetching it by id is the difference between the link working and doing nothing.
   */
  const openCafe = async (restaurantId: number) => {
    const known = restaurants.find((r) => r.id === restaurantId);
    if (known) { setSelected(known); return; }
    try {
      setSelected(await api.get<Restaurant>(`/api/admin/restaurants/${restaurantId}`));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Error');
    }
  };

  const kpis = useMemo(() => {
    const now = new Date();
    const total = restaurants.length;
    const active = restaurants.filter((r) => r.active).length;
    const fresh = restaurants.filter((r) => r.createdAt && new Date(r.createdAt).getMonth() === now.getMonth() && new Date(r.createdAt).getFullYear() === now.getFullYear()).length;
    const orders30 = (statsRaw ?? []).reduce((s, x) => s + x.orders30d, 0);
    const revenue30 = (statsRaw ?? []).reduce((s, x) => s + Number(x.revenue30d || 0), 0);
    return { total, active, inactive: total - active, fresh, orders30, revenue30 };
  }, [restaurants, statsRaw]);

  const rows = restaurants
    .filter((r) => filter === 'all' || (filter === 'active' ? r.active : !r.active))
    // Search both names whatever the UI language: an admin looking for "قهوة مطرح" while the
    // console is in English (or the reverse) is the normal case, not the exception.
    .filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return [r.nameEn, r.nameAr, r.name, r.slug].some((v) => (v ?? '').toLowerCase().includes(q));
    });

  const toggleActive = useMutation({
    mutationFn: (r: Restaurant) => api.patch<Restaurant>(`/api/admin/restaurants/${r.id}/${r.active ? 'deactivate' : 'activate'}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      qc.invalidateQueries({ queryKey: ['admin-billing'] });
      setSelected(r);
      toast(r.active ? t('enabled') : t('disabled'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const current = VIEWS.find((v) => v.key === view)!;

  return (
    <div className="adm">
      <aside className="arail">
        <div className="logo">S.</div>
        <nav className="nav">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? 'on' : ''} title={t(v.title)}
              onClick={() => setView(v.key)}>
              {v.icon}
              {v.key === 'pipeline' && leadCount > 0 && <span className="nbadge">{leadCount}</span>}
            </button>
          ))}
        </nav>
        <button className="out" title={t('logoutT')} onClick={() => logout()}>⏻</button>
      </aside>

      <div className="amain">
        <div className="atop">
          <div>
            <h2>{t(current.heading)}</h2>
            <div className="crumb" dir="ltr">/admin{view === 'restaurants' ? '' : `/${view}`}</div>
          </div>
          <div className="spacer" />
          <AdminAccountMenu t={t} />
        </div>

        {view === 'pipeline' && <PipelineView onOpenCafe={(id) => { setView('restaurants'); openCafe(id); }} />}
        {view === 'billing' && (
          <BillingView focus={focusCafe} onClearFocus={() => setFocusCafe(null)}
            onOpenCafe={(id) => { setView('restaurants'); openCafe(id); }} />
        )}
        {view === 'people' && <PeopleView restaurants={restaurants} />}
        {view === 'plans' && <PlansView t={t} />}
        {view === 'audit' && (
          <AuditView focus={focusCafe} onClearFocus={() => setFocusCafe(null)}
            onOpenCafe={(id) => { setView('restaurants'); openCafe(id); }} />
        )}
        {view === 'health' && (
          <HealthView restaurants={restaurants} stats={stats}
            onOpenCafe={(id) => { setView('restaurants'); openCafe(id); }} />
        )}

        {view === 'restaurants' && (
        <div className="acontent">
          <div className="kpis">
            <Kpi color="var(--accent)" label={t('kTotal')} val={kpis.total} />
            <Kpi color="var(--green)" label={t('kActive')} val={kpis.active} />
            <Kpi color="var(--bad)" label={t('kInactive')} val={kpis.inactive} />
            <Kpi color="var(--blue)" label={t('kNew')} val={kpis.fresh} />
            <Kpi color="var(--amber)" label={t('kOrders30')} val={kpis.orders30} />
            <Kpi color="var(--green)" label={t('kRevenue30')} val={`${omr(kpis.revenue30)} ${t('cur')}`} />
          </div>

          <div className="toolbar">
            <div className="search">🔎<input placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="seg">
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{t(f)}</button>
              ))}
            </div>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setModal('create')}>{t('newR')}</button>
          </div>

          <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t('thName')}</th><th className="hide-sm">{t('thContact')}</th>
              <th className="hide-xs">{t('actTitle')}</th>
              <th>{t('thOrders30')}</th><th className="hide-sm">{t('thRevenue30')}</th>
              <th className="hide-xs">{t('thLastOrder')}</th><th>{t('thStatus')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = stats.get(r.id);
                const steps = activation(s);
                const done = steps.filter((x) => x.done).length;
                const delta = weekDelta(s);
                return (
                  <tr key={r.id} onClick={() => setSelected(r)}>
                    <td><div className="rcell"><div className="rlogo" style={{ background: hue(r.id) }}>{nameOf(r, lang).charAt(0)}</div>
                      <div><div className="rname" dir="auto">{nameOf(r, lang)}</div><div className="rslug">{r.slug}</div></div></div></td>
                    <td className="hide-sm"><div><Ltr>{r.phone || '—'}</Ltr></div><div className="rslug"><Ltr>{r.email || ''}</Ltr></div></td>
                    <td className="hide-xs"><ActivationDots steps={steps} done={done} t={t} /></td>
                    <td><span className="num" style={{ fontWeight: 600 }}>{s ? s.orders30d : '—'}</span>
                      {delta != null && Math.abs(delta) >= 15 && (
                        <span className={'rslug trend ' + (delta > 0 ? 'up' : 'down')}> {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}%</span>
                      )}
                      {s && s.ordersToday > 0 && <span className="rslug"> · {t('aToday')}: <span className="num">{s.ordersToday}</span></span>}</td>
                    <td className="hide-sm"><span className="num">{s ? `${omr(Number(s.revenue30d))} ${t('cur')}` : '—'}</span></td>
                    <td className="hide-xs"><span className={'chip ' + pulseClass(s?.lastOrderAt)}><span className="d" />{ago(s?.lastOrderAt, t)}</span></td>
                    <td><span className={'chip ' + (r.active ? 'ok' : '')}><span className="d" />{r.active ? t('active') : t('inactive')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        )}
      </div>

      <div className={'drawer-bg' + (selected ? ' open' : '')} onClick={() => setSelected(null)} />
      <aside className={'drawer' + (selected ? ' open' : '')}>
        {selected && <DrawerBody r={selected} stats={stats.get(selected.id)} onToggle={() => toggleActive.mutate(selected)}
          onUpdated={setSelected} onClose={() => setSelected(null)}
          onGoBilling={() => goView('billing', selected.id)}
          onGoHistory={() => goView('audit', selected.id)}
          onEditSub={() => setModal('sub')} />}
      </aside>

      {modal === 'create' && (
        <OnboardWizard
          onClose={() => setModal(null)}
          onDone={(created) => {
            qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
            qc.invalidateQueries({ queryKey: ['admin-restaurant-stats'] });
            qc.invalidateQueries({ queryKey: ['admin-audit'] });
            setModal(null);
            toast(t('createdOk'));
            setSelected(created);
          }}
        />
      )}
      {modal === 'sub' && selected && <SubModal restaurant={selected} onClose={() => setModal(null)} onDone={() => { qc.invalidateQueries({ queryKey: ['sub', selected.id] }); qc.invalidateQueries({ queryKey: ['admin-billing'] }); setModal(null); toast(t('saved')); }} />}
    </div>
  );
}

/** Five dots: owner, branch, menu, QR tables, first order. Filled means done. */
function ActivationDots({ steps, done, t }: {
  steps: ReturnType<typeof activation>; done: number; t: (k: string) => string;
}) {
  return (
    <div className="actdots" title={steps.map((s) => `${t(s.key)}: ${s.count}`).join(' · ')}>
      {steps.map((s) => <i key={s.key} className={s.done ? 'on' : ''} />)}
      <span className="rslug">{done === steps.length ? t('actLive') : `${done}/${steps.length}`}</span>
    </div>
  );
}

function AdminAccountMenu({ t }: { t: (k: string) => string }) {
  const { user } = useAuth();
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (personName(user, lang) || 'PA').split(' ').map((s) => s[0]).slice(0, 2).join('');
  const roleLabel = t('role_PLATFORM_ADMIN');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="who" ref={ref}>
      <button className="who-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <div className="av">{initials}</div>
        <div className="who-txt"><div className="nm">{personName(user, lang)}</div><div className="rl">{roleLabel}</div></div>
        <span className="who-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <div className="av lg">{initials}</div>
            <div className="acct-id">
              <div className="acct-name">{personName(user, lang)}</div>
              <div className="acct-mail" title={user?.email ?? user?.username}>{user?.email ?? user?.username}</div>
              <span className="acct-role">{roleLabel}</span>
            </div>
          </div>
          <div className="acct-sep" />
          <button className="acct-item" role="menuitem" onClick={() => { setOpen(false); setProfileOpen(true); }}>
            <span className="ai-ic">👤</span>{t('editProfile')}
          </button>
          <button className="acct-item" role="menuitem" onClick={() => { setOpen(false); setPwOpen(true); }}>
            <span className="ai-ic">🔒</span>{t('changePassword')}
          </button>
          <button className="acct-item" role="menuitem" onClick={() => { setOpen(false); setEmailOpen(true); }}>
            <span className="ai-ic">@</span>{t('changeEmail')}
          </button>
          <div className="acct-sep" />
          <div className="acct-lang" role="group" aria-label={t('language')}>
            <span>{t('language')}</span>
            <div className="acct-lang-btns">
              <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>{t('arabic')}</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>{t('english')}</button>
            </div>
          </div>
          <button className="acct-item danger" role="menuitem" onClick={() => logout()}>
            <span className="ai-ic">⏻</span>{t('logoutT')}
          </button>
        </div>
      )}
      {profileOpen && <EditProfileModal t={t} onClose={() => setProfileOpen(false)} />}
      {pwOpen && <ChangePasswordModal t={t} onClose={() => setPwOpen(false)} />}
      {emailOpen && <ChangeEmailModal t={t} onClose={() => setEmailOpen(false)} />}
    </div>
  );
}

function EditProfileModal({ t, onClose }: { t: (k: string) => string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [nameAr, setNameAr] = useState(user!.fullNameAr ?? '');
  const [nameEn, setNameEn] = useState(user!.fullNameEn ?? '');
  const [phone, setPhone] = useState(user!.phone ?? '');
  const ar = nameAr.trim();
  const en = nameEn.trim();
  const phoneValue = phone.trim();

  const save = useMutation({
    mutationFn: () => updateProfile({ fullNameEn: en, fullNameAr: ar }, phoneValue || null),
    onSuccess: () => { toast(t('profileSaved')); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const unchanged = ar === (user!.fullNameAr ?? '') && en === (user!.fullNameEn ?? '')
    && phoneValue === (user!.phone ?? '');
  const canSave = (ar.length > 0 || en.length > 0) && !unchanged && !save.isPending;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('editProfile')}</h3>
        <div className="ph">{t('editProfileSub')}</div>
        <div className="pwform">
          <input className="input" autoComplete="name" placeholder={t('fullNameAr')} lang="ar" dir="rtl"
            value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          <input className="input" autoComplete="name" placeholder={t('fullNameEn')} lang="en" dir="ltr"
            value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <input className="input num" autoComplete="tel" placeholder={t('phone')}
            value={phone} onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save.mutate(); }} />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ t, onClose }: { t: (k: string) => string; onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword: cur, newPassword: next }),
    onSuccess: () => { toast(t('pwChanged')); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = !!cur && next.length >= 8 && next === confirm && !change.isPending;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('changePassword')}</h3>
        <div className="ph">{t('changePwSub')}</div>
        <div className="pwform">
          <input className="input" type="password" autoComplete="current-password" placeholder={t('currentPw')}
            value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" autoComplete="new-password" placeholder={t('newPw')}
            value={next} onChange={(e) => setNext(e.target.value)} />
          {tooShort && <div className="pwhint bad">{t('pwTooShort')}</div>}
          <input className="input" type="password" autoComplete="new-password" placeholder={t('confirmPw')}
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) change.mutate(); }} />
          {mismatch && <div className="pwhint bad">{t('pwMismatch')}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!canSave} onClick={() => change.mutate()}>{change.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

function ChangeEmailModal({ t, onClose }: { t: (k: string) => string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState(user!.email ?? '');
  const email = next.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const change = useMutation({
    mutationFn: () => changeEmail(cur, email),
    onSuccess: () => { toast(t('emailChanged')); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const invalid = email.length > 0 && !validEmail;
  const unchanged = email.toLowerCase() === (user!.email ?? '').toLowerCase();
  const canSave = !!cur && validEmail && !unchanged && !change.isPending;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('changeEmail')}</h3>
        <div className="ph">{t('changeEmailSub')}</div>
        <div className="pwform">
          <input className="input" type="password" autoComplete="current-password" placeholder={t('currentPw')}
            value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="email" autoComplete="username" placeholder={t('newEmail')}
            value={next} onChange={(e) => setNext(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) change.mutate(); }} />
          {invalid && <div className="pwhint bad">{t('emailInvalid')}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!canSave} onClick={() => change.mutate()}>{change.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The café drawer: what this café *is* right now, and the things only this café can be done to.
 *
 * It used to carry eight stacked sections — details, activation, activity, subscription,
 * payment history, branches, menu, audit — plus four footer buttons of unrelated weight, which
 * came to 2.8 screens of scrolling in a 420px column. Most of it was read-only copies of
 * screens that already exist: payments are the billing board's job, history is the audit log's.
 * Those are now two links that carry the café with them, so the work happens where the rest of
 * the context is instead of in a column too narrow to act in.
 *
 * What stays is what is true only here: is it live, is it selling, its branches, and the one
 * action you open a café to take.
 */
function DrawerBody({ r, stats, onToggle, onUpdated, onClose, onGoBilling, onGoHistory, onEditSub }: {
  r: Restaurant; stats?: AdminRestaurantStats; onToggle: () => void;
  onUpdated: (r: Restaurant) => void; onClose: () => void;
  onGoBilling: () => void; onGoHistory: () => void;
  /** Set a café's plan, cycle, price and status — or give it its first subscription. Rare, and
   *  the only route to it: the billing board is built from subscriptions, so a café without
   *  one has no row there to act on. */
  onEditSub: () => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const { data: sub } = useQuery({
    queryKey: ['sub', r.id],
    queryFn: async (): Promise<Subscription | null> => {
      try { return await api.get<Subscription>(`/api/admin/restaurants/${r.id}/subscription`); }
      catch (e) { if (e instanceof ApiError && e.httpStatus === 404) return null; throw e; }
    },
    retry: false,
  });
  // One entry, only to date the "last change" line. The log itself lives in the audit view.
  const { data: history = [] } = useQuery({
    queryKey: ['admin-audit', 'RESTAURANT', r.id],
    queryFn: () => api.get<AuditEntry[]>(`/api/admin/audit?targetType=RESTAURANT&targetId=${r.id}&limit=1`),
  });

  const { data: branchesRaw } = useQuery({
    queryKey: ['admin-branches', r.id],
    queryFn: () => api.get<any>(`/api/restaurants/${r.id}/branches`),
    retry: false,
  });
  const branches: BranchResponse[] = (branchesRaw ?? []) as BranchResponse[];

  const [bNameAr, setBNameAr] = useState('');
  const [bNameEn, setBNameEn] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmEnter, setConfirmEnter] = useState(false);
  const branchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setMoreOpen(false); }, [r.id]);

  // Entering a café swaps this tab's session for a half-hour one belonging to the café's owner
  // and lands on their dashboard. The admin's own session is parked, not discarded.
  const enterCafe = useMutation({
    mutationFn: () => api.post<Impersonation>(`/api/admin/restaurants/${r.id}/impersonate`),
    onSuccess: (imp) => {
      if (!startImpersonation(imp)) { toast('Error'); return; }
      qc.clear(); // every cached query belongs to the admin, not to the café we just became
      toast(t('impStarted'));
      navigate('/dashboard');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  // An unnamed branch inherits the café's own pair, so it reads correctly in both UIs
  // instead of arriving as an Arabic name stranded in an English page.
  const addBranch = useMutation({
    mutationFn: () => api.post<BranchResponse>(`/api/restaurants/${r.id}/branches`,
      bNameAr.trim() || bNameEn.trim()
        ? { nameAr: bNameAr.trim() || null, nameEn: bNameEn.trim() || null }
        : { nameAr: r.nameAr ?? null, nameEn: r.nameEn ?? null, name: r.name }),
    onSuccess: () => { setBNameAr(''); setBNameEn(''); qc.invalidateQueries({ queryKey: ['admin-branches', r.id] }); qc.invalidateQueries({ queryKey: ['admin-restaurant-stats'] }); toast(t('branchAddOk')); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  const toggleBranch = useMutation({
    mutationFn: (b: BranchResponse) => api.patch<BranchResponse>(`/api/branches/${b.id}/${b.active ? 'deactivate' : 'activate'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-branches', r.id] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const steps = activation(stats);
  const doneCount = steps.filter((s) => s.done).length;
  const live = doneCount === steps.length;

  /**
   * A step only offers a button where the console can genuinely finish it. Menu items import
   * here; a branch is added by the block below. Owners, tables and the first order are the
   * café's own work — the honest answer there is to enter the café, which the footer already is.
   */
  const fixFor = (key: string): (() => void) | null => {
    if (key === 'actMenu') return () => setImportOpen(true);
    if (key === 'actBranch') return () => branchInput.current?.focus();
    return null;
  };

  const isOneTime = sub?.billingCycle === 'ONE_TIME';
  const daysLeft = sub?.endDate ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000) : null;
  const subTone = !sub ? '' : daysLeft == null ? 'ok' : daysLeft < 0 ? 'bad' : daysLeft <= 14 ? 'warn' : 'ok';
  /* Only the date. The tier is already a chip in the header above, and it used to be repeated
     here as sub.planName — a database string in whichever language it was typed, so an Arabic
     drawer read back "Annual". One tier, named once. */
  const subLine = !sub ? t('dwNoSub')
    : isOneTime || !sub.endDate ? t('lifetime')
    : `${t('dwPaidTo')} ${sub.endDate}`;

  return (
    <>
      <div className="drawer-hd">
        <div className="rlogo" style={{ background: hue(r.id), width: 42, height: 42, fontSize: 18 }}>{nameOf(r, lang).charAt(0)}</div>
        <div className="dw-id">
          <div className="dw-name" dir="auto">{nameOf(r, lang)}</div>
          <div className="dw-meta">
            <span className="rslug">{r.slug}</span>
            <span className={'chip ' + (r.active ? 'ok' : '')}><span className="d" />{r.active ? t('active') : t('inactive')}</span>
            <span className={'chip plan ' + (r.plan === 'PRO' ? 'ok' : r.plan === 'ENTERPRISE' ? 'ent' : '')}>
              <span className="d" />{t(planLabelKey(r.plan))}
            </span>
          </div>
        </div>
        <button className="x" onClick={onClose} aria-label={t('close')}>✕</button>
      </div>

      <div className="drawer-bd">
        {/* ── the spine: what this café still needs before anyone can order ───────── */}
        <div className="sect">
          <div className={'dw-live ' + (live ? 'on' : '')}>
            <span className="chip"><span className="d" />{live ? t('dwLive') : t('dwNotLive')}</span>
            {!live && <span className="num dw-prog">{doneCount} {t('dwStepsDone')}</span>}
          </div>
          <div className="checklist">
            {steps.map((step) => {
              const fix = step.done ? null : fixFor(step.key);
              return (
                <div className={'chk' + (step.done ? ' on' : '')} key={step.key}>
                  <span className="box">{step.done ? '✓' : ''}</span>
                  <span className="lbl">{t(step.key)}</span>
                  {fix
                    ? <button className="dw-fix" onClick={fix}>{t('dwFix')}</button>
                    : <span className="num cnt">{step.count}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── is it selling? three numbers, not seven rows ────────────────────────── */}
        <div className="sect">
          <div className="dw-stats">
            <div><span className="num">{stats?.ordersToday ?? 0}</span><em>{t('dwToday')}</em></div>
            <div><span className="num">{stats?.orders30d ?? 0}</span><em>{t('dw30d')}</em></div>
            <div><span className="num">{omr(Number(stats?.revenue30d ?? 0))}</span><em>{t('dwRev')}</em></div>
          </div>
          <div className="dw-last">
            <span>{t('aLast')}</span>
            <span className={'chip ' + pulseClass(stats?.lastOrderAt)}><span className="d" />{ago(stats?.lastOrderAt, t)}</span>
          </div>
        </div>

        {/* ── branches: nothing else in the console owns these ────────────────────── */}
        <div className="sect">
          <h4>{t('branches')}<span className="sect-count">{branches.length}</span></h4>
          <div className="branch-list">
            {branches.length === 0 && <div className="subbox" style={{ color: 'var(--faint)', fontSize: 13 }}>{t('noBranches')}</div>}
            {branches.map((b) => (
              <div className="branch-row" key={b.id}>
                <div className="b-info"><div className="b-name" dir="auto">{nameOf(b, lang)}</div>
                  {b.address && <div className="rslug"><bdi>{b.address}</bdi>{b.phone ? <> · <Ltr>{b.phone}</Ltr></> : ''}</div>}</div>
                <button className={'chip btn-chip ' + (b.active ? 'ok' : '')} onClick={() => toggleBranch.mutate(b)} title={b.active ? t('deactivateBranch') : t('activateBranch')}>
                  <span className="d" />{b.active ? t('active') : t('inactive')}
                </button>
              </div>
            ))}
          </div>
          <div className="branch-add">
            <input ref={branchInput} placeholder={t('branchNameAr')} value={bNameAr} lang="ar"
              onChange={(e) => setBNameAr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !addBranch.isPending) addBranch.mutate(); }} />
            <input placeholder={t('branchNameEn')} value={bNameEn} lang="en" dir="ltr"
              onChange={(e) => setBNameEn(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !addBranch.isPending) addBranch.mutate(); }} />
            <button className="btn sm" disabled={addBranch.isPending} onClick={() => addBranch.mutate()}>
              {addBranch.isPending ? t('branchAdding') : t('branchesAdd')}
            </button>
          </div>
        </div>

        {/* ── two doors out, each carrying this café with it ──────────────────────── */}
        <div className="sect">
          <button className="dw-link" onClick={onGoBilling}>
            <span className="dl-t">{t('dwGoBilling')}</span>
            <span className={'dl-s chip ' + subTone}><span className="d" />{subLine}</span>
            <span className="dl-a" aria-hidden="true">›</span>
          </button>
          <button className="dw-link" onClick={onGoHistory}>
            <span className="dl-t">{t('dwGoHistory')}</span>
            <span className="dl-s rslug">
              {history[0] ? `${t('dwLastChange')} ${ago(history[0].at, t)}` : t('dwNoChange')}
            </span>
            <span className="dl-a" aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      {/* ── one action, and a quiet home for the rare and the destructive ─────────── */}
      <div className="drawer-ft">
        <button className="btn" onClick={() => setConfirmEnter(true)}>{t('impEnter')}</button>
        <div className="dw-more">
          <button className="btn ghost dw-more-btn" aria-haspopup="menu" aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)} title={t('dwMore')}>⋯</button>
          {moreOpen && (
            <>
              <div className="dw-more-bg" onClick={() => setMoreOpen(false)} />
              <div className="dw-menu" role="menu">
                <button role="menuitem" onClick={() => { setMoreOpen(false); setDetailsOpen(true); }}>{t('dwDetails')}</button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); onEditSub(); }}>{sub ? t('editSub') : t('addSub')}</button>
                <button role="menuitem" className={r.active ? 'danger' : ''} onClick={() => { setMoreOpen(false); onToggle(); }}>
                  {r.active ? t('deactivate') : t('activate')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {detailsOpen && <CafeDetailsModal r={r} onClose={() => setDetailsOpen(false)} onUpdated={onUpdated} />}
      {importOpen && <MenuImportModal restaurantId={r.id} restaurantName={nameOf(r, lang)} onClose={() => setImportOpen(false)} />}
      {confirmEnter && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setConfirmEnter(false); }}>
          <div className="modal-card">
            <h3>{t('impTitle')}</h3>
            <div className="ph" dir="auto">{nameOf(r, lang)}</div>
            <div className="ph">{t('impSub')}</div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmEnter(false)}>{t('cancel')}</button>
              <button className="btn" disabled={enterCafe.isPending} onClick={() => enterCafe.mutate()}>
                {enterCafe.isPending ? '…' : t('impGo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Everything about a café that is reference rather than glance: both names, its plan, and the
 * settings an admin reads out loud on a support call.
 *
 * Editing lives here rather than at the top of the drawer so that opening a café is a read, not
 * a half-filled form. The plan is a select for the same reason it used to be a chip you clicked
 * to cycle: that chip changed a paying customer's plan on a mis-click, with no way to see the
 * options first.
 */
function CafeDetailsModal({ r, onClose, onUpdated }: {
  r: Restaurant; onClose: () => void; onUpdated: (r: Restaurant) => void;
}) {
  const t = useT(DICT);
  const qc = useQueryClient();
  const toast = useToast();
  const [nameAr, setNameAr] = useState(r.nameAr ?? '');
  const [nameEn, setNameEn] = useState(r.nameEn ?? '');

  const dirty = nameAr.trim() !== (r.nameAr ?? '') || nameEn.trim() !== (r.nameEn ?? '');
  const named = !!(nameAr.trim() || nameEn.trim());

  const save = useMutation({
    mutationFn: async () => {
      return api.patch<Restaurant>(`/api/admin/restaurants/${r.id}`,
        { nameAr: nameAr.trim(), nameEn: nameEn.trim() });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
      qc.invalidateQueries({ queryKey: ['admin-billing'] });
      qc.invalidateQueries({ queryKey: ['admin-audit'] });
      onUpdated(updated);
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{t('dwDetails')}</h3>
        <div className="row2">
          <div className="field"><label>{t('rNameAr')}</label>
            <input value={nameAr} lang="ar" dir="rtl" onChange={(e) => setNameAr(e.target.value)} /></div>
          <div className="field"><label>{t('rNameEn')}</label>
            <input value={nameEn} lang="en" dir="ltr" onChange={(e) => setNameEn(e.target.value)} /></div>
        </div>
        <div className="dw-ref">
          {/* Read-only here on purpose. The tier is what the café's subscription buys, so it
              changes in one place — Edit subscription — where the price moves with it. */}
          <div className="kv"><span className="k">{t('rPlan')}</span><span className="v">
            <span className={'chip plan ' + (r.plan === 'PRO' ? 'ok' : r.plan === 'ENTERPRISE' ? 'ent' : '')}>
              <span className="d" />{t(planLabelKey(r.plan))}
            </span>
            <span className="rslug" style={{ marginInlineStart: 8 }}>{t('tierFromSub')}</span>
          </span></div>
          <div className="kv"><span className="k">{t('slug')}</span><span className="v num">{r.slug}</span></div>
          <div className="kv"><span className="k">{t('phone')}</span><span className="v num"><Ltr>{r.phone || '—'}</Ltr></span></div>
          <div className="kv"><span className="k">{t('email')}</span><span className="v" dir="ltr">{r.email || '—'}</span></div>
          <div className="kv"><span className="k">{t('currency')}</span><span className="v num">{r.currency}</span></div>
          <div className="kv"><span className="k">{t('vat')}</span><span className="v num">{r.vatEnabled ? `${r.vatRate}%` : '—'}</span></div>
          <div className="kv"><span className="k">{t('created')}</span><span className="v num">{r.createdAt?.slice(0, 10)}</span></div>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!dirty || !named || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubModal({ restaurant, onClose, onDone }: { restaurant: Restaurant; onClose: () => void; onDone: () => void }) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const { data: existing } = useQuery({
    queryKey: ['sub', restaurant.id],
    queryFn: async (): Promise<Subscription | null> => {
      try { return await api.get<Subscription>(`/api/admin/restaurants/${restaurant.id}/subscription`); }
      catch (e) { if (e instanceof ApiError && e.httpStatus === 404) return null; throw e; }
    },
    retry: false,
  });
  const { data: catalogue } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<PricingPlan[]>('/api/admin/plans'),
  });
  const [f, setF] = useState({ tier: 'PRO' as Plan, billingCycle: 'MONTHLY' as BillingCycle, price: '25', status: 'ACTIVE' as SubscriptionStatus });
  // hydrate from existing once loaded
  useEffect(() => { if (existing) setF({ tier: existing.tier, billingCycle: existing.billingCycle, price: String(existing.price), status: existing.status }); }, [existing]);
  // Pick a tier → takes its catalogue price too. A custom-priced tier keeps whatever is typed.
  const pickPlan = (p: PricingPlan) => setF((s) => ({ ...s, tier: p.tier, price: p.monthlyPrice == null ? s.price : String(p.monthlyPrice) }));
  // ONE_TIME is a negotiated number, so it belongs to the only tier that has one.
  const cycles = f.tier === 'ENTERPRISE' ? CYCLES : CYCLES.filter((c) => c !== 'ONE_TIME');
  /* Cycle only sets the cycle. It used to also rewrite the plan to "Lifetime" on ONE_TIME,
     which is how a billing cycle ended up stored in the field that decided feature access. */
  const setCycle = (billingCycle: BillingCycle) => {
    setF((p) => ({
      ...p,
      billingCycle,
      status: billingCycle === 'ONE_TIME' && p.status === 'TRIAL' ? 'ACTIVE' : p.status,
    }));
  };
  // Saving this is what moves the gate, so say so before it is clicked rather than after.
  const tierChanged = !!existing && existing.tier !== f.tier;
  const activePlans = (catalogue ?? []).filter((p) => p.active);
  const hasCatalogue = activePlans.length > 0;
  /* Only Enterprise is negotiable. For Standard and Pro the server derives the price from the
     catalogue and ignores whatever is sent, so the box is shown filled and read-only rather
     than editable-but-quietly-overruled. */
  const negotiable = f.tier === 'ENTERPRISE';
  const listMonthly = activePlans.find((p) => p.tier === f.tier)?.monthlyPrice ?? null;
  const derivedPrice = listMonthly == null ? null
    : f.billingCycle === 'YEARLY' ? listMonthly * 12 : listMonthly;
  const shownPrice = negotiable ? f.price : (derivedPrice != null ? omr(derivedPrice) : '—');

  const save = useMutation({
    mutationFn: () => {
      const body = { tier: f.tier, billingCycle: f.billingCycle, price: Number(f.price), status: f.status,
        startDate: existing?.startDate ?? new Date().toISOString().slice(0, 10) };
      return existing
        ? api.patch(`/api/admin/subscriptions/${existing.id}`, body)
        : api.post(`/api/admin/restaurants/${restaurant.id}/subscription`, body);
    },
    onSuccess: onDone,
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3>{existing ? t('editSub') : t('addSub')}</h3><div className="ph">{nameOf(restaurant, lang)}</div>
        {hasCatalogue && (
          <div className="plan-pick">
            <span className="plan-pick-lbl">{t('choosePlan')}</span>
            <div className="plan-pick-row">
              {activePlans.map((p) => (
                <button key={p.id} type="button"
                  className={'plan-pick-card' + (f.tier === p.tier ? ' on' : '')}
                  onClick={() => pickPlan(p)}>
                  <span className="pp-name">{p.name}</span>
                  <span className="pp-price">{p.monthlyPrice == null ? <b>{t('custom')}</b> : <><b>{omr(p.monthlyPrice)}</b> {t('cur')}{t('perMo')}</>}</span>
                  <span className="pp-setup">+{omr(p.setupFee)} {t('setupShort')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="row2">
          {/* The cards above already choose the tier, and they show what it costs while doing it.
              This select is the fallback for an empty catalogue — with the cards on screen it
              would be a second control for one value, which is the shape of the bug this whole
              change is about. It replaces a free-text box either way: the value decides what the
              café can open, so it can only be one of the three tiers that mean something. */}
          {!hasCatalogue && (
            <div className="field"><label>{t('plan')}</label>
              <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as Plan })}>
                {(['STANDARD', 'PRO', 'ENTERPRISE'] as Plan[]).map((p) => (
                  <option key={p} value={p}>{t(planLabelKey(p))}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field"><label>{t('price')} ({t('cur')})</label>
            {negotiable
              ? <input className="num" type="number" step="0.001" value={f.price}
                       onChange={(e) => setF({ ...f, price: e.target.value })} />
              : <input className="num" value={shownPrice} readOnly aria-readonly="true" title={t('priceFromPlan')} />}
            {!negotiable && <span className="field-hint">{t('priceFromPlan')}</span>}
          </div>
        </div>
        {tierChanged && (
          <div className="tier-warn">{t('tierChangeWarn')}</div>
        )}
        <div className="row2">
          <div className="field"><label>{t('cycle')}</label><select value={f.billingCycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>{cycles.map((c) => <option key={c} value={c}>{t(`cyc_${c}`)}</option>)}</select></div>
          <div className="field"><label>{t('status')}</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SubscriptionStatus })}>{SUB_STATUSES.map((s) => <option key={s} value={s}>{t(`sub${s}`)}</option>)}</select></div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

/** What each tier unlocks — keeps the gating visible right next to the price. */
const tierDesc = (tier: Plan, t: (k: string) => string) =>
  tier === 'STANDARD' ? t('tierStdDesc') : tier === 'ENTERPRISE' ? t('tierEntDesc') : t('tierProDesc');

/**
 * Pricing for the three fixed café tiers (STANDARD / PRO / ENTERPRISE). The tiers
 * are always present and drive feature-gating; here a platform admin edits each
 * tier's display name, monthly price (blank = "custom"), setup fee, and visibility.
 */
function PlansView({ t }: { t: (k: string) => string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<PricingPlan[]>('/api/admin/plans'),
  });

  type Draft = { name: string; monthlyPrice: string; setupFee: string; active: boolean };
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', monthlyPrice: '', setupFee: '', active: true });

  const startEdit = (p: PricingPlan) => {
    setEditing(p.id);
    setDraft({ name: p.name, monthlyPrice: p.monthlyPrice == null ? '' : String(p.monthlyPrice), setupFee: String(p.setupFee), active: p.active });
  };

  const save = useMutation({
    mutationFn: (id: number) => {
      const priceBlank = draft.monthlyPrice.trim() === '';
      return api.patch(`/api/admin/plans/${id}`, {
        name: draft.name.trim(),
        monthlyPrice: priceBlank ? null : Number(draft.monthlyPrice),
        clearMonthlyPrice: priceBlank,
        setupFee: Number(draft.setupFee || 0),
        active: draft.active,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); toast(t('planSaved')); setEditing(null); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  /* Saving a new price repriced every café on the tier, the moment it lands — the same reach
     as a tick on the feature grid below, and the same reason to ask first. Anything else about
     the row (the name, the setup fee, visibility) touches nobody's bill and saves straight. */
  const trySave = (p: PricingPlan) => {
    const before = p.monthlyPrice;
    const blank = draft.monthlyPrice.trim() === '';
    const after = blank ? null : Number(draft.monthlyPrice);
    const moved = before == null ? after != null : after == null || after !== before;
    if (moved && !window.confirm(`${t('priceChangeWarn')}\n\n${t(planLabelKey(p.tier))}: ${before == null ? t('custom') : omr(before)} → ${after == null ? t('custom') : omr(after)}`)) return;
    save.mutate(p.id);
  };

  const canSave = draft.name.trim().length > 0 && !save.isPending;
  const price = (v: number | null) => v == null ? <span className="p-custom">{t('custom')}</span> : <><span className="num">{omr(v)}</span> <span className="rslug">{t('perMo')}</span></>;

  return (
    <div className="acontent">
      <div className="plans-head">
        <div className="ph">{t('plansSub')}</div>
      </div>
      <table className="tbl plans-tbl">
        <thead><tr>
          <th>{t('colTier')}</th><th>{t('colName')}</th><th>{t('colMonthly')}</th><th>{t('colSetup')}</th>
          <th className="hide-sm">{t('colUnlocks')}</th><th>{t('colStatus')}</th><th aria-label="actions" />
        </tr></thead>
        <tbody>
          {(plans ?? []).map((p) => editing === p.id ? (
            <tr className="edit-row" key={p.id}>
              <td><span className="tier-tag">{p.tier}</span></td>
              <td><input className="pin" placeholder={t('planNamePh')} value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></td>
              <td><input className="pin num" type="number" step="0.001" min="0" placeholder={t('custom')} value={draft.monthlyPrice}
                onChange={(e) => setDraft({ ...draft, monthlyPrice: e.target.value })} /></td>
              <td><input className="pin num" type="number" step="0.001" min="0" value={draft.setupFee}
                onChange={(e) => setDraft({ ...draft, setupFee: e.target.value })} /></td>
              <td className="hide-sm rslug">{tierDesc(p.tier, t)}</td>
              <td><button type="button" className={'chip btn-chip ' + (draft.active ? 'ok' : '')}
                onClick={() => setDraft({ ...draft, active: !draft.active })}><span className="d" />{draft.active ? t('planOn') : t('planOff')}</button></td>
              <td className="p-actions">
                <button className="btn sm" disabled={!canSave} onClick={() => trySave(p)}>{save.isPending ? '…' : t('save')}</button>
                <button className="btn sm ghost" onClick={() => setEditing(null)}>{t('cancel')}</button>
              </td>
            </tr>
          ) : (
            <tr key={p.id}>
              <td><span className="tier-tag">{p.tier}</span></td>
              <td><span className="p-name">{p.name}</span></td>
              <td>{price(p.monthlyPrice)}</td>
              <td><span className="num">{omr(p.setupFee)}</span></td>
              <td className="hide-sm rslug">{tierDesc(p.tier, t)}</td>
              <td><span className={'chip ' + (p.active ? 'ok' : '')}><span className="d" />{p.active ? t('planOn') : t('planOff')}</span></td>
              <td className="p-actions">
                <button className="icon-btn" title={t('edit')} onClick={() => startEdit(p)}>✎</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <FeatureGrid t={t} />
    </div>
  );
}

/**
 * What each tier includes — the grid the gates actually read.
 *
 * This is the pricing decision that used to live in Java: every gated endpoint asked "is this
 * café PRO or ENTERPRISE?", so a tier could not include loyalty without also including every
 * Pro analytic, and changing what Pro covered meant a deploy. Ticking a box here moves every
 * café on that tier at once, which is why each one asks before it does.
 */
function FeatureGrid({ t }: { t: (k: string) => string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['admin-plan-features'],
    queryFn: () => api.get<PlanFeatureMatrix>('/api/admin/plans/features'),
  });

  const set = useMutation({
    mutationFn: (v: { tier: Plan; feature: Feature; enabled: boolean }) =>
      api.patch<PlanFeatureMatrix>('/api/admin/plans/features', v),
    onSuccess: (m) => { qc.setQueryData(['admin-plan-features'], m); toast(t('planSaved')); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
    onSettled: () => setPending(null),
  });

  if (!data) return null;
  const TIERS: Plan[] = ['STANDARD', 'PRO', 'ENTERPRISE'];
  const has = (tier: Plan, f: Feature) => (data.included[tier] ?? []).includes(f);

  const toggle = (tier: Plan, feature: Feature) => {
    const enabled = !has(tier, feature);
    // Every café on the tier moves at once, so this is not an undo-able tick.
    const ask = `${enabled ? t('featOnConfirm') : t('featOffConfirm')}\n\n` +
      `${t('feat_' + feature)} — ${t(planLabelKey(tier))}`;
    if (!window.confirm(ask)) return;
    setPending(`${tier}:${feature}`);
    set.mutate({ tier, feature, enabled });
  };

  return (
    <section className="featgrid">
      <h4>{t('featTitle')}</h4>
      <div className="ph">{t('featSub')}</div>
      <div className="tbl-wrap">
        <table className="tbl featgrid-tbl">
          <thead><tr>
            <th>{t('featCol')}</th>
            {TIERS.map((tier) => <th key={tier} className="fg-tier">{t(planLabelKey(tier))}</th>)}
          </tr></thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f} className="norow">
                <td>
                  <div className="fg-name">{t('feat_' + f)}</div>
                  <div className="rslug">{t('featd_' + f)}</div>
                </td>
                {TIERS.map((tier) => {
                  const on = has(tier, f);
                  const busy = pending === `${tier}:${f}`;
                  return (
                    <td key={tier} className="fg-cell">
                      <button className={'fg-box' + (on ? ' on' : '')} disabled={busy}
                        aria-pressed={on}
                        aria-label={`${t('feat_' + f)} — ${t(planLabelKey(tier))}`}
                        onClick={() => toggle(tier, f)}>
                        {busy ? '…' : on ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


/**
 * Platform-admin menu import: paste a whole menu as JSON and REPLACE this café's
 * current one. Deletes every existing item (then category — the API blocks deleting
 * a non-empty category), then recreates from the JSON via the normal menu endpoints,
 * passing restaurantId (allowed for PLATFORM_ADMIN). Photos are out of scope.
 */
function MenuImportModal({ restaurantId, restaurantName, onClose }:
  { restaurantId: number; restaurantName: string; onClose: () => void }) {
  const t = useT(DICT);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'edit' | 'confirm' | 'running' | 'done'>('edit');
  const [parsed, setParsed] = useState<ImpCat[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ cats: number; items: number } | null>(null);

  const existingCatsQ = useQuery({ queryKey: ['admin-menu-cats', restaurantId], queryFn: () => api.get<CategoryResponse[]>(`/api/menu/categories?restaurantId=${restaurantId}`) });
  const existingItemsQ = useQuery({ queryKey: ['admin-menu-items', restaurantId], queryFn: () => api.get<MenuItemResponse[]>(`/api/menu/items?restaurantId=${restaurantId}`) });
  const existingCats = existingCatsQ.data ?? [];
  const existingItems = existingItemsQ.data ?? [];
  const loading = existingCatsQ.isLoading || existingItemsQ.isLoading;

  const itemCount = parsed.reduce((n, c) => n + (c.items?.length ?? 0), 0);

  const review = () => {
    const out = parseImport(text);
    if ('errors' in out) { setErrors(out.errors); setParsed([]); setPhase('edit'); return; }
    setErrors([]); setParsed(out.cats); setPhase('confirm');
  };

  const run = async () => {
    setPhase('running');
    const errs: string[] = [];
    let madeCats = 0, madeItems = 0;
    // 1) wipe — items first (a non-empty category can't be deleted), then categories
    for (let i = 0; i < existingItems.length; i++) {
      setProgress(`🗑 ${i + 1}/${existingItems.length}`);
      try { await api.del(`/api/menu/items/${existingItems[i].id}`); }
      catch (e) { errs.push(`delete item #${existingItems[i].id}: ${e instanceof ApiError ? e.message : 'failed'}`); }
    }
    for (const c of existingCats) {
      try { await api.del(`/api/menu/categories/${c.id}`); }
      catch (e) { errs.push(`delete category "${c.nameEn}": ${e instanceof ApiError ? e.message : 'failed'}`); }
    }
    // 2) recreate from JSON
    for (let ci = 0; ci < parsed.length; ci++) {
      const cat = parsed[ci];
      let catId: number;
      try {
        const created = await api.post<CategoryResponse>('/api/menu/categories', {
          restaurantId, nameEn: cat.nameEn, nameAr: cat.nameAr,
          descriptionEn: cat.descriptionEn ?? null, descriptionAr: cat.descriptionAr ?? null, displayOrder: ci,
        });
        catId = created.id; madeCats++;
      } catch (e) { errs.push(`category "${cat.nameEn}": ${e instanceof ApiError ? e.message : 'failed'}`); continue; }
      const items = cat.items ?? [];
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii];
        setProgress(`＋ ${cat.nameEn} › ${it.nameEn}`);
        try {
          await api.post('/api/menu/items', {
            restaurantId, categoryId: catId, nameEn: it.nameEn, nameAr: it.nameAr,
            descriptionEn: it.descriptionEn ?? null, descriptionAr: it.descriptionAr ?? null,
            price: it.price, preparationTimeMinutes: it.preparationTimeMinutes ?? null,
            available: it.available ?? true, displayOrder: ii, optionGroups: normalizeGroups(it.options),
          });
          madeItems++;
        } catch (e) { errs.push(`item "${cat.nameEn} › ${it.nameEn}": ${e instanceof ApiError ? e.message : 'failed'}`); }
      }
    }
    setErrors(errs);
    setResult({ cats: madeCats, items: madeItems });
    setProgress('');
    setPhase('done');
    qc.invalidateQueries({ queryKey: ['admin-menu-cats', restaurantId] });
    qc.invalidateQueries({ queryKey: ['admin-menu-items', restaurantId] });
    qc.invalidateQueries({ queryKey: ['admin-restaurant-stats'] });
  };

  const boxStyle: CSSProperties = {
    width: '100%', minHeight: 240, resize: 'vertical', direction: 'ltr',
    border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text)',
    borderRadius: 10, padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5,
  };
  const errStyle: CSSProperties = { color: 'var(--bad)', fontSize: 12, fontWeight: 700, margin: '8px 0 0', whiteSpace: 'pre-wrap' };

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && phase !== 'running') onClose(); }}>
      <div className="modal-card" style={{ maxWidth: 620 }}>
        <h3>{t('importTitle')}</h3>
        <div className="ph">{restaurantName}</div>

        {phase === 'edit' && (<>
          <p className="ph">{t('importHint')}</p>
          <textarea style={boxStyle} spellCheck={false} placeholder={t('importPlace')} value={text}
            onChange={(e) => { setText(e.target.value); setErrors([]); }} />
          {errors.length > 0 && (
            <div style={errStyle}>{t('importBad')}{'\n'}{errors.slice(0, 8).join('\n')}{errors.length > 8 ? `\n…+${errors.length - 8}` : ''}</div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setText(IMPORT_SAMPLE)}>{t('importSample')}</button>
            <button className="btn" disabled={!text.trim()} onClick={review}>{t('importReview')}</button>
          </div>
        </>)}

        {phase === 'confirm' && (<>
          <div className="ph" style={{ color: 'var(--bad)' }}>{t('importWarn')}</div>
          {loading ? <div className="center" style={{ minHeight: 80 }}><div className="spinner" /></div> : (
            <div className="ph">
              <div><b>{t('willDelete')}:</b> {existingCats.length} {t('catsWord')} · {existingItems.length} {t('itemsWord')}</div>
              <div><b>{t('willAdd')}:</b> {parsed.length} {t('catsWord')} · {itemCount} {t('itemsWord')}</div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setPhase('edit')}>{t('cancel')}</button>
            <button className="btn danger" disabled={loading} onClick={run}>{t('importConfirm')}</button>
          </div>
        </>)}

        {phase === 'running' && (
          <div className="center" style={{ minHeight: 160, flexDirection: 'column', gap: 12 }}>
            <div className="spinner" />
            <div className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{t('importing')} {progress}</div>
          </div>
        )}

        {phase === 'done' && (<>
          <div className="ph">
            <b style={{ color: 'var(--text)' }}>{t('importDoneT')}</b>
            <div style={{ marginTop: 6 }}>{result?.cats ?? 0} {t('catsWord')} · {result?.items ?? 0} {t('itemsWord')}</div>
          </div>
          {errors.length > 0 && (
            <div style={errStyle}>{t('importErrorsT')} ({errors.length}){'\n'}{errors.slice(0, 8).join('\n')}{errors.length > 8 ? `\n…+${errors.length - 8}` : ''}</div>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>{t('closeBtn')}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
