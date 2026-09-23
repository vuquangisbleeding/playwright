const textSelectors = require('./selectors/text');
const selectSelectors = require('./selectors/select');
const actions = require('./selectors/actions');
const { firstExisting, firstVisible } = require('./dom');
const { hasCaptcha } = require('./captcha');
const { isHighLoadPage } = require('./recovery');

async function detectPage(page) {
  // Thứ tự kiểm tra quan trọng: trạng thái đặc biệt phải được bắt trước form.
  const url = await page.url();
  const body = await page.evaluate(() => document.body?.innerText || '');
  if (/\/rs-captcha|\/captcha/i.test(url)) return 'captcha';
  if (await isHighLoadPage(page)) return 'highload';
  if (await firstExisting(page, textSelectors.username)) return 'login';
  if (/paystation|paymark|paymentexpress|pxpay|cardnumber/i.test(url) || await page.$('input[autocomplete="cc-number"], iframe[src*="payment"]')) return 'payment';
  if (/submitreceived|onlinesubmit/i.test(url) || /SUBMIT RECEIVED[\s\S]*PAY LATER/i.test(body)) return 'pay_now';
  if (await page.$('#ContentPlaceHolder1_onlinePaymentAnchor2, a[id$="onlinePaymentAnchor2"], a[href*="PaymentGateway/OnLinePayment"], a[href*="OnLinePayment.aspx"]') || /NEXT STEP[\s\S]*(SECURE PAYMENT|TOTAL CHARGE)/i.test(body)) return 'pay_next';
  if (await firstExisting(page, textSelectors.payerName)) return 'payer';
  const submit = await firstVisible(page, actions.submit);
  if (submit && (/submit\.aspx/i.test(url) || await page.$('input[type="checkbox"], [role="checkbox"]'))) return 'submit';
  if (/submit\.aspx/i.test(url) || await page.$('input[type="checkbox"]') && /declaration|submit/i.test(url + body)) return 'declaration';
  if (await hasCaptcha(page)) return 'captcha';
  if (/personal1/i.test(url) || await firstExisting(page, textSelectors.familyName)) return 'personal1';
  if (/personal2/i.test(url) || await firstExisting(page, textSelectors.passportNumber)) return 'personal2';
  if (/personal3/i.test(url)) return 'personal3';
  if (/medical|health/i.test(url) || await firstExisting(page, selectSelectors.renalDialysis)) return 'health';
  if (/character/i.test(url) || await firstExisting(page, selectSelectors.imprisonment5Years)) return 'character';
  if (/workingholidayspecific|whs/i.test(url) || await firstExisting(page, selectSelectors.previousWhsVisa)) return 'whs';
  return 'unknown';
}

module.exports = { detectPage };