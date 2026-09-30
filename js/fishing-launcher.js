/* ============================================
   PFL App — Fishing mini-game launcher
   --------------------------------------------
   - FAB «Рибалити!» above the tab bar, only on the Fests tab.
   - First tap shows a splash (assets/fishing/game-logo.png, levitating) for
     at least SPLASH_MIN_MS while the game is loaded lazily in the background:
     fishing/fishing.css, fishing-game.html, fishing-engine.js →
     fishing-audio.js → fishing-view.js, all artwork (fish too) and sounds.
   - Full-screen view; closes only via the game's X icon.
   - start() on open / stop() on close: animation, sound, vibration and
     Telegram swipes are all stopped while the game is closed.
   ============================================ */

import { haptic, showToast } from './utils.js';

const GAME_VERSION = '20260930b';          // cache-busting for the game files
const BASE = 'fishing/';
const SCRIPTS = ['fishing-engine.js', 'fishing-audio.js', 'fishing-view.js'];
const SPLASH_MIN_MS = 1200;               // splash stays at least this long
const ASSETS_TIMEOUT_MS = 8000;           // don't wait forever on a slow network
const SPLASH_FADE_MS = 300;               // keep in sync with .fishing-splash transition
const IMAGES = ['sky', 'water', 'land', 'bait', 'perch', 'pike', 'zander', 'crab']
  .map((n) => `./assets/fishing/${n}.webp`);
const SOUNDS = ['cast', 'splash', 'nature', 'drag']
  .map((n) => `./assets/fishing/sfx/${n}.mp3`);   // same URLs the game fetches → served from cache

let fab = null;
let root = null;          // #fishingRoot — full-screen container for the game
let game = null;          // { start, stop, isRunning } from fishing-view.js
let loading = null;       // Promise while the first load is in progress
let isOpen = false;
let opening = false;       // guards double taps while loading

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

// ---- Open / close ----
export async function openFishingGame() {
  if (isOpen || opening) return;
  opening = true;
  haptic('light');
  const firstOpen = !game;
  if (!root) createRoot();

  if (firstOpen) {
    // splash right away; game + all assets load behind it
    showSplash();
    root.hidden = false;
    document.documentElement.classList.add('fishing-open');
    updateFab();
    try {
      await Promise.all([ensureLoaded(), wait(SPLASH_MIN_MS)]);
    } catch (e) {
      console.warn('[Fishing] Failed to load:', e);
      root.hidden = true;
      document.documentElement.classList.remove('fishing-open');
      opening = false;
      updateFab();
      showToast('Не вдалося завантажити гру', 2500);
      return;
    }
  }

  opening = false;
  isOpen = true;
  root.hidden = false;                       // visible first: start() measures the screen
  document.documentElement.classList.add('fishing-open');
  updateFab();
  game.start();
  if (firstOpen) hideSplash();               // game is already drawing under the fading splash
  console.log('[Fishing] Opened');
}

export function closeFishingGame() {
  if (!isOpen) return;
  isOpen = false;
  if (game?.isRunning?.()) game.stop();     // X already stopped it; this covers other callers
  root.hidden = true;
  document.documentElement.classList.remove('fishing-open');
  updateFab();
  console.log('[Fishing] Closed');
}

export function isFishingOpen() {
  return isOpen;
}

// ---- FAB visibility: Fests tab only, hidden while the game is open ----
function updateFab() {
  if (!fab) return;
  const festsActive = document.getElementById('tab-fests')?.classList.contains('active');
  const show = !!festsActive && !isOpen && !opening;
  fab.classList.toggle('is-visible', show);
  document.body.classList.toggle('fishing-fab-visible', show);
}

// ---- Init ----
export function initFishingLauncher() {
  fab = document.getElementById('fabFishing');
  if (!fab) return;

  fab.addEventListener('click', openFishingGame);

  const festsTab = document.getElementById('tab-fests');
  if (festsTab) {
    new MutationObserver(updateFab).observe(festsTab, { attributes: true, attributeFilter: ['class'] });
  }
  updateFab();
  console.log('[Fishing] Launcher ready');
}
