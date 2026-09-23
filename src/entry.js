const config = require('./config');
const textSelectors = require('./selectors/text');
const { firstExisting } = require('./dom');
const { clickFirstControl, clickLabeled } = require('./actions');
const { recoverHighLoad } = require('./recovery');
const { pauseForCaptcha } = require('./captcha');
const { waitForActionProgress } = require('./timing');

async function selectSchemeCountry(page, country, label, stats) {
  let attempt = 0;
  while (true) {
    attempt += 1; const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    const result = await page.evaluate(wanted => {
      const normalized = wanted.trim().toLowerCase();
      const name = [...document.querySelectorAll("[id^='ContentPlaceHolder1_countryRepeater_countryName_']")].find(element => element.textContent.trim().toLowerCase() === normalized);
      if (!name) return { found: false, open: false, cardText: '' };
      const suffix = name.id.split('_').pop(); const status = document.getElementById(`ContentPlaceHolder1_countryRepeater_countryStatus_${suffix}`);
      const link = document.getElementById(`ContentPlaceHolder1_countryRepeater_createLink_${suffix}`); const card = link?.closest('.category-item') || name.parentElement;
      const cardText = (card?.innerText || '').replace(/\s+/g, ' ').trim();
      if (!link || !/\bopen\b/i.test(status?.textContent || '') || /\bclosed\b/i.test(status?.textContent || '')) return { found: true, open: false, cardText };
      link.click(); return { found: true, open: true, cardText };
    }, country);
    if (result.open) { console.log(`[${label}] SELECT_COUNTRY ${country} (${result.cardText})`); await waitForActionProgress(page, previousUrl, previousMarker, label); await recoverHighLoad(page, label); await pauseForCaptcha(page, label, stats); return true; }
    console.log(`[${label}] ${country} chưa OPEN (lần ${attempt}: ${result.cardText || 'chưa xuất hiện'}), refresh sau ${config.countryPollMs}ms`);
    await new Promise(resolve => setTimeout(resolve, config.countryPollMs)); await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await recoverHighLoad(page, label);
    await pauseForCaptcha(page, label, stats);
  }
}

async function continueToApplication(page, applicant, label, stats) {
  await page.waitForFunction(() => Boolean(document.querySelector('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]')), { timeout: 30000 }).catch(() => {});
  if (/wizard/i.test(await page.url()) || await firstExisting(page, textSelectors.familyName)) return;
  const existing = await page.$("a[id^='ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_']");
  if (existing) { console.log(`[${label}] OPEN_EXISTING`); const oldUrl = await page.url(); const oldMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500)); await page.evaluate(element => element.click(), existing); await waitForActionProgress(page, oldUrl, oldMarker, label); return; }
  const country = config.schemeCountry || applicant.scheme_country;
  if (await page.$("[id^='ContentPlaceHolder1_countryRepeater_countryName_']")) {
    if (!country) throw new Error('Chưa cấu hình scheme country');
    await selectSchemeCountry(page, country, label, stats);
    if (await clickFirstControl(page, ['#ContentPlaceHolder1_applyNowButton'], label, stats) || await clickLabeled(page, ['APPLY NOW'], [], label, stats)) return;
  }
  const apply = await page.$('#ContentPlaceHolder1_applyNowButton');
  if (apply) {
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    await page.evaluate(element => element.click(), apply);
    await waitForActionProgress(page, previousUrl, previousMarker, label);
    await recoverHighLoad(page, label);
    return;
  }
  throw new Error(`Không tìm thấy entry hồ sơ sau login. ${(await page.evaluate(() => document.body?.innerText || '')).slice(0, 250)}`);
}

module.exports = { continueToApplication };