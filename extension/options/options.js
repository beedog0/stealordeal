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
  status(res.data.remaining ? `The key works. ${res.data.remaining} credits left today.` : 'The key works.');
});
