const config = require('./config');
const textSelectors = require('./selectors/text');
const actions = require('./selectors/actions');
const { initializeAccountLogger, accountLogFile } = require('./logger');
const { getSinglePage } = require('./browser');
const { login } = require('./auth');
const { continueToApplication } = require('./entry');
const { detectPage } = require('./detect');
const { pauseForCaptcha } = require('./captcha');
const { recoverHighLoad } = require('./recovery');
const { clickFirstControl, clickLabeled, advance } = require('./actions');
const { fillDeclaration } = require('./declaration');
const { fillPersonal1, fillIdentification } = require('./forms/personal');
const { fillHealth, fillCharacter } = require('./forms/health');
const { fillWhs } = require('./forms/whs');
const { fillText, dumpUnknown } = require('./dom');
const { resetPageScroll } = require('./timing');

async function runApplicant(browser, baseApplicant, account, index) {
  const label = `account ${index + 1}: ${account.username}`;
  await initializeAccountLogger(index, account.username);
  console.log(`[${label}] ACCOUNT_LOG_FILE ${accountLogFile(index)}`);
  const startedAt = Date.now(); const stats = { captchaMs: 0 };
  const result = { label, status: 'ERROR', runtimeMs: 0, captchaMs: 0, applicantInfo: '' };
  const finish = status => Object.assign(result, { status, runtimeMs: Date.now() - startedAt, captchaMs: stats.captchaMs });
  const page = await getSinglePage(browser);
  const applicant = structuredClone(baseApplicant);
  applicant.contact = { ...(applicant.contact || {}), email: account.email };
  result.applicantInfo = `Tên: ${[applicant.personal?.given_name_1, applicant.personal?.family_name].filter(Boolean).join(' ') || '(chưa có tên)'}\nEmail hồ sơ: ${account.email}`;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log(`[${label}] NAVIGATE ${frame.url()}`); });
  page.on('requestfailed', request => { if (!request.url().startsWith('chrome-extension://') && !request.url().startsWith('chrome://')) console.log(`[${label}] REQUEST_FAILED ${request.url()} ${request.failure()?.errorText || ''}`); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  try {
    await login(page, account.username, account.password, label, stats);
    await continueToApplication(page, applicant, label, stats);
    return await walkWizard(page, applicant, account, label, stats, result, finish);
  } catch (error) { console.error(`[${label}] lỗi: ${error.message}`); return finish(`ERROR: ${error.message}`); }
}

async function walkWizard(page, applicant, account, label, stats, result, finish) {
  // Mỗi vòng lặp xử lý đúng một trạng thái trang rồi mới chuyển bước.
  for (let pageNumber = 1; pageNumber <= config.maxWizardPages; pageNumber += 1) {
    await recoverHighLoad(page, label); await resetPageScroll(page);
    const currentPage = await detectPage(page); const pageLabel = `${label} PAGE ${pageNumber} ${currentPage}`;
    console.log(`[${pageLabel}] URL=${await page.url()}`);
    if (currentPage === 'highload') { await recoverHighLoad(page, label); continue; }
    if (currentPage === 'captcha') { await pauseForCaptcha(page, pageLabel, stats); continue; }
    if (currentPage === 'login') { await login(page, account.username, account.password, label, stats); await continueToApplication(page, applicant, label, stats); continue; }
    if (currentPage === 'payment') { console.log(`[${label}] dừng trước trang thanh toán để không nhập thông tin thẻ.`); return finish('STOP_PAYMENT'); }
    if (currentPage === 'payer') { await fillText(page, textSelectors.payerName, applicant.payment?.payer_name || applicant.payer_name || 'Vu Quang Nguyen'); await clickLabeled(page, ['OK'], ['PAY NOW', 'PAY LATER', 'NEXT STEP'], pageLabel, stats); continue; }
    if (currentPage === 'pay_next') { await clickFirstControl(page, ['#ContentPlaceHolder1_onlinePaymentAnchor2', 'a[id$="onlinePaymentAnchor2"]', 'a[href*="PaymentGateway/OnLinePayment"]', 'a[href*="OnLinePayment.aspx"]'], pageLabel, stats); continue; }
    if (currentPage === 'pay_now') { await clickLabeled(page, ['PAY NOW'], ['PAY LATER'], pageLabel, stats); continue; }
    if (currentPage === 'unknown') { await dumpUnknown(page, label); return finish('STOP_UNKNOWN'); }
    if (currentPage === 'declaration' || currentPage === 'submit') { await fillDeclaration(page, applicant, pageLabel); await pauseForCaptcha(page, pageLabel, stats); await clickFirstControl(page, actions.submit, pageLabel, stats) || await clickLabeled(page, ['SUBMIT'], ['CANCEL', 'PAY NOW', 'PAY LATER'], pageLabel, stats); continue; }
    if (currentPage === 'personal1') await fillPersonal1(page, applicant, pageLabel);
    else if (currentPage === 'personal2') await fillIdentification(page, applicant, pageLabel);
    else if (currentPage === 'health') await fillHealth(page, applicant, pageLabel);
    else if (currentPage === 'character') await fillCharacter(page, applicant, pageLabel);
    else if (currentPage === 'whs') await fillWhs(page, applicant, pageLabel);
    else if (currentPage === 'personal3') await dumpUnknown(page, pageLabel);
    const advanced = await advance(page, pageLabel, stats, actions);
    if (advanced === 'saved') return finish('STOP_SAVE');
    if (!advanced) return finish('STOP_NO_NEXT');
  }
  return finish('MAX_PAGES');
}

module.exports = { runApplicant };