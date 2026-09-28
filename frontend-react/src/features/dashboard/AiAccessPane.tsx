import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useT, Ltr, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useConfirm } from '../../lib/confirm';
import { SettingsShell, PaneSection, Specimen } from './SettingsShell';

/**
 * "Connect an AI" — the owner mints a scoped key and copies a paste-and-go snippet that points an
 * LLM at the hosted MCP (`<origin>/mcp`). The key travels in the snippet, never lives on our
 * server, and a read-only key can only read — the backend refuses every write it makes. The key's
 * plaintext is shown exactly once, right after minting.
 */

type Scope = 'READ_ONLY' | 'FULL';
interface ApiKeyRow { id: number; label: string; scope: Scope; last4: string; createdAt: string; lastUsedAt: string | null; }
interface MintedKey { id: number; label: string; scope: Scope; key: string; }

const DICT: Dict = {
  ar: {
    surface: 'Claude · أي عميل MCP',
    title: 'اربط مساعداً ذكياً',
    sub: 'أنشئ مفتاحاً، وانسخ السطر، والصقه في مساعدك الذكي ليتصل بمقهاك. مفتاح "قراءة فقط" يرى كل شيء ولا يغيّر شيئاً.',
    mkTitle: 'أنشئ مفتاحاً', mkSub: 'سمِّ المفتاح لتعرفه لاحقاً، واختر ما يُسمح له به.',
    nameL: 'اسم المفتاح', namePh: 'مثال: مساعد كلود',
    scopeL: 'الصلاحية',
    roName: 'قراءة فقط', roSub: 'يقرأ الطلبات والتحليلات والقائمة — ولا يغيّر شيئاً. الأنسب للذكاء الاصطناعي.',
    fullName: 'كامل', fullSub: 'يقرأ ويكتب مثل صاحب المقهى. أعطِه فقط لما تثق به.',
    generate: 'أنشئ المفتاح', generating: 'جارٍ…',
    reveal: 'انسخه الآن — لن يظهر مرة أخرى', revealSub: 'هذا المفتاح يظهر مرّة واحدة فقط. الصقه في مساعدك، ثم أغلِق.',
    copyCmd: 'انسخ الأمر', copyJson: 'انسخ إعداد Claude Desktop', copied: 'تم النسخ', done: 'تم',
    listTitle: 'مفاتيحك', listSub: 'المفتاح الموقوف يتوقف فوراً. الطلبات التي تمّت تبقى كما هي.',
    none: 'لا مفاتيح بعد.', noneSub: 'أنشئ مفتاحاً أعلاه واربط مساعدك.',
    lastUsed: 'آخر استخدام', never: 'لم يُستخدم', revoke: 'إيقاف',
    revoked: 'تم إيقاف المفتاح',
    delTitle: 'إيقاف المفتاح', delMsg: 'سيتوقف أي مساعد يستخدم هذا المفتاح فوراً. لا يمكن التراجع.',
    specL: 'ما تلصقه في المساعد', specNote: 'أنشئ مفتاحاً ليظهر سطر جاهز بمفتاحك الحقيقي.',
  },
  en: {
    surface: 'Claude · any MCP client',
    title: 'Connect an AI',
    sub: 'Create a key, copy the line, paste it into your AI assistant to connect it to your café. A read-only key sees everything and changes nothing.',
    mkTitle: 'Create a key', mkSub: 'Name it so you recognise it later, and choose what it may do.',
    nameL: 'Key name', namePh: 'e.g. Claude assistant',
    scopeL: 'Access',
    roName: 'Read-only', roSub: 'Reads orders, analytics, the menu — changes nothing. The safe choice for an AI.',
    fullName: 'Full', fullSub: 'Reads and writes, like the owner. Only give this to something you trust.',
    generate: 'Generate key', generating: 'Working…',
    reveal: 'Copy it now — it won’t be shown again', revealSub: 'This key is shown once. Paste it into your assistant, then close this.',
    copyCmd: 'Copy command', copyJson: 'Copy Claude Desktop config', copied: 'Copied', done: 'Done',
    listTitle: 'Your keys', listSub: 'A revoked key stops working immediately. Finished orders stay as they were.',
    none: 'No keys yet.', noneSub: 'Create one above and connect your assistant.',
    lastUsed: 'Last used', never: 'never', revoke: 'Revoke',
    revoked: 'Key revoked',
    delTitle: 'Revoke key', delMsg: 'Any assistant using this key stops working immediately. This can’t be undone.',
    specL: 'What you paste into the assistant', specNote: 'Generate a key and a ready-to-paste line appears here with your real key.',
  },
};

