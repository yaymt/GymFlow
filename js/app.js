import { createStore, isCloud, uid, authErrorKey } from './store.js';
import { EXERCISES, TEMPLATES, MUSCLES, MEASURE_KEYS, GROUPS, LEG_MUSCLES, CARDIO_EXTRAS, inGroup } from './data.js';
import { T } from './i18n.js';
import { MEDIA, MEDIA_BASE } from './exmedia.js';
import { esc, icon, toast, openSheet, closeAllSheets, confirmDialog, promptDialog, beep, unlockAudio, download } from './ui.js';
import { lineChart, barChart, hBars, sparkline, barbell, plateStack, chartSlot, mountCharts, resetCharts } from './charts.js';

const VERSION = '1.3.1';

/* =========================================================
   State
   ========================================================= */
const S = {
  user: null, loaded: false,
  profile: {}, plans: [], workouts: [], bodyweight: [], measurements: [], exercises: [],
  active: null,
  ui: { histMonth: null, exFilter: 'all', exSearch: '', progMetric: 'e1rm', authTab: 'in' },
};
let store;

const PREF_KEY = 'gymflow:prefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } })();
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

const lang = () => S.profile.lang || prefs.lang || 'ar';
const SEP = () => (lang() === 'ar' ? '، ' : ', ');
export const t = (key, vars) => {
  let s = (T[lang()] && T[lang()][key]) ?? T.en[key] ?? key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(v); });
  return s;
};
const locale = () => (lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

/* =========================================================
   Units, dates, numbers
   ========================================================= */
const LB = 2.20462;
const unit = () => S.profile.units || 'kg';
const uLabel = () => t('u_' + unit());
const toDisp = (kg) => (unit() === 'lb' ? kg * LB : kg);
const fromDisp = (v, u = unit()) => (u === 'lb' ? v / LB : v);
const r1 = (n) => Math.round(n * 10) / 10;
const fmtNum = (n) => (n == null || isNaN(n) ? '–' : r1(n).toLocaleString('en-US', { maximumFractionDigits: 1 }));
const fmtW = (kg, withUnit = true) => (kg == null || isNaN(kg) ? '–' : fmtNum(toDisp(kg)) + (withUnit ? ' ' + uLabel() : ''));
const fmtVol = (kg) => {
  const v = toDisp(kg);
  return (v >= 10000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(v).toLocaleString('en-US')) + ' ' + uLabel();
};
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); return isNaN(n) ? null : n; };

const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString(locale(), o);
const fmtDur = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
};
const fmtDurShort = (sec) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? t('dur_hm', { h: Math.floor(m / 60), m: m % 60 }) : t('dur_m', { m });
};
const weekStartDay = () => (S.profile.weekStart ?? 0);
const startOfWeek = (d = new Date()) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() - weekStartDay() + 7) % 7));
  return x;
};
const dayName = (i, style = 'short') => new Date(2024, 0, 7 + i).toLocaleDateString(locale(), { weekday: style }); // 2024-01-07 is Sunday

/* =========================================================
   Exercises
   ========================================================= */
const BUILTIN = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
const getEx = (id) => BUILTIN[id] || S.exercises.find((e) => e.id === id) || { id, en: id, ar: id, name: t('unknown_ex'), muscle: 'full', equip: 'other', type: 'weight' };
const exName = (e) => (typeof e === 'string' ? exName(getEx(e)) : e.builtin ? (lang() === 'ar' ? e.ar : e.en) : (e.name || (lang() === 'ar' ? e.ar : e.en)));
const allExercises = () => [...EXERCISES, ...S.exercises.map((e) => ({ ...e, builtin: false }))];
const exType = (id) => getEx(id).type || 'weight';
const isLoad = (type) => type === 'weight' || type === 'bodyweight' || type === 'carry';

// How each exercise type is logged. 'cardio' has no sets/reps/rest: minutes (r) + distance (w) + one optional extra (x).
const cardioDef = (exId) => { const e = getEx(exId); return { dist: e.dist === undefined ? 'km' : e.dist, extra: e.extra || null }; };
const distLabel = (d) => (d === 'm' ? t('m_short') : d === 'floors' ? t('floors') : t('km'));
const extraName = (k) => (CARDIO_EXTRAS[k] ? CARDIO_EXTRAS[k][lang()] : k);
const extraLabel = (k) => extraName(k) + (CARDIO_EXTRAS[k]?.unit ? ` ${CARDIO_EXTRAS[k].unit}` : '');
const extraText = (k, v) => `${extraName(k)} ${fmtNum(v)}${CARDIO_EXTRAS[k]?.unit || ''}`;
const colsFor = (exId) => {
  const type = exType(exId);
  if (type === 'weight') return [{ f: 'w', l: uLabel() }, { f: 'r', l: t('reps') }];
  if (type === 'bodyweight') return [{ f: 'w', l: '+' + uLabel() }, { f: 'r', l: t('reps') }];
  if (type === 'time') return [{ f: 'r', l: t('sec') }];
  if (type === 'carry') return [{ f: 'w', l: uLabel() }, { f: 'r', l: t('m_short') }];
  const c = cardioDef(exId);
  return [{ f: 'r', l: t('min') }, ...(c.dist ? [{ f: 'w', l: distLabel(c.dist) }] : []), ...(c.extra ? [{ f: 'x', l: extraLabel(c.extra) }] : [])];
};
// What a plan item asks for, e.g. "4×8", "30 min", "3×45s"
const targetText = (it) => {
  const type = exType(it.exId), reps = esc(it.reps || '');
  if (type === 'cardio') return reps ? `${reps} ${t('min_short')}` : '';
  if (type === 'time') return `${it.sets}×${reps}${t('sec_short')}`;
  if (type === 'carry') return `${it.sets}×${reps}${t('m_short')}`;
  return `${it.sets}×${reps}`;
};
const itemDefaults = (exId) => {
  const type = exType(exId);
  return type === 'cardio' ? { sets: 1, reps: '30' } : type === 'time' ? { sets: 3, reps: '45' } : type === 'carry' ? { sets: 3, reps: '30' } : type === 'bodyweight' ? { sets: 3, reps: '10-15' } : { sets: 3, reps: '8-12' };
};

const e1rm = (w, r) => (!w || !r ? 0 : r === 1 ? w : w * (1 + r / 30));

/* =========================================================
   Workout analytics
   ========================================================= */
const sortedWorkouts = () => [...S.workouts].sort((a, b) => (b.start || 0) - (a.start || 0));
const workoutVolume = (w) => (w.exercises || []).reduce((sum, e) => exType(e.exId) === 'weight'
  ? sum + (e.sets || []).reduce((s, x) => s + (x.w || 0) * (x.r || 0), 0) : sum, 0);
const workoutSets = (w) => (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);

// Best-of stats for types that are not weight × reps
function otherCells(type, b, exId) {
  const cell = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  if (type === 'cardio') {
    const c = cardioDef(exId);
    return cell(t('met_mins'), `${b.reps} ${t('min_short')}`) + (c.dist ? cell(t('met_dist'), `${fmtNum(b.weight)} ${distLabel(c.dist)}`) : '');
  }
  if (type === 'carry') return cell(t('heaviest'), fmtW(b.weight)) + cell(t('met_meters'), `${b.reps} ${t('m_short')}`);
  if (type === 'time') return cell(t('met_secs'), `${b.reps} ${t('sec_short')}`);
  return cell(t('most_reps'), b.reps);
}
const otherGrid = (type, b, exId) => `<div class="pr-grid"><div><small>${t('sessions')}</small><b>${b.sessions}</b></div>${otherCells(type, b, exId)}</div>`;

function bestsFor(exId, excludeId, before = Infinity) {
  const b = { weight: 0, e1rm: 0, reps: 0, vol: 0, sessions: 0, last: null };
  for (const w of S.workouts) {
    if (w.id === excludeId || (w.start || 0) >= before) continue;
    for (const e of w.exercises || []) {
      if (e.exId !== exId) continue;
      b.sessions++;
      if (!b.last || w.start > b.last) b.last = w.start;
      let vol = 0;
      for (const s of e.sets || []) {
        b.weight = Math.max(b.weight, s.w || 0);
        b.e1rm = Math.max(b.e1rm, e1rm(s.w || 0, s.r || 0));
        b.reps = Math.max(b.reps, s.r || 0);
        vol += (s.w || 0) * (s.r || 0);
      }
      b.vol = Math.max(b.vol, vol);
    }
  }
  return b;
}

function lastSetsFor(exId, excludeId, before = Infinity) {
  for (const w of sortedWorkouts()) {
    if (w.id === excludeId || (w.start || 0) >= before) continue;
    const e = (w.exercises || []).find((x) => x.exId === exId);
    if (e && e.sets && e.sets.length) return e.sets;
  }
  return null;
}

function weekCounts(weeks = 12) {
  const out = [];
  const now = startOfWeek();
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(now); s.setDate(s.getDate() - i * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    const ws = S.workouts.filter((w) => w.start >= s.getTime() && w.start < e.getTime());
    out.push({ start: s, count: ws.length, volume: ws.reduce((a, w) => a + workoutVolume(w), 0) });
  }
  return out;
}

function goalStreak() {
  const goal = S.profile.weeklyGoal || 4;
  const weeks = weekCounts(104).reverse(); // [current, last, ...]
  let streak = 0;
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].count >= goal) streak++;
    else if (i === 0) continue; // current week still in progress
    else break;
  }
  return streak;
}

function recentPRs(limit = 5) {
  const list = [];
  for (const w of sortedWorkouts()) {
    for (const p of w.prs || []) list.push({ ...p, date: w.start, wid: w.id });
    if (list.length >= limit) break;
  }
  return list.slice(0, limit);
}

/* =========================================================
   Persistence helpers
   ========================================================= */
const saveErr = (err) => { console.error(err); toast(t('err_save'), 'error'); };
const persist = (col, obj) => { store.put(col, obj).catch(saveErr); };
const unpersist = (col, id) => { store.remove(col, id).catch(saveErr); };
let profileTimer;
const saveProfile = () => { clearTimeout(profileTimer); profileTimer = setTimeout(() => store.setProfile(S.profile).catch(saveErr), 300); };

const activeKey = () => `gymflow:active:${S.user ? S.user.uid : 'x'}`;
const loadActive = () => { try { S.active = JSON.parse(localStorage.getItem(activeKey())); } catch { S.active = null; } };
let activeTimer;
const saveActive = (now = false) => {
  clearTimeout(activeTimer);
  const doit = () => (S.active ? localStorage.setItem(activeKey(), JSON.stringify(S.active)) : localStorage.removeItem(activeKey()));
  now ? doit() : (activeTimer = setTimeout(doit, 250));
};

/* =========================================================
   Theme & language
   ========================================================= */
const mq = window.matchMedia('(prefers-color-scheme: light)');
function applyAppearance() {
  const theme = S.profile.theme || prefs.theme || 'dark';
  const resolved = theme === 'auto' ? (mq.matches ? 'light' : 'dark') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.style = S.profile.style || prefs.style || 'classic';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || (resolved === 'light' ? '#E9EDF0' : '#16212A'));
  document.documentElement.lang = lang();
  document.documentElement.dir = lang() === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app_name');
}
mq.addEventListener?.('change', () => applyAppearance());

/* =========================================================
   Rest timer (global)
   ========================================================= */
const REST_KEY = 'gymflow:rest';
const R = { end: 0, total: 0, tick: null };
function startRest(sec) {
  unlockAudio();
  R.total = sec; R.end = Date.now() + sec * 1000;
  localStorage.setItem(REST_KEY, JSON.stringify({ end: R.end, total: R.total }));
  runRest();
}
function stopRest() {
  R.end = 0; clearInterval(R.tick); R.tick = null;
  localStorage.removeItem(REST_KEY);
  const bar = document.getElementById('restbar');
  if (bar) bar.classList.remove('show');
}
function adjustRest(d) {
  if (!R.end) return;
  R.end = Math.max(Date.now() + 1000, R.end + d * 1000); R.total = Math.max(R.total + d, 5);
  localStorage.setItem(REST_KEY, JSON.stringify({ end: R.end, total: R.total }));
  drawRest();
}
function drawRest() {
  const bar = document.getElementById('restbar');
  if (!bar) return;
  const left = Math.max(0, Math.ceil((R.end - Date.now()) / 1000));
  bar.classList.add('show');
  // Build the markup once and only update the moving parts, so a tap on a
  // button is never lost to the 250 ms redraw replacing it mid-click.
  if (!bar.querySelector('.rest-time')) {
    bar.innerHTML = `
      <div class="rest-fill"></div>
      <span class="rest-label">${icon('timer')} ${t('rest')}</span>
      <span class="rest-time"></span>
      <span class="rest-ctl">
        <button class="chip" dir="ltr" data-act="rest-adj" data-d="-15">−15</button>
        <button class="chip" dir="ltr" data-act="rest-adj" data-d="15">+15</button>
        <button class="chip chip-solid" data-act="rest-skip">${t('skip')}</button>
      </span>`;
  }
  bar.querySelector('.rest-fill').style.transform = `scaleX(${R.total ? left / R.total : 0})`;
  bar.querySelector('.rest-time').textContent = fmtDur(left);
  if (left <= 0) {
    stopRest();
    beep();
    toast(t('rest_done'), 'success');
  }
}
function runRest() {
  clearInterval(R.tick);
  drawRest();
  R.tick = setInterval(drawRest, 250);
}
(() => { try { const r = JSON.parse(localStorage.getItem(REST_KEY)); if (r && r.end > Date.now()) { R.end = r.end; R.total = r.total; } } catch { /* ignore */ } })();

/* =========================================================
   Wake lock while training
   ========================================================= */
let wakeLock = null;
async function setWake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && route().name === 'log' && S.active) setWake(true); });

/* =========================================================
   Router + shell
   ========================================================= */
const route = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: parts[0] || 'home', a: parts[1] ? decodeURIComponent(parts[1]) : null, b: parts[2] ? decodeURIComponent(parts[2]) : null };
};
const go = (path) => { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; };

const NAV = [
  ['home', 'home', 'nav_home'],
  ['plans', 'plans', 'nav_plans'],
  ['log', 'dumbbell', 'nav_train'],
  ['history', 'calendar', 'nav_history'],
  ['progress', 'chart', 'nav_progress'],
];
const MORE = [
  ['body', 'scale', 'nav_body'],
  ['exercises', 'library', 'nav_exercises'],
  ['tools', 'tools', 'nav_tools'],
  ['settings', 'settings', 'nav_settings'],
];
const navGroup = (r) => ({ workout: 'history', plan: 'plans' }[r] || r);

