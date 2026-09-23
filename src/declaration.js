async function fillDeclaration(page, applicant, label) {
  const config = applicant.declaration || { all_yes: true };
  const checked = await page.evaluate(settings => {
    if (settings.all_yes !== true) return { count: 0, total: 0, fields: [], roleCount: 0, failed: [] };
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')].filter(input => !input.disabled && !input.closest('iframe, .g-recaptcha, [id*="captcha" i]'));
    const fields = []; const failed = [];
    for (const box of boxes) { if (!box.checked) box.click(); if (box.checked) fields.push(box.id || box.name || 'anonymous-checkbox'); else failed.push(box.id || box.name || 'anonymous-checkbox'); }
    const roles = [...document.querySelectorAll('[role="checkbox"]')].filter(box => !box.closest('iframe, .g-recaptcha, [id*="captcha" i]') && box.getAttribute('aria-checked') !== 'true');
    for (const box of roles) { box.click(); box.setAttribute('aria-checked', 'true'); }
    return { count: fields.length + roles.length, total: boxes.length + roles.length, fields, roleCount: roles.length, failed };
  }, config);
  console.log(`[${label}] FILL_DECLARATION ${checked.count}/${checked.total} fields=${checked.fields.join(',')} roleCheckboxes=${checked.roleCount} failed=${checked.failed.join(',') || 'none'}`);
  if (checked.total === 0 || checked.count !== checked.total || checked.failed.length > 0) throw new Error(`Declaration chưa tick đủ Yes: ${checked.count}/${checked.total}`);
  return checked;
}

module.exports = { fillDeclaration };