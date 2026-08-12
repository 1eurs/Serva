import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { BranchResponse, Permission, StaffInvite, UserResponse } from '../../lib/types';

const DICT: Dict = {
  ar: {
    add: '＋ موظف', edit: 'تعديل', newStaff: 'موظف جديد', name: 'الاسم (اختياري)', phone: 'الجوال',
    username: 'اسم المستخدم', password: 'كلمة المرور', branch: 'الفرع', allBranches: 'كل الفروع',
    status: 'الحالة', active: 'نشط', inactive: 'موقوف', save: 'حفظ', cancel: 'إلغاء',
    deactivate: 'إيقاف', activate: 'تفعيل', resetPw: 'كلمة مرور جديدة', copy: 'نسخ', copied: 'تم النسخ',
    empty: 'لا يوجد موظفون بعد', created: 'تم إنشاء الحساب', updated: 'تم الحفظ',
    access: 'تخصيص الصلاحيات', owner: 'المالك — كل الصلاحيات', noAccess: 'بدون صلاحيات',
    roleLabel: 'الدور', roleCustom: 'مخصّص', roleCustomSub: 'اختر يدويًا',
    role_cashier: 'كاشير', role_cashier_sub: 'الطلبات والدفع',
    role_waiter: 'طلبات', role_waiter_sub: 'استقبال وإدارة الطلبات',
    role_manager: 'مدير', role_manager_sub: 'إدارة المطعم بالكامل',
    pwHint: 'انسخ كلمة المرور وأعطها للموظف — لن تظهر مرة أخرى.',
    invite: '＋ دعوة عضو', addDirect: 'إضافة مباشرة', inviteTitle: 'دعوة عضو',
    sendInvite: 'إنشاء الدعوة', pending: 'بانتظار الانضمام',
    copyLink: 'نسخ الرابط', shareWa: 'واتساب', resend: 'رابط جديد', cancelInvite: 'إلغاء الدعوة',
    inviteReady: 'الدعوة جاهزة', expires: 'تنتهي',
    inviteHint: 'لن تختار كلمة المرور — سيختارها العضو بنفسه عبر الرابط.',
    shareHint: 'أرسل هذا الرابط للعضو. يعمل مرة واحدة وينتهي خلال ٧ أيام.',
    waMsg: 'مرحباً! هذه دعوتك للانضمام لفريق العمل:',
    inviteSent: 'تم إنشاء الدعوة', inviteCancelled: 'أُلغيت الدعوة', linkReady: 'رابط جديد جاهز',
    done: 'تم',
    g_front: 'واجهة الخدمة', g_kitchen: 'المطبخ', g_catalog: 'القائمة', g_manage: 'الإدارة',
    p_ORDERS: 'الطلبات', p_PAYMENTS: 'الدفع', p_MENU: 'القائمة', p_QR_TABLES: 'الطاولات / QR',
    p_TEAM: 'الفريق', p_ANALYTICS: 'التحليلات', p_PROFILE: 'إعدادات المطعم', p_BRANCHES: 'الفروع',
    p_STOCK: 'المخزون', h_STOCK: 'المخزون والوصفات والجرد والشراء', g_stock: 'المخزون',
    h_ORDERS: 'اللوحة المباشرة وقبول وتحضير وإكمال الطلبات',
    h_PAYMENTS: 'تحصيل الدفع وتعليم الطلب مدفوعًا', h_MENU: 'تعديل الأصناف والمظهر والثيم',
    h_QR_TABLES: 'إدارة الطاولات ورموز QR', h_TEAM: 'إضافة وإدارة حسابات الموظفين',
    h_ANALYTICS: 'عرض تحليلات اللوحة', h_PROFILE: 'إعدادات المطعم والاشتراك', h_BRANCHES: 'إضافة وتسمية وتفعيل الفروع',
  },
  en: {
    add: '＋ Staff', edit: 'Edit', newStaff: 'New staff', name: 'Name (optional)', phone: 'Phone',
    username: 'Username', password: 'Password', branch: 'Branch', allBranches: 'All branches',
    status: 'Status', active: 'Active', inactive: 'Inactive', save: 'Save', cancel: 'Cancel',
    deactivate: 'Deactivate', activate: 'Activate', resetPw: 'New password', copy: 'Copy', copied: 'Copied',
    empty: 'No staff yet', created: 'Account created', updated: 'Saved',
    access: 'Fine-tune access', owner: 'Owner — full access', noAccess: 'No access',
    roleLabel: 'Role', roleCustom: 'Custom', roleCustomSub: 'Pick manually',
    role_cashier: 'Cashier', role_cashier_sub: 'Orders & payments',
    role_waiter: 'Orders', role_waiter_sub: 'Take & manage orders',
    role_manager: 'Manager', role_manager_sub: 'Run the whole restaurant',
    pwHint: 'Copy the password and hand it to the staff member — it won’t be shown again.',
    invite: '＋ Invite member', addDirect: 'Add directly', inviteTitle: 'Invite a member',
    sendInvite: 'Create invite', pending: 'Pending',
    copyLink: 'Copy link', shareWa: 'WhatsApp', resend: 'New link', cancelInvite: 'Cancel invite',
    inviteReady: 'Invite ready', expires: 'Expires',
    inviteHint: "You don't pick a password — they set their own through the link.",
    shareHint: 'Send this link to your member. It works once and expires in 7 days.',
    waMsg: 'Hi! Here’s your invite to join the team:',
    inviteSent: 'Invite created', inviteCancelled: 'Invite cancelled', linkReady: 'New link ready',
    done: 'Done',
    g_front: 'Front of house', g_kitchen: 'Kitchen', g_catalog: 'Catalog', g_manage: 'Management',
    p_ORDERS: 'Orders', p_PAYMENTS: 'Payments', p_MENU: 'Menu', p_QR_TABLES: 'Tables / QR',
    p_TEAM: 'Team', p_ANALYTICS: 'Analytics', p_PROFILE: 'Restaurant settings', p_BRANCHES: 'Branches',
    p_STOCK: 'Stock', h_STOCK: 'Stock levels, recipes, counts & purchasing', g_stock: 'Stock',
    h_ORDERS: 'Live board — accept, prepare, complete & cancel orders',
    h_PAYMENTS: 'Take payment & mark orders paid', h_MENU: 'Edit menu items, look & theme',
    h_QR_TABLES: 'Manage tables & QR codes', h_TEAM: 'Add & manage staff accounts',
    h_ANALYTICS: 'View dashboard insights', h_PROFILE: 'Restaurant settings & subscription', h_BRANCHES: 'Add, rename & toggle branches',
  },
};

