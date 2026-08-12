import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Dashboard chrome weight — the Serva-branded surfaces only (.dash / .login / .adm).
 *
 *  'bold' — the original neobrutalist look: 4px hard offset shadows, 2px+ ink
 *           keylines, heavy display weights.
 *  'pro'  — the quieter professional skin: hairline borders, soft elevation,
 *           lighter display weights. Same emerald accent, same radii scale —
 *           this changes chrome weight, not personality.
 *
 * Purely visual: both skins read the SAME token names, only the values differ.
 * The values live in styles/theme.css under [data-skin="pro"]; nothing outside
 * that stylesheet should branch on the skin. Customer menu pages are unaffected —
 * per-restaurant menu theming is a separate system (see customer/menuThemes.ts).
 */
export type Skin = 'bold' | 'pro';

const STORE_KEY = 'serva.skin';

/**
 * Restaurants created on or after this date default to 'pro'. Everyone older
 * keeps 'bold', so no existing café's dashboard changes under them overnight.
 */
export const PRO_DEFAULT_SINCE = '2026-08-05';

export function defaultSkinFor(createdAt?: string | null): Skin {
  if (!createdAt) return 'bold';
  return createdAt.slice(0, 10) >= PRO_DEFAULT_SINCE ? 'pro' : 'bold';
}

function stored(): Skin | null {
  const v = localStorage.getItem(STORE_KEY);
  return v === 'bold' || v === 'pro' ? v : null;
}

interface SkinCtxValue {
  skin: Skin;
  /** The owner picked a skin in Settings → Appearance. Persists to localStorage. */
  setSkin: (s: Skin) => void;
  /** True once the owner has picked explicitly — a seed no longer overrides. */
  chosen: boolean;
  /**
   * Seed the default from the restaurant's age, once it's known. No-op when the
   * owner has already chosen. Safe to call on every render / restaurant refetch.
   */
  seedDefault: (createdAt?: string | null) => void;
}

const Ctx = createContext<SkinCtxValue>({
  skin: 'bold', setSkin: () => {}, chosen: false, seedDefault: () => {},
});

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(() => stored() ?? 'bold');
  const [chosen, setChosen] = useState(() => stored() !== null);

  useEffect(() => { document.documentElement.dataset.skin = skin; }, [skin]);

  const setSkin = useCallback((s: Skin) => {
    localStorage.setItem(STORE_KEY, s);
    setChosen(true);
    setSkinState(s);
  }, []);

  const seedDefault = useCallback((createdAt?: string | null) => {
    if (stored() !== null) return;
    setSkinState(defaultSkinFor(createdAt));
  }, []);

  const value = useMemo(() => ({ skin, setSkin, chosen, seedDefault }), [skin, setSkin, chosen, seedDefault]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSkin = () => useContext(Ctx);
