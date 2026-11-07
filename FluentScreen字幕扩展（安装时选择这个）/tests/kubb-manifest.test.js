const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const matches = manifest.content_scripts.flatMap((script) => script.matches || []);
assert.ok(matches.includes("https://www.kubb.tv/*"), "content script must run on www.kubb.tv");
assert.ok(matches.includes("https://kubb.tv/*"), "content script must run on kubb.tv");
console.log("PASS kubb content-script registration");
