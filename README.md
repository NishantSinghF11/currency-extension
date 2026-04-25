# 💱 DollarFx — Browser Extension

Instantly convert USD prices on **any webpage** to your preferred currency using live exchange rates.

## Features
- 🔍 Auto-detects `$` amounts on any page (handles `$1,234.56`, `$10K`, `$2M`, etc.)
- 💹 Live exchange rates via [open.er-api.com](https://open.er-api.com) (free, no key needed)
- 15 currencies: INR, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SGD, MXN, BRL, KRW, AED, SAR, THB
- ⚡ One-click convert / revert
- 🌙 Dark themed popup UI

---

## Installation (Chrome / Edge / Brave)

1. Open your browser and go to: `chrome://extensions`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `currency-extension` folder
5. The extension icon appears in your toolbar — click it!

### Usage
1. Click the **CurrencyFx** icon in your browser toolbar
2. Choose your target currency from the dropdown
3. The live rate is fetched automatically
4. Click **"Convert This Page"** — all `$` prices on the current page are converted inline
5. Click **"Revert to Original"** to undo

---

## Files
```
currency-extension/
├── manifest.json      # Extension config (Manifest V3)
├── popup.html         # Popup UI
├── popup.js           # Popup logic + rate fetching
├── content.js         # Content script injected into pages
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## API Used
[open.er-api.com](https://open.er-api.com/v6/latest/USD) — Free, no API key required, updates daily.
