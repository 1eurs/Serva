import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ensureGoogleFonts } from '../../lib/fonts';
import { MenuDecorLayer } from './MenuDecor';
import { menuFontSpecsOf, resolveMenuSkin } from './menuThemes';
import { useVenue } from './venue';
import './customer.css';
import './menu-themes.css';
import './menu-layouts.css';

interface CustomerFrameProps {
  children: ReactNode;
  restaurantTheme?: string | null;
  restaurantThemeCustomJson?: string | null;
}

/**
 * Publishes the height of whatever bottom bar this screen has (the cart's Place-order bar,
 * the tracker's) as --foot-h on :root, so the toast can sit above it.
 *
 * A fixed lift does not hold: the bar grows a row for the loyalty redeem switch, and
 * another for the car plate, and each time it grows the toast lands back on top of it.
 */
function useFootHeight(frame: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = document.documentElement;
    const set = (h: number) => root.style.setProperty('--foot-h', h ? `${Math.ceil(h)}px` : '0px');
    const bar = () => frame.current?.querySelector<HTMLElement>('.c-foot-bar') ?? null;
    const ro = new ResizeObserver(() => set(bar()?.offsetHeight ?? 0));
    // The bar comes and goes with the route, so watch the frame for it appearing too.
    const mo = new MutationObserver(() => {
      const b = bar();
      ro.disconnect();
      if (b) ro.observe(b);
      set(b?.offsetHeight ?? 0);
    });
    if (frame.current) mo.observe(frame.current, { childList: true, subtree: true });
    const b = bar();
    if (b) ro.observe(b);
    set(b?.offsetHeight ?? 0);
    return () => { ro.disconnect(); mo.disconnect(); root.style.removeProperty('--foot-h'); };
  }, [frame]);
}

export function CustomerFrame({ children, restaurantTheme, restaurantThemeCustomJson }: CustomerFrameProps) {
  const venue = useVenue();
  const theme = restaurantTheme ?? venue.restaurant?.theme;
  const customJson = restaurantThemeCustomJson ?? venue.restaurant?.themeCustomJson;
  const { themeId, style, decor, attrs } = resolveMenuSkin(theme, customJson);
  const phoneRef = useRef<HTMLDivElement>(null);
  useFootHeight(phoneRef);

  // Fetch just this venue's display font (display=swap, so text never blocks on it).
  useEffect(() => { ensureGoogleFonts(menuFontSpecsOf(theme, customJson)); }, [theme, customJson]);

  return (
    <div className="cust-bg" data-menu-theme={themeId} style={style as CSSProperties | undefined} {...attrs}>
      <div className="phone" ref={phoneRef}><MenuDecorLayer decor={decor} />{children}</div>
    </div>
  );
}