const MCP_URL = `${window.location.origin}/mcp`;

function cliSnippet(key: string): string {
  return `claude mcp add --transport http serva ${MCP_URL} \\\n  --header "Authorization: Bearer ${key}"`;
}
function desktopSnippet(key: string): string {
  return JSON.stringify(
    { mcpServers: { serva: { url: MCP_URL, headers: { Authorization: `Bearer ${key}` } } } },
    null,
    2,
  );
}

export default function AiAccessPane() {
  const t = useT(DICT);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const keysQ = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<ApiKeyRow[]>('/api/dashboard/api-keys') });

  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<Scope>('READ_ONLY');
  const [minted, setMinted] = useState<MintedKey | null>(null);

  const mintM = useMutation({
    mutationFn: () => api.post<MintedKey>('/api/dashboard/api-keys', { label: label.trim() || t('namePh'), scope }),
    onSuccess: (k) => { setMinted(k); setLabel(''); qc.invalidateQueries({ queryKey: ['api-keys'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const revokeM = useMutation({
    mutationFn: (id: number) => api.del(`/api/dashboard/api-keys/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast(t('revoked')); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { /* clipboard blocked */ }
  };

  const keys = keysQ.data ?? [];

  return (
    <SettingsShell
      mark="✦"
      surface={t('surface')}
      title={t('title')}
      sub={t('sub')}
      aside={
        <Specimen label={t('specL')}>
          <pre className="stg-ai-snip stg-ai-snip-ghost">{cliSnippet('serva_sk_…')}</pre>
          <p className="stg-spec-note">{t('specNote')}</p>
        </Specimen>
      }
    >
      {minted && (
        <div className="stg-ai-reveal" role="status">
          <div className="stg-ai-reveal-head">
            <b>{t('reveal')}</b>
            <button type="button" className="btn ghost" onClick={() => setMinted(null)}>{t('done')}</button>
          </div>
          <p>{t('revealSub')}</p>
          <pre className="stg-ai-snip"><Ltr>{cliSnippet(minted.key)}</Ltr></pre>
          <div className="stg-ai-reveal-actions">
            <button type="button" className="btn" onClick={() => copy(cliSnippet(minted.key))}>{t('copyCmd')}</button>
            <button type="button" className="btn ghost" onClick={() => copy(desktopSnippet(minted.key))}>{t('copyJson')}</button>
          </div>
        </div>
      )}

      <PaneSection no="01" title={t('mkTitle')} sub={t('mkSub')}>
        <label className="field">
          <span>{t('nameL')}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('namePh')} maxLength={120} />
        </label>
        <div className="field">
          <span>{t('scopeL')}</span>
          <div className="stg-ai-scope">
            {([['READ_ONLY', t('roName'), t('roSub')], ['FULL', t('fullName'), t('fullSub')]] as const).map(([val, name, sub]) => (
              <button key={val} type="button" className={'stg-ai-scope-card' + (scope === val ? ' on' : '')}
                aria-pressed={scope === val} onClick={() => setScope(val as Scope)}>
                <b>{name}</b><span>{sub}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn" disabled={mintM.isPending} onClick={() => mintM.mutate()}>
          {mintM.isPending ? t('generating') : t('generate')}
        </button>
      </PaneSection>

      <PaneSection no="02" title={t('listTitle')} sub={t('listSub')}>
        {keys.length === 0 ? (
          <div className="stg-ai-empty"><b>{t('none')}</b><span>{t('noneSub')}</span></div>
        ) : (
          <ul className="stg-ai-list">
            {keys.map((k) => (
              <li key={k.id} className="stg-ai-row">
                <div className="stg-ai-row-id">
                  <b>{k.label}</b>
                  <span className={'stg-ai-badge ' + (k.scope === 'READ_ONLY' ? 'ro' : 'full')}>
                    {k.scope === 'READ_ONLY' ? t('roName') : t('fullName')}
                  </span>
                  <code>••••{k.last4}</code>
                </div>
                <div className="stg-ai-row-meta">
                  <span>{t('lastUsed')}: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : t('never')}</span>
                  <button type="button" className="btn danger sm" disabled={revokeM.isPending}
                    onClick={async () => {
                      if (!await confirm({ danger: true, title: t('delTitle'), message: t('delMsg'), confirmLabel: t('revoke') })) return;
                      revokeM.mutate(k.id);
                    }}>{t('revoke')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PaneSection>
    </SettingsShell>
  );
}
