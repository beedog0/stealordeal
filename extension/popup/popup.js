// Popup: search any card or sealed product and check a price by hand.
const { h } = FairmarkCard;

const style = document.createElement('style');
style.textContent = FairmarkCard.CSS;
document.head.append(style);

const $ = (id) => document.getElementById(id);
const send = (msg) =>
  chrome.runtime.sendMessage(msg).then((res) => {
    if (!res?.ok) throw new Error(res?.error ?? 'No response');
    return res.data;
  });

let timer = null;
let seq = 0;

function showList() {
  $('detail').hidden = true;
  $('results').hidden = false;
  $('q').focus();
}

async function runSearch(query) {
  const mine = ++seq;
  if (query.trim().length < 3) {
    $('results').replaceChildren();
    $('hint').hidden = false;
    return;
  }
  $('hint').hidden = true;
  try {
    const items = await send({ type: 'search', query });
    if (mine !== seq) return;
    $('results').replaceChildren(
      ...(items.length
        ? items.map((it) => {
            const img = h('img', { src: it.image, alt: '', loading: 'lazy' });
            img.addEventListener('error', () => (img.style.visibility = 'hidden'));
            return h('li', {},
              h('button', { onclick: () => openItem(it) }, img,
                h('div', {},
                  h('div', { class: 'name' }, it.name),
                  h('div', { class: 'meta' }, [it.setName, it.name.includes(it.number) ? '' : it.number, it.sealed ? 'Sealed' : it.rarity].filter(Boolean).join(' · ')))));
          })
        : [h('li', { class: 'hint' }, 'No matches yet. Try the set name or card number.')]),
    );
  } catch (err) {
    if (mine === seq) $('results').replaceChildren(h('li', { class: 'hint' }, `Couldn't load prices: ${err.message}`));
  }
}

async function openItem(it) {
  $('results').hidden = true;
  $('detail').hidden = false;
  const root = $('card');
  const state = { status: 'loading', ask: null };
  const handlers = {
    ask: (price) => {
      state.ask = price;
      load(state.item.subtype);
    },
    subtype: (st) => load(st),
  };
  async function load(subtype) {
    try {
      state.item = await send({ type: 'details', catId: it.catId, productId: it.productId, subtype, price: state.ask });
      state.status = state.item ? 'ready' : 'empty';
    } catch (err) {
      Object.assign(state, { status: 'error', message: `Couldn't load prices: ${err.message}` });
    }
    FairmarkCard.render(root, state, handlers, { brand: false });
  }
  FairmarkCard.render(root, state, handlers, { brand: false });
  await load(null);
  root.querySelector('input')?.focus();
}

$('q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => runSearch(e.target.value), 180);
});
$('back').addEventListener('click', showList);

send({ type: 'meta' })
  .then((meta) => {
    $('updated').textContent = `Prices from ${new Date(`${meta.updated}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  })
  .catch(() => {});
