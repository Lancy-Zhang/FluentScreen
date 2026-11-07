const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const shared = fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8");
const location = {
  href: "https://www.bilibili.com/video/BVSHOW?p=1",
  hostname: "www.bilibili.com",
  pathname: "/video/BVSHOW"
};
const playerRequests = [];

function response(data) { return { json: async () => data }; }
async function fetch(url) {
  if (url.includes("pagelist")) {
    return response({ data: [{ cid: 101, page: 1 }, { cid: 202, page: 2 }] });
  }
  if (url.includes("player/v2")) {
    playerRequests.push(url);
    const cid = new URL(url).searchParams.get("cid");
    return response({ data: { subtitle: { subtitles: [{ lan: "zh-CN", lan_doc: "中文", subtitle_url: `https://subtitle/${cid}` }] } } });
  }
  if (url.includes("subtitle/101")) return response({ body: [{ from: 0, to: 2, content: "第一集台词" }] });
  if (url.includes("subtitle/202")) return response({ body: [{ from: 0, to: 2, content: "第二集台词" }] });
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

async function settle() { await new Promise((resolve) => setTimeout(resolve, 10)); }

(async () => {
  vm.runInContext("resetForVideo()", context);
  await settle();
  assert.deepEqual([...vm.runInContext("cues.map((cue) => cue.text)", context)], ["第一集台词"]);

  location.href = "https://www.bilibili.com/video/BVSHOW?p=2";
  vm.runInContext("resetForVideo()", context);
  await settle();

  assert.ok(playerRequests.some((url) => url.includes("cid=202")), "switching to p=2 must request the second CID");
  assert.deepEqual([...vm.runInContext("cues.map((cue) => cue.text)", context)], ["第二集台词"]);
  console.log("PASS Bilibili multipart selection follows the current p parameter");
})().catch((error) => { console.error(error); process.exitCode = 1; });
