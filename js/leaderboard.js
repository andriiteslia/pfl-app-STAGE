/* ============================================
   PFL App — Leaderboard Module
   Top 3 podium, rankings table
   ============================================ */

import { fetchLeaderboard, fetchLeaderboardConfig } from './api.js';
import { 
  $, escapeHtml, setButtonLoading, formatNameTwoLines, 
  formatPointsLabel, haptic, showToast, shareCard, buildShareLink, SHARE_ICON_SVG
} from './utils.js';

// ---- State ----
let isLoaded = false;
let isLoading = false;
let lbConfig = {};

// ---- DOM References ----
const getElements = () => ({
  container: $('#outLeaderboard'),
  card: $('.leaderboard-card'),
  subtitle: $('#subtitle-leaderboard'),
  reloadBtn: $('#reloadLeaderboard'),
  statusBadge: $('#lbStatusBadge'),
});

// ---- Initialize ----
export function initLeaderboard() {
  const { reloadBtn } = getElements();
  
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      haptic('light');
      loadLeaderboard({ force: true });
    });
  }
  
  console.log('[Leaderboard] Initialized');
}

// ---- Skeleton HTML ----
const SKELETON_HTML = `
<div class="lb-skeleton">
  <div class="lb-skel-podium-wrap">
    <div class="lb-skel-people">
      <div class="lb-skel-person p2">
        <div class="skel-w lb-skel-avatar" style="width:68px;height:68px;"></div>
        <div class="skel-w lb-skel-name1" style="width:58px;"></div>
        <div class="skel-w lb-skel-name2" style="width:44px;"></div>
        <div class="skel-w lb-skel-pts" style="width:52px;"></div>
      </div>
      <div class="lb-skel-person p1">
        <div class="skel-w lb-skel-crown"></div>
        <div class="skel-w lb-skel-avatar" style="width:80px;height:80px;"></div>
        <div class="skel-w lb-skel-name1" style="width:68px;"></div>
        <div class="skel-w lb-skel-name2" style="width:52px;"></div>
        <div class="skel-w lb-skel-pts" style="width:56px;"></div>
      </div>
      <div class="lb-skel-person p3">
        <div class="skel-w lb-skel-avatar" style="width:56px;height:56px;"></div>
        <div class="skel-w lb-skel-name1" style="width:52px;"></div>
        <div class="skel-w lb-skel-name2" style="width:40px;"></div>
        <div class="skel-w lb-skel-pts" style="width:48px;"></div>
      </div>
    </div>
    <div class="lb-skel-stands">
      <div class="skel-w lb-skel-stand s2"></div>
      <div class="skel-w lb-skel-stand s1"></div>
      <div class="skel-w lb-skel-stand s3"></div>
    </div>
  </div>
  <div class="lb-skel-table">
    ${[140,120,150,130,115,138,125].map(w => `
    <div class="lb-skel-row">
      <div class="skel lb-skel-cell" style="width:22px;height:22px;border-radius:50%;"></div>
      <div class="skel lb-skel-cell" style="width:${w}px;height:14px;"></div>
      <div class="skel lb-skel-cell" style="width:32px;height:14px;margin-left:auto;"></div>
      <div class="skel lb-skel-cell" style="width:42px;height:14px;"></div>
    </div>`).join('')}
  </div>
</div>`;

// ---- Load Data ----
export async function loadLeaderboard({ force = false } = {}) {
  const { container, card, subtitle, reloadBtn } = getElements();
  
  if (!container) return;
  if (isLoading) return;
  isLoading = true;
  
  // Show loading state
  setButtonLoading(reloadBtn, true);
  
  if (!isLoaded || force) {
    // Show skeleton
    container.innerHTML = SKELETON_HTML;
    container.classList.remove('content-fade-in');
    if (card) card.classList.remove('is-loaded');
    if (subtitle) {
      subtitle.textContent = 'Оновлюю дані Predator Fest League. Головний приз - 23 Shimano Vanquish 2500S!';
    }
  }
  
  try {
    // Load config and data in parallel
    const [configData, leaderboardData] = await Promise.all([
      fetchLeaderboardConfig({ force }),
      fetchLeaderboard({ force }),
    ]);
    
    // Parse config
    if (configData?.ok && Array.isArray(configData.values)) {
      lbConfig = parseConfig(configData.values);
      renderStatusBadge();
    }
    
    // Render leaderboard
    if (!leaderboardData?.ok || !Array.isArray(leaderboardData.values)) {
      throw new Error('Invalid data');
    }
    
    renderLeaderboard(leaderboardData.values);
    
    if (subtitle) {
      subtitle.textContent = 'Рейтинг учасників Predator Fest League. Головний приз - 23 Shimano Vanquish 2500S!';
    }
    
    // Fade-in content after skeleton
    if (container) container.classList.add('content-fade-in');
    
    if (card) card.classList.add('is-loaded');
    isLoaded = true;
    
    // Toast on force reload
    if (force) showToast('Оновлено ✓');
    
  } catch (error) {
    console.error('[Leaderboard] Load error:', error);
    
    if (subtitle) {
      subtitle.textContent = 'Помилка завантаження';
    }
    container.innerHTML = '<div class="loading-text">Не вдалося завантажити дані.</div>';
    
  } finally {
    isLoading = false;
    setButtonLoading(reloadBtn, false);
  }
}

