// Small UI toolkit: escaping, icons, toasts, sheets, confirm dialogs.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  plans: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="m7.5 15 4-4.5 3 3L20 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/>',
  library: '<path d="M4 4.5h4v15H4zM10 4.5h4v15h-4z"/><path d="m16 5.2 3.8-1 3 14.6-3.8.9z" transform="translate(-2 .3)"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  up: '<path d="m6 14.5 6-6 6 6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  flame: '<path d="M12 21c3.9 0 7-2.8 7-6.6 0-3.1-2-5.3-3.6-7.1-.3 1.7-1.2 3-2.4 3.4C13.5 7.5 12 4.6 9.5 3c.4 2.7-.9 4.6-2.4 6.2C5.7 10.8 5 12.3 5 14.4 5 18.2 8.1 21 12 21Z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3 3 0 0 0 8 10.4M16 6h3.5v1.5a3 3 0 0 1-3.5 2.9M12 13v4M8.5 20.5h7M9.5 20.5c0-2 1-3.5 2.5-3.5s2.5 1.5 2.5 3.5"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0l-2 2.5h-3z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 20h15"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z"/>',
  repeat: '<path d="M17 3.5 20.5 7 17 10.5"/><path d="M3.5 12V10a3 3 0 0 1 3-3h14M7 20.5 3.5 17 7 13.5"/><path d="M20.5 12v2a3 3 0 0 1-3 3h-14"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  ruler: '<path d="m3.5 16.5 13-13 4 4-13 13z"/><path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5Z"/>',
  device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L15 13l5 4.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10 5-3v10l-5-3z"/>',
  grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
  google: '<path fill="#EA4335" stroke="none" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6z"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

/* ---------- Toasts ---------- */
export function toast(msg, kind = 'info', ms = 2600) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(kind === 'error' ? 'info' : kind === 'pr' ? 'trophy' : 'check')}<span>${esc(msg)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Sheets (bottom sheet on mobile, dialog on desktop) ---------- */
let sheetStack = [];
export function openSheet(html, { onMount, onClose, wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const prevFocus = document.activeElement;
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('open');
    sheetStack = sheetStack.filter((s) => s !== close);
    if (!sheetStack.length) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 220);
    onClose && onClose();
    prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
  };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) close(); });
  sheetStack.push(close);
  requestAnimationFrame(() => {
    wrap.classList.add('open');
    const f = wrap.querySelector('[autofocus]');
    if (f) f.focus();
  });
  const sheet = wrap.querySelector('.sheet');
  onMount && onMount(sheet, close);
  return close;
}
export const closeTopSheet = () => { const c = sheetStack[sheetStack.length - 1]; if (c) { c(); return true; } return false; };
export const closeAllSheets = () => { [...sheetStack].reverse().forEach((c) => c()); };

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopSheet(); });

/* ---------- Confirm ---------- */
export function confirmDialog({ title, body = '', ok, cancel, danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet(`
      <div class="sheet-body confirm">
        <h3>${esc(title)}</h3>
        ${body ? `<p class="muted">${esc(body)}</p>` : ''}
        <div class="row-actions">
          <button class="btn btn-ghost" data-sheet-close>${esc(cancel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok autofocus>${esc(ok)}</button>
        </div>
      </div>`, {
      onMount: (s, close) => s.querySelector('[data-ok]').addEventListener('click', () => { finish(true); close(); }),
      onClose: () => finish(false),
    });
  });
}

/* ---------- Prompt (single text field) ---------- */
export function promptDialog({ title, value = '', ok, cancel, placeholder = '', type = 'text' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet(`
      <form class="sheet-body confirm" data-form>
        <h3>${esc(title)}</h3>
        <input class="input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus required />
        <div class="row-actions">
          <button type="button" class="btn btn-ghost" data-sheet-close>${esc(cancel)}</button>
          <button class="btn btn-primary">${esc(ok)}</button>
        </div>
      </form>`, {
      onMount: (s, close) => {
        const inp = s.querySelector('input');
        setTimeout(() => inp.select(), 50);
        s.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); finish(inp.value.trim()); close(); });
      },
      onClose: () => finish(null),
    });
  });
}

/* ---------- Beep + vibrate (rest timer) ---------- */
let audioCtx;
export function beep(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === times - 1 ? 1175 : 880;
      const t = audioCtx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.25);
    }
  } catch { /* audio not available */ }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
}
export function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { /* ignore */ }
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
