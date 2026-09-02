import { getActiveQueue, getSettings, updateActiveQueue } from '../shared/storage';
import { markPlayedByIds } from '../shared/queue-engine';
import { extractVideoIdFromHref } from '../shared/youtube-parsing';

const CONTROL_ID = 'yqm-history-sync-control';
const BUTTON_ID = 'yqm-history-sync-button';
const STATUS_ID = 'yqm-history-sync-status';
const HISTORY_PATHS = new Set(['/history', '/feed/history']);
const HISTORY_ENTRY_SELECTOR = 'ytd-item-section-renderer ytd-video-renderer, ytd-video-renderer';

interface HistoryEntry {
  videoId: string;
  watchedAt: number | null;
}

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
  root.querySelectorAll(HISTORY_ENTRY_SELECTOR).forEach((entry) => {
    const anchor = entry.querySelector<HTMLAnchorElement>(
      'a#video-title, a[href*="watch?v="], a[href*="/shorts/"]'
    );
    const videoId = extractVideoIdFromHref(anchor?.getAttribute('href'));
    if (!videoId || entries.has(videoId)) return;
    entries.set(videoId, { videoId, watchedAt: extractWatchedAt(entry) });
  });
  return [...entries.values()];
}

function setStatus(text: string): void {
  const status = document.getElementById(STATUS_ID);
  if (status) status.textContent = text;
}

function setBusy(busy: boolean): void {
  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (button) button.disabled = busy;
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
  return document.querySelector<HTMLElement>('ytd-browse, ytd-page-manager');
}

function ensureControl(): void {
  if (!isHistoryPage()) {
    document.getElementById(CONTROL_ID)?.remove();
    return;
  }
  if (document.getElementById(CONTROL_ID)) return;
  const host = findControlHost();
  if (!host) return;

  const control = document.createElement('div');
  control.id = CONTROL_ID;
  control.innerHTML = `
    <button id="${BUTTON_ID}" type="button">Sync watched videos</button>
    <span id="${STATUS_ID}" role="status"></span>
  `;
  control.querySelector<HTMLButtonElement>(`#${BUTTON_ID}`)?.addEventListener('click', () => void syncHistory());
  host.appendChild(control);
}

export function startHistorySync(): void {
  ensureControl();
  document.addEventListener('yt-navigate-finish', ensureControl);
  const observer = new MutationObserver(ensureControl);
  observer.observe(document.body, { childList: true, subtree: true });
}
