// Per-venue "menu look" themes for App A (the customer-facing menu/cart/track).
// Each theme is a full, self-contained skin: the live palette + atmosphere lives
// in menu-themes.css under [data-menu-theme="<id>"]; the small mirror below feeds
// the in-app theme picker cards. Onyx is the default and is the only theme that
// follows the site's dark/light toggle — branded themes own their own look.
export interface MenuTheme {
  id: string;
  labelAr: string; labelEn: string;
  descAr: string;  descEn: string;
  dark: boolean;
  /** font-family for display headings — must match --font-display in menu-themes.css */
  font: string;
  /** preview swatch for the picker card (mirrors the css tokens) */
  swatch: { bg: string; ink: string; accent: string; accent2: string };
}

/**
 * The full menu skin as one JSON document. This is THE theme format: the owner's
 * editor, the saved value (restaurant.themeCustomJson) and future AI-generated
 * themes all speak this schema. Unknown keys are ignored and every field falls
 * back to a default, so a partial/imperfect document still renders safely.
 */
export interface MenuThemeCustom {
  /** optional display label (useful for AI-generated themes) */
  name?: string;
  canvas: string;
  paper: string;
  surface: string;
  text: string;
  muted: string;
  /**
   * When set, the owner hand-picked text / secondary-text in the editor, so those colours
   * render exactly as chosen instead of passing through the auto-readability guard. Auto
   * themes (Quick mix, presets, reset) leave these unset and keep the contrast guard, which
   * is why a hand-picked hue used to collapse toward black/white. Absent/false = guarded.
   */
  textCustom?: boolean;
  mutedCustom?: boolean;
  accent: string;
  accent2: string;
  cartBg: string;
  motifColor: string;
  motifOpacity: number;
  background: 'soft' | 'arches' | 'dots' | 'waves' | 'tiles' | 'linen';
  motif: 'none' | 'bean' | 'cup' | 'palm' | 'star' | 'crescent' | 'leaf' | 'drop' | 'geo';
  font: MenuFontKey;
  radius: MenuRadiusKey;
  /**
   * The structural "kit" — the layout identity that used to need bespoke per-theme
   * CSS (the comic card, the scoreboard badge, the heritage header band). Each value
   * selects a recipe that reads ONLY the palette tokens, so an AI/owner-generated
   * document inherits the same contrast-safe colours. This is what makes the JSON
   * space combinatorial (cardStyle × badge × header × palette × …) instead of flat.
   */
  cardStyle: MenuCardStyleKey;
  cardBadge: MenuCardBadgeKey;
  headerStyle: MenuHeaderStyleKey;
  /**
   * Which layout renders the items. Separate from cardStyle on purpose: a card style
   * paints the row, a layout replaces it. See LAYOUT_OPTIONS.
   */
  layout: MenuLayoutKey;
  /**
   * Optional bespoke "skin" — a rich, hand-crafted occasion overlay (bunting, flag
   * bands, national emblem…) layered ON TOP of the palette via [data-menu-skin]. It
   * reaches detail the generic structural kit can't, while still living inside the JSON
   * document so it saves/previews like any theme. Whitelisted in MENU_SKINS; '' = none.
   */
  skin?: string;
  decor: MenuThemeDecor;
}

/**
 * The decor layer: emoji drifting over the screen's empty space, a sticker pinned on every
 * item card, and a greeting ribbon across the top.
 *
 * Theme-owned, like the font and the motif — there is no owner-facing control for it and
 * there should not be one. It was briefly offered as an "Occasion" picker and cut: a café's
 * menu is a place of business, and one tap that scatters emoji across it is the kind of
 * decoration that makes the whole product look like a toy. Oman National Day keeps its two
 * flag glyphs because they belong to that theme's design, deliberately, not to a switch.
 *
 * `cardSticker` and the banner fields survive for documents saved while the old sticker
 * editor existed, so those menus keep rendering what their owner set. Nothing writes them
 * now. Everything here is optional; a regular café theme leaves it all empty.
 */
export interface MenuThemeDecor {
  /** emoji floating over the empty spaces (up to 6 distinct, cycled across slots) */
  floaters: string[];
  /** 0.06–0.6 — how strongly the floaters show */
  floaterOpacity: number;
  /** small sticker pinned to the top corner of every item card ('' = none) */
  cardSticker: string;
  /** greeting ribbon across the top of the phone ('' = none) */
  bannerAr: string;
  bannerEn: string;
}

export const DEFAULT_DECOR: MenuThemeDecor = {
  floaters: [],
  floaterOpacity: 0.3,
  cardSticker: '',
  bannerAr: '',
  bannerEn: '',
};

