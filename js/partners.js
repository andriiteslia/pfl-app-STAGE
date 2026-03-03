/* ============================================
   PFL App — Partners Module
   Partner details view with back navigation
   ============================================ */

import { $, $$, haptic, copyToClipboard } from './utils.js';

// ---- State ----
let currentView = 'list'; // 'list' | 'details'

// ---- DOM References ----
const getElements = () => ({
  listView: $('#partnersListView'),
  detailsView: $('#partnerDetailsView'),
  detailsLogo: $('#partnerDetailsLogo'),
  detailsLogoImg: $('#partnerDetailsLogoImg'),
  detailsTitle: $('#partnerDetailsTitle'),
  detailsSubtitle: $('#partnerDetailsSubtitle'),
  detailsCta: $('#partnerDetailsCta'),
  detailsSecondaryWrap: $('#partnerDetailsSecondaryWrap'),
  detailsSecondaryCta: $('#partnerDetailsSecondaryCta'),
  detailsPromoWrap: $('#partnerDetailsPromoWrap'),
  detailsPromoCode: $('#partnerDetailsPromoCode'),
  detailsPromoCopy: $('#partnerDetailsPromoCopy'),
  detailsInfo: $('#partnerDetailsInfo'),
  fabBack: $('#fabBack'),
});

// ---- Partner Data (extended info) ----
const PARTNER_DATA = {
  upstream: {
    title: 'Upstream',
    subtitle: '💥 UPSTREAM Baits — це приманки, створені для реальних рибалок: їстівні силіконові приманки, протестовані профі й ефективні в ловлі хижої риби 🐟 — щуки, судака, окуня як у прісній, так і солоній воді 🛶. Надійний вибір для тих, хто цінує результат замість випадковості 🎯📈',
    info: '📦 Онлайн-замовлення цілодобово.<br>🕘 Пн – Пт з 10:00 до 18:00<br>📱 Телефон: +38 (067) 13 13 110',
    ctaText: 'В магазин 🐟',
    ctaHref: 'https://upstreambaits.com/shop/',
    instagram: 'https://www.instagram.com/upstreambaits/',
    logoBg: '#000000',
  },
  m5craft: {
    title: 'M5Craft & Megaklev',
    subtitle: 'M5Craft — авторські приманки від чемпіонів України, які прекрасно ловлять всю рибу в наших водоймах. MegaKlev — це все для риболовлі в одному місці: від приманок і снастей до зимового обладнання, аксесуарів і тур-товарів 🎣🧰.<br>Знижка за промокодом діє на весь силікон M5Craft (вказуйте його в коментарі до замовлення)',
    info: '📦 Онлайн-замовлення цілодобово.<br>🕘 Пн – Пт з 9:00-18:00, Сб з 9:00-15:00<br>📱 Телефон: +38 (099) 110 37 06, +38 (096) 250 67 17',
    ctaText: 'В магазин 🐟',
    ctaHref: 'https://megaklev.com.ua/m5craft',
    instagram: 'https://www.instagram.com/megaklev.com.ua',
    logoBg: '#020102',
    promo: 'PFL2026_10',
  },
  crazyfish: {
    title: 'Crazy Fish',
    subtitle: '🎣 Crazy Fish — це магазин і бренд рибальських товарів з величезним асортиментом спінінгів, воблерів, силікону, одягу та аксесуарів для риболовлі 🎒🪝. Тут знайдеться все для активного лову на будь-який стиль та вид риби — від початківця до про-рибака 🐠📦',
    info: '📦 Онлайн-замовлення цілодобово.<br>🕘 Пн – Пт з 09:00 до 18:00<br>📱 Телефон: +380 800 333 271',
    ctaText: 'В магазин 🐟',
    ctaHref: 'https://crazyfish.com.ua/ua/',
    instagram: 'https://www.instagram.com/crazy_fish_official/',
    logoBg: '#DF127B',
  },
  themain: {
    title: 'The Main Barbershop',
    subtitle: '💈 The Main Barbershop 💈 — це атмосфера стилю та впевненості для справжнього чоловічого образу. Професійні майстри, сучасні стрижки й гоління та увага до деталей, що підкреслюють твій характер.',
    info: '📍 Адреса: Львів, вул. Порохова, 20Б<br>🕘 Працюємо щодня: 09:00–20:00<br>📱 Телефон: +38 (077) 172 00 00',
    ctaText: 'Записатись 🔥',
    ctaHref: 'https://n1385595.alteg.io/',
    secondaryCta: 'В instagram 📸',
    secondaryHref: 'https://www.instagram.com/the_main_barbershop/',
    instagram: 'https://www.instagram.com/the_main_barbershop/',
    logoBg: '#000000',
  },
};

// ---- Edge Swipe Back Gesture ----
const EDGE_ZONE = 28;         // px from left edge to start tracking
const SWIPE_THRESHOLD = 80;   // px to trigger back
const SWIPE_MAX_Y = 60;       // max vertical drift before cancelling

let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;

function initEdgeSwipe() {
  const scroller = document.getElementById('app-wrap');
  if (!scroller) return;

  scroller.addEventListener('touchstart', (e) => {
    if (currentView !== 'details') return;
    const touch = e.touches[0];
    if (touch.clientX <= EDGE_ZONE) {
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
      isSwiping = true;
    }
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    const dy = Math.abs(touch.clientY - swipeStartY);
    if (dy > SWIPE_MAX_Y) {
      isSwiping = false;
    }
  }, { passive: true });

  scroller.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeStartX;
    if (dx >= SWIPE_THRESHOLD) {
      haptic('light');
      closePartnerDetails();
    }
  }, { passive: true });
}

