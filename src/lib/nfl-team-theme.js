export const DEFAULT_NFL_TEAM = 'league'

const FAVORITE_NFL_TEAM_STORAGE_KEY = 'favoriteNflTeam'
const TEAM_CSS_VARIABLES = [
  '--team-primary',
  '--team-primary-foreground',
  '--team-secondary',
  '--team-secondary-foreground',
  '--team-tint',
  '--team-tint-foreground',
]

const NFL_TEAM_THEMES = {
  buccaneers: {
    label: 'Buccaneers',
    logoSrc: '/nfl-logos/tb.png',
    light: {
      '--team-primary': '#d50a0a',
      '--team-primary-foreground': '#ffffff',
      '--team-secondary': '#34302b',
      '--team-secondary-foreground': '#ffffff',
      '--team-tint': '#fbe8e8',
      '--team-tint-foreground': '#6f0808',
    },
    dark: {
      '--team-primary': '#d50a0a',
      '--team-primary-foreground': '#ffffff',
      '--team-secondary': '#b5aca5',
      '--team-secondary-foreground': '#211d1b',
      '--team-tint': '#351515',
      '--team-tint-foreground': '#ffb4ad',
    },
  },
  vikings: {
    label: 'Vikings',
    logoSrc: '/nfl-logos/min.png',
    light: {
      '--team-primary': '#4f2683',
      '--team-primary-foreground': '#ffffff',
      '--team-secondary': '#956400',
      '--team-secondary-foreground': '#ffffff',
      '--team-tint': '#eee8f6',
      '--team-tint-foreground': '#3f1e69',
    },
    dark: {
      '--team-primary': '#ffc62f',
      '--team-primary-foreground': '#28163d',
      '--team-secondary': '#9b72cf',
      '--team-secondary-foreground': '#1c1028',
      '--team-tint': '#2e203f',
      '--team-tint-foreground': '#f1e2ff',
    },
  },
  bears: {
    label: 'Bears',
    logoSrc: '/nfl-logos/chi.png',
    light: {
      '--team-primary': '#0b162a',
      '--team-primary-foreground': '#ffffff',
      '--team-secondary': '#c83803',
      '--team-secondary-foreground': '#ffffff',
      '--team-tint': '#f7e9e2',
      '--team-tint-foreground': '#652604',
    },
    dark: {
      '--team-primary': '#f05a24',
      '--team-primary-foreground': '#101a2c',
      '--team-secondary': '#f4f4f4',
      '--team-secondary-foreground': '#0b162a',
      '--team-tint': '#321c15',
      '--team-tint-foreground': '#ffd9c8',
    },
  },
  packers: {
    label: 'Packers',
    logoSrc: '/nfl-logos/gb.png',
    light: {
      '--team-primary': '#203731',
      '--team-primary-foreground': '#ffffff',
      '--team-secondary': '#866000',
      '--team-secondary-foreground': '#ffffff',
      '--team-tint': '#fff3d2',
      '--team-tint-foreground': '#49370a',
    },
    dark: {
      '--team-primary': '#ffb612',
      '--team-primary-foreground': '#132a24',
      '--team-secondary': '#79a38f',
      '--team-secondary-foreground': '#10251f',
      '--team-tint': '#24312d',
      '--team-tint-foreground': '#fff0bd',
    },
  },
}

export const NFL_TEAM_OPTIONS = Object.entries(NFL_TEAM_THEMES).map(([value, team]) => ({
  value,
  label: team.label,
  logoSrc: team.logoSrc,
}))

export function normalizeFavoriteNflTeam(value) {
  return Object.hasOwn(NFL_TEAM_THEMES, value) ? value : DEFAULT_NFL_TEAM
}

export function readFavoriteNflTeam(storage) {
  try {
    return normalizeFavoriteNflTeam(storage?.getItem(FAVORITE_NFL_TEAM_STORAGE_KEY))
  } catch {
    return DEFAULT_NFL_TEAM
  }
}

export function persistFavoriteNflTeam(storage, favoriteTeam) {
  const normalizedTeam = normalizeFavoriteNflTeam(favoriteTeam)

  try {
    storage?.setItem(FAVORITE_NFL_TEAM_STORAGE_KEY, normalizedTeam)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return normalizedTeam
}

export function resolveNflTeamTheme(favoriteTeam, isDarkMode) {
  const normalizedTeam = normalizeFavoriteNflTeam(favoriteTeam)
  const team = NFL_TEAM_THEMES[normalizedTeam]

  return team?.[isDarkMode ? 'dark' : 'light'] ?? null
}

export function applyNflTeamTheme(root, favoriteTeam, isDarkMode) {
  const normalizedTeam = normalizeFavoriteNflTeam(favoriteTeam)
  const theme = resolveNflTeamTheme(normalizedTeam, isDarkMode)

  TEAM_CSS_VARIABLES.forEach((property) => {
    if (theme) {
      root?.style?.setProperty(property, theme[property])
    } else {
      root?.style?.removeProperty(property)
    }
  })

  if (root?.dataset) {
    if (normalizedTeam === DEFAULT_NFL_TEAM) {
      delete root.dataset.favoriteNflTeam
    } else {
      root.dataset.favoriteNflTeam = normalizedTeam
    }
  }

  return normalizedTeam
}
