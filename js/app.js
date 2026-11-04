import { createStore, isCloud, uid, authErrorKey } from './store.js';
import { EXERCISES, TEMPLATES, MUSCLES, GROUPS, PARTS, CARDIO_EXTRAS, inGroup } from './data.js';
import { T } from './i18n.js';
import { MEDIA, MEDIA_BASE } from './exmedia.js';
import { STEPS_AR } from './exsteps.js';
import { ADMIN_UIDS } from './roles.js';
import { esc, icon, toast, openSheet, closeAllSheets, confirmDialog, promptDialog, beep, unlockAudio, download } from './ui.js';
import { lineChart, barChart, hBars, sparkline, barbell, plateStack, chartSlot, mountCharts, resetCharts } from './charts.js';

const VERSION = '1.14.3';

/* =========================================================
   State
   ========================================================= */
const S = {
  user: null, loaded: false,
  profile: {}, plans: [], workouts: [], bodyweight: [], measurements: [], exercises: [],
  rewards: [], adminEx: [], perms: {}, shared: [], sharedReady: false,
  active: null,
  ui: { histMonth: null, exFilter: 'all', exSub: '', exSearch: '', authTab: 'in' },
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
// "Total lifted" is always shown in full (e.g. 1,275 kg), never shortened
const fmtTotal = (kg) => fmtW(kg);
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
const getEx = (id) => BUILTIN[id] || S.exercises.find((e) => e.id === id) || S.adminEx.find((e) => e.id === id) || { id, en: id, ar: id, name: t('unknown_ex'), muscle: 'full', equip: 'other', type: 'weight' };
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
// Sections you make yourself live in your profile; each exercise points to its section (cat) and part
const userSections = () => S.profile.sections || [];
const secById = (id) => userSections().find((x) => x.id === id);
// the short way an exercise is counted, left out when it only repeats the equipment name (bodyweight)
const typeTag = (e) => { const tt = t('ty_' + (e.type || 'weight') + '_short'); return tt === t('eq_' + e.equip) ? '' : ` · ${tt}`; };
const muscleName = (e) => {
  const sc = e.cat && secById(e.cat);
  if (sc) { const pt = (sc.parts || []).find((p) => p.id === e.part); return pt ? `${sc.name} · ${pt.name}` : sc.name; }
  return t('m_' + e.muscle);
};
const matchGroup = (e, g, sub) => {
  if (g === 'all') return true;
  if (g === 'custom') return !e.builtin;
  if (g.startsWith('cat:')) return e.cat === g.slice(4) && (!sub || e.part === sub);
  return inGroup(e.muscle, g) && (!sub || e.muscle === sub);
};
const partsOf = (g) => (g.startsWith('cat:') ? ((secById(g.slice(4)) || {}).parts || []).map((p) => [p.id, p.name]) : (PARTS[g] || []).map((m) => [m, t('m_' + m)]));

// Custom sections: a box you design yourself. "check" = just a tick and a note; "custom" = the boxes you pick.
const BOXES = [['w', 'box_kg'], ['reps', 'box_reps'], ['min', 'box_min'], ['sec', 'box_sec'], ['km', 'box_km'], ['m', 'box_m'], ['kcal', 'box_kcal']];
// the ready-made boxes have a fixed unit of their own
const AUTO_UNIT = { min: 'min_short', sec: 'sec_short', km: 'km', m: 'm_short', kcal: 'box_kcal' };
const isCat = (k) => BOXES.some(([x]) => x === k);
const isSection = (type) => type === 'check' || type === 'custom';
// A section is a list of rows; each row has a title and its own boxes. Sections made before rows had their own boxes
// have one list of boxes (and optional row titles) shared by all rows, which is read here as the same list on every row.
const sectionRows = (exId) => {
  const rec = getEx(exId);
  if (rec.rows && rec.rows.length) return rec.rows;
  const n = Math.max(1, (rec.rowTitles || []).length);
  return Array.from({ length: n }, (_, i) => ({ title: (rec.rowTitles || [])[i] || '', fields: rec.fields || [] }));
};
const rowDef = (exId, j) => { const rows = sectionRows(exId); return rows[Math.min(Math.max(j || 0, 0), rows.length - 1)]; };
const sectionFields = (exId) => rowDef(exId, 0).fields;
const rowCount = (exId) => (isSection(exType(exId)) ? sectionRows(exId).length : 1);
const boxName = (b) => b.label || t((BOXES.find(([k]) => k === b.k) || [])[1] || 'box_min');
const boxUnit = (b) => (b.k === 'w' ? uLabel() : b.unit || (AUTO_UNIT[b.k] ? t(AUTO_UNIT[b.k]) : ''));
const boxLabel = (b) => boxName(b) + (boxUnit(b) ? ` (${boxUnit(b)})` : '');
// the kilogram box follows your unit setting (kg or lb), like the weight of a normal exercise
const boxText = (b, v, aUnit) => (b.k === 'w' ? `${fmtNum(aUnit === 'lb' ? v * LB : v)} ${t('u_' + (aUnit || unit()))}` : `${fmtNum(v)} ${boxUnit(b) || boxName(b)}`);
// the fixed numbers of a section (e.g. "8 تكرار"), shown as its target in the plan instead of a box to fill in
const fixedSummary = (exId) => (exType(exId) !== 'custom' ? '' : [...new Set(sectionRows(exId).flatMap((r) => r.fields.filter((b) => b.fixed != null).map((b) => boxText(b, b.fixed))))].join(' · '));
const hasLoadBox = (exId) => exType(exId) === 'custom' && sectionRows(exId).some((r) => r.fields.some((b) => b.k === 'w'));
const rowTitle = (exId, j) => String((sectionRows(exId)[j] || {}).title || '').trim();
const noSets = (exId) => { const ty = exType(exId); return ty === 'cardio' || isSection(ty); };
const blankSet = (exId, j = 0) => {
  const st = { w: '', r: '', x: '', done: false };
  if (exType(exId) === 'custom') rowDef(exId, j).fields.forEach((b) => (st[b.k] = b.fixed != null ? String(b.fixed) : ''));
  return st;
};
const colsBase = (exId) => {
  const type = exType(exId);
  if (type === 'check') return [];
  if (type === 'custom') return sectionFields(exId).map((b) => ({ f: b.k, l: boxLabel(b) }));
  if (type === 'weight') return [{ f: 'w', l: uLabel() }, { f: 'r', l: t('reps') }];
  if (type === 'bodyweight') return [{ f: 'w', l: '+' + uLabel() }, { f: 'r', l: t('reps') }];
  if (type === 'time') return [{ f: 'r', l: t('sec') }];
  if (type === 'carry') return [{ f: 'w', l: uLabel() }, { f: 'r', l: t('m_short') }];
  const c = cardioDef(exId);
  return [{ f: 'r', l: t('min') }, ...(c.dist ? [{ f: 'w', l: distLabel(c.dist) }] : []), ...(c.extra ? [{ f: 'x', l: extraLabel(c.extra) }] : [])];
};
// column headings can be renamed per exercise (labels), unless the plain names are asked for
const colsFor = (exId, plain) => {
  const cols = colsBase(exId), o = !plain && (getEx(exId).labels || (S.profile.labels || {})[exId]);
  return o ? cols.map((c) => ({ ...c, l: o[c.f] || c.l })) : cols;
};
// What a plan item asks for, e.g. "4×8", "30 min", "3×45s"
const targetText = (it) => {
  const type = exType(it.exId), reps = esc(it.reps || '');
  if (isSection(type)) return reps;
  if (type === 'cardio') return reps ? `${reps} ${t('min_short')}` : '';
  if (type === 'time') return `${it.sets}×${reps}${t('sec_short')}`;
  if (type === 'carry') return `${it.sets}×${reps}${t('m_short')}`;
  return `${it.sets}×${reps}`;
};
const itemDefaults = (exId) => {
  const type = exType(exId);
  if (isSection(type)) return { sets: 1, reps: '' };
  return type === 'cardio' ? { sets: 1, reps: '30' } : type === 'time' ? { sets: 3, reps: '45' } : type === 'carry' ? { sets: 3, reps: '30' } : type === 'bodyweight' ? { sets: 3, reps: '10-15' } : { sets: 3, reps: '8-12' };
};

/* =========================================================
   Workout analytics
   ========================================================= */
const sortedWorkouts = () => [...S.workouts].sort((a, b) => (b.start || 0) - (a.start || 0));
// Total lifted = the weights you logged added together (reps are not multiplied in)
const setsTotal = (sets) => (sets || []).reduce((s, x) => s + (x.w || 0), 0);
const workoutTotal = (w) => (w.exercises || []).reduce((sum, e) => (isLoad(exType(e.exId)) || hasLoadBox(e.exId) ? sum + setsTotal(e.sets) : sum), 0);
// personal records from older versions included an estimated 1RM kind; it is no longer shown
const prsOf = (w) => (w.prs || []).filter((p) => p.kind !== 'e1rm');
const workoutSets = (w) => (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);

// Best-of stats for types that are not weight × reps
function otherCells(type, b, exId) {
  const cell = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  if (isSection(type)) return '';
  if (type === 'cardio') {
    const c = cardioDef(exId);
    return cell(t('met_mins'), `${b.reps} ${t('min_short')}`) + (c.dist ? cell(t('met_dist'), `${fmtNum(b.weight)} ${distLabel(c.dist)}`) : '');
  }
  if (type === 'carry') return cell(t('heaviest'), fmtW(b.weight)) + cell(t('met_meters'), `${b.reps} ${t('m_short')}`);
  if (type === 'time') return cell(t('met_secs'), `${b.reps} ${t('sec_short')}`);
  return cell(t('most_reps'), b.reps);
}

function bestsFor(exId, excludeId, before = Infinity) {
  const b = { weight: 0, reps: 0, total: 0, sessions: 0, last: null };
  for (const w of S.workouts) {
    if (w.id === excludeId || (w.start || 0) >= before) continue;
    for (const e of w.exercises || []) {
      if (e.exId !== exId) continue;
      b.sessions++;
      if (!b.last || w.start > b.last) b.last = w.start;
      for (const s of e.sets || []) {
        b.weight = Math.max(b.weight, s.w || 0);
        b.reps = Math.max(b.reps, s.r || 0);
      }
      b.total = Math.max(b.total, setsTotal(e.sets));
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
    out.push({ start: s, count: ws.length, total: ws.reduce((a, w) => a + workoutTotal(w), 0) });
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

/* =========================================================
   Persistence helpers
   ========================================================= */
const saveErr = (err) => { console.error(err); toast(t('err_save'), 'error'); };
const persist = (col, obj) => { store.put(col, obj).catch(saveErr); if (col === 'exercises') syncShared(); };
const unpersist = (col, id) => { store.remove(col, id).catch(saveErr); if (col === 'exercises') syncShared(); };
let profileTimer;
const saveProfile = () => { clearTimeout(profileTimer); profileTimer = setTimeout(() => store.setProfile(S.profile).catch(saveErr), 300); syncShared(); };

/* ---------- Shared templates and sections: what you save is visible to everyone, who can copy it ---------- */
const myShareId = (x) => `${S.user.uid}_${x}`;
const shareRows = (rows) => (rows || []).slice(0, 10).map((r) => ({
  title: String(r.title || '').slice(0, 30),
  fields: (r.fields || []).slice(0, 6).map((f) => ({ k: f.k === 'w' || isCat(f.k) ? f.k : '', label: f.label || '', ...(f.unit ? { unit: f.unit } : {}), ...(f.fixed != null ? { fixed: f.fixed } : {}) })),
}));
function wantedShares() {
  const owner = S.profile.username || S.profile.name || '';
  const tpl = userMethods().map((m) => ({ id: myShareId('t_' + m.id), kind: 'tpl', name: String(m.name || '').slice(0, 40), rows: shareRows(m.rows || [{ title: '', fields: m.fields || [] }]) }));
  return tpl.map((d) => ({ ...d, ownerName: String(owner).slice(0, 40) }));
}
let shareTimer;
function syncShared() {
  clearTimeout(shareTimer);
  shareTimer = setTimeout(async () => {
    if (!S.user || !S.loaded || !S.sharedReady) return;
    const sig = (d) => JSON.stringify([d.kind, d.name, d.rows, d.ownerName]);
    const mine = S.shared.filter((d) => d.ownerUid === S.user.uid);
    const want = wantedShares();
    try {
      for (const d of want) {
        const cur = mine.find((x) => x.id === d.id);
        if (cur && sig(cur) === sig(d)) continue;
        const full = { ...d, at: Date.now() };
        await store.sharedPut(full);
        S.shared = [...S.shared.filter((x) => x.id !== d.id), { ...full, ownerUid: S.user.uid }];
      }
      for (const d of mine) {
        if (want.some((x) => x.id === d.id)) continue;
        await store.sharedDel(d.id);
        S.shared = S.shared.filter((x) => x.id !== d.id);
      }
    } catch (e) { console.warn('shared', e); }
  }, 1200);
}
async function loadShared() {
  try { S.shared = await store.sharedList(); S.sharedReady = true; } catch (e) { console.warn('shared', e); }
  return S.shared;
}
// what other people shared, newest first
const othersShared = () => S.shared.filter((d) => d.ownerUid !== S.user.uid && d.kind === 'tpl' && d.rows && d.rows.length).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 40);

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
const R = { end: 0, total: 0, tick: null, alarm: null };

// The timer works from an end time (not a counter), so it stays correct after the phone sleeps.
// While it runs we keep the screen awake and, if allowed, send a notification when the rest is over.
async function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* ignore */ }
}
async function notifyRestOver() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: t('rest_done'), icon: 'assets/icon-192.png', tag: 'gymflow-rest', renotify: true, vibrate: [200, 100, 200] };
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(t('app_name'), opts); else new Notification(t('app_name'), opts);
  } catch { /* ignore */ }
}
const armAlarm = () => { clearTimeout(R.alarm); R.alarm = setTimeout(drawRest, Math.max(0, R.end - Date.now()) + 50); };
const trainingScreen = () => route().name === 'log' && !!S.active;

