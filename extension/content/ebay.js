// eBay listing pages: read the title and price, then show the price card under the price.
(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';

  function readJsonLd() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = [JSON.parse(s.textContent)].flat();
        const product = data.find((d) => d['@type'] === 'Product');
        const offer = [product?.offers].flat()[0];
        if (product) return { title: product.name, price: Number(offer?.price), currency: offer?.priceCurrency };
      } catch {
        // Ignore malformed blocks.
      }
    }
    return {};
  }

  function readListing() {
    const ld = readJsonLd();
    const title =
      text('h1.x-item-title__mainTitle') || ld.title || document.querySelector('meta[property="og:title"]')?.content || '';
    const priceText = text('.x-price-primary') || text('[itemprop="price"]');
    const currency = ld.currency || (/US\s*\$|^\$/.test(priceText) ? 'USD' : '');
    const price = ld.price || Number(priceText.replace(/[^0-9.]/g, '')) || null;
    return { title, price, currency };
  }

  // Only card listings: eBay puts these under "Collectible Card Games" in the breadcrumbs.
  function isCardListing(title) {
    const crumbs = text('nav.breadcrumbs, .seo-breadcrumbs-container, [data-testid="x-breadcrumb"]').toLowerCase();
    if (crumbs) return /card game|ccg|tcg|pok[eé]mon|magic/.test(crumbs);
    return /pok[eé]mon|mtg|magic the gathering|\d+\/\d+|booster|elite trainer/i.test(title);
  }

  // Label/value rows: item specifics ("Game", "Language") and shipping ("Shipping: US $5.25").
  function readRows() {
    const rows = {};
    for (const row of document.querySelectorAll('.ux-labels-values, [data-testid="ux-labels-values"]')) {
      const label = row.querySelector('.ux-labels-values__labels')?.textContent.trim().toLowerCase().replace(/:$/, '');
      const value = row.querySelector('.ux-labels-values__values')?.textContent.trim().toLowerCase();
      if (label && value && !(label in rows)) rows[label] = value;
    }
    return rows;
  }

  // Shipping to the buyer, in USD: 0 for free, null when the page doesn't say (or not in USD).
  function readShipping(rows) {
    const value = rows.shipping ?? rows.delivery ?? '';
    if (/\bfree\b/.test(value)) return 0;
    const m = value.replace(/,/g, '').match(/(?:us\s*)?\$\s*(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  }

  // Auctions show a bid count next to the price; the shown price is the current bid.
  function isAuction() {
    if (document.querySelector('.x-bid-count, [data-testid="x-bid-count"], .x-bid-action, [data-testid="x-bid-action"]')) return true;
    return /\b\d+\s+bids?\b|current bid|starting bid|place bid/i.test(text('.x-price-section, [data-testid="x-price-section"]'));
  }

  // Game and language from eBay's category and item specifics, which sellers fill
  // in more reliably than titles ("Game: Pokémon TCG", "Language: Japanese").
  function readHints(specifics) {
    const crumbs = text('nav.breadcrumbs, .seo-breadcrumbs-container, [data-testid="x-breadcrumb"]').toLowerCase();
    const gameText = `${specifics.game ?? ''} ${specifics.franchise ?? ''} ${crumbs}`;
    const game = /pok[eé]mon/.test(gameText) ? 'pokemon' : /magic/.test(gameText) ? 'magic' : null;
    const lang = specifics.language ?? '';
    const language = /japan/.test(lang) ? 'japanese' : /english/.test(lang) ? 'english' : null;
    return { game, language };
  }

  const { title, price, currency } = readListing();
  if (!title || !isCardListing(title)) return;
  const isUsd = !currency || currency === 'USD';
  const rows = readRows();
  const auction = isAuction();
  const listing = { shipping: isUsd ? readShipping(rows) : null, auction };
  const anchor = document.querySelector('.x-price-section, .x-bin-price, [data-testid="x-price-section"]');
  FairmarkPanel.show(
    { title, hints: readHints(rows), listing },
    { anchor, ask: isUsd ? price : null, askLabel: !isUsd ? 'Your price (USD)' : auction ? 'Current bid' : 'Listing price' },
  );
})();
