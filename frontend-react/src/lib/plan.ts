import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { Feature } from './types';

/**
 * What the signed-in café's plan includes, straight from the server.
 *
 * <p>This used to be `isProPlan(restaurant.plan)` — a copy of the server's rule living in the
 * browser, which was fine only while that rule was a constant. It is not one any more: a
 * platform admin edits the tier/feature grid on the Plans page, so the browser has to ask
 * rather than assume. Same answer the gates use, from the same table.
 *
 * <p>`ready` matters. Before the answer arrives every feature reads as absent, and a screen
 * that renders an upsell on that would flash "upgrade" at a café that pays for the thing —
 * so gates wait for `ready` before deciding anything the user can see.
 *
 * <p>Keyed by the café, because signing out does not empty the query cache and a platform
 * admin can step into a café from the console. An unkeyed answer would survive that switch,
 * and "everything, because I was an admin a moment ago" is the wrong thing to hand a
 * Standard café's dashboard.
 */
export function useFeatures() {
  const { user } = useAuth();
  const scope = user?.restaurantId ?? 'platform';
  const q = useQuery({
    queryKey: ['my-features', scope],
    queryFn: () => api.get<Feature[]>('/api/dashboard/features'),
    staleTime: 5 * 60_000,
  });
  const included = q.data;
  return {
    ready: q.isSuccess && !!included,
    has: (feature: Feature) => !!included?.includes(feature),
    features: included ?? [],
    /** For screens that show their own loading/error/retry chrome around the answer. */
    query: q,
  };
}

export function isPlanRequiredError(err: unknown): boolean {
  return typeof err === 'object' && err !== null
    && 'errorCode' in err && (err as { errorCode?: string }).errorCode === 'PLAN_REQUIRED';
}
