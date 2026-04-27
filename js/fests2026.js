/* ============================================
   PFL App — Fests 2026 Module
   Config-driven fest cards for 2026
   ============================================ */

import CONFIG from './config.js';
import { fetchSheetData, fetchSheetDataLive } from './api.js';
import { $, $$, escapeHtml, haptic, parseDividers, shareCard, buildShareLink, SHARE_ICON_SVG, showToast, markUpdated, restoreUpdated, yieldToMain } from './utils.js';

// ---- Config ----
const CONFIG_2026 = {
  SHEET_ID: '1BbRlP6S2OejgiCkQKdoTRqm-przP_qz1Ge17BTmnIbs',
  SHEET_NAME: 'CONFIG_2026',
  RANGE: 'A1:AF30',
};

// ---- State ----
let fests2026 = [];
const festState = new Map();
let mounted = false;
let _festConfigUpdatedAt = null;

// ---- Helpers ----
function normBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return true;
  return !['false', '0', 'no', 'off'].includes(s);
}

function normStr(v) {
  return String(v ?? '').trim();
}

function normNum(v, fallback = 0) {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

// ---- Loader UI ----
function showLoader(mode = 'loading') {
  const loader = $('#yearLoader2026');
  const loaderText = $('#yearLoader2026Text');
  const container = $('#fests2026Container');

  if (loader) {
    loader.style.display = 'flex';
    
    if (loaderText) {
      if (mode === 'empty') {
        loaderText.innerHTML = 'Поки стоїть лід, тут пусто…<br>Псс, маєш танту? а як знайду?';
      } else if (mode === 'error') {
        loaderText.innerHTML = 'Не вдалося завантажити дані.<br>Спробуйте оновити сторінку.';
      } else {
        loaderText.innerHTML = 'Зачекайте будь ласка,<br>оновлюю дані...';
      }
    }
  }

  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }

  const donation = $('#donation2026');
  if (donation) {
    donation.style.display = 'none';
  }
}

function hideLoader() {
  const loader = $('#yearLoader2026');
  const container = $('#fests2026Container');
  const donation = $('#donation2026');

  if (loader) {
    loader.style.display = 'none';
  }

  if (container) {
    container.style.display = 'block';
  }

  if (donation) {
    donation.style.display = '';
  }
}

// ---- Build Views ----
function buildViews(fest) {
  const defs = [
    { key: 'results', defaultLabel: 'Результати', rangeKey: 'resultsRange', labelKey: 'resultsLabel', dividersKey: 'resultsDividers' },
    { key: 'tours', defaultLabel: 'Тури', rangeKey: 'toursRange', labelKey: 'toursLabel', dividersKey: 'toursDividers' },
    { key: 'personal', defaultLabel: 'Особисті', rangeKey: 'personalRange', labelKey: 'personalLabel', dividersKey: 'personalDividers' },
    { key: 'teams', defaultLabel: 'Командні', rangeKey: 'teamsRange', labelKey: 'teamsLabel', dividersKey: 'teamsDividers' },
  ];

  const views = [];
  defs.forEach(d => {
    const range = normStr(fest[d.rangeKey]);
    if (!range) return;
    views.push({
      key: d.key,
      label: normStr(fest[d.labelKey]) || d.defaultLabel,
      range,
      dividers: normStr(fest[d.dividersKey]),
    });
  });

  return views;
}

function pickDefaultView(fest, views) {
  const preferred = normStr(fest.defaultView).toLowerCase();
  if (preferred && views.some(v => v.key === preferred)) return preferred;

  const order = ['results', 'personal', 'teams', 'tours'];
  const hit = order.find(k => views.some(v => v.key === k));
  return hit || views[0]?.key || 'results';
}

