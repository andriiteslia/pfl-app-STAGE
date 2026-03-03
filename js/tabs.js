/* ============================================
   PFL App — Tabs Module
   Tab switching, morph animation (Main ↔ Arena mode)
   Anchor pattern: Fests/PFL share first position
   ============================================ */

import { $, $$, haptic } from './utils.js';
import CONFIG from './config.js';

// ---- State ----
let activeTab = CONFIG.UI.DEFAULT_TAB;
let previousTab = null;
let arenaMode = false;
let lastMainTab = null;
let lastArenaTab = null;

const mainTabs = ['fests', 'leaderboard', 'partners'];
const arenaTabs = ['arena', 'didyliv', 'hradivka'];
const tabOrder = [...mainTabs, ...arenaTabs];

const tabCallbacks = new Map();

// ---- Initialize ----
export function initTabs() {
  const tabButtons = $$('.tab-btn');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabKey = btn.dataset.tab;
      if (!tabKey) return;
      
      // Anchor clicked in arena mode -> exit
      if (arenaMode && btn.classList.contains('tab-btn--anchor')) {
        exitArenaMode();
        return;
      }
      
      // Arena-group tab from main mode -> enter
      if (!arenaMode && arenaTabs.includes(tabKey)) {
        enterArenaMode(tabKey);
        return;
      }
      
      // Normal switch
      if (tabKey !== activeTab) {
        switchTab(tabKey);
      }
    });
  });
  
  updateTabUI(activeTab);
  console.log('[Tabs] Initialized with morph support');
}

// ---- Anchor Label Swap ----
function setAnchorLabel(text) {
  const anchor = $('.tab-btn--anchor');
  if (!anchor) return;
  const label = anchor.querySelector('.tab-label');
  if (label) {
    label.style.opacity = '0';
    setTimeout(() => {
      label.textContent = text;
      label.style.opacity = '1';
    }, 85);
  }
}

// ---- Enter Arena Mode ----
function enterArenaMode(tabKey) {
  if (arenaMode) return;
  
  // If clicking Arena button, restore last arena tab
  if (tabKey === 'arena' && lastArenaTab && lastArenaTab !== 'arena') {
    tabKey = lastArenaTab;
  }
  
  lastMainTab = mainTabs.includes(activeTab) ? activeTab : 'fests';
  arenaMode = true;
  haptic('medium');
  
  const tabsBar = $('.tabs-bar');
  if (tabsBar) tabsBar.classList.add('arena-mode');
  setAnchorLabel('PFL');
  
  // Remove active from anchor
  const anchor = $('.tab-btn--anchor');
  if (anchor) anchor.classList.remove('active');
  
  previousTab = activeTab;
  activeTab = tabKey;
  lastArenaTab = tabKey;
  
  updateTabUI(tabKey);
  bounceIcon(tabKey);
  
  const callback = tabCallbacks.get(tabKey);
  if (callback) callback();
  
  window.__activeTabKey = tabKey;
  console.log('[Tabs] Entered arena mode', tabKey);
}

// ---- Exit Arena Mode ----
function exitArenaMode() {
  if (!arenaMode) return;
  
  lastArenaTab = arenaTabs.includes(activeTab) ? activeTab : 'arena';
  arenaMode = false;
  haptic('medium');
  
  const tabsBar = $('.tabs-bar');
  if (tabsBar) {
    tabsBar.classList.add('morph-exiting');
    tabsBar.classList.remove('arena-mode');
    // Remove morph-exiting after transition completes
    setTimeout(() => tabsBar.classList.remove('morph-exiting'), 300);
  }
  
  setAnchorLabel('Fests');
  
  const targetTab = lastMainTab || 'fests';
  previousTab = activeTab;
  activeTab = targetTab;
  
  // Show content immediately
  updateContentPanels(targetTab);
  
  // Clear arena active states
  $$('.tabs-solo .tab-btn').forEach(b => b.classList.remove('active'));
  
  if (targetTab === 'fests') {
    // Anchor IS fests, activate it right away
    const anchor = $('.tab-btn--anchor');
    if (anchor) anchor.classList.add('active');
  } else {
    // Returning to Leaderboard/Partners
    const anchor = $('.tab-btn--anchor');
    if (anchor) anchor.classList.remove('active');
    
    // Suppress premature active styling during morph
    $$('.tab-btn--expandable').forEach(b => {
      b.classList.add('morph-entering');
      b.classList.remove('active');
    });
    
    // After slide-in completes, reveal active state
    setTimeout(() => {
      $$('.tab-btn--expandable').forEach(b => b.classList.remove('morph-entering'));
      const targetBtn = $('.tab-btn[data-tab="' + targetTab + '"]');
      if (targetBtn) {
        targetBtn.classList.add('active');
        bounceIcon(targetTab);
      }
    }, 255);
  }
  
  const callback = tabCallbacks.get(targetTab);
  if (callback) callback();
  
  window.__activeTabKey = targetTab;
  
  const scroller = document.getElementById('app-wrap');
  if (scroller) scroller.scrollTop = 0;
  
  console.log('[Tabs] Exited arena mode', targetTab);
}

// ---- Switch Tab ----
export function switchTab(tabKey) {
  if (tabKey === activeTab) return;
  
  previousTab = activeTab;
  activeTab = tabKey;
  haptic('light');
  
  // Track last arena tab for return logic
  if (arenaMode && arenaTabs.includes(tabKey)) {
    lastArenaTab = tabKey;
  }
  
  const scroller = document.getElementById('app-wrap');
  if (scroller) scroller.scrollTop = 0;
  
  updateTabUI(tabKey);
  bounceIcon(tabKey);
  
  const callback = tabCallbacks.get(tabKey);
  if (callback) callback();
  
  window.__activeTabKey = tabKey;
  console.log('[Tabs] Switched to:', tabKey);
}

// ---- Bounce Icon ----
function bounceIcon(tabKey) {
  const activeBtn = $('.tab-btn[data-tab="' + tabKey + '"]');
  const icon = activeBtn?.querySelector('.tab-icon');
  if (icon) {
    icon.classList.remove('bounce');
    void icon.offsetWidth;
    icon.classList.add('bounce');
    icon.addEventListener('animationend', () => {
      icon.classList.remove('bounce');
    }, { once: true });
  }
}

// ---- Update UI (full) ----
function updateTabUI(tabKey) {
  $$('.tab-btn').forEach(btn => {
    const btnTab = btn.dataset.tab;
    if (!btnTab) return;
    btn.classList.toggle('active', btnTab === tabKey);
  });
  
  updateContentPanels(tabKey);
}

// ---- Update Content Panels ----
function updateContentPanels(tabKey) {
  const prevIndex = tabOrder.indexOf(previousTab);
  const currentIndex = tabOrder.indexOf(tabKey);
  const direction = currentIndex > prevIndex ? 'right' : 'left';
  
  $$('.tab-content').forEach(panel => {
    const isActive = panel.id === 'tab-' + tabKey;
    
    if (isActive) {
      panel.classList.add('active');
      panel.classList.remove('slide-left', 'slide-right');
      panel.classList.add('slide-' + direction);
    } else {
      panel.classList.remove('active', 'slide-left', 'slide-right');
    }
  });
}

// ---- Register Callback ----
export function onTabActivate(tabKey, callback) {
  tabCallbacks.set(tabKey, callback);
}

// ---- Getters ----
export function getActiveTab() {
  return activeTab;
}

export function getPreviousTab() {
  return previousTab;
}

export function isArenaMode() {
  return arenaMode;
}

// ---- Expose globally ----
window.__activeTabKey = activeTab;
