let activeVideoId = "";
let cues = [];
let savedWords = [];
let selectedWord = null;
let autoFollow = true;
let lastActiveCueId = "";
let lastCueSignature = "";
let resumeFollowTimer = null;
let localTranslator = null;
let ocrEnabled = false;
let ocrBusy = false;
let ocrWorker = null;
let lastOcrText = "";
let lastState = null;
let translationQueue = Promise.resolve();
let lastTranslationAt = 0;
let episodeRecords = [];
let ocrCandidate = null;
let autoOcrVideoId = "";
let cacheTimer = null;
let visionAvailable = false;
const restoredVideoIds = new Set();
const translations = new Map();
const pendingTranslations = new Map();
const VISION_URL = "http://127.0.0.1:8765";
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["savedWords", "episodeRecordsV3"], (data) => { savedWords = data.savedWords || []; episodeRecords = data.episodeRecordsV3 || []; updateWordCount(); });

function time(value) { const m = Math.floor(value / 60); const s = Math.floor(value % 60); return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }
function hasChinese(text) { return /[\u3400-\u9fff]/.test(text); }
function tokens(text) { return text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|[\u3400-\u9fff]+|[^\s]/g) || []; }

async function translateChinese(text) {
  if (!hasChinese(text)) return "";
  if (translations.has(text)) return translations.get(text);
  const task = async () => {
    if (translations.has(text)) return translations.get(text);
    try {
      if (globalThis.Translator?.availability) {
        const availability = await Translator.availability({ sourceLanguage: "zh", targetLanguage: "en" });
        if (availability !== "unavailable") {
          localTranslator ||= await Translator.create({ sourceLanguage: "zh", targetLanguage: "en" });
          const result = await localTranslator.translate(text);
          lastTranslationAt = Date.now();
          translations.set(text, result);
          return result;
        }
      }
    } catch (error) {
      lastTranslationAt = Date.now();
    }
    const wait = Math.max(0, 1800 - (Date.now() - lastTranslationAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=zh-CN|en`);
      const data = await response.json();
      const result = data?.responseData?.translatedText?.trim();
      if (result) { lastTranslationAt = Date.now(); translations.set(text, result); return result; }
    } catch {}
    return "免费翻译暂时不可用，稍后会再次尝试。";
  };
  translationQueue = translationQueue.then(task, task);
  return translationQueue;
}

function explain(text) {
  const lower = text.toLowerCase(), notes = [];
  if (/\bwill\b/.test(lower)) notes.push("will + 动词原形：意愿、承诺或将来的动作。");
  if (/\bnot\b|n't\b/.test(lower)) notes.push("否定结构：not 放在助动词或 be 动词之后。");
  if (text.trim().endsWith("?")) notes.push("疑问句：先找助动词，再确认主语和主要动词。");
  return notes.length ? notes.join("<br>") : "先找主语和谓语，再看宾语或补充信息；替换关键词可以练习造句。";
}

async function render(state) {
  lastState = state;
  if (state.videoId !== activeVideoId) {
    activeVideoId = state.videoId; translations.clear(); lastCueSignature = ""; $("cueList").innerHTML = ""; ocrCandidate = null;
    const saved = episodeRecords.find((item) => item.id === state.videoId);
    for (const cue of saved?.cues || []) if (cue.translation) translations.set(cue.text, cue.translation);
    if (saved?.cues?.length && !state.cues?.length && !restoredVideoIds.has(state.videoId)) {
      restoredVideoIds.add(state.videoId);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "RESTORE_CUES", videoId: state.videoId, cues: saved.cues }).catch(() => {});
    }
  }
  cues = state.cues || [];
  $("statusTitle").textContent = state.captionsVisible ? `● 正在同步 ${state.platform || "视频"} 字幕` : state.platform === "Kubb" ? "正在自动识别 Kubb 画面字幕" : state.subtitleStatus === "music-only" ? "字幕文件只有音乐提示" : state.subtitleStatus === "none" ? "这个视频没有平台字幕" : state.subtitleStatus === "error" ? "Bilibili 字幕读取失败" : "等待字幕出现";
  $("statusText").textContent = `${state.title || "请打开视频"} · 已收集 ${cues.length} 句`;
  const needsOcr = FluentScreenCore.shouldAutoOcr(state) || (state.platform === "Bilibili" && ["none", "music-only", "error"].includes(state.subtitleStatus));
  $("ocrToggle").classList.toggle("hidden", !needsOcr && !ocrEnabled);
  $("adjustRegion").classList.toggle("hidden", state.platform !== "Kubb");
  $("favoriteEpisode").classList.toggle("hidden", state.platform !== "Kubb");
  updateFavoriteButton();
  if (FluentScreenCore.shouldAutoOcr(state) && autoOcrVideoId !== state.videoId) { autoOcrVideoId = state.videoId; void startOcr(true); }
  $("empty").classList.toggle("hidden", cues.length > 0);
  const list = $("cueList");
  const signature = cues.map((cue) => `${cue.id}:${cue.text}:${cue.end}`).join("|");
  if (signature !== lastCueSignature) {
    lastCueSignature = signature;
    list.innerHTML = "";
    for (const cue of cues) {
      const article = document.createElement("article"); article.className = "cue"; article.dataset.id = cue.id; article.dataset.start = cue.start; article.dataset.end = cue.end ?? cue.start + 4;
      const english = !hasChinese(cue.text);
      const cachedTranslation = cue.translation || translations.get(cue.text) || "";
      if (cachedTranslation) cue.translation = cachedTranslation;
      article.innerHTML = `<div class="cueHead"><span>${time(cue.start)}</span><i>${cue.engine === "apple-vision" ? "Apple Vision 画面识别" : cue.ocr ? "画面OCR·可能有误" : english ? "原英文字幕" : "原中文字幕"}</i></div><div class="sentence"></div><p class="translation" data-pending="${english || cachedTranslation ? "false" : "true"}">${english ? "点击单词查看讲解" : cachedTranslation || "正在翻译…"}</p><button class="explain">讲解这句</button><div class="analysis hidden"></div>`;
      const sentence = article.querySelector(".sentence");
      tokens(cue.text).forEach((token) => { const button = document.createElement("button"); button.textContent = token; if (/^[A-Za-z]/.test(token)) button.onclick = () => openWord(token, cue.text); else button.disabled = true; sentence.append(button, document.createTextNode(" ")); });
      article.querySelector(".explain").onclick = () => { pauseFollow(); const box = article.querySelector(".analysis"); box.innerHTML = explain(cue.text); box.classList.toggle("hidden"); };
      list.append(article);
    }
  }
  for (const cue of cues) queueCueTranslation(cue, state);
  [...list.children].forEach((node) => {
    const active = state.currentTime >= Number(node.dataset.start) && state.currentTime < Number(node.dataset.end);
    node.classList.toggle("active", active);
    if (active) {
      if (autoFollow && node.dataset.id !== lastActiveCueId) { lastActiveCueId = node.dataset.id; node.scrollIntoView({ block: "center", behavior: "auto" }); }
    }
  });
  scheduleEpisodeSave(state);
}

function queueCueTranslation(cue, state) {
  if (!cue || !hasChinese(cue.text)) return;
  const cached = cue.translation || translations.get(cue.text);
  if (cached) {
    cue.translation = cached;
    const node = [...$("cueList").children].find((item) => item.dataset.id === String(cue.id));
    const translation = node?.querySelector(".translation");
    if (translation) { translation.textContent = cached; translation.dataset.pending = "false"; }
    return;
  }
  if (pendingTranslations.has(cue.text)) return;
  const promise = translateChinese(cue.text).then((value) => {
    for (const item of cues) if (item.text === cue.text) item.translation = value;
    const node = [...$("cueList").children].find((item) => item.dataset.id === String(cue.id));
    const translation = node?.querySelector(".translation");
    if (translation) { translation.textContent = value; translation.dataset.pending = "false"; }
    scheduleEpisodeSave(state);
  }).finally(() => pendingTranslations.delete(cue.text));
  pendingTranslations.set(cue.text, promise);
}

function scheduleEpisodeSave(state) {
  if (!state?.videoId || !cues.length) return;
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const existing = episodeRecords.find((item) => item.id === state.videoId);
    const record = { id: state.videoId, title: state.title, platform: state.platform, cues: cues.slice(-1000), updatedAt: Date.now(), favorite: Boolean(existing?.favorite) };
    episodeRecords = FluentScreenCore.pruneEpisodeRecords([...episodeRecords.filter((item) => item.id !== record.id), record], 30);
    chrome.storage.local.set({ episodeRecordsV3: episodeRecords }); updateFavoriteButton();
  }, 700);
}

function updateFavoriteButton() {
  const favorite = episodeRecords.find((item) => item.id === activeVideoId)?.favorite;
  $("favoriteEpisode").textContent = favorite ? "★ 已收藏本集" : "☆ 收藏本集";
}

$("favoriteEpisode").onclick = () => {
  if (!activeVideoId) return;
  const existing = episodeRecords.find((item) => item.id === activeVideoId) || { id: activeVideoId, title: lastState?.title, platform: lastState?.platform, cues, updatedAt: Date.now() };
  const record = { ...existing, cues, favorite: !existing.favorite, updatedAt: Date.now() };
  episodeRecords = FluentScreenCore.pruneEpisodeRecords([...episodeRecords.filter((item) => item.id !== activeVideoId), record], 30);
  chrome.storage.local.set({ episodeRecordsV3: episodeRecords }); updateFavoriteButton();
};

function updateFollowButton() { $("followToggle").textContent = `自动跟随：${autoFollow ? "开" : "关"}`; $("followToggle").classList.toggle("off", !autoFollow); }
function pauseFollow() { autoFollow = false; updateFollowButton(); clearTimeout(resumeFollowTimer); resumeFollowTimer = setTimeout(() => { autoFollow = true; updateFollowButton(); }, 8000); }
$("followToggle").onclick = () => { autoFollow = !autoFollow; clearTimeout(resumeFollowTimer); updateFollowButton(); };
$("cueList").addEventListener("wheel", pauseFollow, { passive: true });

async function initOcr() {
  if (ocrWorker) return ocrWorker;
  $("ocrStatus").classList.remove("hidden"); $("ocrStatus").textContent = "正在加载本地中文 OCR…";
  ocrWorker = await Tesseract.createWorker("chi_sim", 1, {
    workerPath: chrome.runtime.getURL("vendor/worker.min.js"),
    workerBlobURL: false,
    corePath: chrome.runtime.getURL("vendor/core/"),
    langPath: chrome.runtime.getURL("vendor/lang/"),
    logger: (message) => { if (ocrEnabled && message.progress) $("ocrStatus").textContent = `OCR 模型准备 ${Math.round(message.progress * 100)}%`; }
  });
  await ocrWorker.setParameters({ tessedit_pageseg_mode: "7", preserve_interword_spaces: "0" });
  return ocrWorker;
}

function cleanOcrText(text) {
  return text.replace(/\s+/g, "").replace(/[^\u3400-\u9fffA-Za-z0-9，。！？：；、“”‘’]/g, "").trim();
}

async function visionHealth() {
  try {
    const response = await fetch(`${VISION_URL}/health`, { signal: AbortSignal.timeout(1200) });
    const data = await response.json();
    return response.ok && data?.engine === "apple-vision";
  } catch { return false; }
}

async function recognizeWithVision(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
  if (!blob) throw new Error("无法生成字幕截图");
  const response = await fetch(`${VISION_URL}/ocr`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Apple Vision 返回 ${response.status}`);
  return response.json();
}

async function captureHardSubtitle() {
  if (!ocrEnabled || ocrBusy) return;
  ocrBusy = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const rect = lastState?.videoRect;
    if (!tab?.id || !rect) throw new Error("找不到播放器区域");
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 88 });
    const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scaleX = image.width / Math.max(1, rect.viewportWidth);
    const scaleY = image.height / Math.max(1, rect.viewportHeight);
    // Most burned-in dialogue subtitles occupy a narrow, centered strip near
    // the bottom. Excluding the rest prevents titles, watermarks and UI text
    // from being mistaken for dialogue.
    const region = lastState?.ocrRegion || { x: 0.22, y: 0.73, width: 0.68, height: 0.22 };
    const sx = Math.max(0, Math.round((rect.x + rect.width * region.x) * scaleX));
    const sy = Math.max(0, Math.round((rect.y + rect.height * region.y) * scaleY));
    const sw = Math.min(image.width - sx, Math.round(rect.width * region.width * scaleX));
    const sh = Math.min(image.height - sy, Math.round(rect.height * region.height * scaleY));
    if (sw < 100 || sh < 20) throw new Error("播放器区域太小");
    const canvas = document.createElement("canvas"); canvas.width = sw * 2; canvas.height = sh * 2;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = visionAvailable ? "none" : "grayscale(1) contrast(1.55)";
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); image.close();
    let text = "", confidence = 0, engine = "tesseract";
    if (visionAvailable) {
      const result = await recognizeWithVision(canvas);
      text = cleanOcrText(result?.text || ""); confidence = Number(result?.confidence || 0) * 100; engine = "apple-vision";
    } else {
      const worker = await initOcr();
      const result = await worker.recognize(canvas);
      text = cleanOcrText(result?.data?.text || ""); confidence = Number(result?.data?.confidence || 0);
    }
    ocrCandidate = FluentScreenCore.stabilizeOcr(ocrCandidate, text, confidence);
    if (ocrCandidate.commit && ocrCandidate.text !== lastOcrText) { lastOcrText = ocrCandidate.text; await chrome.tabs.sendMessage(tab.id, { type: "ADD_OCR_CUE", text: ocrCandidate.text, engine: "apple-vision" }); }
    $("ocrStatus").classList.remove("hidden");
    $("ocrStatus").textContent = text ? `${engine === "apple-vision" ? "Apple Vision" : "备用 OCR"}：${text}（识别后立即收录）` : `${engine === "apple-vision" ? "Apple Vision" : "备用 OCR"} 正在运行，本帧没有识别到对白字幕。`;
  } catch (error) {
    $("ocrStatus").classList.remove("hidden");
    $("ocrStatus").textContent = `OCR 失败：${error?.message || "请关闭弹幕并保持视频可见"}`;
  } finally {
    ocrBusy = false;
    if (ocrEnabled) setTimeout(captureHardSubtitle, 250);
  }
}

