// On-page panel: mounts the price card in a Shadow DOM (so site CSS can't touch it)
// and wires its controls to the service worker. Exposes globalThis.FairmarkPanel.
(() => {
  const send = (msg) =>
    chrome.runtime.sendMessage(msg).then((res) => {
      if (!res?.ok) throw new Error(res?.error ?? 'No response');
      return res.data;
    });

  let host = null;

  function mount(anchor) {
    host?.remove();
    host = document.createElement('div');
    host.id = 'fairmark-panel';
    const floating = !anchor;
    host.style.cssText = floating
      ? 'position:fixed;right:20px;bottom:20px;z-index:2147483646;'
      : 'display:block;margin:12px 0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = FairmarkCard.CSS;
    const root = document.createElement('div');
    shadow.append(style, root);
    if (anchor) anchor.after(host);
    else document.body.append(host);
    return { root, floating };
  }

  // source: { title } for a title lookup, or { productId } for a known product.
  async function show(source, { anchor = null, ask = null, askLabel } = {}) {
    const { root, floating } = mount(anchor);
    const state = { status: 'loading', ask };
    const opts = { floating, askLabel };
    const handlers = {
      close: () => host?.remove(),
      ask: (price) => {
        state.ask = price;
        refresh(state.item.productId, state.item.subtype);
      },
      pick: (alt) => {
        state.confidence = 'high';
        refresh(alt.productId, null, alt.catId);
      },
      subtype: (st) => refresh(state.item.productId, st),
    };
    const draw = () => FairmarkCard.render(root, state, handlers, opts);

    async function refresh(productId, subtype, catId) {
      try {
        const item = await send({ type: 'details', productId, subtype, price: state.ask, catId: catId ?? state.item?.catId, grade: state.parsed?.grade });
        Object.assign(state, { status: item ? 'ready' : 'empty', item });
      } catch (err) {
        Object.assign(state, { status: 'error', message: `Couldn't load prices: ${err.message}` });
      }
      draw();
    }

    draw();
    try {
      if (source.productId) {
        await refresh(source.productId, null);
        if (state.status === 'empty') host?.remove(); // A game we don't cover yet.
        return;
      }
      const res = await send({ type: 'lookup', title: source.title, price: ask });
      if (!res.item) {
        host?.remove(); // Not a card or sealed product we know: stay out of the way.
        return;
      }
      Object.assign(state, { status: 'ready', ...res });
    } catch (err) {
      Object.assign(state, { status: 'error', message: `Couldn't load prices: ${err.message}` });
    }
    draw();
  }

  globalThis.FairmarkPanel = { show, remove: () => host?.remove() };
})();
