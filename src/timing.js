const config = require('./config');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function resetPageScroll(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })).catch(() => {});
}

async function waitForActionProgress(page, previousUrl, previousMarker, label) {
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: config.navigationWaitTimeoutMs })
    .then(() => 'navigation').catch(() => 'navigation_timeout');
  const domChange = page.waitForFunction(({ url, marker }) => location.href !== url ||
    (document.body?.innerText || '').slice(0, 500) !== marker,
  { timeout: config.clickWaitTimeoutMs }, { url: previousUrl, marker: previousMarker })
    .then(() => 'dom').catch(() => 'dom_timeout');
  let progress = await Promise.race([navigation, domChange]);
  if (progress === 'dom_timeout') progress = await navigation;
  if (progress === 'navigation_timeout') console.log(`[${label}] ACTION_NO_VISIBLE_CHANGE`);
  else console.log(`[${label}] ACTION_PROGRESS ${progress}`);
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

module.exports = { sleep, resetPageScroll, waitForActionProgress, formatDuration };