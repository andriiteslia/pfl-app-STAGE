/* ============================================
   PFL App — Pull to Refresh
   Based on index_old.html (no visual indicator)
   ============================================ */

import { $ } from './utils.js';
import { getActiveTab } from './tabs.js';

// ---- Config ----
const THRESHOLD = 160;
const RESIST = 0.4;

// ---- State ----
let startY = 0;
let pulling = false;

// ---- Get Reload Button for Current Tab ----
function getActiveReloadBtn() {
  const tab = getActiveTab();
  if (tab === 'fests') return $('#reload');
  if (tab === 'leaderboard') return $('#reloadLeaderboard');
  if (tab === 'arena') return $('#reloadArena');
  if (tab === 'didyliv') return $('#reloadDidyliv');
  return null;
}

// ---- Initialize Pull to Refresh ----
export function initPullToRefresh() {
  const scroller = $('#app-wrap');
  if (!scroller) return;

  scroller.addEventListener('touchstart', (e) => {
    if (scroller.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = (e.touches[0].clientY - startY) * RESIST;
    if (dy <= 0) {
      pulling = false;
      return;
    }
  }, { passive: true });

  scroller.addEventListener('touchend', (e) => {
    if (!pulling) return;
    pulling = false;

    const dy = (e.changedTouches[0].clientY - startY) * RESIST;

    // Partners tab has no refresh
    const tab = getActiveTab();
    if (tab === 'partners' || tab === 'about') return;

    if (dy >= THRESHOLD) {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      } catch (err) {}
      const btn = getActiveReloadBtn();
      if (btn) btn.click();
    }
  }, { passive: true });

  console.log('[PullToRefresh] Initialized');
}
