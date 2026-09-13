const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
if (!configuredApiUrl) {
  throw new Error(
    'VITE_API_URL is required. Copy the CDK ApiUrl output into .env.local or the Vercel project environment.'
  )
}
const API_BASE_URL = configuredApiUrl.replace(/\/+$/, '')

export const apiConfig = {
  endpoints: {
    weekly: `${API_BASE_URL}/weekly`,
    overall: `${API_BASE_URL}/overall`,
    leagueContext: `${API_BASE_URL}/league-context`,
    players: `${API_BASE_URL}/players`
  }
}

const CACHE_DURATION = 15 * 60 * 1000
const getCacheKey = (url) => `api_cache_${btoa(url)}`

const getCachedData = (url, allowStale = false) => {
  try {
    const cached = localStorage.getItem(getCacheKey(url))
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    return allowStale || Date.now() - timestamp < CACHE_DURATION ? data : null
  } catch (error) {
    console.warn('Cache read error:', error)
    return null
  }
}

const setCachedData = (url, data) => {
  try {
    localStorage.setItem(getCacheKey(url), JSON.stringify({ data, timestamp: Date.now() }))
  } catch (error) {
    console.warn('Cache write error:', error)
  }
}

export const apiCall = async (url, options = {}) => {
  const timeout = options.timeout || 10000
  const maxRetries = options.maxRetries ?? 2
  const retryDelay = options.retryDelay || 1000
  const useCache = options.useCache !== false

  if (useCache) {
    const cached = getCachedData(url)
    if (cached) return cached
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        signal: controller.signal
      })
      if (!response.ok) {
        const error = new Error(`API call failed: ${response.status} ${response.statusText}`)
        error.status = response.status
        throw error
      }
      const data = await response.json()
      if (useCache) setCachedData(url, data)
      return data
    } catch (error) {
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt) {
        const cached = useCache ? getCachedData(url, true) : null
        if (cached) return cached
        throw new Error(`API call failed after ${maxRetries + 1} attempts: ${error.message}`)
      }
      if (error.name !== 'AbortError' && error.status) throw error
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
