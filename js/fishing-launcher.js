/* ============================================
   PFL App — Fishing mini-game launcher
   --------------------------------------------
   - FAB «Рибалити!» above the tab bar, only on the Fests tab.
   - Every open shows a splash (assets/fishing/game-logo.png, levitating) for
     at least SPLASH_MIN_MS. On the first open the game is loaded lazily behind it:
     fishing/fishing.css, fishing-game.html, fishing-engine.js →
     fishing-audio.js → fishing-view.js, all artwork (fish too) and sounds.
   - Full-screen view; closes only via the game's X icon. The same splash is
     shown on exit too (SPLASH_MIN_MS), then the whole view fades back to the app.
   - start() on open / stop() on close: animation, sound, vibration and
     Telegram swipes are all stopped while the game is closed.
   ============================================ */

import { haptic, showToast } from './utils.js';

const GAME_VERSION = '20261005f';          // cache-busting for the game files (technical, bump on every change)
// Human version shown on the splash. Bump: small changes 1.1 → 1.2, big ones → 2.0.
const GAME_RELEASE = { version: '1.24', date: '05.10.2026' };
const BASE = 'fishing/';
const SCRIPTS = ['fishing-engine.js', 'fishing-lakes.js', 'fishing-lures.js', 'fishing-audio.js', 'fishing-view.js'];   // in this order
const SPLASH_MIN_MS = 1200;               // splash stays at least this long
const ASSETS_TIMEOUT_MS = 8000;           // don't wait forever on a slow network
const SPLASH_FADE_MS = 300;               // keep in sync with .fishing-splash transition
const FISH_ART_V = '5';                   // same as in fishing-view.js — bump when a fish picture changes
const LURE_IDS = ['easy-shiner', 'swing-impact-fat', 'cheater', 'fusion', 'orbit'];   // fishing-lures.js (v1.24)
const IMAGES = ['sky', 'water', 'land', 'lure-box']
  .map((n) => `./assets/fishing/${n}.webp`)
  .concat(LURE_IDS.flatMap((n) => [`./assets/fishing/lures/${n}.webp`, `./assets/fishing/lures/${n}-tip.webp`]))
  .concat(['perch', 'pike', 'zander', 'catfish', 'crab'].map((n) => `./assets/fishing/${n}.webp?v=${FISH_ART_V}`));
const SOUNDS = ['cast', 'splash', 'nature', 'drag']
  .map((n) => `./assets/fishing/sfx/${n}.mp3`);   // same URLs the game fetches → served from cache

let fab = null;
let root = null;          // #fishingRoot — full-screen container for the game
let game = null;          // { start, stop, isRunning } from fishing-view.js
let loading = null;       // Promise while the first load is in progress
let isOpen = false;
let opening = false;       // guards double taps while loading
let closing = false;       // exit splash is on screen

// ---- Lazy loading helpers ----
const withVersion = (url) => `${url}?v=${GAME_VERSION}`;

function loadCss(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = withVersion(href);
    link.dataset.fishing = '';
    link.onload = () => resolve();
    link.onerror = () => { link.remove(); reject(new Error('CSS: ' + href)); };
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = withVersion(src);
    s.async = false;
    s.dataset.fishing = '';
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('JS: ' + src)); };
    document.body.appendChild(s);
  });
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// Warm the cache with every picture and sound so nothing pops in mid-game.
// Failures are ignored: the game has its own fallbacks (emoji, silence).
function preloadAssets() {
  const images = IMAGES.map((src) => new Promise((res) => {
    const img = new Image();
    img.onload = img.onerror = res;
    img.src = src;
    img.decode?.().then(res, res);
  }));
  const sounds = SOUNDS.map((url) => fetch(url).then((r) => r.arrayBuffer()).catch(() => {}));
  return Promise.race([Promise.all([...images, ...sounds]), wait(ASSETS_TIMEOUT_MS)]);
}

// ---- Splash (styles live in css/fishing-fab.css, so it shows instantly) ----
let splash = null;

