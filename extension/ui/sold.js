// Reads eBay's sold listings for a search URL (LH_Sold=1), from inside an eBay page so
// the request carries the user's eBay sign-in, which eBay now requires for sold results.
// Plain script (content scripts can't be modules); exposes globalThis.FairmarkSold.
(() => {
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  const money = (s) => {
    const m = String(s ?? '').replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  };

  // "Sold  Nov 8, 2026" or "Sold 8 Nov 2026" -> '2026-11-08'.
  function soldDate(text) {
    let m = text.match(/sold\s+([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m) return iso(m[3], MONTHS[m[1].toLowerCase()], m[2]);
    m = text.match(/sold\s+(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i);
    if (m) return iso(m[3], MONTHS[m[2].toLowerCase()], m[1]);
    return null;
  }
  const iso = (y, mo, d) => (mo ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);

  function textOf(el) {
    const parts = [];
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue.trim());
    return parts.filter(Boolean).join(' ');
  }

  // One sold result, in the classic (s-item) or newer (s-card) layout.
  function readSale(el) {
    const titleEl = el.querySelector('.s-item__title, .s-card__title, [role="heading"]');
    const title = titleEl ? textOf(titleEl).replace(/^new listing/i, '').replace(/opens in a new window or tab/i, '').trim() : '';
    if (!title || /^shop on ebay$/i.test(title)) return null;
    const text = textOf(el);
    const priceEl = el.querySelector('.s-item__price, .s-card__price');
    const priceText = priceEl ? textOf(priceEl) : '';
    if (/\bto\b/.test(priceText)) return null; // a price range: several variations
    const price = money(priceText) ?? money(text);
    // Best offer sales show the asking price struck through; the real price is hidden.
    const bestOffer = /best offer accepted/i.test(text) || Boolean(el.querySelector('.STRIKETHROUGH, .strikethrough, s, del'));
    const shipping = /free (shipping|delivery)/i.test(text) ? 0 : money(text.match(/\+\s*\$[\d.,]+\s*(shipping|delivery|postage)/i)?.[0]);
    const link = el.querySelector('a[href*="/itm/"]')?.getAttribute('href') ?? null;
    return { title, price, date: soldDate(text), bestOffer, shipping, url: link ? link.split('?')[0] : null };
  }

  // Sold results above eBay's "Results matching fewer words" divider, which are other cards.
  function parse(doc) {
    const items = [...doc.querySelectorAll('.srp-results > li, ul.srp-results li.s-item, ul.srp-results li.s-card')];
    const list = items.length ? [...new Set(items)] : [...doc.querySelectorAll('li.s-item, li.s-card')];
    const out = [];
    for (const el of list) {
      if (/REWRITE_START/i.test(el.className) || /results matching fewer words/i.test(el.textContent.slice(0, 200))) break;
      if (!el.matches('.s-item, .s-card')) continue;
      const sale = readSale(el);
      if (sale?.price > 0) out.push(sale);
    }
    return out;
  }

  // { status: 'ok', sales } | { status: 'signin' } | { status: 'error', error }
  async function fetchSold(url) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (/signin\./i.test(res.url)) return { status: 'signin' };
      if (!res.ok) return { status: 'error', error: `eBay HTTP ${res.status}` };
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (doc.querySelector('form[name="signin-form"], #signin-form')) return { status: 'signin' };
      return { status: 'ok', sales: parse(doc) };
    } catch (err) {
      // A redirect to signin.ebay.com is cross-origin and surfaces as a network error.
      return { status: 'signin', error: String(err?.message ?? err) };
    }
  }

  globalThis.FairmarkSold = { fetch: fetchSold, parse, soldDate };
})();
