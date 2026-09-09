// The lead pipeline: every café that asked for access, and what we did about it.
//
// These submissions already existed — they just had nowhere to be seen, so following one up
// depended on whoever happened to answer the phone remembering to. A board makes the state
// visible: how long a café has been waiting, what was said when we called, and whether it
// ever became a real café.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useT, Ltr } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import type { Lead, LeadStatus, Restaurant } from '../../lib/types';
import { DICT } from './dict';
import { ago } from './shared';
import OnboardWizard from './OnboardWizard';

const COLUMNS: { status: LeadStatus; key: string }[] = [
  { status: 'NEW', key: 'pipeNew' },
  { status: 'CONTACTED', key: 'pipeContacted' },
  { status: 'CONVERTED', key: 'pipeConverted' },
  { status: 'ARCHIVED', key: 'pipeArchived' },
];

export default function PipelineView({ onOpenCafe }: { onOpenCafe: (restaurantId: number) => void }) {
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const [converting, setConverting] = useState<Lead | null>(null);
  const [openNote, setOpenNote] = useState<number | null>(null);

  const { data: leads = [] } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: () => api.get<Lead[]>('/api/admin/leads'),
    refetchInterval: 120_000,
  });

  const move = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: number; status?: LeadStatus; adminNote?: string }) =>
      api.patch<Lead>(`/api/admin/leads/${id}`, { status, adminNote }),
    onSuccess: (_l, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      toast(vars.status ? t('saved') : t('pipeNoteSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const byStatus = (s: LeadStatus) => leads.filter((l) => l.status === s);

  return (
    <div className="acontent">
      <div className="ph" style={{ marginBottom: 16 }}>{t('pipeSub')}</div>

      <div className="pipe">
        {COLUMNS.map(({ status, key }) => {
          const column = byStatus(status);
          return (
            <section className="pipe-col" key={status}>
              <header className={'pipe-hd ' + status.toLowerCase()}>
                {t(key)}<span className="sect-count">{column.length}</span>
              </header>
              <div className="pipe-list">
                {column.length === 0 && <div className="pipe-empty">{t('pipeEmpty')}</div>}
                {column.map((l) => (
                  <article className="lead" key={l.id}>
                    <div className="lead-top">
                      <div className="lead-name" dir="auto">{l.cafeName}</div>
                      {l.status === 'NEW' && (
                        <span className="chip warn" title={t('pipeWaiting')}>
                          <span className="d" />{ago(l.createdAt, t)}
                        </span>
                      )}
                    </div>
                    <div className="lead-who" dir="auto">{l.contactName}{l.city ? ` · ${l.city}` : ''}</div>
                    <div className="lead-contact">
                      {l.phone && <a className="num" href={`tel:${l.phone}`}><Ltr>{l.phone}</Ltr></a>}
                      {l.email && <a className="num" href={`mailto:${l.email}`} dir="ltr">{l.email}</a>}
                    </div>
                    {l.note && (
                      <div className="lead-note"><span className="lead-note-k">{t('pipeTheirNote')}</span>
                        <span dir="auto">{l.note}</span></div>
                    )}
                    {l.adminNote && openNote !== l.id && (
                      <div className="lead-note mine"><span className="lead-note-k">{t('pipeNote')}</span>
                        <span dir="auto">{l.adminNote}</span></div>
                    )}

                    {openNote === l.id ? (
                      <NoteEditor
                        initial={l.adminNote ?? ''}
                        placeholder={t('pipeNotePh')}
                        saving={move.isPending}
                        onCancel={() => setOpenNote(null)}
                        onSave={(adminNote) => {
                          move.mutate({ id: l.id, adminNote });
                          setOpenNote(null);
                        }}
                      />
                    ) : (
                      <div className="lead-acts">
                        {l.status === 'NEW' && (
                          <button className="btn sm ghost"
                            onClick={() => move.mutate({ id: l.id, status: 'CONTACTED' })}>{t('pipeCall')}</button>
                        )}
                        <button className="btn sm ghost" onClick={() => setOpenNote(l.id)}>{t('pipeNote')}</button>
                        {l.restaurantId ? (
                          <button className="btn sm" onClick={() => onOpenCafe(l.restaurantId!)}>{t('pipeOpenCafe')}</button>
                        ) : l.status === 'ARCHIVED' ? (
                          <button className="btn sm ghost"
                            onClick={() => move.mutate({ id: l.id, status: 'NEW' })}>{t('pipeReopen')}</button>
                        ) : (
                          <>
                            <button className="btn sm ghost"
                              onClick={() => move.mutate({ id: l.id, status: 'ARCHIVED' })}>{t('pipeArchive')}</button>
                            <button className="btn sm" onClick={() => setConverting(l)}>{t('pipeConvert')}</button>
                          </>
                        )}
                      </div>
                    )}
                    {l.contactedAt && (
                      <div className="lead-foot">{t('pipeContactedAt')} · {ago(l.contactedAt, t)}</div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {converting && (
        <OnboardWizard
          lead={converting}
          onClose={() => setConverting(null)}
          onDone={(created: Restaurant) => {
            setConverting(null);
            qc.invalidateQueries({ queryKey: ['admin-leads'] });
            qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
            qc.invalidateQueries({ queryKey: ['admin-restaurant-stats'] });
            toast(t('createdOk'));
            onOpenCafe(created.id);
          }}
        />
      )}
    </div>
  );
}

function NoteEditor({ initial, placeholder, saving, onSave, onCancel }: {
  initial: string; placeholder: string; saving: boolean;
  onSave: (v: string) => void; onCancel: () => void;
}) {
  const t = useT(DICT);
  const [value, setValue] = useState(initial);
  return (
    <div className="lead-noteedit">
      <textarea value={value} placeholder={placeholder} rows={3} autoFocus
        onChange={(e) => setValue(e.target.value)} />
      <div className="lead-acts">
        <button className="btn sm ghost" onClick={onCancel}>{t('cancel')}</button>
        <button className="btn sm" disabled={saving} onClick={() => onSave(value)}>{t('pipeSaveNote')}</button>
      </div>
    </div>
  );
}
