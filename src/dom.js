const textSelectors = require('./selectors/text');
const selectSelectors = require('./selectors/select');

async function firstExisting(page, selectors) {
  for (const selector of selectors) if (await page.$(selector)) return selector;
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
    const option = [...select.options].find(item => item.value.trim().toLowerCase() === normalized || item.text.trim().toLowerCase() === normalized);
    return option ? option.value : null;
  }, String(value));
  if (optionValue === null) throw new Error(`Không tìm thấy option "${value}" cho ${selector}`);
  await page.select(selector, optionValue);
  const selected = await page.$eval(selector, select => select.options[select.selectedIndex]?.text?.trim() || '');
  if (selected.toLowerCase() !== String(value).trim().toLowerCase()) throw new Error(`Không chọn được option "${value}" cho ${selector}, thực tế: "${selected}"`);
  return true;
}

async function fillJobs(page, jobs, label) {
  for (const job of jobs) {
    const selectors = job.type === 'select' ? selectSelectors[job.selector] : textSelectors[job.selector];
    if (job.value === undefined || job.value === null || job.value === '') {
      console.log(`[${label}] FIELD_SKIP_EMPTY ${job.selector}`);
      continue;
    }
    const matched = selectors ? await firstExisting(page, selectors) : null;
    if (!matched) {
      console.log(`[${label}] FIELD_SKIP_MISSING ${job.selector}`);
      continue;
    }
    if (job.type === 'select') await selectValue(page, selectors, job.value);
    else await fillText(page, selectors, job.value);
    console.log(`[${label}] FIELD_SET ${job.selector} selector=${matched}`);
  }
  console.log(`[${label}] ${jobs.name || 'FILL'} hoàn tất`);
}
async function fillByQuestion(page, patterns, value, type) {
  if (value === undefined || value === null || value === '') return false;
  return page.evaluate(({ patterns: wanted, nextValue, fieldType }) => {
    const matches = node => wanted.some(pattern => new RegExp(pattern, 'i').test(node.innerText || node.textContent || ''));
    const labels = [...document.querySelectorAll('label, p, td, div, span')].filter(matches);
    for (const label of labels) {
      let row = label;
      for (let level = 0; level < 5 && row; level += 1, row = row.parentElement) {
        const field = row.querySelector(fieldType === 'select' ? 'select' : 'input:not([type="hidden"]),textarea');
        if (!field) continue;
        if (fieldType === 'select') {
          const normalized = String(nextValue).trim().toLowerCase();
          const option = [...field.options].find(item => item.value.trim().toLowerCase() === normalized || item.text.trim().toLowerCase() === normalized);
          if (!option) return false;
          field.value = option.value;
        } else field.value = String(nextValue);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, { patterns, nextValue: value, fieldType: type });
}

async function dumpUnknown(page, label) {
  const fields = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')]
    .filter(element => element.type !== 'hidden').slice(0, 40)
    .map(element => `${element.tagName}#${element.id || ''}[name=${element.name || ''}]`));
  console.log(`[${label}] UNKNOWN_FIELDS ${fields.join(', ')}`);
}

module.exports = { firstExisting, firstVisible, fillText, selectValue, fillJobs, fillByQuestion, dumpUnknown };