async function startOcr(automatic = false) {
  if (ocrEnabled) return;
  ocrEnabled = true;
  $("ocrToggle").textContent = ocrEnabled ? "停止画面识别" : "识别画面字幕";
  $("ocrToggle").classList.toggle("running", ocrEnabled);
  lastOcrText = ""; ocrCandidate = null; $("ocrStatus").classList.remove("hidden"); $("ocrStatus").textContent = "正在连接本机 Apple Vision…";
  try {
    visionAvailable = await visionHealth();
    if (!visionAvailable) {
      await chrome.runtime.sendMessage({ type: "ENSURE_VISION" }).catch(() => null);
      for (let attempt = 0; attempt < 12 && !visionAvailable; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        visionAvailable = await visionHealth();
      }
    }
    if (!visionAvailable) { ocrEnabled = false; $("ocrToggle").textContent = "识别画面字幕"; $("ocrToggle").classList.remove("running"); $("ocrStatus").textContent = "未连接到 FluentScreen Vision。请先双击打开 Mac 辅助程序，再点“识别画面字幕”。"; return; }
    $("ocrStatus").textContent = automatic ? "Apple Vision 已连接，正在自动识别 Kubb 字幕" : "Apple Vision 已连接，正在识别画面字幕";
    void captureHardSubtitle();
  } catch (error) { ocrEnabled = false; $("ocrToggle").textContent = "识别画面字幕"; $("ocrToggle").classList.remove("running"); $("ocrStatus").textContent = `Apple Vision 启动失败：${error?.message || "未知错误"}`; }
}

