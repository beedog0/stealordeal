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

// Flipping settings for the Flip or hold view. Fees and undercut are per venue.
// Keep the defaults in sync with SELL_VENUES / FLIP_DEFAULTS in src/flip.js.
const VENUES = {
  groups: { feeRate: 3.49, undercut: 0 },
  ebay: { feeRate: 13.25, undercut: 5 },
  tcgplayer: { feeRate: 13.25, undercut: 5 },
  inperson: { feeRate: 0, undercut: 0 },
};
const FLIP = { venue: 'groups', venues: {}, targetPct: 80, minProfit: 5, shipLow: 1.25, shipHigh: 5.5 };
const FLIP_NUM = ['targetPct', 'minProfit', 'shipLow', 'shipHigh'];
let flipSettings = FLIP;
const venueValues = (v) => ({ ...VENUES[v], ...flipSettings.venues?.[v] });
const showVenue = () => {
  const v = venueValues($('venue').value);
  $('feeRate').value = v.feeRate;
  $('undercut').value = v.undercut;
};
chrome.storage.local.get('fmFlip').then(({ fmFlip }) => {
  flipSettings = { ...FLIP, ...fmFlip, venues: { ...fmFlip?.venues } };
  $('venue').value = VENUES[flipSettings.venue] ? flipSettings.venue : 'groups';
  for (const k of FLIP_NUM) $(k).value = flipSettings[k];
  showVenue();
});
// Switching venue keeps what was typed for the previous one until Save.
let shownVenue = null;
$('venue').addEventListener('focus', () => (shownVenue = $('venue').value));
$('venue').addEventListener('change', () => {
  if (shownVenue) flipSettings.venues[shownVenue] = { feeRate: Number($('feeRate').value), undercut: Number($('undercut').value) };
  shownVenue = $('venue').value;
  showVenue();
});
$('saveFlip').addEventListener('click', async () => {
  const fields = ['feeRate', 'undercut', ...FLIP_NUM];
  if (fields.some((k) => $(k).value === '' || !(Number($(k).value) >= 0))) {
    $('flipStatus').textContent = 'Every field needs a number, 0 or more.';
    return;
  }
  const venue = $('venue').value;
  const fmFlip = { ...flipSettings, venue, venues: { ...flipSettings.venues, [venue]: { feeRate: Number($('feeRate').value), undercut: Number($('undercut').value) } } };
  for (const k of FLIP_NUM) fmFlip[k] = Number($(k).value);
  flipSettings = fmFlip;
  await chrome.storage.local.set({ fmFlip });
  $('flipStatus').textContent = 'Saved. Refresh a listing to see the new numbers.';
});

$('copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('shape').value).then(() => status('Copied.'));
});
