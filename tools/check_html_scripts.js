const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'web');
const explicit = process.argv.slice(2);
const files = explicit.length
  ? explicit.map((name) => path.resolve(root, name))
  : fs.readdirSync(webDir)
      .filter((name) => name.toLowerCase().endsWith('.html'))
      .sort()
      .map((name) => path.join(webDir, name));

if (!files.length) {
  throw new Error('No HTML files found to validate.');
}

let totalBlocks = 0;
let parsedBlocks = 0;
let externalBlocks = 0;

for (const filename of files) {
  if (!fs.existsSync(filename)) throw new Error(`Missing HTML file: ${filename}`);
  const html = fs.readFileSync(filename, 'utf8');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  let parsed = 0;
  while ((match = pattern.exec(html))) {
    index += 1;
    totalBlocks += 1;
    const attrs = match[1] || '';
    const source = match[2] || '';
    if (/\bsrc\s*=\s*["'][^"']+["']/i.test(attrs)) {
      externalBlocks += 1;
      continue;
    }
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase() || '';
    if (type === 'module') {
      throw new Error(`${path.relative(root, filename)}#script-${index}: module scripts require an explicit module-aware validator; refusing to skip syntax validation.`);
    }
    if (type && !['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(type)) {
      continue;
    }
    if (!source.trim()) continue;
    new vm.Script(source, { filename: `${path.relative(root, filename)}#script-${index}` });
    parsed += 1;
    parsedBlocks += 1;
  }
  process.stdout.write(`OK ${path.relative(root, filename)} (${index} script blocks, ${parsed} inline JS parsed)\n`);
}

process.stdout.write(`HTML script validation passed: ${files.length} HTML files, ${totalBlocks} script blocks, ${parsedBlocks} inline JS blocks parsed, ${externalBlocks} external script tags skipped as files.\n`);
