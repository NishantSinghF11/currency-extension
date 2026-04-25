// Content script: auto-converts page if user has auto-convert enabled
// Also listens for messages from popup

const SYMBOLS = {
  INR:'₹', EUR:'€', GBP:'£', JPY:'¥', CAD:'C$', AUD:'A$',
  CHF:'Fr', CNY:'¥', SGD:'S$', MXN:'$', BRL:'R$', KRW:'₩',
  AED:'د.إ', SAR:'﷼', THB:'฿'
};

chrome.storage.local.get(['enabled', 'rate', 'from', 'to', 'autoConvert'], (data) => {
  if (data.enabled !== false && data.autoConvert && data.rate && data.from && data.to) {
    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => doConvert(data.rate, data.from, data.to));
    } else {
      doConvert(data.rate, data.from, data.to);
    }
  }
});

function doConvert(rate, currency) {
  const symbol = SYMBOLS[currency] || currency + ' ';
  const DECIMALS = ['JPY', 'KRW'].includes(currency) ? 0 : 2;
  const dollarRegex = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)([KkMmBb]?)/g;

  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement?.tagName?.toUpperCase();
        if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(tag)) return NodeFilter.FILTER_REJECT;
        // Skip nodes inside already-converted wrappers
        let el = node.parentElement;
        while (el) {
          if (el.hasAttribute('data-dollar-fx-wrapper')) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return /\$\s?\d/.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      dollarRegex.lastIndex = 0;
      const original = node.textContent;
      if (!dollarRegex.test(original)) return;
      dollarRegex.lastIndex = 0;

      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-dollar-fx-wrapper', '1');
      wrapper.dataset.originalText = original;

      wrapper.innerHTML = original.replace(dollarRegex, (match, num, suffix) => {
        let amount = parseFloat(num.replace(/,/g, ''));
        if (suffix.toUpperCase() === 'K') amount *= 1000;
        if (suffix.toUpperCase() === 'M') amount *= 1_000_000;
        if (suffix.toUpperCase() === 'B') amount *= 1_000_000_000;

        const converted = (amount * rate).toFixed(DECIMALS);
        const formatted = parseFloat(converted).toLocaleString(undefined, {
          minimumFractionDigits: DECIMALS,
          maximumFractionDigits: DECIMALS
        });

        return `<span data-dollar-fx-value="1" style="background:rgba(200,245,66,0.12);border-radius:3px;padding:0 2px;" title="Original: ${match}">${symbol}${formatted} <sup style="font-size:0.65em;opacity:0.6">${currency}</sup></span>`;
      });

      node.parentNode.replaceChild(wrapper, node);
    });
  }

  walk(document.body);
}
