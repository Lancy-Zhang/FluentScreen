let cues = [];
let lastVideoId = "";
let pendingText = "";
let pendingSince = 0;
let lastCommittedText = "";
let biliSubtitleStatus = "idle";
let ocrRegion = { x: 0.22, y: 0.73, width: 0.68, height: 0.22 };

chrome.storage?.local?.get?.(["kubbOcrRegion"], (data) => { if (data?.kubbOcrRegion) ocrRegion = data.kubbOcrRegion; });

function currentVideo() {
  return FluentScreenCore.describeVideo(location.href);
}

function mainVideo() {
  const videos = [...document.querySelectorAll("video")];
  return videos.map((video) => ({ video, rect: video.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width >= 100 && rect.height >= 60)
    .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.video || document.querySelector("video");
}

function resetForVideo() {
  const video = currentVideo();
  if (video.key !== lastVideoId) {
    lastVideoId = video.key; cues = []; pendingText = ""; pendingSince = 0; lastCommittedText = ""; biliSubtitleStatus = video.platform === "Kubb" ? "none" : "idle";
    if (video.platform === "Bilibili") void loadBilibiliSubtitles(video.id, video.page, video.key);
  }
}

async function loadBilibiliSubtitles(bvid, page = 1, requestKey = `${bvid}:p${page}`) {
  if (!bvid?.startsWith("BV") || biliSubtitleStatus === "loading") return;
  biliSubtitleStatus = "loading";
  try {
    const pages = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`, { credentials: "include" }).then((response) => response.json());
    const pageInfo = pages?.data?.find((item) => Number(item.page) === page) || pages?.data?.[page - 1];
    const cid = pageInfo?.cid;
    if (!cid) throw new Error("missing-cid");
    const player = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`, { credentials: "include" }).then((response) => response.json());
    const tracks = player?.data?.subtitle?.subtitles || [];
    const chineseTracks = tracks.filter((track) => /zh|中文/i.test(`${track.lan} ${track.lan_doc}`));
    const pool = chineseTracks.length ? chineseTracks : tracks;
    const loaded = await Promise.all(pool.map(async (track) => {
      if (!track.subtitle_url) return { body: [], score: 0 };
      const url = track.subtitle_url.startsWith("//") ? `https:${track.subtitle_url}` : track.subtitle_url;
      const subtitle = await fetch(url).then((response) => response.json());
      const body = subtitle?.body || [];
      const score = body.reduce((total, item) => total + (isNonSpeechCue(item.content || "") ? 0 : normalize(item.content || "").length), 0);
      return { body, score };
    }));
    const best = loaded.sort((a, b) => b.score - a.score)[0];
    const nextCues = (best?.body || []).map((item, index) => ({ id: `bili-${cid}-${index}`, start: Number(item.from), end: Number(item.to), text: normalize(item.content || "") })).filter((item) => item.text && !isNonSpeechCue(item.text));
    if (requestKey !== lastVideoId) return;
    cues = nextCues;
    biliSubtitleStatus = cues.length ? "ready" : loaded.some((item) => item.body.length) ? "music-only" : "none";
  } catch {
    if (requestKey === lastVideoId) biliSubtitleStatus = "error";
  }
}

function normalize(text) {
  return text.replace(/(?:>\s*){2,}/g, "").replace(/\s+([?!,.])/g, "$1").replace(/\s+/g, " ").trim();
}

function isNonSpeechCue(text) {
  const clean = normalize(text).replace(/[♪♫♬♩~～·•…\s()[\]【】（）]/g, "").toLowerCase();
  return !clean || /^(音乐|纯音乐|背景音乐|music|bgm|掌声|笑声|欢呼声|哭声|叹气声|音效)$/.test(clean);
}

function visibleCaption() {
  const video = mainVideo();
  if (!video) return "";
  const trackText = [...video.textTracks].filter((track) => track.mode === "showing").flatMap((track) => [...(track.activeCues || [])]).map((cue) => cue.text || "").join(" ");
  if (trackText.trim()) return normalize(trackText);
  const platform = currentVideo().platform;
  const selectors = platform === "YouTube"
    ? [".ytp-caption-segment"]
    : platform === "Bilibili"
      ? [".bpx-player-subtitle-panel-text", ".bpx-player-subtitle-item-text", ".bilibili-player-video-subtitle", ".subtitle-item-text"]
      : [];
  for (const selector of selectors) {
    const text = [...document.querySelectorAll(selector)].filter((node) => { const style = getComputedStyle(node); return style.display !== "none" && style.visibility !== "hidden"; }).map((node) => node.textContent || "").join(" ");
    if (text.trim()) return normalize(text);
  }
  return "";
}

function commitCaption(text) {
  const video = mainVideo();
  if (!video || !text || text === lastCommittedText) return;
  const current = Number(video.currentTime.toFixed(2));
  const previous = cues[cues.length - 1];
  const related = previous && current - previous.start < 5 && (text.includes(previous.text) || previous.text.includes(text));
  if (related) {
    previous.text = text.length >= previous.text.length ? text : previous.text;
    previous.end = current + 4;
  } else if (!cues.slice(-6).some((cue) => cue.text === text)) {
    if (previous) previous.end = Math.max(previous.start + 1, current);
    cues.push({ id: `${Date.now()}-${cues.length}`, start: current, end: current + 4, text });
  }
  lastCommittedText = text;
  if (cues.length > 1000) cues = cues.slice(-1000);
}

function readCaption() {
  resetForVideo();
  const platform = currentVideo().platform;
  if (platform === "Bilibili" && biliSubtitleStatus === "ready") return;
  const text = visibleCaption();
  const now = Date.now();
  if (!text) { pendingText = ""; pendingSince = 0; return; }
  if (platform === "Kubb") biliSubtitleStatus = "ready";
  if (text !== pendingText) { pendingText = text; pendingSince = now; return; }
  if (now - pendingSince >= 700) commitCaption(text);
}

const observer = new MutationObserver(readCaption);
observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
setInterval(readCaption, 180);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  resetForVideo();
  const video = mainVideo();
  if (message?.type === "RESTORE_CUES") {
    if (message.videoId === lastVideoId && Array.isArray(message.cues) && !cues.length) cues = message.cues.slice(-1000);
    sendResponse({ ok: true }); return;
  }
  if (message?.type === "ADJUST_OCR_REGION") {
    startRegionPicker(video);
    sendResponse({ ok: true }); return;
  }
  if (message?.type === "ADD_OCR_CUE") {
    const text = normalize(message.text || "");
    if (video && text && !isNonSpeechCue(text)) {
      const current = Number(video.currentTime.toFixed(2));
      const previous = cues[cues.length - 1];
      if (previous?.ocr && (text.includes(previous.text) || previous.text.includes(text)) && current - previous.start < 5) { previous.text = text.length >= previous.text.length ? text : previous.text; previous.end = current + 3; }
      else if (!cues.slice(-5).some((cue) => cue.text === text)) cues.push({ id: `ocr-${Date.now()}`, start: current, end: current + 3, text, ocr: true, engine: message.engine || "unknown" });
    }
    sendResponse({ ok: true }); return;
  }
  if (message?.type !== "GET_FLUENTSCREEN_STATE") return;
  const rect = video?.getBoundingClientRect();
  const descriptor = currentVideo();
  sendResponse({ cues, currentTime: video?.currentTime || 0, title: document.querySelector("h1")?.textContent?.trim() || document.title.replace(" - YouTube", ""), videoId: lastVideoId, captionsVisible: cues.length > 0 || Boolean(visibleCaption()), platform: descriptor.platform, subtitleStatus: biliSubtitleStatus, ocrRegion, videoRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight } : null });
});

