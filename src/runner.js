require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { format } = require('node:util');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const LOGIN_URL = process.env.LOGIN_URL;
const MAX_WIZARD_PAGES = Number(process.env.MAX_WIZARD_PAGES || 30);
const STOP_BEFORE_PAYMENT = true;
const PROFILE_ROOT = path.join(ROOT, 'chrome-profiles');
const LOG_ROOT = path.join(ROOT, 'logs');
const MAX_HIGH_LOAD_RETRIES = Number(process.env.MAX_HIGH_LOAD_RETRIES || 6);
const HIGH_LOAD_BACKOFF_MS = Number(process.env.HIGH_LOAD_BACKOFF_MS || 1500);
const SCHEME_COUNTRY = process.env.SCHEME_COUNTRY || '';
const COUNTRY_POLL_MS = Number(process.env.COUNTRY_POLL_MS || 5000);
const CAPTCHA_TIMEOUT_MS = Number(process.env.CAPTCHA_TIMEOUT_MS || 120000);
const CAPSOLVER_EXTENSION_ID = process.env.CAPSOLVER_EXTENSION_ID || 'mbfeabdjfagoifkpcikdaneggoimeidb';
const CLICK_WAIT_TIMEOUT_MS = Number(process.env.CLICK_WAIT_TIMEOUT_MS || 1500);
const NAVIGATION_WAIT_TIMEOUT_MS = Number(process.env.NAVIGATION_WAIT_TIMEOUT_MS || 10000);
const CAPSOLVER_MANUAL_SOLVING = false;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_KEY || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
let logFile = '';
let logSequence = 0;
let logWriteQueue = Promise.resolve();
let accountLogTimestamp = '';
const accountLogFiles = new Map();
const accountLogQueues = new Map();
let runStartedAt = 0;
const captchaStats = {
  count: 0,
  totalMs: 0
};

async function initializeLogger() {
  await fs.mkdir(LOG_ROOT, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  accountLogTimestamp = timestamp;
  logFile = path.join(LOG_ROOT, `run-${timestamp}.log`);
  await fs.writeFile(logFile, '');
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const write = (original, values) => {
    const line = `[${String(++logSequence).padStart(4, '0')}] [${new Date().toISOString()}] ${format(...values)}\n`;
    original(line.trimEnd());
    logWriteQueue = logWriteQueue.then(() => fs.appendFile(logFile, line));
    const accountMatch = line.match(/\[account (\d+)(?:: [^\]]+)?\]/);
    if (accountMatch) writeAccountLog(Number(accountMatch[1]) - 1, line);
  };
  console.log = (...values) => write(originalLog, values);
  console.error = (...values) => write(originalError, values);
  console.log(`LOG_FILE ${logFile}`);
}

async function initializeAccountLogger(index, username) {
  if (accountLogFiles.has(index)) return accountLogFiles.get(index);
  const safeUsername = String(username).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(LOG_ROOT, `run-${accountLogTimestamp}-account-${index + 1}-${safeUsername}.log`);
  await fs.writeFile(filePath, '');
  accountLogFiles.set(index, filePath);
  accountLogQueues.set(index, Promise.resolve());
  return filePath;
}

function writeAccountLog(index, line) {
  const filePath = accountLogFiles.get(index);
  if (!filePath) return;
  const previous = accountLogQueues.get(index) || Promise.resolve();
  const next = previous.then(() => fs.appendFile(filePath, line));
  accountLogQueues.set(index, next.catch(() => {}));
}

const textSelectors = {
  username: ['input[name="username"]'],
  password: ['input[name="password"]'],
  familyName: ['[id$="familyNameTextBox"]'],
  givenName1: ['[id$="givenName1TextBox"]'],
  givenName2: ['[id$="givenName2TextBox"]'],
  givenName3: ['[id$="givenName3TextBox"]'],
  otherNames: ['[id$="otherNamesTextBox"]'],
  otherTitle: ['[id$="otherTitleTextBox"]'],
  dateOfBirth: ['[id$="dateOfBirthDatePicker_DatePicker"]', '[id$="dateOfBirthTextBox"]'],
  passportNumber: ['[id$="passportNumberTextBox"]'],
  confirmPassportNumber: ['[id$="confirmPassportNumberTextBox"]'],
  passportExpiry: ['[id$="passportExpiryDateDatePicker_DatePicker"]'],
  idExpiryDate: ['[id$="identityDocumentExpiryDateTextBox"]', '[id$="idExpiryDateTextBox"]'],
  idIssueDate: ['[id$="otherIssueDateDatePicker_DatePicker"]', '[id$="identityDocumentIssueDateTextBox"]', '[id$="idIssueDateTextBox"]'],
  streetNumber: ['[id$="streetNumberTextbox"]', '[id$="streetNumberTextBox"]'],
  streetName: ['[id$="address1TextBox"]'],
  suburb: ['[id$="suburbTextBox"]'],
  city: ['[id$="cityTextBox"]'],
  province: ['[id$="provinceStateTextBox"]'],
  postalCode: ['[id$="postalCodeTextBox"]', '[id$="postCodeTextBox"]'],
  phoneDaytime: ['[id$="daytimePhoneTextBox"]'],
  phoneNight: ['[id$="phoneNumberNightTextBox"]'],
  phoneMobile: ['[id$="mobilePhoneTextBox"]'],
  fax: ['[id$="faxNumberTextbox"]', '[id$="faxNumberTextBox"]'],
  email: ['[id$="emailTextBox"]'],
  medicalDetails: ['[id$="medicalConditionsTextBox"]'],
  characterDetails: ['[id$="characterDetailsTextBox"]'],
  travelDate: ['[id$="intendedTravelDateDatePicker_DatePicker"]'],
  beenToNzWhen: ['[id$="beenToNzDateDatePicker_DatePicker"]', '[id$="whenInNzDatePicker_DatePicker"]'],
  payerName: ['[id$="payerNameTextBox"]', '[id$="PayerNameTextBox"]', '[id$="payerName"]', '[id$="txtPayerName"]', '[id$="cardHolderNameTextBox"]', '[id$="nameOnCardTextBox"]', '[id$="payerFullNameTextBox"]']
};