function shell() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <aside class="rail">
      <a class="brand" href="#/home">${brandMark()}<span>${t('app_name')}</span></a>
      <nav class="rail-nav">
        ${[...NAV, ...MORE].map(([r, ic, k]) => `<a href="#/${r}" data-nav="${r}">${icon(ic)}<span>${t(k)}</span></a>`).join('')}
      </nav>
      <div class="rail-foot">
        <div class="who">${icon(isCloud ? 'cloud' : 'device')}<span>${esc(S.profile.name || S.user.email || t('athlete'))}</span></div>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar" id="topbar"></header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="${t('nav_main')}">
      ${NAV.map(([r, ic, k]) => `<a href="#/${r}" data-nav="${r}" class="${r === 'log' ? 'tab-train' : ''}">${r === 'log' ? `<span class="train-dot">${icon(ic)}</span>` : icon(ic)}<span>${t(k)}</span></a>`).join('')}
    </nav>
    <div id="restbar" class="restbar" aria-live="polite"></div>`;
}

const brandMark = () => `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7" width="5" height="18" rx="1.6" fill="var(--plate-red)"/><rect x="9" y="10" width="3.5" height="12" rx="1.2" fill="var(--plate-yellow)"/><rect x="12.5" y="14.6" width="7" height="2.8" rx="1" fill="currentColor"/><rect x="19.5" y="10" width="3.5" height="12" rx="1.2" fill="var(--plate-blue)"/><rect x="24" y="7" width="5" height="18" rx="1.6" fill="var(--plate-green)"/></svg>`;

// Ribbon bow for the "rose" style (shown above the user's name on Home)
const bowSvg = () => `<svg class="bow" viewBox="0 0 64 44" aria-hidden="true">
  <path class="bow-tail" d="M29 23 21 41l5.5-2.6L30 43l3-19z"/>
  <path class="bow-tail" d="M35 23l8 18-5.5-2.6L34 43l-3-19z"/>
  <path class="bow-loop" d="M32 21C25 9 11 3 5.5 8.5 1 13 2.5 26 10 29.5 17 32.5 26 27 32 21z"/>
  <path class="bow-loop" d="M32 21c7-12 21-18 26.5-12.5C63 13 61.5 26 54 29.5 47 32.5 38 27 32 21z"/>
  <path class="bow-fold" d="M30 20C24 13 15 9 10.5 11.5 8 13 8.5 19 12 22"/>
  <path class="bow-fold" d="M34 20c6-7 15-11 19.5-8.5 2.5 1.5 2 7.5-1.5 10.5"/>
  <rect class="bow-knot" x="27" y="15" width="10" height="12" rx="4"/>
  <path class="bow-shine" d="M9 13.5c2-2.5 6-2.8 9.5-1.4"/>
</svg>`;

let elapsedTick = null;
function render() {
  closeAllSheets();
  clearInterval(elapsedTick);
  if (!S.user) return renderAuth();
  if (!S.loaded) return;
  if (!document.querySelector('.main-col')) shell();
  const r = route();
  resetCharts();
  const fn = VIEWS[r.name] || VIEWS.home;
  const v = fn(r) || {};
  const top = document.getElementById('topbar');
  top.innerHTML = `
    ${v.back ? `<a class="icon-btn" href="#/${v.back}" aria-label="${t('back')}">${icon(lang() === 'ar' ? 'right' : 'left')}</a>` : `<span class="brand brand-top">${brandMark()}</span>`}
    <h1 class="top-title">${esc(v.title || '')}</h1>
    <div class="top-actions">${v.actions || ''}<button class="icon-btn more-btn" data-act="more" aria-label="${t('more')}">${icon('menu')}</button></div>`;
  const view = document.getElementById('view');
  view.innerHTML = v.html || '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navGroup(r.name)));
  document.querySelector('.tabbar')?.classList.toggle('training', !!S.active);
  setWake(r.name === 'log' && !!S.active);
  if (R.end) runRest();
  mountCharts(view);
  v.after && v.after(view);
}

let resizeT;
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 30) { lastW = window.innerWidth; const v = document.getElementById('view'); if (v) mountCharts(v); } }, 200);
});

/* =========================================================
   AUTH SCREEN
   ========================================================= */
function renderAuth() {
  const root = document.getElementById('app');
  const tab = S.ui.authTab;
  const visual = `<div class="auth-visual">
      <div class="auth-brand">${brandMark()}<span>${t('app_name')}</span></div>
      <div class="auth-bar">${barbell(5, 6)}</div>
      <h1>${t('auth_headline')}</h1>
      <p>${t('auth_sub')}</p>
      <ul class="auth-points">
        <li>${icon('plans')}${t('auth_p1')}</li>
        <li>${icon('chart')}${t('auth_p2')}</li>
        <li>${icon('timer')}${t('auth_p3')}</li>
      </ul>
    </div>`;
  const langToggle = `<button class="chip auth-lang" data-act="auth-lang">${icon('globe')}${lang() === 'ar' ? 'English' : 'العربية'}</button>`;

  if (!isCloud) {
    root.innerHTML = `<div class="auth">${visual}
      <div class="auth-panel">${langToggle}
        <form class="auth-form" data-form="local-start">
          <h2>${t('local_title')}</h2>
          <p class="notice">${icon('device')}<span>${t('local_notice')}</span></p>
          <label class="field"><span>${t('your_name')}</span><input class="input" name="name" autocomplete="nickname" placeholder="${t('name_ph')}" /></label>
          <button class="btn btn-primary btn-lg">${t('start_now')}</button>
          <p class="muted small">${t('local_hint')}</p>
        </form>
      </div></div>`;
    return;
  }
  root.innerHTML = `<div class="auth">${visual}
    <div class="auth-panel">${langToggle}
      <div class="seg auth-tabs" role="tablist">
        <button role="tab" class="${tab === 'in' ? 'on' : ''}" data-act="auth-tab" data-tab="in">${t('sign_in')}</button>
        <button role="tab" class="${tab === 'up' ? 'on' : ''}" data-act="auth-tab" data-tab="up">${t('sign_up')}</button>
      </div>
      <form class="auth-form" data-form="auth">
        ${tab === 'up' ? `<label class="field"><span>${t('your_name')}</span><input class="input" name="name" autocomplete="name" required placeholder="${t('name_ph')}"/></label>` : ''}
        <label class="field"><span>${t('email')}</span><input class="input" name="email" type="email" autocomplete="email" required dir="ltr"/></label>
        <label class="field"><span>${t('password')}</span><input class="input" name="pw" type="password" autocomplete="${tab === 'up' ? 'new-password' : 'current-password'}" minlength="6" required dir="ltr"/></label>
        <p class="form-err" role="alert"></p>
        <button class="btn btn-primary btn-lg">${tab === 'up' ? t('create_account') : t('sign_in')}</button>
        ${tab === 'in' ? `<button type="button" class="link-btn" data-act="auth-reset">${t('forgot')}</button>` : ''}
        <div class="or"><span>${t('or')}</span></div>
        <button type="button" class="btn btn-ghost btn-lg" data-act="auth-google">${icon('google')}${t('google')}</button>
        <p class="muted small center">${icon('cloud')} ${t('cloud_notice')}</p>
      </form>
    </div></div>`;
}

/* =========================================================
   VIEWS
   ========================================================= */
const VIEWS = {};
const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
const empty = (ic, title, body, action = '') => `<div class="empty">${icon(ic)}<h3>${title}</h3><p>${body}</p>${action}</div>`;
const activePlan = () => S.plans.find((p) => p.active) || null;