function startRegionPicker(video) {
  if (!video) return;
  document.getElementById?.("fluentscreen-region-picker")?.remove?.();
  const rect = video.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.id = "fluentscreen-region-picker";
  overlay.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:2147483647;background:#06291f33;cursor:crosshair;`;
  const hint = document.createElement("div");
  hint.textContent = "拖动框选真正对白字幕区域 · Esc取消";
  hint.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#073f31;color:white;padding:8px 12px;border-radius:8px;font:13px sans-serif;";
  overlay.append(hint); document.body.append(overlay);
  let start = null, box = null;
  const finish = () => { overlay.remove(); };
  const keyHandler = (event) => { if (event.key === "Escape") { finish(); removeEventListener("keydown", keyHandler); } };
  addEventListener("keydown", keyHandler);
  overlay.onpointerdown = (event) => {
    start = { x: event.offsetX, y: event.offsetY };
    box = document.createElement("div"); box.style.cssText = "position:absolute;border:3px solid #36d399;background:#36d39922;"; overlay.append(box);
  };
  overlay.onpointermove = (event) => {
    if (!start || !box) return;
    const x = Math.min(start.x, event.offsetX), y = Math.min(start.y, event.offsetY);
    const width = Math.abs(event.offsetX - start.x), height = Math.abs(event.offsetY - start.y);
    Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  };
  overlay.onpointerup = (event) => {
    if (!start) return finish();
    const x = Math.min(start.x, event.offsetX), y = Math.min(start.y, event.offsetY);
    const width = Math.abs(event.offsetX - start.x), height = Math.abs(event.offsetY - start.y);
    if (width > 80 && height > 25) {
      ocrRegion = { x: x / rect.width, y: y / rect.height, width: width / rect.width, height: height / rect.height };
      chrome.storage?.local?.set?.({ kubbOcrRegion: ocrRegion });
    }
    removeEventListener("keydown", keyHandler); finish();
  };
}
