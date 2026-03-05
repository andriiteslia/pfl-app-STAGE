/* ============================================
   PFL App — Arena Module
   Config-driven rating cards
   ============================================ */

import CONFIG from './config.js';
import { fetchSheetData } from './api.js';
import { $, $$, escapeHtml, setButtonLoading, haptic, parseDividers, shareCard, buildShareLink, SHARE_ICON_SVG } from './utils.js';

// ---- State ----
let tags = [];
let cards = [];
let cardsByTag = new Map();
let activeTagId = null;
const cardState = new Map();
let loaded = false;
let isLoading = false;
let dataReady = false;

// ---- Helpers ----
function normBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return true;
  return !['false', '0', 'no', 'off'].includes(s);
}

function normStr(v) {
  return String(v ?? '').trim();
}

// ---- Initialize ----
export function initArena() {
  const reloadBtn = $('#reloadArena');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      haptic('light');
      loadArena({ force: true });
    });
  }

  console.log('[Arena] Initialized');
}

// ---- UI State ----
function setArenaState(state) {
  const subtitle = $('#subtitle-arena');
  const emptyEl = $('#arenaEmptyState');
  const emptyText = $('#arenaEmptyText');
  const tagsEl = $('#arenaTags');
  const cardsEl = $('#arenaCards');
  const tab = $('#tab-arena');

  const DEFAULT_SUB = 'Рейтинг і результати змагань різних форматів та дисциплін.';
  const LOADING_HTML = `Зачекайте будь ласка...<br>Ех, зараз би якийсь фюжин 2.5' 🤤`;
  const EMPTY_HTML = `Поки в розробці...<br>Ех, зараз би якийсь фюжин 2.5' 🤤`;

  if (state === 'content') {
    if (subtitle) subtitle.textContent = DEFAULT_SUB;
    if (emptyEl) emptyEl.style.display = 'none';
    if (tagsEl) tagsEl.style.display = 'flex';
    if (cardsEl) cardsEl.style.display = 'block';
    if (tab) tab.classList.remove('arena-empty');
    return;
  }

  // Show empty/loading state
  if (emptyEl) emptyEl.style.display = 'flex';
  if (tagsEl) tagsEl.style.display = 'none';
  if (cardsEl) cardsEl.style.display = 'none';
  if (tab) tab.classList.add('arena-empty');

  if (state === 'loading') {
    if (subtitle) subtitle.textContent = 'Оновлюю рейтинг і результати…';
    if (emptyText) emptyText.innerHTML = LOADING_HTML;
  } else if (state === 'error') {
    if (subtitle) subtitle.textContent = 'Помилка завантаження.';
    if (emptyText) emptyText.innerHTML = EMPTY_HTML;
  } else {
    if (subtitle) subtitle.textContent = DEFAULT_SUB;
    if (emptyText) emptyText.innerHTML = EMPTY_HTML;
  }
}