const selectSelectors = {
  representedByAgent: ['select[id$="representedByAgentDropdownlist"]'],
  title: ['select[id$="titleDropDownList"]'],
  gender: ['select[id$="genderDropDownList"]'],
  countryOfBirth: ['select[id$="personDetails_CountryDropDownList"]', 'select[id$="countryOfBirthDropDownList"]'],
  passportCitizenship: ['select[id$="passportCountryDropDownList"]', 'select[id$="passportCitizenshipDropDownList"]', 'select[id$="nationalityDropDownList"]'],
  addressCountry: ['select[id$="address_countryDropDownList"]'],
  communicationMethod: ['select[id$="communicationMethodDropDownList"]'],
  hasCreditCard: ['select[id$="hasCreditCardDropDownlist"]'],
  idType: ['select[id$="otherIdentificationDropdownlist"]', 'select[id$="identityDocumentTypeDropDownList"]'],
  renalDialysis: ['select[id$="renalDialysisDropDownList"]'],
  activeTb: ['select[id$="tuberculosisDropDownList"]', 'select[id$="activeTbDropDownList"]'],
  cancer: ['select[id$="cancerDropDownList"]'],
  heartDisease: ['select[id$="heartDiseaseDropDownList"]'],
  disability: ['select[id$="disabilityDropDownList"]'],
  hospitalisation: ['select[id$="hospitalisationDropDownList"]'],
  residentialCare: ['select[id$="residentailCareDropDownList"]', 'select[id$="residentialCareDropDownList"]'],
  pregnancy: ['select[id$="pregnancyStatusDropDownList"]'],
  tbRisk: ['select[id$="tbRiskDropDownList"]'],
  imprisonment5Years: ['select[id$="imprisonment5YearsDropDownList"]'],
  imprisonment12Months: ['select[id$="imprisonment12MonthsDropDownList"]'],
  deported: ['select[id$="deportedDropDownList"]'],
  removalOrder: ['select[id$="removalOrderDropDownList"]'],
  charged: ['select[id$="chargedDropDownList"]'],
  convicted: ['select[id$="convictedDropDownList"]'],
  underInvestigation: ['select[id$="underInvestigationDropDownList"]'],
  excluded: ['select[id$="excludedDropDownList"]'],
  removed: ['select[id$="removedDropDownList"]'],
  previousWhsVisa: ['select[id$="previousWhsPermitVisaDropDownList"]', 'select[id$="previousWorkingHolidayVisaDropDownList"]'],
  sufficientFundsHoliday: ['select[id$="sufficientFundsHolidayDropDownList"]'],
  beenToNz: ['select[id$="beenToNzDropDownList"]'],
  sufficientFundsOnwardTicket: ['select[id$="sufficientFundsOnwardTicketDropDownList"]'],
  meetSchemeRequirements: ['select[id$="readRequirementsDropDownList"]'],
  lengthOfStay: ['select[id$="lengthOfStayDropDownList"]']
};

const NEXT_LOCATORS = [
  'input[type="submit"][value="Next"][id$="nextImageButton"]',
  '[id$="nextImageButton"]', '[id$="NextButton"]', 'input[value="Next"]',
  'input[alt="Next"]', 'button[value="Next"]', 'button[aria-label="Next"]'
];
const SAVE_LOCATORS = ['input[value="SAVE"]', 'input[id$="validateButton"][value="SAVE"]'];
const SUBMIT_LOCATORS = ['[id$="submitImageButton"]', '[id$="submitButton"]', 'input[value="SUBMIT"]'];

function readJson(fileName) {
  return fs.readFile(path.join(ROOT, fileName), 'utf8').then(JSON.parse);
}

async function readCapSolverApiKey(extensionPath) {
  const configPath = path.join(extensionPath, 'assets', 'config.js');
  const source = await fs.readFile(configPath, 'utf8');
  const match = source.match(/apiKey\s*:\s*(['"])(.*?)\1/);
  const apiKey = match?.[2]?.trim() || '';
  if (!apiKey) throw new Error(`CapSolver API key chưa được cấu hình trong ${configPath}`);
  return apiKey;
}

async function syncCapSolverApiKey(browser, extensionPath) {
  const apiKey = await readCapSolverApiKey(extensionPath);
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${CAPSOLVER_EXTENSION_ID}/www/index.html#/popup`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async key => {
      const current = await chrome.storage.local.get('config');
      await chrome.storage.local.set({ config: { ...(current.config || {}), apiKey: key, manualSolving: false } });
    }, apiKey);
    console.log('CapSolver API key đã đồng bộ vào extension storage');
  } finally {
    await page.close();
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function resetPageScroll(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })).catch(() => {});
}

async function waitForActionProgress(page, previousUrl, previousMarker, label) {
  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_WAIT_TIMEOUT_MS
  }).then(() => 'navigation').catch(() => 'navigation_timeout');
  const domChange = page.waitForFunction(
    ({ url, marker }) => location.href !== url || (document.body?.innerText || '').slice(0, 500) !== marker,
    { timeout: CLICK_WAIT_TIMEOUT_MS },
    { url: previousUrl, marker: previousMarker }
  ).then(() => 'dom').catch(() => 'dom_timeout');
  let progress = await Promise.race([navigation, domChange]);
  if (progress === 'dom_timeout') progress = await navigation;
  if (progress === 'navigation_timeout') console.log(`[${label}] ACTION_NO_VISIBLE_CHANGE`);
  else console.log(`[${label}] ACTION_PROGRESS ${progress}`);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[TELEGRAM] bỏ qua: cần TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID trong .env');
    return false;
  }
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
  });
  if (!response.ok) {
    throw new Error(`Telegram trả về HTTP ${response.status}`);
  }
  console.log('[TELEGRAM] đã gửi kết quả');
  return true;
}

function applicantSummary(applicant, account) {
  const name = [applicant.personal?.given_name_1, applicant.personal?.family_name]
    .filter(Boolean)
    .join(' ') || '(chưa có tên)';
  return `Tên: ${name}\nEmail hồ sơ: ${account.email}\nTài khoản: ${account.username}\nHộ chiếu: ${applicant.identification?.passport_number || '(trống)'}`;
}