export type MenuFontKey = 'system' | 'markazi' | 'baloo' | 'tajawal' | 'elmessiri' | 'reemkufi' | 'sora';
/** Display-font stacks — loaded on demand via menuFontSpecsOf() + ensureGoogleFonts(). */
export const FONT_STACKS: Record<MenuFontKey, string> = {
  system: 'var(--font-ar)',
  markazi: "'Markazi Text', var(--font-ar)",
  baloo: "'Baloo Bhaijaan 2', var(--font-ar)",
  tajawal: "'Tajawal', var(--font-ar)",
  elmessiri: "'El Messiri', var(--font-ar)",
  reemkufi: "'Reem Kufi', var(--font-ar)",
  sora: "'Sora', var(--font-ar)",
};
export const FONT_OPTIONS = Object.keys(FONT_STACKS) as MenuFontKey[];

export type MenuRadiusKey = 'sharp' | 'soft' | 'round';
/** Corner-radius scales feeding the --r-* hooks in customer.css. */
const RADIUS_PRESETS: Record<MenuRadiusKey, { mark: string; card: string; thumb: string; ctl: string }> = {
  sharp: { mark: '8px', card: '10px', thumb: '8px', ctl: '8px' },
  soft: { mark: '15px', card: '16px', thumb: '14px', ctl: '13px' },
  round: { mark: '22px', card: '22px', thumb: '20px', ctl: '18px' },
};
export const RADIUS_OPTIONS = Object.keys(RADIUS_PRESETS) as MenuRadiusKey[];

/**
 * Structural-kit keys. The palette-driven CSS recipes live in menu-themes.css under
 * [data-card-style] / [data-card-badge] / [data-header-style], selected on the .cust-bg
 * shell via menuStructuralAttrs(). 'flat'/'none'/'plain' reproduce today's default look,
 * so legacy documents (which lack these fields) keep rendering exactly as before.
 */
export type MenuCardStyleKey = 'flat' | 'outline' | 'ticket' | 'comic' | 'glow';
export type MenuCardBadgeKey = 'none' | 'disc' | 'tab' | 'ribbon';
export type MenuHeaderStyleKey = 'plain' | 'band' | 'side';
export const CARD_STYLE_OPTIONS: MenuCardStyleKey[] = ['flat', 'outline', 'ticket', 'comic', 'glow'];
export const CARD_BADGE_OPTIONS: MenuCardBadgeKey[] = ['none', 'disc', 'tab', 'ribbon'];
export const HEADER_STYLE_OPTIONS: MenuHeaderStyleKey[] = ['plain', 'band', 'side'];

/**
 * The menu's information architecture — a different axis from everything above. The kit
 * keys decorate a row; the layout decides what a row *is*. Rules live in menu-layouts.css
 * under [data-menu-layout] and read only palette tokens, so every look inherits them.
 * 'list' is the original layout (its rules are plain customer.css), so a legacy document
 * without the field renders exactly as before.
 */
export type MenuLayoutKey = 'list' | 'gallery';
export const LAYOUT_OPTIONS: MenuLayoutKey[] = ['list', 'gallery'];

/** Bespoke occasion skins (rich CSS overlays under [data-menu-skin] in menu-themes.css). */
export const MENU_SKINS = ['omannational'] as const;

