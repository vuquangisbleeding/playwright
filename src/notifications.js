const config = require('./config');
const { formatDuration } = require('./timing');

async function sendTelegramMessage(message) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.log('[TELEGRAM] bỏ qua: cần TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID trong .env');
    return false;
  }
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: config.telegramChatId, text: message })
  });
  if (!response.ok) throw new Error(`Telegram trả về HTTP ${response.status}`);
  console.log('[TELEGRAM] đã gửi kết quả');
  return true;
}

function applicantSummary(applicant, account) {
  const name = [applicant.personal?.given_name_1, applicant.personal?.family_name].filter(Boolean).join(' ') || '(chưa có tên)';
  return `Tên: ${name}\nEmail hồ sơ: ${account.email}\nTài khoản: ${account.username}\nHộ chiếu: ${applicant.identification?.passport_number || '(trống)'}`;
}

function buildTelegramSummary(results, totalRuntime) {
  const captchaRuntime = results.reduce((total, result) => total + result.captchaMs, 0);
  const lines = ['KẾT QUẢ RUNNER INZ', `Thời gian chạy: ${formatDuration(totalRuntime)} (${totalRuntime} ms)`,
    `Tổng thời gian giải CAPTCHA: ${formatDuration(captchaRuntime)} (${captchaRuntime} ms)`, ''];
  for (const result of results) {
    lines.push(`[${result.status}] ${result.label}`, `Thời gian account: ${formatDuration(result.runtimeMs)} (${result.runtimeMs} ms)`,
      `Thời gian CAPTCHA: ${formatDuration(result.captchaMs)} (${result.captchaMs} ms)`, result.applicantInfo, '');
  }
  return lines.join('\n').trim();
}

module.exports = { sendTelegramMessage, applicantSummary, buildTelegramSummary };