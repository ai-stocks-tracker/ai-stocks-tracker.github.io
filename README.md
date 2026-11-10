# US tech and AI market map

A market heatmap of about 65 US large caps by sector, plus a separate AI cluster of 33 companies in
six layers of the AI value chain. Tile size is market cap, colour is the return over the chosen
period (green up, red down). The page runs entirely in the browser; nothing needs a server.

## Use it

- **Look at the map:** double-click `site/index.html`. It reads the prices saved in `site/data.js`,
  works offline and makes no network requests.
- **Refresh the prices:** double-click `START.bat`. It runs `build.py`, which downloads the latest
  daily closes from Yahoo Finance and overwrites `site/data.js`, then opens the page.
  Between refreshes the page shows the last saved day.

First time only: `pip install -r requirements.txt`.

## Files

| File | What it does |
|---|---|
| `build.py` | What is tracked (`MARKET`, `AI`, `BENCH` at the top) and the price download |
| `serve.py` | Optional: serves `site/` at http://localhost:8767 (`python serve.py 8767 --open`) |
| `site/index.html` | The page |
| `site/app.js` | All calculations and charts (d3) |
| `site/data.js` | Saved prices, written by `build.py` |
| `site/kit.css`, `site/fonts/` | Personal Style Kit: colours, Manrope, Courier Prime |
| `site/page.css` | Page layout |
| `site/d3.min.js` | d3 7.9.0, saved locally so the page works offline |

To track other companies, edit the dictionaries at the top of `build.py` (Yahoo symbols, for
example `BRK-B`) and run it again.

## Data and limitations

- Prices come from Yahoo Finance through the unofficial `yfinance` library: free, no key, but it
  can break when Yahoo changes its site. Daily adjusted closes only, from 31 December 2024.
- Market cap is current shares outstanding times the close, so past market caps ignore buybacks
  and issuance. Fine for tile sizes and group totals, not a precise history.
- The basket is a buy-and-hold, cap-weighted portfolio of every company present at the start of
  the window.
- Educational project, not investment advice.

## Publish on GitHub Pages

1. Push this folder to the `main` branch of a GitHub repository.
2. In the repository settings, open **Pages** and set the source to **GitHub Actions**.
3. `.github/workflows/update.yml` then runs `build.py` and publishes `site/` on every push, every
   weekday at 22:30 UTC and on demand from the Actions tab. If Yahoo refuses the download, it
   publishes the prices already committed in `site/data.js`.

GitHub pauses scheduled workflows in a public repository after 60 days without commits; re-enable
it with one click in the Actions tab.

Day and night mode follow the device setting; the button in the header switches and remembers
the choice.
