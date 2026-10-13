'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Parse every authored Node tool before lengthy runtime checks or a Gradle build.
// Check .js/.cjs as CommonJS explicitly: Node 22+ syntax detection can otherwise
// misinterpret a CommonJS file containing `const exports` as an ES module.
const root = path.resolve(__dirname, '..');
const scriptDirs = ['tools', 'scripts'];
const extensions = new Set(['.js', '.cjs', '.mjs']);
const skippedDirs = new Set(['node_modules', '.git', 'dist', 'android', 'ios']);
const files = [];

function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) collect(absolute);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolute);
    }
  }
}

for (const name of scriptDirs) collect(path.join(root, name));
if (!files.length) {
  console.error('Node script syntax check failed: no scripts found under tools/ or scripts/.');
  process.exit(1);
}
files.sort();

const failures = [];
for (const file of files) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const isModule = path.extname(file).toLowerCase() === '.mjs';
  const result = spawnSync(process.execPath, ['--check', `--input-type=${isModule ? 'module' : 'commonjs'}`], {
    input: fs.readFileSync(file, 'utf8'), cwd: root, encoding: 'utf8',
    timeout: 20000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const details = String(result.error?.message || result.stderr || result.stdout || `exit ${result.status}`).trim();
    failures.push({ relative, details });
  }
}

if (failures.length) {
  for (const { relative, details } of failures) console.error(`NODE SYNTAX FAIL: ${relative}\n${details}\n`);
  console.error(`Node script syntax failed: ${failures.length}/${files.length} scripts. Fix all before building an APK.`);
  process.exit(1);
}
console.log(`Node script syntax passed: ${files.length} .js/.cjs/.mjs files across tools/ and scripts/ (no execution).`);
