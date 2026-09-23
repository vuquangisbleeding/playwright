const config = require('./config');
const { path, readJson } = require('./io');
const { initializeLogger, initializeAccountLogger, state } = require('./logger');
const { launchBrowser, syncCapSolverApiKey } = require('./browser');
const { runApplicant } = require('./account');
const { sendTelegramMessage, buildTelegramSummary, applicantSummary } = require('./notifications');
const { formatDuration } = require('./timing');
const { captchaStats } = require('./captcha');

function validateAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('emails.json phải chứa ít nhất một tài khoản');
  if (accounts.some(account => !account || typeof account !== 'object' || typeof account.username !== 'string' || !account.username.trim() || typeof account.email !== 'string' || !account.email.trim() || typeof account.password !== 'string' || !account.password)) throw new Error('Mỗi phần tử trong emails.json phải có username, password và email');
}

async function runAccount(baseApplicant, account, index, args, extensionPath) {
  const accountStartedAt = Date.now();
  let browser;
  try {
    await initializeAccountLogger(index, account.username); browser = await launchBrowser(args, index);
    if (extensionPath) await syncCapSolverApiKey(browser, path.resolve(config.root, extensionPath));
    const result = await runApplicant(browser, baseApplicant, account, index);
    result.runtimeMs = Date.now() - accountStartedAt;
    await sendTelegramMessage(buildTelegramSummary([result], result.runtimeMs)).catch(error => console.error(`[TELEGRAM] ${result.label} lỗi gửi: ${error.message}`));
    return result;
  } catch (error) {
    await browser?.close().catch(() => {}); await initializeAccountLogger(index, account.username);
    const runtimeMs = Date.now() - accountStartedAt;
    const result = { label: `account ${index + 1}: ${account.username}`, status: `ERROR: ${error.message}`, runtimeMs, captchaMs: 0, applicantInfo: applicantSummary(baseApplicant, account) };
    await sendTelegramMessage(buildTelegramSummary([result], runtimeMs)).catch(telegramError => console.error(`[TELEGRAM] ${result.label} lỗi gửi: ${telegramError.message}`));
    return result;
  }
}

async function main() {
  await initializeLogger();
  if (!config.loginUrl) throw new Error('Cần cấu hình LOGIN_URL trong file .env');
  const [baseApplicant, accounts] = await Promise.all([readJson('applicant.json'), readJson('emails.json')]); validateAccounts(accounts);
  const extensionPath = config.capsolverExtensionPath; const args = ['--start-maximized', '--lang=en-US'];
  if (extensionPath) { const resolved = path.resolve(config.root, extensionPath); args.push(`--disable-extensions-except=${resolved}`, `--load-extension=${resolved}`); }
  console.log(`Chuẩn bị chạy ${accounts.length} Chrome profile độc lập.`);
  const startedAt = Date.now(); await Promise.all(accounts.map((account, index) => runAccount(baseApplicant, account, index, args, extensionPath)));
  const runtime = Date.now() - startedAt;
  console.log(`[SUMMARY] RUN_FINISHED total_runtime=${formatDuration(runtime)} total_runtime_ms=${runtime} captcha_count=${captchaStats.count} captcha_total=${formatDuration(captchaStats.totalMs)} captcha_total_ms=${captchaStats.totalMs}`);
  console.log(`LOG_FILE ${state.file}`);
}

module.exports = { main };