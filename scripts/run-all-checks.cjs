'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Run every existing checker independently: a failing check must not conceal
// additional failures during a source-only audit. No build or source mutation.
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const listed = String(pkg.scripts?.['check:web'] || '').split(/\s*&&\s*/).filter(Boolean);
if (!listed.length) throw new Error('No check:web commands to audit');
const seen = new Set();
const failures = [];
let passed = 0;
let checked = 0;
for (const command of listed) {
  const match = /^node (tools\/check_[A-Za-z0-9_-]+\.js)$/.exec(command);
  if (!match) { failures.push({ command, reason: 'Unrecognized check command' }); continue; }
  const relative = match[1];
  if (seen.has(relative)) { failures.push({ command, reason: 'Duplicate check' }); continue; }
  seen.add(relative);
  if (!fs.existsSync(path.join(root, relative))) { failures.push({ command, reason: 'Missing check file' }); continue; }
  checked++;
  const started = Date.now();
  const result = spawnSync(process.execPath, [relative], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
    env: { ...process.env, CI: '1' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0 && !result.error) {
    passed++;
    console.log(`PASS ${relative} (${seconds}s)`);
  } else {
    const details = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    failures.push({ command, reason: (details || `exit ${result.status}`).slice(-12000) });
    console.error(`FAIL ${relative} (${seconds}s)`);
  }
}
if (!seen.has('tools/check_node_script_syntax.js')) failures.push({ command: 'check:web', reason: 'Syntax gate not present' });
console.log(`\nAUDIT SUMMARY: ${passed}/${checked} checkers passed; ${failures.length} errors; no APK build attempted.`);
for (const [i, failure] of failures.entries()) {
  console.error(`\n--- ERROR ${i + 1}/${failures.length}: ${failure.command} ---\n${failure.reason}`);
}
if (failures.length) process.exitCode = 1;