// ---- Load Config ----
async function loadConfig2026({ force = false } = {}) {
  // Use liveUpdate=true so the app auto-refreshes if Supabase has newer data
  const fetchFn = force ? fetchSheetData : fetchSheetDataLive;
  const data = await fetchFn({
    sheetId: CONFIG_2026.SHEET_ID,
    sheetName: CONFIG_2026.SHEET_NAME,
    range: CONFIG_2026.RANGE,
  }, { force });

  if (!data?.ok || !Array.isArray(data.values) || data.values.length < 2) {
    return [];
  }

  const headers = data.values[0].map(h => normStr(h));
  const rows = data.values.slice(1);

  const fests = rows
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
      return obj;
    })
    .filter(o => normBool(o.enabled))
    .filter(o => normStr(o.year || '2026') === '2026')
    .map(o => ({
      id: normStr(o.id),
      title: normStr(o.title),
      subtitle: normStr(o.subtitle),
      tagClass: normStr(o.tagClass),
      tagText: normStr(o.tagText),
      sheetId: normStr(o.sheetId) || CONFIG_2026.SHEET_ID,
      sheetName: normStr(o.sheetName),
      resultsRange: normStr(o.resultsRange),
      resultsDividers: normStr(o.resultsDividers),
      toursRange: normStr(o.toursRange),
      toursDividers: normStr(o.toursDividers),
      personalRange: normStr(o.personalRange),
      personalDividers: normStr(o.personalDividers),
      teamsRange: normStr(o.teamsRange),
      teamsDividers: normStr(o.teamsDividers),
      resultsLabel: normStr(o.resultsLabel),
      toursLabel: normStr(o.toursLabel),
      personalLabel: normStr(o.personalLabel),
      teamsLabel: normStr(o.teamsLabel),
      defaultView: normStr(o.defaultView),
      registerBtn: normBool(o.registerBtn) && !!normStr(o.registerBtnLink),
      registerBtnLabel: normStr(o.registerBtnLabel),
      registerBtnLink: normStr(o.registerBtnLink),
      monoBtn: normBool(o.monoBtn) && !!normStr(o.monoBtnLink),
      monoBtnLabel: normStr(o.monoBtnLabel),
      monoBtnLink: normStr(o.monoBtnLink),
      cover: normStr(o.cover),
      defaultState: normStr(o.defaultState).toLowerCase() === 'open' ? 'open' : 'closed',
      order: normNum(o.order, 999),
    }))
    .filter(o => o.id && o.sheetName);

  fests.sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
  _festConfigUpdatedAt = data.updated_at || null;
  return fests;
}

// ---- Render Card ----
function renderCard(fest) {
  const st = festState.get(fest.id);
  const views = st?.views || buildViews(fest);
  const activeKey = st?.view || pickDefaultView(fest, views);

  // Tag class mapping
  const tagClassMap = {
    'score-tag_personal': 'score-tag score-tag--personal',
    'score-tag_team': 'score-tag score-tag--team',
    'score-tag_combo': 'score-tag score-tag--combo',
  };
  const tagClass = tagClassMap[fest.tagClass] || fest.tagClass || 'score-tag score-tag--personal';

  const isOpen = st?.isOpen || false;

  // Segmented control
  const segHtml = views.length > 1
    ? `<div class="segmented-control" id="seg2026_${fest.id}" style="display:${isOpen ? 'flex' : 'none'};">
        ${views.map(v => `<button class="segment${v.key === activeKey ? ' active' : ''}" type="button" data-view="${v.key}">${escapeHtml(v.label)}</button>`).join('')}
       </div>`
    : '';

  // Output containers
  const outsHtml = views.map(v =>
    `<div id="out2026_${v.key}_${fest.id}" class="table-content${isOpen && v.key === activeKey ? '' : ' table-collapsed'}">
      <div class="loading-text">Завантажую дані…</div>
    </div>`
  ).join('');

  // Register button
  const regLink = fest.registerBtnLink;
  const regOk = fest.registerBtn && regLink && /^(https?:\/\/|tg:\/\/)/i.test(regLink);
  const registerHtml = regOk
    ? `<a class="btn register-btn" href="${escapeHtml(regLink)}" target="_blank" rel="noopener">${escapeHtml(fest.registerBtnLabel || 'Зареєструватись')}</a>`
    : '';

  // Mono button
  const monoLink = fest.monoBtnLink;
  const monoOk = fest.monoBtn && monoLink && /^(https?:\/\/|tg:\/\/)/i.test(monoLink);
  const monoHtml = monoOk
    ? `<a class="btn register-btn register-btn--mono" href="${escapeHtml(monoLink)}" target="_blank" rel="noopener">${escapeHtml(fest.monoBtnLabel || 'Оплатити')}</a>`
    : '';

  const coverHtml = fest.cover
    ? `<div class="card-cover">
        <img class="card-cover__blur" src="./assets/imgs/${escapeHtml(fest.cover)}" alt="" loading="lazy">
        <img class="card-cover__img" src="./assets/imgs/${escapeHtml(fest.cover)}" alt="" loading="lazy">
       </div>`
    : '';

  return `
    <article class="card" data-fest-id="${fest.id}">
      ${coverHtml}
      <div class="table-header" id="header2026_${fest.id}">
        <div class="table-header__text">
          <div class="card-title" style="font-weight:800;">${escapeHtml(fest.title)}</div>
          <div style="font-size:15px; color:var(--muted);">${escapeHtml(fest.subtitle)}</div>
          <div class="${tagClass}">${escapeHtml(fest.tagText)}</div>
        </div>
        <div class="table-header__actions">
          <button class="share-btn" type="button" data-share="fests__${fest.id}" aria-label="Share">${SHARE_ICON_SVG}</button>
          <div class="chevron${isOpen ? ' open' : ''}" id="chevron2026_${fest.id}">
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>
      ${registerHtml}
      ${monoHtml}
      ${segHtml}
      ${outsHtml}
    </article>
  `;
}

