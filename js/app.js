/* ============================================
   PFL App — Main Application
   Entry point, initialization
   ============================================ */

import CONFIG from './config.js';
import { initTabs, onTabActivate, getActiveTab, navigateTo } from './tabs.js';
import { initFests, loadFestsData, isFestsLoaded } from './fests.js';
import { initLeaderboard, loadLeaderboard, isLeaderboardLoaded } from './leaderboard.js';
import { initArena, loadArena, isArenaLoaded } from './arena.js';
import { initDidyliv, loadDidyliv, isDidylivLoaded } from './didyliv.js';
import { initPartners } from './partners.js';
import { fetchAppStyles } from './api.js';
import { $ } from './utils.js';
import { initPullToRefresh } from './pull-to-refresh.js';

// ---- Theme Management ----
function updateMetaThemeColor(color) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

function initTheme() {
  try {
    // Check for theme override in localStorage
    const override = localStorage.getItem('theme_override');
    if (override === 'dark' || override === 'light') {
      document.documentElement.setAttribute('data-theme', override === 'dark' ? 'dark' : '');
      updateThemeToggleIcon();
      updateMetaThemeColor(override === 'dark' ? '#1A2026' : '#f0f2f8');
      return;
    }
    
    // Check Telegram WebApp theme
    const tg = window.Telegram?.WebApp;
    if (tg?.colorScheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    updateThemeToggleIcon();
  } catch (e) {
    console.warn('[Theme] Error:', e);
  }
  
  // Set initial meta theme-color
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  updateMetaThemeColor(isDark ? '#1A2026' : '#f0f2f8');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme === 'dark' ? 'dark' : '');
  
  try {
    localStorage.setItem('theme_override', newTheme);
  } catch (e) {}
  
  updateThemeToggleIcon();
  
  // Update Telegram header color
  try {
    const tg = window.Telegram?.WebApp;
    const headerColor = newTheme === 'dark' ? '#1A2026' : '#f0f2f8';
    if (tg && typeof tg.setHeaderColor === 'function') {
      tg.setHeaderColor(headerColor);
    }
    updateMetaThemeColor(headerColor);
  } catch (e) {}
  
  // Haptic feedback
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
  } catch (e) {}
}

function updateThemeToggleIcon() {
  const btn = $('#themeToggle');
  if (!btn) return;
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? '☀️' : '🌙';
}

