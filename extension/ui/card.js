// The price card, shared by the on-page panel and the popup.
// Plain script (content scripts can't be modules); exposes globalThis.FairmarkCard.
(() => {
  const CSS = `
:host, .fm-root {
  --fm-surface: #ffffff;
  --fm-raised: #f6f7f9;
  --fm-border: #e3e5e9;
  --fm-ink: #16181d;
  --fm-ink-2: #4a505b;
  --fm-muted: #6d7380;
  --fm-line: #2f6fdf;
  --fm-area: rgba(47, 111, 223, 0.10);
  --fm-steal-ink: #0f7a45; --fm-steal-bg: #e3f4ea;
  --fm-good-ink: #2f7a1f;  --fm-good-bg: #ecf6e4;
  --fm-fair-ink: #474e5a;  --fm-fair-bg: #eef0f3;
  --fm-pricey-ink: #9a5800; --fm-pricey-bg: #fdf0dc;
  --fm-over-ink: #b42318;  --fm-over-bg: #fdeceb;
  --fm-shadow: 0 8px 28px rgba(16, 24, 40, 0.14), 0 1px 3px rgba(16, 24, 40, 0.08);
}
@media (prefers-color-scheme: dark) {
  :host, .fm-root {
    --fm-surface: #18191d;
    --fm-raised: #222329;
    --fm-border: #31333b;
    --fm-ink: #f1f2f4;
    --fm-ink-2: #c4c7ce;
    --fm-muted: #9399a4;
    --fm-line: #7ea6ff;
    --fm-area: rgba(126, 166, 255, 0.14);
    --fm-steal-ink: #5fd394; --fm-steal-bg: #15301f;
    --fm-good-ink: #93d36a;  --fm-good-bg: #1f2e17;
    --fm-fair-ink: #c4c7ce;  --fm-fair-bg: #2a2c33;
    --fm-pricey-ink: #f5b35b; --fm-pricey-bg: #362812;
    --fm-over-ink: #ff8a7f;  --fm-over-bg: #3a1a18;
    --fm-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
}
.fm-card {
  box-sizing: border-box; width: 320px; padding: 14px; border-radius: 14px;
  background: var(--fm-surface); color: var(--fm-ink); border: 1px solid var(--fm-border);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  text-align: left; letter-spacing: normal;
}
.fm-card * { box-sizing: border-box; }
.fm-floating { box-shadow: var(--fm-shadow); }
.fm-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.fm-brand { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--fm-muted); }
.fm-icon-btn { all: unset; cursor: pointer; color: var(--fm-muted); font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.fm-icon-btn:hover { background: var(--fm-raised); color: var(--fm-ink); }
.fm-product { display: flex; gap: 10px; align-items: flex-start; }
.fm-thumb { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; background: var(--fm-raised); flex: none; }
.fm-name { font-weight: 600; font-size: 14px; line-height: 1.3; margin: 0; }
.fm-sub { color: var(--fm-muted); font-size: 12px; margin-top: 2px; }
.fm-select { font: inherit; font-size: 12px; color: var(--fm-ink-2); background: var(--fm-raised); border: 1px solid var(--fm-border); border-radius: 6px; padding: 2px 4px; margin-top: 4px; max-width: 100%; }
.fm-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.fm-tile { background: var(--fm-raised); border-radius: 10px; padding: 8px 10px; }
.fm-label { font-size: 11px; color: var(--fm-muted); }
.fm-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 1px; }
.fm-ask { display: flex; align-items: baseline; gap: 2px; font-size: 20px; font-weight: 700; margin-top: 1px; }
.fm-ask input { all: unset; width: 100%; font-variant-numeric: tabular-nums; color: var(--fm-ink); border-bottom: 1px dashed var(--fm-border); }
.fm-ask input:focus { border-bottom-color: var(--fm-line); }
.fm-verdict { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 12px 14px; border-radius: 12px; color: var(--fm-fair-ink); background: var(--fm-fair-bg); }
.fm-verdict-icon { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; font-size: 17px; font-weight: 800; background: currentColor; }
.fm-verdict-icon span { color: var(--fm-surface); }
.fm-verdict-label { font-size: 22px; font-weight: 800; line-height: 1.1; letter-spacing: -0.01em; }
.fm-verdict-sub { font-size: 12px; font-weight: 500; margin-top: 2px; color: var(--fm-ink-2); font-variant-numeric: tabular-nums; }
.fm-verdict.steal { color: var(--fm-steal-ink); background: var(--fm-steal-bg); }
.fm-verdict.good { color: var(--fm-good-ink); background: var(--fm-good-bg); }
.fm-verdict.fair { color: var(--fm-fair-ink); background: var(--fm-fair-bg); }
.fm-verdict.pricey { color: var(--fm-pricey-ink); background: var(--fm-pricey-bg); }
.fm-verdict.over { color: var(--fm-over-ink); background: var(--fm-over-bg); }
.fm-verdict.none .fm-verdict-label { font-size: 15px; font-weight: 700; color: var(--fm-ink-2); }
.fm-verdict.none .fm-verdict-icon { background: var(--fm-border); }
.fm-value-sub { font-size: 11px; color: var(--fm-muted); margin-top: 1px; font-variant-numeric: tabular-nums; }
.fm-note { margin-top: 8px; font-size: 12px; color: var(--fm-ink-2); background: var(--fm-raised); border-radius: 8px; padding: 7px 10px; }
.fm-chart { margin-top: 12px; position: relative; }
.fm-chart-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--fm-muted); margin-bottom: 4px; }
.fm-chart-head strong { color: var(--fm-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.fm-chart svg { display: block; width: 100%; height: 64px; overflow: visible; }
.fm-range { display: flex; justify-content: space-between; font-size: 11px; color: var(--fm-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
.fm-tip { position: absolute; top: 18px; pointer-events: none; background: var(--fm-ink); color: var(--fm-surface); font-size: 11px; padding: 3px 6px; border-radius: 6px; white-space: nowrap; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
.fm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 11px; color: var(--fm-muted); }
.fm-foot a { color: var(--fm-line); text-decoration: none; font-weight: 600; }
.fm-foot a:hover { text-decoration: underline; }
.fm-alts { margin-top: 8px; }
.fm-alts summary { cursor: pointer; font-size: 12px; color: var(--fm-muted); }
.fm-alt { all: unset; display: block; width: 100%; cursor: pointer; padding: 6px 8px; border-radius: 8px; font-size: 12px; }
.fm-alt:hover { background: var(--fm-raised); }
.fm-alt span { color: var(--fm-muted); }
.fm-empty { color: var(--fm-ink-2); font-size: 13px; padding: 6px 0; }
.fm-skel { height: 12px; border-radius: 6px; background: var(--fm-raised); margin: 8px 0; animation: fm-pulse 1.2s ease-in-out infinite; }
@keyframes fm-pulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .fm-skel { animation: none; } }
`;

  const DEAL_ICON = { steal: '★', good: '✓', fair: '≈', pricey: '!', over: '✕', none: '?' };

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

  function chart(points, stats, title = 'history') {
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
      s('path', { d: `${line}L${x(points.length - 1)},${H}L0,${H}Z`, fill: 'var(--fm-area)', stroke: 'none' }),
      s('path', { d: line, fill: 'none', stroke: 'var(--fm-line)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    );
    const cross = s('line', { y1: 0, y2: H, stroke: 'var(--fm-muted)', 'stroke-width': 1, 'stroke-dasharray': '2 2', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
    svg.append(cross);

    const dot = h('div', { style: 'position:absolute;width:8px;height:8px;border-radius:50%;background:var(--fm-line);border:2px solid var(--fm-surface);transform:translate(-50%,-50%);pointer-events:none;visibility:hidden' });
    const tip = h('div', { class: 'fm-tip', style: 'visibility:hidden' });
    const plot = h('div', { style: 'position:relative' }, svg, dot);
    const wrap = h('div', { class: 'fm-chart' });

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
      h('div', { class: 'fm-chart-head' },
        h('span', {}, `${stats.days >= 85 ? '90-day' : `${stats.days}-day`} ${title}`),
        h('span', {}, `${arrow} `, h('strong', {}, `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`))),
      plot,
      tip,
      h('div', { class: 'fm-range' },
        h('span', {}, `Low ${usd(stats.low.price)} · ${fmtDate(stats.low.date)}`),
        h('span', {}, `High ${usd(stats.high.price)} · ${fmtDate(stats.high.date)}`)),
    );
    return wrap;
  }

  // The headline: a colored verdict, or a neutral line saying why there isn't one.
  function verdict(deal, against, why) {
    if (!deal) {
      return h('div', { class: 'fm-verdict none', role: 'status' },
        h('div', { class: 'fm-verdict-icon', 'aria-hidden': 'true' }, h('span', {}, DEAL_ICON.none)),
        h('div', {}, h('div', { class: 'fm-verdict-label' }, why)));
    }
    const pct = Math.abs(deal.pct);
    const sub =
      pct < 0.5
        ? `Right at ${against}`
        : `${usd(Math.abs(deal.diff))} ${deal.pct < 0 ? 'under' : 'over'} ${against} (${pct >= 1000 ? `${(deal.pct / 100 + 1).toFixed(0)}×` : `${pct.toFixed(0)}%`})`;
    return h('div', { class: `fm-verdict ${deal.key}`, role: 'status' },
      h('div', { class: 'fm-verdict-icon', 'aria-hidden': 'true' }, h('span', {}, DEAL_ICON[deal.key])),
      h('div', {}, h('div', { class: 'fm-verdict-label' }, deal.label), h('div', { class: 'fm-verdict-sub' }, sub)));
  }

  // state: { status: 'loading' | 'error' | 'empty' | 'ready', item, alternatives, confidence, parsed, ask, message }
  // on: { close, ask(price), pick(alt), subtype(name) }
  function render(root, state, on = {}, opts = {}) {
    const card = h('div', { class: `fm-card${opts.floating ? ' fm-floating' : ''}` });
    if (opts.brand !== false) card.append(
      h('div', { class: 'fm-top' },
        h('span', { class: 'fm-brand' }, 'Fairmark'),
        on.close ? h('button', { class: 'fm-icon-btn', 'aria-label': 'Close', title: 'Close', onclick: on.close }, '×') : null),
    );

    if (state.status === 'loading') {
      card.append(h('div', { class: 'fm-skel', style: 'width:70%' }), h('div', { class: 'fm-skel' }), h('div', { class: 'fm-skel', style: 'height:48px' }));
    } else if (state.status !== 'ready' || !state.item) {
      card.append(h('div', { class: 'fm-empty' }, state.message ?? 'No price match found for this item.'));
    } else {
      const { item, parsed = {} } = state;
      const number = item.name.includes(item.number) ? '' : item.number;
      const sub = [item.setName, number, item.sealed ? 'Sealed' : item.rarity].filter(Boolean).join(' · ');
      const img = h('img', { class: 'fm-thumb', src: item.image, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      const subtypeSelect =
        item.subtypes.length > 1
          ? h('select', { class: 'fm-select', 'aria-label': 'Printing', onchange: (e) => on.subtype?.(e.target.value) },
              item.subtypes.map((st) => {
                const o = h('option', { value: st }, st);
                o.selected = st === item.subtype;
                return o;
              }))
          : null;
      card.append(
        h('div', { class: 'fm-product' }, img,
          h('div', {}, h('p', { class: 'fm-name' }, item.name), h('div', { class: 'fm-sub' }, sub), subtypeSelect)),
      );

      const graded = item.graded ?? parsed.grade ?? null;
      const gradeName = graded ? `${graded.company} ${graded.grade}` : '';
      const reference = graded ? graded.price ?? null : item.market;

      let why = null;
      if (parsed.lot) why = 'Lot or multiple copies';
      else if (graded && reference == null) why = `No ${gradeName} price yet`;
      else if (reference == null) why = 'No market price yet';
      else if (!state.ask) why = 'Enter a price to rate it';
      card.append(verdict(why ? null : item.deal, graded ? `${gradeName} price` : 'market', why));

      const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Your price in US dollars', value: state.ask ? Number(state.ask).toFixed(2) : '' });
      input.addEventListener('change', () => on.ask?.(Number(input.value.replace(/[^0-9.]/g, '')) || null));
      card.append(
        h('div', { class: 'fm-prices' },
          h('div', { class: 'fm-tile' },
            h('div', { class: 'fm-label' }, graded ? `${gradeName} price` : 'Market price'),
            h('div', { class: 'fm-value' }, usd(reference)),
            graded ? h('div', { class: 'fm-value-sub' }, `Ungraded ${usd(item.market)}`) : null),
          h('div', { class: 'fm-tile' }, h('div', { class: 'fm-label' }, opts.askLabel ?? 'Your price'), h('div', { class: 'fm-ask' }, '$', input))),
      );

      const ppt = item.ppt ?? {};
      if (graded && reference != null) {
        card.append(h('div', { class: 'fm-note' }, `Compared with recent ${gradeName} eBay sales${graded.sales ? ` (${graded.sales} sold)` : ''}.`));
      } else if (graded) {
        const reason =
          ppt.status === 'nokey' ? `Add a PokemonPriceTracker key in Settings to compare with ${gradeName} sales.`
          : ppt.status === 'unsupported' ? 'Graded prices are only available for Pokémon so far.'
          : ppt.status === 'error' ? `Couldn't load graded prices (${ppt.error}).`
          : `No recent ${gradeName} sales found.`;
        card.append(h('div', { class: 'fm-note' }, `${reason} Graded copies usually sell for well above the ungraded price.`));
      } else if (parsed.lot) {
        card.append(h('div', { class: 'fm-note' }, 'This looks like a lot or multiple copies, so compare against the market price times the quantity.'));
      }
      if (state.confidence === 'low' || state.confidence === 'medium') {
        card.append(h('div', { class: 'fm-note' }, 'Best guess from the listing title. Check that this is the right item.'));
      }

      if (item.points?.length >= 2) card.append(chart(item.points, item.stats, graded ? 'ungraded history' : 'history'));
      else {
        const more =
          ppt.status === 'nokey' ? ' Add a PokemonPriceTracker key in Settings for 90 days of history now.'
          : ppt.status === 'error' || ppt.error ? ` Couldn't load longer history (${ppt.error}).`
          : '';
        const since = item.points?.[0]?.date;
        card.append(h('div', { class: 'fm-note' }, `${since ? `Price history is tracked daily from ${fmtDate(since)}, so the chart fills in over the coming days.` : 'No price history yet.'}${more}`));
      }

      const alts = (state.alternatives ?? []).filter((a) => a.productId !== item.productId);
      if (alts.length) {
        card.append(
          h('details', { class: 'fm-alts' },
            h('summary', {}, 'Not the right item?'),
            alts.map((a) => h('button', { class: 'fm-alt', onclick: () => on.pick?.(a) }, a.name, ' ', h('span', {}, `${a.setName}${a.number ? ` · ${a.number}` : ''}`)))),
        );
      }

      card.append(
        h('div', { class: 'fm-foot' },
          h('span', {},
            `TCGplayer market · ${item.updated ? fmtDate(item.updated) : ''}`,
            item.historySource === 'PokemonPriceTracker' ? h('br') : null,
            item.historySource === 'PokemonPriceTracker' ? 'History via PokemonPriceTracker' : null),
          h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, 'View on TCGplayer ↗')),
      );
    }
    root.replaceChildren(card);
    return card;
  }

  globalThis.FairmarkCard = { CSS, render, h, usd };
})();
