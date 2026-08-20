// Background service worker. Holds no authoritative in-memory state — MV3
// service workers are killed/restarted at will, so chrome.storage.local is
// always re-read on each event. Message handlers and tab-lifecycle wiring
// are added in later phases.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[yt-queue-manager] background service worker installed');
});