function buildTelegramSummary(results, totalRuntime) {
  const lines = [
    'KẾT QUẢ RUNNER INZ',
    `Thời gian hết: ${formatDuration(totalRuntime)}`,
    `Tổng thời gian giải CAPTCHA: ${formatDuration(results.reduce((total, result) => total + result.captchaMs, 0))}`,
    ''
  ];
  for (const result of results) {
    lines.push(`[${result.status}] ${result.label}`);
    lines.push(`Thời gian: ${formatDuration(result.runtimeMs)}`);
    lines.push(`Thời gian giải CAPTCHA: ${formatDuration(result.captchaMs)}`);
    lines.push(result.applicantInfo);
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function firstExisting(page, selectors) {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) return selector;
  }
  return null;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (!element) continue;
    const visible = await element.evaluate(node => {
      const style = window.getComputedStyle(node);
      return Boolean(node.getClientRects().length) && style.display !== 'none' && style.visibility !== 'hidden';
    }).catch(() => false);
    if (visible) return selector;
  }
  return null;
}

async function fillText(page, selectors, value) {
  if (value === undefined || value === null || value === '') return false;
  const selector = await firstExisting(page, selectors);
  if (!selector) return false;
  await page.$eval(selector, (element, nextValue) => {
    element.focus();
    element.value = nextValue;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
  return true;
}

async function selectValue(page, selectors, value) {
  if (value === undefined || value === null || value === '') return false;
  const selector = await firstExisting(page, selectors);
  if (!selector) return false;
  const optionValue = await page.$eval(selector, (select, wanted) => {
    const normalized = String(wanted).trim().toLowerCase();
    const option = [...select.options].find(item =>
      item.value.trim().toLowerCase() === normalized ||
      item.text.trim().toLowerCase() === normalized
    );
    return option ? option.value : null;
  }, String(value));
  if (optionValue === null) throw new Error(`Không tìm thấy option "${value}" cho ${selector}`);
  await page.select(selector, optionValue);
  return true;
}

async function fillJobs(page, jobs, label) {
  for (const job of jobs) {
    const selectors = job.type === 'select' ? selectSelectors[job.selector] : textSelectors[job.selector];
    if (job.value === undefined || job.value === null || job.value === '') {
      console.log(`[${label}] FIELD_SKIP_EMPTY ${job.selector}`);
      continue;
    }
    const matchedSelector = selectors ? await firstExisting(page, selectors) : null;
    if (!matchedSelector) {
      console.log(`[${label}] FIELD_SKIP_MISSING ${job.selector}`);
      continue;
    }
    if (job.type === 'select') {
      await selectValue(page, selectors, job.value);
    } else {
      await fillText(page, selectors, job.value);
    }
    console.log(`[${label}] FIELD_SET ${job.selector} selector=${matchedSelector}`);
  }
  console.log(`[${label}] ${jobs.name || 'FILL'} hoàn tất`);
}

async function fillPersonal1(page, applicant, label) {
  const { personal, address, contact } = applicant;
  await selectValue(page, selectSelectors.representedByAgent, contact.has_agent);
  await fillJobs(page, [
    { selector: 'familyName', value: personal.family_name },
    { selector: 'givenName1', value: personal.given_name_1 },
    { selector: 'givenName2', value: personal.given_name_2 },
    { selector: 'givenName3', value: personal.given_name_3 },
    { selector: 'otherNames', value: personal.other_names },
    { type: 'select', selector: 'title', value: personal.title },
    { selector: 'dateOfBirth', value: personal.date_of_birth },
    { type: 'select', selector: 'gender', value: personal.gender },
    { type: 'select', selector: 'countryOfBirth', value: personal.country_of_birth },
    { selector: 'streetNumber', value: address.street_number },
    { selector: 'streetName', value: address.street_name },
    { selector: 'suburb', value: address.suburb },
    { selector: 'city', value: address.city },
    { selector: 'postalCode', value: address.postal_code },
    { type: 'select', selector: 'addressCountry', value: address.country },
    { selector: 'phoneDaytime', value: contact.phone_daytime },
    { selector: 'phoneMobile', value: contact.phone_mobile },
    { selector: 'email', value: contact.email },
    { type: 'select', selector: 'communicationMethod', value: contact.communication_method },
    { type: 'select', selector: 'hasCreditCard', value: contact.has_credit_card }
  ], label);
}

async function fillIdentification(page, applicant, label) {
  const { identification } = applicant;
  await fillJobs(page, [
    { selector: 'passportNumber', value: identification.passport_number },
    { selector: 'confirmPassportNumber', value: identification.passport_number },
    { selector: 'passportExpiry', value: identification.passport_expiry },
    { type: 'select', selector: 'passportCitizenship', value: identification.passport_citizenship },
    { type: 'select', selector: 'idType', value: identification.id_type },
    { selector: 'idIssueDate', value: identification.id_issue_date },
    { selector: 'idExpiryDate', value: identification.id_expiry_date }
  ], label);
}

async function fillHealth(page, applicant, label) {
  const health = applicant.health;
  await fillJobs(page, [
    { type: 'select', selector: 'renalDialysis', value: health.renal_dialysis },
    { type: 'select', selector: 'activeTb', value: health.active_tb },
    { type: 'select', selector: 'cancer', value: health.cancer },
    { type: 'select', selector: 'heartDisease', value: health.heart_disease },
    { type: 'select', selector: 'disability', value: health.disability },
    { type: 'select', selector: 'hospitalisation', value: health.hospitalisation },
    { type: 'select', selector: 'residentialCare', value: health.residential_care },
    { type: 'select', selector: 'pregnancy', value: health.pregnancy },
    { type: 'select', selector: 'tbRisk', value: health.tb_risk },
    { selector: 'medicalDetails', value: health.medical_details }
  ], label);
}

async function selectCharacterAnswer(page, questionPattern, value) {
  if (value === undefined || value === null || value === '') return false;
  return page.evaluate(({ pattern, wanted }) => {
    const question = new RegExp(pattern, 'i');
    const candidates = [...document.querySelectorAll('select')].map(select => {
      let node = select;
      let score = Infinity;
      for (let level = 0; level < 6 && node; level += 1, node = node.parentElement) {
        const textLength = (node.innerText || '').trim().length;
        if (question.test(node.innerText || '')) score = Math.min(score, textLength);
      }
      return { select, score };
    }).filter(item => Number.isFinite(item.score));
    candidates.sort((left, right) => left.score - right.score);
    const target = candidates[0]?.select;
    if (!target) return false;
    /* Keep the answer selection scoped to the smallest matching question row. */
    const option = [...target.options].find(item => {
      const normalized = String(wanted).trim().toLowerCase();
      return item.value.trim().toLowerCase() === normalized || item.text.trim().toLowerCase() === normalized;
    });
    if (!option) return false;
    target.value = option.value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { pattern: questionPattern, wanted: String(value) });
}

async function fillCharacter(page, applicant, label) {
  const character = applicant.character;
  const fields = [
    ['5 years', character.imprisonment_5_years, 'imprisonment5Years'],
    ['12 months', character.imprisonment_12_months, 'imprisonment12Months'],
    ['deported', character.deported, 'deported'],
    ['removal order', character.removal_order || 'No', 'removalOrder'],
    ['charged', character.charged, 'charged'],
    ['convicted', character.convicted, 'convicted'],
    ['under investigation', character.under_investigation, 'underInvestigation'],
    ['excluded', character.excluded, 'excluded'],
    ['removed', character.removed, 'removed']
  ];
  for (const [question, value, name] of fields) {
    const matched = await selectCharacterAnswer(page, question, value) ||
      await selectValue(page, selectSelectors[name], value);
    console.log(`[${label}] ${matched ? 'FIELD_SET' : 'FIELD_SKIP_MISSING'} ${name}`);
  }
  await fillJobs(page, [{ selector: 'characterDetails', value: character.details }], label);
}

async function fillWhs(page, applicant, label) {
  const whs = applicant.whs;
  await fillJobs(page, [
    { type: 'select', selector: 'previousWhsVisa', value: whs.previous_whs_visa },
    { type: 'select', selector: 'sufficientFundsHoliday', value: whs.sufficient_funds_holiday },
    { selector: 'travelDate', value: whs.travel_date },
    { type: 'select', selector: 'beenToNz', value: whs.been_to_nz },
    { selector: 'beenToNzWhen', value: whs.been_to_nz_when },
    { type: 'select', selector: 'sufficientFundsOnwardTicket', value: whs.sufficient_funds_onward_ticket },
    { type: 'select', selector: 'meetSchemeRequirements', value: whs.meet_scheme_requirements },
    { type: 'select', selector: 'lengthOfStay', value: whs.length_of_stay }
  ], label);
}

async function hasCaptcha(page) {
  return page.evaluate(() => Boolean(
    /\/rs-captcha|\/captcha/i.test(location.href) ||
    document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha') ||
    /captcha|i'm not a robot/i.test(document.body?.innerText || '')
  ));
}

async function isDeclarationUi(page) {
  return Boolean(
    await firstVisible(page, SUBMIT_LOCATORS) &&
    await page.$('input[type="checkbox"], [role="checkbox"]')
  );
}

async function triggerCapSolver(page, label) {
  if (!CAPSOLVER_MANUAL_SOLVING) {
    console.log(`[${label}] CAPTCHA_AUTO_MODE extension sẽ tự giải`);
    return;
  }
  const button = await page.$('#capsolver-solver-tip-button');
  if (button) {
    await page.evaluate(element => element.click(), button).catch(() => {});
  } else {
    await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, input, [role="button"], a, span')];
      const target = nodes.find(element => /solve with capsolver/i.test(
        `${element.textContent || ''} ${element.value || ''} ${element.id || ''}`
      ));
      if (target) target.click();
    }).catch(() => {});
  }
  console.log(`[${label}] CAPTCHA_TRIGGERED_AFTER_DECLARATION`);
}

async function isCaptchaSolved(page) {
  return page.evaluate(() => {
    const response = [...document.querySelectorAll('textarea[name="g-recaptcha-response"], textarea#g-recaptcha-response')]
      .some(element => element.value.trim().length > 0);
    const checked = Boolean(document.querySelector('.recaptcha-checkbox-checked, [aria-checked="true"]'));
    const captchaUrl = /\/rs-captcha|\/captcha/i.test(location.href);
    return response || checked || !captchaUrl && !document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha');
  });
}

async function isHighLoadPage(page) {
  const content = `${await page.url()} ${await page.evaluate(() => document.body?.innerText || '')}`;
  return /site is under high load|currently experiencing high demand|system is busy|please try again later|try again later/i.test(content);
}

async function recoverHighLoad(page, label) {
  for (let attempt = 1; attempt <= MAX_HIGH_LOAD_RETRIES; attempt += 1) {
    if (!await isHighLoadPage(page)) return false;
    const delay = HIGH_LOAD_BACKOFF_MS * (2 ** (attempt - 1));
    console.log(`[${label}] INZ đang quá tải (${attempt}/${MAX_HIGH_LOAD_RETRIES}), thử lại sau ${delay}ms`);
    await sleep(delay);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  if (await isHighLoadPage(page)) {
    throw new Error(`INZ vẫn đang quá tải sau ${MAX_HIGH_LOAD_RETRIES} lần thử`);
  }
  return true;
}

function waitForEnter(message) {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => input.question(`${message}\n`, () => {
    input.close();
    resolve();
  }));
}

async function pauseForCaptcha(page, label, stats = null) {
  if (await hasCaptcha(page)) {
    await triggerCapSolver(page, label);
    const captchaStartedAt = Date.now();
    captchaStats.count += 1;
    console.log(`[${label}] CAPTCHA detected, CapSolver đang tự xử lý`);
    const deadline = Date.now() + CAPTCHA_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await isCaptchaSolved(page)) {
        const duration = Date.now() - captchaStartedAt;
        captchaStats.totalMs += duration;
        if (stats) stats.captchaMs += duration;
        console.log(`[${label}] CAPTCHA solved duration=${formatDuration(duration)}`);
        await page.waitForFunction(() => !/\/rs-captcha|\/captcha/i.test(location.href), {
          timeout: 15000
        }).catch(() => {});
        if (/\/rs-captcha|\/captcha/i.test(await page.url())) {
          throw new Error('CAPTCHA đã solved nhưng INZ chưa redirect khỏi trang CAPTCHA');
        }
        return;
      }
      await sleep(500);
    }
    const duration = Date.now() - captchaStartedAt;
    captchaStats.totalMs += duration;
    if (stats) stats.captchaMs += duration;
    throw new Error(`CAPTCHA chưa được giải sau ${CAPTCHA_TIMEOUT_MS}ms. Kiểm tra API key hoặc reload extension.`);
  }
}

