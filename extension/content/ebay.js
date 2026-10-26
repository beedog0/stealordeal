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

  const { title, price, currency } = readListing();
  if (!title || !isCardListing(title)) return;
  const isUsd = !currency || currency === 'USD';
  const anchor = document.querySelector('.x-price-section, .x-bin-price, [data-testid="x-price-section"]');
  FairmarkPanel.show({ title }, { anchor, ask: isUsd ? price : null, askLabel: isUsd ? 'Listing price' : 'Your price (USD)' });
})();