export const MENU_THEMES: MenuTheme[] = [
  { id: 'onyx',  labelAr: 'أونيكس', labelEn: 'Onyx',  descAr: 'عصري · داكن',   descEn: 'Modern · dark',
    dark: true,  font: 'var(--font-ar)',
    swatch: { bg: '#0E0F12', ink: '#F3F5F0', accent: '#10b981', accent2: '#059669' } },

  { id: 'qahwa', labelAr: 'قهوة',  labelEn: 'Qahwa', descAr: 'دافئ · مقهى',    descEn: 'Warm · café',
    dark: false, font: "'Markazi Text', serif",
    swatch: { bg: '#FBF5EC', ink: '#2C1B12', accent: '#C8862B', accent2: '#A86A1C' } },

  { id: 'warda', labelAr: 'وردة',  labelEn: 'Warda', descAr: 'لطيف · حلويات',  descEn: 'Cute · sweet',
    dark: false, font: "'Baloo Bhaijaan 2', system-ui",
    swatch: { bg: '#FFF1F4', ink: '#5A2233', accent: '#FF7AA2', accent2: '#FF5C89' } },

  { id: 'mint',  labelAr: 'نعناع', labelEn: 'Mint',  descAr: 'منعش · صحّي',    descEn: 'Fresh · clean',
    dark: false, font: "'Tajawal', sans-serif",
    swatch: { bg: '#F2F8F2', ink: '#143F2B', accent: '#2FBF71', accent2: '#1FA85E' } },

  { id: 'bahr',  labelAr: 'بحر',   labelEn: 'Bahr',  descAr: 'ساحلي · مطرح',   descEn: 'Coastal · Mutrah',
    dark: false, font: "'El Messiri', sans-serif",
    swatch: { bg: '#F3F1E9', ink: '#0B3B47', accent: '#E2674A', accent2: '#D24E32' } },

  { id: 'bahar', labelAr: 'بهارات', labelEn: 'Bahar', descAr: 'جريء · سوق',    descEn: 'Bold · souq',
    dark: false, font: "'Reem Kufi', sans-serif",
    swatch: { bg: '#FBEEE0', ink: '#4A1C0E', accent: '#D7521E', accent2: '#E8A23D' } },

  { id: 'layl',  labelAr: 'ليل',   labelEn: 'Layl',  descAr: 'فاخر · ذهبي',    descEn: 'Luxe · gold',
    dark: true,  font: "'Markazi Text', serif",
    swatch: { bg: '#14110D', ink: '#F3ECDD', accent: '#D4AF6C', accent2: '#B8924A' } },

  { id: 'sikka', labelAr: 'سِكّة', labelEn: 'Sikka', descAr: 'حضري · نيون', descEn: 'Urban · neon',
    dark: true, font: "'Tajawal', sans-serif",
    swatch: { bg: '#101417', ink: '#EAF7F6', accent: '#32D6C8', accent2: '#FF6D9E' } },

  { id: 'webhero', labelAr: 'ويب هيرو', labelEn: 'Web Hero', descAr: 'كوميكس · شباك', descEn: 'Comic · web',
    dark: true, font: "'Sora', sans-serif",
    swatch: { bg: '#080B18', ink: '#F8FAFC', accent: '#E31B3F', accent2: '#2563EB' } },

  { id: 'omanmatch', labelAr: 'عُمان ماتش', labelEn: 'Oman Matchday', descAr: 'كأس العالم · ملعب', descEn: 'World cup · pitch',
    dark: true, font: "'Tajawal', sans-serif",
    swatch: { bg: '#071A12', ink: '#F8FAFC', accent: '#C8102E', accent2: '#00843D' } },

  { id: 'madridnight', labelAr: 'مدريد نايت', labelEn: 'Madrid Night', descAr: 'كلاسيكو · أضواء', descEn: 'Match night · lights',
    dark: true, font: "'Sora', sans-serif",
    swatch: { bg: '#0B1024', ink: '#F8FAFC', accent: '#F2D27A', accent2: '#5B4BC4' } },

  { id: 'omannational', labelAr: 'العيد الوطني', labelEn: 'Oman National Day', descAr: 'عُماني · احتفال', descEn: 'Omani · celebration',
    dark: false, font: "'Reem Kufi', sans-serif",
    swatch: { bg: '#FFF7EA', ink: '#3B2017', accent: '#C8102E', accent2: '#00843D' } },

  { id: 'mothersday', labelAr: 'يوم الأم', labelEn: "Mother's Day", descAr: 'عُماني · ورد', descEn: 'Omani · floral',
    dark: false, font: "'Markazi Text', serif",
    swatch: { bg: '#F8E9D8', ink: '#3D2419', accent: '#B84E5D', accent2: '#C99745' } },

  { id: 'majlis', labelAr: 'مجلس', labelEn: 'Majlis', descAr: 'تراثي · زمرد', descEn: 'Heritage · emerald',
    dark: true, font: "'Reem Kufi', sans-serif",
    swatch: { bg: '#10251E', ink: '#F2E8D0', accent: '#C79A43', accent2: '#2EA37A' } },

  { id: 'azraq', labelAr: 'أزرق', labelEn: 'Azraq', descAr: 'بلاط · هادئ', descEn: 'Tile · calm',
    dark: false, font: "'El Messiri', sans-serif",
    swatch: { bg: '#EEF6F8', ink: '#123846', accent: '#227D9A', accent2: '#E0A43B' } },

  { id: 'nakhla', labelAr: 'نخلة', labelEn: 'Nakhla', descAr: 'حديقة · تمر', descEn: 'Garden · dates',
    dark: false, font: "'Markazi Text', serif",
    swatch: { bg: '#F7F2E6', ink: '#213B24', accent: '#6D8C3B', accent2: '#C8833A' } },
];

export const DEFAULT_THEME = 'onyx';
export const CUSTOM_THEME = 'custom';

/**
 * The starting look, and what "Reset" restores. It is deliberately the Onyx palette the
 * customer app already falls back to when a café has saved nothing (see resolveThemeId), so
 * "default" means one thing in the editor and on the phone.
 *
 * The structural fields below (background, motif, cardStyle, cardBadge, headerStyle) are
 * fixed at their plainest value and have no control on the Look screen: the editor is five
 * direct choices, not a design tool. They stay in the schema because documents saved when
 * those pickers existed still render, and stripping the fields would repaint a live menu.
 */