async function clickByText(page, patterns) {
  const clicked = await page.evaluate(patternsToUse => {
    const candidates = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')];
    const element = candidates.find(candidate => patternsToUse.some(pattern => {
      const regex = new RegExp(pattern.source, pattern.flags);
      return regex.test((candidate.innerText || candidate.value || '').trim());
    }));
    if (!element) return false;
    element.click();
    return true;
  }, patterns.map(pattern => ({ source: pattern.source, flags: pattern.flags })));
  return clicked;
}

async function login(page, email, password, label, stats) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  console.log(`[${label}] trang login: ${await page.url()}`);
  await recoverHighLoad(page, label);
  await pauseForCaptcha(page, label, stats);
  await page.waitForFunction(() => Boolean(
    document.querySelector('input[name="username"], input[name="password"]') ||
    document.querySelector('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]')
  ), { timeout: 30000 }).catch(() => {});
  const usernameSelector = await firstExisting(page, textSelectors.username);
  const passwordSelector = await firstExisting(page, textSelectors.password);
  const authenticatedUi = Boolean(
    await page.$('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]')
  );
  if (!usernameSelector && !passwordSelector && authenticatedUi) {
    console.log(`[${label}] LOGIN_SKIP đã đăng nhập, UI hiện tại: ${await page.url()}`);
    return;
  }
  if (!usernameSelector || !passwordSelector) {
    const state = await page.evaluate(() => ({ url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, 500) }));
    throw new Error(`Không nhận diện được UI login/đã đăng nhập: ${state.url} (${state.title}) ${state.text}`);
  }
  try {
    await page.waitForSelector('input[name="username"]', { visible: true, timeout: 30000 });
    await page.waitForSelector('input[name="password"]', { visible: true, timeout: 30000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      text: (document.body?.innerText || '').slice(0, 500)
    }));
    throw new Error(`Login form timeout at ${state.url} (${state.title}): ${state.text} | ${error.message}`);
  }
  console.log(`[${label}] đang điền username/password`);
  await fillText(page, textSelectors.username, email);
  await fillText(page, textSelectors.password, password);
  const beforeUrl = await page.url();
  const loginButton = await page.$('input[type="submit"][value*="LOGIN" i]');
  if (loginButton) {
    await loginButton.click();
  } else {
    const clicked = await clickByText(page, [/^sign in$/i]);
    if (!clicked) throw new Error('Không tìm thấy nút LOGIN trên trang đăng nhập');
  }
  console.log(`[${label}] đã bấm LOGIN, đang chờ website phản hồi`);
  await page.waitForFunction(
    previousUrl => location.href !== previousUrl || !document.querySelector('[name="username"]'),
    { timeout: 30000 },
    beforeUrl
  ).catch(() => {});
  await recoverHighLoad(page, label);
  await pauseForCaptcha(page, label, stats);
  const currentUrl = await page.url();
  const loginFormStillVisible = await firstExisting(page, textSelectors.username);
  if (loginFormStillVisible && !/\/WorkingHoliday\//i.test(currentUrl)) {
    const message = await page.evaluate(() => document.body?.innerText || '');
    throw new Error(`Đăng nhập chưa thành công. Kiểm tra username/password hoặc CAPTCHA. ${message.slice(-300)}`);
  }
  console.log(`[${label}] LOGIN_OK ${currentUrl}`);
}

