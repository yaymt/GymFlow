// The barbell on Home: one plate per session this week (SVG string, no dependencies).

const PLATE_COLORS = ['var(--bar-1, var(--plate-red))', 'var(--bar-2, var(--plate-blue))', 'var(--bar-3, var(--plate-yellow))', 'var(--bar-4, var(--plate-green))'];

/**
 * The signature visual: a barbell loaded with one plate per session this week.
 * done: sessions completed, goal: weekly target
 */
export function barbell(done, goal) {
  const W = 360, H = 120, cy = 60;
  const slots = Math.max(goal, done);
  const perSide = Math.ceil(slots / 2);
  // each plate is clearly smaller than the one before it: tall and wide near the middle, small at the tip
  const gap = 3;
  const hOf = (k) => Math.max(26, 96 - k * 17);
  const wOf = (k) => Math.max(8, 16 - k * 2);
  let used = 0;
  for (let k = 0; k < perSide; k++) used += wOf(k) + gap;
  const sleeveStart = 92, sleeveLen = used + 12;
  let plates = '';
  const plate = (x, k, i, filled) => {
    const h = hOf(k), w = wOf(k);
    return filled
      ? `<rect x="${x}" y="${cy - h / 2}" width="${w}" height="${h}" rx="3" style="fill:${PLATE_COLORS[i % 4]}" class="plate"/>`
      : `<rect x="${x + 0.75}" y="${cy - h / 2 + 0.75}" width="${w - 1.5}" height="${h - 1.5}" rx="3" class="plate-ghost"/>`;
  };
  // order: plates alternate right, left (index 0 right, 1 left, ...)
  const off = [0];
  for (let k = 0; k < perSide; k++) off.push(off[k] + wOf(k) + gap);
  for (let i = 0; i < slots; i++) {
    const k = Math.floor(i / 2);
    const filled = i < done;
    plates += i % 2 === 0
      ? plate(W - sleeveStart + 6 + off[k], k, k, filled)
      : plate(sleeveStart - 6 - wOf(k) - off[k], k, k, filled);
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