export const DEFAULT_CUSTOM_THEME: MenuThemeCustom = {
  canvas: '#0E0F12',
  paper: '#0E0F12',
  surface: '#1A1D22',
  text: '#F3F5F0',
  muted: '#A6ADA9',
  accent: '#10B981',
  accent2: '#34D399',
  cartBg: '#F3F5F0',
  motifColor: '#10B981',
  motifOpacity: 0.15,
  background: 'soft',
  motif: 'none',
  font: 'system',
  radius: 'soft',
  cardStyle: 'flat',
  cardBadge: 'none',
  headerStyle: 'plain',
  layout: 'list',
  decor: DEFAULT_DECOR,
};

/** Shared motif list — the single source of truth for both the picker UI and validation. */
export const MOTIF_OPTIONS: MenuThemeCustom['motif'][] =
  ['none', 'bean', 'cup', 'palm', 'star', 'crescent', 'leaf', 'drop', 'geo'];
const BACKGROUND_OPTIONS: MenuThemeCustom['background'][] =
  ['soft', 'arches', 'dots', 'waves', 'tiles', 'linen'];

export const isThemeId = (id: string | null | undefined): id is string =>
  !!id && (id === CUSTOM_THEME || MENU_THEMES.some((t) => t.id === id));

export const themeMeta = (id: string | null | undefined): MenuTheme =>
  MENU_THEMES.find((t) => t.id === id) ?? MENU_THEMES[0];

/** Resolve the active public-menu theme chosen by the cafe owner. */
export const resolveThemeId = (restaurantTheme?: string | null): string =>
  isThemeId(restaurantTheme) ? restaurantTheme : DEFAULT_THEME;

/** Google css2 specs per display family (the system/IBM Plex base loads in index.html). */
const GOOGLE_FONT_SPECS: Record<string, string> = {
  'Markazi Text': 'Markazi+Text:wght@400;500;600;700',
  'Baloo Bhaijaan 2': 'Baloo+Bhaijaan+2:wght@500;600;700',
  'Tajawal': 'Tajawal:wght@400;500;700',
  'El Messiri': 'El+Messiri:wght@500;600;700',
  'Reem Kufi': 'Reem+Kufi:wght@500;600;700',
  'Sora': 'Sora:wght@600;700;800',
};

/** Every display font a theme can use — for the dashboard theme editor's font picker. */
export const ALL_MENU_FONT_SPECS = Object.values(GOOGLE_FONT_SPECS);

/**
 * The Google Fonts specs the active skin's display font needs, so the customer app
 * downloads only the one family this venue uses instead of all of them up front.
 */
export function menuFontSpecsOf(theme?: string | null, customJson?: string | null): string[] {
  const stack = customJson && customJson.trim().startsWith('{')
    ? FONT_STACKS[parseCustomTheme(customJson).font] ?? FONT_STACKS.system
    : themeMeta(resolveThemeId(theme)).font;
  return Object.entries(GOOGLE_FONT_SPECS)
    .filter(([family]) => stack.includes(family))
    .map(([, spec]) => spec);
}

export function parseCustomTheme(json?: string | null): MenuThemeCustom {
  if (!json) return DEFAULT_CUSTOM_THEME;
  try {
    const parsed = JSON.parse(json) as Partial<MenuThemeCustom>;
    const next = { ...DEFAULT_CUSTOM_THEME, decor: { ...DEFAULT_DECOR } };
    Object.entries(parsed).forEach(([key, value]) => {
      if (key === 'name' && typeof value === 'string') {
        next.name = value.slice(0, 80);
        return;
      }
      if (key === 'decor' && value && typeof value === 'object' && !Array.isArray(value)) {
        next.decor = sanitizeDecor(value as Partial<MenuThemeDecor>);
        return;
      }
      if (key === 'background' && typeof value === 'string' && (BACKGROUND_OPTIONS as string[]).includes(value)) {
        next.background = value as MenuThemeCustom['background'];
        return;
      }
      if (key === 'motif' && typeof value === 'string' && (MOTIF_OPTIONS as string[]).includes(value)) {
        next.motif = value as MenuThemeCustom['motif'];
        return;
      }
      if (key === 'font' && typeof value === 'string' && value in FONT_STACKS) {
        next.font = value as MenuFontKey;
        return;
      }
      if (key === 'radius' && typeof value === 'string' && value in RADIUS_PRESETS) {
        next.radius = value as MenuRadiusKey;
        return;
      }
      if (key === 'cardStyle' && typeof value === 'string' && (CARD_STYLE_OPTIONS as string[]).includes(value)) {
        next.cardStyle = value as MenuCardStyleKey;
        return;
      }
      if (key === 'cardBadge' && typeof value === 'string' && (CARD_BADGE_OPTIONS as string[]).includes(value)) {
        next.cardBadge = value as MenuCardBadgeKey;
        return;
      }
      if (key === 'headerStyle' && typeof value === 'string' && (HEADER_STYLE_OPTIONS as string[]).includes(value)) {
        next.headerStyle = value as MenuHeaderStyleKey;
        return;
      }
      if (key === 'layout' && typeof value === 'string' && (LAYOUT_OPTIONS as string[]).includes(value)) {
        next.layout = value as MenuLayoutKey;
        return;
      }
      if (key === 'skin' && typeof value === 'string' && (MENU_SKINS as readonly string[]).includes(value)) {
        next.skin = value;
        return;
      }
      if (key === 'motifOpacity' && typeof value === 'number' && Number.isFinite(value)) {
        next.motifOpacity = clamp(value, 0.04, 0.3);
        return;
      }
      if ((key === 'textCustom' || key === 'mutedCustom') && typeof value === 'boolean') {
        (next as unknown as Record<string, boolean>)[key] = value;
        return;
      }
      if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) && key in next) {
        (next as unknown as Record<string, string>)[key] = value;
      }
    });
    return next;
  } catch {
    return DEFAULT_CUSTOM_THEME;
  }
}

