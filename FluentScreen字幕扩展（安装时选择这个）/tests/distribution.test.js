const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const installer = fs.readFileSync(path.join(root, 'mac-helper', 'install-native-host.sh'), 'utf8');

assert.ok(manifest.key, 'manifest.json must contain a public key so unpacked installs keep one stable extension ID');

const der = Buffer.from(manifest.key, 'base64');
const digest = crypto.createHash('sha256').update(der).digest().subarray(0, 16);
const extensionId = [...digest]
  .map((byte) => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
  .join('');

assert.match(installer, new RegExp(`chrome-extension://${extensionId}/`), 'native host must allow the stable extension ID derived from manifest.key');
assert.ok(!installer.includes('fccplfommkbncbalnomdgimhmlkomfob'), 'installer must not depend on the old path-derived development ID');

console.log(`distribution identity test passed: ${extensionId}`);
