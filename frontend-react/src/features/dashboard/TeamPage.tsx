import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n, useT, nameOf, personName, Ltr, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { cleanIdentifier, cleanLogin, syncInput } from '../../lib/format';
import type { BranchResponse, Permission, StaffInvite, UserResponse } from '../../lib/types';

const DICT: Dict = {
  ar: {
    add: '＋ موظف', edit: 'تعديل', newStaff: 'موظف جديد', name: 'الاسم (اختياري)', nameAr: 'الاسم بالعربية', nameEn: 'الاسم بالإنجليزية', phone: 'الجوال',
    nameOne: 'الاسم', addNameAr: '＋ الاسم بالعربية', addNameEn: '＋ الاسم بالإنجليزية',
    signsIn: 'يدخل باسم', signsInHint: 'هذا ما يكتبه الموظف عند تسجيل الدخول — بدون مسافات.', change: 'تغيير',
    contact: 'بيانات التواصل (اختياري)',
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
    email: 'البريد الإلكتروني (اختياري)',
    emailHint: 'يُستخدم لاستعادة كلمة المرور. بدونه لن يستطيع الموظف استعادتها بنفسه.',
    branchHint: 'الفرع يحدّد ما يراه: طلبات فرعه فقط. «كل الفروع» يعني المقهى كامل.',
    needUsername: 'اسم الدخول لا يقل عن ٣ أحرف.',
    needPassword: 'كلمة المرور ٨ أحرف على الأقل.',
    needAccess: 'اختر صلاحية واحدة على الأقل — بدونها ستكون لوحته فارغة.',
    noAccessWarn: 'بدون صلاحيات: لن يرى شيئًا بعد تسجيل الدخول.',
    willSee: 'سيرى:', takenUser: 'اسم المستخدم محجوز. جرّب اسمًا آخر.',
    takenEmail: 'البريد مسجّل لحساب آخر.',
    accountReady: 'الحساب جاهز', accountHint: 'أعطِ الموظف اسم المستخدم وكلمة المرور. لن تظهر كلمة المرور مرة أخرى.',
    invite: '＋ دعوة عضو', addDirect: 'إضافة مباشرة', inviteTitle: 'دعوة عضو',
    sendInvite: 'إنشاء الدعوة', pending: 'بانتظار الانضمام',
    copyLink: 'نسخ الرابط', shareWa: 'واتساب', resend: 'رابط جديد', cancelInvite: 'إلغاء الدعوة',
    inviteReady: 'الدعوة جاهزة', expires: 'تنتهي',
    inviteHint: 'لن تختار كلمة المرور — سيختارها العضو بنفسه عبر الرابط.',
    shareHint: 'أرسل هذا الرابط للعضو. يعمل مرة واحدة وينتهي خلال ٧ أيام.',
    waMsg: 'مرحباً! هذه دعوتك للانضمام لفريق العمل:',
    inviteSent: 'تم إنشاء الدعوة', inviteCancelled: 'أُلغيت الدعوة', linkReady: 'رابط جديد جاهز',
    done: 'تم',
    g_front: 'واجهة الخدمة', g_catalog: 'القائمة والطاولات', g_manage: 'الإدارة',
    p_ORDERS: 'الطلبات', p_PAYMENTS: 'الدفع', p_MENU: 'القائمة', p_QR_TABLES: 'الطاولات / QR',
    p_TEAM: 'الفريق', p_ANALYTICS: 'التحليلات', p_PROFILE: 'إعدادات المطعم', p_BRANCHES: 'الفروع',
    h_ORDERS: 'اللوحة المباشرة وقبول وتحضير وإكمال الطلبات',
    h_PAYMENTS: 'تحصيل الدفع وتعليم الطلب مدفوعًا', h_MENU: 'تعديل الأصناف والمظهر والثيم',
    h_QR_TABLES: 'إدارة الطاولات ورموز QR', h_TEAM: 'إضافة وإدارة حسابات الموظفين',
    h_ANALYTICS: 'عرض تحليلات اللوحة', h_PROFILE: 'إعدادات المطعم والاشتراك', h_BRANCHES: 'إضافة وتسمية وتفعيل الفروع',
  },
  en: {
    add: '＋ Staff', edit: 'Edit', newStaff: 'New staff', name: 'Name (optional)', nameAr: 'Name in Arabic', nameEn: 'Name in English', phone: 'Phone',
    nameOne: 'Name', addNameAr: '＋ Name in Arabic', addNameEn: '＋ Name in English',
    signsIn: 'Signs in as', signsInHint: 'This is what they type to sign in — no spaces.', change: 'Change',
    contact: 'Contact details (optional)',
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
    email: 'Email (optional)',
    emailHint: 'Used for password reset. Without it they can’t recover their own password.',
    branchHint: 'Branch decides what they see: only that shop’s orders. “All branches” is the whole café.',
    needUsername: 'The sign-in name needs 3 characters or more.',
    needPassword: 'Password must be at least 8 characters.',
    needAccess: 'Pick at least one area — with none, their dashboard is empty.',
    noAccessWarn: 'No access: they’ll sign in to an empty dashboard.',
    willSee: 'They’ll see:', takenUser: 'That username is taken. Try another.',
    takenEmail: 'That email is already on another account.',
    accountReady: 'Account ready', accountHint: 'Hand them the username and password. The password won’t be shown again.',
    invite: '＋ Invite member', addDirect: 'Add directly', inviteTitle: 'Invite a member',
    sendInvite: 'Create invite', pending: 'Pending',
    copyLink: 'Copy link', shareWa: 'WhatsApp', resend: 'New link', cancelInvite: 'Cancel invite',
    inviteReady: 'Invite ready', expires: 'Expires',
    inviteHint: "You don't pick a password — they set their own through the link.",
    shareHint: 'Send this link to your member. It works once and expires in 7 days.',
    waMsg: 'Hi! Here’s your invite to join the team:',
    inviteSent: 'Invite created', inviteCancelled: 'Invite cancelled', linkReady: 'New link ready',
    done: 'Done',
    g_front: 'Front of house', g_catalog: 'Menu & tables', g_manage: 'Management',
    p_ORDERS: 'Orders', p_PAYMENTS: 'Payments', p_MENU: 'Menu', p_QR_TABLES: 'Tables / QR',
    p_TEAM: 'Team', p_ANALYTICS: 'Analytics', p_PROFILE: 'Restaurant settings', p_BRANCHES: 'Branches',
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
  { key: 'g_catalog', perms: ['MENU', 'QR_TABLES'] },
  { key: 'g_manage', perms: ['TEAM', 'BRANCHES', 'ANALYTICS', 'PROFILE'] },
];
const TOGGLEABLE: Permission[] = PERM_GROUPS.flatMap((g) => g.perms);

// Role = a one-click bundle of permissions. "Manager" is everything the creator can give,
// because that is what its own subtitle promises — it used to quietly leave out
// Restaurant settings while reading "Run the whole restaurant".
const ROLES: { key: string; perms: Permission[] }[] = [
  { key: 'role_waiter', perms: ['ORDERS'] },
  { key: 'role_cashier', perms: ['ORDERS', 'PAYMENTS'] },
  { key: 'role_manager', perms: TOGGLEABLE },
];

const sameSet = (a: Set<Permission>, b: Permission[]) => a.size === b.length && b.every((p) => a.has(p));
/** Which role exactly matches the chosen permissions (within what the creator may grant), else 'custom'. */
const matchRole = (perms: Set<Permission>, grantable: Permission[]): string => {
  if (perms.size === 0) return 'custom';
  const role = ROLES.find((r) => sameSet(perms, r.perms.filter((p) => grantable.includes(p))));
  return role ? role.key : 'custom';
};

/**
 * A first password the owner reads out over the phone or writes on a slip, so the alphabet
 * drops the characters people mishear — no O/0, no l/1 — exactly as the server's own support
 * reset does.
 *
 * <p>It used to be `Serva` plus four digits: nine thousand possibilities, with the same five
 * letters in front of every one of them. Anyone who had ever seen one staff password knew the
 * shape of every other, and the login throttle is the only thing that was standing in the way.
 */
/**
 * A login the owner never has to invent.
 *
 * A username field sitting next to two name fields and an email is how a person's name — with
 * the space still in it — ended up in the login column, and then nobody could sign in as them.
 * So the owner names the person and this works out what they will type: the first word of the
 * name, in latin letters, made unique against the team that already exists.
 *
 * Arabic first names go through a short table of the common ones, because letter-by-letter
 * أحمد comes out "ahmd" — typeable, but nobody's name. Anything not in the table falls back to
 * letter-by-letter, which is still a working login, and Change is right next to it either way.
 */
const AR_FIRST_NAMES: Record<string, string> = {
  محمد: 'mohammed', أحمد: 'ahmed', احمد: 'ahmed', علي: 'ali', عبدالله: 'abdullah',
  عبدالرحمن: 'abdulrahman', سالم: 'salim', سعيد: 'saeed', خالد: 'khalid', ناصر: 'nasser',
  سلطان: 'sultan', حمد: 'hamad', حمود: 'hamood', يوسف: 'yousef', عمر: 'omar', بدر: 'badr',
  طارق: 'tariq', ماجد: 'majid', إبراهيم: 'ibrahim', ابراهيم: 'ibrahim', حسن: 'hassan',
  حسين: 'hussain', فاطمة: 'fatima', عائشة: 'aisha', مريم: 'maryam', نورة: 'noura',
  ليلى: 'layla', زينب: 'zainab', هدى: 'huda', منى: 'muna', أسماء: 'asma', ريم: 'reem',
  سمية: 'sumaya', بدرية: 'badriya', خديجة: 'khadija', شيخة: 'shaikha',
};
const AR_LETTERS: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd',
  ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh',
  ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y', ى: 'a', ة: 'a',
  ؤ: 'w', ئ: 'y', ء: '',
};

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export function loginFromName(nameEn: string, nameAr: string, existing: string[]): string {
  const en = firstWord(nameEn).toLowerCase().replace(/[^a-z0-9]/g, '');
  // Harakat and tatweel are decoration on the letters and never part of a login.
  const ar = firstWord(nameAr).replace(/[\u064b-\u0652\u0640]/g, '');
  const latin = en || AR_FIRST_NAMES[ar] || [...ar].map((c) => AR_LETTERS[c] ?? '').join('');
  // Under three characters is not a name the server will take, and an empty name is the
  // normal state of this field for the first few keystrokes.
  const stem = latin.length >= 3 ? latin.slice(0, 24) : 'staff';
  const used = new Set(existing.map((u) => u.toLowerCase()));
  if (!used.has(stem)) return stem;
  for (let n = 2; n <= used.size + 2; n++) if (!used.has(stem + n)) return stem + n;
  return stem + (used.size + 3);
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const tempPassword = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length])
    .join('');

