// The price card, shared by the on-page panel and the popup.
// Plain script (content scripts can't be modules); exposes globalThis.SODCard.
(() => {
  const CSS = `
:host, .sod-root {
  --sod-surface: #ffffff;
  --sod-raised: #f6f7f9;
  --sod-border: #e3e5e9;
  --sod-ink: #16181d;
  --sod-ink-2: #4a505b;
  --sod-muted: #6d7380;
  --sod-line: #2f6fdf;
  --sod-area: rgba(47, 111, 223, 0.10);
  --sod-steal-ink: #0f7a45; --sod-steal-bg: #e3f4ea;
  --sod-good-ink: #2f7a1f;  --sod-good-bg: #ecf6e4;
  --sod-fair-ink: #474e5a;  --sod-fair-bg: #eef0f3;
  --sod-pricey-ink: #9a5800; --sod-pricey-bg: #fdf0dc;
  --sod-over-ink: #b42318;  --sod-over-bg: #fdeceb;
  --sod-shadow: 0 8px 28px rgba(16, 24, 40, 0.14), 0 1px 3px rgba(16, 24, 40, 0.08);
}
@media (prefers-color-scheme: dark) {
  :host, .sod-root {
    --sod-surface: #18191d;
    --sod-raised: #222329;
    --sod-border: #31333b;
    --sod-ink: #f1f2f4;
    --sod-ink-2: #c4c7ce;
    --sod-muted: #9399a4;
    --sod-line: #7ea6ff;
    --sod-area: rgba(126, 166, 255, 0.14);
    --sod-steal-ink: #5fd394; --sod-steal-bg: #15301f;
    --sod-good-ink: #93d36a;  --sod-good-bg: #1f2e17;
    --sod-fair-ink: #c4c7ce;  --sod-fair-bg: #2a2c33;
    --sod-pricey-ink: #f5b35b; --sod-pricey-bg: #362812;
    --sod-over-ink: #ff8a7f;  --sod-over-bg: #3a1a18;
    --sod-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
}
.sod-card {
  box-sizing: border-box; width: 320px; padding: 14px; border-radius: 14px;
  background: var(--sod-surface); color: var(--sod-ink); border: 1px solid var(--sod-border);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  text-align: left; letter-spacing: normal;
}
.sod-card * { box-sizing: border-box; }
.sod-floating { box-shadow: var(--sod-shadow); }
.sod-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sod-brand { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--sod-muted); }
.sod-icon-btn { all: unset; cursor: pointer; color: var(--sod-muted); font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.sod-icon-btn:hover { background: var(--sod-raised); color: var(--sod-ink); }
.sod-product { display: flex; gap: 10px; align-items: flex-start; }
.sod-thumb { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; background: var(--sod-raised); flex: none; }
.sod-name { font-weight: 600; font-size: 14px; line-height: 1.3; margin: 0; }
.sod-sub { color: var(--sod-muted); font-size: 12px; margin-top: 2px; }
.sod-select { font: inherit; font-size: 12px; color: var(--sod-ink-2); background: var(--sod-raised); border: 1px solid var(--sod-border); border-radius: 6px; padding: 2px 4px; margin-top: 4px; max-width: 100%; }
.sod-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.sod-tile { background: var(--sod-raised); border-radius: 10px; padding: 8px 10px; }
.sod-label { font-size: 11px; color: var(--sod-muted); }
.sod-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 1px; }
.sod-ask { display: flex; align-items: baseline; gap: 2px; font-size: 20px; font-weight: 700; margin-top: 1px; }
.sod-ask input { all: unset; width: 100%; font-variant-numeric: tabular-nums; color: var(--sod-ink); border-bottom: 1px dashed var(--sod-border); }
.sod-ask input:focus { border-bottom-color: var(--sod-line); }
.sod-deal { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding: 9px 12px; border-radius: 10px; font-weight: 600; }
.sod-deal small { font-weight: 500; font-size: 12px; }
.sod-deal.steal { color: var(--sod-steal-ink); background: var(--sod-steal-bg); }
.sod-deal.good { color: var(--sod-good-ink); background: var(--sod-good-bg); }
.sod-deal.fair { color: var(--sod-fair-ink); background: var(--sod-fair-bg); }
.sod-deal.pricey { color: var(--sod-pricey-ink); background: var(--sod-pricey-bg); }
.sod-deal.over { color: var(--sod-over-ink); background: var(--sod-over-bg); }
.sod-deal-icon { font-size: 15px; margin-right: 6px; }
.sod-note { margin-top: 8px; font-size: 12px; color: var(--sod-ink-2); background: var(--sod-raised); border-radius: 8px; padding: 7px 10px; }
.sod-chart { margin-top: 12px; position: relative; }
.sod-chart-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--sod-muted); margin-bottom: 4px; }
.sod-chart-head strong { color: var(--sod-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.sod-chart svg { display: block; width: 100%; height: 64px; overflow: visible; }
.sod-range { display: flex; justify-content: space-between; font-size: 11px; color: var(--sod-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
.sod-tip { position: absolute; top: 18px; pointer-events: none; background: var(--sod-ink); color: var(--sod-surface); font-size: 11px; padding: 3px 6px; border-radius: 6px; white-space: nowrap; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
.sod-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 11px; color: var(--sod-muted); }
.sod-foot a { color: var(--sod-line); text-decoration: none; font-weight: 600; }
.sod-foot a:hover { text-decoration: underline; }
.sod-alts { margin-top: 8px; }
.sod-alts summary { cursor: pointer; font-size: 12px; color: var(--sod-muted); }
.sod-alt { all: unset; display: block; width: 100%; cursor: pointer; padding: 6px 8px; border-radius: 8px; font-size: 12px; }
.sod-alt:hover { background: var(--sod-raised); }
.sod-alt span { color: var(--sod-muted); }
.sod-empty { color: var(--sod-ink-2); font-size: 13px; padding: 6px 0; }
.sod-skel { height: 12px; border-radius: 6px; background: var(--sod-raised); margin: 8px 0; animation: sod-pulse 1.2s ease-in-out infinite; }
@keyframes sod-pulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .sod-skel { animation: none; } }
`;

  const DEAL_ICON = { steal: '★', good: '▼', fair: '●', pricey: '▲', over: '▲' };

  const usd = (n) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  const SVG = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function chart(points, stats) {
    const W = 290;
    const H = 64;
    const pad = 4;
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || max * 0.1 || 1;
    const x = (i) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
    const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join('');
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Market price over ${stats.days} days, from ${usd(stats.first.price)} to ${usd(stats.last.price)}` });
    svg.append(
      s('path', { d: `${line}L${x(points.length - 1)},${H}L0,${H}Z`, fill: 'var(--sod-area)', stroke: 'none' }),
      s('path', { d: line, fill: 'none', stroke: 'var(--sod-line)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    );
    const cross = s('line', { y1: 0, y2: H, stroke: 'var(--sod-muted)', 'stroke-width': 1, 'stroke-dasharray': '2 2', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
    svg.append(cross);

    const dot = h('div', { style: 'position:absolute;width:8px;height:8px;border-radius:50%;background:var(--sod-line);border:2px solid var(--sod-surface);transform:translate(-50%,-50%);pointer-events:none;visibility:hidden' });
    const tip = h('div', { class: 'sod-tip', style: 'visibility:hidden' });
    const plot = h('div', { style: 'position:relative' }, svg, dot);
    const wrap = h('div', { class: 'sod-chart' });

    const show = (i) => {
      const p = points[i];
      const px = (x(i) / W) * plot.clientWidth;
      const py = (y(p.price) / H) * plot.clientHeight;
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      dot.style.left = `${px}px`;
      dot.style.top = `${py}px`;
      dot.style.visibility = 'visible';
      tip.textContent = `${fmtDate(p.date)} · ${usd(p.price)}`;
      tip.style.left = `${Math.min(Math.max(px, 50), plot.clientWidth - 50)}px`;
      tip.style.visibility = 'visible';
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dot.style.visibility = 'hidden';
      tip.style.visibility = 'hidden';
    };
    plot.addEventListener('mousemove', (e) => {
      const r = plot.getBoundingClientRect();
      const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
      show(Math.max(0, Math.min(points.length - 1, i)));
    });
    plot.addEventListener('mouseleave', hide);

    const change = stats.changePct;
    const arrow = change > 0.5 ? '▲' : change < -0.5 ? '▼' : '';
    wrap.append(
      h('div', { class: 'sod-chart-head' },
        h('span', {}, `${stats.days >= 85 ? '90-day' : `${stats.days}-day`} history`),
        h('span', {}, `${arrow} `, h('strong', {}, `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`))),
      plot,
      tip,
      h('div', { class: 'sod-range' },
        h('span', {}, `Low ${usd(stats.low.price)} · ${fmtDate(stats.low.date)}`),
        h('span', {}, `High ${usd(stats.high.price)} · ${fmtDate(stats.high.date)}`)),
    );
    return wrap;
  }

  function dealBlock(deal) {
    if (!deal) return null;
    const pct = Math.abs(deal.pct).toFixed(0);
    const text =
      Math.abs(deal.pct) < 0.5
        ? 'Right at market'
        : `${pct}% ${deal.pct < 0 ? 'under' : 'over'} market (${deal.diff < 0 ? '−' : '+'}${usd(Math.abs(deal.diff))})`;
    return h('div', { class: `sod-deal ${deal.key}`, role: 'status' },
      h('span', {}, h('span', { class: 'sod-deal-icon', 'aria-hidden': 'true' }, DEAL_ICON[deal.key]), deal.label),
      h('small', {}, text));
  }

  // state: { status: 'loading' | 'error' | 'empty' | 'ready', item, alternatives, confidence, parsed, ask, message }
  // on: { close, ask(price), pick(alt), subtype(name) }
  function render(root, state, on = {}, opts = {}) {
    const card = h('div', { class: `sod-card${opts.floating ? ' sod-floating' : ''}` });
    if (opts.brand !== false) card.append(
      h('div', { class: 'sod-top' },
        h('span', { class: 'sod-brand' }, 'Steal or Deal'),
        on.close ? h('button', { class: 'sod-icon-btn', 'aria-label': 'Close', title: 'Close', onclick: on.close }, '×') : null),
    );

    if (state.status === 'loading') {
      card.append(h('div', { class: 'sod-skel', style: 'width:70%' }), h('div', { class: 'sod-skel' }), h('div', { class: 'sod-skel', style: 'height:48px' }));
    } else if (state.status !== 'ready' || !state.item) {
      card.append(h('div', { class: 'sod-empty' }, state.message ?? 'No price match found for this item.'));
    } else {
      const { item, parsed = {} } = state;
      const number = item.name.includes(item.number) ? '' : item.number;
      const sub = [item.setName, number, item.sealed ? 'Sealed' : item.rarity].filter(Boolean).join(' · ');
      const img = h('img', { class: 'sod-thumb', src: item.image, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      const subtypeSelect =
        item.subtypes.length > 1
          ? h('select', { class: 'sod-select', 'aria-label': 'Printing', onchange: (e) => on.subtype?.(e.target.value) },
              item.subtypes.map((st) => {
                const o = h('option', { value: st }, st);
                o.selected = st === item.subtype;
                return o;
              }))
          : null;
      card.append(
        h('div', { class: 'sod-product' }, img,
          h('div', {}, h('p', { class: 'sod-name' }, item.name), h('div', { class: 'sod-sub' }, sub), subtypeSelect)),
      );

      const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Your price in US dollars', value: state.ask ? Number(state.ask).toFixed(2) : '' });
      input.addEventListener('change', () => on.ask?.(Number(input.value.replace(/[^0-9.]/g, '')) || null));
      card.append(
        h('div', { class: 'sod-prices' },
          h('div', { class: 'sod-tile' }, h('div', { class: 'sod-label' }, 'Market price'), h('div', { class: 'sod-value' }, usd(item.market))),
          h('div', { class: 'sod-tile' }, h('div', { class: 'sod-label' }, opts.askLabel ?? 'Your price'), h('div', { class: 'sod-ask' }, '$', input))),
      );

      const graded = parsed.grade;
      if (!graded && !parsed.lot) card.append(dealBlock(item.deal));
      if (graded) {
        card.append(h('div', { class: 'sod-note' }, `Graded ${graded.company} ${graded.grade}. The market price shown is for an ungraded copy, so graded copies usually sell for more.`));
      } else if (parsed.lot) {
        card.append(h('div', { class: 'sod-note' }, 'This looks like a lot or multiple copies, so compare against the market price times the quantity.'));
      }
      if (state.confidence === 'low' || state.confidence === 'medium') {
        card.append(h('div', { class: 'sod-note' }, 'Best guess from the listing title. Check that this is the right item.'));
      }
      if (item.market == null) card.append(h('div', { class: 'sod-note' }, 'Not enough recent sales for a market price.'));

      if (item.points?.length >= 2) card.append(chart(item.points, item.stats));

      const alts = (state.alternatives ?? []).filter((a) => a.productId !== item.productId);
      if (alts.length) {
        card.append(
          h('details', { class: 'sod-alts' },
            h('summary', {}, 'Not the right item?'),
            alts.map((a) => h('button', { class: 'sod-alt', onclick: () => on.pick?.(a) }, a.name, ' ', h('span', {}, `${a.setName}${a.number ? ` · ${a.number}` : ''}`)))),
        );
      }

      card.append(
        h('div', { class: 'sod-foot' },
          h('span', {}, `TCGplayer market · ${item.updated ? fmtDate(item.updated) : ''}`),
          h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, 'View on TCGplayer ↗')),
      );
    }
    root.replaceChildren(card);
    return card;
  }

  globalThis.SODCard = { CSS, render, h, usd };
})();
