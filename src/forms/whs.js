const { fillJobs, fillByQuestion } = require('../dom');
const { firstExisting } = require('../dom');
const selectSelectors = require('../selectors/select');
const textSelectors = require('../selectors/text');

async function fillWHSField(page, selector, patterns, value, type, label) {
  const jobs = [{ type, selector, value }];
  const selectors = type === 'select' ? selectSelectors[selector] : textSelectors[selector];
  const hasPrimary = selectors && await firstExisting(page, selectors);
  await fillJobs(page, jobs, label);
  if (value && !hasPrimary && !await fillByQuestion(page, patterns, value, type)) {
    console.log(`[${label}] FIELD_LABEL_FALLBACK_MISSING ${selector}`);
  }
}

async function fillWhs(page, applicant, label) {
  const whs = applicant.whs;
  await fillWHSField(page, 'previousWhsVisa', ['previous.*working holiday', 'previous.*visa'], whs.previous_whs_visa, 'select', label);
  await fillWHSField(page, 'sufficientFundsHoliday', ['sufficient funds.*holiday'], whs.sufficient_funds_holiday, 'select', label);
  await fillWHSField(page, 'travelDate', ['date you intend to travel'], whs.travel_date, 'text', label);
  await fillWHSField(page, 'beenToNz', ['been to nz before'], whs.been_to_nz, 'select', label);
  await fillWHSField(page, 'beenToNzWhen', ['if yes, when'], whs.been_to_nz_when, 'text', label);
  await fillWHSField(page, 'sufficientFundsOnwardTicket', ['sufficient funds.*outward ticket'], whs.sufficient_funds_onward_ticket, 'select', label);
  await fillWHSField(page, 'meetSchemeRequirements', ['specific requirements'], whs.meet_scheme_requirements, 'select', label);
  await fillWHSField(page, 'lengthOfStay', ['length of stay'], whs.length_of_stay, 'select', label);
}

module.exports = { fillWhs };