function createRoot() {
  root = document.createElement('div');
  root.id = 'fishingRoot';
  root.className = 'fishing-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="fishing-splash" aria-live="polite" aria-label="Завантаження гри">
      <div class="fishing-splash__logo">
        <img src="./assets/fishing/game-logo.png" alt="Рибалка" draggable="false">
        <span class="fishing-splash__fallback">Рибалка</span>
      </div>
      <div class="fishing-splash__version">v${GAME_RELEASE.version} · ${GAME_RELEASE.date}</div>
    </div>
    <div class="fishing-rotate" aria-live="polite">
      <svg class="fishing-rotate__phone" viewBox="0 0 48 48" width="64" height="64" fill="none" aria-hidden="true">
        <rect x="14" y="4" width="20" height="40" rx="4" stroke="currentColor" stroke-width="3"/>
        <path d="M21 38h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      </svg>
      <div class="fishing-rotate__title">Поверни телефон вертикально</div>
      <div class="fishing-rotate__text">Гра працює лише у вертикальному режимі</div>
    </div>`;
  splash = root.querySelector('.fishing-splash');
  const logo = splash.querySelector('img');
  logo.onload = () => splash.classList.add('has-logo');
  logo.onerror = () => splash.classList.add('no-logo');   // no file yet → text fallback
  document.body.appendChild(root);
}

function showSplash() {
  splash.classList.remove('is-hiding');
  splash.hidden = false;
}

function hideSplash() {
  splash.classList.add('is-hiding');
  setTimeout(() => { if (splash.classList.contains('is-hiding')) splash.hidden = true; }, SPLASH_FADE_MS);
}

async function loadGame() {
  const assets = preloadAssets();              // in parallel with the code below
  const [html] = await Promise.all([
    fetch(withVersion(BASE + 'fishing-game.html')).then((r) => {
      if (!r.ok) throw new Error('HTML: ' + r.status);
      return r.text();
    }),
    loadCss(BASE + 'fishing.css'),
  ]);

  const holder = document.createElement('div');
  holder.innerHTML = html;
  root.insertBefore(holder.querySelector('#fishingGame'), splash);  // splash stays on top

  // engine → audio → view (each one extends window.PFLFishing)
  for (const file of SCRIPTS) {
    await loadScript(BASE + file);
  }

  await assets;

  game = window.PFLFishing.initFishingGame({ onExit: closeFishingGame });
  if (!game) throw new Error('init');
}

function ensureLoaded() {
  if (game) return Promise.resolve();
  if (!loading) {
    loading = loadGame().catch((err) => {
      // clean up so the next tap can retry
      root?.querySelector('#fishingGame')?.remove(); game = null; loading = null;
      throw err;
    });
  }
  return loading;
}

// ---- No zoom while the game is open ----
// 1) touch-action: none on #fishingRoot (css/fishing-fab.css)
// 2) viewport meta locked to scale 1 while open (restored on close)
// 3) iOS: block double-tap outside buttons, dblclick and pinch "gesture*" events
const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
let viewportOriginal = null;

function lockZoom(lock) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  if (lock) {
    if (viewportOriginal === null) viewportOriginal = meta.getAttribute('content') || '';
    meta.setAttribute('content', VIEWPORT_LOCKED);
  } else if (viewportOriginal !== null) {
    meta.setAttribute('content', viewportOriginal);
    viewportOriginal = null;
  }
}

function bindNoZoom() {
  const DOUBLE_TAP_MS = 350;
  let lastTouchEnd = 0;
  root.addEventListener('touchend', (e) => {
    const now = e.timeStamp || Date.now();
    const onButton = e.target.closest('button, [role="button"], .fg-control, [data-close]');
    // a quick second tap on the scene / splash / sheet: cancel the browser's zoom.
    // Buttons are left alone so their clicks keep working.
    if (!onButton && now - lastTouchEnd < DOUBLE_TAP_MS) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  root.addEventListener('dblclick', (e) => e.preventDefault());
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
    root.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
}

// ---- Telegram fullscreen header ----
// In fullscreen Telegram draws its «Close» / «⋯» buttons over the top of the
// page (contentSafeAreaInset). The game puts its Улов/Вага pill in that row.
const tg = window.Telegram?.WebApp;

function updateTgHeader() {
  if (!root) return;
  let inHeader = false;
  try {
    inHeader = !!tg?.isFullscreen && (tg.contentSafeAreaInset?.top || 0) > 0;
  } catch (e) { /* older clients */ }
  root.classList.toggle('is-tg-header', inHeader);
}

function bindTgHeader() {
  try {
    ['fullscreenChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged']
      .forEach((ev) => tg?.onEvent?.(ev, updateTgHeader));
  } catch (e) { /* older clients */ }
}

// ---- Portrait only on phones ----
// Landscape on a phone breaks the game layout, so:
//  • Telegram 8.0+: lockOrientation() while the game is open (it locks the
//    CURRENT orientation → only called in portrait; opened in landscape → locked
//    as soon as the phone is turned upright). Unlocked again on close.
//  • older clients / opened sideways: a "turn the phone" screen covers the game
//    (CSS, same media query) and the game is paused until it is upright again.
// Tablets and desktop are not affected (height > 540 px or a mouse).
const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 540px) and (pointer: coarse)';
let landscapeMq = null;
let orientLockedByUs = false;
let rotatePaused = false;      // the game was paused by turning the phone sideways

const isPhoneLandscape = () => !!landscapeMq && landscapeMq.matches;

function lockPortrait() {
  if (orientLockedByUs || isPhoneLandscape()) return;
  try {
    if (!tg?.lockOrientation || !tg.isVersionAtLeast?.('8.0')) return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;          // desktop
    if (Math.min(screen.width, screen.height) >= 600) return;             // tablet
    if (tg.isOrientationLocked) return;                                   // someone else's lock
    tg.lockOrientation();
    orientLockedByUs = true;
  } catch (e) { /* older clients */ }
}

function unlockOrientation() {
  if (!orientLockedByUs) return;
  orientLockedByUs = false;
  try { tg?.unlockOrientation?.(); } catch (e) { /* n/a */ }
}

function onOrientationChange() {
  if (!isOpen || closing) return;
  if (isPhoneLandscape()) {
    if (game?.isRunning?.()) { game.pause(); rotatePaused = true; }
  } else {
    lockPortrait();
    if (rotatePaused) { rotatePaused = false; game?.start?.(); }
  }
}

function bindOrientation() {
  try {
    landscapeMq = window.matchMedia(PHONE_LANDSCAPE);
    if (landscapeMq.addEventListener) landscapeMq.addEventListener('change', onOrientationChange);
    else landscapeMq.addListener?.(onOrientationChange);                  // old iOS Safari
  } catch (e) { /* n/a */ }
}

// ---- One catch per Telegram launch ----
// Minimising keeps the game (and the catch) while the user stays in PFL App.
// Leaving the bot / closing Telegram ends it: every Telegram launch gets a new
// initData (auth_date + hash), so a different launch id than the saved one
// means a fresh start → wipe the saved catch. A WebView reload (iOS killed it)
// keeps the same initData → the catch stays.
const LAUNCH_KEY = 'pfl.fishing.launch';
const SESSION_KEY = 'pfl.fishing.session';     // written by fishing-view.js

function telegramLaunchId() {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe || {};
    if (u.hash) return String(u.hash);
    if (u.auth_date) return String(u.auth_date);
    return window.Telegram?.WebApp?.initData || '';
  } catch (e) { return ''; }
}

function resetOnNewLaunch() {
  const id = telegramLaunchId();
  if (!id) return;                               // outside Telegram: plain sessionStorage rules
  const prev = ssGet(LAUNCH_KEY);
  if (prev && prev !== id) {
    ssDel(SESSION_KEY);
    ssDel(ALIVE_KEY);
    ssDel(RESUMES_KEY);
    console.log('[Fishing] New Telegram launch → fresh game');
  }
  ssSet(LAUNCH_KEY, id);
}

// ---- Auto-resume after a page restart ----
// iOS can kill Telegram's WebView mid-game (memory / heat); Telegram then
// reloads the mini app from scratch on the Fests tab. While the game is open
// we keep a heartbeat in sessionStorage (it survives that reload, and the
// catch is already kept there by the game). On start, a fresh heartbeat means
// the page died while playing → open the game again right away.
const ALIVE_KEY = 'pfl.fishing.alive';        // last heartbeat, ms
const RESUMES_KEY = 'pfl.fishing.resumes';    // recent auto-resume times (crash-loop guard)
const HEARTBEAT_MS = 3000;
const RESUME_WINDOW_MS = 60000;               // heartbeat older than this → don't resume
const MAX_RESUMES = 3;                        // …within RESUME_LOOP_MS, then give up
const RESUME_LOOP_MS = 120000;
let heartbeatTimer = 0;

function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode / full */ } }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* n/a */ } }

function startHeartbeat() {
  const beat = () => ssSet(ALIVE_KEY, String(Date.now()));
  beat();
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = 0;
  ssDel(ALIVE_KEY);
}

function shouldResume() {
  const last = Number(ssGet(ALIVE_KEY)) || 0;
  ssDel(ALIVE_KEY);
  if (!last || Date.now() - last > RESUME_WINDOW_MS) return false;
  let recent = [];
  try { recent = JSON.parse(ssGet(RESUMES_KEY) || '[]'); } catch (e) { recent = []; }
  recent = recent.filter((t) => Date.now() - t < RESUME_LOOP_MS);
  if (recent.length >= MAX_RESUMES) return false;   // keeps dying → stay in the app
  recent.push(Date.now());
  ssSet(RESUMES_KEY, JSON.stringify(recent));
  return true;
}

// ---- Open / close ----
export async function openFishingGame({ auto = false } = {}) {
  if (isOpen || opening || closing) return;
  opening = true;
  if (!auto) haptic('light');
  if (!root) { createRoot(); bindTgHeader(); bindNoZoom(); bindOrientation(); }
  lockPortrait();
  lockZoom(true);
  updateTgHeader();

  // splash on every open; on the first one the game + all assets load behind it
  showSplash();
  root.hidden = false;
  document.documentElement.classList.add('fishing-open');
  updateFab();
  try {
    await Promise.all([ensureLoaded(), wait(SPLASH_MIN_MS)]);
  } catch (e) {
    console.warn('[Fishing] Failed to load:', e);
    lockZoom(false);
    root.hidden = true;
    document.documentElement.classList.remove('fishing-open');
    opening = false;
    updateFab();
    showToast('Не вдалося завантажити гру', 2500);
    return;
  }

  opening = false;
  isOpen = true;
  root.hidden = false;                       // visible first: start() measures the screen
  document.documentElement.classList.add('fishing-open');
  updateFab();
  game.start();
  startHeartbeat();
  rotatePaused = false;
  onOrientationChange();                     // opened sideways → paused behind the "turn the phone" screen
  hideSplash();                              // game is already drawing under the fading splash
  console.log('[Fishing] Opened');
}

export async function closeFishingGame() {
  if (!isOpen || closing) return;
  closing = true;
  if (game?.isRunning?.()) game.pause();    // the chevron already paused it; this covers other callers
  rotatePaused = false;
  stopHeartbeat();                           // minimised on purpose → a reload won't reopen the game

  // exit splash: same logo, then the whole view fades back to the app
  showSplash();
  await wait(SPLASH_MIN_MS);
  root.classList.add('is-closing');
  await wait(SPLASH_FADE_MS);
  root.hidden = true;
  root.classList.remove('is-closing');

  isOpen = false;
  closing = false;
  unlockOrientation();                       // the app itself may rotate again
  lockZoom(false);
  document.documentElement.classList.remove('fishing-open');
  updateFab();
  console.log('[Fishing] Closed');
}

export function isFishingOpen() {
  return isOpen;
}

// ---- Catch badge on the FAB (game minimised with fish in the bag) ----
// The count comes from the saved session (fishing-view.js saves it on minimise),
// so it also shows after a WebView reload in the same Telegram launch and is
// gone after a new launch (resetOnNewLaunch wipes the session).
function catchCount() {
  try {
    const bag = JSON.parse(ssGet(SESSION_KEY) || 'null')?.bag;
    return Array.isArray(bag) ? bag.length : 0;
  } catch (e) { return 0; }
}

function updateBadge() {
  const badge = fab?.querySelector('.fab-fishing__badge');
  if (!badge) return;
  const n = isOpen || opening ? 0 : catchCount();
  const text = n > 99 ? '99+' : String(n);
  if (n > 0) {
    if (badge.hidden || badge.textContent !== text) {
      badge.textContent = text;
      badge.hidden = false;
    }
    fab.setAttribute('aria-label', `Повернутись до гри «Рибалка» — в улові ${n}`);
  } else {
    badge.hidden = true;
    fab.setAttribute('aria-label', 'Відкрити гру «Рибалка»');
  }
}

// ---- FAB visibility: Fests tab only, hidden while the game is open ----
function updateFab() {
  if (!fab) return;
  const festsActive = document.getElementById('tab-fests')?.classList.contains('active');
  const show = !!festsActive && !isOpen && !opening;
  fab.classList.toggle('is-visible', show);
  document.body.classList.toggle('fishing-fab-visible', show);
  updateBadge();
}

// ---- Init ----
export function initFishingLauncher() {
  fab = document.getElementById('fabFishing');
  if (!fab) return;

  fab.addEventListener('click', () => openFishingGame());

  const festsTab = document.getElementById('tab-fests');
  if (festsTab) {
    new MutationObserver(updateFab).observe(festsTab, { attributes: true, attributeFilter: ['class'] });
  }
  updateFab();

  resetOnNewLaunch();
  updateBadge();
  if (shouldResume()) {
    console.log('[Fishing] Page restarted mid-game → reopening');
    openFishingGame({ auto: true });
  }
  console.log('[Fishing] Launcher ready');
}
