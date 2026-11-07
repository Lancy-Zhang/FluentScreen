const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "panel.html"), "utf8");

assert.match(panel, /kubb\\\.tv/, "side panel must accept kubb.tv tabs");
assert.match(panel, /shouldAutoOcr/, "Kubb pages must trigger automatic OCR fallback");
assert.match(panel, /stabilizeOcr/, "OCR output must pass the dialogue filter");
assert.doesNotMatch(panel, /连续稳定后收录/, "Apple Vision results must not wait for a second matching frame");
assert.match(panel, /setTimeout\(captureHardSubtitle, 250\)/, "the next frame should be checked quickly for smooth subtitles");
assert.match(panel, /episodeRecords/, "recognized episode lines must be cached locally");
assert.match(panel, /episodeRecordsV3/, "the Apple Vision release must not restore polluted legacy OCR cache");
assert.match(panel, /请在视频画面上拖动/, "region adjustment must give immediate visible guidance");
assert.match(html, /adjustRegion/, "the panel must expose subtitle-region adjustment");
assert.match(html, /favoriteEpisode/, "the panel must allow permanent episode retention");
assert.match(panel, /translations\.get\(cue\.text\)/, "a rebuilt subtitle card must reuse its finished translation");
assert.match(panel, /queueCueTranslation/, "newly recognized lines must begin translating without waiting to become active");
assert.match(panel, /ENSURE_VISION/, "the panel must ask Chrome to start the local helper automatically");
console.log("PASS kubb automatic OCR, cache and controls are wired into the panel");
