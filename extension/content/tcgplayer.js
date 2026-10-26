// TCGplayer product pages: the product id is in the URL, so no title matching is needed.
// The site is a single-page app, so watch for navigation between products.
(() => {
  let current = null;

  function check() {
    const m = location.pathname.match(/^\/product\/(\d+)/);
    const id = m ? Number(m[1]) : null;
    if (id === current) return;
    current = id;
    if (id) SODPanel.show({ productId: id }, { askLabel: 'Price to check' });
    else SODPanel.remove();
  }

  check();
  setInterval(check, 1000);
})();
