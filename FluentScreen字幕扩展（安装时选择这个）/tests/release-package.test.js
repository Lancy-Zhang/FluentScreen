const assert = require('assert');
const fs = require('fs');
const path = require('path');

const project = path.resolve(__dirname, '..', '..');
const requiredFiles = [
  'README.md',
  'README.zh-CN.md',
  'PORTFOLIO.md',
  'docs/INSTALL.md',
  'docs/INSTALL.zh-CN.md',
  'packaging/Installer.applescript',
  'packaging/build-dmg.sh'
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(project, file)), `missing release file: ${file}`);
}

const installer = fs.readFileSync(path.join(project, 'packaging', 'Installer.applescript'), 'utf8');
assert.match(installer, /Application Support\/FluentScreen/, 'installer must use a stable per-user install location');
assert.match(installer, /chrome:\/\/extensions/, 'installer must open Chrome extensions for the one required manual step');
assert.match(installer, /FluentScreen Vision\.app/, 'installer must install the local OCR companion');

const build = fs.readFileSync(path.join(project, 'packaging', 'build-dmg.sh'), 'utf8');
assert.match(build, /hdiutil create/, 'build script must create a DMG');
assert.match(build, /FluentScreen-1\.5\.0-macOS\.dmg/, 'DMG must include the current release version');
assert.match(build, /mac-helper\/build\.sh/, 'release build must compile FluentScreen Vision from public source');

const readme = fs.readFileSync(path.join(project, 'README.md'), 'utf8');
assert.match(readme, /Chrome extension/i, 'README must explain the browser component');
assert.match(readme, /Apple Vision/i, 'README must explain the macOS OCR component');
assert.match(readme, /Privacy/i, 'README must document privacy behavior');

console.log('release package structure test passed');
