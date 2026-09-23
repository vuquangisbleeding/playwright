const config = require('./config');
const textSelectors = require('./selectors/text');
const { firstExisting, fillText } = require('./dom');
const { clickByText } = require('./actions');
const { recoverHighLoad } = require('./recovery');
const { pauseForCaptcha } = require('./captcha');

async function login(page, username, password, label, stats) {
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });
  console.log(`[${label}] trang login: ${await page.url()}`);
  await recoverHighLoad(page, label); await pauseForCaptcha(page, label, stats);
  await page.waitForFunction(() => Boolean(document.querySelector('input[name="username"], input[name="password"]') || document.querySelector('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id$="familyNameTextBox"]')), { timeout: 30000 }).catch(() => {});
  const usernameSelector = await firstExisting(page, textSelectors.username);
  const passwordSelector = await firstExisting(page, textSelectors.password);
  const authenticated = Boolean(await page.$('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]'));
  if (!usernameSelector && !passwordSelector && authenticated) return console.log(`[${label}] LOGIN_SKIP đã đăng nhập, UI hiện tại: ${await page.url()}`);
  if (!usernameSelector || !passwordSelector) throw new Error(`Không nhận diện được UI login/đã đăng nhập: ${await page.url()}`);
  await page.waitForSelector('input[name="username"]', { visible: true, timeout: 30000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 30000 });
  await fillText(page, textSelectors.username, username); await fillText(page, textSelectors.password, password);
  const beforeUrl = await page.url();
  const button = await page.$('input[type="submit"][value*="LOGIN" i]');
  if (button) await button.click(); else if (!await clickByText(page, [/^sign in$/i])) throw new Error('Không tìm thấy nút LOGIN trên trang đăng nhập');
  await page.waitForFunction(previousUrl => location.href !== previousUrl || !document.querySelector('[name="username"]'), { timeout: 30000 }, beforeUrl).catch(() => {});
  await recoverHighLoad(page, label); await pauseForCaptcha(page, label, stats);
  const currentUrl = await page.url();
  if (await firstExisting(page, textSelectors.username) && !/\/WorkingHoliday\//i.test(currentUrl)) throw new Error('Đăng nhập chưa thành công. Kiểm tra username/password hoặc CAPTCHA.');
  console.log(`[${label}] LOGIN_OK ${currentUrl}`);
}

module.exports = { login };