export const serializeCustomTheme = (custom: MenuThemeCustom): string => JSON.stringify(custom);

/** Clamp AI/owner-supplied decor to safe shapes (emoji-sized strings, capped counts). */
function sanitizeDecor(raw: Partial<MenuThemeDecor>): MenuThemeDecor {
  const glyph = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 8) : '');
  return {
    floaters: Array.isArray(raw.floaters) ? raw.floaters.map(glyph).filter(Boolean).slice(0, 6) : [],
    floaterOpacity: typeof raw.floaterOpacity === 'number' && Number.isFinite(raw.floaterOpacity)
      ? clamp(raw.floaterOpacity, 0.06, 0.6)
      : DEFAULT_DECOR.floaterOpacity,
    cardSticker: glyph(raw.cardSticker),
    bannerAr: typeof raw.bannerAr === 'string' ? raw.bannerAr.slice(0, 80) : '',
    bannerEn: typeof raw.bannerEn === 'string' ? raw.bannerEn.slice(0, 80) : '',
  };
}

/**
 * Resolve a venue's saved theme into what the shell should render.
 * The JSON document wins whenever present (the new model); legacy venues that
 * saved only a preset id keep their CSS-defined skin from menu-themes.css.
 */
export function resolveMenuSkin(theme?: string | null, customJson?: string | null):
  { themeId: string; style?: Record<string, string>; decor?: MenuThemeDecor; attrs?: Record<string, string> } {
  if (customJson && customJson.trim().startsWith('{')) {
    const custom = parseCustomTheme(customJson);
    return { themeId: CUSTOM_THEME, style: customThemeVars(custom), decor: custom.decor, attrs: menuStructuralAttrs(custom) };
  }
  return { themeId: resolveThemeId(theme) };
}

/**
 * The data-* attributes that select the structural-kit CSS recipes for a JSON theme.
 * Spread onto the .cust-bg shell (alongside data-menu-theme="custom"); named themes,
 * which own their full look in CSS, never receive these.
 */
export function menuStructuralAttrs(custom: MenuThemeCustom): Record<string, string> {
  const attrs: Record<string, string> = {
    'data-card-style': custom.cardStyle,
    'data-card-badge': custom.cardBadge,
    'data-header-style': custom.headerStyle,
    'data-menu-layout': custom.layout,
  };
  if (custom.skin && (MENU_SKINS as readonly string[]).includes(custom.skin)) {
    attrs['data-menu-skin'] = custom.skin;
  }
  return attrs;
}

