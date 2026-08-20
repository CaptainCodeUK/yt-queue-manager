import { getActiveQueue, updateActiveQueue, getSettings } from '../shared/storage';
import { advance, updateDuration } from '../shared/queue-engine';
import { sendMessage } from '../shared/messaging';
import { ClaimDriverResponse } from '../shared/messaging';

const HEARTBEAT_INTERVAL_MS = 15000;

let myTabId: number | null = null;
let heartbeatTimer: number | undefined;
let currentController: AbortController | null = null;

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function startHeartbeat(): void {
  if (heartbeatTimer !== undefined) return;
  heartbeatTimer = window.setInterval(() => {
    if (myTabId === null) return;
    void sendMessage({ type: 'heartbeat', tabId: myTabId });
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * If `videoId` is in the queue, treats watching it as "playing from the
 * queue": sets it as the current item (covers both the initial bootstrap,
 * where nothing is playing yet, and jumping to a non-current queue item)
 * and claims this tab as the driver responsible for auto-advance.
 */
async function syncCurrentItemAndClaimDriver(videoId: string): Promise<void> {
  const queue = await getActiveQueue();
  if (!queue.items.some((item) => item.id === videoId)) return;

  if (queue.currentItemId !== videoId) {
    await updateActiveQueue((q) => ({ ...q, currentItemId: videoId }));
  }

  const response = await sendMessage<ClaimDriverResponse | undefined>({ type: 'claimDriver' });
  if (response) {
    myTabId = response.tabId;
  }
}

async function isDrivingThisVideo(videoId: string): Promise<boolean> {
  if (myTabId === null) return false;
  const queue = await getActiveQueue();
  return queue.drivingTabId === myTabId && queue.currentItemId === videoId;
}

async function correctDuration(videoId: string, seconds: number): Promise<void> {
  const rounded = Math.round(seconds);
  if (!Number.isFinite(rounded) || rounded <= 0) return;
  const queue = await getActiveQueue();
  const item = queue.items.find((i) => i.id === videoId);
  if (!item || item.durationSeconds === rounded) return;
  await updateActiveQueue((q) => updateDuration(q, videoId, rounded, 'player'));
}

function disableNativeAutonav(): void {
  const toggle = document.querySelector<HTMLElement>('ytd-autonav-toggle-button-renderer #toggle');
  if (toggle?.getAttribute('aria-pressed') === 'true') {
    toggle.click();
  }
}

async function handleEnded(videoId: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoAdvance) return;
  if (!(await isDrivingThisVideo(videoId))) return;

  const queue = await getActiveQueue();
  const { queue: updated, next } = advance(queue, videoId);
  await updateActiveQueue(() => updated);

  disableNativeAutonav();

  if (next) {
    location.href = watchUrl(next.id);
  }
}

/**
 * Attaches end-of-video and duration-correction listeners to the watch
 * page's <video> element for `videoId`. Safe to call on every navigation:
 * an AbortController tears down the previous call's listeners first, since
 * YouTube sometimes reuses the same <video> element across SPA transitions.
 */
export function monitorWatchPageVideo(videoId: string): void {
  currentController?.abort();
  const controller = new AbortController();
  currentController = controller;
  const { signal } = controller;

  startHeartbeat();
  void syncCurrentItemAndClaimDriver(videoId);

  let hasHandledEnd = false;
  const attach = () => {
    if (signal.aborted) return;
    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (!video) {
      window.setTimeout(attach, 500);
      return;
    }

    const onEnded = () => {
      if (hasHandledEnd) return;
      hasHandledEnd = true;
      void handleEnded(videoId);
    };

    video.addEventListener('ended', onEnded, { signal });
    video.addEventListener(
      'timeupdate',
      () => {
        if (hasHandledEnd) return;
        if (video.duration && video.currentTime >= video.duration - 0.5) {
          onEnded();
        }
      },
      { signal }
    );

    if (video.duration) {
      void correctDuration(videoId, video.duration);
    } else {
      video.addEventListener('loadedmetadata', () => void correctDuration(videoId, video.duration), {
        once: true,
        signal
      });
    }
  };

  attach();
}