// Staff permissions grouped for the editor. PLATFORM_ADMIN is never granted here, and BILLING is
// omitted — it isn't enforced anywhere (subscription view is gated by PROFILE).
const PERM_GROUPS: { key: string; perms: Permission[] }[] = [
  { key: 'g_front', perms: ['ORDERS', 'PAYMENTS'] },
  { key: 'g_catalog', perms: ['MENU', 'QR_TABLES', 'STOCK'] },
  { key: 'g_manage', perms: ['TEAM', 'BRANCHES', 'ANALYTICS', 'PROFILE'] },
];
const TOGGLEABLE: Permission[] = PERM_GROUPS.flatMap((g) => g.perms);

// Role = a one-click bundle of permissions.
const ROLES: { key: string; perms: Permission[] }[] = [
  { key: 'role_cashier', perms: ['ORDERS', 'PAYMENTS'] },
  { key: 'role_waiter', perms: ['ORDERS'] },
  { key: 'role_manager', perms: ['ORDERS', 'PAYMENTS', 'MENU', 'QR_TABLES', 'TEAM', 'ANALYTICS', 'BRANCHES'] },
];

const sameSet = (a: Set<Permission>, b: Permission[]) => a.size === b.length && b.every((p) => a.has(p));
/** Which role exactly matches the chosen permissions (within what the creator may grant), else 'custom'. */
const matchRole = (perms: Set<Permission>, grantable: Permission[]): string => {
  if (perms.size === 0) return 'custom';
  const role = ROLES.find((r) => sameSet(perms, r.perms.filter((p) => grantable.includes(p))));
  return role ? role.key : 'custom';
};