export function customThemeVars(custom: MenuThemeCustom): Record<string, string> {
  const bg = customBackground(custom);
  const paper = customPaper(custom);
  const radius = RADIUS_PRESETS[custom.radius] ?? RADIUS_PRESETS.soft;
  const darkPaper = relLuminance(custom.paper) < 0.4;
  const bg2 = mix(custom.paper, '#ffffff', darkPaper ? 0.1 : 0.7);
  const visualSurface = alphaBlend(custom.surface, custom.paper, 0.72);
  const visualSurface2 = alphaBlend(custom.surface, custom.paper, 0.92);
  const visualGlass = alphaBlend(custom.paper, custom.canvas, 0.78);
  // Hand-picked text/muted are honoured verbatim; auto themes keep the WCAG guard.
  const safeText = custom.textCustom
    ? custom.text
    : readableText(custom.text, 4.5, custom.paper, visualSurface, visualSurface2, visualGlass, bg2);
  const safeMuted = custom.mutedCustom
    ? custom.muted
    : readableText(custom.muted, 3, custom.paper, visualSurface, visualSurface2, visualGlass, bg2);
  const cartInk = readableOn(custom.cartBg);
  const safeAccentText = readableText(custom.accent, 4.5, custom.paper, visualSurface, visualSurface2, visualGlass, bg2);
  const cartBarText = readableText(custom.accent, 4.5, custom.cartBg);
  const vars: Record<string, string> = {
    // native widgets (scrollbars, inputs) should match the skin's brightness
    colorScheme: darkPaper ? 'dark' : 'light',
    '--font-display': FONT_STACKS[custom.font] ?? FONT_STACKS.system,
    '--r-mark': radius.mark,
    '--r-card': radius.card,
    '--r-thumb': radius.thumb,
    '--r-ctl': radius.ctl,
    '--menu-canvas': bg.canvas,
    '--menu-paper-color': custom.paper,
    '--menu-paper-edge': hexAlpha(safeText, 0.13),
    '--menu-paper-img': paper.image,
    '--menu-paper-size': paper.size,
    '--menu-paper-repeat': paper.repeat,
    '--bg': custom.paper,
    '--bg-2': bg2,
    '--surface': hexAlpha(custom.surface, 0.72),
    '--surface-2': hexAlpha(custom.surface, 0.92),
    '--line': hexAlpha(safeText, 0.11),
    '--line-2': hexAlpha(safeText, 0.19),
    '--text': safeText,
    '--muted': safeMuted,
    '--faint': hexAlpha(safeMuted, 0.72),
    '--accent': custom.accent,
    '--accent-2': custom.accent2,
    '--accent-ink': readableOn(custom.accent),
    '--accent-glow': hexAlpha(custom.accent, 0.26),
    // Prices/totals/labels render in accent ON paper & surface. Keep the accent's hue
    // but push its lightness until it clears WCAG AA, so a bright accent (yellow, lime,
    // cyan, light gold) can never wash out to invisible on the menu or basket pages.
    '--accent-text': safeAccentText,
    '--canvas': custom.canvas,
    '--glass': hexAlpha(custom.paper, 0.78),
    '--ring': hexAlpha(safeText, 0.08),
    '--shadow': `0 34px 78px -46px ${hexAlpha(safeText, 0.45)}`,
    '--shadow-sm': `0 14px 30px -18px ${hexAlpha(safeText, 0.25)}`,
    '--cart-bg': custom.cartBg,
    '--cart-ink': cartInk,
    '--cart-line': hexAlpha(cartInk, 0.14),
    '--cart-accent': custom.accent,
    '--cart-accent-2': custom.accent2,
    '--cart-accent-ink': readableOn(custom.accent),
    // Cart-bar total + count sit on the dark/light --cart-bg — guarantee legibility too.
    '--cart-accent-text': cartBarText,
    '--cart-sub': readableText(safeMuted, 3, custom.cartBg),
    '--cart-count-bg': custom.cartBg,
  };
  // pinned card sticker renders via .c-item::after { content: var(--decor-card) }
  if (custom.decor.cardSticker) vars['--decor-card'] = JSON.stringify(custom.decor.cardSticker);
  return vars;
}

function customBackground(custom: MenuThemeCustom): { canvas: string } {
  const glowA = hexAlpha(custom.accent, 0.18);
  const glowB = hexAlpha(custom.accent2, 0.18);
  if (custom.background === 'arches') {
    return { canvas: `${svgUrl(archSvg(custom.accent, custom.accent2))},radial-gradient(820px 520px at 14% 0%, ${glowA}, transparent 60%),linear-gradient(160deg, ${custom.canvas} 0%, ${custom.paper} 54%, ${custom.surface} 100%)` };
  }
  if (custom.background === 'dots') {
    return { canvas: `radial-gradient(circle at 1px 1px, ${hexAlpha(custom.text, 0.13)} 1px, transparent 0),linear-gradient(160deg, ${custom.canvas}, ${custom.paper})` };
  }
  if (custom.background === 'waves') {
    return { canvas: `${svgUrl(waveSvg(custom.accent))},radial-gradient(900px 520px at 90% 0%, ${glowB}, transparent 60%),linear-gradient(160deg, ${custom.canvas}, ${custom.paper})` };
  }
  if (custom.background === 'tiles') {
    return { canvas: `linear-gradient(45deg, ${hexAlpha(custom.accent, 0.10)} 25%, transparent 25%),linear-gradient(-45deg, ${hexAlpha(custom.accent2, 0.10)} 25%, transparent 25%),linear-gradient(160deg, ${custom.canvas}, ${custom.paper})` };
  }
  if (custom.background === 'linen') {
    return { canvas: `repeating-linear-gradient(90deg, ${hexAlpha(custom.text, 0.035)} 0 1px, transparent 1px 5px),repeating-linear-gradient(0deg, ${hexAlpha(custom.text, 0.025)} 0 1px, transparent 1px 6px),linear-gradient(160deg, ${custom.canvas}, ${custom.paper})` };
  }
  return { canvas: `radial-gradient(820px 520px at 14% 0%, ${glowA}, transparent 60%),radial-gradient(820px 560px at 88% 4%, ${glowB}, transparent 58%),linear-gradient(160deg, ${custom.canvas} 0%, ${custom.paper} 52%, ${custom.surface} 100%)` };
}