// ---- Parse Config ----
function parseConfig(values) {
  const config = {};
  values.slice(1).forEach(row => {
    const key = String(row[0] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    const val = String(row[1] ?? '').trim();
    if (key && val) config[key] = val;
  });
  return config;
}

// ---- Render Status Badge ----
function renderStatusBadge() {
  const badge = $('#lbStatusBadge');
  if (!badge) return;
  
  const text = lbConfig.status_text || lbConfig.badge_text || lbConfig.text || '';
  if (!text) {
    badge.style.display = 'none';
    return;
  }
  
  badge.style.display = '';
  badge.textContent = text;
}

// ---- Column Detection Helpers ----
function findIdxByKeywords(headersLower, keywords) {
  if (!Array.isArray(headersLower)) return -1;
  for (let i = 0; i < headersLower.length; i++) {
    const h = String(headersLower[i] ?? '');
    if (!h) continue;
    for (const k of keywords) {
      if (h.includes(k)) return i;
    }
  }
  return -1;
}

function calcColStats(rows, colCount, sampleSize = 20) {
  const stats = Array.from({ length: colCount }, () => ({
    total: 0,
    numeric: 0,
    lenSum: 0,
  }));

  const sample = (Array.isArray(rows) ? rows : []).slice(0, sampleSize);

  for (const r of sample) {
    if (!Array.isArray(r)) continue;
    for (let i = 0; i < colCount; i++) {
      const raw = r?.[i];
      const s = String(raw ?? '').trim();
      if (!s) continue;

      const st = stats[i];
      st.total += 1;
      st.lenSum += s.length;

      // Accept commas as decimals (e.g., "14,5")
      const n = s.replace(/\s+/g, '').replace(',', '.');
      if (/^-?\d+(?:\.\d+)?$/.test(n)) {
        st.numeric += 1;
      }
    }
  }

  return stats.map(st => ({
    numRatio: st.total ? st.numeric / st.total : 0,
    avgLen: st.total ? st.lenSum / st.total : 0,
  }));
}

function isRankLikeHeader(h) {
  const s = String(h ?? '').toLowerCase();
  return (
    s === '№' ||
    s.includes('rank') ||
    s.includes('place') ||
    s.includes('пози') ||
    s.includes('місц')
  );
}

function guessPointsIdx(headersLower, colStats) {
  // Prefer numeric-heavy columns (but avoid the rank column)
  let best = -1;
  let bestScore = -1;

  for (let i = 0; i < colStats.length; i++) {
    const h = headersLower?.[i] ?? '';
    if (isRankLikeHeader(h)) continue;

    const { numRatio, avgLen } = colStats[i];
    // Points column usually: mostly numeric + short strings
    const score = numRatio * 10 - Math.min(avgLen, 12) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

function guessNameIdx(headersLower, colStats, pointsIdx) {
  // Prefer text-heavy columns with longer strings (avoid rank + points)
  let best = -1;
  let bestScore = -1;

  for (let i = 0; i < colStats.length; i++) {
    if (i === pointsIdx) continue;

    const h = headersLower?.[i] ?? '';
    if (isRankLikeHeader(h)) continue;

    const { numRatio, avgLen } = colStats[i];
    // Name column usually: not numeric + longer strings
    const score = (1 - numRatio) * 10 + Math.min(avgLen, 30) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

// ---- Render Leaderboard ----
function renderLeaderboard(values) {
  const { container } = getElements();
  if (!container) return;
  
  const header = values[0];
  const rows = values.slice(1).filter(r => 
    Array.isArray(r) && r.some(c => String(c ?? '').trim() !== '')
  );
  
  // Find column indices (robust: handles unknown header labels)
  const hLower = header.map(h => String(h ?? '').toLowerCase());
  const colStats = calcColStats(rows, header.length);

  let nameIdx = findIdxByKeywords(hLower, ['ім', 'name', 'учас', 'participant', 'angler', 'команд', 'team']);
  let pointsIdx = findIdxByKeywords(hLower, ['бал', 'point', 'points', 'score', 'pts']);

  if (pointsIdx < 0) pointsIdx = guessPointsIdx(hLower, colStats);
  if (nameIdx < 0) nameIdx = guessNameIdx(hLower, colStats, pointsIdx);

  // Final fallbacks
  if (pointsIdx < 0 || pointsIdx >= header.length) {
    pointsIdx = Math.min(2, Math.max(0, header.length - 1));
  }
  if (nameIdx < 0 || nameIdx >= header.length) {
    nameIdx = header.length > 1 ? 1 : 0;
  }
  if (nameIdx === pointsIdx && header.length > 1) {
    nameIdx = pointsIdx === 0 ? 1 : 0;
  }
  
  // Build Top 3 podium
  const top3Html = buildTop3Podium(rows, nameIdx, pointsIdx);
  
  // Build table
  const tableHtml = buildTable(header, rows);
  
  container.innerHTML = `
    ${top3Html}
    <div class="table-wrap" role="region" aria-label="2026 Leaderboard table">
      ${tableHtml}
    </div>
  `;
  
  // Re-render status badge (it's inside the podium)
  renderStatusBadge();
  
  // Trigger podium entrance animation
  const podium = container.querySelector('.top3-podium');
  if (podium) {
    podium.classList.add('podium-entrance');
    // Remove class after animations complete so Easter eggs work cleanly
    setTimeout(() => podium.classList.remove('podium-entrance'), 1200);
  }
  
  // Connect Easter eggs (crown tap, long-press 2nd place)
  initEasterEggs();
  
  // Share button
  const shareBtn = container.querySelector('.lb-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const deepLink = buildShareLink('leaderboard');
      shareCard(deepLink, 'PFL Leaderboard');
    });
  }
}

// ---- Easter Eggs ----
function initEasterEggs() {
  // 🎉 Crown tap — shakes then turns into crab, then back
  const crown = $('#tab-leaderboard .top3-crown');
  if (crown) {
    crown.addEventListener('click', () => {
      if (crown.classList.contains('crab-mode')) return;
      haptic('light');
      crown.classList.add('crab-mode');
      crown.addEventListener('animationend', () => {
        // Swap to crab
        crown.textContent = '🦀';
        
        // Swap back after delay
        setTimeout(() => {
          crown.textContent = '👑';
          crown.classList.remove('crab-mode');
        }, 2000);
      }, { once: true });
    });
  }

  // 🦀 Long-press on 2nd place — avatar shakes + crab popup
  const place2 = $('#tab-leaderboard .top3-person.place2');
  if (place2) {
    let pressTimer = null;
    const LONG_PRESS_MS = 600;

    const triggerCrab = () => {
      haptic('medium');

      // Shake avatar
      place2.classList.add('shaking');
      place2.addEventListener('animationend', () => {
        place2.classList.remove('shaking');
      }, { once: true });

      // Show crab popup
      let crab = place2.querySelector('.crab-popup');
      if (!crab) {
        crab = document.createElement('span');
        crab.className = 'crab-popup';
        crab.textContent = '🦀';
        place2.appendChild(crab);
      }

      // Reset & play pop-in
      crab.style.animation = 'none';
      void crab.offsetWidth;
      crab.style.animation = 'crabPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';

      // Pop-out after delay
      setTimeout(() => {
        crab.style.animation = 'crabPopOut 0.3s ease-in forwards';
      }, 1800);
    };

    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };

    place2.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(triggerCrab, LONG_PRESS_MS);
    }, { passive: true });

    place2.addEventListener('touchend', cancelPress, { passive: true });
    place2.addEventListener('touchmove', cancelPress, { passive: true });
    place2.addEventListener('touchcancel', cancelPress, { passive: true });
  }
}