// ---- Init Card Interactions ----
function initCard(fest) {
  const header = $(`#header2026_${fest.id}`);
  const chevron = $(`#chevron2026_${fest.id}`);
  const segment = $(`#seg2026_${fest.id}`);

  if (!header) return;

  const st = festState.get(fest.id);

  // Header click - toggle card
  header.addEventListener('click', () => {
    st.isOpen = !st.isOpen;
    haptic('light');
    updateCardView(fest);

    if (st.isOpen && !st.loaded[st.view]) {
      loadCardData(fest, st.view);
    }
  });

  // Share button
  const shareBtn = header.querySelector('.share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const deepLink = buildShareLink(shareBtn.dataset.share);
      shareCard(deepLink, fest.title);
    });
  }

  // Segment buttons
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

        updateCardView(fest);

        if (!st.loaded[view]) {
          loadCardData(fest, view);
        }
      });
    });
  }
}

function updateCardView(fest) {
  const st = festState.get(fest.id);
  if (!st) return;

  const chevron = $(`#chevron2026_${fest.id}`);
  const segment = $(`#seg2026_${fest.id}`);

  chevron?.classList.toggle('open', st.isOpen);
  if (segment) segment.style.display = st.isOpen && st.views.length > 1 ? 'flex' : 'none';

  st.views.forEach(v => {
    const outEl = $(`#out2026_${v.key}_${fest.id}`);
    if (outEl) {
      outEl.classList.toggle('table-collapsed', !(st.isOpen && st.view === v.key));
    }
  });
}

// ---- Load Card Data ----
async function loadCardData(fest, viewKey, force = false) {
  const st = festState.get(fest.id);
  const view = st?.views?.find(v => v.key === viewKey);
  const outEl = $(`#out2026_${viewKey}_${fest.id}`);

  if (!outEl || !view) return;

  outEl.innerHTML = '<div class="loading-text">Завантажую дані…</div>';

  try {
    const fetchFn = force ? fetchSheetData : fetchSheetDataLive;
    const data = await fetchFn({
      sheetId: fest.sheetId,
      sheetName: fest.sheetName,
      range: view.range,
    }, { force });

    if (!data?.ok || !Array.isArray(data.values) || data.values.length === 0) {
      outEl.innerHTML = '<div class="loading-text">Не вдалося завантажити дані.</div>';
      return;
    }

    await renderTableInto(data.values, outEl, { dividers: view.dividers });
    st.loaded[viewKey] = true;
  } catch (e) {
    outEl.innerHTML = '<div class="loading-text">Помилка завантаження.</div>';
  }
}