function customPaper(custom: MenuThemeCustom): { image: string; size: string; repeat: string } {
  const base = `radial-gradient(95% 50% at 90% 0%, ${hexAlpha(custom.accent, 0.14)}, transparent 58%)`;
  if (custom.motif === 'none') {
    return { image: base, size: 'auto,120px 120px', repeat: 'no-repeat,repeat' };
  }
  const motifColor = custom.motifColor || custom.accent;
  const motifOpacity = clamp(custom.motifOpacity, 0.04, 0.3);
  return {
    image: `${base},${svgUrl(motifSvg(custom.motif, motifColor, custom.text, motifOpacity))}`,
    size: 'auto,96px 96px,120px 120px',
    repeat: 'no-repeat,repeat,repeat',
  };
}

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function archSvg(accent: string, accent2: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><g fill="none" stroke="${accent}" stroke-opacity=".16" stroke-width="2"><path d="M30 160V78a60 60 0 0 1 120 0v82"/><path d="M58 160V84a32 32 0 0 1 64 0v76"/></g><circle cx="148" cy="28" r="8" fill="${accent2}" fill-opacity=".16"/></svg>`;
}

function waveSvg(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><path d="M0 72c40-36 80-36 120 0s80 36 120 0" fill="none" stroke="${accent}" stroke-opacity=".14" stroke-width="3"/><path d="M0 96c40-28 80-28 120 0s80 28 120 0" fill="none" stroke="${accent}" stroke-opacity=".09" stroke-width="2"/></svg>`;
}

