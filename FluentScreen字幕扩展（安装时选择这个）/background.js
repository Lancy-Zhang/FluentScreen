let visionPort = null;

function ensureVision() {
  if (visionPort) return true;
  try {
    visionPort = chrome.runtime.connectNative("local.fluentscreen.vision");
    visionPort.onDisconnect.addListener(() => { visionPort = null; });
    visionPort.postMessage({ type: "start" });
    return true;
  } catch {
    visionPort = null;
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  ensureVision();
  if (tab.windowId) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ENSURE_VISION") return;
  sendResponse({ ok: ensureVision() });
});
