/* ============================================
   PFL App — Utilities
   Helper functions used across modules
   ============================================ */

// ---- HTML Escaping ----
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Type Normalization ----
export function normBool(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return true;
  return !['false', '0', 'no', 'off'].includes(s);
}

export function normStr(value) {
  return String(value ?? '').trim();
}

export function normNum(value, fallback = 0) {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

// ---- Text Formatting ----
export function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PF';
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase();
}

export function formatNameTwoLines(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '&nbsp;<br>&nbsp;';
  if (parts.length === 1) return `${escapeHtml(parts[0])}<br>&nbsp;`;
  return `${escapeHtml(parts[0])}<br>${escapeHtml(parts.slice(1).join(' '))}`;
}

export function formatPoints(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(/p$/i, '') + 'P';
}

export function formatPointsLabel(points) {
  const n = parseInt(points, 10);
  if (!Number.isFinite(n)) return points;
  
  const mod10 = n % 10;
  const mod100 = n % 100;
  
  let word;
  if (mod100 >= 11 && mod100 <= 14) {
    word = 'балів';
  } else if (mod10 === 1) {
    word = 'бал';
  } else if (mod10 >= 2 && mod10 <= 4) {
    word = 'бали';
  } else {
    word = 'балів';
  }
  
  return `${n} ${word}`;
}

// ---- Table Helpers ----
export function parseDividers(raw, colCount) {
  if (!raw) return new Set();
  
  const s = String(raw).trim().toLowerCase();
  if (!s) return new Set();
  
  // "every:N" shorthand
  const everyMatch = s.match(/^every:?\s*(\d+)$/);
  if (everyMatch) {
    const step = parseInt(everyMatch[1], 10);
    const result = new Set();
    for (let i = step; i <= colCount; i += step) {
      result.add(i);
    }
    return result;
  }
  
  // "3,5,7" list
  return new Set(
    s.split(',')
      .map(x => parseInt(x.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= colCount)
  );
}

// ---- DOM Helpers ----
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

export function createElement(tag, className, innerHTML) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

export function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  
  // Wrap label if not already wrapped
  if (!btn.querySelector('.btn-label')) {
    const label = createElement('span', 'btn-label', btn.textContent);
    btn.textContent = '';
    btn.appendChild(label);
  }
  
  btn.classList.toggle('is-loading', isLoading);
  btn.disabled = isLoading;
  btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

// ---- Haptic Feedback (Telegram) ----
export function haptic(type = 'light') {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(type);
  } catch (e) {
    // Haptic not available
  }
}

// ---- Debounce ----
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ---- Throttle ----
export function throttle(fn, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ---- Date/Time ----
export function formatDate(date) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

// ---- Toast Notification ----
let toastTimeout = null;
export function showToast(message = 'Оновлено ✓', duration = 2000) {
  let toast = document.getElementById('pflToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pflToast';
    toast.className = 'pfl-toast';
    document.body.appendChild(toast);
  }
  
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.remove('pfl-toast--visible', 'pfl-toast--hiding');
  
  // Force reflow for animation restart
  void toast.offsetWidth;
  toast.classList.add('pfl-toast--visible');
  
  toastTimeout = setTimeout(() => {
    toast.classList.add('pfl-toast--hiding');
    toast.addEventListener('animationend', () => {
      toast.classList.remove('pfl-toast--visible', 'pfl-toast--hiding');
    }, { once: true });
  }, duration);
}

// ---- Clipboard ----
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (e) {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// ---- Share Card ----
export function isTelegram() {
  return !!window.Telegram?.WebApp?.initData;
}

export function buildShareLink(shareParam) {
  if (isTelegram()) {
    return `https://t.me/predatorfestbot/pfl?startapp=${shareParam}`;
  }
  return `https://predatorfest.netlify.app/?startapp=${shareParam}`;
}

export const SHARE_ICON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 19V11C4 10.2044 4.3163 9.44152 4.87891 8.87892C5.44152 8.31631 6.20435 8.00001 7 8.00001H8C8.55228 8.00001 9 8.44773 9 9.00001C9 9.55229 8.55228 10 8 10H7C6.73478 10 6.48051 10.1054 6.29297 10.293C6.10543 10.4805 6 10.7348 6 11V19C6 19.2652 6.10543 19.5195 6.29297 19.707C6.48051 19.8946 6.73478 20 7 20H17C17.2652 20 17.5195 19.8946 17.707 19.707C17.8946 19.5195 18 19.2652 18 19V11C18 10.7348 17.8946 10.4805 17.707 10.293C17.5195 10.1054 17.2652 10 17 10H16C15.4477 10 15 9.55229 15 9.00001C15 8.44773 15.4477 8.00001 16 8.00001H17C17.7957 8.00001 18.5585 8.31631 19.1211 8.87892C19.6837 9.44152 20 10.2044 20 11V19C20 19.7957 19.6837 20.5585 19.1211 21.1211C18.5585 21.6837 17.7957 22 17 22H7C6.20435 22 5.44152 21.6837 4.87891 21.1211C4.3163 20.5585 4 19.7957 4 19ZM11 14V5.41407L9.70703 6.70704C9.31651 7.09757 8.68349 7.09757 8.29297 6.70704C7.90244 6.31652 7.90244 5.6835 8.29297 5.29298L11.293 2.29298L11.3691 2.22462C11.7619 1.90427 12.3409 1.92686 12.707 2.29298L15.707 5.29298C16.0976 5.6835 16.0976 6.31652 15.707 6.70704C15.3165 7.09757 14.6835 7.09757 14.293 6.70704L13 5.41407V14C13 14.5523 12.5523 15 12 15C11.4477 15 11 14.5523 11 14Z" fill="currentColor"/></svg>';

export async function shareCard(deepLink, title) {
  haptic('medium');

  // Try native Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({ title: title || 'PFL', url: deepLink });
      return;
    } catch (e) {
      // User cancelled or not supported — fallback below
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback: copy to clipboard
  const ok = await copyToClipboard(deepLink);
  showToast(ok ? 'Посилання скопійовано ✓' : 'Не вдалося скопіювати');
}