async function detectPage(page) {
  const url = await page.url();
  const body = await page.evaluate(() => document.body?.innerText || '');
  if (/\/rs-captcha|\/captcha/i.test(url)) return 'captcha';
  if (await isHighLoadPage(page)) return 'highload';
  if (await firstExisting(page, textSelectors.username)) return 'login';
  if (/paystation|paymark|paymentexpress|pxpay|cardnumber/i.test(url) || await page.$('input[autocomplete="cc-number"], iframe[src*="payment"]')) return 'payment';
  if (/submitreceived|onlinesubmit/i.test(url) || /SUBMIT RECEIVED[\s\S]*PAY LATER/i.test(body)) return 'pay_now';
  if (await page.$('#ContentPlaceHolder1_onlinePaymentAnchor2, a[id$="onlinePaymentAnchor2"], a[href*="PaymentGateway/OnLinePayment"], a[href*="OnLinePayment.aspx"]') || /NEXT STEP[\s\S]*(SECURE PAYMENT|TOTAL CHARGE)/i.test(body)) return 'pay_next';
  if (await firstExisting(page, textSelectors.payerName)) return 'payer';
  const visibleSubmit = await firstVisible(page, SUBMIT_LOCATORS);
  const hasDeclarationFields = await page.$('input[type="checkbox"], [role="checkbox"]');
  if (visibleSubmit && (/submit\.aspx/i.test(url) || hasDeclarationFields)) return 'submit';
  if (/submit\.aspx/i.test(url) || await page.$('input[type="checkbox"]') && /declaration|submit/i.test(url + body)) return 'declaration';
  if (await hasCaptcha(page)) return 'captcha';
  if (/personal1/i.test(url) || await firstExisting(page, textSelectors.familyName)) return 'personal1';
  if (/personal2/i.test(url) || await firstExisting(page, textSelectors.passportNumber)) return 'personal2';
  if (/personal3/i.test(url)) return 'personal3';
  if (/medical|health/i.test(url) || await firstExisting(page, selectSelectors.renalDialysis)) return 'health';
  if (/character/i.test(url) || await firstExisting(page, selectSelectors.imprisonment5Years)) return 'character';
  if (/workingholidayspecific|whs/i.test(url) || await firstExisting(page, selectSelectors.previousWhsVisa)) return 'whs';
  if (await firstExisting(page, textSelectors.payerName)) return 'payer';
  return 'unknown';
}