// ---- Load Config ----
async function loadArenaConfig({ force = false } = {}) {
  const data = await fetchSheetData({
    sheetId: CONFIG.ARENA.CONFIG_SHEET_ID,
    sheetName: CONFIG.ARENA.CONFIG_SHEET_NAME,
    range: CONFIG.ARENA.CONFIG_RANGE,
  }, { force });

  if (!data?.ok || !Array.isArray(data.values) || data.values.length < 2) {
    return { tags: [], cards: [] };
  }

  const [headerRow, ...rows] = data.values;

  // Build header index
  const normalizeKey = (s) => normStr(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const idx = {};
  (headerRow || []).forEach((h, i) => {
    const k = normalizeKey(h);
    if (k) idx[k] = i;
  });

  const get = (row, key) => {
    const i = idx[normalizeKey(key)];
    return i !== undefined ? (row?.[i] ?? '') : '';
  };

  const tagsMap = new Map();
  const parsedCards = [];

  rows.forEach(r => {
    if (!Array.isArray(r)) return;
    if (r.every(c => String(c ?? '').trim() === '')) return;

    const tagEnabled = normBool(get(r, 'tagEnabled'));
    const tagId = normStr(get(r, 'tagId'));
    if (!tagEnabled || !tagId) return;

    const tagTitle = normStr(get(r, 'tagTitle')) || tagId;
    const tagOrder = Number(get(r, 'tagOrder')) || 9999;
    const tagDescription = normStr(get(r, 'tagDescription'));

    if (!tagsMap.has(tagId)) {
      tagsMap.set(tagId, { id: tagId, title: tagTitle, order: tagOrder, description: tagDescription });
    }

    const cardEnabled = normBool(get(r, 'cardEnabled'));
    const cardId = normStr(get(r, 'cardId'));
    if (!cardEnabled || !cardId) return;

    // Build views
    const views = [];
    const ratingRange = normStr(get(r, 'ratingRange'));
    const eventsRange = normStr(get(r, 'eventsRange'));

    if (ratingRange) {
      views.push({
        key: 'rating',
        label: normStr(get(r, 'ratingLabel')) || 'Рейтинг',
        range: ratingRange,
        dividers: normStr(get(r, 'ratingDividers')),
      });
    }
    if (eventsRange) {
      views.push({
        key: 'events',
        label: normStr(get(r, 'eventsLabel')) || 'Змагання',
        range: eventsRange,
        dividers: normStr(get(r, 'eventsDividers')),
      });
    }

    if (!views.length) return;

    parsedCards.push({
      id: cardId,
      tagId,
      title: normStr(get(r, 'cardTitle')) || cardId,
      subtitle: normStr(get(r, 'cardDescription')),
      sheetId: normStr(get(r, 'sheetId')) || CONFIG.ARENA.CONFIG_SHEET_ID,
      sheetName: normStr(get(r, 'sheetName')) || 'Results',
      tagClass: normStr(get(r, 'tagClass')),
      tagText: normStr(get(r, 'tagText')),
      views,
    });
  });

  const sortedTags = Array.from(tagsMap.values()).sort((a, b) =>
    (a.order - b.order) || a.title.localeCompare(b.title, 'uk')
  );

  return { tags: sortedTags, cards: parsedCards };
}

// ---- Load Arena ----
export async function loadArena({ force = false } = {}) {
  const reloadBtn = $('#reloadArena');

  if (loaded && !force) return;
  if (isLoading) return;
  isLoading = true;

  // Reset active tag on force reload
  if (force) {
    activeTagId = null;
    dataReady = false;
  }

  setButtonLoading(reloadBtn, true);
  setArenaState('loading');

  try {
    const config = await loadArenaConfig({ force });

    tags = config.tags;
    cards = config.cards;

    // Group cards by tag
    cardsByTag.clear();
    cards.forEach(c => {
      if (!cardsByTag.has(c.tagId)) {
        cardsByTag.set(c.tagId, []);
      }
      cardsByTag.get(c.tagId).push(c);
    });

    // Init card states
    cards.forEach(c => {
      if (!cardState.has(c.id) || force) {
        const loaded = {};
        c.views.forEach(v => { loaded[v.key] = false; });
        cardState.set(c.id, {
          isOpen: false,
          view: c.views[0]?.key || 'rating',
          loaded,
          views: c.views,
        });
      }
    });

    if (!tags.length) {
      setArenaState('empty');
      return;
    }

    // Always ensure activeTagId is set to first valid tag
    if (!activeTagId || !tags.find(t => t.id === activeTagId)) {
      activeTagId = tags[0].id;
    }

    // If user navigated away, defer render
    if (window.__activeTabKey !== 'arena') {
      dataReady = true;
      console.log('[Arena] Data ready, render deferred');
      return;
    }

    renderArenaContent();

  } catch (e) {
    console.error('[Arena] Load error:', e);
    setArenaState('error');
  } finally {
    isLoading = false;
    setButtonLoading(reloadBtn, false);
  }
}

// ---- Render Tags ----
function renderTags() {
  const tagsEl = $('#arenaTags');
  if (!tagsEl) return;

  tagsEl.innerHTML = tags.map(t =>
    `<button class="fests-year-tag${t.id === activeTagId ? ' active' : ''}" type="button" data-tag="${escapeHtml(t.id)}">${escapeHtml(t.title)}</button>`
  ).join('');

  // Safety: ensure at least one tag is visually active
  const buttons = tagsEl.querySelectorAll('button[data-tag]');
  const hasActive = tagsEl.querySelector('.fests-year-tag.active');
  if (!hasActive && buttons.length) {
    buttons[0].classList.add('active');
    activeTagId = buttons[0].dataset.tag;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tag;
      if (!id || id === activeTagId) return;
      setActiveTag(id);
    });
  });
}

function setActiveTag(tagId) {
  activeTagId = tagId;
  haptic('light');

  $$('#arenaTags .fests-year-tag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tag === tagId);
  });

  renderCards();
}

// ---- Render Cards ----
function renderCards() {
  const cardsEl = $('#arenaCards');
  if (!cardsEl) return;

  const tagCards = cardsByTag.get(activeTagId) || [];
  cardsEl.innerHTML = tagCards.map(renderCard).join('');

  tagCards.forEach(initCard);
}

function renderCard(card) {
  const st = cardState.get(card.id);
  const views = st?.views || card.views;
  const activeKey = st?.view || views[0]?.key;

  // Tag class mapping
  const tagClassMap = {
    'score-tag_personal': 'score-tag score-tag--personal',
    'score-tag_team': 'score-tag score-tag--team',
    'score-tag_combo': 'score-tag score-tag--combo',
  };
  const tagClass = tagClassMap[card.tagClass] || card.tagClass || '';

  const segHtml = views.length > 1
    ? `<div class="segmented-control" id="segArena_${card.id}" style="display:none;">
        ${views.map(v => `<button class="segment${v.key === activeKey ? ' active' : ''}" type="button" data-view="${v.key}">${escapeHtml(v.label)}</button>`).join('')}
       </div>`
    : '';

  const outsHtml = views.map(v =>
    `<div id="outArena_${v.key}_${card.id}" class="table-content table-collapsed">
      <div class="loading-text">Завантажую дані…</div>
    </div>`
  ).join('');

  return `
    <article class="card" data-arena-id="${card.id}">
      <div class="table-header" id="headerArena_${card.id}">
        <div class="table-header__text">
          <div class="card-title" style="font-weight:800;">${escapeHtml(card.title)}</div>
          ${card.subtitle ? `<div style="font-size:15px; color:var(--muted);">${escapeHtml(card.subtitle)}</div>` : ''}
          ${tagClass && card.tagText ? `<div class="${tagClass}">${escapeHtml(card.tagText)}</div>` : ''}
        </div>
        <div class="table-header__actions">
          <button class="share-btn" type="button" data-share="arena__${card.id}" aria-label="Share">${SHARE_ICON_SVG}</button>
          <div class="chevron" id="chevronArena_${card.id}">
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>
      ${segHtml}
      ${outsHtml}
    </article>
  `;
}