// ---- Render Table ----
async function renderTableInto(values, targetEl, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    targetEl.innerHTML = '<div class="loading-text">Немає даних</div>';
    return;
  }

  const header = values[0];
  let rows = values.slice(1);

  // Filter empty rows
  rows = rows.filter(r =>
    Array.isArray(r) && r.some(c => String(c ?? '').trim() !== '')
  );

  // Filter empty columns (no header and no data)
  const colHasData = header.map((h, i) =>
    String(h ?? '').trim() !== '' || rows.some(r => String(r?.[i] ?? '').trim() !== '')
  );
  const activeCols = colHasData.reduce((acc, has, i) => { if (has) acc.push(i); return acc; }, []);

  const colCount = activeCols.length;
  const dividerCols = parseDividers(options.dividers, colCount);
  const borderStyle = '1px solid var(--border)';

  const cellStyle = (colIdx) =>
    dividerCols.has(colIdx + 1) ? ` style="border-right:${borderStyle};"` : '';

  const thead = '<tr>' + activeCols.map((ci, idx) =>
    `<th${cellStyle(idx)}>${escapeHtml(header[ci])}</th>`
  ).join('') + '</tr>';

  const tbody = rows.map(r =>
    '<tr>' + activeCols.map((ci, idx) =>
      `<td${cellStyle(idx)}>${escapeHtml(Array.isArray(r) ? r[ci] : '')}</td>`
    ).join('') + '</tr>'
  ).join('');

  await yieldToMain();

  targetEl.innerHTML = `
    <div class="table-wrap" role="region" aria-label="Table">
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// ---- Mount Fests 2026 ----
export async function mountFests2026({ force = false } = {}) {
  // Restore last-updated label immediately before async data loads
  if (!force) restoreUpdated('reload');
  const container = $('#fests2026Container');
  const panel = $('#festsYear2026');

  // Create container if doesn't exist
  if (panel && !container) {
    const newContainer = document.createElement('div');
    newContainer.id = 'fests2026Container';
    panel.appendChild(newContainer);
  }

  const containerEl = $('#fests2026Container');
  if (!containerEl) return;

  // Skip if already mounted and not forced
  if (mounted && !force && fests2026.length) return;

  showLoader('loading');

  try {
    // Load config
    if (!fests2026.length || force) {
      fests2026 = await loadConfig2026({ force });
    }

    if (!fests2026.length) {
      showLoader('empty');
      return;
    }

    // Init state
    fests2026.forEach(f => {
      if (!festState.has(f.id) || force) {
        const views = buildViews(f);
        const defView = pickDefaultView(f, views);
        const loaded = {};
        views.forEach(v => { loaded[v.key] = false; });
        festState.set(f.id, { isOpen: f.defaultState === 'open', view: defView, loaded, views });
      }
    });

    // Render cards
    containerEl.innerHTML = fests2026.map(renderCard).join('');

    await yieldToMain();

    // Init interactions
    fests2026.forEach(initCard);

    await yieldToMain();

    // Auto-load data for cards starting open
    fests2026.forEach(f => {
      const st = festState.get(f.id);
      if (st?.isOpen && !st.loaded[st.view]) {
        loadCardData(f, st.view, force);
      }
    });

    mounted = true;
    hideLoader();
    if (force) showToast('Оновлено ✓');
    markUpdated('reload', force ? undefined : _festConfigUpdatedAt);

  } catch (e) {
    console.error('[Fests2026] Mount error:', e);
    showLoader('error');
  }
}

// ---- Reset ----
export function resetFests2026() {
  fests2026 = [];
  festState.clear();
  mounted = false;
}

// ---- Live Update Listener ----
// When background fetch detects newer CONFIG_2026 data in Supabase,
// silently re-mount so users see fresh cards without manual refresh.
(function () {
  const CONFIG_CACHE_ID = `${CONFIG_2026.SHEET_ID}__${CONFIG_2026.SHEET_NAME}__${CONFIG_2026.RANGE}`;

  document.addEventListener('pflCacheUpdated', async (e) => {
    if (!mounted) return;
    const cid = e.detail?.cacheId;

    if (cid === CONFIG_CACHE_ID) {
      // CONFIG changed — full re-mount
      console.log('[Fests2026] Live update: config changed, re-mounting...');
      resetFests2026();
      await mountFests2026({ force: false });
    } else {
      // Card data changed — find and re-render the affected card view
      const affectedFest = fests2026.find(f => {
        const st = festState.get(f.id);
        if (!st) return false;
        return st.views.some(v => {
          const id = `${f.sheetId}__${f.sheetName}__${v.range}`;
          return id === cid;
        });
      });
      if (!affectedFest) return;
      const st = festState.get(affectedFest.id);
      if (st?.isOpen) {
        console.log('[Fests2026] Live update: card data changed for', affectedFest.id);
        await loadCardData(affectedFest, st.view, false);
      }
    }

    showToast('Дані оновлено ✓');
    markUpdated('reload');
  });
}());