function motifSvg(motif: MenuThemeCustom['motif'], accent: string, text: string, opacity: number): string {
  const detailOpacity = Math.max(0.04, opacity * 0.72).toFixed(3);
  const fillOpacity = opacity.toFixed(3);
  if (motif === 'cup') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="${accent}" stroke-opacity="${fillOpacity}" stroke-width="3" stroke-linecap="round"><path d="M26 44h34v10a17 17 0 0 1-17 17 17 17 0 0 1-17-17z"/><path d="M60 48h8a8 8 0 0 1 0 16h-7"/><path d="M34 30c-5-6 5-8 0-14M48 30c-5-6 5-8 0-14"/></g></svg>`;
  }
  if (motif === 'palm') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="${accent}" stroke-opacity="${fillOpacity}" stroke-width="3" stroke-linecap="round"><path d="M48 80V38"/><path d="M48 40c-16-18-30-7-36 4 14-2 24 1 36-4zM48 40c16-18 30-7 36 4-14-2-24 1-36-4zM48 42c-12-8-19 3-21 13 9-7 15-9 21-13zM48 42c12-8 19 3 21 13-9-7-15-9-21-13z"/></g></svg>`;
  }
  if (motif === 'star') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M48 17l8 23 23 8-23 8-8 23-8-23-23-8 23-8z" fill="${accent}" fill-opacity="${fillOpacity}"/><circle cx="18" cy="20" r="3" fill="${text}" fill-opacity="${detailOpacity}"/><circle cx="78" cy="76" r="3" fill="${text}" fill-opacity="${detailOpacity}"/></svg>`;
  }
  if (motif === 'crescent') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M62 20a30 30 0 1 0 0 56 24 24 0 1 1 0-56z" fill="${accent}" fill-opacity="${fillOpacity}"/><path d="M70 28l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="${text}" fill-opacity="${detailOpacity}"/></svg>`;
  }
  if (motif === 'leaf') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M48 16c15 11 15 43 0 64-15-21-15-53 0-64z" fill="${accent}" fill-opacity="${fillOpacity}"/><path d="M48 24v48M48 42c6-5 12-7 18-7M48 54c-6-5-12-7-18-7" stroke="${text}" stroke-opacity="${detailOpacity}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  }
  if (motif === 'drop') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><path d="M48 20c13 16 19 27 19 38a19 19 0 0 1-38 0c0-11 6-22 19-38z" fill="${accent}" fill-opacity="${fillOpacity}"/><path d="M39 58a9 9 0 0 0 9 9" stroke="${text}" stroke-opacity="${detailOpacity}" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  }
  if (motif === 'geo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="${accent}" stroke-opacity="${fillOpacity}" stroke-width="3"><rect x="30" y="30" width="36" height="36"/><rect x="30" y="30" width="36" height="36" transform="rotate(45 48 48)"/></g><circle cx="48" cy="48" r="5" fill="${text}" fill-opacity="${detailOpacity}"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="${accent}" fill-opacity="${fillOpacity}"><ellipse cx="36" cy="48" rx="11" ry="18" transform="rotate(25 36 48)"/><ellipse cx="60" cy="48" rx="11" ry="18" transform="rotate(-25 60 48)"/></g><path d="M35 36c3 8 3 16 0 24M61 36c-3 8-3 16 0 24" stroke="${text}" stroke-opacity="${detailOpacity}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

export function hexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(a: string, b: string, weight: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  const r = Math.round(ca.r * (1 - weight) + cb.r * weight);
  const g = Math.round(ca.g * (1 - weight) + cb.g * weight);
  const bl = Math.round(ca.b * (1 - weight) + cb.b * weight);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function alphaBlend(fg: string, bg: string, alpha: number): string {
  const f = toRgb(fg);
  const b = toRgb(bg);
  const r = Math.round(f.r * alpha + b.r * (1 - alpha));
  const g = Math.round(f.g * alpha + b.g * (1 - alpha));
  const bl = Math.round(f.b * alpha + b.b * (1 - alpha));
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

/**
 * The two colours an owner actually picks. Everything else about a look is decided by the
 * chosen theme, and both of these stay inside the contrast guard — which is why the old
 * `text` picker is gone: it was the one control in the product that could ship an
 * unreadable menu, because hand-picking text set `textCustom` and switched the guard off.
 */
export type BasicColorKey = 'background' | 'accent';

export function basicColorOf(custom: MenuThemeCustom, key: BasicColorKey): string {
  return key === 'background' ? custom.paper : custom.accent;
}

export function applyBasicColor(custom: MenuThemeCustom, key: BasicColorKey, value: string): MenuThemeCustom {
  if (key === 'background') {
    // Cards still have to separate from the page they sit on, so the card surface is the
    // background lifted (deepened on a dark pick) rather than a second thing to choose.
    // The hand-pick flags come off with it: a document that opted out of the guard must not
    // carry a dark theme's ink onto a light page the owner just chose.
    const dark = relLuminance(value) < 0.4;
    return {
      ...custom, canvas: value, paper: value,
      surface: mix(value, dark ? '#ffffff' : '#000000', 0.07),
      textCustom: false, mutedCustom: false,
    };
  }
  // A companion tone for gradients and arches, same hue, lighter. cartBg is deliberately
  // left alone: the cart bar carries an accent-coloured button, and painting both the same
  // colour would erase it.
  return { ...custom, accent: value, accent2: mix(value, '#ffffff', 0.28), motifColor: value };
}

export function readableOn(hex: string): string {
  return contrastRatio('#171109', hex) >= contrastRatio('#FFF9EF', hex) ? '#171109' : '#FFF9EF';
}

/** A motif tile as a CSS url() — the loyalty card studio reuses the menu-theme motif library. */
export function motifDataUrl(motif: MenuThemeCustom['motif'], color: string, opacity: number): string {
  if (motif === 'none') return 'none';
  return svgUrl(motifSvg(motif, color, color, clamp(opacity, 0.04, 0.3)));
}

// Keep a colour's hue but push its lightness until it clears `min` WCAG contrast
// against every background it sits on. Used so accent-derived TEXT (prices, totals)
// stays readable no matter how light or saturated the randomized/edited accent is.
function readableText(fg: string, min: number, ...bgs: string[]): string {
  const ok = (c: string) => bgs.every((bg) => contrastRatio(c, bg) >= min);
  if (ok(fg)) return fg;
  const { h, s } = hexToHsl(fg);
  const avgLum = bgs.reduce((sum, bg) => sum + relLuminance(bg), 0) / Math.max(1, bgs.length);
  const lighten = avgLum < 0.4; // dark surface → lighter text, light surface → darker text
  for (let i = 0; i <= 100; i += 3) {
    const cand = hslToHex(h, s, lighten ? i : 100 - i);
    if (ok(cand)) return cand;
  }
  return lighten ? '#FFFFFF' : '#0B0B0B';
}

function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function relLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r: r255, g: g255, b: b255 } = toRgb(hex);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100, lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `#${toHex(Math.round((r + m) * 255))}${toHex(Math.round((g + m) * 255))}${toHex(Math.round((b + m) * 255))}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}
