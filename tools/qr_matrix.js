#!/usr/bin/env node
'use strict';

const qrcode = require('../web/qrcode.js');
if (!qrcode.stringToBytesFuncs || !qrcode.stringToBytesFuncs['UTF-8']) throw new Error('QR UTF-8 encoder is unavailable.');
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const MAX_PAYLOAD_BYTES = 1000;
const VALID_LEVELS = new Set(['L', 'M', 'Q', 'H']);
const payload = String(process.argv[2] || '');
const level = String(process.argv[3] || 'M').toUpperCase();

if (!payload) throw new Error('QR payload must not be empty.');
if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) throw new Error(`QR payload exceeds ${MAX_PAYLOAD_BYTES} UTF-8 bytes.`);
if (!VALID_LEVELS.has(level)) throw new Error('QR error-correction level must be one of L, M, Q, H.');

const qr = qrcode(0, level);
qr.addData(payload, 'Byte');
qr.make();

const count = qr.getModuleCount();
if (!Number.isInteger(count) || count <= 0 || count > 177) throw new Error('QR generator returned an invalid module count.');

const rows = [];
for (let row = 0; row < count; row += 1) {
  let line = '';
  for (let col = 0; col < count; col += 1) {
    line += qr.isDark(row, col) ? '1' : '0';
  }
  rows.push(line);
}
process.stdout.write(JSON.stringify({ count, rows }));