async function copy(text: string, ok: () => void) {
  try { await navigator.clipboard.writeText(text); ok(); } catch { /* clipboard blocked */ }
}

export default function TeamPage({ branches, branchId }: { branches: BranchResponse[]; branchId?: number }) {
  const { user } = useAuth();
  const t = useT(DICT);
  const { lang } = useI18n();
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
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, nameOf(b, lang)])), [branches, lang]);
  /** Every login already taken, so a derived one never collides on save. Memoised: the modal
   *  re-derives whenever this changes, and a fresh array every render would never settle. */
  const usernames = useMemo(() => (usersQ.data ?? []).map((u) => u.username), [usersQ.data]);
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
  /** The account just created directly, with the password to hand over — shown once. */
  const [newAccount, setNewAccount] = useState<{ user: UserResponse; password: string } | null>(null);
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
                    <div className="person-sub"><bdi>{personName(u, lang)}</bdi>{u.phone ? <> · <Ltr>{u.phone}</Ltr></> : ''}</div>
                  </td>
                  <td className="hide-sm">
                    {u.owner ? <span className="perm-tags"><span>{t('owner')}</span></span>
                      : u.permissions.length === 0 ? <span className="hint">{t('noAccess')}</span>
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
                    {/* A member who hasn't joined yet has one set of actions, and they all need
                        the link — which the server only hands to staff who could have issued the
                        invite. Without it the row still shows (they're on the team) but there is
                        nothing here to do: activating a shell account nobody has claimed would
                        only mark it live with a random password. */}
                    {u.pendingInvite ? inviteByUser.get(u.id) && (
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
          usernames={usernames}
          grantable={grantable}
          branches={branches}
          defaultBranchId={fallbackBranchId}
          lockBranch={user!.branchId != null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); invalidate(); toast(t('created')); }}
          onCreated={(u, password) => {
            setCreateOpen(false); invalidate(); toast(t('created'));
            setNewAccount({ user: u, password });
          }}
        />
      )}
      {inviteOpen && (
        <StaffModal
          mode="invite"
          usernames={usernames}
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
      {newAccount && (
        <NewAccount user={newAccount.user} password={newAccount.password}
          onClose={() => setNewAccount(null)} />
      )}
      {editing && (
        <StaffModal
          mode="edit"
          staff={editing}
          grantable={grantable}
          branches={branches}
          defaultBranchId={editing.branchId ?? fallbackBranchId}
          lockBranch={user!.branchId != null}
          selfEdit={editing.id === user!.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); toast(t('updated')); }}
        />
      )}
    </div>
  );
}

