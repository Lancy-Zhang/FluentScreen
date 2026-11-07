(function (root) {
  function describeVideo(href) {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "kubb.tv") {
      const pathId = url.pathname.match(/\/play\/([^/?]+)/)?.[1] || url.pathname;
      const id = url.searchParams.get("id") || pathId;
      return { id, page: 1, key: `kubb:${id}`, platform: "Kubb" };
    }
    if (host === "bilibili.com") {
      const id = url.pathname.match(/\/video\/([^/?]+)/)?.[1] || url.pathname;
      const page = Math.max(1, Number.parseInt(url.searchParams.get("p") || "1", 10) || 1);
      return { id, page, key: `${id}:p${page}`, platform: "Bilibili" };
    }
    if (host === "youtube.com" || host === "youtu.be") {
      const id = url.searchParams.get("v") || url.pathname.replace(/^\//, "") || url.pathname;
      return { id, page: 1, key: id, platform: "YouTube" };
    }
    return { id: url.pathname, page: 1, key: url.href, platform: "Unsupported" };
  }

  function shouldAutoOcr(state) {
    return state?.platform === "Kubb" && state?.subtitleStatus !== "ready";
  }

  function pruneEpisodeRecords(records, limit = 30) {
    const favorites = records.filter((item) => item.favorite);
    const recent = records.filter((item) => !item.favorite).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, limit);
    return [...favorites, ...recent];
  }

  function isLikelyDialogue(text) {
    const clean = String(text || "").replace(/\s+/g, "");
    const controls = /^(清晰度|选集|播放|暂停|广告|了解详情|发送|弹幕|全屏|退出全屏|音量|设置|倍速|自动播放)$/;
    if (!clean || controls.test(clean)) return false;
    const chineseCount = (clean.match(/[\u3400-\u9fff]/g) || []).length;
    const latinOrDigitCount = (clean.match(/[A-Za-z0-9]/g) || []).length;
    return chineseCount >= 2 && latinOrDigitCount <= Math.max(2, Math.floor(chineseCount * 0.35));
  }

  function stabilizeOcr(previous, text, confidence) {
    const clean = String(text || "").trim();
    const chineseCount = (clean.match(/[\u3400-\u9fff]/g) || []).length;
    if (Number(confidence || 0) < 55 || chineseCount < 2 || !isLikelyDialogue(clean)) return { text: clean, hits: 0, commit: false };
    const related = previous?.text && (previous.text === clean || previous.text.includes(clean) || clean.includes(previous.text));
    const hits = related ? Number(previous.hits || 0) + 1 : 1;
    return { text: related && previous.text.length > clean.length ? previous.text : clean, hits, commit: true };
  }

  const api = { describeVideo, shouldAutoOcr, pruneEpisodeRecords, stabilizeOcr, isLikelyDialogue };
  root.FluentScreenCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