/* ---------- HOME ---------- */
VIEWS.home = () => {
  const now = new Date();
  const goal = S.profile.weeklyGoal || 4;
  const ws = startOfWeek(now);
  const weekW = S.workouts.filter((w) => w.start >= ws.getTime());
  const done = weekW.length;
  const hour = now.getHours();
  const greet = hour < 12 ? t('greet_morning') : hour < 18 ? t('greet_day') : t('greet_evening');
  // The bow (rose style only, via CSS) sits above the name, or above the greeting if no name is set
  const greetHtml = S.profile.name
    ? `${greet}${SEP()}<span class="uname">${bowSvg()}${esc(S.profile.name)}</span>`
    : `<span class="uname">${bowSvg()}${greet}</span>`;

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
  const strip = days.map((d) => {
    const k = dateKey(d), has = S.workouts.some((w) => w.date === k), today = k === dateKey(now);
    return `<span class="wd ${has ? 'has' : ''} ${today ? 'today' : ''}"><small>${dayName(d.getDay(), 'narrow')}</small><i></i></span>`;
  }).join('');

  const hero = `<section class="hero">
    <div class="hero-head">
      <p class="muted">${fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h2 class="greet">${greetHtml}</h2>
    </div>
    <div class="hero-bar">${barbell(done, goal)}</div>
    <div class="hero-foot">
      <p class="hero-count"><bdi dir="ltr" class="hero-frac"><b>${done}</b><span>/${goal}</span></bdi> ${t('sessions_week')}</p>
      <div class="weekstrip">${strip}</div>
    </div>
    <p class="hero-msg">${done >= goal ? t('goal_hit') : t('goal_left', { n: goal - done })}</p>
  </section>`;

  let resume = '';
  if (S.active) {
    const doneSets = S.active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    resume = `<a class="resume" href="#/log">
      <span class="pulse"></span>
      <span><b>${esc(S.active.title || t('workout'))}</b><small>${t('in_progress')} · ${doneSets} ${t('sets_done')}</small></span>
      <span class="btn btn-primary btn-sm">${t('resume')}</span></a>`;
  }

  // today
  const plan = activePlan();
  let todayHtml;
  const trainedToday = S.workouts.find((w) => w.date === dateKey(now));
  if (!plan) {
    todayHtml = card(`<div class="card-head"><h3>${t('today')}</h3></div>
      <p class="muted">${t('no_plan_yet')}</p>
      <div class="row-actions start">
        <button class="btn btn-primary" data-act="templates">${icon('plans')}${t('pick_template')}</button>
        <button class="btn btn-ghost" data-act="start-empty">${icon('plus')}${t('empty_workout')}</button>
      </div>`);
  } else {
    const todayDay = plan.days.find((d) => d.weekday === now.getDay());
    let nextDay = null;
    for (let i = 1; i <= 7 && !todayDay && !nextDay; i++) {
      const d = plan.days.find((x) => x.weekday === (now.getDay() + i) % 7);
      if (d) nextDay = { d, i };
    }
    if (todayDay) {
      todayHtml = card(`<div class="card-head"><h3>${t('today')}: ${esc(todayDay.name)}</h3><a class="muted small" href="#/plan/${plan.id}">${esc(plan.name)}</a></div>
        ${trainedToday ? `<p class="ok-line">${icon('check')} ${t('done_today')}</p>` : ''}
        <ol class="today-list">${todayDay.items.map((it) => `<li><span>${esc(exName(it.exId))}</span><small>${ltr(targetText(it))}</small></li>`).join('') || `<li class="muted">${t('day_empty')}</li>`}</ol>
        <div class="row-actions start">
          <button class="btn btn-primary" data-act="start-day" data-plan="${plan.id}" data-day="${todayDay.id}">${icon('play')}${t('start_workout')}</button>
          <button class="btn btn-ghost" data-act="start-other">${t('other_day')}</button>
        </div>`, 'today');
    } else {
      todayHtml = card(`<div class="card-head"><h3>${t('rest_day')}</h3><a class="muted small" href="#/plan/${plan.id}">${esc(plan.name)}</a></div>
        <p class="muted">${nextDay ? t('next_session', { name: esc(nextDay.d.name), day: dayName(nextDay.d.weekday, 'long') }) : t('no_weekdays')}</p>
        <div class="row-actions start">
          <button class="btn btn-primary" data-act="start-other">${icon('play')}${t('train_anyway')}</button>
          <button class="btn btn-ghost" data-act="start-empty">${t('empty_workout')}</button>
        </div>`, 'today');
    }
  }

  const monthCount = S.workouts.filter((w) => w.date && w.date.slice(0, 7) === dateKey(now).slice(0, 7)).length;
  const weekVol = weekW.reduce((a, w) => a + workoutVolume(w), 0);
  const weekTime = weekW.reduce((a, w) => a + (w.duration || 0), 0);
  const stats = `<div class="stats">
    <div class="stat">${icon('flame')}<b>${goalStreak()}</b><span>${t('streak_weeks')}</span></div>
    <div class="stat">${icon('calendar')}<b>${monthCount}</b><span>${t('this_month')}</span></div>
    <div class="stat">${icon('dumbbell')}<b>${fmtVol(weekVol)}</b><span>${t('week_volume')}</span></div>
    <div class="stat">${icon('timer')}<b>${fmtDurShort(weekTime)}</b><span>${t('week_time')}</span></div>
  </div>`;

  const prs = recentPRs(5);
  const prHtml = card(`<div class="card-head"><h3>${t('recent_prs')}</h3><a class="muted small" href="#/progress">${t('see_all')}</a></div>
    ${prs.length ? `<ul class="pr-list">${prs.map((p) => `<li><a href="#/workout/${p.wid}">${icon('trophy')}<span>${esc(exName(p.exId))}<small>${t('pr_' + p.kind)}</small></span><b>${prValue(p)}</b></a></li>`).join('')}</ul>` : `<p class="muted">${t('no_prs')}</p>`}`);

  const last = sortedWorkouts()[0];
  const lastHtml = last ? card(`<div class="card-head"><h3>${t('last_workout')}</h3><span class="muted small">${fmtDate(last.start)}</span></div>
    ${workoutRow(last)}`) : '';

  const bw = [...S.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  const bwLast = bw[bw.length - 1];
  const bwHtml = card(`<div class="card-head"><h3>${t('body_weight')}</h3><a class="muted small" href="#/body">${t('details')}</a></div>
    <div class="bw-mini">
      <div><b class="big">${bwLast ? fmtW(bwLast.kg) : '–'}</b>${bwLast ? `<small class="muted">${fmtDate(keyToDate(bwLast.date))}</small>` : ''}</div>
      ${sparkline(bw.slice(-14).map((x) => x.kg))}
      <button class="btn btn-ghost btn-sm" data-act="bw-quick">${icon('plus')}${t('log_weight')}</button>
    </div>`);

  return {
    title: t('nav_home'),
    html: `<div class="page home">${hero}${resume}<div class="grid-2">${todayHtml}${bwHtml}</div>${stats}<div class="grid-2">${prHtml}${lastHtml}</div></div>`,
  };
};

const prValue = (p) => (p.kind === 'reps' ? `${p.value} ${t('reps_short')}` : fmtW(p.value));

function workoutRow(w) {
  const names = (w.exercises || []).map((e) => exName(e.exId));
  return `<a class="wrow" href="#/workout/${w.id}">
    <span class="wrow-date"><b>${new Date(w.start).getDate()}</b><small>${fmtDate(w.start, { month: 'short' })}</small></span>
    <span class="wrow-main"><b>${esc(w.title || t('workout'))}${(w.prs || []).length ? ` <span class="badge-pr">${icon('trophy')}${w.prs.length}</span>` : ''}</b>
      <small>${esc(names.slice(0, 4).join(SEP()))}${names.length > 4 ? ' +' + (names.length - 4) : ''}</small></span>
    <span class="wrow-meta"><small>${fmtDurShort(w.duration || 0)}</small><small>${fmtVol(workoutVolume(w))}</small></span>
  </a>`;
}

/* ---------- PLANS ---------- */
VIEWS.plans = () => {
  const list = [...S.plans].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
  const html = list.length ? `<div class="plan-list">${list.map((p) => `
    <a class="plan-card ${p.active ? 'is-active' : ''}" href="#/plan/${p.id}">
      <div class="plan-card-head"><h3>${esc(p.name)}</h3>${p.active ? `<span class="badge">${t('active')}</span>` : ''}</div>
      <p class="muted small">${t('n_days', { n: p.days.length })} · ${t('n_exercises', { n: p.days.reduce((a, d) => a + d.items.length, 0) })}</p>
      <div class="day-chips">${p.days.map((d) => `<span class="daychip">${d.weekday != null ? `<i>${dayName(d.weekday, 'short')}</i>` : ''}${esc(d.name)}</span>`).join('')}</div>
    </a>`).join('')}</div>`
    : empty('plans', t('no_plans'), t('no_plans_body'), `<button class="btn btn-primary" data-act="templates">${t('pick_template')}</button>`);
  return {
    title: t('nav_plans'),
    actions: `<button class="icon-btn" data-act="new-plan" aria-label="${t('new_plan')}">${icon('plus')}</button>`,
    html: `<div class="page">
      <div class="row-actions start wrap">
        <button class="btn btn-primary" data-act="new-plan">${icon('plus')}${t('new_plan')}</button>
        <button class="btn btn-ghost" data-act="templates">${icon('copy')}${t('from_template')}</button>
      </div>${html}</div>`,
  };
};

VIEWS.plan = (r) => {
  const p = S.plans.find((x) => x.id === r.a);
  if (!p) return { title: t('nav_plans'), back: 'plans', html: empty('plans', t('not_found'), '') };
  const wdOpts = (sel) => `<option value="">${t('any_day')}</option>` + [0, 1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${dayName(i, 'long')}</option>`).join('');
  const days = p.days.map((d, di) => `
    <section class="card day-card" data-day="${di}">
      <div class="day-head">
        <input class="input input-title" value="${esc(d.name)}" data-pe="day-name" data-d="${di}" aria-label="${t('day_name')}"/>
        <select class="input select-sm" data-pe="day-wd" data-d="${di}" aria-label="${t('weekday')}">${wdOpts(d.weekday)}</select>
        <div class="day-tools">
          <button class="icon-btn sm" data-act="day-move" data-d="${di}" data-dir="-1" ${di === 0 ? 'disabled' : ''} aria-label="${t('move_up')}">${icon('up')}</button>
          <button class="icon-btn sm" data-act="day-move" data-d="${di}" data-dir="1" ${di === p.days.length - 1 ? 'disabled' : ''} aria-label="${t('move_down')}">${icon('down')}</button>
          <button class="icon-btn sm danger" data-act="day-del" data-d="${di}" aria-label="${t('delete')}">${icon('trash')}</button>
        </div>
      </div>
      <div class="items">
        ${d.items.length ? `<div class="item-head"><span>${t('exercise')}</span><span>${t('sets')}</span><span>${t('reps_time')}</span><span>${t('rest_s')}</span><span></span></div>` : ''}
        ${d.items.map((it, ii) => `
        <div class="item-row">
          <button class="item-name" data-act="item-menu" data-d="${di}" data-i="${ii}">${esc(exName(it.exId))}<small>${t('m_' + getEx(it.exId).muscle)}${exType(it.exId) === 'cardio' ? ` · ${t('ty_cardio_short')}` : ''}</small></button>
          ${exType(it.exId) === 'cardio'
            ? `<span class="item-na">–</span>
          <input class="input input-num" inputmode="numeric" value="${esc(it.reps)}" placeholder="${t('min')}" data-pe="it-reps" data-d="${di}" data-i="${ii}" aria-label="${t('min')}"/>
          <span class="item-na">–</span>`
            : `<input class="input input-num" inputmode="numeric" value="${esc(it.sets)}" data-pe="it-sets" data-d="${di}" data-i="${ii}" aria-label="${t('sets')}"/>
          <input class="input input-num" value="${esc(it.reps)}" placeholder="${exType(it.exId) === 'time' ? t('sec') : exType(it.exId) === 'carry' ? t('m_short') : ''}" data-pe="it-reps" data-d="${di}" data-i="${ii}" aria-label="${t('reps')}"/>
          <input class="input input-num" inputmode="numeric" value="${esc(it.rest ?? '')}" placeholder="${S.profile.rest || 90}" data-pe="it-rest" data-d="${di}" data-i="${ii}" aria-label="${t('rest_s')}"/>`}
          <button class="icon-btn sm" data-act="item-menu" data-d="${di}" data-i="${ii}" aria-label="${t('more')}">${icon('more')}</button>
        </div>`).join('')}
      </div>
      <div class="row-actions start">
        <button class="btn btn-ghost btn-sm" data-act="item-add" data-d="${di}">${icon('plus')}${t('add_exercise')}</button>
        ${d.items.length ? `<button class="btn btn-primary btn-sm" data-act="start-day" data-plan="${p.id}" data-day="${d.id}">${icon('play')}${t('start')}</button>` : ''}
      </div>
    </section>`).join('');

  return {
    title: p.name, back: 'plans',
    html: `<div class="page">
      <section class="card plan-meta">
        <label class="field"><span>${t('plan_name')}</span><input class="input" value="${esc(p.name)}" data-pe="plan-name"/></label>
        <label class="switch"><input type="checkbox" data-pe="plan-active" ${p.active ? 'checked' : ''}/><span class="switch-ui"></span><span>${t('set_active')}<small class="muted">${t('set_active_hint')}</small></span></label>
        <div class="row-actions start wrap">
          <button class="btn btn-ghost btn-sm" data-act="plan-dup">${icon('copy')}${t('duplicate')}</button>
          <button class="btn btn-ghost btn-sm danger" data-act="plan-del">${icon('trash')}${t('delete_plan')}</button>
        </div>
      </section>
      ${days || ''}
      <button class="btn btn-dashed" data-act="day-add">${icon('plus')}${t('add_day')}</button>
    </div>`,
    after: (v) => { v.dataset.plan = p.id; },
  };
};

/* ---------- LOG (active workout) ---------- */
// Keep "85 × 8", "3×8", "+15" in reading order inside Arabic (RTL) text
const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;

// Average speed (km/h) for a cardio set measured in km
const cardioSpeed = (s, exId) => (cardioDef(exId).dist === 'km' && s && s.r > 0 && s.w > 0 ? s.w / (s.r / 60) : null);

function prevText(type, s, aUnit, exId) {
  if (!s) return '–';
  const w = isLoad(type) ? (aUnit === 'lb' ? s.w * LB : s.w) : s.w;
  if (type === 'time') return `${s.r || 0}${t('sec_short')}`;
  if (type === 'carry') return ltr(`${fmtNum(w || 0)} × ${s.r || 0}${t('m_short')}`);
  if (type === 'cardio') {
    const c = cardioDef(exId);
    const parts = [`${s.r || 0} ${t('min_short')}`];
    if (c.dist && s.w) parts.push(`${fmtNum(s.w)} ${distLabel(c.dist)}`);
    if (c.extra && s.x != null && s.x !== '') parts.push(extraText(c.extra, s.x));
    return parts.join(' · ');
  }
  if (type === 'bodyweight') return ltr(`${s.w ? '+' + fmtNum(w) + ' × ' : ''}${s.r || 0}`);
  return ltr(`${fmtNum(w || 0)} × ${s.r || 0}`);
}

VIEWS.log = () => {
  const A = S.active;
  if (!A) return logChooser();
  const before = A.start;
  const blocks = A.exercises.map((e, i) => {
    const type = exType(e.exId);
    const cardio = type === 'cardio';
    const cols = colsFor(e.exId);
    const prev = lastSetsFor(e.exId, A.editingId, before) || [];
    const rows = e.sets.map((s, j) => {
      const p = prev[j] || prev[prev.length - 1];
      const ph = (f) => { if (!p) return ''; const v = p[f]; if (v == null) return ''; return f === 'w' && isLoad(type) ? fmtNum(A.unit === 'lb' ? v * LB : v) : fmtNum(v); };
      // only weight exercises have warm-up sets; other types just number their rows
      const no = type === 'weight'
        ? `<button class="setno ${s.kind === 'warm' ? 'warm' : ''}" data-act="set-kind" data-i="${i}" data-j="${j}" aria-label="${t('set_type')}">${s.kind === 'warm' ? 'W' : j + 1 - e.sets.slice(0, j).filter((x) => x.kind === 'warm').length}</button>`
        : `<span class="setno">${j + 1}</span>`;
      return `<div class="setrow ${s.done ? 'done' : ''} cols-${cols.length} ${cardio ? 'nopre' : ''}" data-i="${i}" data-j="${j}">
        ${no}
        ${cardio ? '' : `<span class="prev">${prev[j] ? prevText(type, prev[j], A.unit, e.exId) : '–'}</span>`}
        ${cols.map((c) => `<input class="input set-in" inputmode="decimal" enterkeyhint="next" data-f="${c.f}" data-i="${i}" data-j="${j}" value="${esc(s[c.f] ?? '')}" placeholder="${esc(ph(c.f))}" aria-label="${esc(c.l)}"/>`).join('')}
        <button class="check" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${s.done ? 'true' : 'false'}" aria-label="${t('done')}">${icon('check')}</button>
      </div>`;
    }).join('');
    const ex = getEx(e.exId);
    const unitSfx = type === 'cardio' ? t('min_short') : type === 'time' ? t('sec_short') : type === 'carry' ? t('m_short') : '';
    const restInfo = cardio ? '' : ` · ${icon('timer')}${e.rest || S.profile.rest || 90}${t('sec_short')}`;
    const lastLine = cardio && prev.length
      ? `<p class="prev-line muted small">${t('last_time')}: ${prev.map((x) => prevText(type, x, A.unit, e.exId)).join(' + ')}${cardioSpeed(prev[0], e.exId) ? ` · ${fmtNum(cardioSpeed(prev[0], e.exId))} ${t('kmh')}` : ''}</p>` : '';
    return `<section class="exblock" data-i="${i}">
      <div class="exhead">
        <button class="exname" data-act="ex-menu" data-i="${i}"><b>${esc(exName(ex))}</b><small>${t('m_' + ex.muscle)}${e.target ? ` · ${t('target')} ${esc(e.target)}${unitSfx}` : ''}${restInfo}</small></button>
        <button class="icon-btn sm" data-act="ex-demo" data-i="${i}" aria-label="${t('ex_details')}">${icon('image')}</button>
        <button class="icon-btn sm" data-act="ex-menu" data-i="${i}" aria-label="${t('more')}">${icon('more')}</button>
      </div>
      ${lastLine}
      <div class="setrow head cols-${cols.length} ${cardio ? 'nopre' : ''}"><span>#</span>${cardio ? '' : `<span>${t('previous')}</span>`}${cols.map((c) => `<span>${esc(c.l)}</span>`).join('')}<span>${icon('check')}</span></div>
      ${rows}
      <div class="exfoot">
        <button class="btn btn-ghost btn-sm" data-act="set-add" data-i="${i}">${icon('plus')}${cardio ? t('add_interval') : t('add_set')}</button>
        ${e.sets.length > 1 ? `<button class="btn btn-ghost btn-sm" data-act="set-remove" data-i="${i}">${icon('minus')}${cardio ? t('remove_interval') : t('remove_set')}</button>` : ''}
        <input class="input note-in" data-note="${i}" value="${esc(e.note || '')}" placeholder="${t('note_ph')}"/>
      </div>
    </section>`;
  }).join('');

  const doneSets = A.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const totalSets = A.exercises.reduce((a, e) => a + e.sets.length, 0);
  return {
    title: A.editingId ? t('edit_workout') : t('nav_train'),
    actions: `<button class="btn btn-primary btn-sm" data-act="finish">${t('finish')}</button>`,
    html: `<div class="page log">
      <section class="log-head">
        <input class="input input-title" data-title value="${esc(A.title || '')}" placeholder="${t('workout_name')}"/>
        <div class="log-meta">
          <span class="clock">${icon('timer')}<b id="elapsed">${fmtDur((Date.now() - A.start) / 1000)}</b></span>
          <span class="muted">${doneSets}/${totalSets} ${t('sets')}</span>
          <span class="progress-line"><i style="width:${totalSets ? (doneSets / totalSets) * 100 : 0}%"></i></span>
        </div>
      </section>
      ${blocks || empty('dumbbell', t('no_ex_in_workout'), t('no_ex_in_workout_body'))}
      <button class="btn btn-dashed" data-act="ex-add">${icon('plus')}${t('add_exercise')}</button>
      <section class="card log-notes">
        <label class="field"><span>${t('workout_notes')}</span><textarea class="input" rows="2" data-wnote placeholder="${t('workout_notes_ph')}">${esc(A.notes || '')}</textarea></label>
      </section>
      <div class="row-actions">
        <button class="btn btn-ghost danger" data-act="discard">${icon('trash')}${A.editingId ? t('cancel_edit') : t('discard')}</button>
        <button class="btn btn-primary" data-act="finish">${icon('check')}${t('finish_workout')}</button>
      </div>
    </div>`,
    after: () => {
      elapsedTick = setInterval(() => {
        const el = document.getElementById('elapsed');
        if (el && S.active) el.textContent = fmtDur((Date.now() - S.active.start) / 1000); else clearInterval(elapsedTick);
      }, 1000);
    },
  };
};

function logChooser() {
  const plan = activePlan();
  const last = sortedWorkouts()[0];
  const todayWd = new Date().getDay();
  return {
    title: t('nav_train'),
    html: `<div class="page">
      <section class="start-hero">
        <h2>${t('ready')}</h2>
        <p class="muted">${t('ready_sub')}</p>
      </section>
      ${plan ? card(`<div class="card-head"><h3>${esc(plan.name)}</h3><a class="muted small" href="#/plan/${plan.id}">${t('edit')}</a></div>
        <div class="day-pick">${plan.days.map((d) => `
          <button class="day-btn ${d.weekday === todayWd ? 'is-today' : ''}" data-act="start-day" data-plan="${plan.id}" data-day="${d.id}">
            <b>${esc(d.name)}</b><small>${d.weekday != null ? dayName(d.weekday, 'long') : t('any_day')} · ${t('n_exercises', { n: d.items.length })}</small>
            ${d.weekday === todayWd ? `<span class="badge">${t('today')}</span>` : ''}
          </button>`).join('') || `<p class="muted">${t('day_empty')}</p>`}</div>`) : card(`<p class="muted">${t('no_plan_yet')}</p><button class="btn btn-ghost btn-sm" data-act="templates">${t('pick_template')}</button>`)}
      <div class="grid-2">
        <button class="big-choice" data-act="start-empty">${icon('plus')}<b>${t('empty_workout')}</b><small>${t('empty_workout_sub')}</small></button>
        ${last ? `<button class="big-choice" data-act="repeat" data-id="${last.id}">${icon('repeat')}<b>${t('repeat_last')}</b><small>${esc(last.title || t('workout'))} · ${fmtDate(last.start)}</small></button>` : ''}
      </div>
    </div>`,
  };
}

function startWorkout({ planId, dayId, fromWorkout, title } = {}) {
  const make = () => {
    const A = { id: uid(), start: Date.now(), unit: unit(), title: title || '', planId: planId || null, dayId: dayId || null, notes: '', exercises: [] };
    if (planId) {
      const p = S.plans.find((x) => x.id === planId);
      const d = p && p.days.find((x) => x.id === dayId);
      if (d) {
        A.title = d.name;
        A.exercises = d.items.map((it) => ({ exId: it.exId, target: it.reps, rest: num(it.rest) || null, note: '', sets: Array.from({ length: exType(it.exId) === 'cardio' ? 1 : Math.max(1, num(it.sets) || 3) }, () => ({ w: '', r: '', x: '', done: false })) }));
      }
    } else if (fromWorkout) {
      const w = S.workouts.find((x) => x.id === fromWorkout);
      if (w) {
        A.title = w.title || '';
        A.exercises = w.exercises.map((e) => ({ exId: e.exId, target: e.target || '', rest: e.rest || null, note: '', sets: e.sets.map((s) => ({ w: '', r: '', x: '', done: false, kind: s.kind })) }));
      }
    }
    if (!A.title) A.title = t('workout') + ' ' + fmtDate(Date.now(), { day: 'numeric', month: 'short' });
    S.active = A; saveActive(true);
    unlockAudio();
    go('log');
  };
  if (S.active) {
    confirmDialog({ title: t('replace_active'), body: t('replace_active_body'), ok: t('replace'), cancel: t('cancel'), danger: true }).then((ok) => ok && make());
  } else make();
}

function editWorkout(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  const go2 = () => {
    const u = unit();
    const conv = (v, type) => (v == null ? '' : isLoad(type) ? String(r1(u === 'lb' ? v * LB : v)) : String(v));
    S.active = {
      id: w.id, editingId: w.id, start: w.start, end: w.end, unit: u, title: w.title || '', planId: w.planId || null, dayId: w.dayId || null, notes: w.notes || '',
      exercises: w.exercises.map((e) => ({ exId: e.exId, target: e.target || '', rest: e.rest || null, note: e.note || '', sets: e.sets.map((s) => ({ w: conv(s.w, exType(e.exId)), r: s.r == null ? '' : String(s.r), x: s.x == null ? '' : String(s.x), done: true, kind: s.kind })) })),
    };
    saveActive(true); go('log');
  };
  if (S.active) confirmDialog({ title: t('replace_active'), body: t('replace_active_body'), ok: t('replace'), cancel: t('cancel'), danger: true }).then((ok) => ok && go2());
  else go2();
}

async function finishWorkout() {
  const A = S.active;
  if (!A) return;
  // Keep sets that are checked or fully filled in
  const exercises = A.exercises.map((e) => {
    const type = exType(e.exId);
    const sets = e.sets.filter((s) => {
      const r = num(s.r), w = num(s.w);
      if (type === 'weight') return s.done ? (r != null) : (r != null && w != null);
      if (type === 'cardio') return r != null || (s.done && w != null);
      return r != null;
    }).map((s) => {
      const out = { r: num(s.r) ?? 0 };
      const w = num(s.w);
      if (w != null) out.w = isLoad(type) ? fromDisp(w, A.unit) : w;
      else if (type === 'weight' || type === 'carry') out.w = 0;
      const x = num(s.x);
      if (x != null && type === 'cardio') out.x = x;
      if (s.kind === 'warm' && type === 'weight') out.kind = 'warm';
      return out;
    });
    return { exId: e.exId, target: e.target || '', rest: e.rest || null, note: e.note || '', sets };
  }).filter((e) => e.sets.length);

  if (!exercises.length) {
    const ok = await confirmDialog({ title: t('nothing_logged'), body: t('nothing_logged_body'), ok: t('discard'), cancel: t('keep_going'), danger: true });
    if (ok) { S.active = null; saveActive(true); stopRest(); go('home'); }
    return;
  }

  const end = A.editingId ? (A.end || Date.now()) : Date.now();
  const w = {
    id: A.editingId || A.id, date: dateKey(A.start), start: A.start, end, duration: Math.round((end - A.start) / 1000),
    title: (A.title || '').trim() || t('workout'), planId: A.planId, dayId: A.dayId, notes: A.notes || '', exercises,
  };
  w.volume = workoutVolume(w);
  // PRs vs everything before this workout
  w.prs = [];
  for (const e of exercises) {
    const type = exType(e.exId);
    const prior = bestsFor(e.exId, w.id, w.start);
    if (!prior.sessions) continue;
    const work = e.sets.filter((s) => s.kind !== 'warm');
    if (type === 'weight') {
      const maxW = Math.max(0, ...work.map((s) => s.w || 0));
      const maxE = Math.max(0, ...work.map((s) => e1rm(s.w || 0, s.r || 0)));
      if (maxW > prior.weight + 0.001) w.prs.push({ exId: e.exId, kind: 'weight', value: maxW });
      else if (maxE > prior.e1rm + 0.01) w.prs.push({ exId: e.exId, kind: 'e1rm', value: r1(maxE) });
    } else if (type === 'bodyweight') {
      const maxR = Math.max(0, ...work.map((s) => s.r || 0));
      if (maxR > prior.reps) w.prs.push({ exId: e.exId, kind: 'reps', value: maxR });
    }
  }

  // summary sheet
  const sets = workoutSets(w);
  openSheet(`<div class="sheet-body summary">
      <div class="summary-top">${icon(w.prs.length ? 'trophy' : 'check', 'summary-ic')}<h3>${w.prs.length ? t('great_prs', { n: w.prs.length }) : t('nice_work')}</h3></div>
      <div class="stats compact">
        <div class="stat"><b>${fmtDurShort(w.duration)}</b><span>${t('duration')}</span></div>
        <div class="stat"><b>${fmtVol(w.volume)}</b><span>${t('volume')}</span></div>
        <div class="stat"><b>${sets}</b><span>${t('sets')}</span></div>
      </div>
      ${w.prs.length ? `<ul class="pr-list">${w.prs.map((p) => `<li><span>${icon('trophy')}<span>${esc(exName(p.exId))}<small>${t('pr_' + p.kind)}</small></span></span><b>${prValue(p)}</b></li>`).join('')}</ul>` : ''}
      <div class="row-actions">
        <button class="btn btn-ghost" data-sheet-close>${t('keep_going')}</button>
        <button class="btn btn-primary" data-save autofocus>${icon('check')}${t('save_workout')}</button>
      </div>
    </div>`, {
    onMount: (s, close) => s.querySelector('[data-save]').addEventListener('click', () => {
      const i = S.workouts.findIndex((x) => x.id === w.id);
      if (i >= 0) S.workouts[i] = w; else S.workouts.push(w);
      persist('workouts', w);
      S.active = null; saveActive(true); stopRest();
      close();
      toast(A.editingId ? t('workout_updated') : t('workout_saved'), w.prs.length ? 'pr' : 'success');
      go('workout/' + w.id);
    }),
  });
}

/* ---------- HISTORY ---------- */
VIEWS.history = () => {
  const m = S.ui.histMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  S.ui.histMonth = m;
  const y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1);
  const offset = (first.getDay() - weekStartDay() + 7) % 7;
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const byDate = {};
  S.workouts.forEach((w) => { (byDate[w.date] = byDate[w.date] || []).push(w); });
  const todayK = dateKey();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span class="cal-cell blank"></span>';
  for (let d = 1; d <= daysIn; d++) {
    const k = dateKey(new Date(y, mo, d));
    const ws = byDate[k] || [];
    cells += ws.length
      ? `<button class="cal-cell has ${k === todayK ? 'today' : ''}" data-act="cal-day" data-date="${k}" style="--c:var(--plate-${['red', 'blue', 'yellow', 'green'][d % 4]})"><span>${d}</span>${ws.length > 1 ? `<small>${ws.length}</small>` : ''}</button>`
      : `<span class="cal-cell ${k === todayK ? 'today' : ''}"><span>${d}</span></span>`;
  }
  const head = Array.from({ length: 7 }, (_, i) => `<span class="cal-h">${dayName((weekStartDay() + i) % 7, 'narrow')}</span>`).join('');
  const monthW = sortedWorkouts().filter((w) => w.date && w.date.startsWith(`${y}-${pad2(mo + 1)}`));
  const vol = monthW.reduce((a, w) => a + workoutVolume(w), 0);
  const time = monthW.reduce((a, w) => a + (w.duration || 0), 0);
  const prev = lang() === 'ar' ? 'right' : 'left', next = lang() === 'ar' ? 'left' : 'right';

  return {
    title: t('nav_history'),
    html: `<div class="page">
      <section class="card cal">
        <div class="cal-top">
          <button class="icon-btn" data-act="cal-nav" data-d="-1" aria-label="${t('prev_month')}">${icon(prev)}</button>
          <h3>${first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</h3>
          <button class="icon-btn" data-act="cal-nav" data-d="1" aria-label="${t('next_month')}">${icon(next)}</button>
        </div>
        <div class="cal-grid">${head}${cells}</div>
        <div class="stats compact">
          <div class="stat"><b>${monthW.length}</b><span>${t('workouts')}</span></div>
          <div class="stat"><b>${fmtDurShort(time)}</b><span>${t('time')}</span></div>
          <div class="stat"><b>${fmtVol(vol)}</b><span>${t('volume')}</span></div>
        </div>
      </section>
      ${monthW.length ? `<div class="wlist">${monthW.map(workoutRow).join('')}</div>` : empty('calendar', t('no_workouts_month'), t('no_workouts_month_body'), `<button class="btn btn-primary" data-act="go-train">${t('start_workout')}</button>`)}
      ${S.workouts.length ? `<p class="muted small center">${t('total_workouts', { n: S.workouts.length })}</p>` : ''}
    </div>`,
  };
};

VIEWS.workout = (r) => {
  const w = S.workouts.find((x) => x.id === r.a);
  if (!w) return { title: t('nav_history'), back: 'history', html: empty('calendar', t('not_found'), '') };
  const prMap = {};
  (w.prs || []).forEach((p) => (prMap[p.exId] = p));
  const exHtml = w.exercises.map((e) => {
    const type = exType(e.exId);
    const best = type === 'weight' ? Math.max(0, ...e.sets.map((s) => e1rm(s.w || 0, s.r || 0))) : 0;
    return `<section class="card ex-detail">
      <div class="card-head"><h3><a href="#/progress/${encodeURIComponent(e.exId)}">${esc(exName(e.exId))}</a></h3>${prMap[e.exId] ? `<span class="badge-pr">${icon('trophy')}${t('pr_' + prMap[e.exId].kind)}</span>` : ''}</div>
      <ol class="set-list">${e.sets.map((s, j) => `<li class="${s.kind === 'warm' ? 'warm' : ''}"><span>${s.kind === 'warm' && type === 'weight' ? 'W' : j + 1}</span><b>${prevText(type, s, unit(), e.exId)}</b>${type === 'weight' && s.w ? `<small>1RM≈${fmtW(e1rm(s.w, s.r))}</small>` : ''}${type === 'cardio' && cardioSpeed(s, e.exId) ? `<small>${fmtNum(cardioSpeed(s, e.exId))} ${t('kmh')}</small>` : ''}</li>`).join('')}</ol>
      ${best ? `<p class="muted small">${t('best_e1rm')}: ${fmtW(best)}</p>` : ''}
      ${e.note ? `<p class="note">${icon('note')}${esc(e.note)}</p>` : ''}
    </section>`;
  }).join('');
  return {
    title: w.title || t('workout'), back: 'history',
    html: `<div class="page">
      <section class="card wd-head">
        <p class="muted">${fmtDate(w.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${new Date(w.start).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' })}</p>
        <div class="stats compact">
          <div class="stat"><b>${fmtDurShort(w.duration || 0)}</b><span>${t('duration')}</span></div>
          <div class="stat"><b>${fmtVol(workoutVolume(w))}</b><span>${t('volume')}</span></div>
          <div class="stat"><b>${workoutSets(w)}</b><span>${t('sets')}</span></div>
        </div>
        ${w.notes ? `<p class="note">${icon('note')}${esc(w.notes)}</p>` : ''}
        <div class="row-actions start wrap">
          <button class="btn btn-ghost btn-sm" data-act="w-edit" data-id="${w.id}">${icon('edit')}${t('edit')}</button>
          <button class="btn btn-ghost btn-sm" data-act="repeat" data-id="${w.id}">${icon('repeat')}${t('repeat')}</button>
          <button class="btn btn-ghost btn-sm" data-act="w-to-plan" data-id="${w.id}">${icon('plans')}${t('save_as_day')}</button>
          <button class="btn btn-ghost btn-sm danger" data-act="w-del" data-id="${w.id}">${icon('trash')}${t('delete')}</button>
        </div>
      </section>
      ${exHtml}
    </div>`,
  };
};

/* ---------- PROGRESS ---------- */
VIEWS.progress = (r) => {
  const counts = {};
  S.workouts.forEach((w) => w.exercises.forEach((e) => (counts[e.exId] = (counts[e.exId] || 0) + 1)));
  const exIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!S.workouts.length) {
    return { title: t('nav_progress'), html: `<div class="page">${empty('chart', t('no_data'), t('no_data_body'), `<button class="btn btn-primary" data-act="go-train">${t('start_workout')}</button>`)}</div>` };
  }
  const sel = r.a && counts[r.a] ? r.a : exIds.find((id) => exType(id) === 'weight') || exIds[0];
  const type = exType(sel);
  const metric = S.ui.progMetric;

  // per-session series for selected exercise
  const sessions = [...S.workouts].sort((a, b) => a.start - b.start).map((w) => {
    const e = w.exercises.find((x) => x.exId === sel);
    if (!e) return null;
    const work = e.sets.filter((s) => s.kind !== 'warm');
    const sets = work.length ? work : e.sets;
    return {
      x: w.start, wid: w.id,
      e1rm: Math.max(0, ...sets.map((s) => e1rm(s.w || 0, s.r || 0))),
      weight: Math.max(0, ...sets.map((s) => s.w || 0)),
      vol: sets.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0),
      reps: Math.max(0, ...sets.map((s) => s.r || 0)),
      dist: Math.max(0, ...sets.map((s) => s.w || 0)),
      speed: Math.max(0, ...sets.map((s) => cardioSpeed(s, sel) || 0)),
      sets: e.sets,
    };
  }).filter(Boolean);

  const addedLoad = sessions.some((x) => x.weight > 0);
  const cdef = type === 'cardio' ? cardioDef(sel) : null;
  const metrics = type === 'weight' ? ['e1rm', 'weight', 'vol', 'reps'] : type === 'cardio' ? [...(cdef.dist ? ['dist'] : []), 'reps', ...(cdef.dist === 'km' ? ['speed'] : [])] : type === 'carry' ? ['weight', 'reps'] : type === 'bodyweight' && addedLoad ? ['reps', 'weight'] : ['reps'];
  const m = metrics.includes(metric) ? metric : metrics[0];
  const loadMetric = ['e1rm', 'weight', 'vol'].includes(m);
  const pts = sessions.map((s) => ({ x: s.x, y: loadMetric ? toDisp(s[m]) : s[m] }));
  const mLabel = (k) => t(type === 'time' && k === 'reps' ? 'met_secs' : type === 'cardio' && k === 'reps' ? 'met_mins' : type === 'carry' && k === 'reps' ? 'met_meters' : 'met_' + k);
  const b = bestsFor(sel);

  const weeks = weekCounts(12);
  const since = Date.now() - 30 * 86400000;
  const muscleSets = {};
  S.workouts.filter((w) => w.start >= since).forEach((w) => w.exercises.forEach((e) => {
    const mu = getEx(e.exId).muscle; muscleSets[mu] = (muscleSets[mu] || 0) + e.sets.filter((s) => s.kind !== 'warm').length;
  }));
  const muscleItems = Object.entries(muscleSets).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => ({ label: t('m_' + k), value: v }));

  return {
    title: t('nav_progress'),
    html: `<div class="page">
      <section class="card">
        <div class="card-head"><h3>${t('exercise_progress')}</h3></div>
        <select class="input" data-act-change="prog-ex" aria-label="${t('exercise')}">${exIds.map((id) => `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(exName(id))} (${counts[id]})</option>`).join('')}</select>
        <div class="seg seg-sm">${metrics.map((k) => `<button class="${k === m ? 'on' : ''}" data-act="prog-metric" data-m="${k}">${mLabel(k)}</button>`).join('')}</div>
        <div class="chart-wrap">${pts.length ? chartSlot(lineChart, pts, { fmtX: (x) => fmtDate(x, { day: 'numeric', month: 'short' }), fmtY: (y) => fmtNum(y) }) : ''}</div>
        ${type === 'weight' ? `<div class="pr-grid">
          <div><small>${t('best_e1rm')}</small><b>${fmtW(b.e1rm)}</b></div>
          <div><small>${t('heaviest')}</small><b>${fmtW(b.weight)}</b></div>
          <div><small>${t('most_reps')}</small><b>${b.reps}</b></div>
          <div><small>${t('best_volume')}</small><b>${fmtVol(b.vol)}</b></div>
        </div>` : otherGrid(type, b, sel)}
        <details class="sessions">
          <summary>${t('session_log')} (${sessions.length})</summary>
          <ul>${[...sessions].reverse().slice(0, 30).map((s) => `<li><a href="#/workout/${s.wid}"><span>${fmtDate(s.x)}</span><small>${s.sets.map((x) => prevText(type, x, unit(), sel)).join(' · ')}</small></a></li>`).join('')}</ul>
        </details>
      </section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>${t('weekly_volume')}</h3><span class="muted small">${uLabel()}</span></div>
          <div class="chart-wrap">${chartSlot(barChart, weeks.map((w) => ({ label: fmtDate(w.start, { day: 'numeric', month: 'numeric' }), value: Math.round(toDisp(w.volume)) })), { height: 180 })}</div></section>
        <section class="card"><div class="card-head"><h3>${t('weekly_sessions')}</h3><span class="muted small">${t('goal')}: ${S.profile.weeklyGoal || 4}</span></div>
          <div class="chart-wrap">${chartSlot(barChart, weeks.map((w) => ({ label: fmtDate(w.start, { day: 'numeric', month: 'numeric' }), value: w.count, color: w.count >= (S.profile.weeklyGoal || 4) ? 'var(--plate-green)' : 'var(--accent)' })), { height: 180 })}</div></section>
      </div>
      <section class="card"><div class="card-head"><h3>${t('muscle_sets')}</h3><span class="muted small">${t('last_30')}</span></div>
        ${muscleItems.length ? hBars(muscleItems) : `<p class="muted">${t('no_recent')}</p>`}</section>
    </div>`,
  };
};

/* ---------- BODY ---------- */
VIEWS.body = () => {
  const bw = [...S.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  const last = bw[bw.length - 1];
  const monthAgo = bw.filter((x) => keyToDate(x.date) <= new Date(Date.now() - 28 * 86400000)).pop();
  const diff = last && monthAgo ? last.kg - monthAgo.kg : null;
  const h = num(S.profile.height);
  const bmi = last && h ? last.kg / Math.pow(h / 100, 2) : null;
  const bmiK = bmi == null ? '' : bmi < 18.5 ? 'bmi_under' : bmi < 25 ? 'bmi_normal' : bmi < 30 ? 'bmi_over' : 'bmi_obese';

  const ms = [...S.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const mLast = ms[ms.length - 1], mPrev = ms[ms.length - 2];

  return {
    title: t('nav_body'),
    html: `<div class="page">
      <section class="card">
        <div class="card-head"><h3>${t('body_weight')}</h3></div>
        <div class="bw-top">
          <div><b class="big">${last ? fmtW(last.kg) : '–'}</b><small class="muted">${last ? fmtDate(keyToDate(last.date)) : t('no_entries')}</small></div>
          ${diff != null ? `<div class="delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}"><b><bdi dir="ltr">${diff > 0 ? '+' : ''}${fmtNum(toDisp(diff))}</bdi> ${uLabel()}</b><small class="muted">${t('vs_4w')}</small></div>` : ''}
          ${bmi ? `<div><b>${bmi.toFixed(1)}</b><small class="muted">BMI · ${t(bmiK)}</small></div>` : ''}
        </div>
        <form class="inline-form" data-form="bw">
          <input class="input" name="v" inputmode="decimal" placeholder="${t('weight')} (${uLabel()})" required aria-label="${t('weight')}"/>
          <input class="input" name="d" type="date" value="${dateKey()}" max="${dateKey()}" required aria-label="${t('date')}"/>
          <button class="btn btn-primary">${t('add')}</button>
        </form>
        ${bw.length > 1 ? `<div class="chart-wrap">${chartSlot(lineChart, bw.map((x) => ({ x: keyToDate(x.date).getTime(), y: toDisp(x.kg) })), { fmtX: (x) => fmtDate(x, { day: 'numeric', month: 'short' }), color: 'var(--plate-blue)' })}</div>` : ''}
        ${!h ? `<p class="muted small">${t('add_height_hint')} <a href="#/settings">${t('nav_settings')}</a></p>` : ''}
        ${bw.length ? `<details class="sessions"><summary>${t('entries')} (${bw.length})</summary><ul>${[...bw].reverse().map((x) => `<li><span>${fmtDate(keyToDate(x.date))}</span><b>${fmtW(x.kg)}</b><button class="icon-btn sm danger" data-act="bw-del" data-id="${x.id}" aria-label="${t('delete')}">${icon('trash')}</button></li>`).join('')}</ul></details>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h3>${t('measurements')}</h3><span class="muted small">${t('cm')}</span></div>
        ${mLast ? `<div class="measure-grid">${MEASURE_KEYS.filter((k) => mLast.values[k] != null).map((k) => {
          const d = mPrev && mPrev.values[k] != null ? mLast.values[k] - mPrev.values[k] : null;
          return `<div><small>${t('ms_' + k)}</small><b>${fmtNum(mLast.values[k])}${k === 'bodyfat' ? '%' : ''}</b>${d ? `<em class="${d > 0 ? 'up' : 'down'}" dir="ltr">${d > 0 ? '+' : ''}${fmtNum(d)}</em>` : ''}</div>`;
        }).join('')}</div><p class="muted small">${t('last_updated')}: ${fmtDate(keyToDate(mLast.date))}</p>` : `<p class="muted">${t('no_measure')}</p>`}
        <button class="btn btn-ghost btn-sm" data-act="ms-add">${icon('ruler')}${t('add_measure')}</button>
        ${ms.length ? `<details class="sessions"><summary>${t('entries')} (${ms.length})</summary><ul>${[...ms].reverse().map((x) => `<li><span>${fmtDate(keyToDate(x.date))}</span><small>${MEASURE_KEYS.filter((k) => x.values[k] != null).map((k) => `${t('ms_' + k)} ${fmtNum(x.values[k])}`).join(' · ')}</small><button class="icon-btn sm danger" data-act="ms-del" data-id="${x.id}" aria-label="${t('delete')}">${icon('trash')}</button></li>`).join('')}</ul></details>` : ''}
      </section>
    </div>`,
  };
};

/* ---------- EXERCISES ---------- */
// When the Legs section is open, split the list under quads / hamstrings / glutes / calves headings
function groupedRows(list, filter, row) {
  if (filter !== 'legs') return list.map(row).join('');
  return LEG_MUSCLES.map((mu) => {
    const part = list.filter((e) => e.muscle === mu);
    return part.length ? `<p class="list-label">${t('m_' + mu)}</p>${part.map(row).join('')}` : '';
  }).join('');
}

VIEWS.exercises = () => {
  const f = S.ui.exFilter, q = S.ui.exSearch.trim().toLowerCase();
  const counts = {};
  S.workouts.forEach((w) => w.exercises.forEach((e) => (counts[e.exId] = (counts[e.exId] || 0) + 1)));
  const list = allExercises().filter((e) => (f === 'all' || (f === 'custom' ? !e.builtin : inGroup(e.muscle, f))) && (!q || `${e.en} ${e.ar} ${e.name || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || exName(a).localeCompare(exName(b)));
  return {
    title: t('nav_exercises'),
    actions: `<button class="icon-btn" data-act="ex-new" aria-label="${t('new_exercise')}">${icon('plus')}</button>`,
    html: `<div class="page">
      <div class="search">${icon('search')}<input class="input" data-ex-search value="${esc(S.ui.exSearch)}" placeholder="${t('search_ex')}" type="search"/></div>
      <div class="chips-scroll">${['all', ...GROUPS, 'custom'].map((m) => `<button class="chip ${f === m ? 'chip-solid' : ''}" data-act="ex-filter" data-m="${m}">${m === 'all' ? t('all') : m === 'custom' ? t('custom') : t('m_' + m)}</button>`).join('')}</div>
      <div class="ex-list">${groupedRows(list, f, (e) => `
        <button class="ex-item" data-act="ex-open" data-id="${esc(e.id)}">
          <span class="ex-dot" style="background:var(--m-${e.muscle})"></span>
          <span><b>${esc(exName(e))}</b><small>${t('m_' + e.muscle)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight') + '_short')}${!e.builtin ? ` · ${t('custom')}` : ''}</small></span>
          ${counts[e.id] ? `<span class="count">${counts[e.id]}</span>` : ''}
        </button>`) || `<p class="muted center">${t('no_results')}</p>`}</div>
      <button class="btn btn-dashed" data-act="ex-new">${icon('plus')}${t('new_exercise')}</button>
    </div>`,
  };
};

/* ---------- TOOLS ---------- */
VIEWS.tools = () => {
  const u = uLabel();
  const isLb = unit() === 'lb';
  const plates = isLb ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
  const bars = isLb ? [45, 35, 15] : [20, 15, 10];
  return {
    title: t('nav_tools'),
    html: `<div class="page tools">
      <section class="card" id="tool-1rm">
        <div class="card-head"><h3>${t('tool_1rm')}</h3></div>
        <p class="muted small">${t('tool_1rm_sub')}</p>
        <div class="inline-form">
          <label class="field"><span>${t('weight')} (${u})</span><input class="input" inputmode="decimal" data-tool="orm-w" value="100"/></label>
          <label class="field"><span>${t('reps')}</span><input class="input" inputmode="numeric" data-tool="orm-r" value="5"/></label>
        </div>
        <div class="tool-out" data-out="orm"></div>
      </section>
      <section class="card" id="tool-plates">
        <div class="card-head"><h3>${t('tool_plates')}</h3></div>
        <div class="inline-form">
          <label class="field"><span>${t('target')} (${u})</span><input class="input" inputmode="decimal" data-tool="pl-t" value="${isLb ? 225 : 100}"/></label>
          <label class="field"><span>${t('bar')}</span><select class="input" data-tool="pl-b">${bars.map((b2) => `<option value="${b2}">${b2} ${u}</option>`).join('')}</select></label>
        </div>
        <div class="chips-wrap">${plates.map((p) => `<label class="chip-check"><input type="checkbox" data-tool="pl-p" value="${p}" checked/><span>${p}</span></label>`).join('')}</div>
        <div class="tool-out" data-out="pl"></div>
      </section>
      <section class="card" id="tool-warm">
        <div class="card-head"><h3>${t('tool_warmup')}</h3></div>
        <p class="muted small">${t('tool_warmup_sub')}</p>
        <label class="field"><span>${t('working_weight')} (${u})</span><input class="input" inputmode="decimal" data-tool="wu-w" value="${isLb ? 225 : 100}"/></label>
        <div class="tool-out" data-out="wu"></div>
      </section>
      <section class="card" id="tool-timer">
        <div class="card-head"><h3>${t('tool_timer')}</h3></div>
        <div class="chips-wrap">${[30, 45, 60, 90, 120, 180, 240].map((s) => `<button class="chip" data-act="rest-start" data-s="${s}">${s >= 60 ? (s / 60) + ' ' + t('min_short') : s + ' ' + t('sec_short')}</button>`).join('')}</div>
      </section>
      <section class="card" id="tool-conv">
        <div class="card-head"><h3>${t('tool_convert')}</h3></div>
        <div class="inline-form">
          <label class="field"><span>${t('u_kg')}</span><input class="input" inputmode="decimal" data-tool="cv-kg" value="100"/></label>
          <label class="field"><span>${t('u_lb')}</span><input class="input" inputmode="decimal" data-tool="cv-lb" value="${r1(100 * LB)}"/></label>
        </div>
      </section>
    </div>`,
    after: (v) => updateTools(v),
  };
};

function updateTools(v, src) {
  const val = (k) => num(v.querySelector(`[data-tool="${k}"]`)?.value);
  const u = uLabel();
  // 1RM
  const w = val('orm-w'), r = val('orm-r');
  const o = v.querySelector('[data-out="orm"]');
  if (o) {
    if (w && r && r <= 30) {
      const ep = w * (1 + r / 30), br = r < 37 ? w * 36 / (37 - r) : ep;
      const est = r === 1 ? w : (ep + br) / 2;
      const rows = [100, 95, 90, 85, 80, 75, 70, 65, 60].map((p) => `<tr><td>${p}%</td><td><b>${fmtNum(Math.round(est * p / 100 * 2) / 2)}</b> ${u}</td><td class="muted">${ltr('≈' + { 100: 1, 95: 2, 90: 4, 85: 6, 80: 8, 75: 10, 70: 12, 65: 15, 60: 18 }[p])} ${t('reps_short')}</td></tr>`).join('');
      o.innerHTML = `<p class="tool-big"><b>${fmtNum(est)}</b> ${u}<small class="muted">${t('est_1rm')}</small></p><table class="ptable">${rows}</table>`;
    } else o.innerHTML = `<p class="muted">${t('enter_valid')}</p>`;
  }
  // plates
  const pt = val('pl-t'), pb = val('pl-b');
  const avail = [...v.querySelectorAll('[data-tool="pl-p"]:checked')].map((x) => num(x.value)).sort((a, b) => b - a);
  const po = v.querySelector('[data-out="pl"]');
  if (po) {
    if (pt && pb != null && pt >= pb) {
      let side = (pt - pb) / 2;
      const list = [];
      for (const p of avail) { const n = Math.floor((side + 1e-9) / p); if (n) { list.push({ w: p, n }); side -= n * p; } }
      const loaded = pb + 2 * list.reduce((a, x) => a + x.w * x.n, 0);
      po.innerHTML = `${list.length ? plateStack(list, unit()) : ''}
        <p>${list.length ? t('per_side') + ': ' + list.map((x) => `<b>${ltr(`${x.n}×${x.w}`)}</b>`).join(' + ') : t('just_bar')}</p>
        ${Math.abs(loaded - pt) > 0.01 ? `<p class="warn small">${t('closest', { w: fmtNum(loaded) + ' ' + u })}</p>` : ''}`;
    } else po.innerHTML = `<p class="muted">${t('target_gt_bar')}</p>`;
  }
  // warm-up
  const ww = val('wu-w');
  const wo = v.querySelector('[data-out="wu"]');
  if (wo) {
    if (ww) {
      const step = unit() === 'lb' ? 5 : 2.5, barW = unit() === 'lb' ? 45 : 20;
      const rnd = (x) => Math.max(barW, Math.round(x / step) * step);
      const scheme = [[0, 10], [0.4, 8], [0.6, 5], [0.75, 3], [0.85, 1]];
      wo.innerHTML = `<ol class="warm-list">${scheme.map(([p, rp]) => `<li><b>${p ? fmtNum(rnd(ww * p)) : barW} ${u}</b><span>${ltr(`× ${rp}`)}</span><small class="muted">${p ? Math.round(p * 100) + '%' : t('empty_bar')}</small></li>`).join('')}<li class="work"><b>${fmtNum(ww)} ${u}</b><span>${t('working_sets')}</span></li></ol>`;
    } else wo.innerHTML = '';
  }
  // converter
  if (src === 'cv-kg') { const k = val('cv-kg'); v.querySelector('[data-tool="cv-lb"]').value = k == null ? '' : r1(k * LB); }
  if (src === 'cv-lb') { const l = val('cv-lb'); v.querySelector('[data-tool="cv-kg"]').value = l == null ? '' : r1(l / LB); }
}

/* ---------- SETTINGS ---------- */
VIEWS.settings = () => {
  const P = S.profile;
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="set-seg" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return {
    title: t('nav_settings'),
    html: `<div class="page settings">
      <section class="card">
        <div class="card-head"><h3>${t('account')}</h3></div>
        <div class="acct">
          ${icon(isCloud ? 'cloud' : 'device')}
          <div><b>${esc(isCloud ? (S.user.email || '') : t('local_mode'))}</b><small class="muted">${isCloud ? t('cloud_sync_on') : t('local_mode_body')}</small></div>
        </div>
        <label class="field"><span>${t('your_name')}</span><input class="input" data-set="name" value="${esc(P.name || '')}"/></label>
        <button class="btn btn-ghost btn-sm" data-act="logout">${icon('logout')}${t('sign_out')}</button>
      </section>
      <section class="card">
        <div class="card-head"><h3>${t('training')}</h3></div>
        <div class="set-row"><span>${t('weekly_goal')}<small class="muted">${t('weekly_goal_sub')}</small></span>
          <div class="stepper"><button class="icon-btn sm" data-act="goal" data-d="-1" aria-label="−">${icon('minus')}</button><b>${P.weeklyGoal || 4}</b><button class="icon-btn sm" data-act="goal" data-d="1" aria-label="+">${icon('plus')}</button></div></div>
        <div class="set-row"><span>${t('units')}</span>${seg('units', [['kg', t('u_kg')], ['lb', t('u_lb')]], unit())}</div>
        <div class="set-row"><span>${t('week_starts')}</span>${seg('weekStart', [[6, dayName(6, 'short')], [0, dayName(0, 'short')], [1, dayName(1, 'short')]], weekStartDay())}</div>
        <div class="set-row"><span>${t('default_rest')}</span>
          <select class="input select-sm" data-set="rest">${[30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map((s) => `<option value="${s}" ${(P.rest || 90) === s ? 'selected' : ''}>${s} ${t('sec_short')}</option>`).join('')}</select></div>
        <div class="set-row"><span>${t('height')} (${t('cm')})</span><input class="input input-num" inputmode="numeric" data-set="height" value="${esc(P.height || '')}" placeholder="175"/></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${t('appearance')}</h3></div>
        <div class="set-row"><span>${t('language')}</span>${seg('lang', [['ar', 'العربية'], ['en', 'English']], lang())}</div>
        <div class="set-row"><span>${t('theme')}</span>${seg('theme', [['dark', t('dark')], ['light', t('light')], ['auto', t('auto')]], P.theme || prefs.theme || 'dark')}</div>
        <div class="set-row style-row"><span>${t('style')}<small class="muted">${t('style_sub')}</small></span>
          <div class="style-pick">${[['classic', 'st_classic'], ['iron', 'st_iron'], ['rose', 'st_rose']].map(([v, k]) => `
            <button class="style-opt ${(P.style || prefs.style || 'classic') === v ? 'on' : ''}" data-act="set-seg" data-k="style" data-v="${v}" aria-pressed="${(P.style || prefs.style || 'classic') === v}">
              <span class="style-swatch sw-${v}">${v === 'rose' ? bowSvg() : ''}</span><span>${t(k)}</span></button>`).join('')}</div></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${t('your_data')}</h3></div>
        <p class="muted small">${t('data_hint')}</p>
        <div class="row-actions start wrap">
          <button class="btn btn-ghost btn-sm" data-act="export-json">${icon('download')}${t('export_json')}</button>
          <button class="btn btn-ghost btn-sm" data-act="export-csv">${icon('download')}${t('export_csv')}</button>
          <label class="btn btn-ghost btn-sm">${icon('upload')}${t('import_json')}<input type="file" accept="application/json,.json" data-import hidden/></label>
        </div>
        <p class="muted small">${t('counts', { w: S.workouts.length, p: S.plans.length, b: S.bodyweight.length })}</p>
        <button class="btn btn-ghost btn-sm danger" data-act="wipe">${icon('trash')}${t('delete_all')}</button>
      </section>
      <p class="muted small center">${t('app_name')} v${VERSION} · ${isCloud ? 'Firebase' : t('local_mode')}</p>
    </div>`,
  };
};

/* =========================================================
   Sheets: picker, more menu, templates, exercise form
   ========================================================= */
function exercisePicker(onPick, title = t('add_exercise')) {
  let filter = 'all', q = '';
  const recent = [];
  sortedWorkouts().slice(0, 15).forEach((w) => w.exercises.forEach((e) => { if (!recent.includes(e.exId)) recent.push(e.exId); }));
  const listHtml = () => {
    const ql = q.trim().toLowerCase();
    let list = allExercises().filter((e) => (filter === 'all' || inGroup(e.muscle, filter)) && (!ql || `${e.en} ${e.ar} ${e.name || ''}`.toLowerCase().includes(ql)));
    const rec = !ql && filter === 'all' ? recent.slice(0, 8).map(getEx) : [];
    // the picture button lets you see what the exercise is before choosing it
    const row = (e) => `<div class="ex-row"><button class="ex-item" data-pick="${esc(e.id)}"><span class="ex-dot" style="background:var(--m-${e.muscle})"></span><span><b>${esc(exName(e))}</b><small>${t('m_' + e.muscle)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight') + '_short')}</small></span>${icon('plus')}</button><button class="icon-btn sm ex-peek" data-preview="${esc(e.id)}" aria-label="${t('ex_details')}">${icon('image')}</button></div>`;
    list = list.sort((a, b) => exName(a).localeCompare(exName(b)));
    return `${rec.length ? `<p class="list-label">${t('recent')}</p>${rec.map(row).join('')}<p class="list-label">${t('all_exercises')}</p>` : ''}${groupedRows(list, filter, row) || `<p class="muted center">${t('no_results')}</p>`}
      <button class="btn btn-dashed" data-new-ex>${icon('plus')}${t('new_exercise')}${ql ? `: “${esc(q)}”` : ''}</button>`;
  };
  openSheet(`<div class="sheet-body picker">
      <div class="sheet-title"><h3>${esc(title)}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <div class="search">${icon('search')}<input class="input" type="search" data-q placeholder="${t('search_ex')}" autofocus/></div>
      <div class="chips-scroll">${['all', ...GROUPS].map((m) => `<button class="chip ${m === 'all' ? 'chip-solid' : ''}" data-mf="${m}">${m === 'all' ? t('all') : t('m_' + m)}</button>`).join('')}</div>
      <div class="ex-list" data-list>${listHtml()}</div>
    </div>`, {
    wide: true,
    onMount: (s, close) => {
      const L = s.querySelector('[data-list]');
      s.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; L.innerHTML = listHtml(); });
      s.addEventListener('click', (e) => {
        const mf = e.target.closest('[data-mf]');
        if (mf) { filter = mf.dataset.mf; s.querySelectorAll('[data-mf]').forEach((b) => b.classList.toggle('chip-solid', b === mf)); L.innerHTML = listHtml(); }
        const pv = e.target.closest('[data-preview]');
        if (pv) { previewSheet(pv.dataset.preview, (id) => { close(); onPick(id); }); return; }
        const p = e.target.closest('[data-pick]');
        if (p) { close(); onPick(p.dataset.pick); }
        if (e.target.closest('[data-new-ex]')) { close(); exerciseForm(null, q, (id) => onPick(id)); }
      });
    },
  });
}

// Look at an exercise (photo, video link, steps) from inside the picker, with a button to choose it
function previewSheet(id, onChoose) {
  let stop = () => {};
  const e = getEx(id);
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${esc(exName(e))}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      ${demoHtml(id)}
      <p class="muted">${t('m_' + e.muscle)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight'))}</p>
      <div class="row-actions"><button class="btn btn-ghost" data-sheet-close>${t('close')}</button><button class="btn btn-primary" data-choose>${icon('plus')}${t('choose_ex')}</button></div>
    </div>`, {
    onClose: () => stop(),
    onMount: (s, close) => { stop = mountDemo(s); s.querySelector('[data-choose]').addEventListener('click', () => { close(); onChoose(id); }); },
  });
}

function exerciseForm(existing, presetName = '', onSaved) {
  const e = existing || { name: presetName, muscle: 'chest', equip: 'barbell', type: 'weight' };
  const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
  openSheet(`<form class="sheet-body" data-exform>
      <div class="sheet-title"><h3>${existing ? t('edit_exercise') : t('new_exercise')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <label class="field"><span>${t('name')}</span><input class="input" name="name" value="${esc(e.name || '')}" required autofocus/></label>
      <label class="field"><span>${t('muscle')}</span><select class="input" name="muscle">${MUSCLES.map((m) => `<option value="${m}" ${e.muscle === m ? 'selected' : ''}>${t('m_' + m)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('equipment')}</span><select class="input" name="equip">${EQUIP.map((m) => `<option value="${m}" ${e.equip === m ? 'selected' : ''}>${t('eq_' + m)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('tracking')}</span><select class="input" name="type">${['weight', 'bodyweight', 'time', 'carry', 'cardio'].map((m) => `<option value="${m}" ${e.type === m ? 'selected' : ''}>${t('ty_' + m)}</option>`).join('')}</select></label>
      <div class="cardio-opts" ${e.type === 'cardio' ? '' : 'hidden'}>
        <label class="field"><span>${t('dist_unit')}</span><select class="input" name="dist">${[['km', t('km')], ['m', t('m_short')], ['floors', t('floors')], ['', t('none')]].map(([v, l]) => `<option value="${v}" ${(e.dist === undefined ? 'km' : e.dist || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>${t('extra_field')}</span><select class="input" name="extra">${[['', t('none')], ...Object.keys(CARDIO_EXTRAS).map((k) => [k, extraLabel(k)])].map(([v, l]) => `<option value="${v}" ${(e.extra || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => {
      const form = s.querySelector('[data-exform]');
      form.elements.type.addEventListener('change', (ev) => { form.querySelector('.cardio-opts').hidden = ev.target.value !== 'cardio'; });
      form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const obj = { id: existing ? existing.id : 'c_' + uid(), name: String(fd.get('name')).trim(), muscle: fd.get('muscle'), equip: fd.get('equip'), type: fd.get('type'), createdAt: existing?.createdAt || Date.now() };
      if (obj.type === 'cardio') { obj.dist = fd.get('dist') || null; obj.extra = fd.get('extra') || null; }
      if (!obj.name) return;
      const i = S.exercises.findIndex((x) => x.id === obj.id);
      if (i >= 0) S.exercises[i] = obj; else S.exercises.push(obj);
      persist('exercises', obj);
      close();
      toast(t('saved'), 'success');
      if (onSaved) onSaved(obj.id); else render();
      });
    },
  });
}

// Demo images (start / end position, flipped back and forth), written steps and a video link
function demoHtml(id) {
  const e = getEx(id), m = MEDIA[id];
  const q = encodeURIComponent(`${e.en || exName(e)} exercise form`);
  const video = `<a class="btn btn-ghost btn-sm" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">${icon('video')}${t('demo_video')}</a>`;
  if (!m) return `<div class="demo demo-none"><p class="muted small">${t('demo_none')}</p>${video}</div>`;
  return `<div class="demo">
      <div class="demo-stage" data-demo-stage role="img" aria-label="${esc(exName(e))}" title="${t('demo_tap')}">
        ${m.imgs.map((p, i) => `<img src="${MEDIA_BASE}${p}" alt="" class="${i ? '' : 'on'}" draggable="false"/>`).join('')}
        <p class="demo-off" hidden>${t('demo_offline')}</p>
      </div>
      <div class="demo-bar">${video}<span class="muted small">${t('demo_tap')}</span></div>
      <details class="demo-steps"><summary>${t('demo_steps')}</summary><ol>${m.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p class="muted small">${t('demo_credit')}</p></details>
    </div>`;
}
function mountDemo(sheet) {
  const stage = sheet.querySelector('[data-demo-stage]');
  if (!stage) return () => {};
  const imgs = [...stage.querySelectorAll('img')];
  let i = 0, paused = false, loaded = 0;
  const show = (n) => { imgs.forEach((im, k) => im.classList.toggle('on', k === n)); };
  const timer = setInterval(() => { if (!paused && imgs.length > 1) { i = (i + 1) % imgs.length; show(i); } }, 900);
  stage.addEventListener('click', () => { paused = !paused; stage.classList.toggle('paused', paused); });
  imgs.forEach((im) => {
    im.addEventListener('load', () => { loaded++; stage.classList.add('ready'); });
    im.addEventListener('error', () => { if (!loaded) { stage.querySelector('.demo-off').hidden = false; imgs.forEach((x) => (x.hidden = true)); } });
  });
  return () => clearInterval(timer);
}

function exerciseSheet(id) {
  let stopDemo = () => {};
  const e = getEx(id);
  const b = bestsFor(id);
  const custom = !BUILTIN[id];
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${esc(exName(e))}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      ${demoHtml(id)}
      <p class="muted">${t('m_' + e.muscle)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight'))}</p>
      ${b.sessions ? `<div class="pr-grid">
        <div><small>${t('sessions')}</small><b>${b.sessions}</b></div>
        <div><small>${t('last_done')}</small><b>${fmtDate(b.last, { day: 'numeric', month: 'short' })}</b></div>
        ${e.type === 'weight' || !e.type ? `<div><small>${t('best_e1rm')}</small><b>${fmtW(b.e1rm)}</b></div><div><small>${t('heaviest')}</small><b>${fmtW(b.weight)}</b></div>` : otherCells(e.type, b, id)}
      </div>` : `<p class="muted">${t('never_done')}</p>`}
      <div class="row-actions start wrap">
        ${b.sessions ? `<a class="btn btn-primary btn-sm" href="#/progress/${encodeURIComponent(id)}" data-sheet-close>${icon('chart')}${t('view_progress')}</a>` : ''}
        ${S.active ? `<button class="btn btn-ghost btn-sm" data-add-active>${icon('plus')}${t('add_to_workout')}</button>` : ''}
        ${custom ? `<button class="btn btn-ghost btn-sm" data-edit>${icon('edit')}${t('edit')}</button><button class="btn btn-ghost btn-sm danger" data-del>${icon('trash')}${t('delete')}</button>` : ''}
      </div>
    </div>`, {
    onClose: () => stopDemo(),
    onMount: (s, close) => { stopDemo = mountDemo(s); s.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-edit]')) { close(); exerciseForm(S.exercises.find((x) => x.id === id)); }
      if (ev.target.closest('[data-add-active]')) { close(); addToActive(id); go('log'); }
      if (ev.target.closest('[data-del]')) {
        close();
        if (await confirmDialog({ title: t('delete_ex_q'), body: t('delete_ex_body'), ok: t('delete'), cancel: t('cancel'), danger: true })) {
          S.exercises = S.exercises.filter((x) => x.id !== id); unpersist('exercises', id); render();
        }
      }
    }); },
  });
}

function templatesSheet() {
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${t('pick_template')}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <p class="muted small">${t('template_hint')}</p>
      <div class="tpl-list">${TEMPLATES.map((tp) => `
        <button class="tpl" data-tpl="${tp.id}"><b>${esc(tp.name[lang()])}</b><small>${esc(tp.desc[lang()])}</small>
          <span class="day-chips">${tp.days.map((d) => `<span class="daychip">${esc(d.name[lang()])}</span>`).join('')}</span></button>`).join('')}</div>
    </div>`, {
    wide: true,
    onMount: (s, close) => s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tpl]');
      if (!b) return;
      const tp = TEMPLATES.find((x) => x.id === b.dataset.tpl);
      const plan = {
        id: uid(), name: tp.name[lang()], createdAt: Date.now(), active: !S.plans.some((p) => p.active),
        days: tp.days.map((d) => ({ id: uid(), name: d.name[lang()], weekday: d.weekday, items: d.items.map(([exId, sets, reps]) => ({ exId, sets, reps, rest: null })) })),
      };
      S.plans.push(plan); persist('plans', plan);
      close(); toast(t('plan_created'), 'success'); go('plan/' + plan.id);
    }),
  });
}

function moreSheet() {
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${t('more')}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <nav class="more-grid">${MORE.map(([r, ic, k]) => `<a href="#/${r}" data-sheet-close>${icon(ic)}<span>${t(k)}</span></a>`).join('')}</nav>
      <div class="acct small">${icon(isCloud ? 'cloud' : 'device')}<div><b>${esc(S.profile.name || t('athlete'))}</b><small class="muted">${esc(isCloud ? S.user.email || '' : t('local_mode'))}</small></div></div>
      <button class="btn btn-ghost" data-act="logout" data-sheet-close>${icon('logout')}${t('sign_out')}</button>
    </div>`);
}

function otherDaySheet() {
  const plan = activePlan();
  if (!plan) return templatesSheet();
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${t('choose_day')}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <div class="day-pick">${plan.days.map((d) => `<button class="day-btn" data-act="start-day" data-plan="${plan.id}" data-day="${d.id}"><b>${esc(d.name)}</b><small>${d.weekday != null ? dayName(d.weekday, 'long') : t('any_day')} · ${t('n_exercises', { n: d.items.length })}</small></button>`).join('')}</div>
    </div>`);
}

function addToActive(exId) {
  if (!S.active) return;
  const prev = lastSetsFor(exId, S.active.editingId);
  const n = exType(exId) === 'cardio' ? 1 : prev ? Math.min(prev.length, 6) : 3;
  S.active.exercises.push({ exId, target: '', rest: null, note: '', sets: Array.from({ length: n }, () => ({ w: '', r: '', x: '', done: false })) });
  saveActive(true);
}

function measureSheet() {
  openSheet(`<form class="sheet-body" data-msform>
      <div class="sheet-title"><h3>${t('add_measure')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <label class="field"><span>${t('date')}</span><input class="input" type="date" name="date" value="${dateKey()}" max="${dateKey()}" required/></label>
      <div class="measure-form">${MEASURE_KEYS.map((k) => `<label class="field"><span>${t('ms_' + k)} ${k === 'bodyfat' ? '(%)' : `(${t('cm')})`}</span><input class="input" inputmode="decimal" name="${k}"/></label>`).join('')}</div>
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => s.querySelector('[data-msform]').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const values = {};
      MEASURE_KEYS.forEach((k) => { const v = num(fd.get(k)); if (v != null && v > 0) values[k] = v; });
      if (!Object.keys(values).length) { toast(t('enter_one'), 'error'); return; }
      const m = { id: uid(), date: fd.get('date'), values };
      S.measurements.push(m); persist('measurements', m);
      close(); toast(t('saved'), 'success'); render();
    }),
  });
}

function addBodyweight(v, date) {
  const kg = fromDisp(v);
  if (!(kg > 20 && kg < 400)) { toast(t('enter_valid'), 'error'); return false; }
  const existing = S.bodyweight.find((x) => x.date === date);
  const entry = existing ? { ...existing, kg } : { id: uid(), date, kg };
  if (existing) Object.assign(existing, entry); else S.bodyweight.push(entry);
  persist('bodyweight', entry);
  toast(t('saved'), 'success');
  return true;
}

/* =========================================================
   Data import / export
   ========================================================= */
function exportJSON() {
  const data = { app: 'gymflow', version: 1, exportedAt: new Date().toISOString(), profile: S.profile, plans: S.plans, workouts: S.workouts, bodyweight: S.bodyweight, measurements: S.measurements, exercises: S.exercises };
  download(`gymflow-backup-${dateKey()}.json`, JSON.stringify(data, null, 2));
  toast(t('exported'), 'success');
}
function exportCSV() {
  const rows = [['date', 'workout', 'exercise', 'set', 'type', 'weight_kg', 'reps', 'seconds', 'minutes', 'distance', 'distance_unit', 'extra', 'e1rm_kg', 'duration_min']];
  sortedWorkouts().reverse().forEach((w) => w.exercises.forEach((e) => e.sets.forEach((s, j) => {
    const type = exType(e.exId), c = type === 'cardio' ? cardioDef(e.exId) : null;
    rows.push([
      w.date, w.title || '', exName(e.exId), j + 1, s.kind === 'warm' ? 'warmup' : type,
      isLoad(type) ? (s.w ?? '') : '',
      type === 'weight' || type === 'bodyweight' ? (s.r ?? '') : '',
      type === 'time' ? (s.r ?? '') : '',
      type === 'cardio' ? (s.r ?? '') : '',
      type === 'cardio' ? (c.dist ? (s.w ?? '') : '') : type === 'carry' ? (s.r ?? '') : '',
      type === 'cardio' ? (c.dist || '') : type === 'carry' ? 'm' : '',
      type === 'cardio' && c.extra ? `${c.extra}=${s.x ?? ''}` : '',
      type === 'weight' ? r1(e1rm(s.w || 0, s.r || 0)) : '', Math.round((w.duration || 0) / 60),
    ]);
  })));
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  download(`gymflow-workouts-${dateKey()}.csv`, csv, 'text/csv');
  toast(t('exported'), 'success');
}
async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'gymflow') throw new Error('bad');
    const ok = await confirmDialog({ title: t('import_q'), body: t('import_body', { w: (data.workouts || []).length, p: (data.plans || []).length }), ok: t('import_json'), cancel: t('cancel') });
    if (!ok) return;
    for (const col of ['plans', 'workouts', 'bodyweight', 'measurements', 'exercises']) {
      const list = (data[col] || []).filter((x) => x && x.id);
      if (!list.length) continue;
      const map = new Map(S[col].map((x) => [x.id, x]));
      list.forEach((x) => map.set(x.id, x));
      S[col] = [...map.values()];
      await store.putMany(col, list);
    }
    toast(t('imported'), 'success');
    render();
  } catch (e) {
    console.error(e);
    toast(t('import_err'), 'error');
  }
}

/* =========================================================
   Actions (event delegation)
   ========================================================= */
const plan = () => S.plans.find((p) => p.id === route().a);
const savePlan = (p) => persist('plans', p);
const A = {};

A['more'] = () => moreSheet();
A['templates'] = () => templatesSheet();
A['start-empty'] = () => startWorkout({});
A['start-other'] = () => otherDaySheet();
A['start-day'] = (el) => startWorkout({ planId: el.dataset.plan, dayId: el.dataset.day });
A['repeat'] = (el) => startWorkout({ fromWorkout: el.dataset.id });
A['go-train'] = () => go('log');
A['bw-quick'] = async () => {
  const v = await promptDialog({ title: t('log_weight') + ` (${uLabel()})`, ok: t('save'), cancel: t('cancel'), placeholder: '75', type: 'text' });
  if (v != null && num(v) != null && addBodyweight(num(v), dateKey())) render();
};

A['auth-tab'] = (el) => { S.ui.authTab = el.dataset.tab; renderAuth(); };
A['auth-lang'] = () => { prefs.lang = lang() === 'ar' ? 'en' : 'ar'; savePrefs(); applyAppearance(); renderAuth(); };
A['auth-google'] = async () => {
  try { await store.signInGoogle(); } catch (e) { showAuthErr(e); }
};
A['auth-reset'] = async () => {
  const email = document.querySelector('.auth-form [name="email"]')?.value.trim();
  if (!email) { showAuthErr({ code: 'auth/missing-email' }); return; }
  try { await store.resetPassword(email); toast(t('reset_sent'), 'success', 4000); } catch (e) { showAuthErr(e); }
};
function showAuthErr(e) {
  console.warn(e);
  const el = document.querySelector('.form-err');
  const msg = t(authErrorKey(e));
  if (el) el.textContent = msg; else toast(msg, 'error');
}

// Plans
A['new-plan'] = async () => {
  const name = await promptDialog({ title: t('new_plan'), ok: t('create'), cancel: t('cancel'), placeholder: t('plan_name_ph') });
  if (!name) return;
  const p = { id: uid(), name, createdAt: Date.now(), active: !S.plans.some((x) => x.active), days: [{ id: uid(), name: t('day') + ' 1', weekday: null, items: [] }] };
  S.plans.push(p); savePlan(p); go('plan/' + p.id);
};
A['day-add'] = () => { const p = plan(); p.days.push({ id: uid(), name: t('day') + ' ' + (p.days.length + 1), weekday: null, items: [] }); savePlan(p); render(); };
A['day-del'] = async (el) => {
  const p = plan(), d = +el.dataset.d;
  if (p.days[d].items.length && !(await confirmDialog({ title: t('delete_day_q'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
  p.days.splice(d, 1); savePlan(p); render();
};
A['day-move'] = (el) => { const p = plan(), d = +el.dataset.d, n = d + +el.dataset.dir; [p.days[d], p.days[n]] = [p.days[n], p.days[d]]; savePlan(p); render(); };
A['item-add'] = (el) => { const p = plan(), d = +el.dataset.d; exercisePicker((exId) => { p.days[d].items.push({ exId, ...itemDefaults(exId), rest: null }); savePlan(p); render(); }); };
A['item-menu'] = (el) => {
  const p = plan(), d = +el.dataset.d, i = +el.dataset.i, items = p.days[d].items;
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${esc(exName(items[i].exId))}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <div class="menu-list">
        <button data-m="up" ${i === 0 ? 'disabled' : ''}>${icon('up')}${t('move_up')}</button>
        <button data-m="down" ${i === items.length - 1 ? 'disabled' : ''}>${icon('down')}${t('move_down')}</button>
        <button data-m="swap">${icon('repeat')}${t('replace_ex')}</button>
        <button data-m="info">${icon('info')}${t('ex_details')}</button>
        <button data-m="del" class="danger">${icon('trash')}${t('remove')}</button>
      </div></div>`, {
    onMount: (s, close) => s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      close();
      const m = b.dataset.m;
      if (m === 'up' || m === 'down') { const n = i + (m === 'up' ? -1 : 1); [items[i], items[n]] = [items[n], items[i]]; }
      if (m === 'del') items.splice(i, 1);
      if (m === 'swap') return exercisePicker((exId) => { if (exType(exId) !== exType(items[i].exId)) Object.assign(items[i], itemDefaults(exId), { rest: null }); items[i].exId = exId; savePlan(p); render(); }, t('replace_ex'));
      if (m === 'info') return exerciseSheet(items[i].exId);
      savePlan(p); render();
    }),
  });
};
A['plan-dup'] = () => {
  const p = plan();
  const c = JSON.parse(JSON.stringify(p));
  c.id = uid(); c.name = p.name + ' ' + t('copy_suffix'); c.active = false; c.createdAt = Date.now();
  c.days.forEach((d) => (d.id = uid()));
  S.plans.push(c); savePlan(c); toast(t('duplicated'), 'success'); go('plan/' + c.id);
};
A['plan-del'] = async () => {
  const p = plan();
  if (!(await confirmDialog({ title: t('delete_plan_q'), body: t('delete_plan_body'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
  S.plans = S.plans.filter((x) => x.id !== p.id); unpersist('plans', p.id);
  if (p.active && S.plans[0]) { S.plans[0].active = true; savePlan(S.plans[0]); }
  go('plans');
};

// Logging
const act = () => S.active;
A['set-done'] = (el) => {
  const i = +el.dataset.i, j = +el.dataset.j, e = act().exercises[i], s = e.sets[j];
  const type = exType(e.exId);
  if (!s.done) {
    // fill blanks from placeholders
    const row = el.closest('.setrow');
    row.querySelectorAll('[data-f]').forEach((inp) => { if (!inp.value && inp.placeholder) { inp.value = inp.placeholder; s[inp.dataset.f] = inp.placeholder; } });
    if (num(s.r) == null && !(type === 'cardio' && num(s.w) != null)) { toast(t(type === 'cardio' ? 'enter_cardio' : 'enter_reps'), 'error'); row.querySelector('[data-f="r"]')?.focus(); return; }
    if ((type === 'weight' || type === 'carry') && num(s.w) == null) s.w = '0';
    s.done = true;
    // cardio has no rest between "sets"
    if (s.kind !== 'warm' && type !== 'cardio') startRest(e.rest || S.profile.rest || 90);
  } else s.done = false;
  saveActive(true); render();
};
A['set-add'] = (el) => {
  const e = act().exercises[+el.dataset.i];
  const last = e.sets[e.sets.length - 1];
  e.sets.push({ w: last ? last.w : '', r: last ? last.r : '', x: last ? last.x : '', done: false });
  saveActive(true); render();
};
A['set-remove'] = (el) => { const e = act().exercises[+el.dataset.i]; if (e.sets.length > 1) e.sets.pop(); saveActive(true); render(); };
A['set-kind'] = (el) => { const s = act().exercises[+el.dataset.i].sets[+el.dataset.j]; s.kind = s.kind === 'warm' ? undefined : 'warm'; saveActive(true); render(); };
A['ex-add'] = () => exercisePicker((exId) => { addToActive(exId); render(); setTimeout(() => document.querySelector('.exblock:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); });
A['ex-demo'] = (el) => exerciseSheet(act().exercises[+el.dataset.i].exId);
A['ex-menu'] = (el) => {
  const i = +el.dataset.i, list = act().exercises, e = list[i];
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${esc(exName(e.exId))}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      ${exType(e.exId) === 'cardio' ? '' : `<label class="field"><span>${t('rest_s')}</span><div class="chips-wrap">${[45, 60, 90, 120, 180, 240].map((s) => `<button class="chip ${(e.rest || S.profile.rest || 90) === s ? 'chip-solid' : ''}" data-rest="${s}">${s}</button>`).join('')}</div></label>`}
      <div class="menu-list">
        <button data-m="up" ${i === 0 ? 'disabled' : ''}>${icon('up')}${t('move_up')}</button>
        <button data-m="down" ${i === list.length - 1 ? 'disabled' : ''}>${icon('down')}${t('move_down')}</button>
        <button data-m="swap">${icon('repeat')}${t('replace_ex')}</button>
        <button data-m="info">${icon('chart')}${t('ex_details')}</button>
        <button data-m="del" class="danger">${icon('trash')}${t('remove_ex')}</button>
      </div></div>`, {
    onMount: (s, close) => s.addEventListener('click', (ev) => {
      const r = ev.target.closest('[data-rest]');
      if (r) { e.rest = +r.dataset.rest; saveActive(true); close(); render(); return; }
      const b = ev.target.closest('[data-m]'); if (!b) return;
      close();
      const m = b.dataset.m;
      if (m === 'up' || m === 'down') { const n = i + (m === 'up' ? -1 : 1); [list[i], list[n]] = [list[n], list[i]]; }
      if (m === 'del') list.splice(i, 1);
      if (m === 'swap') return exercisePicker((exId) => { e.exId = exId; saveActive(true); render(); }, t('replace_ex'));
      if (m === 'info') return exerciseSheet(e.exId);
      saveActive(true); render();
    }),
  });
};
A['finish'] = () => finishWorkout();
A['discard'] = async () => {
  const editing = act().editingId;
  if (!(await confirmDialog({ title: editing ? t('cancel_edit_q') : t('discard_q'), body: editing ? '' : t('discard_body'), ok: editing ? t('cancel_edit') : t('discard'), cancel: t('keep_going'), danger: true }))) return;
  S.active = null; saveActive(true); stopRest();
  go(editing ? 'workout/' + editing : 'home');
};
A['rest-adj'] = (el) => adjustRest(+el.dataset.d);
A['rest-skip'] = () => stopRest();
A['rest-start'] = (el) => startRest(+el.dataset.s);

// History
A['cal-nav'] = (el) => { const m = S.ui.histMonth; S.ui.histMonth = new Date(m.getFullYear(), m.getMonth() + +el.dataset.d, 1); render(); };
A['cal-day'] = (el) => {
  const ws = S.workouts.filter((w) => w.date === el.dataset.date);
  if (ws.length === 1) return go('workout/' + ws[0].id);
  openSheet(`<div class="sheet-body"><div class="sheet-title"><h3>${fmtDate(keyToDate(el.dataset.date), { weekday: 'long', day: 'numeric', month: 'long' })}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
    <div class="wlist" data-sheet-close>${ws.map(workoutRow).join('')}</div></div>`);
};
A['w-edit'] = (el) => editWorkout(el.dataset.id);
A['w-del'] = async (el) => {
  if (!(await confirmDialog({ title: t('delete_workout_q'), body: t('delete_workout_body'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
  S.workouts = S.workouts.filter((w) => w.id !== el.dataset.id); unpersist('workouts', el.dataset.id);
  toast(t('deleted'), 'success'); go('history');
};
A['w-to-plan'] = (el) => {
  const w = S.workouts.find((x) => x.id === el.dataset.id);
  const plans = S.plans;
  openSheet(`<div class="sheet-body"><div class="sheet-title"><h3>${t('save_as_day')}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
    <p class="muted small">${t('save_as_day_hint')}</p>
    <div class="menu-list">${plans.map((p) => `<button data-p="${p.id}">${icon('plans')}${esc(p.name)}</button>`).join('')}<button data-p="new">${icon('plus')}${t('new_plan')}</button></div></div>`, {
    onMount: (s, close) => s.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-p]'); if (!b) return;
      let p = S.plans.find((x) => x.id === b.dataset.p);
      if (!p) { p = { id: uid(), name: w.title || t('workout'), createdAt: Date.now(), active: !S.plans.some((x) => x.active), days: [] }; S.plans.push(p); }
      p.days.push({ id: uid(), name: w.title || t('day'), weekday: null, items: w.exercises.map((e) => ({ exId: e.exId, sets: e.sets.filter((x) => x.kind !== 'warm').length || e.sets.length, reps: e.target || String(Math.max(...e.sets.map((x) => x.r || 0))), rest: e.rest || null })) });
      savePlan(p); close(); toast(t('saved'), 'success'); go('plan/' + p.id);
    }),
  });
};

// Progress
A['prog-metric'] = (el) => { S.ui.progMetric = el.dataset.m; render(); };

// Body
A['bw-del'] = (el) => { S.bodyweight = S.bodyweight.filter((x) => x.id !== el.dataset.id); unpersist('bodyweight', el.dataset.id); render(); };
A['ms-add'] = () => measureSheet();
A['ms-del'] = (el) => { S.measurements = S.measurements.filter((x) => x.id !== el.dataset.id); unpersist('measurements', el.dataset.id); render(); };

// Exercises
A['ex-filter'] = (el) => { S.ui.exFilter = el.dataset.m; render(); };
A['ex-open'] = (el) => exerciseSheet(el.dataset.id);
A['ex-new'] = () => exerciseForm(null);

// Settings
A['set-seg'] = (el) => {
  const k = el.dataset.k; let v = el.dataset.v;
  if (k === 'weekStart') v = +v;
  S.profile[k] = v;
  if (k === 'lang' || k === 'theme' || k === 'style') { prefs[k] = v; savePrefs(); applyAppearance(); shellReset(); }
  saveProfile(); render();
};
A['goal'] = (el) => { S.profile.weeklyGoal = Math.min(7, Math.max(1, (S.profile.weeklyGoal || 4) + +el.dataset.d)); saveProfile(); render(); };
A['export-json'] = () => exportJSON();
A['export-csv'] = () => exportCSV();
A['wipe'] = async () => {
  if (!(await confirmDialog({ title: t('delete_all_q'), body: t('delete_all_body'), ok: t('delete_all'), cancel: t('cancel'), danger: true }))) return;
  const word = await promptDialog({ title: t('type_delete', { w: t('delete_word') }), ok: t('delete_all'), cancel: t('cancel') });
  if (word !== t('delete_word')) { if (word != null) toast(t('wipe_cancelled'), 'info'); return; }
  try {
    await store.deleteAllData();
    Object.assign(S, { plans: [], workouts: [], bodyweight: [], measurements: [], exercises: [], active: null });
    S.profile = { ...S.profile };
    saveActive(true);
    toast(t('all_deleted'), 'success'); go('home');
  } catch (e) { saveErr(e); }
};
A['logout'] = async () => {
  if (!(await confirmDialog({ title: t('sign_out_q'), body: isCloud ? '' : t('sign_out_local'), ok: t('sign_out'), cancel: t('cancel') }))) return;
  await store.signOut();
};

const shellReset = () => { const r = document.querySelector('.main-col'); if (r) document.getElementById('app').innerHTML = ''; };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

/* inputs */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('[data-f]') && S.active) {
    const s = S.active.exercises[+el.dataset.i]?.sets[+el.dataset.j];
    if (s) { s[el.dataset.f] = el.value; saveActive(); }
  } else if (el.matches('[data-title]') && S.active) { S.active.title = el.value; saveActive(); }
  else if (el.matches('[data-wnote]') && S.active) { S.active.notes = el.value; saveActive(); }
  else if (el.matches('[data-note]') && S.active) { S.active.exercises[+el.dataset.note].note = el.value; saveActive(); }
  else if (el.matches('[data-tool]')) updateTools(document.getElementById('view'), el.dataset.tool);
  else if (el.matches('[data-ex-search]')) {
    S.ui.exSearch = el.value;
    const pos = el.selectionStart;
    render();
    const n = document.querySelector('[data-ex-search]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-pe]')) {
    const p = plan(); if (!p) return;
    const d = +el.dataset.d, i = +el.dataset.i, k = el.dataset.pe;
    if (k === 'plan-name') p.name = el.value.trim() || p.name;
    if (k === 'plan-active') { S.plans.forEach((x) => { if (x.active && x.id !== p.id) { x.active = false; savePlan(x); } }); p.active = el.checked; }
    if (k === 'day-name') p.days[d].name = el.value.trim() || p.days[d].name;
    if (k === 'day-wd') p.days[d].weekday = el.value === '' ? null : +el.value;
    if (k === 'it-sets') p.days[d].items[i].sets = Math.max(1, Math.min(20, parseInt(el.value, 10) || 1));
    if (k === 'it-reps') p.days[d].items[i].reps = el.value.trim();
    if (k === 'it-rest') p.days[d].items[i].rest = num(el.value) || null;
    savePlan(p);
    if (k === 'plan-name') document.querySelector('.top-title').textContent = p.name;
    if (k === 'plan-active') toast(p.active ? t('now_active') : t('saved'), 'success');
  }
  if (el.matches('[data-set]')) {
    const k = el.dataset.set;
    S.profile[k] = k === 'rest' ? +el.value : k === 'height' ? (num(el.value) || null) : el.value.trim();
    saveProfile();
    toast(t('saved'), 'success', 1400);
    if (k === 'name') document.querySelector('.rail .who span') && (document.querySelector('.rail .who span').textContent = S.profile.name);
  }
  if (el.matches('[data-act-change="prog-ex"]')) go('progress/' + encodeURIComponent(el.value));
  if (el.matches('[data-import]') && el.files[0]) { importJSON(el.files[0]); el.value = ''; }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  const kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = new FormData(f);
  if (kind === 'local-start') {
    await store.signUp(String(fd.get('name') || '').trim(), '');
  } else if (kind === 'auth') {
    const btn = f.querySelector('.btn-primary');
    btn.disabled = true; btn.classList.add('loading');
    f.querySelector('.form-err').textContent = '';
    try {
      if (S.ui.authTab === 'up') {
        const nm = String(fd.get('name')).trim();
        await store.signUp(nm, String(fd.get('email')).trim(), String(fd.get('pw')));
        let tries = 0;
        const apply = () => { if (S.loaded) { if (!S.profile.name) { S.profile.name = nm; saveProfile(); render(); } } else if (tries++ < 50) setTimeout(apply, 200); };
        apply();
      }
      else await store.signIn(String(fd.get('email')).trim(), String(fd.get('pw')));
    } catch (err) { showAuthErr(err); }
    btn.disabled = false; btn.classList.remove('loading');
  } else if (kind === 'bw') {
    const v = num(fd.get('v'));
    if (v != null && addBodyweight(v, fd.get('d'))) render();
  }
});

// Enter in set inputs jumps to the next input
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('.set-in')) return;
  e.preventDefault();
  const all = [...document.querySelectorAll('.set-in')];
  const n = all[all.indexOf(e.target) + 1];
  if (n) n.focus(); else e.target.blur();
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* =========================================================
   Boot
   ========================================================= */
async function boot() {
  applyAppearance();
  try {
    store = await createStore();
  } catch (e) {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="fatal"><h2>${t('err_boot')}</h2><p>${esc(e.message || e)}</p></div>`;
    return;
  }
  store.init(async (user) => {
    const prevUid = S.user && S.user.uid;
    S.user = user;
    if (!user) {
      S.loaded = false;
      Object.assign(S, { profile: {}, plans: [], workouts: [], bodyweight: [], measurements: [], exercises: [], active: null });
      applyAppearance();
      document.getElementById('app').innerHTML = '';
      renderAuth();
      return;
    }
    if (prevUid === user.uid && S.loaded) return;
    S.loaded = false;
    document.getElementById('app').innerHTML = `<div class="splash">${brandMark()}<p>${t('loading')}</p></div>`;
    try {
      const data = await store.loadAll();
      Object.assign(S, data);
      S.profile = { weeklyGoal: 4, rest: 90, units: 'kg', weekStart: 0, ...(data.profile || {}) };
      if (!S.profile.name && user.displayName) S.profile.name = user.displayName;
      if (!S.profile.lang && prefs.lang) S.profile.lang = prefs.lang;
      if (!S.profile.theme && prefs.theme) S.profile.theme = prefs.theme;
      if (!S.profile.style && prefs.style) S.profile.style = prefs.style;
      if (S.profile.style) { prefs.style = S.profile.style; savePrefs(); }
      if (!data.profile || !data.profile.createdAt) { S.profile.createdAt = Date.now(); saveProfile(); }
      loadActive();
      S.loaded = true;
      applyAppearance();
      document.getElementById('app').innerHTML = '';
      if (!location.hash) history.replaceState(null, '', '#/home');
      render();
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = `<div class="fatal">${brandMark()}<h2>${t('err_load')}</h2><p class="muted">${esc(e.code || e.message || '')}</p><button class="btn btn-primary" onclick="location.reload()">${t('retry')}</button></div>`;
    }
  });
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