// ---- Build Top 3 Podium ----
function buildTop3Podium(rows, nameIdx, pointsIdx) {
  const winners = rows.slice(0, 3);
  if (!winners.length) return '';
  
  const getName = (row) => formatNameTwoLines(row?.[nameIdx]);
  const getPoints = (row) => formatPointsLabel(row?.[pointsIdx]);
  
  const n1 = getName(winners[0]);
  const n2 = getName(winners[1]);
  const n3 = getName(winners[2]);
  
  const pts1 = getPoints(winners[0]);
  const pts2 = getPoints(winners[1]);
  const pts3 = getPoints(winners[2]);
  
  // Cache-bust images so updated photos always load
  const cb = `?v=${Date.now()}`;
  
  return `
    <div class="top3-podium" aria-label="Top 3 winners podium">
      <div class="top3-podium__inner">
        <div id="lbStatusBadge" class="lb-status-badge" style="display:none;"></div>
        <button class="lb-share-btn" type="button" aria-label="Share">${SHARE_ICON_SVG}</button>
        
        ${buildAquarium()}
        
        <div class="top3-people">
          <div class="top3-person place2">
            <div class="top3-avatar"><img src="./assets/imgs/podium-2.png${cb}" alt="" /></div>
            <div class="top3-name">${n2}</div>
            <div class="top3-points">${pts2}</div>
          </div>
          
          <div class="top3-person place1">
            <div class="top3-crown">👑</div>
            <div class="top3-avatar"><img src="./assets/imgs/podium-1.png${cb}" alt="" /></div>
            <div class="top3-name">${n1}</div>
            <div class="top3-points">${pts1}</div>
          </div>
          
          <div class="top3-person place3">
            <div class="top3-avatar"><img src="./assets/imgs/podium-3.png${cb}" alt="" /></div>
            <div class="top3-name">${n3}</div>
            <div class="top3-points">${pts3}</div>
          </div>
        </div>
        
        <div class="top3-stands">
          <div class="top3-stand s2"><div class="num">2</div></div>
          <div class="top3-stand s1"><div class="num">1</div></div>
          <div class="top3-stand s3"><div class="num">3</div></div>
        </div>
      </div>
    </div>
  `;
}

