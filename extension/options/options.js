// Options: the user's own PokemonPriceTracker API key, kept in chrome.storage.local.
const style = document.createElement('style');
style.textContent = FairmarkCard.CSS;
document.head.append(style);

const $ = (id) => document.getElementById(id);
const status = (text) => ($('status').textContent = text);

chrome.storage.local.get('pptKey').then(({ pptKey }) => {
  if (pptKey) {
    $('key').value = pptKey;
    status('A key is saved.');
  }
});

$('save').addEventListener('click', async () => {
  const pptKey = $('key').value.trim();
  if (!pptKey) return status('Paste a key first.');
  await chrome.storage.local.set({ pptKey });
  status('Saved. Pokémon price history will now come from PokemonPriceTracker.');
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('pptKey');
  $('key').value = '';
  status('Key removed.');
});

$('test').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) return status('Paste a key first.');
  status('Checking…');
  const res = await chrome.runtime.sendMessage({ type: 'testPptKey', key });
  if (!res?.ok) return status(res?.error ?? 'Could not reach PokemonPriceTracker.');
  const { remaining, historyDays, psa10, shape } = res.data;
  status(
    [
      'The key works.',
      historyDays ? `Sample card: ${historyDays} days of history.` : 'Sample card: no history found in the response.',
      psa10 ? `PSA 10 price: $${psa10.toFixed(2)}.` : 'No PSA 10 price found in the response.',
      remaining ? `${remaining} credits left today.` : '',
    ].filter(Boolean).join(' '),
  );
  $('shape').value = shape;
  $('debug').hidden = false;
  $('debug').open = !historyDays || !psa10;
});

// Buying settings: sales tax and target discount, used for all-in cost and the max price.
const DEFAULTS = { taxRate: 8.25, discount: 10 };
chrome.storage.local.get('fmSettings').then(({ fmSettings }) => {
  const s = { ...DEFAULTS, ...fmSettings };
  $('tax').value = s.taxRate;
  $('discount').value = s.discount;
});
$('saveBuying').addEventListener('click', async () => {
  const taxRate = Number($('tax').value);
  const discount = Number($('discount').value);
  if (!(taxRate >= 0 && taxRate <= 20) || !(discount >= 0 && discount <= 80)) {
    $('buyingStatus').textContent = 'Tax must be 0–20% and discount 0–80%.';
    return;
  }
  await chrome.storage.local.set({ fmSettings: { taxRate, discount } });
  $('buyingStatus').textContent = 'Saved. Refresh a listing to see the new numbers.';
});

$('copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('shape').value).then(() => status('Copied.'));
});
