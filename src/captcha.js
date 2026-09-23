const config = require('./config');
const { sleep, formatDuration } = require('./timing');
const { firstExisting, firstVisible } = require('./dom');
const selectors = require('./selectors/actions');

const captchaStats = { count: 0, totalMs: 0 };

async function hasCaptcha(page) {
  return page.evaluate(() => Boolean(/\/rs-captcha|\/captcha/i.test(location.href) ||
    document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha') ||
    /captcha|i'm not a robot/i.test(document.body?.innerText || '')));
}

async function isDeclarationUi(page) {
  return Boolean(await firstVisible(page, selectors.submit) && await page.$('input[type="checkbox"], [role="checkbox"]'));
}

async function triggerCapSolver(page, label) {
  const button = await page.$('#capsolver-solver-tip-button');
  if (button) await page.evaluate(element => element.click(), button).catch(() => {});
  console.log(`[${label}] CAPTCHA_AUTO_MODE extension sẽ tự giải`);
}

async function isCaptchaSolved(page) {
  return page.evaluate(() => {
    const response = [...document.querySelectorAll('textarea[name="g-recaptcha-response"], textarea#g-recaptcha-response')]
      .some(element => element.value.trim().length > 0);
    const checked = Boolean(document.querySelector('.recaptcha-checkbox-checked, [aria-checked="true"]'));
    const captchaUrl = /\/rs-captcha|\/captcha/i.test(location.href);
    return response || checked || (!captchaUrl && !document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha'));
  });
}

async function pauseForCaptcha(page, label, stats = null) {
  if (!await hasCaptcha(page)) return;
  await triggerCapSolver(page, label);
  const startedAt = Date.now();
  captchaStats.count += 1;
  console.log(`[${label}] CAPTCHA detected, CapSolver đang tự xử lý`);
  const deadline = startedAt + config.captchaTimeoutMs;
  while (Date.now() < deadline) {
    if (await isCaptchaSolved(page)) {
      const duration = Date.now() - startedAt;
      captchaStats.totalMs += duration;
      if (stats) stats.captchaMs += duration;
      console.log(`[${label}] CAPTCHA solved duration=${formatDuration(duration)}`);
      const submit = await page.$('#ContentPlaceHolder1_submitImageButton');
      if (!submit) throw new Error('CAPTCHA đã giải nhưng không tìm thấy nút SUBMIT để tiếp tục');
      console.log(`[${label}] CAPTCHA solved, click SUBMIT để tiếp tục`);
      await submit.click();
      return;
    }
    await sleep(500);
  }
  const duration = Date.now() - startedAt;
  captchaStats.totalMs += duration;
  if (stats) stats.captchaMs += duration;
  throw new Error(`CAPTCHA chưa được giải sau ${config.captchaTimeoutMs}ms. Kiểm tra API key hoặc reload extension.`);
}

module.exports = { hasCaptcha, isDeclarationUi, pauseForCaptcha, captchaStats };