// ---- Init Card ----
function initCard(card) {
  const header = $(`#headerArena_${card.id}`);
  const chevron = $(`#chevronArena_${card.id}`);
  const segment = $(`#segArena_${card.id}`);

  if (!header) return;

  const st = cardState.get(card.id);

  header.addEventListener('click', () => {
    st.isOpen = !st.isOpen;
    haptic('light');
    updateCardView(card);

    if (st.isOpen && !st.loaded[st.view]) {
      loadCardData(card, st.view);
    }
  });

  // Share button
  const shareBtn = header.querySelector('.share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const deepLink = buildShareLink(shareBtn.dataset.share);
      shareCard(deepLink, card.title);
    });
  }

  if (segment) {
    segment.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const view = btn.dataset.view;
        if (view === st.view) return;

        st.view = view;
        haptic('light');

        segment.querySelectorAll('.segment').forEach(s => {
          s.classList.toggle('active', s.dataset.view === view);
        });

        updateCardView(card);

        if (!st.loaded[view]) {
          loadCardData(card, view);
        }
      });
    });
  }
}

function updateCardView(card) {
  const st = cardState.get(card.id);
  if (!st) return;

  const chevron = $(`#chevronArena_${card.id}`);
  const segment = $(`#segArena_${card.id}`);

  chevron?.classList.toggle('open', st.isOpen);
  if (segment) segment.style.display = st.isOpen && st.views.length > 1 ? 'flex' : 'none';

  st.views.forEach(v => {
    const outEl = $(`#outArena_${v.key}_${card.id}`);
    if (outEl) {
      outEl.classList.toggle('table-collapsed', !(st.isOpen && st.view === v.key));
    }
  });
}

// ---- Load Card Data ----
async function loadCardData(card, viewKey, force = false) {
  const st = cardState.get(card.id);
  const view = st?.views?.find(v => v.key === viewKey);
  const outEl = $(`#outArena_${viewKey}_${card.id}`);

  if (!outEl || !view) return;

  outEl.innerHTML = '<div class="loading-text">Завантажую дані…</div>';

  try {
    const data = await fetchSheetData({
      sheetId: card.sheetId,
      sheetName: card.sheetName,
      range: view.range,
    }, { force });

    if (!data?.ok || !Array.isArray(data.values) || data.values.length === 0) {
      outEl.innerHTML = '<div class="loading-text">Не вдалося завантажити дані.</div>';
      return;
    }

    renderTableInto(data.values, outEl, { dividers: view.dividers });
    st.loaded[viewKey] = true;
  } catch (e) {
    outEl.innerHTML = '<div class="loading-text">Помилка завантаження.</div>';
  }
}

// ---- Render Table ----
function renderTableInto(values, targetEl, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    targetEl.innerHTML = '<div class="loading-text">Немає даних</div>';
    return;
  }

  const header = values[0];
  let rows = values.slice(1);

  rows = rows.filter(r =>
    Array.isArray(r) && r.some(c => String(c ?? '').trim() !== '')
  );

  const colCount = header.length;
  const dividerCols = parseDividers(options.dividers, colCount);
  const borderStyle = '1px solid #E6EAF4';

  const cellStyle = (colIdx) =>
    dividerCols.has(colIdx + 1) ? ` style="border-right:${borderStyle};"` : '';

  const thead = '<tr>' + header.map((h, i) =>
    `<th${cellStyle(i)}>${escapeHtml(h)}</th>`
  ).join('') + '</tr>';

  const tbody = rows.map((r, rowIdx) =>
    `<tr class="${rowIdx % 2 === 1 ? 'zebra' : ''}">` + (Array.isArray(r) ? r : []).map((c, i) =>
      `<td${cellStyle(i)}>${escapeHtml(c)}</td>`
    ).join('') + '</tr>'
  ).join('');

  targetEl.innerHTML = `
    <div class="table-wrap" role="region" aria-label="Table">
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// ---- Render Content (called immediately or deferred) ----
function renderArenaContent() {
  renderTags();
  renderCards();
  setArenaState('content');
  loaded = true;
  dataReady = false;
}

// ---- Render deferred content when tab becomes active ----
export function renderArenaIfReady() {
  if (!dataReady || loaded) return;
  renderArenaContent();
  console.log('[Arena] Deferred render complete');
}

// ---- Export ----
export function isArenaLoaded() {
  return loaded;
}
