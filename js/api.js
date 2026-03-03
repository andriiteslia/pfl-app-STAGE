/* ============================================
   PFL App — API Module
   Fetch with caching, error handling
   ============================================ */

import CONFIG from './config.js';

// ---- Cache Version Management ----
let cacheVersion = 0;

function getCacheVersion() {
  try {
    const v = parseInt(localStorage.getItem(CONFIG.CACHE_VERSION_KEY) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  } catch (e) {
    return 0;
  }
}

function bumpCacheVersion() {
  cacheVersion = (cacheVersion || 0) + 1;
  try {
    localStorage.setItem(CONFIG.CACHE_VERSION_KEY, String(cacheVersion));
  } catch (e) {
    // localStorage might be full or unavailable
  }
  return cacheVersion;
}

// Initialize cache version
cacheVersion = getCacheVersion();

// ---- Cache Helpers ----
function makeCacheKey(url) {
  return `${url}::v=${cacheVersion}`;
}

function getFromCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || !obj.t || !obj.v) {
      return null;
    }

    // Check if expired
    if (Date.now() - obj.t > CONFIG.CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return obj.v;
  } catch (e) {
    return null;
  }
}

function setToCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({
      t: Date.now(),
      v: value,
    }));
  } catch (e) {
    // localStorage might be full
    console.warn('[Cache] Failed to save:', e.message);
  }
}

// ---- Main Fetch Function ----
export async function fetchWithCache(url, { force = false, timeout = 15000 } = {}) {
  const cacheKey = makeCacheKey(url);

  // Try cache first (unless forced refresh)
  if (!force) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log('[API] Cache hit:', url.substring(0, 50) + '...');
      return cached;
    }
  }

  // Fetch from network with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log('[API] Fetching:', url.substring(0, 50) + '...');
    
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();

    // Cache successful responses
    if (json && json.ok === true) {
      setToCache(cacheKey, json);
    }

    return json;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Час очікування вичерпано');
    }

    throw error;
  }
}

// ---- Specialized Fetch Functions ----
export async function fetchSheetData(params, options = {}) {
  const url = new URL(CONFIG.API_URL);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  return fetchWithCache(url.toString(), options);
}

export async function fetchLeaderboard(options = {}) {
  return fetchSheetData({
    sheetId: CONFIG.LEADERBOARD.SHEET_ID,
    sheetName: CONFIG.LEADERBOARD.RESULTS_SHEET,
    range: CONFIG.LEADERBOARD.RESULTS_RANGE,
  }, options);
}

export async function fetchLeaderboardConfig(options = {}) {
  return fetchSheetData({
    sheetId: CONFIG.LEADERBOARD.SHEET_ID,
    sheetName: CONFIG.LEADERBOARD.CONFIG_SHEET,
    range: CONFIG.LEADERBOARD.CONFIG_RANGE,
  }, options);
}

export async function fetchArenaConfig(options = {}) {
  return fetchSheetData({
    sheetId: CONFIG.ARENA.CONFIG_SHEET_ID,
    sheetName: CONFIG.ARENA.CONFIG_SHEET_NAME,
    range: CONFIG.ARENA.CONFIG_RANGE,
  }, options);
}

export async function fetchAppStyles(options = {}) {
  return fetchSheetData({
    sheetId: CONFIG.STYLES.SHEET_ID,
    sheetName: CONFIG.STYLES.SHEET_NAME,
    range: CONFIG.STYLES.RANGE,
  }, options);
}

// ---- Cache Management ----
export function clearCache() {
  bumpCacheVersion();
  console.log('[Cache] Version bumped to:', cacheVersion);
}

export function hasCachedData(url) {
  const cacheKey = makeCacheKey(url);
  return getFromCache(cacheKey) !== null;
}

// ---- Debug ----
export function getCacheStats() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.includes('::v='));
    return {
      version: cacheVersion,
      entries: keys.length,
    };
  } catch (e) {
    return { version: cacheVersion, entries: 0 };
  }
}
