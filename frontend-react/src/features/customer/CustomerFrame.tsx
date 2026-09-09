import { useEffect, type CSSProperties, type ReactNode } from 'react';
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

export function CustomerFrame({ children, restaurantTheme, restaurantThemeCustomJson }: CustomerFrameProps) {
  const venue = useVenue();
  const theme = restaurantTheme ?? venue.restaurant?.theme;
  const customJson = restaurantThemeCustomJson ?? venue.restaurant?.themeCustomJson;
  const { themeId, style, decor, attrs } = resolveMenuSkin(theme, customJson);

  // Fetch just this venue's display font (display=swap, so text never blocks on it).
  useEffect(() => { ensureGoogleFonts(menuFontSpecsOf(theme, customJson)); }, [theme, customJson]);

  return (
    <div className="cust-bg" data-menu-theme={themeId} style={style as CSSProperties | undefined} {...attrs}>
      <div className="phone"><MenuDecorLayer decor={decor} />{children}</div>
    </div>
  );
}
