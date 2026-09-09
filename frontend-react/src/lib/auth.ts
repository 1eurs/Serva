import { useSyncExternalStore } from 'react';
import { getUser, onAuthChange } from './api';
import type { Permission, UserResponse } from './types';

export function useAuth() {
  const user = useSyncExternalStore(onAuthChange, getUser, getUser);
  return { user, authed: !!user };
}

type MaybeUser = UserResponse | null | undefined;

/** Whether the signed-in user holds a given permission. */
export const can = (user: MaybeUser, perm: Permission) => !!user?.permissions?.includes(perm);

/** Has any restaurant-management screen (menu/team/QR/profile/analytics) or is the owner. */
export const isManager = (user?: MaybeUser) =>
  !!user && (user.owner
    || can(user, 'MENU') || can(user, 'TEAM') || can(user, 'QR_TABLES')
    || can(user, 'PROFILE') || can(user, 'ANALYTICS') || can(user, 'BRANCHES'));

export const canAcceptOrders = (user?: MaybeUser) => can(user, 'ORDERS');