async function clickFirstControl(page, selectors, label, stats) {
  for (const selector of selectors) {
    const control = await page.$(selector);
    if (control) {
      const state = await control.evaluate(element => ({
        visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
        disabled: element.disabled,
        value: element.value || element.textContent?.trim() || '',
        id: element.id || ''
      }));
      if (!state.visible || state.disabled) continue;
      const previousUrl = await page.url();
      const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
      await page.evaluate(element => element.click(), control);
      console.log(`[${label}] CLICK ${selector} id=${state.id} value=${state.value}`);
      console.log(`[${label}] ${selector}`);
      await waitForActionProgress(page, previousUrl, previousMarker, label);
      await recoverHighLoad(page, label);
      if (await isDeclarationUi(page)) {
        console.log(`[${label}] CAPTCHA_DEFERRED_UNTIL_DECLARATION_TICK`);
      } else {
        await pauseForCaptcha(page, label, stats);
      }
      await resetPageScroll(page);
      return true;
    }
  }
  return false;
}

async function clickLabeled(page, labels, excludes, label, stats) {
  const previousUrl = await page.url();
  const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
  const clicked = await page.evaluate(({ wanted, excluded }) => {
    const nodes = [...document.querySelectorAll('input,button,a,span')];
    const normalize = value => (value || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const element = nodes.find(node => {
      const blob = normalize(`${node.value} ${node.textContent} ${node.id} ${node.title} ${node.alt}`);
      return wanted.some(text => blob === text || blob.includes(text)) &&
        !excluded.some(text => blob.includes(text)) &&
        node.getClientRects().length > 0 && !node.disabled;
    });
    if (!element) return false;
    element.click();
    return true;
  }, { wanted: labels.map(item => item.toUpperCase()), excluded: excludes.map(item => item.toUpperCase()) });
  if (!clicked) return false;
  await waitForActionProgress(page, previousUrl, previousMarker, label);
  await recoverHighLoad(page, label);
  if (await isDeclarationUi(page)) {
    console.log(`[${label}] CAPTCHA_DEFERRED_UNTIL_DECLARATION_TICK`);
  } else {
    await pauseForCaptcha(page, label, stats);
  }
  await resetPageScroll(page);
  return true;
}

async function advance(page, label, stats) {
  if (await clickFirstControl(page, NEXT_LOCATORS, label, stats)) return true;
  console.log(`[${label}] NEXT_NOT_FOUND_TRY_SAVE`);
  if (await clickFirstControl(page, SAVE_LOCATORS, label, stats)) {
    console.log(`[${label}] SAVE_CLICKED_AFTER_NEXT_NOT_FOUND`);
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      if (await clickFirstControl(page, NEXT_LOCATORS, label, stats)) {
        console.log(`[${label}] NEXT_CLICKED_AFTER_SAVE attempt=${attempt}`);
        return true;
      }
      if (await clickFirstControl(page, SUBMIT_LOCATORS, label, stats)) {
        console.log(`[${label}] SUBMIT_CLICKED_AFTER_SAVE attempt=${attempt}`);
        return true;
      }
      await sleep(250);
    }
    console.log(`[${label}] SAVE_OK_NO_NEXT_ON_PAGE`);
    return 'saved';
  }
  return clickFirstControl(page, SUBMIT_LOCATORS, label, stats);
}

async function fillDeclaration(page, applicant, label) {
  const declarationConfig = applicant.declaration || { all_yes: true };
  await page.waitForFunction(() => Boolean(
    document.querySelector('input[type="checkbox"]') ||
    document.querySelector('label[for], [role="checkbox"]')
  ), { timeout: 2000 }).catch(() => {});
  const checked = await page.evaluate(config => {
    if (config.all_yes !== true) return { count: 0, total: 0, fields: [], roleCount: 0, failed: [] };
    const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')].filter(input =>
      !input.disabled && !input.closest('iframe, .g-recaptcha, [id*="captcha" i]')
    );
    const fields = [];
    const failed = [];
    for (const checkbox of checkboxes) {
      if (!checkbox.checked) {
        checkbox.click();
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (checkbox.checked) {
        fields.push(checkbox.id || checkbox.name || 'anonymous-checkbox');
      } else {
        failed.push(checkbox.id || checkbox.name || 'anonymous-checkbox');
      }
    }
    const roleCheckboxes = [...document.querySelectorAll('[role="checkbox"]')].filter(element =>
      !element.closest('iframe, .g-recaptcha, [id*="captcha" i]') &&
      element.getAttribute('aria-checked') !== 'true'
    );
    for (const checkbox of roleCheckboxes) {
      checkbox.click();
      checkbox.setAttribute('aria-checked', 'true');
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      if (checkbox.getAttribute('aria-checked') !== 'true') failed.push(checkbox.id || 'anonymous-role-checkbox');
    }
    return {
      count: fields.length + roleCheckboxes.length,
      total: checkboxes.length + roleCheckboxes.length,
      fields,
      roleCount: roleCheckboxes.length,
      failed
    };
  }, declarationConfig);
  console.log(`[${label}] FILL_DECLARATION ${checked.count}/${checked.total} fields=${checked.fields.join(',')} roleCheckboxes=${checked.roleCount} failed=${checked.failed.join(',') || 'none'}`);
  if (checked.total === 0 || checked.count !== checked.total || checked.failed.length > 0) {
    throw new Error(`Declaration chưa tick đủ Yes: ${checked.count}/${checked.total}`);
  }
  return checked;
}

async function dumpUnknown(page, label) {
  const fields = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')]
    .filter(element => element.type !== 'hidden')
    .slice(0, 40)
    .map(element => `${element.tagName}#${element.id || ''}[name=${element.name || ''}]`));
  console.log(`[${label}] UNKNOWN_FIELDS ${fields.join(', ')}`);
}