const tempPassword = () => `Serva${Math.floor(1000 + Math.random() * 9000)}!`;

async function copy(text: string, ok: () => void) {
  try { await navigator.clipboard.writeText(text); ok(); } catch { /* clipboard blocked */ }
}

export default function TeamPage({ branches, branchId }: { branches: BranchResponse[]; branchId?: number }) {
  const { user } = useAuth();
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  // A creator may only grant permissions they hold (owners hold everything).
  const grantable = useMemo(
    () => TOGGLEABLE.filter((p) => user!.owner || user!.permissions.includes(p)),
    [user],
  );
  const fallbackBranchId = user!.branchId ?? branchId ?? undefined;

  const usersQ = useQuery({
    queryKey: ['team-users', user!.restaurantId],
    queryFn: () => api.get<UserResponse[]>('/api/users'),
  });
  const invitesQ = useQuery({
    queryKey: ['team-invites', user!.restaurantId],
    queryFn: () => api.get<StaffInvite[]>('/api/users/invites'),
  });
  /** Pending invites keyed by the shell account they will activate, to hang row actions off. */
  const inviteByUser = useMemo(
    () => new Map((invitesQ.data ?? []).map((i) => [i.userId, i])),
    [invitesQ.data],
  );
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const rows = useMemo(() => {
    const list = usersQ.data ?? [];
    return list
      .filter((u) => !u.permissions.includes('PLATFORM_ADMIN'))
      .sort((a, b) => Number(b.active) - Number(a.active)
        || Number(b.owner) - Number(a.owner)
        || a.username.localeCompare(b.username));
  }, [usersQ.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // The link is shown once the invite exists — the owner shares it, we never send it for them.
  const [shareInvite, setShareInvite] = useState<StaffInvite | null>(null);
  const [editing, setEditing] = useState<UserResponse | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['team-users', user!.restaurantId] });
    qc.invalidateQueries({ queryKey: ['team-invites', user!.restaurantId] });
  };
  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Error');

  const toggle = useMutation({
    mutationFn: (u: UserResponse) => api.patch<UserResponse>(`/api/users/${u.id}/${u.active ? 'deactivate' : 'activate'}`),
    onSuccess: invalidate,
    onError: err,
  });

  const resend = useMutation({
    mutationFn: (inv: StaffInvite) => api.post<StaffInvite>(`/api/users/invites/${inv.id}/resend`),
    onSuccess: (fresh) => { invalidate(); setShareInvite(fresh); toast(t('linkReady')); },
    onError: err,
  });
  const cancelInvite = useMutation({
    mutationFn: (inv: StaffInvite) => api.del(`/api/users/invites/${inv.id}`),
    onSuccess: () => { invalidate(); toast(t('inviteCancelled')); },
    onError: err,
  });

  return (
    <div className="tables-wrap team-page">
      <div className="toolbar">
        <div />
        <div className="team-toolbar-actions">
          {/* Inviting is the default: the member picks their own password, so nobody else knows it.
              Direct creation stays for the case where you're setting up a device on the spot. */}
          <button className="btn sm ghost" onClick={() => setCreateOpen(true)}>{t('addDirect')}</button>
          <button className="btn sm" onClick={() => setInviteOpen(true)}>{t('invite')}</button>
        </div>
      </div>

      {usersQ.isLoading ? <div className="center"><div className="spinner" /></div>
        : rows.length === 0 ? <div className="empty"><div className="big">👥</div><h3>{t('empty')}</h3></div>
        : (
          <table className="tbl">
            <thead><tr><th>{t('username')}</th><th className="hide-sm">{t('access')}</th><th className="hide-sm">{t('branch')}</th><th>{t('status')}</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{u.username}</div>
                    <div className="rslug">{u.fullName}{u.phone ? ` · ${u.phone}` : ''}</div>
                  </td>
                  <td className="hide-sm">
                    {u.owner ? <span className="perm-tags"><span>{t('owner')}</span></span>
                      : u.permissions.length === 0 ? <span className="rslug">{t('noAccess')}</span>
                      : <span className="perm-tags">{u.permissions.map((p) => <span key={p}>{t('p_' + p)}</span>)}</span>}
                  </td>
                  <td className="hide-sm">{u.branchId ? branchName.get(u.branchId) ?? `#${u.branchId}` : t('allBranches')}</td>
                  <td>
                    {/* Pending and deactivated are both `active: false` but mean opposite things. */}
                    {u.pendingInvite
                      ? <span className="chip warn"><span className="d" />{t('pending')}</span>
                      : <span className={'chip' + (u.active ? ' ok' : '')}><span className="d" />{u.active ? t('active') : t('inactive')}</span>}
                  </td>
                  <td className="team-actions">
                    {u.pendingInvite && inviteByUser.get(u.id) ? (
                      <>
                        <button className="btn sm" onClick={() => setShareInvite(inviteByUser.get(u.id)!)}>
                          {t('copyLink')}
                        </button>
                        <button className="btn sm ghost" disabled={resend.isPending}
                          onClick={() => resend.mutate(inviteByUser.get(u.id)!)}>{t('resend')}</button>
                        <button className="btn sm ghost" disabled={cancelInvite.isPending}
                          onClick={() => cancelInvite.mutate(inviteByUser.get(u.id)!)}>{t('cancelInvite')}</button>
                      </>
                    ) : (
                      <>
                        {/* Owner profile/password is editable too — but only by an owner, never deactivatable. */}
                        {(user!.owner || !u.owner) && (
                          <button className="btn sm ghost" onClick={() => setEditing(u)}>{t('edit')}</button>
                        )}
                        {!u.owner && (
                          <button className="btn sm ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(u)}>
                            {u.active ? t('deactivate') : t('activate')}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      {createOpen && (
        <StaffModal
          mode="create"
          grantable={grantable}
          branches={branches}
          defaultBranchId={fallbackBranchId}
          lockBranch={user!.branchId != null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); invalidate(); toast(t('created')); }}
        />
      )}
      {inviteOpen && (
        <StaffModal
          mode="invite"
          grantable={grantable}
          branches={branches}
          defaultBranchId={fallbackBranchId}
          lockBranch={user!.branchId != null}
          onClose={() => setInviteOpen(false)}
          onSaved={() => { setInviteOpen(false); invalidate(); }}
          onInvited={(inv) => { setInviteOpen(false); invalidate(); setShareInvite(inv); toast(t('inviteSent')); }}
        />
      )}
      {shareInvite && <ShareInvite invite={shareInvite} onClose={() => setShareInvite(null)} />}
      {editing && (
        <StaffModal
          mode="edit"
          staff={editing}
          grantable={grantable}
          branches={branches}
          defaultBranchId={editing.branchId ?? fallbackBranchId}
          lockBranch={user!.branchId != null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); toast(t('updated')); }}
        />
      )}
    </div>
  );
}

function StaffModal({
  mode, staff, grantable, branches, defaultBranchId, lockBranch, onClose, onSaved, onInvited,
}: {
  mode: 'create' | 'edit' | 'invite';
  staff?: UserResponse;
  grantable: Permission[];
  branches: BranchResponse[];
  defaultBranchId?: number;
  lockBranch: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Invite mode only — hands back the freshly minted link for the owner to share. */
  onInvited?: (invite: StaffInvite) => void;
}) {
  const t = useT(DICT);
  const toast = useToast();
  const isOwner = !!staff?.owner;
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({
    username: staff?.username ?? '',
    fullName: staff?.fullName ?? '',
    phone: staff?.phone ?? '',
    // create: start with a generated password; edit: blank until the owner resets it.
    // invite: never — the member chooses their own.
    password: mode === 'create' ? tempPassword() : '',
    branchId: staff?.branchId ?? defaultBranchId,
    perms: new Set<Permission>(staff?.permissions.filter((p) => p !== 'PLATFORM_ADMIN') ?? []),
  });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const togglePerm = (p: Permission) => setF((prev) => {
    const next = new Set(prev.perms);
    next.has(p) ? next.delete(p) : next.add(p);
    return { ...prev, perms: next };
  });
  const applyRole = (perms: Permission[]) =>
    setF((prev) => ({ ...prev, perms: new Set(perms.filter((p) => grantable.includes(p))) }));
  const selectedRole = matchRole(f.perms, grantable);

  const save = useMutation<UserResponse | StaffInvite, unknown, void>({
    mutationFn: async () => {
      if (mode === 'edit' && staff) {
        return api.patch<UserResponse>(`/api/users/${staff.id}`, {
          fullName: f.fullName.trim() || null,
          phone: f.phone.trim() || null,
          ...(f.password ? { password: f.password } : {}),
          ...(isOwner ? {} : { permissions: [...f.perms], branchId: lockBranch ? undefined : (f.branchId ?? null) }),
        });
      }
      const body = {
        username: f.username.trim(),
        fullName: f.fullName.trim() || null,
        phone: f.phone.trim() || null,
        permissions: [...f.perms],
        branchId: lockBranch ? undefined : f.branchId,
      };
      return mode === 'invite'
        ? api.post<StaffInvite>('/api/users/invites', body)
        : api.post<UserResponse>('/api/users', { ...body, password: f.password });
    },
    onSuccess: (result) => {
      if (mode === 'invite' && onInvited) onInvited(result as StaffInvite);
      else onSaved();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const valid = mode === 'edit' ? true
    : mode === 'invite' ? f.username.trim().length >= 3
    : f.username.trim().length >= 3 && f.password.length >= 8;
  const showPw = mode === 'create' || (mode === 'edit' && !!f.password);

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card team-modal">
        <h3>{mode === 'invite' ? t('inviteTitle')
          : mode === 'create' ? t('newStaff')
          : (staff?.username ?? t('edit'))}</h3>

        {(mode === 'create' || mode === 'invite') && (
          <div className="row2">
            <div className="field"><label>{t('username')}</label>
              <input className="num" value={f.username} autoCapitalize="none" spellCheck={false}
                onChange={(e) => set('username', e.target.value)} /></div>
            <div className="field"><label>{t('name')}</label>
              <input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
          </div>
        )}
        {mode === 'edit' && (
          <div className="row2">
            <div className="field"><label>{t('name')}</label>
              <input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
            <div className="field"><label>{t('phone')}</label>
              <input className="num" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
        )}

        {mode === 'invite' && (
          <>
            <div className="field"><label>{t('phone')}</label>
              <input className="num" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="rslug" style={{ margin: '2px 0 6px' }}>{t('inviteHint')}</div>
          </>
        )}

        {/* Password: generated on create; on edit, button generates a fresh one to copy out. */}
        {mode !== 'invite' && (
        <div className="field">
          <label>{mode === 'create' ? t('password') : t('resetPw')}</label>
          <div className="pw-row">
            <input className="num" value={f.password} placeholder={mode === 'edit' ? '••••••••' : ''}
              onChange={(e) => { set('password', e.target.value); setCopied(false); }} />
            <button type="button" className="btn sm ghost"
              onClick={() => { set('password', tempPassword()); setCopied(false); }}>↻</button>
            {showPw && f.password && (
              <button type="button" className="btn sm" onClick={() => copy(f.password, () => setCopied(true))}>
                {copied ? t('copied') : t('copy')}</button>
            )}
          </div>
          {showPw && f.password && <div className="rslug" style={{ marginTop: 6 }}>{t('pwHint')}</div>}
        </div>
        )}

        {isOwner ? (
          <div className="perm-tags" style={{ marginTop: 12 }}><span>{t('owner')}</span></div>
        ) : (
          <>
            <div className="field" style={{ marginTop: 4 }}>
              <label>{t('roleLabel')}</label>
              <div className="role-row">
                {ROLES.map((r) => {
                  if (r.perms.filter((p) => grantable.includes(p)).length === 0) return null;
                  return (
                    <button key={r.key} type="button"
                      className={'role-btn' + (selectedRole === r.key ? ' on' : '')}
                      onClick={() => applyRole(r.perms)}>
                      <span className="role-name">{t(r.key)}</span>
                      <span className="role-sub">{t(r.key + '_sub')}</span>
                    </button>
                  );
                })}
                <span className={'role-btn static' + (selectedRole === 'custom' ? ' on' : '')}>
                  <span className="role-name">{t('roleCustom')}</span>
                  <span className="role-sub">{t('roleCustomSub')}</span>
                </span>
              </div>
            </div>
            <div className="field" style={{ marginTop: 4 }}>
              <label>{t('access')}</label>
              <div className="perm-groups">
                {PERM_GROUPS.map((g) => {
                  const perms = g.perms.filter((p) => grantable.includes(p));
                  if (perms.length === 0) return null;
                  return (
                    <div className="perm-group" key={g.key}>
                      <div className="perm-group-hd">{t(g.key)}</div>
                      <div className="perm-grid">
                        {perms.map((p) => (
                          <label key={p} className={'perm-toggle' + (f.perms.has(p) ? ' on' : '')}>
                            <input type="checkbox" checked={f.perms.has(p)} onChange={() => togglePerm(p)} />
                            <span className="pt-txt"><span className="pt-name">{t('p_' + p)}</span>
                              <span className="pt-hint">{t('h_' + p)}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {!lockBranch && (
              <div className="field"><label>{t('branch')}</label>
                <select value={f.branchId ?? ''} onChange={(e) => set('branchId', e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">{t('allBranches')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {mode === 'invite' ? t('sendInvite') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * The hand-off step: the owner gets the link and passes it on themselves.
 *
 * <p>No automatic sending. Café staff here often have no work email, and the owner already has
 * them on WhatsApp — so a copyable link plus a pre-filled WhatsApp message beats a delivery
 * pipeline that silently fails into a spam folder.
 */
function ShareInvite({ invite, onClose }: { invite: StaffInvite; onClose: () => void }) {
  const t = useT(DICT);
  const [copied, setCopied] = useState(false);
  const message = `${t('waMsg')} ${invite.joinUrl}`;
  // With a phone on file the message opens straight in their thread; otherwise it's a share sheet.
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card team-modal">
        <h3>{t('inviteReady')} — {invite.username}</h3>
        <div className="rslug" style={{ marginBottom: 12 }}>{t('shareHint')}</div>

        <div className="field">
          <div className="pw-row">
            <input className="num" value={invite.joinUrl} readOnly
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn sm"
              onClick={() => copy(invite.joinUrl, () => setCopied(true))}>
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>

        <div className="rslug" style={{ marginTop: 4 }}>
          {t('expires')} {new Date(invite.expiresAt).toLocaleDateString()}
        </div>

        <div className="modal-actions">
          <a className="btn ghost" href={waHref} target="_blank" rel="noopener noreferrer">{t('shareWa')}</a>
          <button className="btn" onClick={onClose}>{t('done')}</button>
        </div>
      </div>
    </div>
  );
}
