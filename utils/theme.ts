// utils/theme.ts
// -----------------------------------------------------------------------------
// The site's four looks, in one place.
//
// Eight components each kept their own copy of "put the right class on <html>",
// which is why a new look used to mean editing eight files and missing one.
// They all call applyTheme now.
//
//   light    the default — no class, no attribute
//   reading  warm cream;  data-theme="reading"
//   dark     the blue-grey night;  class="dark"
//   amber    black and orange;  class="dark" AND data-theme="amber"
//
// `amber` keeps the `dark` class ON PURPOSE. It is not a separate night from
// scratch: it is the dark theme with the blue out of the grey and the accent
// turned up, so every `dark:` class already written across the app keeps
// working and the stylesheet only has to say what differs. Dropping the class
// would leave several hundred components unstyled.
// -----------------------------------------------------------------------------

export type AppTheme = 'light' | 'reading' | 'dark' | 'amber';

/** The order the toggle walks through, lightest first. */
export const THEME_ORDER: AppTheme[] = ['light', 'reading', 'dark', 'amber'];

export const THEME_LABEL: Record<AppTheme, string> = {
  light:   'Light',
  reading: 'Reading',
  dark:    'Dark',
  amber:   'Amber',
};

const STORE_KEY = 'theme';

export const isTheme = (v: unknown): v is AppTheme =>
  typeof v === 'string' && (THEME_ORDER as string[]).includes(v);

/** Put the theme on <html>. The one place that knows the class names. */
export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement;
  root.classList.remove('dark');
  root.removeAttribute('data-theme');

  if (theme === 'dark' || theme === 'amber') root.classList.add('dark');
  if (theme === 'reading') root.setAttribute('data-theme', 'reading');
  if (theme === 'amber') root.setAttribute('data-theme', 'amber');

  try { localStorage.setItem(STORE_KEY, theme); } catch { /* private mode */ }
}

/** What was chosen last time, else what the system asks for. */
export function readTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (isTheme(saved)) return saved;
  } catch { /* private mode */ }
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch { /* no matchMedia */ }
  return 'light';
}

/** Both dark and amber are nights. Anything choosing a light-or-dark asset —
 *  the white logo, a dark-mode palette — asks this, not `=== 'dark'`. */
export const isDarkTheme = (t: AppTheme): boolean => t === 'dark' || t === 'amber';

export function nextTheme(current: AppTheme): AppTheme {
  const i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}