async function selectSchemeCountry(page, country, label, stats) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    const result = await page.evaluate(wanted => {
      const normalizedWanted = wanted.trim().toLowerCase();
      const names = [...document.querySelectorAll("[id^='ContentPlaceHolder1_countryRepeater_countryName_']")];
      const name = names.find(element => element.textContent.trim().toLowerCase() === normalizedWanted);
      if (!name) return { found: false, open: false, cardText: '' };

      const suffix = name.id.split('_').pop();
      const status = document.getElementById(`ContentPlaceHolder1_countryRepeater_countryStatus_${suffix}`);
      const link = document.getElementById(`ContentPlaceHolder1_countryRepeater_createLink_${suffix}`);
      const card = link?.closest('.category-item') || name.closest('.category-item') || name.parentElement;
      const statusText = (status?.textContent || '').replace(/\s+/g, ' ').trim();
      const cardText = (card?.innerText || '').replace(/\s+/g, ' ').trim();
      if (!link || /\bclosed\b/i.test(statusText) || !/\bopen\b/i.test(statusText)) {
        return { found: true, open: false, cardText };
      }

      link.click();
      return { found: true, open: true, cardText };
    }, country);

    if (result.open) {
      console.log(`[${label}] SELECT_COUNTRY ${country} (${result.cardText})`);
      await waitForActionProgress(page, previousUrl, previousMarker, label);
      await recoverHighLoad(page, label);
      await pauseForCaptcha(page, label, stats);
      return true;
    }

    const status = result.found ? result.cardText : 'chưa xuất hiện trong danh sách';
    console.log(`[${label}] ${country} chưa OPEN (lần ${attempt}: ${status}), refresh sau ${COUNTRY_POLL_MS}ms`);
    await sleep(COUNTRY_POLL_MS);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await recoverHighLoad(page, label);
    await pauseForCaptcha(page, label, stats);
  }
}

async function continueToApplication(page, applicant, label, stats) {
  await page.waitForFunction(() => Boolean(
    document.querySelector('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]')
  ), { timeout: 30000 }).catch(() => {});
  const currentUrl = await page.url();
  if (/wizard/i.test(currentUrl) || await firstExisting(page, textSelectors.familyName)) return;
  const existing = await page.$("a[id^='ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_']");
  if (existing) {
    console.log(`[${label}] OPEN_EXISTING`);
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    await page.evaluate(element => element.click(), existing);
    await waitForActionProgress(page, previousUrl, previousMarker, label);
    await recoverHighLoad(page, label);
    return;
  }
  const country = SCHEME_COUNTRY || applicant.scheme_country;
  const hasCountryList = await page.$("[id^='ContentPlaceHolder1_countryRepeater_countryName_']");
  if (hasCountryList) {
    if (!country) throw new Error('Chưa cấu hình scheme country');
    const selected = await selectSchemeCountry(page, country, label, stats);
    if (!selected) throw new Error(`Không tìm thấy scheme country ${country}`);
    const applied = await clickFirstControl(page, ['#ContentPlaceHolder1_applyNowButton'], label, stats) || await clickLabeled(page, ['APPLY NOW'], [], label, stats);
    if (applied) return;
  }
  const applyButton = await page.$('#ContentPlaceHolder1_applyNowButton');
  if (applyButton) {
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    await page.evaluate(element => element.click(), applyButton);
    console.log(`[${label}] APPLY_NOW`);
    await waitForActionProgress(page, previousUrl, previousMarker, label);
    await recoverHighLoad(page, label);
    return;
  }
  const body = await page.evaluate(() => document.body?.innerText || '');
  throw new Error(`Không tìm thấy entry hồ sơ sau login. ${body.slice(0, 250)}`);
}

async function getSinglePage(browser) {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await Promise.all(pages.slice(1).map(extraPage => extraPage.close().catch(() => {})));
  return page;
}

