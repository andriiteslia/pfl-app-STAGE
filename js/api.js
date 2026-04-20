/* ============================================
   PFL App — API Module
   Supabase backend, local cache with SWR
   ============================================ */

import CONFIG from './config.js';

// ---- Supabase Config ----
const SUPABASE_URL = 'https://wehepxiajsdtsaslexqm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlaGVweGlhanNkdHNhc2xleHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTg0NjcsImV4cCI6MjA5MDM5NDQ2N30.4n-AfS-tg_XQ3_kxVJpEhecqQ3qS7NXWttI3X_war8I';

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
  } catch (e) {}
  return cacheVersion;
}

cacheVersion = getCacheVersion();

// ---- Cache Helpers ----
function makeCacheKey(id) {
  return `pfl_cache::${id}`;
}

function getFromCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || !obj.t || !obj.v) return null;

    const age = Date.now() - obj.t;
    const sameVersion = (obj.cv || 0) === cacheVersion;
    const withinTTL = age <= CONFIG.CACHE_TTL_MS;

    return {
      data: obj.v,
      fresh: sameVersion && withinTTL,
      age,
    };
  } catch (e) {
    return null;
  }
}

function setToCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({
      t: Date.now(),
      cv: cacheVersion,
      v: value,
    }));
  } catch (e) {
    console.warn('[Cache] Failed to save:', e.message);
  }
}

// ---- Fetch from Supabase ----
async function fetchFromSupabase(cacheId, timeout = 12000) {
  const url = `${SUPABASE_URL}/rest/v1/sheet_cache?id=eq.${encodeURIComponent(cacheId)}&select=values,updated_at`;

  console.log('[API] URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rows = await response.json();

    console.log('[API] Response:', Array.isArray(rows), 'len:', rows?.length, 'hasValues:', !!rows?.[0]?.values);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn('[API] Empty response for:', cacheId);
      return null;
    }

    // Transform to match expected format: { ok: true, values: [...] }
    return {
      ok: true,
      values: rows[0].values,
      updated_at: rows[0].updated_at,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Час очікування вичерпано');
    throw error;
  }
}

// ---- Background Fetch with Live Update ----
// Fetches from Supabase in background. If data is newer than cache (by updated_at),
// saves to cache and dispatches 'pflCacheUpdated' event so UI can re-render.
function startBackgroundFetch(cacheId, cacheKey, versionSnapshot, timeout) {
  fetchFromSupabase(cacheId, timeout).then(json => {
    if (!json?.ok) return;

    // If clearCache() was called while fetch was in-flight — discard result
    if (cacheVersion !== versionSnapshot) {
      console.log('[API] Background fetch discarded — cache version changed');
      return;
    }

    const existingUpdatedAt = getFromCache(cacheKey)?.data?.updated_at;
    const isNewer = !existingUpdatedAt || json.updated_at > existingUpdatedAt;

    setToCache(cacheKey, json);

    if (isNewer) {
      console.log('[API] Background fetch: newer data found, dispatching update event');
      document.dispatchEvent(new CustomEvent('pflCacheUpdated', {
        detail: { cacheId }
      }));
    } else {
      console.log('[API] Background fetch: data unchanged');
    }
  }).catch(() => {});
}

// ---- Main Fetch: Cache-First with Live Background Update ----
async function fetchWithSWR(cacheId, { force = false, liveUpdate = false, timeout = 12000 } = {}) {
  const cacheKey = makeCacheKey(cacheId);
  const cached = getFromCache(cacheKey);

  // 1. Fresh cache → return immediately; optionally background-fetch for live updates
  if (!force && cached?.fresh) {
    console.log('[API] Cache hit (fresh):', cacheId.substring(0, 40) + '...');
    if (liveUpdate) {
      startBackgroundFetch(cacheId, cacheKey, cacheVersion, timeout);
    }
    return cached.data;
  }

  // 2. Stale cache → return stale, revalidate in background
  if (!force && cached?.data) {
    console.log('[API] Cache hit (stale), revalidating:', cacheId.substring(0, 40) + '...');
    startBackgroundFetch(cacheId, cacheKey, cacheVersion, timeout);
    return cached.data;
  }

  // 3. Force or no cache → fetch from Supabase
  try {
    console.log('[API] Fetching from Supabase:', cacheId.substring(0, 40) + '...');
    const json = await fetchFromSupabase(cacheId, timeout);

    if (json?.ok) {
      setToCache(cacheKey, json);
    }

    return json;
  } catch (error) {
    // 4. Network failed → fall back to stale cache
    if (cached?.data) {
      console.warn('[API] Network error, serving stale cache:', error.message);
      return cached.data;
    }

    throw error;
  }
}

// ---- Build cache ID (exported for use in module listeners) ----
export function buildCacheId(params) {
  return `${params.sheetId}__${params.sheetName}__${params.range}`;
}

// ---- Specialized Fetch Functions ----
export async function fetchSheetData(params, options = {}) {
  const cacheId = buildCacheId(params);
  return fetchWithSWR(cacheId, options);
}

// Same as fetchSheetData but always background-fetches and fires pflCacheUpdated if data changed
export async function fetchSheetDataLive(params, options = {}) {
  const cacheId = buildCacheId(params);
  return fetchWithSWR(cacheId, { ...options, liveUpdate: true });
}

export async function fetchLeaderboard(options = {}) {
  const params = {
    sheetId: CONFIG.LEADERBOARD.SHEET_ID,
    sheetName: CONFIG.LEADERBOARD.RESULTS_SHEET,
    range: CONFIG.LEADERBOARD.RESULTS_RANGE,
  };
  return options.liveUpdate ? fetchSheetDataLive(params, options) : fetchSheetData(params, options);
}

export async function fetchLeaderboardConfig(options = {}) {
  const params = {
    sheetId: CONFIG.LEADERBOARD.SHEET_ID,
    sheetName: CONFIG.LEADERBOARD.CONFIG_SHEET,
    range: CONFIG.LEADERBOARD.CONFIG_RANGE,
  };
  return options.liveUpdate ? fetchSheetDataLive(params, options) : fetchSheetData(params, options);
}

export async function fetchArenaConfig(options = {}) {
  const params = {
    sheetId: CONFIG.ARENA.CONFIG_SHEET_ID,
    sheetName: CONFIG.ARENA.CONFIG_SHEET_NAME,
    range: CONFIG.ARENA.CONFIG_RANGE,
  };
  return options.liveUpdate ? fetchSheetDataLive(params, options) : fetchSheetData(params, options);
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

export function hasCachedData(params) {
  const cacheId = buildCacheId(params);
  const cacheKey = makeCacheKey(cacheId);
  return getFromCache(cacheKey) !== null;
}

// ---- Debug ----
export function getCacheStats() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('pfl_cache::'));
    return {
      version: cacheVersion,
      entries: keys.length,
    };
  } catch (e) {
    return { version: cacheVersion, entries: 0 };
  }
}
