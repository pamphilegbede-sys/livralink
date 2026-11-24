export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'livralink_theme_mode';
export const LEGACY_DARK_STORAGE_KEY = 'livralink_dark_mode';
export const SYSTEM_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

type MatchMediaLike = (query: string) => {
  matches: boolean;
  addEventListener?: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener?: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void;
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

/**
 * Détecte la préférence de thème actuelle du système d'exploitation ('dark' ou 'light').
 */
export function getSystemThemePreference(matchMediaOverride?: MatchMediaLike | null): ResolvedTheme {
  try {
    const mm =
      matchMediaOverride ??
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia.bind(window)
        : null);
    if (!mm) return 'light';
    return mm(SYSTEM_COLOR_SCHEME_QUERY)?.matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Lit la préférence enregistrée de l'utilisateur ('light' | 'dark' | 'system').
 * Par défaut, retourne 'system' afin d'activer la détection automatique du thème OS.
 */
export function readSavedThemeMode(storage?: Pick<Storage, 'getItem'> | null): ThemeMode {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return 'system';
    const savedMode = store.getItem(THEME_STORAGE_KEY);
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
      return savedMode;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

/**
 * Résout le thème effectif ('dark' ou 'light') à partir du mode sélectionné et du thème système.
 */
export function resolveTheme(mode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemTheme === 'dark' ? 'dark' : 'light';
}

/**
 * S'abonne en temps réel aux changements de préférence de thème du système d'exploitation.
 */
export function subscribeToSystemThemeChange(
  onChange: (nextSystemTheme: ResolvedTheme) => void,
  matchMediaOverride?: MatchMediaLike | null
): () => void {
  try {
    const mm =
      matchMediaOverride ??
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia.bind(window)
        : null);
    if (!mm) return () => {};

    const mediaQuery = mm(SYSTEM_COLOR_SCHEME_QUERY);
    if (!mediaQuery) return () => {};

    const listener = (event: MediaQueryListEvent | MediaQueryList) => {
      onChange(event.matches ? 'dark' : 'light');
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener as (e: MediaQueryListEvent) => void);
      return () => {
        mediaQuery.removeEventListener?.('change', listener as (e: MediaQueryListEvent) => void);
      };
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(listener as (e: MediaQueryListEvent) => void);
      return () => {
        mediaQuery.removeListener?.(listener as (e: MediaQueryListEvent) => void);
      };
    }

    return () => {};
  } catch {
    return () => {};
  }
}

/**
 * Applique le thème résolu au DOM (classe `.dark`, `colorScheme`, `data-theme` et balise `theme-color`).
 */
export function applyThemeToDocument(resolvedTheme: ResolvedTheme, doc?: Document | null): void {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return;

  const isDark = resolvedTheme === 'dark';
  const root = targetDoc.documentElement;
  if (root) {
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = resolvedTheme;
    root.dataset.theme = resolvedTheme;
  }

  if (targetDoc.body) {
    targetDoc.body.classList.toggle('dark', isDark);
  }

  const themeColorMeta = targetDoc.querySelector?.('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', isDark ? '#090d16' : '#1d4ed8');
  }
}
