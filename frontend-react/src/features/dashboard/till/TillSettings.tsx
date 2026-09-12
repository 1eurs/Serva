import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useT } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { BranchResponse, TillSession } from '../../../lib/types';
import { PaneSection, SettingsShell, Specimen } from '../SettingsShell';
import { DICT, fill } from './copy';
import './till.css';

/** What the threshold box offers before anyone types their own. */
const NOTE_STEPS = ['0.500', '1.000', '2.000', '5.000'];

/**
 * Settings → Till.
 *
 * <p>Four switches, and the first one is an off switch. A café that never wanted to count a
 * drawer must be able to say so and get its plain pause button back — a feature that can only
 * be adopted, never declined, is one that turns into a morning chore for the shops it doesn't
 * fit. The rest describe how this shop wants the count run, because a drawer belongs to a room.
 */
export default function TillSettings({ branchId }: { branchId?: number }) {
  const t = useT(DICT);
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const qc = useQueryClient();
  const toast = useToast();

  const branchesQ = useQuery({
    queryKey: ['branches', rid],
    queryFn: () => api.get<BranchResponse[]>(`/api/restaurants/${rid}/branches`),
  });
  const branch = branchesQ.data?.find((b) => b.id === branchId) ?? branchesQ.data?.[0];

  const [enabled, setEnabled] = useState(true);
  const [blind, setBlind] = useState(true);
  const [carry, setCarry] = useState(true);
  const [noteOn, setNoteOn] = useState(true);
  const [noteOver, setNoteOver] = useState('1.000');

  useEffect(() => {
    if (!branch) return;
    setEnabled(branch.tillEnabled);
    setBlind(branch.tillBlindCount);
    setCarry(branch.tillCarryFloat);
    setNoteOn(branch.tillNoteOver != null);
    setNoteOver(branch.tillNoteOver != null ? Number(branch.tillNoteOver).toFixed(3) : '1.000');
  }, [branch?.id, branch?.tillEnabled, branch?.tillBlindCount, branch?.tillCarryFloat, branch?.tillNoteOver]);

  // The last few closes, which is the only proof any of this is working. Read-only, and
  // deliberately in Settings rather than the header: nobody needs last Tuesday mid-service.
  const historyQ = useQuery({
    queryKey: ['till-sessions', branch?.id],
    queryFn: () => api.get<TillSession[]>(`/api/branches/${branch!.id}/till/sessions`),
    enabled: !!branch && branch.tillEnabled,
  });

  const save = useMutation({
    mutationFn: () => api.patch<BranchResponse>(`/api/branches/${branch!.id}`, {
      tillEnabled: enabled,
      tillBlindCount: blind,
      tillCarryFloat: carry,
      tillNoteRequired: noteOn,
      tillNoteOver: noteOn ? Number(noteOver || 0) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', rid] });
      qc.invalidateQueries({ queryKey: ['branch', branch!.id] });
      qc.invalidateQueries({ queryKey: ['till', branch!.id] });
      toast(t('savedToast'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const closes = (historyQ.data ?? []).filter((s) => s.closedAt);

  return (
    <SettingsShell
      mark="🧰"
      surface={t('setSurface')}
      title={t('setTitle')}
      sub={t('setSub')}
      actions={
        <button className="btn sm" type="button" disabled={!branch || save.isPending}
          onClick={() => save.mutate()}>{t('saveBtn')}</button>
      }
      aside={
        <Specimen label={t('recent')}>
          <div className="till-history">
            {closes.length === 0 && <p className="till-hint">{t('noHistory')}</p>}
            {closes.map((s) => {
              const variance = s.variance ?? 0;
              return (
                <div key={s.id} className={'till-history-row ' + (variance === 0 ? 'exact' : variance < 0 ? 'short' : 'over')}>
                  <span className="till-h-when">
                    {new Date(s.closedAt!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="till-h-who">{s.closedBy ?? '—'}</span>
                  <b>{variance === 0
                    ? t('exact')
                    : fill(t(variance < 0 ? 'short' : 'over'), { v: Math.abs(variance).toFixed(3) })}</b>
                </div>
              );
            })}
          </div>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('secUse')} sub={t('secUseSub')}>
        <div className="profile-settings">
          <div className="profile-setting">
            <div><b>{t('useTill')}</b><span>{enabled ? t('useTillOn') : t('useTillOff')}</span></div>
            <button type="button" className={'switch' + (enabled ? ' on' : '')}
              role="switch" aria-checked={enabled} aria-label={t('useTill')}
              onClick={() => setEnabled((v) => !v)}><span /></button>
          </div>
        </div>
      </PaneSection>

      <PaneSection no="02" title={t('secCount')} sub={t('secCountSub')}>
        <div className="profile-settings">
          <div className="profile-setting">
            <div><b>{t('blind')}</b><span>{blind ? t('blindOn') : t('blindOff')}</span></div>
            <button type="button" className={'switch' + (blind ? ' on' : '')}
              role="switch" aria-checked={blind} aria-label={t('blind')} disabled={!enabled}
              onClick={() => setBlind((v) => !v)}><span /></button>
          </div>
          <div className="profile-setting">
            <div><b>{t('carry')}</b><span>{carry ? t('carryOn') : t('carryOff')}</span></div>
            <button type="button" className={'switch' + (carry ? ' on' : '')}
              role="switch" aria-checked={carry} aria-label={t('carry')} disabled={!enabled}
              onClick={() => setCarry((v) => !v)}><span /></button>
          </div>
        </div>
      </PaneSection>

      <PaneSection no="03" title={t('secNote')} sub={t('secNoteSub')}>
        <div className="profile-settings">
          <div className="profile-setting">
            <div><b>{t('noteAsk')}</b><span>{noteOn ? '' : t('noteNever')}</span></div>
            <button type="button" className={'switch' + (noteOn ? ' on' : '')}
              role="switch" aria-checked={noteOn} aria-label={t('noteAsk')} disabled={!enabled}
              onClick={() => setNoteOn((v) => !v)}><span /></button>
          </div>
        </div>
        {noteOn && (
          <div className="till-steps seg seg-wrap">
            {NOTE_STEPS.map((step) => (
              <button key={step} type="button" disabled={!enabled}
                className={noteOver === step ? 'on' : ''}
                onClick={() => setNoteOver(step)} dir="ltr">{step}</button>
            ))}
            <label className="till-step-own">
              <input className="num" type="number" inputMode="decimal" min="0" step="0.100" dir="ltr"
                disabled={!enabled} value={noteOver} onChange={(e) => setNoteOver(e.target.value)} />
            </label>
          </div>
        )}
      </PaneSection>
    </SettingsShell>
  );
}
