const puppeteer = require('puppeteer');
const config = require('./config');
const { fs, path, readCapSolverApiKey } = require('./io');

async function launchBrowser(args, index) {
  const profilePath = path.join(config.profileRoot, `account-${index + 1}`);
  await fs.mkdir(profilePath, { recursive: true });
  console.log(`[account ${index + 1}] Chrome profile: ${profilePath}`);
  return puppeteer.launch({ headless: config.headless, executablePath: config.chromeExecutablePath, userDataDir: profilePath, args, defaultViewport: null });
}

async function syncCapSolverApiKey(browser, extensionPath) {
  const apiKey = await readCapSolverApiKey(extensionPath);
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${config.capsolverExtensionId}/www/index.html#/popup`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async key => {
      const current = await chrome.storage.local.get('config');
      await chrome.storage.local.set({ config: { ...(current.config || {}), apiKey: key, manualSolving: false } });
    }, apiKey);
    console.log('CapSolver API key đã đồng bộ vào extension storage');
  } finally { await page.close(); }
}

async function getSinglePage(browser) {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await Promise.all(pages.slice(1).map(extraPage => extraPage.close().catch(() => {})));
  return page;
}

module.exports = { launchBrowser, syncCapSolverApiKey, getSinglePage };