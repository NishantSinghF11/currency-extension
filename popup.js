const CURRENCIES = {
  USD: { symbol: '$',    name: 'US Dollar',        flag: '🇺🇸' },
  INR: { symbol: '₹',   name: 'Indian Rupee',      flag: '🇮🇳' },
  EUR: { symbol: '€',   name: 'Euro',              flag: '🇪🇺' },
  GBP: { symbol: '£',   name: 'British Pound',     flag: '🇬🇧' },
  JPY: { symbol: '¥',   name: 'Japanese Yen',      flag: '🇯🇵' },
  CAD: { symbol: 'C$',  name: 'Canadian Dollar',   flag: '🇨🇦' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar', flag: '🇦🇺' },
  CHF: { symbol: 'Fr',  name: 'Swiss Franc',       flag: '🇨🇭' },
  CNY: { symbol: '¥',   name: 'Chinese Yuan',      flag: '🇨🇳' },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar',  flag: '🇸🇬' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso',      flag: '🇲🇽' },
  BRL: { symbol: 'R$',  name: 'Brazilian Real',    flag: '🇧🇷' },
  KRW: { symbol: '₩',   name: 'South Korean Won',  flag: '🇰🇷' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham',        flag: '🇦🇪' },
  SAR: { symbol: '﷼',   name: 'Saudi Riyal',       flag: '🇸🇦' },
  THB: { symbol: '฿',   name: 'Thai Baht',         flag: '🇹🇭' },
};
const NO_DECIMAL = ['JPY', 'KRW'];

// Ordered by specificity — longer/more-unique symbols first to avoid false matches
// e.g. MX$ must be checked before $, C$ before $, S$ before $
const DETECTION_ORDER = [
  'MXN','CAD','AUD','SGD','BRL','INR','EUR','GBP','KRW','AED','SAR','THB','CHF','JPY','CNY','USD'
];

const fromSelect   = document.getElementById('fromSelect');
const toSelect     = document.getElementById('toSelect');
const convertBtn   = document.getElementById('convertBtn');
const revertBtn    = document.getElementById('revertBtn');
const statusEl     = document.getElementById('status');
const rateDisplay  = document.getElementById('rateDisplay');
const enableToggle = document.getElementById('enableToggle');
const detectBadge  = document.getElementById('detectBadge');
const detectBtn    = document.getElementById('detectBtn');

let currentRate      = null;
let currentFrom      = 'USD';
let currentTo        = 'INR';
let extensionEnabled = true;

// ── Populate selects ─────────────────────────────────────────────────────────
function populateSelects() {
  [fromSelect, toSelect].forEach(sel => {
    sel.innerHTML = '';
    Object.entries(CURRENCIES).forEach(([code, { name, flag }]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${flag} ${code} — ${name}`;
      sel.appendChild(opt);
    });
  });
}

function fmt(amount, currency) {
  if (amount == null) return '—';
  const sym = CURRENCIES[currency]?.symbol || currency + ' ';
  const decimals = NO_DECIMAL.includes(currency) ? 0 : 2;
  return sym + amount.toFixed(decimals);
}

function showRate(rate, from, to, timestamp) {
  rateDisplay.innerHTML = `
    <div class="rate-row">
      <span class="rate-label">1 ${from} =</span>
      <span class="rate-value">${fmt(rate, to)}</span>
    </div>
    <div class="rate-updated">Updated: ${timestamp}</div>
  `;
  document.getElementById('q1').textContent    = fmt(rate,       to);
  document.getElementById('q10').textContent   = fmt(rate * 10,  to);
  document.getElementById('q100').textContent  = fmt(rate * 100, to);
  document.getElementById('qLabel1').textContent   = `1 ${from}`;
  document.getElementById('qLabel10').textContent  = `10 ${from}`;
  document.getElementById('qLabel100').textContent = `100 ${from}`;
}

async function fetchRate(from, to) {
  rateDisplay.innerHTML = '<div class="rate-loading">Fetching live rate…</div>';
  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const data = await resp.json();
    if (data.result !== 'success') throw new Error('API error');
    const rate = data.rates[to];
    if (!rate) throw new Error('Currency not found');
    currentRate = rate;
    const ts = new Date(data.time_last_update_utc).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    showRate(rate, from, to, ts);
    chrome.storage.local.set({ rate, from, to, timestamp: ts });
  } catch (e) {
    rateDisplay.innerHTML = `<div class="rate-loading" style="color:#ff5f5f">Failed to fetch rate</div>`;
    currentRate = null;
  }
}

// ── Auto-detect currency from the active tab ─────────────────────────────────
// This function runs INSIDE the page via scripting.executeScript
function detectCurrencyOnPage(detectionOrder, currencies) {
  const text = document.body?.innerText || '';
  const counts = {};

  // Build patterns in specificity order
  for (const code of detectionOrder) {
    const sym = currencies[code].symbol;
    const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Must be followed by a digit (or space then digit)
    const regex = new RegExp(`${escaped}\\s?\\d`, 'g');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      counts[code] = matches.length;
    }
  }

  // Return sorted list: [ [code, count], ... ] most frequent first
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted; // e.g. [['USD', 42], ['EUR', 3]]
}

async function runAutoDetect(silent = false) {
  detectBadge.textContent = '🔍 Scanning…';
  detectBadge.className = 'detect-badge scanning';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectCurrencyOnPage,
      args: [DETECTION_ORDER, CURRENCIES]
    });

    const found = results?.[0]?.result; // [ [code, count], ... ]

    if (!found || found.length === 0) {
      detectBadge.textContent = '⚠ No currency found';
      detectBadge.className = 'detect-badge none';
      if (!silent) setStatus('No currency symbols detected on this page', 'err');
      return;
    }

    const [[topCode, topCount]] = found;

    // Only auto-set if it's different from current, or forced
    if (topCode !== currentFrom || !silent) {
      currentFrom = topCode;
      fromSelect.value = currentFrom;

      // Avoid from === to collision
      if (currentFrom === currentTo) {
        currentTo = Object.keys(CURRENCIES).find(c => c !== currentFrom);
        toSelect.value = currentTo;
      }

      fetchRate(currentFrom, currentTo);
    }

    // Show badge: top detected + others if any
    const others = found.slice(1).map(([c]) => c).join(', ');
    const info = `${CURRENCIES[topCode].flag} ${topCode} (${topCount} found)` + (others ? ` · also: ${others}` : '');
    detectBadge.textContent = `✓ ${info}`;
    detectBadge.className = 'detect-badge found';

    if (!silent) setStatus(`Auto-detected ${topCode} on this page`, 'ok');

  } catch (e) {
    detectBadge.textContent = '⚠ Cannot scan this page';
    detectBadge.className = 'detect-badge none';
  }
}

// ── Enable/disable UI ────────────────────────────────────────────────────────
function applyEnabledState(enabled) {
  extensionEnabled = enabled;
  convertBtn.disabled = !enabled;
  const body = document.querySelector('.body');
  body.style.opacity = enabled ? '1' : '0.45';
  body.style.pointerEvents = enabled ? '' : 'none';
  enableToggle.closest('.toggle-wrap').style.pointerEvents = '';
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  populateSelects();
  const saved = await chrome.storage.local.get(['from', 'to', 'rate', 'timestamp', 'enabled']);

  currentFrom = saved.from || 'USD';
  currentTo   = saved.to   || 'INR';
  fromSelect.value = currentFrom;
  toSelect.value   = currentTo;

  const enabled = saved.enabled !== false;
  enableToggle.checked = enabled;
  applyEnabledState(enabled);

  if (saved.rate && saved.timestamp) {
    currentRate = saved.rate;
    showRate(saved.rate, currentFrom, currentTo, saved.timestamp);
  }

  // Always fetch fresh rate
  fetchRate(currentFrom, currentTo);

  // Auto-detect silently on open (won't override if user manually changed)
  runAutoDetect(true);
}

// ── Events ───────────────────────────────────────────────────────────────────
detectBtn.addEventListener('click', () => runAutoDetect(false));

fromSelect.addEventListener('change', () => {
  currentFrom = fromSelect.value;
  // User manually changed — clear auto badge
  detectBadge.textContent = '(manual)';
  detectBadge.className = 'detect-badge manual';
  if (currentFrom === currentTo) {
    currentTo = Object.keys(CURRENCIES).find(c => c !== currentFrom);
    toSelect.value = currentTo;
  }
  fetchRate(currentFrom, currentTo);
});

toSelect.addEventListener('change', () => {
  currentTo = toSelect.value;
  if (currentFrom === currentTo) {
    currentFrom = Object.keys(CURRENCIES).find(c => c !== currentTo);
    fromSelect.value = currentFrom;
  }
  fetchRate(currentFrom, currentTo);
});

enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;
  applyEnabledState(enabled);
  chrome.storage.local.set({ enabled });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!enabled) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: revertPage });
      setStatus('Extension off — page restored', '');
    } catch (_) {}
  } else {
    setStatus('Extension enabled', 'ok');
    runAutoDetect(true);
  }
});

convertBtn.addEventListener('click', async () => {
  if (!extensionEnabled) { setStatus('Extension is disabled', 'err'); return; }
  if (!currentRate)       { setStatus('Rate not loaded yet', 'err');   return; }

  convertBtn.disabled = true;
  setStatus('Converting…', '');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const fromSym = CURRENCIES[currentFrom]?.symbol || currentFrom;
  const toSym   = CURRENCIES[currentTo]?.symbol   || currentTo + ' ';

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: convertPage,
      args: [currentRate, currentFrom, currentTo, toSym, fromSym]
    });
    setStatus('✓ Page converted!', 'ok');
  } catch (e) {
    setStatus('Cannot access this page', 'err');
  }
  convertBtn.disabled = !extensionEnabled;
});

revertBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: revertPage });
    setStatus('Reverted to original', '');
  } catch (e) {
    setStatus('Cannot access this page', 'err');
  }
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
  if (type === 'ok') setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// Injected into the active tab
// ══════════════════════════════════════════════════════════════════════════════

function convertPage(rate, fromCurrency, toCurrency, toSymbol, fromSymbol) {
  document.querySelectorAll('[data-dollar-fx-wrapper]').forEach(el => {
    el.parentNode.replaceChild(document.createTextNode(el.dataset.originalText), el);
  });

  const DECIMALS = ['JPY', 'KRW'].includes(toCurrency) ? 0 : 2;
  const escapedSym = fromSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numPattern = `(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)([KkMmBb]?)`;
  const currencyRegex = new RegExp(`${escapedSym}\\s?${numPattern}`, 'g');

  function processTextNode(node) {
    const original = node.textContent;
    currencyRegex.lastIndex = 0;
    if (!currencyRegex.test(original)) return;
    currencyRegex.lastIndex = 0;

    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-dollar-fx-wrapper', '1');
    wrapper.dataset.originalText = original;

    wrapper.innerHTML = original.replace(currencyRegex, (match, num, suffix) => {
      let amount = parseFloat(num.replace(/,/g, ''));
      if (suffix.toUpperCase() === 'K') amount *= 1_000;
      if (suffix.toUpperCase() === 'M') amount *= 1_000_000;
      if (suffix.toUpperCase() === 'B') amount *= 1_000_000_000;
      const converted = (amount * rate).toFixed(DECIMALS);
      const formatted = parseFloat(converted).toLocaleString(undefined, {
        minimumFractionDigits: DECIMALS, maximumFractionDigits: DECIMALS
      });
      return `<span data-dollar-fx-value="1" style="background:rgba(200,245,66,0.15);border-radius:3px;padding:0 2px;color:inherit;" title="Original: ${match}">${toSymbol}${formatted} <sup style="font-size:0.65em;opacity:0.6">${toCurrency}</sup></span>`;
    });

    node.parentNode.replaceChild(wrapper, node);
  }

  function isInsideConverted(node) {
    let el = node.parentElement;
    while (el) { if (el.hasAttribute('data-dollar-fx-wrapper')) return true; el = el.parentElement; }
    return false;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName?.toUpperCase();
      if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (isInsideConverted(node)) return NodeFilter.FILTER_REJECT;
      currencyRegex.lastIndex = 0;
      return currencyRegex.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(processTextNode);
  document.body.dataset.dollarFxActive = '1';
}

function revertPage() {
  document.querySelectorAll('[data-dollar-fx-wrapper]').forEach(el => {
    el.parentNode.replaceChild(document.createTextNode(el.dataset.originalText), el);
  });
  delete document.body.dataset.dollarFxActive;
}

init();
