export const THEME_PREFERENCES = ['system', 'light', 'dark']

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system'
}

export function resolveDarkMode(preference, systemPrefersDark) {
  const normalizedPreference = normalizeThemePreference(preference)

  if (normalizedPreference === 'system') {
    return Boolean(systemPrefersDark)
  }

  return normalizedPreference === 'dark'
}
