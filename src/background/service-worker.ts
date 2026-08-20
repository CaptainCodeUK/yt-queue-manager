import { ExtensionMessage, ClaimDriverResponse } from '../shared/messaging';
import { getActiveQueue, updateActiveQueue, setValue } from '../shared/storage';

// Background service worker. Holds no authoritative in-memory state — MV3
// service workers are killed/restarted at will, so chrome.storage.local is
// always re-read on each event, never trusted from module-level variables.

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function claimDriver(tabId: number, windowId: number): Promise<ClaimDriverResponse> {
  await updateActiveQueue((queue) => ({
    ...queue,
    drivingTabId: tabId,
    drivingWindowId: windowId
  }));
  await setValue('driverHeartbeatAt', Date.now());
  return { tabId, windowId };
}

async function releaseDriver(tabId: number): Promise<void> {
  const queue = await getActiveQueue();
  if (queue.drivingTabId !== tabId) return;
  await updateActiveQueue((q) => ({ ...q, drivingTabId: null, drivingWindowId: null }));
}

async function heartbeat(tabId: number): Promise<void> {
  const queue = await getActiveQueue();
  if (queue.drivingTabId !== tabId) return;
  await setValue('driverHeartbeatAt', Date.now());
}

/** Navigates the current driving tab to `videoId`, or opens/reuses a tab and claims it as driver if none exists or the known driving tab is gone. */
async function navigateToVideo(videoId: string): Promise<void> {
  const queue = await getActiveQueue();
  const url = watchUrl(videoId);

  if (queue.drivingTabId !== null) {
    try {
      const tab = await chrome.tabs.get(queue.drivingTabId);
      await chrome.tabs.update(tab.id!, { url, active: true });
      return;
    } catch {
      // Driving tab no longer exists — fall through to opening a new one.
    }
  }

  const tab = await chrome.tabs.create({ url, active: true });
  if (tab.id !== undefined && tab.windowId !== undefined) {
    await claimDriver(tab.id, tab.windowId);
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'claimDriver': {
          if (sender.tab?.id === undefined || sender.tab.windowId === undefined) {
            sendResponse(undefined);
            return;
          }
          sendResponse(await claimDriver(sender.tab.id, sender.tab.windowId));
          return;
        }
        case 'releaseDriver':
          await releaseDriver(message.tabId);
          sendResponse(undefined);
          return;
        case 'heartbeat':
          await heartbeat(message.tabId);
          sendResponse(undefined);
          return;
        case 'navigateToVideo':
          await navigateToVideo(message.videoId);
          sendResponse(undefined);
          return;
      }
    })();
    return true; // keep the message channel open for the async response
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  releaseDriver(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[yt-queue-manager] background service worker installed');
});