function StaffModal({
  mode, staff, grantable, branches, usernames = [], defaultBranchId, lockBranch, selfEdit,
  onClose, onSaved, onInvited, onCreated,
}: {
  mode: 'create' | 'edit' | 'invite';
  staff?: UserResponse;
  grantable: Permission[];
  branches: BranchResponse[];
  /** Logins already in use, so a derived one is free. Create and invite only. */
  usernames?: string[];
  defaultBranchId?: number;
  lockBranch: boolean;
  /** Editing your own account: sign-in email is changed in Settings, behind your password. */
  selfEdit?: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Invite mode only — hands back the freshly minted link for the owner to share. */
  onInvited?: (invite: StaffInvite) => void;
  /** Create mode only — hands back the account and the password, to show once. */
  onCreated?: (user: UserResponse, password: string) => void;
}) {
  const t = useT(DICT);
  const { lang } = useI18n();
  const toast = useToast();
  const isOwner = !!staff?.owner;
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({
    username: staff?.username ?? '',
    fullNameAr: staff?.fullNameAr ?? '',
    fullNameEn: staff?.fullNameEn ?? '',
    email: staff?.email ?? '',
    phone: staff?.phone ?? '',
    // create: start with a generated password; edit: blank until the owner resets it.
    // invite: never — the member chooses their own.
    password: mode === 'create' ? tempPassword() : '',
    branchId: staff?.branchId ?? defaultBranchId,
    // A new member starts as a cashier rather than as a blank: it is the commonest hire, it is
    // one click to change, and "no access at all" is not a sensible thing to default anyone to.
    perms: new Set<Permission>(staff
      ? staff.permissions.filter((p) => p !== 'PLATFORM_ADMIN')
      : (['ORDERS', 'PAYMENTS'] as Permission[]).filter((p) => grantable.includes(p))),
  });
  // Which field the server rejected, so the message lands on the input instead of in a toast
  // that has already faded by the time they scroll back up a modal this long.
  const [taken, setTaken] = useState<'username' | 'email' | null>(null);
  /** The owner took the login off us and is typing their own. Then we stop deriving it. */
  const [ownLogin, setOwnLogin] = useState(false);
  /** The other script's name, and the contact fields: both a click away, both open already
   *  when there is something in them, so editing an existing member hides nothing. */
  const [otherScript, setOtherScript] = useState(!!(staff?.fullNameAr && staff?.fullNameEn));
  const [contactOpen, setContactOpen] = useState(!!(staff?.email || staff?.phone));

  // The login follows the name until the owner says otherwise. Same value in, same object
  // out — a new one every pass would re-run this for ever.
  useEffect(() => {
    if (mode === 'edit' || ownLogin) return;
    setF((p) => {
      const derived = loginFromName(p.fullNameEn, p.fullNameAr, usernames);
      return p.username === derived ? p : { ...p, username: derived };
    });
  }, [mode, ownLogin, usernames, f.fullNameAr, f.fullNameEn]);
  const set = (k: string, v: unknown) => {
    if (k === 'username' || k === 'email') setTaken(null);
    setF((p) => ({ ...p, [k]: v }));
  };
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
        const saved = await api.patch<UserResponse>(`/api/users/${staff.id}`, {
          // "" clears one side; the server refuses to clear both.
          fullNameAr: f.fullNameAr.trim(),
          fullNameEn: f.fullNameEn.trim(),
          phone: f.phone.trim() || null,
          // "" clears it; omitted entirely when it's your own account, which the server sends
          // to Settings so it can ask for the password first.
          ...(selfEdit ? {} : { email: f.email.trim() }),
          ...(f.password ? { password: f.password } : {}),
          ...(isOwner ? {} : { permissions: [...f.perms] }),
        });
        // Branch is its own call: "All branches" is a null, and a null field in a PATCH body
        // means "leave unchanged", so sent alongside the profile it could never be saved.
        const nextBranch = f.branchId ?? null;
        if (!isOwner && !lockBranch && nextBranch !== (staff.branchId ?? null)) {
          return api.patch<UserResponse>(`/api/users/${staff.id}/branch`, { branchId: nextBranch });
        }
        return saved;
      }
      const body = {
        username: f.username.trim(),
        fullNameAr: f.fullNameAr.trim() || null,
        fullNameEn: f.fullNameEn.trim() || null,
        email: f.email.trim() || null,
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
      else if (mode === 'create' && onCreated) onCreated(result as UserResponse, f.password);
      else onSaved();
    },
    onError: (e) => {
      // A clash is about one field and the owner can fix it in place; everything else is a toast.
      const code = e instanceof ApiError ? e.errorCode : undefined;
      if (code === 'EMAIL_ALREADY_EXISTS') setTaken('email');
      else if (code === 'CONFLICT') { setTaken('username'); setOwnLogin(true); }
      else toast(e instanceof ApiError ? e.message : 'Error');
    },
  });

  /**
   * What is still missing, in words. The modal is taller than most screens, so a Save button
   * that is merely grey tells the owner nothing — the field it is waiting on is usually
   * scrolled off the top.
   */
  const missing = (() => {
    if (mode === 'edit') return null;
    if (f.username.trim().length < 3) return 'needUsername';
    if (mode === 'create' && f.password.length < 8) return 'needPassword';
    // An account with nothing ticked signs in to a dashboard with no pages on it at all.
    if (!isOwner && f.perms.size === 0) return 'needAccess';
    return null;
  })();
  const valid = !missing;
  const showPw = mode === 'create' || (mode === 'edit' && !!f.password);
  // Setting someone's password is signing in as them, so the server refuses it for an account
  // holding access the editor lacks — a manager with TEAM but no MENU cannot reset the
  // menu editor's password and walk in. Don't offer the field that will only be refused.
  const canSetPassword = !staff || staff.permissions.every((p) => grantable.includes(p));

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card team-modal">
        <h3>{mode === 'invite' ? t('inviteTitle')
          : mode === 'create' ? t('newStaff')
          : (staff?.username ?? t('edit'))}</h3>

        {/* One name, in the language of the page. The other script is a click away and still
            stored when it is given — a console in English should not print a name in Arabic. */}
        <div className="field">
          <label>{t('nameOne')}</label>
          {lang === 'ar'
            ? <input value={f.fullNameAr} lang="ar" dir="rtl" autoFocus={mode !== 'edit'}
                onChange={(e) => set('fullNameAr', e.target.value)} />
            : <input value={f.fullNameEn} lang="en" dir="ltr" autoFocus={mode !== 'edit'}
                onChange={(e) => set('fullNameEn', e.target.value)} />}
        </div>
        {otherScript ? (
          <div className="field">
            <label>{lang === 'ar' ? t('nameEn') : t('nameAr')}</label>
            {lang === 'ar'
              ? <input value={f.fullNameEn} lang="en" dir="ltr" onChange={(e) => set('fullNameEn', e.target.value)} />
              : <input value={f.fullNameAr} lang="ar" dir="rtl" onChange={(e) => set('fullNameAr', e.target.value)} />}
          </div>
        ) : (
          <button type="button" className="field-add" onClick={() => setOtherScript(true)}>
            {lang === 'ar' ? t('addNameEn') : t('addNameAr')}
          </button>
        )}

        {/* The login, said once, where the name it came from is still on screen. It is derived
            rather than asked for: a field called "username" next to two name fields is how a
            person's name ended up being the thing nobody could sign in with. */}
        {(mode === 'create' || mode === 'invite') && (
          <div className={'field' + (taken === 'username' ? ' bad' : '')}>
            <label>{t('signsIn')}</label>
            {/* A login is machine data: on an Arabic page it must not be reordered by the
                paragraph around it. */}
            {ownLogin ? (
              <input className="num" dir="ltr" value={f.username} autoCapitalize="none" spellCheck={false}
                autoFocus onChange={(e) => set('username', syncInput(e.target, cleanLogin))} />
            ) : (
              <div className="derived-row">
                <b className="num" dir="ltr">{f.username}</b>
                <button type="button" className="btn sm ghost" onClick={() => setOwnLogin(true)}>{t('change')}</button>
              </div>
            )}
            {taken === 'username'
              ? <div className="field-err">{t('takenUser')}</div>
              : <div className="hint">{t('signsInHint')}</div>}
          </div>
        )}

        {mode === 'invite' && <div className="hint" style={{ margin: '2px 0 10px' }}>{t('inviteHint')}</div>}

        {/* Password: generated on create; on edit, button generates a fresh one to copy out. */}
        {mode !== 'invite' && canSetPassword && (
        <div className="field">
          <label>{mode === 'create' ? t('password') : t('resetPw')}</label>
          <div className="pw-row">
            <input className="num" dir="ltr" value={f.password} placeholder={mode === 'edit' ? '••••••••' : ''}
              onChange={(e) => { set('password', e.target.value); setCopied(false); }} />
            <button type="button" className="btn sm ghost"
              onClick={() => { set('password', tempPassword()); setCopied(false); }}>↻</button>
            {showPw && f.password && (
              <button type="button" className="btn sm" onClick={() => copy(f.password, () => setCopied(true))}>
                {copied ? t('copied') : t('copy')}</button>
            )}
          </div>
          {showPw && f.password && <div className="hint">{t('pwHint')}</div>}
        </div>
        )}

        {/* Contact details, on every mode, folded away. Email is what makes "forgot password"
            work for them later — an account created without one can only ever be reset by the
            owner — but it is not a login, and sitting next to one it read like an alternative. */}
        <div className="field">
          <button type="button" className="field-add" onClick={() => setContactOpen(!contactOpen)}>
            {(contactOpen ? '▾ ' : lang === 'ar' ? '◂ ' : '▸ ') + t('contact')}
          </button>
          {contactOpen && (
            <div className="row2">
              {!selfEdit && (
                <div className={'field' + (taken === 'email' ? ' bad' : '')}>
                  <label>{t('email')}</label>
                  <input className="num" dir="ltr" type="email" autoCapitalize="none" spellCheck={false}
                    value={f.email ?? ''} onChange={(e) => set('email', syncInput(e.target, cleanIdentifier))} />
                  {taken === 'email'
                    ? <div className="field-err">{t('takenEmail')}</div>
                    : <div className="hint">{t('emailHint')}</div>}
                </div>
              )}
              <div className="field"><label>{t('phone')}</label>
                <input className="num" dir="ltr" value={f.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value)} /></div>
            </div>
          )}
        </div>

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
            {/* Said back in the owner's words: a grid of ticks is a specification, this is what
                the person actually opens when they sign in. Empty is the state worth naming — a
                member with nothing ticked lands on a dashboard with no pages on it. */}
            <div className={'access-summary' + (f.perms.size === 0 ? ' hint warn' : '')}>
              {f.perms.size === 0 ? t('noAccessWarn') : (
                <>{t('willSee')} <b>{TOGGLEABLE.filter((pp) => f.perms.has(pp)).map((pp) => t('p_' + pp)).join(lang === 'ar' ? '، ' : ', ')}</b></>
              )}
            </div>
            {!lockBranch && (
              <div className="field" style={{ marginTop: 14 }}><label>{t('branch')}</label>
                <select value={f.branchId ?? ''} onChange={(e) => set('branchId', e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">{t('allBranches')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{nameOf(b, lang)}</option>)}
                </select>
                <div className="hint">{t('branchHint')}</div>
              </div>
            )}
          </>
        )}

        {/* 'needAccess' is already said in the summary, right where the toggles are — repeating
            it above Save would be two warnings for one thing. */}
        {missing && missing !== 'needAccess' && (
          <div className="hint warn" style={{ marginTop: 12 }}>{t(missing)}</div>
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
 * The hand-off after a direct create: username and password, once.
 *
 * <p>The password was only ever visible in the form that made it — press Save without copying
 * and it was gone, and the only way back was to reset it. The invite flow already ends on a
 * hand-off step for exactly this reason; creating an account directly now ends on the same one.
 */
function NewAccount({ user, password, onClose }: { user: UserResponse; password: string; onClose: () => void }) {
  const t = useT(DICT);
  const [copied, setCopied] = useState<'user' | 'pw' | null>(null);

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card team-modal">
        <h3>{t('accountReady')}</h3>
        <div className="hint" style={{ marginBottom: 12 }}>{t('accountHint')}</div>

        <div className="handover-row">
          <div className="field" style={{ margin: 0 }}>
            <label>{t('username')}</label>
            <div className="pw-row">
              <input className="num" dir="ltr" value={user.username} readOnly
                onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn sm"
                onClick={() => copy(user.username, () => setCopied('user'))}>
                {copied === 'user' ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>{t('password')}</label>
            <div className="pw-row">
              <input className="num" dir="ltr" value={password} readOnly
                onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn sm"
                onClick={() => copy(password, () => setCopied('pw'))}>
                {copied === 'pw' ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('done')}</button>
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
        <div className="hint" style={{ marginBottom: 12 }}>{t('shareHint')}</div>

        <div className="field">
          <div className="pw-row">
            {/* A URL read on an Arabic page: without dir it is reordered around its own
                punctuation and the owner is looking at a link they cannot check. */}
            <input className="num" dir="ltr" value={invite.joinUrl} readOnly
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn sm"
              onClick={() => copy(invite.joinUrl, () => setCopied(true))}>
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>

        <div className="hint" style={{ marginTop: 4 }}>
          {t('expires')} <Ltr>{new Date(invite.expiresAt).toLocaleDateString()}</Ltr>
        </div>

        <div className="modal-actions">
          <a className="btn ghost" href={waHref} target="_blank" rel="noopener noreferrer">{t('shareWa')}</a>
          <button className="btn" onClick={onClose}>{t('done')}</button>
        </div>
      </div>
    </div>
  );
}