// ---- Initialize ----
export function initPartners() {
  const tiles = $$('.partner-tile');
  const { fabBack } = getElements();

  // Click on tile -> open details
  tiles.forEach(tile => {
    tile.addEventListener('click', (e) => {
      // Don't open details if clicking on link-btn
      if (e.target.closest('.link-btn')) return;
      
      haptic('light');
      openPartnerDetails(tile);
    });
  });

  // FAB back button
  if (fabBack) {
    fabBack.addEventListener('click', () => {
      if (currentView !== 'details') return;
      haptic('light');
      closePartnerDetails();
    });
  }

  // Telegram BackButton
  bindTelegramBackButton();

  // Edge swipe gesture
  initEdgeSwipe();

  console.log('[Partners] Initialized');
}

// ---- Open Partner Details ----
function openPartnerDetails(tile) {
  const els = getElements();
  if (!els.listView || !els.detailsView) return;

  const partnerId = tile.dataset.partner;
  const data = PARTNER_DATA[partnerId] || {};

  // Get info from tile
  const logoWrap = tile.querySelector('.partner-tile__logo');
  const logoImg = tile.querySelector('.partner-tile__logo img');
  const titleEl = tile.querySelector('.partner-title');
  const defaultTitle = titleEl?.textContent?.trim() || 'Partner';

  // Set title
  els.detailsTitle.textContent = data.title || defaultTitle;

  // Set subtitle (use HTML for line breaks)
  els.detailsSubtitle.innerHTML = data.subtitle || '';

  // Set info
  if (els.detailsInfo) {
    els.detailsInfo.innerHTML = data.info || '';
  }

  // Set CTA
  els.detailsCta.textContent = data.ctaText || 'Перейти';
  els.detailsCta.href = data.ctaHref || '#';

  // Set secondary CTA (Instagram)
  if (els.detailsSecondaryWrap && els.detailsSecondaryCta) {
    if (data.secondaryCta || data.instagram) {
      els.detailsSecondaryWrap.style.display = 'flex';
      els.detailsSecondaryCta.textContent = data.secondaryCta || 'В instagram 📸';
      els.detailsSecondaryCta.href = data.secondaryHref || data.instagram || '#';
    } else {
      els.detailsSecondaryWrap.style.display = 'none';
    }
  }

  // Set promo code
  if (els.detailsPromoWrap) {
    if (data.promo) {
      els.detailsPromoWrap.style.display = 'flex';
      if (els.detailsPromoCode) {
        els.detailsPromoCode.textContent = data.promo;
      }
      // Wire copy button
      if (els.detailsPromoCopy) {
        els.detailsPromoCopy.onclick = () => handlePromoCopy(data.promo);
      }
    } else {
      els.detailsPromoWrap.style.display = 'none';
    }
  }

  // Set logo
  if (logoImg?.src) {
    els.detailsLogoImg.src = logoImg.src;
    els.detailsLogoImg.alt = data.title || defaultTitle;
    els.detailsLogoImg.style.display = 'block';
  } else {
    els.detailsLogoImg.style.display = 'none';
  }

  // Set logo background
  if (els.detailsLogo && data.logoBg) {
    els.detailsLogo.style.background = data.logoBg;
  } else if (els.detailsLogo && logoWrap) {
    try {
      const bg = window.getComputedStyle(logoWrap).backgroundColor;
      if (bg) els.detailsLogo.style.background = bg;
    } catch (e) {}
  }

  // Switch views with animation
  els.listView.style.display = 'none';
  els.detailsView.style.display = 'block';
  els.detailsView.classList.add('slide-in');
  currentView = 'details';

  // Show FAB back
  if (els.fabBack) {
    els.fabBack.classList.add('visible');
  }

  // Show Telegram BackButton
  showTelegramBackButton(true);

  // Scroll to top
  const scroller = $('#app-wrap');
  if (scroller) scroller.scrollTop = 0;

  // Add body class
  document.body.classList.add('partners-details-open');
}

// ---- Close Partner Details ----
export function closePartnerDetails() {
  const els = getElements();
  if (!els.listView || !els.detailsView) return;

  els.detailsView.style.display = 'none';
  els.detailsView.classList.remove('slide-in');
  els.listView.style.display = 'block';
  currentView = 'list';

  // Hide FAB back
  if (els.fabBack) {
    els.fabBack.classList.remove('visible');
  }

  // Hide Telegram BackButton
  showTelegramBackButton(false);

  // Remove body class
  document.body.classList.remove('partners-details-open');
}

// ---- Handle Promo Copy ----
async function handlePromoCopy(code) {
  const els = getElements();
  
  await copyToClipboard(code);
  haptic('success');

  // Visual feedback via CSS class (icons swap automatically)
  const block = els.detailsPromoCopy?.closest('.partner-promo');
  const label = block?.querySelector('.partner-promo__label');
  const copyText = els.detailsPromoCopy?.querySelector('.partner-promo__copy-text');
  const prevLabel = label?.textContent || '';
  const prevCopyText = copyText?.textContent || '';

  if (block) block.classList.add('is-copied');
  if (label) label.textContent = 'Скопійовано ✓';
  if (copyText) copyText.textContent = 'Готово';

  setTimeout(() => {
    if (block) block.classList.remove('is-copied');
    if (label) label.textContent = prevLabel;
    if (copyText) copyText.textContent = prevCopyText;
  }, 2500);
}

// ---- Telegram BackButton ----
function showTelegramBackButton(show) {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton) {
      if (show) {
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    }
  } catch (e) {}
}

function bindTelegramBackButton() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton?.onClick) {
      tg.BackButton.onClick(() => {
        if (currentView === 'details') {
          closePartnerDetails();
        }
      });
    }
  } catch (e) {}
}

// ---- Check if details open ----
export function isPartnerDetailsOpen() {
  return currentView === 'details';
}
