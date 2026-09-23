require('dotenv').config();

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const config = {
  root: ROOT,
  loginUrl: process.env.LOGIN_URL,
  profileRoot: path.join(ROOT, 'chrome-profiles'),
  logRoot: path.join(ROOT, 'logs'),
  maxWizardPages: Number(process.env.MAX_WIZARD_PAGES || 30),
  maxHighLoadRetries: Number(process.env.MAX_HIGH_LOAD_RETRIES || 10),
  highLoadBackoffMs: Number(process.env.HIGH_LOAD_BACKOFF_MS || 750),
  highLoadReloadTimeoutMs: Number(process.env.HIGH_LOAD_RELOAD_TIMEOUT_MS || 8000),
  highLoadProbeTimeoutMs: Number(process.env.HIGH_LOAD_PROBE_TIMEOUT_MS || 1000),
  highLoadCooldownMs: Number(process.env.HIGH_LOAD_COOLDOWN_MS || 5000),
  schemeCountry: process.env.SCHEME_COUNTRY || '',
  countryPollMs: Number(process.env.COUNTRY_POLL_MS || 5000),
  captchaTimeoutMs: Number(process.env.CAPTCHA_TIMEOUT_MS || 120000),
  captchaPollMs: Number(process.env.CAPTCHA_POLL_MS || 50),
  clickWaitTimeoutMs: Number(process.env.CLICK_WAIT_TIMEOUT_MS || 1500),
  navigationWaitTimeoutMs: Number(process.env.NAVIGATION_WAIT_TIMEOUT_MS || 10000),
  capsolverExtensionId: process.env.CAPSOLVER_EXTENSION_ID || 'mbfeabdjfagoifkpcikdaneggoimeidb',
  capsolverExtensionPath: process.env.CAPSOLVER_EXTENSION_PATH || '',
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
  headless: process.env.HEADLESS === 'true',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_KEY || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || ''
};

module.exports = config;