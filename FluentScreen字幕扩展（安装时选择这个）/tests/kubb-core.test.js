const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const corePath = path.join(__dirname, "..", "shared.js");
assert.ok(fs.existsSync(corePath), "shared kubb support module must exist");
const core = require(corePath);

const descriptor = core.describeVideo("https://www.kubb.tv/play/iDX0SrHhDrC?id=8tiLD3qVGi5");
assert.equal(descriptor.platform, "Kubb");
assert.equal(descriptor.id, "8tiLD3qVGi5");
assert.equal(descriptor.key, "kubb:8tiLD3qVGi5");
assert.equal(core.shouldAutoOcr({ platform: "Kubb", subtitleStatus: "none", captionsVisible: false }), true);
assert.equal(core.shouldAutoOcr({ platform: "Kubb", subtitleStatus: "none", captionsVisible: true }), true, "cached OCR cues must not disable continued OCR");
assert.equal(core.shouldAutoOcr({ platform: "Kubb", subtitleStatus: "ready", captionsVisible: true }), false, "a real native subtitle track disables OCR");
assert.equal(typeof core.stabilizeOcr, "function", "OCR stability filter must exist");
const firstRead = core.stabilizeOcr(null, "我们现在就出发", 82);
assert.equal(firstRead.commit, true, "one valid Apple Vision frame must appear immediately");
const secondRead = core.stabilizeOcr(firstRead, "我们现在就出发", 84);
assert.equal(secondRead.commit, true, "repeated frames remain accepted for deduplication");
assert.equal(core.stabilizeOcr(null, "人物姓名", 40).commit, false, "low-confidence text is rejected");
assert.equal(core.isLikelyDialogue("必须得盘俩核桃"), true, "spoken Chinese must be retained");
assert.equal(core.isLikelyDialogue("清晰度"), false, "player controls must not become dialogue");
assert.equal(core.isLikelyDialogue("013028选集英英梁576P你4E"), false, "mixed OCR garbage must be rejected");

const records = Array.from({ length: 34 }, (_, index) => ({ id: `episode-${index}`, updatedAt: index, favorite: index === 0 }));
const pruned = core.pruneEpisodeRecords(records, 30);
assert.equal(pruned.length, 31, "30 recent episodes plus favorites are retained");
assert.ok(pruned.some((item) => item.id === "episode-0"), "favorites are never auto-deleted");
assert.ok(!pruned.some((item) => item.id === "episode-1"), "oldest non-favorites are removed first");

console.log("PASS kubb platform, auto OCR and episode retention rules");
