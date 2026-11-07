const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const shared = fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8");
const content = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const location = { href: "https://www.kubb.tv/play/show?id=episode-4", hostname: "www.kubb.tv", pathname: "/play/show" };
let listener;
const adVideo = { currentTime: 0, textTracks: [], getBoundingClientRect() { return { x: 0, y: 0, width: 1, height: 1 }; } };
const video = { currentTime: 576, textTracks: [], getBoundingClientRect() { return { x: 100, y: 50, width: 900, height: 500 }; } };
const falseSubtitle = { textContent: "80", getBoundingClientRect() { return { width: 40, height: 20 }; } };
const context = vm.createContext({
  URL, location, fetch: async () => { throw new Error("unexpected fetch"); }, setTimeout,
  innerWidth: 1400, innerHeight: 900,
  setInterval() {}, Date,
  getComputedStyle() { return { display: "block", visibility: "visible" }; },
  document: {
    documentElement: {}, title: "节目标题",
    querySelector(selector) { return selector === "video" ? adVideo : null; },
    querySelectorAll(selector) { if (selector === "video") return [adVideo, video]; if (String(selector).includes("subtitle")) return [falseSubtitle]; return []; },
    createElement() { return {}; }, body: { append() {} }
  },
  MutationObserver: class { observe() {} },
  chrome: {
    storage: { local: { get(_keys, callback) { callback({}); }, set() {} } },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } }
  }
});
vm.runInContext(shared, context);
vm.runInContext(content, context);

let state;
listener({ type: "GET_FLUENTSCREEN_STATE" }, {}, (value) => { state = value; });
assert.equal(state.platform, "Kubb");
assert.equal(state.videoId, "kubb:episode-4");
assert.equal(state.subtitleStatus, "none");
assert.equal(state.videoRect.width, 900);
assert.equal(state.currentTime, 576, "the largest visible main player must be selected instead of an ad video");
assert.equal(vm.runInContext("visibleCaption()", context), "", "Kubb hard subtitles must not be confused with generic page text");
console.log("PASS kubb content state identifies episode and requests OCR fallback");