$("ocrToggle").onclick = async () => {
  if (!ocrEnabled) return startOcr(false);
  ocrEnabled = false; $("ocrToggle").textContent = "识别画面字幕"; $("ocrToggle").classList.remove("running"); $("ocrStatus").textContent = "画面字幕识别已停止";
};

$("adjustRegion").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { $("ocrStatus").classList.remove("hidden"); $("ocrStatus").textContent = "找不到当前视频标签页"; return; }
  $("ocrStatus").classList.remove("hidden"); $("ocrStatus").textContent = "请在视频画面上拖动，框住真正对白字幕出现的区域";
  try { await chrome.tabs.sendMessage(tab.id, { type: "ADJUST_OCR_REGION" }); }
  catch (error) { $("ocrStatus").textContent = `无法打开识别框：${error?.message || "请刷新视频页面后重试"}`; }
};

async function poll() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/youtube\.com|bilibili\.com|kubb\.tv/.test(tab.url || "")) { ocrEnabled = false; $("statusTitle").textContent = "请切换到视频页面"; $("statusText").textContent = "支持 YouTube、Bilibili 和 Kubb"; return; }
  try { const state = await chrome.tabs.sendMessage(tab.id, { type: "GET_FLUENTSCREEN_STATE" }); await render(state); } catch {}
}
setInterval(poll, 600); poll();
void chrome.runtime.sendMessage({ type: "ENSURE_VISION" }).catch(() => null);

