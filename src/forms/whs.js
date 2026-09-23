const { fillJobs } = require('../dom');

async function fillWhs(page, applicant, label) {
  const whs = applicant.whs;
  await fillJobs(page, [
    { type: 'select', selector: 'previousWhsVisa', value: whs.previous_whs_visa },
    { type: 'select', selector: 'sufficientFundsHoliday', value: whs.sufficient_funds_holiday },
    { selector: 'travelDate', value: whs.travel_date }, { type: 'select', selector: 'beenToNz', value: whs.been_to_nz },
    { selector: 'beenToNzWhen', value: whs.been_to_nz_when },
    { type: 'select', selector: 'sufficientFundsOnwardTicket', value: whs.sufficient_funds_onward_ticket },
    { type: 'select', selector: 'meetSchemeRequirements', value: whs.meet_scheme_requirements },
    { type: 'select', selector: 'lengthOfStay', value: whs.length_of_stay }
  ], label);
}

module.exports = { fillWhs };