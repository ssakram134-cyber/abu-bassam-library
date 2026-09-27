'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const outDir = path.join(__dirname, 'build');
const iconSource = path.join(__dirname, '..', 'web', 'abu_bassam_icon.webp');
const themeSource = path.join(__dirname, '..', 'web', 'abu_bassam_theme.jpg');

function bmpFromRgb(width, height, rgb) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const out = Buffer.alloc(54 + pixelSize);
  out.write('BM', 0, 2, 'ascii'); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14); out.writeInt32LE(width, 18); out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = (srcY * width + x) * 3;
      const dst = 54 + y * rowSize + x * 3;
      out[dst] = rgb[src + 2]; out[dst + 1] = rgb[src + 1]; out[dst + 2] = rgb[src];
    }
  }
  return out;
}
async function makeBmp(input, width, height, output) {
  const { data } = await sharp(input).resize(width, height, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  fs.writeFileSync(output, bmpFromRgb(width, height, data));
}
async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const png = path.join(outDir, 'icon.png');
  await sharp(iconSource).resize(256, 256, { fit: 'cover' }).png().toFile(png);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), await pngToIco(png));
  await makeBmp(themeSource, 164, 314, path.join(outDir, 'wizard.bmp'));
  await makeBmp(iconSource, 55, 55, path.join(outDir, 'wizard-small.bmp'));
  console.log('Windows branding assets prepared.');
}
run().catch(error => { console.error(error); process.exit(1); });
