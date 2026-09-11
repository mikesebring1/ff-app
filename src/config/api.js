// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://k9j2jjtd5a.execute-api.us-west-2.amazonaws.com/prod';

export const apiConfig = {
  endpoints: {
    weekly: `${API_BASE_URL}/weekly`,
    overall: `${API_BASE_URL}/overall`, 
    pollingStatus: `${API_BASE_URL}/polling/status`,
    pollingToggle: `${API_BASE_URL}/polling/toggle`,
    calculatePlayoffs: `${API_BASE_URL}/calculate-playoffs`,
    syncHistorical: `${API_BASE_URL}/sync-historical`,
    fetchPlayers: `${API_BASE_URL}/players`,
    adminValidate: `${API_BASE_URL}/admin/validate`
  }
};

// Smart caching utility - adjusts based on polling status
const getCacheKey = (url) => `api_cache_${btoa(url)}`;
const POLLING_CACHE_DURATION = 9 * 1000; // 9 seconds when polling is active
const IDLE_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes when polling is inactive

// Polling status cache configuration
const POLLING_STATUS_CACHE_KEY = 'ff_polling_status_cache';
const POLLING_STATUS_CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour

// In-flight request tracking for barrier synchronization
let pollingStatusPromise = null;

// Check if polling is currently active (with fallback for reliability)
export const isPollingActive = async () => {
  // If there's already a request in flight, return that promise
  if (pollingStatusPromise) {
    return pollingStatusPromise;
  }
  // Create a new promise for this request
  pollingStatusPromise = (async () => {
    const now = Date.now();
    
    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(POLLING_STATUS_CACHE_KEY);
      if (cached) {
        const { value, timestamp } = JSON.parse(cached);
        if ((now - timestamp) < POLLING_STATUS_CACHE_DURATION) {
          return value;
        }
      }
    } catch (error) {
      console.warn('Error reading polling status cache:', error);
    }

    try {
      // Try to get polling status from API
      const response = await fetch(apiConfig.endpoints.pollingStatus, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const isActive = data.enabled === true;
        
        // Cache the result in localStorage
        localStorage.setItem(POLLING_STATUS_CACHE_KEY, JSON.stringify({
          value: isActive,
          timestamp: now
        }));
        
        return isActive;
      }
    } catch {
      console.log('Could not fetch polling status, using fallback');
    }
    
    // Fallback: assume polling is active during typical game hours
    // This prevents cache issues if polling status API is unreliable
    const nowDate = new Date();
    const hour = nowDate.getHours();
    const day = nowDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Assume polling is active during NFL game times:
    // Sunday: 10 AM - 11 PM (games typically run 1 PM - 8 PM ET, but data updates before/after)
    // Monday/Thursday: 6 PM - 11 PM (primetime games)
    // Saturday: 4 PM - 11 PM (playoff games)
    let fallbackValue = false;
    if (day === 0) { // Sunday
      fallbackValue = hour >= 10 && hour <= 23;
    } else if (day === 1 || day === 4) { // Monday/Thursday
      fallbackValue = hour >= 18 && hour <= 23;
    } else if (day === 6) { // Saturday (playoffs)
      fallbackValue = hour >= 16 && hour <= 23;
    }
    
    // Cache the fallback value in localStorage too
    try {
      localStorage.setItem(POLLING_STATUS_CACHE_KEY, JSON.stringify({
        value: fallbackValue,
        timestamp: now
      }));
    } catch (error) {
      console.warn('Error saving polling status cache:', error);
    }
    
    return fallbackValue;
  })()
    .finally(() => {
      // Clear the promise after completion to allow future requests
      pollingStatusPromise = null;
    });
  
  return pollingStatusPromise;
};

// Function to clear polling status cache (useful when manually toggling)
export const clearPollingStatusCache = () => {
  // Clear any in-flight promise
  pollingStatusPromise = null;
  
  try {
    localStorage.removeItem(POLLING_STATUS_CACHE_KEY);
  } catch (error) {
    console.warn('Error clearing polling status cache:', error);
  }
};

const getCachedData = async (url) => {
  try {
    const cacheKey = getCacheKey(url);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp, cacheDuration } = JSON.parse(cached);
      const currentCacheDuration = cacheDuration || IDLE_CACHE_DURATION;
      
      if (Date.now() - timestamp < currentCacheDuration) {
        console.log('Using cached data for:', url);
        return data;
      }
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  return null;
};

const setCachedData = (url, data, cacheDuration) => {
  try {
    const cacheKey = getCacheKey(url);
    const cacheData = {
      data,
      timestamp: Date.now(),
      cacheDuration
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`Cached data for: ${url} (duration: ${cacheDuration}ms)`);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
};

// API helper functions with smart caching based on polling status
export const apiCall = async (url, options = {}) => {
  const timeout = options.timeout || 10000; // 10 second default timeout
  const maxRetries = options.maxRetries || 2;
  const retryDelay = options.retryDelay || 1000;
  const useCache = options.useCache !== false; // Default to true for PWA

  // Determine cache duration based on polling status
  const pollingActive = await isPollingActive();
  const cacheDuration = pollingActive ? POLLING_CACHE_DURATION : IDLE_CACHE_DURATION;
  
  console.log(`Polling active: ${pollingActive}, using ${cacheDuration}ms cache for: ${url}`);

  // Check cache first for PWA optimization
  if (useCache && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
    const cachedData = await getCachedData(url);
    if (cachedData) {
      return cachedData;
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal,
        ...options
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache successful responses with smart duration
      if (useCache && response.ok && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
        setCachedData(url, data, cacheDuration);
      }

      return data;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = !error.status;

      console.warn(`API call attempt ${attempt + 1} failed:`, error.message);

      if (isLastAttempt) {
        // For PWA: try to return cached data as fallback on final failure
        if (useCache && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
          const cachedData = await getCachedData(url);
          if (cachedData) {
            console.log('Using stale cached data as fallback for:', url);
            return cachedData;
          }
        }
        throw new Error(`API call failed after ${maxRetries + 1} attempts: ${error.message}`);
      }

      // Only retry on network errors or timeouts, not on HTTP errors
      if (isTimeout || isNetworkError) {
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Don't retry HTTP errors
      }
    }
  }
};

export const adminApiCall = async (url, options = {}) => {
  const adminApiKey = localStorage.getItem('adminApiKey');
  
  return apiCall(url, {
    ...options,
    headers: {
      'X-Admin-Key': adminApiKey,
      ...options.headers
    }
  });
};