function startRest(sec) {
  unlockAudio();
  askNotify();
  R.total = sec; R.end = Date.now() + sec * 1000;
  localStorage.setItem(REST_KEY, JSON.stringify({ end: R.end, total: R.total }));
  setWake(true);
  armAlarm();
  runRest();
}
function stopRest() {
  R.end = 0; clearInterval(R.tick); R.tick = null; clearTimeout(R.alarm);
  localStorage.removeItem(REST_KEY);
  const bar = document.getElementById('restbar');
  if (bar) bar.classList.remove('show');
  if (!trainingScreen()) setWake(false);
}
function adjustRest(d) {
  if (!R.end) return;
  R.end = Math.max(Date.now() + 1000, R.end + d * 1000); R.total = Math.max(R.total + d, 5);
  localStorage.setItem(REST_KEY, JSON.stringify({ end: R.end, total: R.total }));
  armAlarm();
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
    const away = document.visibilityState !== 'visible';
    stopRest();
    beep();
    toast(t('rest_done'), 'success');
    if (away) notifyRestOver();
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (trainingScreen() || R.end) setWake(true);
  if (R.end) drawRest(); // catch up right away if the rest ended while the screen was off
});

/* =========================================================
   Router + shell
   ========================================================= */
const route = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: parts[0] || 'home', a: parts[1] ? decodeURIComponent(parts[1]) : null, b: parts[2] ? decodeURIComponent(parts[2]) : null };
};
const go = (path) => { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; };

const MORE = [
  ['exercises', 'library', 'nav_exercises'],
  ['settings', 'settings', 'nav_settings'],
];

/* ---------- Pink theme effects: hearts when you tick, petals when you finish ---------- */
const isRose = () => document.documentElement.dataset.style === 'rose';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function burst(x, y, glyphs = ['♥', '♡', '✿'], n = 7) {
  if (!isRose() || calm()) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'fx-piece';
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `left:${x}px;top:${y}px;--dx:${((Math.random() - 0.5) * 100).toFixed(0)}px;--dy:${(-40 - Math.random() * 80).toFixed(0)}px;--rot:${((Math.random() - 0.5) * 90).toFixed(0)}deg;animation-delay:${i * 40}ms;font-size:${12 + Math.random() * 11}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}
function rain(n = 26) {
  if (!isRose() || calm()) return;
  const glyphs = ['♥', '♡', '✿', '❀', '✦'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'fx-rain';
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `left:${(Math.random() * 100).toFixed(1)}vw;font-size:${12 + Math.random() * 14}px;--dur:${(2.6 + Math.random() * 2).toFixed(2)}s;--sway:${((Math.random() - 0.5) * 120).toFixed(0)}px;--spin:${((Math.random() - 0.5) * 600).toFixed(0)}deg;animation-delay:${(Math.random() * 1.1).toFixed(2)}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }
}
document.addEventListener('click', (e) => {
  if (!isRose()) return;
  const bow = e.target.closest('.bow');
  if (bow) {
    bow.classList.remove('wiggle'); void bow.getBoundingClientRect(); bow.classList.add('wiggle');
    const r = bow.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, ['♥', '♡'], 8);
  }
  const star = e.target.closest('.stars-big');
  if (star) { const r = star.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, ['★', '✦', '✧'], 10); }
});

/* ---------- Stars: given by the owner, shown to each member on Home ---------- */
const devAdmin = () => { try { return localStorage.getItem('gymflow:dev-admin') === '1'; } catch { return false; } };
const starsOn = () => isCloud || devAdmin();
const namesOn = () => isCloud || devAdmin();
// the owner (listed in roles.js and in the rules) can do everything; others only what the owner switched on for them
const isSuper = () => !!S.user && (isCloud ? ADMIN_UIDS.includes(S.user.uid) : devAdmin());
const can = (p) => isSuper() || !!S.perms[p];
const hasControl = () => can('view') || can('stars');
const starsTotal = () => Math.max(0, S.rewards.reduce((a, r) => a + (Number(r.stars) || 0), 0));
// the bottom bar: the last tab is Control for people who have it, otherwise Settings
const navItems = () => [
  ['home', 'home', 'nav_home'],
  ['plans', 'plans', 'nav_plans'],
  ['log', 'dumbbell', 'nav_train'],
  ['history', 'calendar', 'nav_history'],
  hasControl() ? ['control', 'star', 'nav_control'] : ['settings', 'settings', 'nav_settings'],
];
const moreItems = () => { const inBar = new Set(navItems().map((x) => x[0])); return MORE.filter((m) => !inBar.has(m[0])); };
const navGroup = (r) => ({ workout: 'history', plan: 'plans', admin: 'control' }[r] || r);

