const config = require('./config');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function resetPageScroll(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })).catch(() => {});
}

function watchActionProgress(page, previousUrl, previousMarker, label) {
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: config.navigationWaitTimeoutMs })
    .then(() => 'navigation').catch(() => 'navigation_timeout');
  const uiChange = page.evaluate(({ url, marker, timeout }) => new Promise(resolve => {
    const changed = () => location.href !== url || (document.body?.innerText || '').slice(0, 500) !== marker;
    if (changed()) return resolve('ui');
    const observer = new MutationObserver(() => {
      if (!changed()) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve('ui');
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve('ui_timeout');
    }, timeout);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  }), { url: previousUrl, marker: previousMarker, timeout: config.clickWaitTimeoutMs })
    .then(result => result).catch(() => 'ui_timeout');
  return Promise.race([navigation, uiChange]).then(async progress => {
    // DOM timeout có thể xảy ra ngay trước navigation; không đụng context cũ.
    if (progress === 'ui_timeout') progress = await navigation;
    if (progress === 'ui_timeout') console.log(`[${label}] ACTION_NO_VISIBLE_CHANGE`);
    else console.log(`[${label}] ACTION_PROGRESS ${progress}`);
    return progress;
  });
}

async function waitForActionProgress(page, previousUrl, previousMarker, label) {
  return watchActionProgress(page, previousUrl, previousMarker, label);
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

module.exports = { sleep, resetPageScroll, watchActionProgress, waitForActionProgress, formatDuration };