async function openWord(word, sentence) {
  selectedWord = { word: word.toLowerCase(), phonetic: "", part: "", meaning: "正在查询免费词典…", example: sentence };
  drawWord();
  try { const data = await (await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)).json(); const first=data?.[0], meaning=first?.meanings?.[0], def=meaning?.definitions?.[0]; selectedWord={word:word.toLowerCase(),phonetic:first?.phonetic||"",part:meaning?.partOfSpeech||"",meaning:def?.definition||"暂未收录",example:def?.example||sentence}; } catch { selectedWord.meaning="免费词典暂时无法连接"; }
  drawWord();
}
function drawWord(){ $("drawer").classList.remove("hidden"); $("drawerWord").textContent=selectedWord.word; $("drawerMeta").textContent=`${selectedWord.phonetic} · ${selectedWord.part}`; $("drawerMeaning").textContent=selectedWord.meaning; $("drawerExample").textContent=selectedWord.example; $("saveWord").textContent=savedWords.some(x=>x.word===selectedWord.word)?"★ 已收藏到生词本":"☆ 收藏到生词本"; }
$("closeDrawer").onclick=()=>$("drawer").classList.add("hidden");
$("saveWord").onclick=()=>{ const exists=savedWords.some(x=>x.word===selectedWord.word); savedWords=exists?savedWords.filter(x=>x.word!==selectedWord.word):[...savedWords,selectedWord]; chrome.storage.local.set({savedWords}); updateWordCount(); drawWord(); };
function updateWordCount(){ $("wordCount").textContent=savedWords.length; }
$("wordsTab").onclick=()=>{ $("cueList").classList.toggle("hidden"); $("empty").classList.add("hidden"); const book=$("wordBook"); book.classList.toggle("hidden"); book.innerHTML=savedWords.length?savedWords.map(x=>`<article class="wordCard"><b>${x.word}</b><span>${x.phonetic} · ${x.part}</span><p>${x.meaning}</p><small>${x.example}</small><button data-word="${x.word}">移除</button></article>`).join(""):"<section class='empty'><h2>生词本还是空的</h2><p>点击字幕中的英文单词即可收藏。</p></section>"; book.querySelectorAll("button[data-word]").forEach(btn=>btn.onclick=()=>{savedWords=savedWords.filter(x=>x.word!==btn.dataset.word);chrome.storage.local.set({savedWords});updateWordCount();btn.closest("article").remove();}); };