function shell() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <aside class="rail">
      <a class="brand" href="#/home">${brandMark()}<span>${t('app_name')}</span></a>
      <nav class="rail-nav">
        ${[...navItems(), ...moreItems()].map(([r, ic, k]) => `<a href="#/${r}" data-nav="${r}">${icon(ic)}<span>${t(k)}</span></a>`).join('')}
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
      ${navItems().map(([r, ic, k]) => `<a href="#/${r}" data-nav="${r}" class="${r === 'log' ? 'tab-train' : ''}">${r === 'log' ? `<span class="train-dot">${icon(ic)}</span>` : icon(ic)}<span>${t(k)}</span></a>`).join('')}
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
  if (r.name !== 'control' && r.name !== 'admin') S.adminEx = [];
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
  setWake(trainingScreen() || R.end > Date.now());
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
  refreshRewards();
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

  const hero = `<section class="hero" style="--bow-scale:${(1 + 0.3 * Math.min(1, done / Math.max(1, goal))).toFixed(2)}">
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
  const weekVol = weekW.reduce((a, w) => a + workoutTotal(w), 0);
  const weekTime = weekW.reduce((a, w) => a + (w.duration || 0), 0);
  const stats = `<div class="stats">
    <div class="stat">${icon('flame')}<b>${goalStreak()}</b><span>${t('streak_weeks')}</span></div>
    <div class="stat">${icon('calendar')}<b>${monthCount}</b><span>${t('this_month')}</span></div>
    <div class="stat">${icon('dumbbell')}<b>${fmtTotal(weekVol)}</b><span>${t('week_total')}</span></div>
    <div class="stat">${icon('timer')}<b>${fmtDurShort(weekTime)}</b><span>${t('week_time')}</span></div>
  </div>`;

  return {
    title: t('nav_home'),
    html: `<div class="page home">${hero}${starsCard()}${nameBanner()}${resume}${todayHtml}${stats}</div>`,
  };
};

const prValue = (p) => (p.kind === 'reps' ? `${p.value} ${t('reps_short')}` : fmtW(p.value));

function workoutRow(w) {
  const names = (w.exercises || []).map((e) => exName(e.exId));
  return `<a class="wrow" href="#/workout/${w.id}">
    <span class="wrow-date"><b>${new Date(w.start).getDate()}</b><small>${fmtDate(w.start, { month: 'short' })}</small></span>
    <span class="wrow-main"><b>${esc(w.title || t('workout'))}${prsOf(w).length ? ` <span class="badge-pr">${icon('trophy')}${prsOf(w).length}</span>` : ''}</b>
      <small>${esc(names.slice(0, 4).join(SEP()))}${names.length > 4 ? ' +' + (names.length - 4) : ''}</small></span>
    <span class="wrow-meta"><small>${fmtDurShort(w.duration || 0)}</small><small>${fmtTotal(workoutTotal(w))}</small></span>
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
          <button class="item-name" data-act="item-menu" data-d="${di}" data-i="${ii}">${esc(exName(it.exId))}<small>${muscleName(getEx(it.exId))}${exType(it.exId) === 'cardio' ? ` · ${t('ty_cardio_short')}` : ''}</small></button>
          ${noSets(it.exId)
            ? `<span class="item-na">–</span>
          ${fixedSummary(it.exId) ? `<span class="item-fixed">${esc(fixedSummary(it.exId))}</span>` : `<input class="input input-num" value="${esc(it.reps)}" placeholder="${isSection(exType(it.exId)) ? t('target') : t('min')}" data-pe="it-reps" data-d="${di}" data-i="${ii}" aria-label="${isSection(exType(it.exId)) ? t('target') : t('min')}"/>`}
          <span class="item-na">–</span>`
            : `<input class="input input-num" inputmode="numeric" value="${esc(it.sets)}" data-pe="it-sets" data-d="${di}" data-i="${ii}" aria-label="${t('sets')}"/>
          <input class="input input-num" value="${esc(it.reps)}" placeholder="${exType(it.exId) === 'time' ? t('sec') : exType(it.exId) === 'carry' ? t('m_short') : ''}" data-pe="it-reps" data-d="${di}" data-i="${ii}" aria-label="${t('reps')}"/>
          <input class="input input-num" inputmode="numeric" value="${esc(it.rest ?? '')}" placeholder="${S.profile.rest || 90}" data-pe="it-rest" data-d="${di}" data-i="${ii}" aria-label="${t('rest_s')}"/>`}
          <button class="icon-btn sm" data-act="item-menu" data-d="${di}" data-i="${ii}" aria-label="${t('more')}">${icon('more')}</button>
        </div>`).join('')}
      </div>
      <div class="row-actions start">
        <button class="btn btn-ghost btn-sm" data-act="item-add" data-d="${di}">${icon('plus')}${t('add_exercise')}</button>
        <button class="btn btn-ghost btn-sm" data-act="section-add" data-d="${di}">${icon('plus')}${t('add_section')}</button>
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

function prevText(type, s, aUnit, exId, j) {
  if (!s) return '–';
  if (type === 'check') return '✓';
  if (type === 'custom') {
    const parts = rowDef(exId, s.row ?? j ?? 0).fields.filter((b) => s[b.k] != null && s[b.k] !== '').map((b) => boxText(b, s[b.k], aUnit));
    return parts.join(' · ') || '✓';
  }
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
    const section = isSection(type);
    const noRest = cardio || section;
    const cols = colsFor(e.exId);
    const prev = lastSetsFor(e.exId, A.editingId, before) || [];
    const sigState = { sig: null };
    const rows = e.sets.map((s, j) => {
      if (section) return sectionRowHtml(e, i, s, j, prev, A, sigState);
      const p = prev[j] || prev[prev.length - 1];
      const ph = (f) => { if (!p) return ''; const v = p[f]; if (v == null) return ''; return f === 'w' && (isLoad(type) || hasLoadBox(e.exId)) ? fmtNum(A.unit === 'lb' ? v * LB : v) : fmtNum(v); };
      // only weight exercises have warm-up sets; other types just number their rows
      const no = type === 'weight'
        ? `<button class="setno ${s.kind === 'warm' ? 'warm' : ''}" data-act="set-kind" data-i="${i}" data-j="${j}" aria-label="${t('set_type')}">${s.kind === 'warm' ? 'W' : j + 1 - e.sets.slice(0, j).filter((x) => x.kind === 'warm').length}</button>`
        : section ? `<button type="button" class="setno" data-act="row-title" data-i="${i}" data-j="${j}" aria-label="${t('rename_row')}">${j + 1}</button>`
        : `<span class="setno">${j + 1}</span>`;
      const cap = type === 'custom' && rowTitle(e.exId, j) ? `<div class="row-cap">${esc(rowTitle(e.exId, j))}</div>` : '';
      return `${cap}<div class="setrow ${s.done ? 'done' : ''} cols-${cols.length} nopre" style="--n:${cols.length}" data-i="${i}" data-j="${j}">
        ${no}
        ${type === 'check' ? `<button type="button" class="check-label ${rowTitle(e.exId, j) ? '' : 'muted'}" data-act="row-title" data-i="${i}" data-j="${j}">${esc(rowTitle(e.exId, j) || t('tick_when_done'))}</button>` : ''}
        ${cols.map((c) => `<input class="input set-in" inputmode="decimal" enterkeyhint="next" data-f="${c.f}" data-i="${i}" data-j="${j}" value="${esc(s[c.f] ?? '')}" placeholder="${esc(ph(c.f))}" aria-label="${esc(c.l)}"/>`).join('')}
        <button class="check" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${s.done ? 'true' : 'false'}" aria-label="${t('done')}">${icon('check')}</button>
      </div>`;
    }).join('');
    const ex = getEx(e.exId);
    const unitSfx = type === 'cardio' ? t('min_short') : type === 'time' ? t('sec_short') : type === 'carry' ? t('m_short') : '';
    const restInfo = noRest ? '' : ` · ${icon('timer')}${e.rest || S.profile.rest || 90}${t('sec_short')}`;
    return `<section class="exblock" data-i="${i}">
      <div class="exhead">
        <button class="exname" data-act="ex-menu" data-i="${i}"><b>${esc(exName(ex))}</b><small>${muscleName(ex)}${e.target ? ` · ${t('target')} ${esc(e.target)}${unitSfx}` : ''}${restInfo}</small></button>
        <button class="icon-btn sm" data-act="ex-demo" data-i="${i}" aria-label="${t('ex_details')}">${icon('image')}</button>
        <button class="icon-btn sm" data-act="ex-menu" data-i="${i}" aria-label="${t('more')}">${icon('more')}</button>
      </div>
      ${!section ? `<div class="setrow head cols-${cols.length} nopre" style="--n:${cols.length}"><span></span>${cols.map((c) => `<span>${esc(c.l)}</span>`).join('')}<span>${icon('check')}</span></div>` : ''}
      ${rows}
      <div class="exfoot">
        <button class="btn btn-ghost btn-sm" data-act="set-add" data-i="${i}">${icon('plus')}${section ? t('add_row') : cardio ? t('add_interval') : t('add_set')}</button>
        ${e.sets.length > 1 ? `<button class="btn btn-ghost btn-sm" data-act="set-remove" data-i="${i}">${icon('minus')}${section ? t('remove_row') : cardio ? t('remove_interval') : t('remove_set')}</button>` : ''}
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
      <div class="add-pair">
        <button class="btn btn-dashed" data-act="ex-add">${icon('plus')}${t('add_exercise')}</button>
        <button class="btn btn-dashed" data-act="section-log">${icon('plus')}${t('add_section')}</button>
      </div>
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
        A.exercises = d.items.map((it) => ({ exId: it.exId, target: it.reps, rest: num(it.rest) || null, note: '', sets: Array.from({ length: noSets(it.exId) ? rowCount(it.exId) : Math.max(1, num(it.sets) || 3) }, (_, j) => blankSet(it.exId, j)) }));
      }
    } else if (fromWorkout) {
      const w = S.workouts.find((x) => x.id === fromWorkout);
      if (w) {
        A.title = w.title || '';
        A.exercises = w.exercises.map((e) => ({ exId: e.exId, target: e.target || '', rest: e.rest || null, note: '', sets: Array.from({ length: isSection(exType(e.exId)) ? rowCount(e.exId) : e.sets.length }, (_, j) => ({ ...blankSet(e.exId, j), kind: e.sets[j] && e.sets[j].kind })) }));
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
      exercises: w.exercises.map((e) => ({ exId: e.exId, target: e.target || '', rest: e.rest || null, note: e.note || '', sets: isSection(exType(e.exId))
        // a section gets all its rows back; the rows you saved are filled in and ticked
        ? Array.from({ length: Math.max(rowCount(e.exId), ...e.sets.map((s, k) => (s.row ?? k) + 1)) }, (_, r) => {
          const o = blankSet(e.exId, r);
          const s = e.sets.find((x, k) => (x.row ?? k) === r);
          if (!s) return o;
          rowDef(e.exId, r).fields.forEach((b) => (o[b.k] = s[b.k] == null ? '' : b.k === 'w' ? String(r1(u === 'lb' ? s[b.k] * LB : s[b.k])) : String(s[b.k])));
          o.done = true;
          return o;
        })
        : e.sets.map((s) => ({ w: conv(s.w, exType(e.exId)), r: s.r == null ? '' : String(s.r), x: s.x == null ? '' : String(s.x), done: true, kind: s.kind })) })),
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
    if (isSection(type)) {
      // a section keeps the rows you ticked or filled in; only the boxes it has are saved
      const kept = [];
      e.sets.forEach((s, j) => {
        const fl = rowDef(e.exId, j).fields;
        if (!(s.done || fl.some((b) => b.fixed == null && num(s[b.k]) != null))) return;
        const out = { ok: 1, row: j };
        fl.forEach((b) => { const v = b.fixed != null ? b.fixed : num(s[b.k]); if (v != null) out[b.k] = b.k === 'w' ? fromDisp(v, A.unit) : v; });
        kept.push(out);
      });
      return { exId: e.exId, target: e.target || '', rest: null, note: e.note || '', sets: kept };
    }
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
  w.total = workoutTotal(w);
  // PRs vs everything before this workout
  w.prs = [];
  for (const e of exercises) {
    const type = exType(e.exId);
    const prior = bestsFor(e.exId, w.id, w.start);
    if (!prior.sessions) continue;
    const work = e.sets.filter((s) => s.kind !== 'warm');
    if (type === 'weight') {
      const maxW = Math.max(0, ...work.map((s) => s.w || 0));
      if (maxW > prior.weight + 0.001) w.prs.push({ exId: e.exId, kind: 'weight', value: maxW });
    } else if (type === 'bodyweight') {
      const maxR = Math.max(0, ...work.map((s) => s.r || 0));
      if (maxR > prior.reps) w.prs.push({ exId: e.exId, kind: 'reps', value: maxR });
    }
  }

  // summary sheet
  const sets = workoutSets(w);
  if (isRose()) setTimeout(() => rain(w.prs.length ? 44 : 26), 250);
  openSheet(`<div class="sheet-body summary">
      <div class="summary-top">${icon(w.prs.length ? 'trophy' : 'check', 'summary-ic')}<h3>${w.prs.length ? t('great_prs', { n: w.prs.length }) : t('nice_work')}</h3></div>
      <div class="stats compact">
        <div class="stat"><b>${fmtDurShort(w.duration)}</b><span>${t('duration')}</span></div>
        <div class="stat"><b>${fmtTotal(w.total)}</b><span>${t('total_lifted')}</span></div>
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
  const vol = monthW.reduce((a, w) => a + workoutTotal(w), 0);
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
          <div class="stat"><b>${fmtTotal(vol)}</b><span>${t('total_lifted')}</span></div>
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
  prsOf(w).forEach((p) => (prMap[p.exId] = p));
  const exHtml = w.exercises.map((e) => {
    const type = exType(e.exId);
    const exTotal = isLoad(type) ? setsTotal(e.sets) : 0;
    return `<section class="card ex-detail">
      <div class="card-head"><h3>${esc(exName(e.exId))}</h3>${prMap[e.exId] ? `<span class="badge-pr">${icon('trophy')}${t('pr_' + prMap[e.exId].kind)}</span>` : ''}</div>
      <ol class="set-list">${e.sets.map((s, j) => `<li class="${s.kind === 'warm' ? 'warm' : ''}"><span>${s.kind === 'warm' && type === 'weight' ? 'W' : j + 1}</span><b>${prevText(type, s, unit(), e.exId, j)}</b>${type === 'cardio' && cardioSpeed(s, e.exId) ? `<small>${fmtNum(cardioSpeed(s, e.exId))} ${t('kmh')}</small>` : ''}</li>`).join('')}</ol>
      ${exTotal ? `<p class="muted small">${t('total_lifted')}: <b>${fmtTotal(exTotal)}</b></p>` : ''}
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
          <div class="stat"><b>${fmtTotal(workoutTotal(w))}</b><span>${t('total_lifted')}</span></div>
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

/* ---------- EXERCISES ---------- */
// Sections with parts (warm-up, arms, legs, and the ones you make) list their exercises under a heading per part, unless one part is picked
function groupedRows(list, filter, sub, row) {
  const parts = partsOf(filter);
  if (!parts.length || sub) return list.map(row).join('');
  const key = (e) => (filter.startsWith('cat:') ? e.part : e.muscle);
  const placed = new Set();
  const html = parts.map(([id, name]) => {
    const part = list.filter((e) => key(e) === id);
    part.forEach((e) => placed.add(e));
    return part.length ? `<p class="list-label">${esc(name)}</p>${part.map(row).join('')}` : '';
  }).join('');
  return list.filter((e) => !placed.has(e)).map(row).join('') + html;
}

// Section buttons: one wrapped block (no sideways scrolling), your own sections, a "new section" button,
// plus a second row of parts when the picked section has them
function sectionChips(filter, sub, attrs, withCustom) {
  const all = allExercises();
  const count = (g) => all.filter((e) => matchGroup(e, g, '')).length;
  const nameOf = (g) => (g === 'all' ? t('all') : g === 'custom' ? t('custom') : g.startsWith('cat:') ? esc((secById(g.slice(4)) || {}).name || '') : t('m_' + g));
  const chip = (g) => `<button class="chip ${filter === g ? 'chip-solid' : ''}" ${attrs.group}="${g}">${nameOf(g)}<i>${count(g)}</i></button>`;
  const groups = ['all', ...GROUPS, ...userSections().map((x) => 'cat:' + x.id), ...(withCustom ? ['custom'] : [])];
  const top = groups.map(chip).join('') + `<button type="button" class="chip chip-add" ${attrs.add}>${icon('plus')}${t('new_section_chip')}</button>`;
  const ps = partsOf(filter);
  const own = filter.startsWith('cat:') ? secById(filter.slice(4)) : null;
  const parts = ps.length || own
    ? `<div class="chips-wrap chips-sub">${ps.length ? [['', t('all')], ...ps].map(([m, l]) => `<button class="chip ${sub === m ? 'chip-solid' : ''}" ${attrs.part}="${m}">${esc(l)}</button>`).join('') : ''}${own ? `<button type="button" class="chip chip-edit" ${attrs.edit}="${own.id}">${icon('edit')}${t('cat_edit')}</button>` : ''}</div>` : '';
  return `<div class="chips-wrap chips-main">${top}</div>${parts}`;
}

VIEWS.exercises = () => {
  const f = S.ui.exFilter, sub = partsOf(f).length ? S.ui.exSub : '', q = S.ui.exSearch.trim().toLowerCase();
  const counts = {};
  S.workouts.forEach((w) => w.exercises.forEach((e) => (counts[e.exId] = (counts[e.exId] || 0) + 1)));
  const list = allExercises().filter((e) => matchGroup(e, f, sub) && (!q || `${e.en} ${e.ar} ${e.name || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || exName(a).localeCompare(exName(b)));
  return {
    title: t('nav_exercises'),
    actions: `<button class="icon-btn" data-act="ex-new" aria-label="${t('new_exercise')}">${icon('plus')}</button>`,
    html: `<div class="page">
      <div class="search">${icon('search')}<input class="input" data-ex-search value="${esc(S.ui.exSearch)}" placeholder="${t('search_ex')}" type="search"/></div>
      ${sectionChips(f, sub, { group: 'data-act="ex-filter" data-m', part: 'data-act="ex-sub" data-m', add: 'data-act="cat-add"', edit: 'data-act="cat-edit" data-id' }, true)}
      <div class="ex-list">${groupedRows(list, f, sub, (e) => `
        <button class="ex-item" data-act="ex-open" data-id="${esc(e.id)}">
          <span class="ex-dot" style="background:var(--m-${e.muscle})"></span>
          <span><b>${esc(exName(e))}</b><small>${muscleName(e)} · ${t('eq_' + e.equip)}${typeTag(e)}${!e.builtin ? ` · ${t('custom')}` : ''}</small></span>
          ${counts[e.id] ? `<span class="count">${counts[e.id]}</span>` : ''}
        </button>`) || `<p class="muted center">${t('no_results')}</p>`}</div>
      <button class="btn btn-dashed" data-act="ex-new">${icon('plus')}${t('new_exercise')}</button>
    </div>`,
  };
};


/* ---------- STARS: member side (shown on Home) ---------- */
let rewardsAt = 0;
async function refreshRewards(force = false) {
  if (!starsOn() || !S.user || (!force && Date.now() - rewardsAt < 30000)) return;
  rewardsAt = Date.now();
  try {
    const before = starsTotal();
    S.rewards = await store.loadRewards();
    if (starsTotal() !== before && route().name === 'home') render();
  } catch (e) { console.warn(e); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshRewards(); });

const seenKey = () => `gymflow:stars-seen:${S.user ? S.user.uid : 'x'}`;
function starsCard() {
  if (!starsOn()) return '';
  const total = starsTotal();
  let seen = 0;
  try { seen = Number(localStorage.getItem(seenKey())) || 0; } catch { /* ignore */ }
  const gained = total - seen;
  if (gained !== 0) { try { localStorage.setItem(seenKey(), String(total)); } catch { /* ignore */ } }
  if (gained > 0) setTimeout(() => toast(t('new_stars', { n: gained }), 'pr', 4500), 400);
  const last = [...S.rewards].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  const lastTxt = last
    ? `${t('last_reward')}: <bdi dir="ltr">${last.stars > 0 ? '+' : ''}${last.stars}</bdi>${last.note ? ' · ' + esc(last.note) : ''} · ${fmtDate(last.at, { day: 'numeric', month: 'short' })}`
    : t('stars_none');
  return `<section class="stars-card ${gained > 0 ? 'stars-new' : ''}">
    <div class="stars-big">${icon('star')}<b>${total}</b></div>
    <div class="stars-info"><h3>${t('your_stars')}</h3><p class="muted small">${lastTxt}</p></div>
  </section>`;
}

/* ---------- UNIQUE USERNAMES ---------- */
const NAME_RE = /^[\p{L}\p{N}_.]{3,20}$/u;
const RESERVED_NAMES = ['admin', 'administrator', 'owner', 'support', 'gymflow', 'root', 'المدير', 'ادمن', 'أدمن', 'المالك'];
const nameKey = (n) => String(n).trim().toLowerCase();
const nameError = (v) => {
  if (v.length < 3) return 'name_short';
  if (v.length > 20) return 'name_long';
  if (!NAME_RE.test(v)) return 'name_chars';
  if (RESERVED_NAMES.includes(nameKey(v))) return 'name_reserved';
  return '';
};

function usernameSheet() {
  let timer = null;
  const cur = S.profile.username || '';
  openSheet(`<form class="sheet-body" data-nameform>
      <div class="sheet-title"><h3>${t('unique_name')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <p class="muted small">${t('name_rules')}</p>
      <label class="field"><span>${t('unique_name')}</span><input class="input" name="u" value="${esc(cur)}" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" dir="auto" required autofocus/></label>
      <p class="name-status small" data-status></p>
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary" data-save disabled>${t('save')}</button></div>
    </form>`, {
    onClose: () => clearTimeout(timer),
    onMount: (s, close) => {
      const input = s.querySelector('[name="u"]'), status = s.querySelector('[data-status]'), save = s.querySelector('[data-save]');
      let ok = false;
      const say = (txt, cls = '') => { status.textContent = txt; status.className = `name-status small ${cls}`; };
      input.addEventListener('input', () => {
        clearTimeout(timer); ok = false; save.disabled = true;
        const v = input.value.trim();
        if (!v || v === cur) return say('');
        const err = nameError(v);
        if (err) return say(t(err), 'bad');
        say(t('name_checking'));
        timer = setTimeout(async () => {
          try {
            const free = await store.usernameFree(nameKey(v));
            if (input.value.trim() !== v) return;
            ok = free; save.disabled = !free;
            say(free ? t('name_free') : t('name_taken'), free ? 'good' : 'bad');
          } catch (e) { console.warn(e); say(t('name_check_fail'), 'bad'); }
        }, 350);
      });
      s.querySelector('[data-nameform]').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const v = input.value.trim();
        if (!ok || nameError(v)) return;
        save.disabled = true;
        try {
          await store.claimUsername(v, nameKey(v), S.profile.usernameKey || '');
          S.profile.username = v; S.profile.usernameKey = nameKey(v);
          close(); toast(t('name_saved'), 'success'); render();
        } catch (e) {
          console.warn(e);
          say(t(e && (e.code === 'permission-denied' || e.code === 'username/taken') ? 'name_denied' : 'err_generic'), 'bad');
          save.disabled = false;
        }
      });
    },
  });
}

// Shown on Home until the member picks a unique name
function nameBanner() {
  if (!namesOn() || S.profile.username) return '';
  return `<section class="name-banner"><div><h3>${t('pick_name_title')}</h3><p class="muted small">${t('pick_name_body')}</p></div><button class="btn btn-primary btn-sm" data-act="username">${t('choose_name')}</button></section>`;
}

/* ---------- CONTROL: members, stars, permissions ---------- */
const initials = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
const adminDenied = (e) => (e && e.code === 'permission-denied' ? t('admin_denied') : t('err_generic'));
// a name counts only if the username really belongs to that account
const handleOf = (u, names) => (u.username && names && names[u.usernameKey] === u.id ? '@' + u.username : '');
const permChips = (p) => [p && p.view ? t('perm_view_short') : '', p && p.stars ? t('perm_stars_short') : ''].filter(Boolean).map((x) => `<span class="badge">${esc(x)}</span>`).join(' ');
const sumStars = (list) => list.reduce((a, x) => a + (Number(x.stars) || 0), 0);

const controlTabs = (cur) => (isSuper() ? `<div class="seg control-tabs">
    <button class="${cur === 'members' ? 'on' : ''}" data-act="nav" data-to="control">${t('tab_members')}</button>
    <button class="${cur === 'perms' ? 'on' : ''}" data-act="nav" data-to="control/perms">${t('tab_perms')}</button></div>` : '');

VIEWS.control = (r) => {
  const none = { title: t('nav_control'), back: 'home', html: `<div class="page">${empty('star', t('not_found'), '')}</div>` };
  if (!hasControl()) return none;
  if (r.a === 'perms') return isSuper() ? permsView() : none;
  return r.a ? memberView(r.a) : membersView();
};
VIEWS.admin = VIEWS.control; // links from the first version

function membersView() {
  return {
    title: t('nav_control'),
    html: `<div class="page admin">${controlTabs('members')}<p class="muted small">${t('admin_hint')}</p><div id="admin-list" class="wlist"><p class="muted center">${t('loading')}</p></div></div>`,
    after: async () => {
      const box = () => document.getElementById('admin-list');
      try {
        const [users, names] = await Promise.all([store.adminUsers(), store.adminUsernames().catch(() => ({}))]);
        const [totals, staff] = await Promise.all([
          Promise.all(users.map((u) => store.adminRewards(u.id).then(sumStars).catch(() => 0))),
          isSuper() ? store.staffList().catch(() => []) : Promise.resolve([]),
        ]);
        if (!box()) return;
        const perms = Object.fromEntries(staff.map((x) => [x.id, x]));
        const rows = users.map((u, i) => ({ u, stars: Math.max(0, totals[i]) })).sort((a, b) => (b.u.lastSeen || 0) - (a.u.lastSeen || 0));
        box().innerHTML = rows.length ? rows.map(({ u, stars }) => `<a class="wrow" href="#/control/${encodeURIComponent(u.id)}">
            <span class="avatar">${esc(initials(u.name || u.username || u.email))}</span>
            <span class="wrow-main"><b>${esc(u.name || u.email || t('athlete'))}${u.id === S.user.uid ? ` <span class="badge">${t('you')}</span>` : ''} ${permChips(perms[u.id])}</b>
              <small>${esc([handleOf(u, names), u.email].filter(Boolean).join(' · '))}${u.lastSeen ? ` · ${t('last_active')} ${fmtDate(u.lastSeen, { day: 'numeric', month: 'short' })}` : ''}</small></span>
            <span class="star-count">${icon('star')}${stars}</span></a>`).join('') : `<p class="muted center">${t('admin_empty')}</p>`;
      } catch (e) {
        console.error(e);
        if (box()) box().innerHTML = `<p class="form-err">${adminDenied(e)}</p>`;
      }
    },
  };
}

function memberView(uid) {
  return {
    title: t('nav_control'), back: 'control',
    html: `<div class="page admin"><div id="admin-user" class="admin-user"><p class="muted center">${t('loading')}</p></div></div>`,
    after: () => loadMember(uid),
  };
}

async function loadMember(uid) {
  const box = () => document.getElementById('admin-user');
  try {
    const [d, names] = await Promise.all([store.adminUserData(uid), store.adminUsernames().catch(() => ({}))]);
    if (!box()) return;
    S.adminEx = d.exercises || [];
    const ws = [...(d.workouts || [])].sort((a, b) => (b.start || 0) - (a.start || 0));
    const rewards = [...(d.rewards || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
    const total = Math.max(0, sumStars(rewards));
    const weekW = ws.filter((w) => w.start >= startOfWeek().getTime());
    const p = { ...(d.profile || {}), id: uid };
    const canGive = can('stars') && (uid !== S.user.uid || isSuper());
    const showWork = can('view') && !d.limited;
    box().innerHTML = `
      <section class="card">
        <div class="adm-head"><span class="avatar lg">${esc(initials(p.name || p.username || p.email))}</span>
          <div class="adm-who"><h3>${esc(p.name || p.email || t('athlete'))}</h3>
          <small class="muted">${esc([handleOf(p, names), p.email].filter(Boolean).join(' · '))}</small>
          <small class="muted">${p.lastSeen ? `${t('last_active')}: ${fmtDate(p.lastSeen, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</small></div></div>
        ${showWork ? `<div class="stats compact">
          <div class="stat"><b>${ws.length}</b><span>${t('workouts')}</span></div>
          <div class="stat"><b>${weekW.length}</b><span>${t('sessions_week')}</span></div>
          <div class="stat"><b>${fmtTotal(weekW.reduce((a, w) => a + workoutTotal(w), 0))}</b><span>${t('week_total')}</span></div>
        </div>` : `<p class="muted small">${t('limited_note')}</p>`}
      </section>
      ${can('stars') ? `<section class="card">
        <div class="card-head"><h3>${t('stars')}</h3><span class="star-count big">${icon('star')}${total}</span></div>
        ${canGive ? `<form class="star-form" data-form="give-stars" data-uid="${esc(uid)}">
          <div class="star-quick">${[1, 2, 3, 5, 10].map((n) => `<button type="button" class="chip" data-act="star-quick" data-n="${n}">+${n}</button>`).join('')}</div>
          <div class="inline-form">
            <label class="field"><span>${t('stars_count')}</span><input class="input" name="n" inputmode="numeric" value="1" required dir="ltr"/></label>
            <label class="field"><span>${t('note_optional')}</span><input class="input" name="note" maxlength="80"/></label>
          </div>
          <button class="btn btn-primary">${icon('star')}${t('give_stars')}</button>
          <p class="muted small">${t('stars_minus_hint')}</p>
        </form>` : `<p class="muted small">${t('no_self_stars')}</p>`}
        ${rewards.length ? `<ul class="reward-list">${rewards.slice(0, 20).map((r) => `<li><b class="${r.stars < 0 ? 'neg' : 'pos'}" dir="ltr">${r.stars > 0 ? '+' : ''}${r.stars}</b><span>${esc(r.note || '')}<small class="muted">${fmtDate(r.at, { day: 'numeric', month: 'short' })}${r.byName ? ` · ${esc(r.byName)}` : ''}</small></span>${can('stars') ? `<button class="icon-btn sm danger" data-act="star-del" data-uid="${esc(uid)}" data-id="${esc(r.id)}" aria-label="${t('delete')}">${icon('trash')}</button>` : ''}</li>`).join('')}</ul>` : ''}
      </section>` : ''}
      ${showWork ? `<section class="card">
        <div class="card-head"><h3>${t('recent_workouts')}</h3></div>
        ${ws.length ? ws.slice(0, 15).map((w) => `<details class="adm-w"><summary><span><b>${esc(w.title || t('workout'))}</b><small class="muted">${fmtDate(w.start)} · ${fmtDurShort(w.duration || 0)}</small></span><span class="adm-total">${fmtTotal(workoutTotal(w))}</span></summary>
          <ul class="set-list">${(w.exercises || []).map((e) => `<li><b>${esc(exName(e.exId))}</b><small>${(e.sets || []).map((s, k) => prevText(exType(e.exId), s, unit(), e.exId, k)).join(' · ')}</small></li>`).join('')}</ul></details>`).join('') : `<p class="muted">${t('no_workouts_user')}</p>`}
      </section>` : ''}`;
  } catch (e) {
    console.error(e);
    if (box()) box().innerHTML = `<p class="form-err">${adminDenied(e)}</p>`;
  }
}

/* permissions page: only the owner sees it */
let permCtx = { users: [], perms: {}, names: {} };

function permsView() {
  return {
    title: t('nav_control'),
    html: `<div class="page admin">${controlTabs('perms')}<p class="muted small">${t('perm_page_hint')}</p>
      <div class="search">${icon('search')}<input class="input" data-perm-search placeholder="${t('perm_search')}" type="search"/></div>
      <div id="perm-list" class="wlist"><p class="muted center">${t('loading')}</p></div></div>`,
    after: (view) => {
      loadPerms();
      view.querySelector('[data-perm-search]')?.addEventListener('input', (ev) => {
        const q = ev.target.value.trim().toLowerCase();
        view.querySelectorAll('.perm-row').forEach((row) => { row.hidden = !!q && !row.dataset.q.includes(q); });
      });
    },
  };
}

async function loadPerms() {
  const box = () => document.getElementById('perm-list');
  try {
    const [users, staff, names] = await Promise.all([store.adminUsers(), store.staffList(), store.adminUsernames().catch(() => ({}))]);
    if (!box()) return;
    permCtx = { users, perms: Object.fromEntries(staff.map((x) => [x.id, x])), names };
    const sorted = [...users].sort((a, b) => Number(!!(permCtx.perms[b.id])) - Number(!!(permCtx.perms[a.id])) || String(a.name || '').localeCompare(String(b.name || '')));
    box().innerHTML = sorted.map((u) => {
      const owner = ADMIN_UIDS.includes(u.id) && isCloud;
      const handle = handleOf(u, names);
      const label = u.name || u.email || t('athlete');
      return `<${owner ? 'div' : `button type="button" data-act="perm-open" data-id="${esc(u.id)}"`} class="wrow perm-row" data-q="${esc(`${label} ${handle} ${u.email || ''}`.toLowerCase())}">
        <span class="avatar">${esc(initials(label))}</span>
        <span class="wrow-main"><b>${esc(label)}${u.id === S.user.uid ? ` <span class="badge">${t('you')}</span>` : ''}</b><small>${esc([handle, u.email].filter(Boolean).join(' · '))}</small></span>
        <span class="perm-tags">${owner ? `<span class="badge">${t('owner')}</span>` : permChips(permCtx.perms[u.id]) || `<span class="muted small">${t('no_perms')}</span>`}</span>
      </${owner ? 'div' : 'button'}>`;
    }).join('') || `<p class="muted center">${t('admin_empty')}</p>`;
  } catch (e) {
    console.error(e);
    if (box()) box().innerHTML = `<p class="form-err">${adminDenied(e)}</p>`;
  }
}

function permSheet(id) {
  const u = permCtx.users.find((x) => x.id === id);
  if (!u) return;
  const cur = permCtx.perms[id] || {};
  const label = `${u.name || u.email || t('athlete')} ${handleOf(u, permCtx.names)}`.trim();
  openSheet(`<form class="sheet-body" data-permform>
      <div class="sheet-title"><h3>${esc(label)}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <p class="muted small">${t('perm_hint')}</p>
      <label class="switch"><input type="checkbox" name="view" ${cur.view ? 'checked' : ''}/><span class="switch-ui"></span><span>${t('perm_view')}<small class="muted">${t('perm_view_hint')}</small></span></label>
      <label class="switch"><input type="checkbox" name="stars" ${cur.stars ? 'checked' : ''}/><span class="switch-ui"></span><span>${t('perm_stars')}<small class="muted">${t('perm_stars_hint')}</small></span></label>
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => s.querySelector('[data-permform]').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const perms = { view: fd.get('view') === 'on', stars: fd.get('stars') === 'on' };
      const btn = ev.target.querySelector('.btn-primary'); btn.disabled = true;
      try {
        await store.staffSet(id, perms);
        close();
        toast(t(perms.view || perms.stars ? 'perm_saved' : 'perm_removed'), 'success');
        loadPerms();
      } catch (e) { toast(adminDenied(e), 'error'); btn.disabled = false; }
    }),
  });
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
        ${namesOn() ? `<div class="set-row"><span>${t('unique_name')}<small class="muted">${t('unique_name_hint')}</small></span><button class="btn btn-ghost btn-sm" data-act="username" dir="auto">${S.profile.username ? '@' + esc(S.profile.username) : t('choose_name')} ${icon('edit')}</button></div>` : ''}
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
        <p class="muted small">${t('counts', { w: S.workouts.length, p: S.plans.length })}</p>
        <button class="btn btn-ghost btn-sm danger" data-act="wipe">${icon('trash')}${t('delete_all')}</button>
      </section>
      <p class="muted small center">${t('app_name')} v${VERSION} · ${isCloud ? 'Firebase' : t('local_mode')}</p>
    </div>`,
  };
};

/* =========================================================
   Sheets: picker, more menu, templates, exercise form
   ========================================================= */
const PICKER_ATTRS = { group: 'data-mf', part: 'data-ms', add: 'data-cat-add', edit: 'data-cat-edit' };
function exercisePicker(onPick, title = t('add_exercise')) {
  let filter = 'all', sub = '', q = '';
  const recent = [];
  sortedWorkouts().slice(0, 15).forEach((w) => w.exercises.forEach((e) => { if (!recent.includes(e.exId)) recent.push(e.exId); }));
  const listHtml = () => {
    const ql = q.trim().toLowerCase();
    let list = allExercises().filter((e) => matchGroup(e, filter, sub) && (!ql || `${e.en} ${e.ar} ${e.name || ''}`.toLowerCase().includes(ql)));
    const rec = !ql && filter === 'all' ? recent.slice(0, 8).map(getEx) : [];
    // the picture button lets you see what the exercise is before choosing it
    const row = (e) => `<div class="ex-row"><button class="ex-item" data-pick="${esc(e.id)}"><span class="ex-dot" style="background:var(--m-${e.muscle})"></span><span><b>${esc(exName(e))}</b><small>${muscleName(e)} · ${t('eq_' + e.equip)}${typeTag(e)}</small></span>${icon('plus')}</button><button class="icon-btn sm ex-peek" data-preview="${esc(e.id)}" aria-label="${t('ex_details')}">${icon('image')}</button></div>`;
    list = list.sort((a, b) => exName(a).localeCompare(exName(b)));
    return `${rec.length ? `<p class="list-label">${t('recent')}</p>${rec.map(row).join('')}<p class="list-label">${t('all_exercises')}</p>` : ''}${groupedRows(list, filter, sub, row) || `<p class="muted center">${t('no_results')}</p>`}
      <button class="btn btn-dashed" data-new-ex>${icon('plus')}${t('new_exercise')}${ql ? `: “${esc(q)}”` : ''}</button>`;
  };
  openSheet(`<div class="sheet-body picker">
      <div class="sheet-title"><h3>${esc(title)}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <div class="search">${icon('search')}<input class="input" type="search" data-q placeholder="${t('search_ex')}" autofocus/></div>
      <div data-chips>${sectionChips(filter, sub, PICKER_ATTRS, true)}</div>
      <div class="ex-list" data-list>${listHtml()}</div>
    </div>`, {
    wide: true,
    onMount: (s, close) => {
      const L = s.querySelector('[data-list]');
      s.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; L.innerHTML = listHtml(); });
      s.addEventListener('click', (e) => {
        const mf = e.target.closest('[data-mf]'), ms = e.target.closest('[data-ms]');
        if (mf || ms) {
          if (mf) { filter = mf.dataset.mf; sub = ''; } else sub = ms.dataset.ms;
          s.querySelector('[data-chips]').innerHTML = sectionChips(filter, sub, PICKER_ATTRS, true);
          L.innerHTML = listHtml();
        }
        const refresh = (id) => { if (id !== undefined) { filter = id ? 'cat:' + id : 'all'; sub = ''; } s.querySelector('[data-chips]').innerHTML = sectionChips(filter, sub, PICKER_ATTRS, true); L.innerHTML = listHtml(); };
        if (e.target.closest('[data-cat-add]')) { categorySheet(null, refresh); return; }
        const ce = e.target.closest('[data-cat-edit]');
        if (ce) { categorySheet(secById(ce.dataset.catEdit), refresh); return; }
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
      <p class="muted">${muscleName(e)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight'))}</p>
      <div class="row-actions"><button class="btn btn-ghost" data-sheet-close>${t('close')}</button><button class="btn btn-primary" data-choose>${icon('plus')}${t('choose_ex')}</button></div>
    </div>`, {
    onClose: () => stop(),
    onMount: (s, close) => { stop = mountDemo(s); s.querySelector('[data-choose]').addEventListener('click', () => { close(); onChoose(id); }); },
  });
}

/* ---------- CUSTOM SECTIONS: a box you design yourself ----------
   Order: title, (optional) start from the library, then the rows. Every row has its own title and its own small boxes
   (kg, reps, minutes, km, your own...), so one row can be minutes and another something else.
   The tick and the note are always there. */
const userMethods = () => S.profile.methods || [];
const catalogName = (k) => { const r = BOXES.find(([x]) => x === k); return r ? t(r[1]) : ''; };
// boxes as the editor shows them; old sections only stored a key, so fall back to the built-in name
const boxEntries = (fields) => (fields || []).map((b) => ({ k: b.k, label: b.label || (b.k === 'w' ? '' : catalogName(b.k)), unit: b.unit || '', fx: b.fixed != null, fixed: b.fixed != null ? String(b.fixed) : '' }));
// what a box looks like once saved; a fixed number only makes sense for boxes other than the kilogram one
const fixedOf = (b) => (b.k !== 'w' && b.fx && b.fixed !== '' && Number.isFinite(+b.fixed) ? { fixed: +b.fixed } : {});
// the boxes that match how a library exercise is counted
const boxesFor = (ex) => {
  const mk = (k, unit = '') => ({ k, label: k === 'w' ? '' : catalogName(k), unit });
  if (ex.type === 'custom') return boxEntries(sectionRows(ex.id)[0].fields);
  if (ex.type === 'weight' || ex.type === 'carry') return [mk('w'), mk(ex.type === 'carry' ? 'm' : 'reps')];
  if (ex.type === 'bodyweight') return [mk('reps')];
  if (ex.type === 'time') return [mk('sec')];
  if (ex.type === 'cardio') return [mk('min'), ...(ex.dist ? [mk(ex.dist === 'm' ? 'm' : 'km')] : [])];
  return [];
};

// one row of a workout section, laid out like a normal exercise row: number, the row's title, small boxes, the tick
function sectionRowHtml(e, i, s, j, prev, A, st) {
  const fl = rowDef(e.exId, j).fields, title = rowTitle(e.exId, j);
  const pp = prev.find((x, k) => (x.row ?? k) === j);
  const ph = (f) => { const v = pp && pp[f]; if (v == null) return ''; return f === 'w' ? fmtNum(A.unit === 'lb' ? v * LB : v) : fmtNum(v); };
  // a heading is written once: rows that follow with the same box names (even if made in different ways) do not repeat it
  const sig = fl.map((b) => boxLabel(b)).join('|');
  const head = fl.length && sig !== st.sig
    ? `<div class="setrow head sec cols-${fl.length}" style="--n:${fl.length}"><span></span><span></span>${fl.map((b) => `<span>${esc(boxLabel(b))}</span>`).join('')}<span>${icon('check')}</span></div>` : '';
  st.sig = fl.length ? sig : null;
  const no = `<span class="setno">${j + 1}</span>`;
  const ttl = `<button type="button" class="sec-title ${title ? '' : 'muted'}" data-act="row-title" data-i="${i}" data-j="${j}" aria-label="${t('rename_row')}">${esc(title)}</button>`;
  const boxes = fl.map((b) => b.fixed != null ? `<span class="fixed-val" aria-label="${esc(boxLabel(b))}">${fmtNum(b.fixed)}</span>` : `<input class="input set-in" inputmode="decimal" enterkeyhint="next" data-f="${b.k}" data-i="${i}" data-j="${j}" value="${esc(s[b.k] ?? '')}" placeholder="${esc(ph(b.k))}" aria-label="${esc(boxLabel(b))}"/>`).join('');
  return `${head}<div class="setrow sec ${s.done ? 'done' : ''} cols-${fl.length}" style="--n:${fl.length}" data-i="${i}" data-j="${j}">${no}${ttl}${boxes}<button class="check" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${s.done ? 'true' : 'false'}" aria-label="${t('done')}">${icon('check')}</button></div>`;
}

// after a section was edited in the middle of a workout: make sure it has a row for every row it now defines
function syncSections() {
  if (!S.active) return;
  S.active.exercises.forEach((e) => {
    if (!isSection(exType(e.exId))) return;
    while (e.sets.length < rowCount(e.exId)) e.sets.push(blankSet(e.exId, e.sets.length));
  });
}

function sectionSheet(existing, onSaved) {
  // sections made in earlier versions that count like a normal exercise keep that logic; only their headings can change
  const legacy = !!existing && !['check', 'custom'].includes(existing.type);
  let rows = existing && !legacy ? sectionRows(existing.id).map((r) => ({ title: r.title || '', boxes: boxEntries(r.fields) })) : [{ title: '', boxes: [] }];
  const labels = { ...((existing && existing.labels) || {}) };
  let saved = userMethods();
  openSheet(`<form class="sheet-body" data-sectionform>
      <div class="sheet-title"><h3>${existing ? t('section_edit') : t('add_section')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <label class="field"><span>1. ${t('section_title')}</span><input class="input" name="title" value="${esc(existing ? existing.name : '')}" maxlength="40" placeholder="${t('section_title_ph')}" required autofocus/></label>
      <button type="button" class="btn btn-ghost btn-sm" data-from-lib>${icon('library')}2. ${t('from_library')}</button>
      <div class="boxes-part">
        <p class="part-title">3. ${legacy ? t('rename_heads') : t('rows_title')}</p>
        ${legacy ? '' : `<p class="muted small">${t('always_check')} ${t('rows_hint')}</p>`}
        <div class="editor" data-editor></div>
        ${legacy ? '' : `<details class="tpl-list" data-tpls hidden><summary></summary><div class="tpl-items"></div></details>`}
        ${legacy ? '' : `<div class="save-method">
          <button type="button" class="btn btn-ghost btn-sm" data-save-tpl>${icon('plus')}${t('save_method')}</button>
          <p class="muted small">${t('save_method_explain')}</p>
        </div>`}
      </div>
      ${locationSelect(existing || { muscle: 'section' }, true)}
      <p class="form-err" data-err role="alert"></p>
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => {
      const form = s.querySelector('[data-sectionform]');
      const editor = s.querySelector('[data-editor]');
      const err = (k) => { s.querySelector('[data-err]').textContent = k ? t(k) : ''; };
      const draw = () => {
        err('');
        if (legacy) {
          const cols = colsFor(existing.id, true);
          editor.innerHTML = cols.map((c) => `<label class="field"><span>${esc(c.l)}</span><input class="input" data-lab="${c.f}" value="${esc(labels[c.f] || '')}" placeholder="${esc(c.l)}" maxlength="16"/></label>`).join('');
          return;
        }
        editor.innerHTML = rows.map((r, ri) => `<div class="row-card">
            <div class="row-card-head"><span class="badge">${t('row_n')} ${ri + 1}</span>
              <input class="input" data-rtitle="${ri}" value="${esc(r.title)}" maxlength="30" placeholder="${t('row_title_ph')}" aria-label="${t('rename_row')}"/>
              ${rows.length > 1 ? `<button type="button" class="icon-btn sm danger" data-rdel="${ri}" aria-label="${t('delete')}">${icon('trash')}</button>` : ''}</div>
            ${r.boxes.length ? '' : `<p class="muted small">${t('no_boxes')}</p>`}
            <div class="box-list">${r.boxes.map((b, bi) => `<div class="box-row">
              <input class="input" data-bl="${ri}:${bi}" value="${esc(b.label)}" placeholder="${esc(b.k === 'w' ? catalogName('w') : t('box_name_ph'))}" maxlength="16" aria-label="${t('box_name_ph')}"/>
              ${b.k === 'w'
    ? `<input class="input box-unit" value="${esc(uLabel())}" disabled aria-label="${t('box_unit_ph')}"/>`
    : b.fx || isCat(b.k)
      ? `<input class="input box-unit" data-bfv="${ri}:${bi}" inputmode="decimal" value="${esc(b.fixed)}" placeholder="${t(b.k === 'reps' ? 'fixed_reps' : 'fixed_val')}" maxlength="6" ${b.fx ? '' : 'disabled'} aria-label="${t(b.k === 'reps' ? 'fixed_reps' : 'fixed_val')}"/>`
      : `<input class="input box-unit" data-bu="${ri}:${bi}" value="${esc(b.unit)}" placeholder="${t('box_unit_ph')}" maxlength="8" aria-label="${t('box_unit_ph')}"/>`}
              ${b.k === 'w' ? '<span></span>' : `<button type="button" class="chip fx-btn ${b.fx ? 'on' : ''}" data-bfx="${ri}:${bi}" aria-pressed="${b.fx ? 'true' : 'false'}">${t('fixed_on')}</button>`}
              <button type="button" class="icon-btn sm danger" data-bdel="${ri}:${bi}" aria-label="${t('delete')}">${icon('x')}</button></div>`).join('')}</div>
            <div class="chips-wrap quick-add"><button type="button" class="chip chip-add" data-badd="${ri}">${icon('plus')}${t('add_box')}</button>
              ${BOXES.map(([k, lk]) => `<button type="button" class="chip" data-bquick="${ri}:${k}">${t(lk)}</button>`).join('')}</div>
          </div>`).join('') + `<button type="button" class="btn btn-ghost btn-sm" data-radd>${icon('plus')}${t('add_row_def')}</button>`;
      };
      const addBox = (ri, key = '', label = '') => {
        const r = rows[ri];
        if (r.boxes.length >= 6) return err('section_too_many');
        if (key && r.boxes.some((b) => b.k === key)) { if (!label) label = catalogName(key); key = ''; }
        r.boxes.push({ k: key, label, unit: '', fx: false, fixed: '' });
        draw();
        editor.querySelector(`[data-bl="${ri}:${r.boxes.length - 1}"]`)?.focus();
      };
      editor.addEventListener('input', (ev) => {
        const x = ev.target;
        if (x.dataset.rtitle != null) rows[+x.dataset.rtitle].title = x.value;
        else if (x.dataset.bl != null) { const [r, b] = x.dataset.bl.split(':'); rows[+r].boxes[+b].label = x.value; }
        else if (x.dataset.bu != null) { const [r, b] = x.dataset.bu.split(':'); rows[+r].boxes[+b].unit = x.value; }
        else if (x.dataset.bfv != null) { const [r, b] = x.dataset.bfv.split(':'); rows[+r].boxes[+b].fixed = x.value.replace(/[^0-9.]/g, ''); }
        else if (x.dataset.lab != null) labels[x.dataset.lab] = x.value.trim();
      });
      editor.addEventListener('click', (ev) => {
        const g = (a) => ev.target.closest(`[${a}]`);
        if (g('data-bdel')) { const [r, b] = g('data-bdel').dataset.bdel.split(':'); rows[+r].boxes.splice(+b, 1); draw(); }
        else if (g('data-badd')) addBox(+g('data-badd').dataset.badd);
        else if (g('data-bfx')) {
          const [r, b] = g('data-bfx').dataset.bfx.split(':'); const bx = rows[+r].boxes[+b];
          bx.fx = !bx.fx; if (bx.fx) bx.unit = ''; draw();
          if (bx.fx) editor.querySelector(`[data-bfv="${r}:${b}"]`)?.focus();
        }
        else if (g('data-bquick')) {
          const [r, k] = g('data-bquick').dataset.bquick.split(':');
          addBox(+r, rows[+r].boxes.some((b) => b.k === k) ? '' : k, k === 'w' ? '' : catalogName(k));
        } else if (g('data-rdel')) { rows.splice(+g('data-rdel').dataset.rdel, 1); draw(); }
        else if (g('data-radd')) {
          if (rows.length >= 10) return err('rows_too_many');
          // a new row starts with the boxes of the last one, you change what is different
          const last = rows[rows.length - 1];
          rows.push({ title: '', boxes: last.boxes.map((b) => ({ ...b })) });
          draw();
          editor.querySelector(`[data-rtitle="${rows.length - 1}"]`)?.focus();
        }
      });
      // saved templates, yours and other members': a list that opens on tap, each with its name and who made it.
      // Tap one to use it; yours (and any, for the owner) can be deleted with the x
      const tplBox = s.querySelector('[data-tpls]');
      const me = () => S.profile.username || S.profile.name || t('you');
      const tplItems = () => [
        ...saved.map((x) => ({ id: 'm:' + x.id, name: x.name, by: me(), rows: x.rows || [{ title: '', fields: x.fields || [] }], del: true })),
        ...othersShared().map((d) => ({ id: 's:' + d.id, name: d.name, by: d.ownerName || '', rows: d.rows, del: isSuper() })),
      ];
      const renderTpls = () => {
        if (!tplBox) return;
        const list = tplItems();
        tplBox.hidden = !list.length;
        tplBox.querySelector('summary').textContent = `${t('saved_templates')} (${list.length})`;
        tplBox.querySelector('.tpl-items').innerHTML = list.map((x) => `<div class="tpl-item">
            <button type="button" class="tpl-use" data-tpl="${esc(x.id)}"><b>${esc(x.name)}</b><small>${esc(x.by)}</small></button>
            ${x.del ? `<button type="button" class="icon-btn sm danger" data-tpl-del="${esc(x.id)}" aria-label="${t('delete')}">${icon('x')}</button>` : ''}
          </div>`).join('');
      };
      if (tplBox) {
        renderTpls();
        loadShared().then(() => { if (tplBox.isConnected) renderTpls(); });
        tplBox.addEventListener('click', async (ev) => {
          const del = ev.target.closest('[data-tpl-del]'), use = ev.target.closest('[data-tpl]');
          if (del) {
            if (!(await confirmDialog({ title: t('tpl_delete_q'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
            const [kind, id] = [del.dataset.tplDel.slice(0, 1), del.dataset.tplDel.slice(2)];
            if (kind === 'm') { S.profile.methods = userMethods().filter((x) => x.id !== id); saveProfile(); saved = userMethods(); }
            else {
              try { await store.sharedDel(id); S.shared = S.shared.filter((x) => x.id !== id); } catch (e) { toast(t('err_save'), 'error'); return; }
            }
            renderTpls();
          } else if (use) {
            const x = tplItems().find((y) => y.id === use.dataset.tpl);
            if (!x) return;
            rows = x.rows.map((r) => ({ title: r.title || '', boxes: boxEntries(r.fields).map((f) => ({ ...f, k: f.k === 'w' || isCat(f.k) ? f.k : '' })) }));
            if (!form.elements.title.value.trim()) form.elements.title.value = x.name;
            tplBox.open = false;
            draw();
          }
        });
      }
      // save the current design as a template at any time, once the section has a title and a box
      const tplBtn = s.querySelector('[data-save-tpl]');
      if (tplBtn) tplBtn.addEventListener('click', () => {
        const title = form.elements.title.value.trim();
        if (!title) { form.elements.title.focus(); return err('section_need_title'); }
        const tplRows = rows.map((r) => ({
          title: r.title.trim(),
          fields: r.boxes.filter((b) => b.k === 'w' || b.label.trim() || b.unit.trim() || fixedOf(b).fixed != null).map((b, bi) => ({ k: b.k === 'w' ? 'w' : isCat(b.k) ? b.k : 'f' + (bi + 1), label: b.label.trim() || (b.k === 'w' ? '' : `${t('box_name_ph')} ${bi + 1}`), ...(b.k !== 'w' && b.unit.trim() ? { unit: b.unit.trim() } : {}), ...fixedOf(b) })),
        }));
        if (!tplRows.some((r) => r.fields.length)) return err('section_need_box');
        const id = 'm_' + uid().slice(0, 8);
        S.profile.methods = [...userMethods(), { id, name: title, rows: tplRows.map((r) => ({ title: r.title, fields: r.fields.map((f) => ({ ...f, k: f.k === 'w' || isCat(f.k) ? f.k : '' })) })) }];
        saveProfile(); saved = userMethods(); renderTpls();
        err(''); toast(t('tpl_saved'), 'success');
      });
      // starting from an exercise in the library is optional: it only fills in the title and the boxes
      s.querySelector('[data-from-lib]').addEventListener('click', () => {
        exercisePicker((id) => {
          const ex = getEx(id);
          if (!form.elements.title.value.trim()) form.elements.title.value = exName(ex);
          if (!legacy) { rows = [{ title: '', boxes: boxesFor(ex) }]; draw(); }
        }, t('from_library'));
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const title = String(fd.get('title')).trim();
        if (!title) return err('section_need_title');
        const obj = { id: existing ? existing.id : 'c_' + uid(), name: title, muscle: 'section', equip: 'other', section: true, createdAt: existing?.createdAt || Date.now() };
        applyLocation(obj, String(fd.get('loc') || 'section'));
        if (legacy) {
          Object.assign(obj, { type: existing.type, dist: existing.dist, extra: existing.extra });
          const cleaned = Object.fromEntries(Object.entries(labels).filter(([, v]) => v));
          if (Object.keys(cleaned).length) obj.labels = cleaned;
        } else {
          // every row has its own boxes; a row with no boxes is just the tick and the note
          obj.type = 'custom';
          obj.rows = rows.map((r) => {
            const used = new Set(r.boxes.map((b) => b.k).filter(Boolean));
            let n = 1;
            const fresh = () => { while (used.has('f' + n)) n++; used.add('f' + n); return 'f' + n; };
            const fields = r.boxes.filter((b) => b.k === 'w' || b.label.trim() || b.unit.trim() || fixedOf(b).fixed != null).map((b, bi) => ({
              k: b.k || fresh(),
              label: b.label.trim() || (b.k === 'w' ? '' : `${t('box_name_ph')} ${bi + 1}`),
              ...(b.k !== 'w' && b.unit.trim() && fixedOf(b).fixed == null ? { unit: b.unit.trim() } : {}),
              ...fixedOf(b),
            }));
            return { title: r.title.trim(), fields };
          });
        }
        const i = S.exercises.findIndex((x) => x.id === obj.id);
        if (i >= 0) S.exercises[i] = obj; else S.exercises.push(obj);
        persist('exercises', obj);
        close();
        toast(t('section_saved'), 'success');
        onSaved && onSaved(obj.id);
      });
      draw();
    },
  });
}

// "Edit" for a normal exercise from the workout menu: rename its column headings
function columnsSheet(exId, onDone) {
  const rec = S.exercises.find((x) => x.id === exId);
  const cur = (rec ? rec.labels : (S.profile.labels || {})[exId]) || {};
  const cols = colsFor(exId, true);
  openSheet(`<form class="sheet-body" data-colform>
      <div class="sheet-title"><h3>${esc(exName(exId))}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <p class="muted small">${t('rename_heads')}</p>
      ${cols.map((c) => `<label class="field"><span>${esc(c.l)}</span><input class="input" data-lab="${c.f}" value="${esc(cur[c.f] || '')}" placeholder="${esc(c.l)}" maxlength="16"/></label>`).join('')}
      <div class="row-actions"><button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => s.querySelector('[data-colform]').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const out = {};
      s.querySelectorAll('[data-lab]').forEach((i) => { const v = i.value.trim(); if (v) out[i.dataset.lab] = v; });
      if (rec) { if (Object.keys(out).length) rec.labels = out; else delete rec.labels; persist('exercises', rec); }
      else { S.profile.labels = { ...(S.profile.labels || {}) }; if (Object.keys(out).length) S.profile.labels[exId] = out; else delete S.profile.labels[exId]; saveProfile(); }
      close(); toast(t('saved'), 'success'); onDone && onDone();
    }),
  });
}

/* ---------- Your own sections (library categories) ---------- */
function categorySheet(existing, onDone) {
  const parts0 = existing ? existing.parts || [] : [];
  openSheet(`<form class="sheet-body" data-catform>
      <div class="sheet-title"><h3>${existing ? t('cat_edit') : t('cat_new')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <label class="field"><span>${t('cat_name')}</span><input class="input" name="name" value="${esc(existing ? existing.name : '')}" maxlength="30" placeholder="${t('cat_name_ph')}" required autofocus/></label>
      <p class="muted small">${t('cat_parts_hint')}</p>
      <div class="inline-form cat-parts">${[0, 1, 2, 3].map((i) => `<label class="field"><span>${t('cat_part')} ${i + 1}</span><input class="input" name="part${i}" value="${esc((parts0[i] || {}).name || '')}" maxlength="24"/></label>`).join('')}</div>
      <p class="form-err" data-err role="alert"></p>
      <div class="row-actions">${existing ? `<button type="button" class="btn btn-ghost danger" data-del>${icon('trash')}${t('delete')}</button>` : ''}<button type="button" class="btn btn-ghost" data-sheet-close>${t('cancel')}</button><button class="btn btn-primary">${t('save')}</button></div>
    </form>`, {
    onMount: (s, close) => {
      const form = s.querySelector('[data-catform]');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name')).trim();
        if (!name) return;
        const taken = userSections().some((x) => x.id !== (existing && existing.id) && x.name.trim().toLowerCase() === name.toLowerCase());
        if (taken) { s.querySelector('[data-err]').textContent = t('cat_dup'); return; }
        const parts = [0, 1, 2, 3].map((i) => {
          const nm = String(fd.get('part' + i) || '').trim();
          return nm ? { id: (parts0[i] && parts0[i].id) || 'p_' + uid().slice(0, 8), name: nm } : null;
        }).filter(Boolean);
        const sec = { id: existing ? existing.id : 's_' + uid().slice(0, 10), name, parts };
        S.profile.sections = existing ? userSections().map((x) => (x.id === sec.id ? sec : x)) : [...userSections(), sec];
        saveProfile();
        close();
        toast(t('saved'), 'success');
        onDone && onDone(sec.id);
      });
      const del = s.querySelector('[data-del]');
      if (del) del.addEventListener('click', async () => {
        close();
        if (!(await confirmDialog({ title: t('cat_delete_q'), body: t('cat_delete_body'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
        S.profile.sections = userSections().filter((x) => x.id !== existing.id);
        S.exercises.filter((e) => e.cat === existing.id).forEach((e) => { delete e.cat; delete e.part; persist('exercises', e); });
        saveProfile();
        onDone && onDone(null);
      });
    },
  });
}

// "Where does it live": one of the app's sections, one of yours, or (for a custom box) nowhere in particular
const locValue = (e) => (e.cat ? `cat:${e.cat}${e.part ? ':' + e.part : ''}` : e.muscle);
function locationSelect(e, allowNone) {
  const cur = locValue(e);
  const opt = (v, label) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`;
  const built = MUSCLES.map((m) => opt(m, t('m_' + m))).join('');
  const own = userSections().map((sc) => opt('cat:' + sc.id, esc(sc.name)) + (sc.parts || []).map((p) => opt(`cat:${sc.id}:${p.id}`, `${esc(sc.name)} · ${esc(p.name)}`)).join('')).join('');
  return `<label class="field"><span>${t('cat_where')}</span><select class="input" name="loc">
      ${allowNone || cur === 'section' ? opt('section', t('cat_none')) : ''}
      <optgroup label="${t('cat_builtin')}">${built}</optgroup>
      ${own ? `<optgroup label="${t('cat_mine')}">${own}</optgroup>` : ''}
    </select></label>`;
}
function applyLocation(obj, v) {
  delete obj.cat; delete obj.part;
  if (v.startsWith('cat:')) { const [, cid, pid] = v.split(':'); obj.muscle = 'section'; obj.cat = cid; if (pid) obj.part = pid; } else obj.muscle = v;
}

function exerciseForm(existing, presetName = '', onSaved) {
  const e = existing || { name: presetName, muscle: 'chest', equip: 'barbell', type: 'weight' };
  const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
  openSheet(`<form class="sheet-body" data-exform>
      <div class="sheet-title"><h3>${existing ? t('edit_exercise') : t('new_exercise')}</h3><button type="button" class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <label class="field"><span>${t('name')}</span><input class="input" name="name" value="${esc(e.name || '')}" required autofocus/></label>
      ${locationSelect(e, false)}
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
      const obj = { id: existing ? existing.id : 'c_' + uid(), name: String(fd.get('name')).trim(), muscle: 'chest', equip: fd.get('equip'), type: fd.get('type'), createdAt: existing?.createdAt || Date.now() };
      applyLocation(obj, String(fd.get('loc') || 'chest'));
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
  if (e.section) return '';
  const q = encodeURIComponent(`${e.en || exName(e)} exercise form`);
  const video = `<a class="btn btn-ghost btn-sm" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">${icon('video')}${t('demo_video')}</a>`;
  // written steps: Arabic (written for this app) when the app is in Arabic, otherwise the English steps that come with the photos
  const ar = lang() === 'ar' && STEPS_AR[id];
  const steps = ar || (m && m.steps) || [];
  const stepsHtml = steps.length
    ? `<details class="demo-steps ${ar ? 'steps-ar' : ''}" ${ar ? 'open' : ''}><summary>${t('demo_steps')}</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${ar ? '' : `<p class="muted small">${t('demo_credit')}</p>`}</details>` : '';
  if (!m) return `<div class="demo demo-none"><p class="muted small">${t('demo_none')}</p>${video}${stepsHtml}</div>`;
  return `<div class="demo">
      <div class="demo-stage" data-demo-stage role="img" aria-label="${esc(exName(e))}" title="${t('demo_tap')}">
        ${m.imgs.map((p, i) => `<img src="${MEDIA_BASE}${p}" alt="" class="${i ? '' : 'on'}" draggable="false"/>`).join('')}
        <p class="demo-off" hidden>${t('demo_offline')}</p>
      </div>
      <div class="demo-bar">${video}<span class="muted small">${t('demo_tap')}</span></div>
      ${stepsHtml}
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
      <p class="muted">${muscleName(e)} · ${t('eq_' + e.equip)} · ${t('ty_' + (e.type || 'weight'))}</p>
      ${b.sessions ? `<div class="pr-grid">
        <div><small>${t('sessions')}</small><b>${b.sessions}</b></div>
        <div><small>${t('last_done')}</small><b>${fmtDate(b.last, { day: 'numeric', month: 'short' })}</b></div>
        ${e.type === 'weight' || !e.type ? `<div><small>${t('heaviest')}</small><b>${fmtW(b.weight)}</b></div>` : otherCells(e.type, b, id)}
      </div>` : `<p class="muted">${t('never_done')}</p>`}
      <div class="row-actions start wrap">
        ${S.active ? `<button class="btn btn-ghost btn-sm" data-add-active>${icon('plus')}${t('add_to_workout')}</button>` : ''}
        ${custom ? `<button class="btn btn-ghost btn-sm" data-edit>${icon('edit')}${t('edit')}</button><button class="btn btn-ghost btn-sm danger" data-del>${icon('trash')}${t('delete')}</button>` : ''}
      </div>
    </div>`, {
    onClose: () => stopDemo(),
    onMount: (s, close) => { stopDemo = mountDemo(s); s.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-edit]')) { close(); const rec = S.exercises.find((x) => x.id === id); if (rec && rec.section) sectionSheet(rec, () => render()); else exerciseForm(rec); }
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
      <nav class="more-grid">${moreItems().map(([r, ic, k]) => `<a href="#/${r}" data-sheet-close>${icon(ic)}<span>${t(k)}</span></a>`).join('')}</nav>
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
  const n = noSets(exId) ? rowCount(exId) : prev ? Math.min(prev.length, 6) : 3;
  S.active.exercises.push({ exId, target: '', rest: null, note: '', sets: Array.from({ length: n }, (_, j) => blankSet(exId, j)) });
  saveActive(true);
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
  const rows = [['date', 'workout', 'exercise', 'set', 'type', 'weight_kg', 'reps', 'seconds', 'minutes', 'distance', 'distance_unit', 'extra', 'duration_min']];
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
      type === 'cardio' && c.extra ? `${c.extra}=${s.x ?? ''}` : isSection(type) ? Object.entries(s).filter(([k]) => k !== 'ok' && k !== 'row').map(([k, v]) => `${k}=${v}`).join('; ') : '',
      Math.round((w.duration || 0) / 60),
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
A['section-add'] = (el) => { const p = plan(), d = +el.dataset.d; sectionSheet(null, (exId) => { p.days[d].items.push({ exId, ...itemDefaults(exId), rest: null }); savePlan(p); render(); }); };
A['section-log'] = () => sectionSheet(null, (exId) => { addToActive(exId); render(); setTimeout(() => document.querySelector('.exblock:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); });
A['item-add'] = (el) => { const p = plan(), d = +el.dataset.d; exercisePicker((exId) => { p.days[d].items.push({ exId, ...itemDefaults(exId), rest: null }); savePlan(p); render(); }); };
A['item-menu'] = (el) => {
  const p = plan(), d = +el.dataset.d, i = +el.dataset.i, items = p.days[d].items;
  // a section you made yourself can be edited from here, in the same window used to add it
  const ownSec = S.exercises.find((x) => x.id === items[i].exId && x.section);
  openSheet(`<div class="sheet-body">
      <div class="sheet-title"><h3>${esc(exName(items[i].exId))}</h3><button class="icon-btn" data-sheet-close aria-label="${t('close')}">${icon('x')}</button></div>
      <div class="menu-list">
        ${ownSec ? `<button data-m="edit">${icon('edit')}${t('edit')}</button>` : ''}
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
      if (m === 'edit') return sectionSheet(ownSec, () => { if (S.active) { syncSections(); saveActive(true); } render(); });
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
    if (isSection(type)) {
      const fl = rowDef(e.exId, j).fields;
      if (fl.length && !fl.some((b) => num(s[b.k]) != null)) { toast(t('enter_any'), 'error'); row.querySelector('[data-f]')?.focus(); return; }
    } else {
      if (num(s.r) == null && !(type === 'cardio' && num(s.w) != null)) { toast(t(type === 'cardio' ? 'enter_cardio' : 'enter_reps'), 'error'); row.querySelector('[data-f="r"]')?.focus(); return; }
      if ((type === 'weight' || type === 'carry') && num(s.w) == null) s.w = '0';
    }
    s.done = true;
    { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }
    // cardio and sections have no rest between "sets"
    if (s.kind !== 'warm' && !noSets(e.exId)) startRest(e.rest || S.profile.rest || 90);
  } else s.done = false;
  saveActive(true); render();
};
A['set-add'] = (el) => {
  const e = act().exercises[+el.dataset.i];
  const last = e.sets[e.sets.length - 1];
  let next;
  if (isSection(exType(e.exId))) {
    // a row beyond the ones you designed repeats the last row, with its values
    const j = e.sets.length;
    next = blankSet(e.exId, j);
    if (last && j >= sectionRows(e.exId).length) rowDef(e.exId, j).fields.forEach((b) => (next[b.k] = last[b.k] != null ? last[b.k] : ''));
  } else next = { w: last ? last.w : '', r: last ? last.r : '', x: last ? last.x : '', done: false };
  e.sets.push(next);
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
      ${noSets(e.exId) ? '' : `<label class="field"><span>${t('rest_s')}</span><div class="chips-wrap">${[45, 60, 90, 120, 180, 240].map((s) => `<button class="chip ${(e.rest || S.profile.rest || 90) === s ? 'chip-solid' : ''}" data-rest="${s}">${s}</button>`).join('')}</div></label>`}
      <div class="menu-list">
        <button data-m="edit">${icon('edit')}${t('edit')}</button>
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
      if (m === 'edit') return isSection(exType(e.exId)) ? sectionSheet(getEx(e.exId), () => { syncSections(); saveActive(true); render(); }) : columnsSheet(e.exId, () => render());
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

// Exercises
A['ex-filter'] = (el) => { S.ui.exFilter = el.dataset.m; S.ui.exSub = ''; render(); };
A['ex-sub'] = (el) => { S.ui.exSub = el.dataset.m; render(); };
A['cat-add'] = () => categorySheet(null, (id) => { S.ui.exFilter = 'cat:' + id; S.ui.exSub = ''; render(); });
A['cat-edit'] = (el) => categorySheet(secById(el.dataset.id), (id) => { S.ui.exFilter = id ? 'cat:' + id : 'all'; S.ui.exSub = ''; render(); });
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

A['star-quick'] = (el) => { el.closest('form').elements.n.value = el.dataset.n; };
A['star-del'] = async (el) => {
  if (!(await confirmDialog({ title: t('star_del_q'), ok: t('delete'), cancel: t('cancel'), danger: true }))) return;
  try {
    await store.adminRemoveReward(el.dataset.uid, el.dataset.id);
    toast(t('deleted'), 'success');
    loadMember(el.dataset.uid);
    if (el.dataset.uid === S.user.uid) refreshRewards(true);
  } catch (e) { toast(adminDenied(e), 'error'); }
};
A['row-title'] = async (el) => {
  const e = act().exercises[+el.dataset.i], j = +el.dataset.j;
  const rec = S.exercises.find((x) => x.id === e.exId);
  if (!rec) return;
  const v = await promptDialog({ title: t('rename_row'), value: rowTitle(e.exId, j), ok: t('save'), cancel: t('cancel'), placeholder: t('row_title_ph'), required: false });
  if (v == null) return;
  // sections made before rows had their own boxes are turned into rows the first time a row is renamed
  if (!rec.rows) { rec.rows = sectionRows(rec.id).map((r) => ({ title: r.title, fields: r.fields })); delete rec.fields; delete rec.rowTitles; rec.type = 'custom'; }
  while (rec.rows.length <= j) rec.rows.push({ title: '', fields: rec.rows[rec.rows.length - 1].fields });
  rec.rows[j].title = v;
  persist('exercises', rec);
  render();
};
A['username'] = () => usernameSheet();
A['nav'] = (el) => go(el.dataset.to);
A['perm-open'] = (el) => permSheet(el.dataset.id);

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
  } else if (kind === 'give-stars') {
    const n = Math.trunc(num(fd.get('n')) ?? 0);
    if (!n || Math.abs(n) > 1000) { toast(t('enter_valid'), 'error'); return; }
    const btn = f.querySelector('.btn-primary'); btn.disabled = true;
    try {
      await store.adminAddReward(f.dataset.uid, { stars: n, note: String(fd.get('note') || '').trim().slice(0, 80), byName: S.profile.username || S.profile.name || '' });
      toast(t(n > 0 ? 'stars_given' : 'stars_taken', { n: Math.abs(n) }), 'success');
      await loadMember(f.dataset.uid);
      if (f.dataset.uid === S.user.uid) refreshRewards(true);
    } catch (err) { toast(adminDenied(err), 'error'); btn.disabled = false; }
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
      Object.assign(S, { profile: {}, plans: [], workouts: [], bodyweight: [], measurements: [], exercises: [], rewards: [], adminEx: [], perms: {}, active: null });
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
      // let the owner see who is registered and when they were last here
      S.profile.email = user.email || S.profile.email || '';
      S.profile.lastSeen = Date.now();
      saveProfile();
      S.rewards = starsOn() ? await store.loadRewards().catch((err) => { console.warn(err); return []; }) : [];
      S.perms = starsOn() ? await store.myPerms().catch(() => ({})) : {};
      loadActive();
      S.loaded = true;
      S.shared = []; S.sharedReady = false;
      loadShared().then(syncShared);
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