function initThemeToggle() {
  const btn = $('#themeToggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
}

// ---- Styles from Google Sheets ----
async function loadAppStylesFromSheet() {
  try {
    const data = await fetchAppStyles();
    
    if (!data?.ok || !Array.isArray(data.values) || data.values.length < 2) {
      return;
    }
    
    // Parse key/value rows
    const styles = {};
    data.values.slice(1).forEach(row => {
      const key = String(row[0] ?? '').trim().toLowerCase();
      const val = String(row[1] ?? '').trim();
      if (key && val) styles[key] = val;
    });
    
    // Load Google Fonts
    const fontsToLoad = new Set();
    if (styles.ui_font) fontsToLoad.add(styles.ui_font);
    if (styles.table_font) fontsToLoad.add(styles.table_font);
    
    fontsToLoad.forEach(fontName => {
      const id = `gf-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
      if (document.getElementById(id)) return;
      
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
    });
    
    // Apply CSS variables
    const root = document.documentElement;
    const fallback = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const normSize = (v) => v && /^\d+(\.\d+)?$/.test(v.trim()) ? v.trim() + 'px' : v;
    
    if (styles.ui_font) {
      root.style.setProperty('--font-ui', `"${styles.ui_font}", ${fallback}`);
    }
    if (styles.table_font) {
      root.style.setProperty('--font-table', `"${styles.table_font}", ${fallback}`);
    }
    if (styles.table_font_size) {
      root.style.setProperty('--table-font-size', normSize(styles.table_font_size));
    }
    if (styles.card_title_font_size) {
      root.style.setProperty('--card-title-font-size', normSize(styles.card_title_font_size));
    }
    
    console.log('[Styles] Applied:', styles);
  } catch (e) {
    console.warn('[Styles] Failed to load:', e);
  }
}

// ---- Telegram WebApp Integration ----
function initTelegram() {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    
    const FULLSCREEN_PAD = 108;
    const FULLSIZE_PAD = 20;
    
    function setPad(px) {
      document.documentElement.style.setProperty('--app-top-pad', px + 'px');
      document.body.classList.toggle('fullscreen-active', px >= FULLSCREEN_PAD);
    }
    
    function isMobileClient() {
      const p = tg && typeof tg.platform === 'string' ? tg.platform.toLowerCase() : '';
      if (p.includes('android') || p.includes('ios')) return true;
      
      const ua = (navigator.userAgent || '').toLowerCase();
      return /iphone|ipad|ipod|android/.test(ua);
    }
    
    function isFullsizeNow() {
      if (!isMobileClient()) return true;
      const ih = window.innerHeight || 0;
      const sh = window.screen?.availHeight || window.screen?.height || 0;
      if (!ih || !sh) return false;
      
      const delta = sh - ih;
      return delta >= 80;
    }
    
    function applyByState() {
      if (!isMobileClient()) {
        setPad(FULLSIZE_PAD);
        return;
      }
      
      if (tg && typeof tg.isFullscreen === 'boolean') {
        setPad(tg.isFullscreen ? FULLSCREEN_PAD : FULLSIZE_PAD);
        return;
      }
      
      setPad(isFullsizeNow() ? FULLSIZE_PAD : FULLSCREEN_PAD);
    }
    
    function tryFullscreen() {
      if (!tg || !isMobileClient()) return;
      if (!isFullsizeNow()) return;
      try {
        if (typeof tg.requestFullscreen === 'function') {
          tg.requestFullscreen();
        } else if (typeof tg.expand === 'function') {
          tg.expand();
        }
      } catch(e) {}
    }
    
    // Disable vertical swipes to prevent closing app
    try {
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }
    } catch(e) {}
    
    // Set header/status bar color
    try {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const headerColor = isDark ? '#1A2026' : '#f0f2f8';
      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor(headerColor);
      }
      // Update meta theme-color for system status bar
      updateMetaThemeColor(headerColor);
    } catch(e) {}
    
    // Apply padding immediately
    applyByState();
    
    // Try fullscreen on mobile
    if (isMobileClient()) {
      tryFullscreen();
    }
    
    // Try on first interaction
    let triedOnInteraction = false;
    function tryOnce() {
      if (triedOnInteraction) return;
      triedOnInteraction = true;
      tryFullscreen();
    }
    
    ['touchstart', 'click'].forEach(evt => {
      document.addEventListener(evt, tryOnce, { once: true, passive: true });
    });
    
    // Update viewport height CSS variable
    const updateViewport = () => {
      const vh = tg.viewportStableHeight || window.innerHeight;
      document.documentElement.style.setProperty('--tg-viewport-height', `${vh}px`);
      document.documentElement.style.setProperty('--tg-viewport-stable-height', `${vh}px`);
      applyByState();
    };
    
    updateViewport();
    tg.onEvent('viewportChanged', updateViewport);
    
    // Expand on init
    try { tg.expand(); } catch(e) {}
    setTimeout(() => { try { tg.expand(); } catch(e) {} }, 120);
    
    console.log('[Telegram] WebApp initialized, vertical swipes disabled');
  } catch (e) {
    console.warn('[Telegram] Not available:', e);
  }
}

// ---- External Links (bypass Telegram confirmation modal) ----
function initExternalLinks() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.openLink) return;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.href;
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

    // Only intercept external links
    const isExternal = link.target === '_blank' || 
                       (href.startsWith('http') && !href.includes(location.hostname));
    if (!isExternal) return;

    e.preventDefault();
    e.stopPropagation();
    
    // Telegram links open natively inside Telegram
    if (href.includes('t.me/') || href.includes('telegram.me/')) {
      tg.openTelegramLink(href);
    } else {
      tg.openLink(href);
    }
  });

  console.log('[App] External links handler initialized');
}

// ---- Tab Callbacks ----
function setupTabCallbacks() {
  onTabActivate('fests', () => {
    if (!isFestsLoaded()) {
      loadFestsData();
    }
  });

  onTabActivate('leaderboard', () => {
    if (!isLeaderboardLoaded()) {
      loadLeaderboard();
    }
  });

  onTabActivate('arena', () => {
    if (!isArenaLoaded()) {
      loadArena();
    }
  });

  onTabActivate('didyliv', () => {
    if (!isDidylivLoaded()) {
      loadDidyliv();
    }
  });
}

// ---- Main Init ----
async function init() {
  console.log('[PFL App] Starting...');
  
  // 1. Theme (already applied in head, but re-check)
  initTheme();
  initThemeToggle();
  
  // 2. Telegram integration
  initTelegram();
  
  // 3. Load styles from Google Sheets (async, non-blocking)
  loadAppStylesFromSheet();
  
  // 4. Initialize modules
  initTabs();
  initFests();
  initLeaderboard();
  initArena();
  initDidyliv();
  initPartners();
  
  // 5. Setup tab activation callbacks
  setupTabCallbacks();
  
  // 6. Pull to refresh
  initPullToRefresh();
  
  // 7. Bypass Telegram confirmation modal for external links
  initExternalLinks();
  
  // 8. Row highlight in tables
  initRowHighlight();
  
  // 9. Load initial data for visible tab
  const activeTab = getActiveTab();
  if (activeTab === 'fests') {
    loadFestsData();
  } else if (activeTab === 'leaderboard') {
    loadLeaderboard();
  }
  
  // 10. Deep link via Telegram start_param
  handleDeepLink();
  
  console.log('[PFL App] Ready!');
}

// ---- Deep Link ----
function handleDeepLink() {
  try {
    // Try Telegram start_param first, then web URL params
    const tg = window.Telegram?.WebApp;
    let payload = tg?.initDataUnsafe?.start_param;
    
    if (!payload) {
      // Web fallback: ?startapp=arena__cardId
      const urlParams = new URLSearchParams(window.location.search);
      payload = urlParams.get('startapp');
    }
    
    if (!payload) return;
    
    // Format: "tabKey" or "tabKey__cardId"
    const [tabKey, cardId] = payload.split('__');
    
    const validTabs = ['fests', 'leaderboard', 'partners', 'arena', 'didyliv', 'hradivka'];
    if (!validTabs.includes(tabKey)) {
      console.warn('[DeepLink] Unknown tab:', tabKey);
      return;
    }
    
    console.log('[DeepLink] Navigating to:', tabKey, cardId ? `card: ${cardId}` : '');
    
    // Navigate to tab
    navigateTo(tabKey);
    
    // If cardId provided, store it for the module to pick up after loading
    if (cardId) {
      window.__deepLinkCard = cardId;
    }
    
    // Clean URL params without reload
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  } catch (e) {
    console.warn('[DeepLink] Error:', e);
  }
}

// ---- Row Highlight ----
function initRowHighlight() {
  const content = document.getElementById('app-content');
  if (!content) return;

  // Tap on row → toggle highlight (one per table)
  content.addEventListener('click', (e) => {
    const row = e.target.closest('tbody tr');
    if (!row) return;

    const tbody = row.closest('tbody');
    if (!tbody) return;

    const wasActive = row.classList.contains('row-highlight');

    // Clear other highlights in same table
    tbody.querySelectorAll('tr.row-highlight').forEach(r => r.classList.remove('row-highlight'));

    // Toggle: if it was already active, leave deselected; otherwise select
    if (!wasActive) {
      row.classList.add('row-highlight');
    }
  });

  // Card header click → clear highlights inside that card
  content.addEventListener('click', (e) => {
    const header = e.target.closest('.table-header');
    if (!header) return;

    const card = header.closest('.card, article');
    if (!card) return;

    card.querySelectorAll('tr.row-highlight').forEach(r => r.classList.remove('row-highlight'));
  });
}

// ---- Start ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
