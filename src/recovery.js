const config = require('./config');
const { sleep } = require('./timing');

async function isHighLoadPage(page) {
  try {
    const content = `${await page.url()} ${await page.evaluate(() => document.body?.innerText || '')}`;
    return /site is under high load|currently experiencing high demand|system is busy|please try again later|try again later/i.test(content);
  } catch (error) {
    console.log(`[HIGH_LOAD] không đọc được trang, tiếp tục retry: ${error.message}`);
    return true;
  }
}

async function recoverHighLoad(page, label) {
  let attempt = 0;
  const batchSize = Math.max(1, config.maxHighLoadRetries);
  while (true) {
    attempt += 1;
    if (!await isHighLoadPage(page)) return false;
    const batchAttempt = ((attempt - 1) % batchSize) + 1;
    const delay = config.highLoadBackoffMs;
    console.log(`[${label}] INZ quá tải (${batchAttempt}/${batchSize}), refresh sau ${delay}ms; không dừng`);
    await sleep(delay);
    const startedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: config.highLoadReloadTimeoutMs }).catch(() => {});
    console.log(`[${label}] HIGH_LOAD_REFRESH_DONE duration=${Date.now() - startedAt}ms`);
    if (batchAttempt === batchSize && await isHighLoadPage(page)) {
      console.log(`[${label}] HIGH_LOAD_BATCH_COOLDOWN ${config.highLoadCooldownMs}ms`);
      await sleep(config.highLoadCooldownMs);
    }
  }
}

module.exports = { isHighLoadPage, recoverHighLoad };