const { resetPageScroll, waitForActionProgress, sleep } = require('./timing');
const { isDeclarationUi, pauseForCaptcha } = require('./captcha');
const { recoverHighLoad } = require('./recovery');

async function clickByText(page, patterns) {
  return page.evaluate(patternsToUse => {
    const candidates = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')];
    const element = candidates.find(candidate => patternsToUse.some(pattern => new RegExp(pattern.source, pattern.flags).test((candidate.innerText || candidate.value || '').trim())));
    if (!element) return false;
    element.click(); return true;
  }, patterns.map(pattern => ({ source: pattern.source, flags: pattern.flags })));
}

async function clickFirstControl(page, selectors, label, stats) {
  for (const selector of selectors) {
    const control = await page.$(selector);
    if (!control) continue;
    const state = await control.evaluate(element => ({ visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length), disabled: element.disabled, value: element.value || element.textContent?.trim() || '', id: element.id || '' }));
    if (!state.visible || state.disabled) continue;
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    await page.evaluate(element => element.click(), control);
    console.log(`[${label}] CLICK ${selector} id=${state.id} value=${state.value}`);
    await waitForActionProgress(page, previousUrl, previousMarker, label);
    await recoverHighLoad(page, label);
    if (await isDeclarationUi(page)) console.log(`[${label}] CAPTCHA_DEFERRED_UNTIL_DECLARATION_TICK`);
    else await pauseForCaptcha(page, label, stats);
    await resetPageScroll(page);
    return true;
  }
  return false;
}

async function clickLabeled(page, labels, excludes, label, stats) {
  const previousUrl = await page.url();
  const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
  const clicked = await page.evaluate(({ wanted, excluded }) => {
    const nodes = [...document.querySelectorAll('input,button,a,span')];
    const normalize = value => (value || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const element = nodes.find(node => { const blob = normalize(`${node.value} ${node.textContent} ${node.id} ${node.title} ${node.alt}`); return wanted.some(text => blob === text || blob.includes(text)) && !excluded.some(text => blob.includes(text)) && node.getClientRects().length > 0 && !node.disabled; });
    if (!element) return false; element.click(); return true;
  }, { wanted: labels.map(item => item.toUpperCase()), excluded: excludes.map(item => item.toUpperCase()) });
  if (!clicked) return false;
  await waitForActionProgress(page, previousUrl, previousMarker, label);
  await recoverHighLoad(page, label);
  if (await isDeclarationUi(page)) console.log(`[${label}] CAPTCHA_DEFERRED_UNTIL_DECLARATION_TICK`);
  else await pauseForCaptcha(page, label, stats);
  await resetPageScroll(page);
  return true;
}

async function advance(page, label, stats, locators) {
  // Một số trang ASP.NET chỉ lộ nút Next sau khi SAVE hoàn tất.
  if (await clickFirstControl(page, locators.next, label, stats)) return true;
  console.log(`[${label}] NEXT_NOT_FOUND_TRY_SAVE`);
  if (!await clickFirstControl(page, locators.save, label, stats)) return clickFirstControl(page, locators.submit, label, stats);
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (await clickFirstControl(page, locators.next, label, stats) || await clickFirstControl(page, locators.submit, label, stats)) return true;
    await sleep(250);
  }
  return 'saved';
}

module.exports = { clickByText, clickFirstControl, clickLabeled, advance };