async function runApplicant(browser, baseApplicant, account, index) {
  const { username, password, email: loginEmail } = account;
  const label = `account ${index + 1}: ${username}`;
  await initializeAccountLogger(index, username);
  console.log(`[${label}] ACCOUNT_LOG_FILE ${accountLogFiles.get(index)}`);
  const accountStartedAt = Date.now();
  const stats = { captchaMs: 0 };
  const result = {
    label,
    status: 'ERROR',
    runtimeMs: 0,
    captchaMs: 0,
    applicantInfo: applicantSummary(baseApplicant, account)
  };
  const finish = status => {
    result.status = status;
    result.runtimeMs = Date.now() - accountStartedAt;
    result.captchaMs = stats.captchaMs;
    return result;
  };
  const page = await getSinglePage(browser);
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) console.log(`[${label}] NAVIGATE ${frame.url()}`);
  });
  page.on('requestfailed', request => {
    const requestUrl = request.url();
    if (!requestUrl.startsWith('chrome-extension://') && !requestUrl.startsWith('chrome://')) {
      console.log(`[${label}] REQUEST_FAILED ${requestUrl} ${request.failure()?.errorText || ''}`);
    }
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  console.log(`[${label}] mở tab`);

  const applicant = structuredClone(baseApplicant);
  applicant.contact = { ...(applicant.contact || {}), email: loginEmail };

  try {
    await login(page, username, password, label, stats);
    await continueToApplication(page, applicant, label, stats);
    for (let pageNumber = 1; pageNumber <= MAX_WIZARD_PAGES; pageNumber += 1) {
      await recoverHighLoad(page, label);
      await resetPageScroll(page);
      const currentPage = await detectPage(page);
      const pageLabel = `${label} PAGE ${pageNumber} ${currentPage}`;
      console.log(`[${pageLabel}] URL=${await page.url()}`);
      if (currentPage === 'highload') {
        await recoverHighLoad(page, label);
        continue;
      }
      if (currentPage === 'captcha') {
        await pauseForCaptcha(page, pageLabel, stats);
        continue;
      }
      if (currentPage === 'login') {
        console.log(`[${label}] RESUME — session login lại`);
        await login(page, username, password, label, stats);
        await continueToApplication(page, applicant, label, stats);
        continue;
      }
      if (currentPage === 'payment' && STOP_BEFORE_PAYMENT) {
        console.log(`[${label}] dừng trước trang thanh toán để không nhập thông tin thẻ.`);
        return finish('STOP_PAYMENT');
      }
      if (currentPage === 'payer') {
        await fillText(page, textSelectors.payerName, applicant.payment?.payer_name || applicant.payer_name || 'Vu Quang Nguyen');
        console.log(`[${pageLabel}] FIELD_SET payerName`);
        await clickLabeled(page, ['OK'], ['PAY NOW', 'PAY LATER', 'NEXT STEP'], pageLabel, stats);
        continue;
      }
      if (currentPage === 'pay_next') {
        await clickFirstControl(page, ['#ContentPlaceHolder1_onlinePaymentAnchor2', 'a[id$="onlinePaymentAnchor2"]', 'a[href*="PaymentGateway/OnLinePayment"]', 'a[href*="OnLinePayment.aspx"]'], pageLabel, stats);
        continue;
      }
      if (currentPage === 'pay_now') {
        await clickLabeled(page, ['PAY NOW'], ['PAY LATER'], pageLabel, stats);
        continue;
      }
      if (currentPage === 'unknown') {
        await dumpUnknown(page, label);
        console.log(`[${label}] không nhận diện được trang, dừng để kiểm tra thủ công.`);
        return finish('STOP_UNKNOWN');
      }
      if (currentPage === 'declaration' || currentPage === 'submit') {
        await fillDeclaration(page, applicant, pageLabel);
        await pauseForCaptcha(page, pageLabel, stats);
        console.log(`[${pageLabel}] SUBMIT_ATTEMPT`);
        const submitClicked = await clickFirstControl(page, SUBMIT_LOCATORS, pageLabel, stats) ||
          await clickLabeled(page, ['SUBMIT'], ['CANCEL', 'PAY NOW', 'PAY LATER'], pageLabel, stats);
        if (submitClicked) {
          console.log(`[${pageLabel}] SUBMIT_CLICKED url=${await page.url()}`);
        } else {
          console.log(`[${pageLabel}] SUBMIT_NOT_FOUND`);
        }
        continue;
      }
      if (currentPage === 'personal1') {
        await fillPersonal1(page, applicant, pageLabel);
      } else if (currentPage === 'personal2') {
        await fillIdentification(page, applicant, pageLabel);
      } else if (currentPage === 'health') {
        await fillHealth(page, applicant, pageLabel);
      } else if (currentPage === 'character') {
        await fillCharacter(page, applicant, pageLabel);
      } else if (currentPage === 'whs') {
        await fillWhs(page, applicant, pageLabel);
      } else if (currentPage === 'personal3') {
        await dumpUnknown(page, pageLabel);
      }
      const advanced = await advance(page, pageLabel, stats);
      if (advanced === 'saved') {
        console.log(`[${pageLabel}] SAVE_OK_NO_NEXT_ON_PAGE; giữ nguyên trang để kiểm tra tiếp.`);
        return finish('STOP_SAVE');
      }
      if (!advanced) {
        console.log(`[${label}] không tìm thấy nút Next, dừng để kiểm tra thủ công.`);
        return finish('STOP_NO_NEXT');
      }
    }
    console.log(`[${label}] đạt giới hạn ${MAX_WIZARD_PAGES} trang.`);
    return finish('MAX_PAGES');
  } catch (error) {
    console.error(`[${label}] lỗi: ${error.message}`);
    return finish(`ERROR: ${error.message}`);
  }
}

async function launchBrowser(args, index) {
  const profilePath = path.join(PROFILE_ROOT, `account-${index + 1}`);
  await fs.mkdir(profilePath, { recursive: true });
  console.log(`[account ${index + 1}] Chrome profile: ${profilePath}`);
  return puppeteer.launch({
    headless: process.env.HEADLESS === 'true',
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    userDataDir: profilePath,
    args,
    defaultViewport: null
  });
}

async function main() {
  await initializeLogger();
  runStartedAt = Date.now();
  if (!LOGIN_URL) {
    throw new Error('Cần cấu hình LOGIN_URL trong file .env');
  }

  const [baseApplicant, emails] = await Promise.all([
    readJson('applicant.json'),
    readJson('emails.json')
  ]);
  if (!Array.isArray(emails) || emails.length === 0) throw new Error('emails.json phải chứa ít nhất một tài khoản');
  if (emails.some(account =>
    !account || typeof account !== 'object' ||
    typeof account.username !== 'string' || account.username.trim() === '' ||
    typeof account.email !== 'string' || account.email.trim() === '' ||
    typeof account.password !== 'string' || account.password === ''
  )) {
    throw new Error('Mỗi phần tử trong emails.json phải có username, password và email');
  }
  console.log(`Chuẩn bị chạy ${emails.length} Chrome profile độc lập.`);

  const extensionPath = process.env.CAPSOLVER_EXTENSION_PATH;
  const args = ['--start-maximized', '--lang=en-US'];
  if (extensionPath) {
    const resolvedExtensionPath = path.resolve(ROOT, extensionPath);
    args.push(
      `--disable-extensions-except=${resolvedExtensionPath}`,
      `--load-extension=${resolvedExtensionPath}`
    );
    console.log('Đã bật CapSolver extension. Hãy cấu hình API key trong extension trước khi chạy.');
  }

  try {
    await Promise.all(emails.map(async (account, index) => {
      let browser;
      try {
        await initializeAccountLogger(index, account.username);
        console.log(`[account ${index + 1}: ${account.username}] ACCOUNT_LOG_FILE ${accountLogFiles.get(index)}`);
        browser = await launchBrowser(args, index);
        if (extensionPath) {
          await syncCapSolverApiKey(browser, path.resolve(ROOT, extensionPath));
        }
        const result = await runApplicant(browser, baseApplicant, account, index);
        await sendTelegramMessage(buildTelegramSummary([result], result.runtimeMs)).catch(error => {
          console.error(`[TELEGRAM] ${result.label} lỗi gửi: ${error.message}`);
        });
        return result;
      } catch (error) {
        await browser?.close().catch(() => {});
        await initializeAccountLogger(index, account.username);
        const result = {
          label: `account ${index + 1}: ${account.username}`,
          status: `ERROR: ${error.message}`,
          runtimeMs: 0,
          captchaMs: 0,
          applicantInfo: applicantSummary(baseApplicant, account)
        };
        await sendTelegramMessage(buildTelegramSummary([result], result.runtimeMs)).catch(telegramError => {
          console.error(`[TELEGRAM] ${result.label} lỗi gửi: ${telegramError.message}`);
        });
        return result;
      }
    }));
  } finally {
    const totalRuntime = Date.now() - runStartedAt;
    console.log(`[SUMMARY] RUN_FINISHED total_runtime=${formatDuration(totalRuntime)} total_runtime_ms=${totalRuntime} captcha_count=${captchaStats.count} captcha_total=${formatDuration(captchaStats.totalMs)} captcha_total_ms=${captchaStats.totalMs}`);
  }
  console.log('Các Chrome profile đã chạy xong. Chrome sẽ được giữ mở để kiểm tra thủ công.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
