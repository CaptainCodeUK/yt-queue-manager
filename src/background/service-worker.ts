import { ExtensionMessage, ClaimDriverResponse, HEARTBEAT_INTERVAL_MS } from '../shared/messaging';
import { getActiveQueue, updateActiveQueue, getValue, setValue } from '../shared/storage';
import { QueueListView } from '../shared/types';
import { watchUrl } from '../shared/youtube-parsing';
import { initSyncBridge, forceSync } from '../shared/sync-storage';

// Background service worker. Holds no authoritative in-memory state — MV3
// service workers are killed/restarted at will, so chrome.storage.local is
// always re-read on each event, never trusted from module-level variables.

// Tabs running for hours can get timer-throttled (especially when hidden),
// so heartbeats may arrive much later than HEARTBEAT_INTERVAL_MS. Keep a
// generous threshold to avoid dropping an otherwise healthy driving tab.
const STALE_DRIVER_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 10;
const STALE_DRIVER_ALARM = 'yqm-stale-driver-check';

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

/**
 * Clears the driver if its heartbeat has gone stale — covers a driving tab
 * that hangs, crashes, or otherwise stops pinging without firing
 * `chrome.tabs.onRemoved` (which only handles a clean tab close).
 */
async function reclaimStaleDriver(): Promise<void> {
  const queue = await getActiveQueue();
  if (queue.drivingTabId === null) return;
  const lastHeartbeatAt = await getValue('driverHeartbeatAt');
  if (Date.now() - lastHeartbeatAt < STALE_DRIVER_THRESHOLD_MS) return;
  await updateActiveQueue((q) => ({ ...q, drivingTabId: null, drivingWindowId: null }));
}

async function heartbeat(tabId: number): Promise<void> {
  const queue = await getActiveQueue();
  if (queue.drivingTabId !== tabId) return;
  await setValue('driverHeartbeatAt', Date.now());
}

/** The currently active tab, if it's already on YouTube — reusing it beats opening a new tab. */
async function activeYouTubeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith('https://www.youtube.com/') ? tab : undefined;
}

/**
 * Tries to navigate `tabId` to `videoId` through YouTube's own SPA router
 * (a synthetic link click, injected into the page) instead of a full
 * reload — mirrors `spaNavigate` in the content script, duplicated here
 * because injected functions can't import shared modules. Returns whether
 * it actually worked, so the caller can fall back to a real navigation.
 */
async function spaNavigateTab(tabId: number, videoId: string): Promise<boolean> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id: string) => {
        const before = location.href;
        const anchor = document.createElement('a');
        anchor.href = `/watch?v=${id}`;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(location.href !== before), 800);
        });
      },
      args: [videoId]
    });
    return result === true;
  } catch {
    return false;
  }
}

/** Navigates `tab` to `videoId` in place (SPA transition, falling back to a full reload) and claims it as driver. */
async function navigateExistingTab(tab: chrome.tabs.Tab, videoId: string): Promise<void> {
  if (tab.id === undefined) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (!(await spaNavigateTab(tab.id, videoId))) {
    await chrome.tabs.update(tab.id, { url: watchUrl(videoId) });
  }
  if (tab.windowId !== undefined) {
    await claimDriver(tab.id, tab.windowId);
  }
}

/**
 * Navigates to `videoId`, preferring the existing driving tab or the
 * current YouTube tab over opening a new one, and preferring an in-page
 * SPA transition over a full reload.
 */
async function navigateToVideo(videoId: string, playbackView: QueueListView): Promise<void> {
  await updateActiveQueue((queue) => ({ ...queue, currentItemId: videoId, playbackView }));
  const queue = await getActiveQueue();

  if (queue.drivingTabId !== null) {
    try {
      const tab = await chrome.tabs.get(queue.drivingTabId);
      await navigateExistingTab(tab, videoId);
      return;
    } catch {
      // Driving tab no longer exists — fall through.
    }
  }

  const currentYouTubeTab = await activeYouTubeTab();
  if (currentYouTubeTab) {
    await navigateExistingTab(currentYouTubeTab, videoId);
    return;
  }

  const tab = await chrome.tabs.create({ url: watchUrl(videoId), active: true });
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
          await navigateToVideo(message.videoId, message.playbackView);
          sendResponse(undefined);
          return;
        case 'forceSync':
          sendResponse(await forceSync());
          return;
      }
    })();
    return true; // keep the message channel open for the async response
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  releaseDriver(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STALE_DRIVER_ALARM) {
    void reclaimStaleDriver();
  }
});

// Re-armed on every service worker activation, not just install — alarms
// persist independently of the worker's lifecycle, but re-creating with the
// same name is a harmless no-op reschedule, so this is the simplest way to
// guarantee it exists regardless of when the worker last woke up.
chrome.alarms.create(STALE_DRIVER_ALARM, { periodInMinutes: 1 });

initSyncBridge();

chrome.runtime.onInstalled.addListener(() => {
  console.log('[yt-queue-manager] background service worker installed');
});
