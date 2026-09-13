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

export function getThemeStorage(browserWindow) {
  try {
    return browserWindow?.localStorage
  } catch {
    return undefined
  }
}

export function readThemePreference(storage) {
  try {
    return normalizeThemePreference(storage?.getItem('theme'))
  } catch {
    return 'system'
  }
}

export function persistThemePreference(storage, preference) {
  const normalizedPreference = normalizeThemePreference(preference)

  try {
    storage?.setItem('theme', normalizedPreference)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return normalizedPreference
}
