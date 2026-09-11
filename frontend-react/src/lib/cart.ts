// Client-side cart, persisted per table token (no backend cart). Uses zustand.
//
// A cart line is keyed by `key` = `${menuItemId}` for items with no chosen options,
// or `${menuItemId}#${sorted optionIds}` when the customer picked options — so two
// lines of the same item with different sizes/extras stay as separate lines, while
// adding the same combo again bumps the quantity. `id` keeps the menu item id for
// price/name lookups; `selectedOptions` is what gets sent to the backend on checkout.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicItem, SelectedOption } from './types';

export interface CartLine {
  id: number;            // menu item id (display + price lookup)
  key: string;           // unique line key: `${id}` or `${id}#${optIds}`
  qty: number;
  note: string;
  selectedOptions: SelectedOption[];
}

/** Stable line key for a menu item + chosen options. */
export const cartLineKey = (id: number, options?: SelectedOption[] | null): string =>
  options && options.length
    ? `${id}#${options.map((o) => o.optionId).slice().sort((a, b) => a - b).join(',')}`
    : String(id);

/** Effective base price: the active sale price when discounted, otherwise the regular price. */
export const effectiveBasePrice = (item: PublicItem): number => item.salePrice ?? item.price;

/** Effective per-unit price: discounted base (if any) plus chosen option deltas. */
export const lineUnitPrice = (item: PublicItem, selectedOptions?: SelectedOption[] | null): number => {
  const base = effectiveBasePrice(item);
  if (!selectedOptions || !selectedOptions.length || !item.optionGroups?.length) return base;
  let delta = 0;
  for (const sel of selectedOptions) {
    for (const g of item.optionGroups) {
      const opt = g.options.find((o) => o.id === sel.optionId);
      if (opt) { delta += opt.priceDelta; break; }
    }
  }
  return base + delta;
};

interface CartState {
  carts: Record<string, CartLine[]>;
  add: (token: string, id: number, options?: SelectedOption[] | null) => void;
  addWithQty: (token: string, id: number, options: SelectedOption[] | null, qty: number) => void;
  bump: (token: string, key: string, d: number) => void;
  setNote: (token: string, key: string, note: string) => void;
  clear: (token: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (token, id, options) => set((s) => {
        const key = cartLineKey(id, options);
        const list = s.carts[token] || [];
        const exists = list.find((l) => l.key === key);
        const next = exists
          ? list.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
          : [...list, { id, key, qty: 1, note: '', selectedOptions: options ?? [] }];
        return { carts: { ...s.carts, [token]: next } };
      }),
      addWithQty: (token, id, options, qty) => set((s) => {
        if (qty <= 0) return s;
        const key = cartLineKey(id, options);
        const list = s.carts[token] || [];
        const exists = list.find((l) => l.key === key);
        const next = exists
          ? list.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
          : [...list, { id, key, qty, note: '', selectedOptions: options ?? [] }];
        return { carts: { ...s.carts, [token]: next } };
      }),
      bump: (token, key, d) => set((s) => {
        const next = (s.carts[token] || [])
          .map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l))
          .filter((l) => l.qty > 0);
        return { carts: { ...s.carts, [token]: next } };
      }),
      setNote: (token, key, note) => set((s) => ({
        carts: { ...s.carts, [token]: (s.carts[token] || []).map((l) => (l.key === key ? { ...l, note } : l)) },
      })),
      clear: (token) => set((s) => ({ carts: { ...s.carts, [token]: [] } })),
    }),
    {
      name: 'cafeqr_carts',
      version: 2,
      // Normalize carts persisted before options/key existed so the new typed shape holds.
      migrate: (persisted: any) => {
        if (!persisted || typeof persisted !== 'object' || !persisted.carts) return persisted;
        const carts: Record<string, CartLine[]> = {};
        for (const [tok, lines] of Object.entries(persisted.carts as Record<string, any[]>)) {
          carts[tok] = (lines || []).map((l) => ({
            id: l.id,
            key: l.key ?? String(l.id),
            qty: l.qty,
            note: l.note ?? '',
            selectedOptions: l.selectedOptions ?? [],
          }));
        }
        return { ...persisted, carts };
      },
    },
  ),
);

// One shared empty array: `|| []` built a fresh one on every selector run, so an empty
// cart never compared equal to itself and re-rendered the menu on unrelated store writes.
const NO_LINES: CartLine[] = [];

export const useCart = (token: string): CartLine[] => useCartStore((s) => s.carts[token] ?? NO_LINES);

/** Total quantity of a menu item across all its lines (used by the card "in cart" badge). */
export const qtyForItem = (cart: CartLine[], menuItemId: number): number =>
  cart.filter((l) => l.id === menuItemId).reduce((s, l) => s + l.qty, 0);