// Lightweight SVG charts (no dependencies). Everything returns an SVG string.
import { esc } from './ui.js';

const PLATE_COLORS = ['var(--plate-red)', 'var(--plate-blue)', 'var(--plate-yellow)', 'var(--plate-green)'];

const niceNum = (n) => {
  if (!isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (a >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (Math.round(n * 10) / 10).toString();
};

/**
 * Line chart.
 * points: [{x: number (ms), y: number, label?: string}] sorted by x
 * opts: { height, fmtX(x), fmtY(y), color, area }
 */
export function lineChart(points, opts = {}) {
  const W = opts.width || 640, H = opts.height || 220;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  if (!points.length) return '';
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = maxY - minY || Math.max(1, Math.abs(maxY) * 0.1);
  minY -= span * 0.15; maxY += span * 0.15;
  if (opts.zeroBase || (minY < 0 && Math.min(...ys) >= 0)) minY = 0;
  const sx = (x) => pad.l + ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b);
  const color = opts.color || 'var(--accent)';

  const grid = [0, 0.5, 1].map((f) => {
    const v = minY + (maxY - minY) * f, y = sy(v);
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="grid"/>
      <text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" class="axis">${niceNum(v)}</text>`;
  }).join('');

  const fmtX = opts.fmtX || ((x) => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const ticks = points.length === 1 ? [points[0].x] : [minX, (minX + maxX) / 2, maxX];
  const xlabels = ticks.map((x, i) =>
    `<text x="${sx(x)}" y="${H - 8}" text-anchor="${i === 0 && ticks.length > 1 ? 'start' : i === ticks.length - 1 && ticks.length > 1 ? 'end' : 'middle'}" class="axis">${esc(fmtX(x))}</text>`).join('');

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${sx(points[points.length - 1].x).toFixed(1)},${H - pad.b} L${sx(points[0].x).toFixed(1)},${H - pad.b} Z`;
  const fmtY = opts.fmtY || niceNum;
  const r = points.length > 40 ? 2.5 : points.length > 20 ? 3.2 : 4.2;
  const dots = points.map((p) =>
    `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${r}" class="dot" style="fill:${color}"><title>${esc(fmtX(p.x))}: ${esc(fmtY(p.y))}</title></circle>`).join('');
  const gid = 'g' + Math.random().toString(36).slice(2, 8);

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" direction="ltr" width="${W}" height="${H}">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xlabels}
    ${opts.area !== false ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

/** Bar chart. items: [{label, value, color?}] */
export function barChart(items, opts = {}) {
  const W = opts.width || 640, H = opts.height || 200;
  const pad = { l: 40, r: 10, t: 14, b: 30 };
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - pad.l - pad.r) / items.length;
  const sy = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const fmt = opts.fmt || niceNum;
  const grid = [0, 0.5, 1].map((f) => {
    const y = sy(max * f);
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="grid"/><text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" class="axis">${niceNum(max * f)}</text>`;
  }).join('');
  const every = Math.ceil(items.length / Math.max(3, Math.floor(W / 64)));
  const bars = items.map((it, i) => {
    const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64, y = sy(it.value), h = H - pad.b - y;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" style="fill:${it.color || 'var(--accent)'}"><title>${esc(it.label)}: ${esc(fmt(it.value))}</title></rect>
      ${i % every === 0 ? `<text x="${(x + w / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle" class="axis">${esc(it.label)}</text>` : ''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" direction="ltr" width="${W}" height="${H}">${grid}${bars}</svg>`;
}

/** Horizontal bars for muscle distribution: items [{label, value}] */
export function hBars(items, fmt = (v) => v) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="hbars">${items.map((it, i) => `
    <div class="hbar">
      <span class="hbar-label">${esc(it.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(it.value / max) * 100}%;background:${PLATE_COLORS[i % 4]}"></span></span>
      <span class="hbar-val">${esc(fmt(it.value))}</span>
    </div>`).join('')}</div>`;
}

/** Tiny sparkline */
export function sparkline(values, color = 'var(--accent)') {
  if (values.length < 2) return '';
  const W = 120, H = 36;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/**
 * The signature visual: a barbell loaded with one plate per session this week.
 * done: sessions completed, goal: weekly target
 */
export function barbell(done, goal) {
  const W = 360, H = 120, cy = 60;
  const slots = Math.max(goal, done);
  const perSide = Math.ceil(slots / 2);
  const plateW = 13, gap = 3;
  const sleeveStart = 92, sleeveLen = perSide * (plateW + gap) + 12;
  let plates = '';
  const plate = (x, i, filled) => {
    const h = 88 - Math.min(i, 3) * 6;
    return filled
      ? `<rect x="${x}" y="${cy - h / 2}" width="${plateW}" height="${h}" rx="3" style="fill:${PLATE_COLORS[i % 4]}" class="plate"/>`
      : `<rect x="${x + 0.75}" y="${cy - h / 2 + 0.75}" width="${plateW - 1.5}" height="${h - 1.5}" rx="3" class="plate-ghost"/>`;
  };
  // order: plates alternate right, left (index 0 right, 1 left, ...)
  for (let i = 0; i < slots; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = Math.floor(i / 2);
    const filled = i < done;
    if (side === 1) {
      const x = W - sleeveStart + 6 + k * (plateW + gap);
      plates += plate(x, k, filled);
    } else {
      const x = sleeveStart - 6 - plateW - k * (plateW + gap);
      plates += plate(x, k, filled);
    }
  }
  const leftEnd = Math.max(8, sleeveStart - sleeveLen);
  const rightEnd = Math.min(W - 8, W - sleeveStart + sleeveLen);
  return `<svg viewBox="0 0 ${W} ${H}" class="barbell" role="img" aria-label="${done}/${goal}">
    <rect x="${leftEnd}" y="${cy - 5}" width="${rightEnd - leftEnd}" height="10" rx="3" class="bar-steel"/>
    <rect x="${sleeveStart - 8}" y="${cy - 11}" width="8" height="22" rx="2" class="bar-collar"/>
    <rect x="${W - sleeveStart}" y="${cy - 11}" width="8" height="22" rx="2" class="bar-collar"/>
    <rect x="${sleeveStart}" y="${cy - 2.5}" width="${W - 2 * sleeveStart}" height="5" class="bar-grip"/>
    ${plates}
  </svg>`;
}

/** Plate calculator drawing: plates per side [{w, n}], kg-color mapping */
export function plateStack(list, unit) {
  const colorFor = (w) => {
    const kg = unit === 'lb' ? w / 2.20462 : w;
    if (kg >= 24) return 'var(--plate-red)';
    if (kg >= 19) return 'var(--plate-blue)';
    if (kg >= 14) return 'var(--plate-yellow)';
    if (kg >= 9) return 'var(--plate-green)';
    return 'var(--plate-white)';
  };
  const flat = [];
  list.forEach((p) => { for (let i = 0; i < p.n; i++) flat.push(p.w); });
  const W = 360, H = 130, cy = 65;
  let x = 70;
  const plates = flat.map((w) => {
    const kg = unit === 'lb' ? w / 2.20462 : w;
    const h = Math.max(36, Math.min(110, 40 + kg * 2.8));
    const pw = kg >= 10 ? 16 : 11;
    const r = `<g><rect x="${x}" y="${cy - h / 2}" width="${pw}" height="${h}" rx="3" style="fill:${colorFor(w)}"/>
      <text x="${x + pw / 2}" y="${cy + 3.5}" text-anchor="middle" class="plate-label" transform="rotate(-90 ${x + pw / 2} ${cy})">${w}</text></g>`;
    x += pw + 3;
    return r;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="plates-svg" role="img">
    <rect x="8" y="${cy - 5}" width="54" height="10" rx="2" class="bar-steel"/>
    <rect x="58" y="${cy - 12}" width="8" height="24" rx="2" class="bar-collar"/>
    <rect x="66" y="${cy - 7}" width="${W - 74}" height="14" rx="3" class="bar-steel"/>
    ${plates}
  </svg>`;
}

/* ---------- Measured rendering ----------
   Charts are drawn at the real pixel width of their container so text and dots
   never get stretched. Views emit a slot; mountCharts() fills it after render. */
let slotId = 0;
const SLOTS = new Map();
export function chartSlot(fn, ...args) {
  const id = ++slotId;
  SLOTS.set(id, { fn, args });
  return `<div class="chart-slot" data-slot="${id}"></div>`;
}
export function mountCharts(root) {
  root.querySelectorAll('[data-slot]').forEach((el) => {
    const s = SLOTS.get(+el.dataset.slot);
    if (!s) return;
    const W = Math.max(240, Math.floor(el.clientWidth));
    const last = s.args.length - 1;
    const opts = { ...(s.args[last] || {}), width: W };
    el.innerHTML = s.fn(...s.args.slice(0, last), opts);
  });
}
export function resetCharts() { SLOTS.clear(); }
