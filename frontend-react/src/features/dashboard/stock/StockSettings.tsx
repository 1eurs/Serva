import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useT } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import type { Restaurant } from '../../../lib/types';
import { PaneSection } from '../SettingsShell';
import { DICT } from './copy';

/**
 * The one switch the shelf has, in Settings where the owner asked for it.
 *
 * <p>Saves on the tap rather than behind a Save button: it is a single yes/no, and a switch that
 * flips on screen and then quietly does nothing until a second button is found is the kind of
 * control that gets reported as broken. The row says which way it is set in words as well.
 */
export default function StockSettings() {
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const rid = useAuth().user?.restaurantId;

  const q = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
    enabled: !!rid,
  });
  const on = !!q.data?.hideWhenOutOfStock;

  const flip = useMutation({
    mutationFn: (next: boolean) => api.patch<Restaurant>(`/api/restaurants/${rid}`, { hideWhenOutOfStock: next }),
    onSuccess: (saved) => {
      qc.setQueryData(['restaurant', rid], saved);
      toast(saved.hideWhenOutOfStock ? t('hideOn') : t('hideOff'));
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <PaneSection no="01" title={t('setT')} sub={t('rulesHint')}>
      <div className="profile-settings">
        <div className="profile-setting profile-payment-setting">
          <div>
            <b>{t('hideT')}</b>
            <span>{t('hideS')}</span>
            <span className="stk-set-note">{t('hideNote')}</span>
          </div>
          <button type="button" className={'switch' + (on ? ' on' : '')}
            role="switch" aria-checked={on} aria-label={t('hideT')}
            disabled={!q.data || flip.isPending}
            onClick={() => flip.mutate(!on)}><span /></button>
        </div>
      </div>
    </PaneSection>
  );
}
