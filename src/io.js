const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');

function readJson(fileName) {
  return fs.readFile(path.join(config.root, fileName), 'utf8').then(JSON.parse);
}

async function readCapSolverApiKey(extensionPath) {
  const file = path.join(extensionPath, 'assets', 'config.js');
  const source = await fs.readFile(file, 'utf8');
  const match = source.match(/apiKey\s*:\s*(['"])(.*?)\1/);
  const apiKey = match?.[2]?.trim() || '';
  if (!apiKey) throw new Error(`CapSolver API key chưa được cấu hình trong ${file}`);
  return apiKey;
}

module.exports = { fs, path, readJson, readCapSolverApiKey };