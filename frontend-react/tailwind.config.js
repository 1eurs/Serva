/** @type {import('tailwindcss').Config} */
// Tailwind is used ONLY by the marketing site (features/site). The rest of
// the app is hand-written plain CSS with its own theme tokens (src/styles/theme.css).
// To keep the two worlds from colliding:
//   • preflight is OFF  -> Tailwind never resets the existing app's base styles.
//   • important:'#neo'  -> every utility is generated as a descendant of #neo, so
//                          utilities only take effect inside the site's root and
//                          can never leak onto the customer / dashboard / admin pages.
export default {
  content: ['./src/features/site/**/*.{ts,tsx}'],
  important: '#neo',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // The same palette as the dashboard's pro skin (theme.css): calm neutral
        // chrome and one saturated brand green. emerald-700 is the fill, because the
        // brand emerald-500 only reaches 2.5:1 under white text.
        sv: {
          ink: '#0C1411',     // text, the dark bands
          slate: '#55605B',   // secondary text (6.3:1 on white)
          line: '#E3E7E5',    // hairlines and card edges
          mist: '#F4F6F5',    // alternate band, panel fill
          paper: '#FFFEFA',   // thermal ticket
          green: '#047857',   // primary fill, green text on white
          deep: '#065F46',    // hover on the primary fill
          mint: '#10B981',    // brand emerald — accents on dark only
          tint: '#E7F4EE',    // green wash behind small marks
          forest: '#0B3D2E',  // the brand green as a surface (hero band, /v2)
          'forest-deep': '#082C21',
          leaf: '#6EE7B7',    // accent that reads on forest
        },
      },
      fontFamily: {
        // Sora is the brand face (favicon, --font-brand). Neither Latin face carries
        // Arabic, so every stack falls through to Plex Sans Arabic for it.
        display: ["'Sora'", "'IBM Plex Sans Arabic'", 'system-ui', 'sans-serif'],
        sans: ["'IBM Plex Sans'", "'IBM Plex Sans Arabic'", 'system-ui', 'sans-serif'],
        mono: ["'IBM Plex Mono'", 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(12,20,17,.04), 0 8px 24px -12px rgba(12,20,17,.10)',
        lift: '0 2px 4px rgba(12,20,17,.04), 0 24px 48px -20px rgba(12,20,17,.22)',
        ticket: '0 1px 1px rgba(12,20,17,.06), 0 18px 36px -18px rgba(12,20,17,.35)',
      },
    },
  },
  plugins: [],
};
