// Deal labels on eBay search pages: rate the auctions and Buy It Now listings on the page,
// badge each one, and list the best ones. Runs when the user presses "Rate", or on every
// search page when they turn on auto-rate.
(() => {
  const LIMIT = 24; // listings rated per press; graded ones cost ~3 PokemonPriceTracker credits each (cached 12h)
  const send = (msg) =>
    chrome.runtime.sendMessage(msg).then((res) => {
      if (!res?.ok) throw new Error(res?.error ?? 'No response');
      return res.data;
    });
  const usd = FairmarkCard.usd;
  const h = FairmarkCard.h;

  const money = (s) => {
    const m = String(s ?? '').replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  };

  // "2d 3h left", "14m 5s left", "Time left 1h 2m" -> seconds.
  function secondsLeft(text) {
    const m = text.match(/((?:\d+\s*[dhms]\s*){1,4})\s*left/i) ?? text.match(/time left\s*((?:\d+\s*[dhms]\s*){1,4})/i);
    if (!m) return null;
    let s = 0;
    for (const [, n, u] of m[1].matchAll(/(\d+)\s*([dhms])/gi)) s += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[u.toLowerCase()];
    return s;
  }

  // One search result, in the classic (s-item) or newer (s-card) layout.
  function readResult(el) {
    const titleEl = el.querySelector('.s-item__title, .s-card__title, [role="heading"]');
    const title = titleEl?.textContent.replace(/^new listing/i, '').replace(/opens in a new window or tab/i, '').trim() ?? '';
    if (!title || /^shop on ebay$/i.test(title)) return null;
    // Join text nodes with spaces: eBay's inline spans would otherwise run together ("$150.0012 bids").
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.trim());
    const text = parts.filter(Boolean).join(' ');
    const priceText = el.querySelector('.s-item__price, .s-card__price')?.textContent ?? '';
    if (/\bto\b/.test(priceText)) return null; // price ranges are multi-variation listings
    const price = money(priceText) ?? money(text);
    const bids = text.match(/(\d+)\s+bids?\b/i);
    const auction = Boolean(bids) || /\bbid\b|\bauction\b/i.test(el.querySelector('.s-item__purchase-options, .s-card__attribute-row')?.textContent ?? '') || /\b0 bids\b/i.test(text);
    const shipping = /free (shipping|delivery)/i.test(text) ? 0 : money(text.match(/\+\s*\$[\d.,]+\s*(shipping|delivery)/i)?.[0]);
    const link = el.querySelector('a[href*="/itm/"]')?.href ?? null;
    return { el, title, price, bids: bids ? Number(bids[1]) : 0, auction, shipping, secondsLeft: secondsLeft(text), link };
  }

  const fmtLeft = (s) =>
    s == null ? '' : s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`;

  const BADGE = {
    steal: ['#0f7a45', '#e3f4ea'],
    good: ['#2f7a1f', '#ecf6e4'],
    fair: ['#474e5a', '#eef0f3'],
    over: ['#b42318', '#fdeceb'],
    none: ['#6d7380', '#f1f2f4'],
  };

  // A low-confidence title match gets no verdict: a wrong card's price would mislead.
  const unsure = (res) => res?.match === 'low';
  const verdictKey = (res) => (unsure(res) ? 'none' : res?.verdict?.key ?? 'none');
  const verdictLabel = (res) =>
    !res ? 'No match' : res.error ? 'Error' : unsure(res) ? 'Not sure which card' : res.verdict ? res.verdict.label : res.insufficient ? 'Not enough data' : 'No rating';

  function badgeText(r, res) {
    if (!res || res.error || unsure(res)) return `Fairmark: ${verdictLabel(res)}`;
    const parts = [verdictLabel(res)];
    if (res.reference) parts.push(`Market ${usd(res.reference)}`);
    if (res.maxBid > 0) parts.push(`${r.auction ? 'Max bid' : 'Pay ≤'} ${usd(res.maxBid)}`);
    else if (res.maxBid === 0) parts.push('Not worth it with shipping');
    if (res.match && res.match !== 'high') parts.push('check match');
    return `Fairmark: ${parts.join(' · ')}`;
  }

  function badge(r, res, text) {
    r.el.querySelector('.fm-hunt-badge')?.remove();
    const key = text ? 'none' : verdictKey(res);
    const [ink, bg] = BADGE[key];
    const b = h('div', {
      class: 'fm-hunt-badge',
      title: text ? '' : res && !unsure(res) ? [res.name, res.setName, res.grade, res.reason].filter(Boolean).join(' · ') : res ? `Best guess: ${res.name} (${res.setName}). Open the listing to pick the right card.` : 'Fairmark could not match this listing.',
      style: `display:inline-block;margin:4px 0;padding:3px 8px;border-radius:999px;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:${ink};background:${bg};border:1px solid ${ink}33`,
    }, text ?? badgeText(r, res));
    const anchor = r.el.querySelector('.s-item__title, .s-card__title, [role="heading"]');
    (anchor?.parentElement ?? r.el).append(b);
  }

  // The floating Hunt button and the snipe list, in a Shadow DOM so eBay's CSS can't reach them.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${FairmarkCard.CSS}
.fm-hunt-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 999px; background: var(--fm-line); color: #fff; font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; box-shadow: var(--fm-shadow); }
.fm-hunt-btn[disabled] { opacity: .7; cursor: progress; }
.fm-list { margin-top: 10px; max-height: 60vh; overflow-y: auto; }
.fm-row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 40px 1fr auto; gap: 8px; align-items: center; width: 100%; padding: 6px; border-radius: 8px; cursor: pointer; }
.fm-row:hover { background: var(--fm-raised); }
.fm-row img { width: 40px; height: 56px; object-fit: contain; border-radius: 4px; background: var(--fm-raised); }
.fm-row-name { font-size: 12px; font-weight: 600; line-height: 1.3; }
.fm-row-sub { font-size: 11px; color: var(--fm-muted); }
.fm-row-right { text-align: right; font-size: 11px; color: var(--fm-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.fm-row-right strong { display: block; font-size: 13px; color: var(--fm-ink); }
.fm-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; margin-top: 2px; }
.fm-pill.steal { color: var(--fm-steal-ink); background: var(--fm-steal-bg); }
.fm-pill.good { color: var(--fm-good-ink); background: var(--fm-good-bg); }
.fm-pill.fair { color: var(--fm-fair-ink); background: var(--fm-fair-bg); }
.fm-pill.over { color: var(--fm-over-ink); background: var(--fm-over-bg); }
.fm-pill.none { color: var(--fm-muted); background: var(--fm-raised); }
.fm-filter { display: flex; align-items: center; gap: 8px; margin-top: 2px; font-size: 12px; color: var(--fm-ink-2); }
.fm-filter input { box-sizing: border-box; width: 90px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--fm-border); background: var(--fm-raised); color: var(--fm-ink); font: inherit; }
.fm-filter input[type="checkbox"] { width: auto; margin: 0; padding: 0; }
.fm-go { all: unset; cursor: pointer; margin-left: auto; padding: 6px 12px; border-radius: 8px; background: var(--fm-line); color: #fff; font-weight: 700; font-size: 12px; }
.fm-go[disabled] { opacity: .7; cursor: progress; }
`;
  const root = document.createElement('div');
  shadow.append(style, root);
  document.body.append(host);

  const button = h('button', { class: 'fm-hunt-btn', title: `Rate up to ${LIMIT} listings on this page` }, 'Rate listings');
  root.append(button);

  // The most the user wants to spend: listings already priced above it are skipped.
  const maxInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'No limit', 'aria-label': 'Max price in US dollars' });
  const autoInput = h('input', { type: 'checkbox' });
  const go = h('button', { class: 'fm-go' }, 'Rate');
  const filter = h('div', {},
    h('div', { class: 'fm-filter' }, h('label', {}, 'Max price $'), maxInput, go),
    h('label', { class: 'fm-filter', style: 'margin-top:6px' }, autoInput, 'Rate every search page automatically'));
  const saveSettings = () =>
    chrome.storage.local.set({ fmHunt: { maxPrice: Number(maxInput.value.replace(/[^0-9.]/g, '')) || null, auto: autoInput.checked } });
  autoInput.addEventListener('change', saveSettings);

  function panel(...body) {
    root.replaceChildren(h('div', { class: 'fm-card fm-floating', style: 'width:360px' },
      h('div', { class: 'fm-top' },
        h('span', { class: 'fm-brand' }, 'Fairmark · Deals on this page'),
        h('button', { class: 'fm-icon-btn', 'aria-label': 'Close', onclick: () => root.replaceChildren(button) }, '×')),
      filter,
      ...body));
  }

  function showList(rows, note) {
    panel(
      note ? h('div', { class: 'fm-value-sub', style: 'margin-top:8px' }, note) : null,
      h('div', { class: 'fm-list' }, rows.map(({ r, res }) => {
        const key = verdictKey(res);
        const label = verdictLabel(res);
        const img = h('img', { src: res?.image ?? '', alt: '' });
        img.addEventListener('error', () => (img.style.visibility = 'hidden'));
        return h('button', { class: 'fm-row', onclick: () => r.link && window.open(r.link, '_blank', 'noopener') },
          img,
          h('div', {},
            h('div', { class: 'fm-row-name' }, res && !unsure(res) ? `${res.name}${res.grade ? ` · ${res.grade}` : ''}` : r.title.slice(0, 60)),
            h('div', { class: 'fm-row-sub' }, `${r.auction ? `${fmtLeft(r.secondsLeft)} left · ${r.bids} bid${r.bids === 1 ? '' : 's'}` : 'Buy It Now'}${res?.match === 'medium' ? ' · check match' : ''}`),
            h('span', { class: `fm-pill ${key}` }, label)),
          h('div', { class: 'fm-row-right' },
            h('strong', {}, usd(r.price)),
            res?.maxBid > 0 && !unsure(res) ? `max ${usd(res.maxBid)}` : ''));
      })),
    );
  }

  let last = null; // the latest results, so the button can reopen them

  button.addEventListener('click', () =>
    last ? showList(last.rows, last.note) : panel(h('div', { class: 'fm-value-sub', style: 'margin-top:8px' },
      'Rates auctions and Buy It Now listings. For snipes sort by "Time: ending soonest"; for fresh deals sort by "Time: newly listed". Leave max price empty for no limit.')));

  maxInput.addEventListener('keydown', (e) => e.key === 'Enter' && go.click());
  go.addEventListener('click', () => run(true));

  // Rates the listings on the page that aren't badged yet, so pressing again rates the next batch.
  async function run(open) {
    saveSettings();
    const maxPrice = Number(maxInput.value.replace(/[^0-9.]/g, '')) || null;
    const all = [...document.querySelectorAll('li.s-item, li.s-card, .srp-results > li')]
      .filter((el) => !el.querySelector('.fm-hunt-badge'))
      .map(readResult)
      .filter((r) => r?.price);
    const over = all.filter((r) => maxPrice && r.price > maxPrice);
    over.forEach((r) => badge(r, null, `Fairmark: over your ${usd(maxPrice)} max`));
    const picked = all.filter((r) => !over.includes(r)).slice(0, LIMIT);
    const remaining = all.length - over.length - picked.length;
    if (!picked.length) {
      if (open || last) showList(last?.rows ?? [], all.length ? `Everything left here is over ${usd(maxPrice)}.` : last ? 'Every listing on this page is rated.' : 'No listings found on this page.');
      return;
    }
    go.disabled = true;
    go.textContent = `Checking ${picked.length}…`;
    button.textContent = `Rating ${picked.length}…`;
    try {
      const results = await send({
        type: 'hunt',
        items: picked.map((r) => ({ title: r.title, price: r.price, listing: { shipping: r.shipping, auction: r.auction } })),
      });
      const rows = [...(last?.rows ?? []), ...picked.map((r, i) => ({ r, res: results[i] }))];
      picked.forEach((r, i) => badge(r, results[i]));
      // Auctions first, soonest ending; then Buy It Now, best deal first.
      const rank = (res) => ({ steal: 0, good: 1, fair: 2, over: 3 }[verdictKey(res)] ?? 9);
      rows.sort((a, b) =>
        (b.r.auction - a.r.auction) ||
        (a.r.auction ? (a.r.secondsLeft ?? Infinity) - (b.r.secondsLeft ?? Infinity) : 0) ||
        rank(a.res) - rank(b.res) ||
        (a.res?.pct ?? Infinity) - (b.res?.pct ?? Infinity));
      const worth = rows.filter(({ res }) => rank(res) <= 1).length;
      const note = [
        `${worth} of ${rows.length} are good buys at the listed price.`,
        rows.some(({ r }) => r.auction) ? 'Auction bids usually rise, so stay under the max bid.' : '',
        over.length ? `Skipped ${over.length} over ${usd(maxPrice)}.` : '',
        remaining ? `Press Rate for the next ${Math.min(remaining, LIMIT)}.` : '',
      ].filter(Boolean).join(' ');
      last = { rows, note };
      button.textContent = worth ? `${worth} good buy${worth === 1 ? '' : 's'}` : 'No good buys';
      if (open || root.querySelector('.fm-card')) showList(rows, note);
    } catch (err) {
      button.textContent = 'Rate listings';
      if (open) showList([], `Couldn't check prices: ${err.message}`);
    } finally {
      go.disabled = false;
      go.textContent = 'Rate';
    }
  }

  chrome.storage.local.get('fmHunt').then(({ fmHunt }) => {
    if (fmHunt?.maxPrice) maxInput.value = fmHunt.maxPrice;
    autoInput.checked = Boolean(fmHunt?.auto);
    if (fmHunt?.auto) run(false);
  });
})();
