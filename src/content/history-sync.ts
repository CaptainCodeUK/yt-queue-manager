import { getActiveQueue, getSettings, updateActiveQueue } from '../shared/storage';
import { markPlayedByIds } from '../shared/queue-engine';
import { extractVideoIdFromHref } from '../shared/youtube-parsing';

const CONTROL_ID = 'yqm-history-sync-control';
const QUEUE_HOST_ID = 'yqm-header-host';
const BUTTON_ID = 'yqm-history-sync-button';
const STATUS_ID = 'yqm-history-sync-status';
const HISTORY_PATHS = new Set(['/history', '/feed/history']);
const HISTORY_CARD_SELECTOR = [
  'ytd-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-rich-item-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model'
].join(', ');
const HISTORY_VIDEO_LINK_SELECTOR = 'a[href*="watch?v="], a[href*="/shorts/"]';

interface HistoryEntry {
  videoId: string;
  watchedAt: number | null;
}

let syncButton: HTMLButtonElement | null = null;
let syncStatus: HTMLElement | null = null;

function isHistoryPage(): boolean {
  return HISTORY_PATHS.has(location.pathname);
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    const milliseconds = numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractWatchedAt(entry: Element): number | null {
  const timestampElement = entry.querySelector<HTMLElement>('time[datetime], [data-timestamp], [data-watched-at]');
  if (!timestampElement) return null;
  return parseTimestamp(
    timestampElement.getAttribute('datetime') ??
      timestampElement.getAttribute('data-timestamp') ??
      timestampElement.getAttribute('data-watched-at')
  );
}

export function collectHistoryEntries(root: ParentNode = document): HistoryEntry[] {
  const entries = new Map<string, HistoryEntry>();
  root.querySelectorAll<HTMLAnchorElement>(HISTORY_VIDEO_LINK_SELECTOR).forEach((anchor) => {
    const entry = anchor.closest(HISTORY_CARD_SELECTOR);
    if (!entry) return;
    const videoId = extractVideoIdFromHref(anchor?.getAttribute('href'));
    if (!videoId || entries.has(videoId)) return;
    entries.set(videoId, { videoId, watchedAt: extractWatchedAt(entry) });
  });
  return [...entries.values()];
}

function setStatus(text: string): void {
  if (!syncStatus) return;
  syncStatus.textContent = text;
  syncStatus.hidden = text.length === 0;
}

function setBusy(busy: boolean): void {
  if (syncButton) syncButton.disabled = busy;
}

async function syncHistory(): Promise<void> {
  setBusy(true);
  setStatus('Scanning loaded history...');
  try {
    const settings = await getSettings();
    const entries = collectHistoryEntries();
    const timestampedEntries = entries.filter((entry) => entry.watchedAt !== null);
    const cutoff = Date.now() - settings.historySyncLookbackDays * 24 * 60 * 60 * 1000;
    const eligibleEntries =
      timestampedEntries.length === entries.length
        ? entries.filter((entry) => entry.watchedAt !== null && entry.watchedAt >= cutoff)
        : entries;
    const queue = await getActiveQueue();
    const result = markPlayedByIds(
      queue,
      eligibleEntries.map((entry) => entry.videoId)
    );

    if (result.markedCount > 0) {
      await updateActiveQueue(() => result.queue);
    }

    if (entries.length === 0) {
      setStatus('No loaded history entries found; nothing changed.');
    } else if (timestampedEntries.length !== entries.length) {
      setStatus(
        `Marked ${result.markedCount} queue video(s) from ${entries.length} loaded entries; YouTube provided no usable dates.`
      );
    } else {
      setStatus(
        `Marked ${result.markedCount} queue video(s) from ${eligibleEntries.length} history entries in the last ${settings.historySyncLookbackDays} days.`
      );
    }
  } catch {
    setStatus('History sync failed; your queue was not changed.');
  } finally {
    setBusy(false);
  }
}

function findControlHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('ytd-masthead #end #buttons');
}

function ensureControl(): void {
  if (!isHistoryPage()) {
    document.getElementById(CONTROL_ID)?.remove();
    syncButton = null;
    syncStatus = null;
    return;
  }
  if (document.getElementById(CONTROL_ID)) return;
  const host = findControlHost();
  if (!host) return;

  const control = document.createElement('div');
  control.id = CONTROL_ID;
  control.style.display = 'inline-flex';
  control.style.alignItems = 'center';
  const shadowRoot = control.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      #${BUTTON_ID} { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px; border: 1px solid #e0d4f7; border-radius: 18px; background: #fff; color: #5e35b1; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; }
      #${BUTTON_ID}:hover { background: #f1e9fb; }
      #${BUTTON_ID}:disabled { opacity: 0.6; cursor: wait; }
      #${STATUS_ID} { position: fixed; top: 72px; right: 24px; z-index: 2200; max-width: min(360px, calc(100vw - 48px)); padding: 8px 12px; border-radius: 4px; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); color: #0f0f0f; font-family: Roboto, Arial, sans-serif; font-size: 12px; line-height: 1.4; }
      #${STATUS_ID}[hidden] { display: none; }
    </style>
    <button id="${BUTTON_ID}" type="button"><span aria-hidden="true">+</span><span>Sync watched videos</span></button>
    <span id="${STATUS_ID}" role="status" hidden></span>
  `;
  syncButton = shadowRoot.querySelector<HTMLButtonElement>(`#${BUTTON_ID}`);
  syncStatus = shadowRoot.querySelector<HTMLElement>(`#${STATUS_ID}`);
  syncButton?.addEventListener('click', () => void syncHistory());
  const queueHost = document.getElementById(QUEUE_HOST_ID);
  if (queueHost?.parentElement === host) {
    host.insertBefore(control, queueHost);
  } else {
    host.prepend(control);
  }
}

export function startHistorySync(): void {
  ensureControl();
  document.addEventListener('yt-navigate-finish', ensureControl);
  const observer = new MutationObserver(ensureControl);
  observer.observe(document.body, { childList: true, subtree: true });
}
