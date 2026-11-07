const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const panel = fs.readFileSync(path.join(root, "panel.js"), "utf8");
const html = fs.readFileSync(path.join(root, "panel.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const nativeSource = fs.readFileSync(path.join(root, "mac-helper", "Sources", "main.m"), "utf8");
const build = fs.readFileSync(path.join(root, "mac-helper", "build.sh"), "utf8");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const installer = fs.readFileSync(path.join(root, "mac-helper", "install-native-host.sh"), "utf8");

assert.ok(manifest.host_permissions.includes("http://127.0.0.1/*"), "extension must be permitted to call the local helper");
assert.match(panel, /127\.0\.0\.1:8765/, "panel must use the local Apple Vision helper");
assert.match(panel, /VISION_URL}\/?ocr|VISION_URL}\/ocr/, "panel must call the OCR route");
assert.match(panel, /visionHealth/, "panel must check helper availability before OCR starts");
assert.match(panel, /engine:\s*"apple-vision"/, "recognized cues must be labelled with their real engine");
assert.match(html, /Apple Vision/, "panel must tell the user which OCR engine is active");
assert.match(nativeSource, /VNRecognizeTextRequest/, "helper must use Apple Vision text recognition");
assert.match(nativeSource, /recognitionLanguages\s*=\s*@\[@"zh-Hans"\]/, "helper must prefer Simplified Chinese recognition");
assert.match(nativeSource, /127\.0\.0\.1/, "helper must only listen on the local machine");
assert.match(build, /FluentScreen Vision\.app/, "build must produce a double-clickable Mac app");
assert.ok(manifest.permissions.includes("nativeMessaging"), "extension must be allowed to launch its local helper");
assert.match(background, /connectNative\(["']local\.fluentscreen\.vision["']\)/, "opening FluentScreen must launch the native helper");
assert.match(nativeSource, /chrome-extension:\/\//, "helper must detect Chrome native-messaging mode");
assert.match(nativeSource, /NativeMessagingLoop/, "native helper must stay alive while Chrome is using it");
assert.match(installer, /NativeMessagingHosts/, "installer must register the helper with Chrome");

console.log("PASS Apple Vision helper and extension protocol are wired together");
