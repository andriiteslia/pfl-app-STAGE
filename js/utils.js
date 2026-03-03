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