// ---- Build Aquarium (fish & bubbles) ----
function buildAquarium() {
  // 10 fish with varied movement: speed, depth, size, direction, delay
  // Some swim in pairs (similar y + close delays)
  const fish = [
    // === Pair 1: deep friends, same direction, close Y ===
    { e:'🐟', d:'16s',  y:'76%', del:'0s',    s:'.78', flip:1 },
    { e:'🐠', d:'17s',  y:'79%', del:'0.6s',  s:'.74', flip:1 },

    // === Solo: mid-water big cruiser ===
    { e:'🐡', d:'24s',  y:'45%', del:'4s',    s:'1.0', flip:0 },

    // === Pair 2: upper duo, chasing ===
    { e:'🐟', d:'12s',  y:'22%', del:'2s',    s:'1.08', flip:0 },
    { e:'🐠', d:'12.5s',y:'24%', del:'2.8s',  s:'1.0',  flip:0 },

    // === Solo: fast surface dart ===
    { e:'🐟', d:'9s',   y:'10%', del:'7s',    s:'1.18', flip:1 },

    // === Trio: loose mid-group ===
    { e:'🐠', d:'15s',  y:'55%', del:'5s',    s:'.90', flip:1 },
    { e:'🐟', d:'16s',  y:'58%', del:'5.8s',  s:'.85', flip:1 },
    { e:'🐡', d:'17s',  y:'52%', del:'6.5s',  s:'.82', flip:1 },

    // === Solo: deep slow drifter ===
    { e:'🐠', d:'28s',  y:'88%', del:'10s',   s:'.68', flip:0 },
  ];

  const fishHTML = fish.map(f =>
    `<span class="aqua-fish" style="--d:${f.d}; --y:${f.y}; --del:${f.del}; --s:${f.s}; --flip:${f.flip}">${f.e}</span>`
  ).join('\n      ');

  return `
    <div class="top3-aqua" aria-hidden="true">
      ${fishHTML}
      
      <span class="aqua-bubble" style="--d:4s; --x:8%; --sz:5px; --del:0s;"></span>
      <span class="aqua-bubble" style="--d:6s; --x:22%; --sz:8px; --del:1.5s;"></span>
      <span class="aqua-bubble" style="--d:5s; --x:45%; --sz:6px; --del:0.7s;"></span>
      <span class="aqua-bubble" style="--d:7s; --x:68%; --sz:9px; --del:2.8s;"></span>
      <span class="aqua-bubble" style="--d:4.5s; --x:85%; --sz:5px; --del:1s;"></span>
      <span class="aqua-bubble" style="--d:6.5s; --x:55%; --sz:7px; --del:3.5s;"></span>
      <span class="aqua-bubble" style="--d:5.5s; --x:35%; --sz:4px; --del:5s;"></span>
      
      <span class="aqua-crab" id="aquaCrab">🦀</span>
    </div>
  `;
}

// ---- Build Table ----
function buildTable(header, rows) {
  const thead = '<tr>' + header.map(h => 
    `<th>${escapeHtml(h)}</th>`
  ).join('') + '</tr>';
  
  const tbody = rows.map(row => 
    '<tr>' + header.map((_, i) => 
      `<td>${escapeHtml(row?.[i] ?? '')}</td>`
    ).join('') + '</tr>'
  ).join('');
  
  return `
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

// ---- Export state check ----
export function isLeaderboardLoaded() {
  return isLoaded;
}
