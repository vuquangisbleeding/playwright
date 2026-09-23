const { fs, path } = require('./io');
const config = require('./config');
const { format } = require('node:util');

const state = { file: '', sequence: 0, queue: Promise.resolve(), timestamp: '', files: new Map(), queues: new Map() };

async function initializeLogger() {
  await fs.mkdir(config.logRoot, { recursive: true });
  state.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  state.file = path.join(config.logRoot, `run-${state.timestamp}.log`);
  await fs.writeFile(state.file, '');
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const write = (original, values) => {
    const line = `[${String(++state.sequence).padStart(4, '0')}] [${new Date().toISOString()}] ${format(...values)}\n`;
    original(line.trimEnd());
    state.queue = state.queue.then(() => fs.appendFile(state.file, line));
    const match = line.match(/\[account (\d+)(?:: [^\]]+)?\]/);
    if (match) writeAccountLog(Number(match[1]) - 1, line);
  };
  console.log = (...values) => write(originalLog, values);
  console.error = (...values) => write(originalError, values);
  console.log(`LOG_FILE ${state.file}`);
}

async function initializeAccountLogger(index, username) {
  if (state.files.has(index)) return state.files.get(index);
  const safeName = String(username).replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(config.logRoot, `run-${state.timestamp}-account-${index + 1}-${safeName}.log`);
  await fs.writeFile(file, '');
  state.files.set(index, file);
  state.queues.set(index, Promise.resolve());
  return file;
}

function writeAccountLog(index, line) {
  const file = state.files.get(index);
  if (!file) return;
  const next = (state.queues.get(index) || Promise.resolve()).then(() => fs.appendFile(file, line));
  state.queues.set(index, next.catch(() => {}));
}

function accountLogFile(index) { return state.files.get(index); }

module.exports = { initializeLogger, initializeAccountLogger, accountLogFile, state };