# Steal or Deal

A Chrome extension that shows the market price of trading cards and sealed product while you shop, tells you whether a listing is a steal or overpriced, and charts its recent price history.

- **eBay listings** (ebay.com): a price card appears under the listing price with the TCGplayer market price, a deal rating and a 90-day chart.
- **TCGplayer product pages**: a floating card shows the price history and lets you check any price.
- **Toolbar popup**: search any card or sealed product and type in a price you've been offered, at a card show or on Marketplace for example.

Covers Pokémon and Magic: The Gathering singles and sealed product. Graded cards show the ungraded price with a note.

## Deal ratings

| Rating | Asking price vs. market |
|---|---|
| Steal | 20% or more under |
| Good deal | 8–20% under |
| Fair price | within 8% |
| Pricey | 8–25% over |
| Overpaying | more than 25% over |

The bands live in `extension/src/price.js`.

## How it works

```
TCGCSV (daily TCGplayer prices) ──► GitHub Actions, daily ──► GitHub Pages (static JSON) ──► extension
```

- `.github/workflows/data.yml` runs every day at 21:30 UTC, after TCGCSV refreshes. `scripts/build-data.mjs` writes a search index per game and one price history file per set, carrying history forward from the previously published files.
- `scripts/backfill.mjs` rebuilds history from TCGCSV's daily archives. Run it once from the workflow's **Run workflow** button with `backfill_days` set (90 is a good start).
- The extension's service worker downloads the index once every few hours, caches it, and matches listing titles to products (`extension/src/match.js`): card number, name, set and sealed product type.

## Setup

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Actions → Price data → Run workflow**, enter `90` for `backfill_days` and run it. Later runs happen daily on their own.
3. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension` folder.

## Development

```
npm test                                   # unit tests
node scripts/build-data.mjs --out site     # build the data locally (needs network access to tcgcsv.com)
node scripts/smoke.mjs site/data           # check matching against the real catalog
```

To add a game, add its TCGplayer category to `data.config.json` and `extension/src/config.js` (for example One Piece or Yu-Gi-Oh!).

Prices come from TCGplayer via [TCGCSV](https://tcgcsv.com), with thanks. Steal or Deal is not affiliated with TCGplayer, eBay, The Pokémon Company or Wizards of the Coast.
