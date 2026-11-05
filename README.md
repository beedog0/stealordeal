# Fairmark

A Chrome extension that shows the market price of trading cards and sealed product while you shop, tells you whether a listing is a steal or overpriced, and charts its recent price history.

- **eBay listings** (ebay.com): a price card appears under the listing price with the TCGplayer market price, a deal rating and a 90-day chart.
- **TCGplayer product pages**: a floating card shows the price history and lets you check any price.
- **Toolbar popup**: search any card or sealed product and type in a price you've been offered, at a card show or on Marketplace for example.

Covers Pokémon and Magic: The Gathering singles and sealed product. Graded Pokémon cards (PSA, BGS, CGC and others) are compared with recent eBay sales of the same grade when a PokemonPriceTracker key is set.

## Deal ratings

Fairmark rates what you'd really pay: the price plus shipping plus sales tax (rate set in Settings, 8.25% by default), against the market price. Graded listings compare against recent eBay sales of the same grade.

| Rating | All-in cost vs. market |
|---|---|
| Strong buy | 20% or more under |
| Good buy | 8–20% under |
| Fair price | within 8% |
| Overpriced | more than 8% over |

Then it adjusts:

- **Falling market:** a Strong or Good buy drops one step when prices fell 15% or more in 30 days, or 25% or more in 90 days.
- **Confidence:** high, medium or low, from the number and age of graded sales and how sure the title match is. Fewer than 3 graded sales shows "Not enough data" instead of a rating.
- **Pay at most / Max bid:** `market × (1 − target discount) ÷ (1 + tax rate) − shipping`, the highest price that still leaves you the target discount (10% by default) after shipping and tax.
- **Auctions** are rated at the current bid and flagged, since bids usually rise before the end.

The formula lives in `assess()` in `extension/src/price.js`.

## How it works

```
TCGCSV (daily TCGplayer prices) ──► GitHub Actions, daily ──► GitHub Pages (static JSON) ──► extension
```

- `.github/workflows/data.yml` runs every day at 21:30 UTC, after TCGCSV refreshes. `scripts/build-data.mjs` writes a search index per game and one price history file per set, carrying history forward from the previously published files.
- `scripts/backfill.mjs` rebuilds history from TCGCSV's daily archives. As of October 2026 TCGCSV has taken the archives down ("temporarily removed due to rising server costs"), so history builds up one day per daily run instead. If the archives return, run the workflow with `backfill_days` set.
- The extension's service worker downloads the index once every few hours, caches it, and matches listing titles to products (`extension/src/match.js`): card number, name, set and sealed product type.

## Setup

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Actions → Price data**, click **Run workflow** once with the defaults. Later runs happen daily on their own.
3. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension` folder.
4. Optional, for 90 days of Pokémon history right away: right-click the Fairmark icon → **Options**, paste a [PokemonPriceTracker](https://www.pokemonpricetracker.com) API key, and click **Save**. The key stays in your browser. Each product you open costs about 2 credits, cached for 12 hours.

## Development

```
npm test                                   # unit tests
node scripts/build-data.mjs --out site     # build the data locally (needs network access to tcgcsv.com)
node scripts/smoke.mjs site/data           # check matching against the real catalog
```

To add a game, add its TCGplayer category to `data.config.json` and `extension/src/config.js` (for example One Piece or Yu-Gi-Oh!).

Prices come from TCGplayer via [TCGCSV](https://tcgcsv.com), with thanks. Fairmark is not affiliated with TCGplayer, eBay, The Pokémon Company or Wizards of the Coast.
