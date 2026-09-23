const selectSelectors = require('../selectors/select');
const { fillJobs, selectValue } = require('../dom');

async function fillHealth(page, applicant, label) {
  const health = applicant.health;
  await fillJobs(page, [
    { type: 'select', selector: 'renalDialysis', value: health.renal_dialysis }, { type: 'select', selector: 'activeTb', value: health.active_tb },
    { type: 'select', selector: 'cancer', value: health.cancer }, { type: 'select', selector: 'heartDisease', value: health.heart_disease },
    { type: 'select', selector: 'disability', value: health.disability }, { type: 'select', selector: 'hospitalisation', value: health.hospitalisation },
    { type: 'select', selector: 'residentialCare', value: health.residential_care }, { type: 'select', selector: 'pregnancy', value: health.pregnancy },
    { type: 'select', selector: 'tbRisk', value: health.tb_risk }, { selector: 'medicalDetails', value: health.medical_details }
  ], label);
}

async function selectCharacterAnswer(page, questionPattern, value) {
  if (value === undefined || value === null || value === '') return false;
  return page.evaluate(({ pattern, wanted }) => {
    const question = new RegExp(pattern, 'i');
    const candidates = [...document.querySelectorAll('select')].map(select => {
      let node = select; let score = Infinity;
      for (let level = 0; level < 6 && node; level += 1, node = node.parentElement) {
        const length = (node.innerText || '').trim().length;
        if (question.test(node.innerText || '')) score = Math.min(score, length);
      }
      return { select, score };
    }).filter(item => Number.isFinite(item.score)).sort((left, right) => left.score - right.score);
    const target = candidates[0]?.select;
    if (!target) return false;
    const normalized = String(wanted).trim().toLowerCase();
    const option = [...target.options].find(item => item.value.trim().toLowerCase() === normalized || item.text.trim().toLowerCase() === normalized);
    if (!option) return false;
    target.value = option.value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { pattern: questionPattern, wanted: String(value) });
}

async function fillCharacter(page, applicant, label) {
  const character = applicant.character;
  const fields = [['5 years', character.imprisonment_5_years, 'imprisonment5Years'], ['12 months', character.imprisonment_12_months, 'imprisonment12Months'],
    ['deported', character.deported, 'deported'], ['removal order', character.removal_order || 'No', 'removalOrder'],
    ['charged', character.charged, 'charged'], ['convicted', character.convicted, 'convicted'], ['under investigation', character.under_investigation, 'underInvestigation'],
    ['excluded', character.excluded, 'excluded'], ['removed', character.removed, 'removed']];
  for (const [question, value, name] of fields) {
    const matched = await selectCharacterAnswer(page, question, value) || await selectValue(page, selectSelectors[name], value);
    console.log(`[${label}] ${matched ? 'FIELD_SET' : 'FIELD_SKIP_MISSING'} ${name}`);
  }
  await fillJobs(page, [{ selector: 'characterDetails', value: character.details }], label);
}

module.exports = { fillHealth, fillCharacter };