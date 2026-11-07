const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const shared = fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8");
const location = { href: "https://www.bilibili.com/video/BVOLD", hostname: "www.bilibili.com", pathname: "/video/BVOLD" };

function response(data) { return { json: async () => data }; }
async function fetch(url) {
  if (url.includes("pagelist")) {
    const old = url.includes("BVOLD");
    return response({ data: [{ cid: old ? 1 : 2 }] });
  }
  if (url.includes("player/v2")) {
    const old = url.includes("BVOLD");
    await new Promise((resolve) => setTimeout(resolve, old ? 40 : 5));
    return response({ data: { subtitle: { subtitles: [{ lan: "zh-CN", lan_doc: "中文", subtitle_url: old ? "https://subtitle/old" : "https://subtitle/new" }] } } });
  }
  if (url.includes("subtitle/old")) return response({ body: [{ from: 0, to: 2, content: "旧视频台词" }] });
  if (url.includes("subtitle/new")) return response({ body: [{ from: 0, to: 2, content: "当前视频台词" }] });
  throw new Error(`unexpected URL: ${url}`);
}

const context = vm.createContext({
  URL, location, fetch, setTimeout,
  setInterval() {},
  getComputedStyle() { return { display: "block", visibility: "visible" }; },
  document: { documentElement: {}, querySelector() { return null; }, querySelectorAll() { return []; } },
  MutationObserver: class { observe() {} },
  chrome: { runtime: { onMessage: { addListener() {} } } }
});
vm.runInContext(shared, context);
vm.runInContext(source, context);

vm.runInContext("resetForVideo()", context);
location.href = "https://www.bilibili.com/video/BVNEW";
location.pathname = "/video/BVNEW";
vm.runInContext("resetForVideo()", context);

setTimeout(() => {
  const texts = vm.runInContext("cues.map((cue) => cue.text)", context);
  assert.deepEqual([...texts], ["当前视频台词"], "a late response from the previous BVID must not overwrite the current video");
  console.log("PASS stale subtitle response is ignored");
}, 80);
