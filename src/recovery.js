const config = require('./config');
const { sleep } = require('./timing');

async function isHighLoadPage(page) {
  const content = `${await page.url()} ${await page.evaluate(() => document.body?.innerText || '')}`;
  return /site is under high load|currently experiencing high demand|system is busy|please try again later|try again later/i.test(content);
}

async function recoverHighLoad(page, label) {
  for (let attempt = 1; attempt <= config.maxHighLoadRetries; attempt += 1) {
    if (!await isHighLoadPage(page)) return false;
    // Delay cố định để tránh vừa spam server vừa chờ tăng theo cấp số nhân.
    const delay = config.highLoadBackoffMs;
    console.log(`[${label}] INZ đang quá tải (${attempt}/${config.maxHighLoadRetries}), thử lại sau ${delay}ms`);
    await sleep(delay);
    const startedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: config.highLoadReloadTimeoutMs }).catch(() => {});
    console.log(`[${label}] HIGH_LOAD_REFRESH_DONE duration=${Date.now() - startedAt}ms`);
  }
  if (await isHighLoadPage(page)) throw new Error(`INZ vẫn đang quá tải sau ${config.maxHighLoadRetries} lần thử`);
  return true;
}

module.exports = { isHighLoadPage, recoverHighLoad };