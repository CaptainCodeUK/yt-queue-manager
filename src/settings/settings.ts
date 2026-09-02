import { getActiveQueue, getSettings, setActiveQueue, setSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { buildQueueExportText, parseQueueExport } from '../shared/queue-export';
import { normalizePlaylistDurationWindows } from '../shared/queue-engine';

const watchedThresholdInput = document.getElementById('watched-threshold-input') as HTMLInputElement;
const shortPlaylistMaxMinutesInput = document.getElementById('short-playlist-max-minutes-input') as HTMLInputElement;
const essaysPlaylistMinMinutesInput = document.getElementById('essays-playlist-min-minutes-input') as HTMLInputElement;
const syncToggle = document.getElementById('experimental-sync-toggle') as HTMLInputElement;
const historyLookbackSelect = document.getElementById('history-lookback-select') as HTMLSelectElement;
const syncNowButton = document.getElementById('sync-now-button') as HTMLButtonElement;
const syncNowStatus = document.getElementById('sync-now-status')!;

const exportCopyButton = document.getElementById('export-copy-button') as HTMLButtonElement;
const exportCopyStatus = document.getElementById('export-copy-status')!;
const importTextarea = document.getElementById('import-textarea') as HTMLTextAreaElement;
const importButton = document.getElementById('import-button') as HTMLButtonElement;
const importStatus = document.getElementById('import-status')!;

function normalizedWatchedThresholdPercent(value: number): number {
  if (!Number.isFinite(value)) return 95;
  return Math.min(100, Math.max(1, Math.round(value)));
}

function normalizedHistoryLookbackDays(value: number): 7 | 30 | 90 {
  return value === 7 || value === 90 ? value : 30;
}

function normalizedPlaylistDurationMinutes(shortMinutes: number, essaysMinutes: number): {
  shortPlaylistMaxMinutes: number;
  essaysPlaylistMinMinutes: number;
} {
  const windows = normalizePlaylistDurationWindows({
    shortPlaylistMaxMinutes: shortMinutes,
    essaysPlaylistMinMinutes: essaysMinutes
  });
  return {
    shortPlaylistMaxMinutes: windows.shortMaxSeconds / 60,
    essaysPlaylistMinMinutes: windows.essaysMinSeconds / 60
  };
}

function setPlaylistDurationInputValues(shortMinutes: number, essaysMinutes: number): void {
  const normalized = normalizedPlaylistDurationMinutes(shortMinutes, essaysMinutes);
  shortPlaylistMaxMinutesInput.value = String(normalized.shortPlaylistMaxMinutes);
  essaysPlaylistMinMinutesInput.value = String(normalized.essaysPlaylistMinMinutes);
}

getSettings().then((settings) => {
  watchedThresholdInput.value = String(normalizedWatchedThresholdPercent(settings.watchedThresholdPercent));
  setPlaylistDurationInputValues(settings.shortPlaylistMaxMinutes, settings.essaysPlaylistMinMinutes);
  syncToggle.checked = settings.experimentalSync;
  historyLookbackSelect.value = String(normalizedHistoryLookbackDays(settings.historySyncLookbackDays));
});

watchedThresholdInput.addEventListener('change', async () => {
  const current = await getSettings();
  const threshold = normalizedWatchedThresholdPercent(Number(watchedThresholdInput.value));
  watchedThresholdInput.value = String(threshold);
  await setSettings({ ...current, watchedThresholdPercent: threshold });
});

async function savePlaylistDurationWindows(): Promise<void> {
  const current = await getSettings();
  const normalized = normalizedPlaylistDurationMinutes(
    Number(shortPlaylistMaxMinutesInput.value),
    Number(essaysPlaylistMinMinutesInput.value)
  );
  setPlaylistDurationInputValues(normalized.shortPlaylistMaxMinutes, normalized.essaysPlaylistMinMinutes);
  await setSettings({ ...current, ...normalized });
}

shortPlaylistMaxMinutesInput.addEventListener('change', () => void savePlaylistDurationWindows());
essaysPlaylistMinMinutesInput.addEventListener('change', () => void savePlaylistDurationWindows());

syncToggle.addEventListener('change', async () => {
  const current = await getSettings();
  await setSettings({ ...current, experimentalSync: syncToggle.checked });
  syncNowStatus.textContent = '';
});

historyLookbackSelect.addEventListener('change', async () => {
  const current = await getSettings();
  const lookbackDays = normalizedHistoryLookbackDays(Number(historyLookbackSelect.value));
  historyLookbackSelect.value = String(lookbackDays);
  await setSettings({ ...current, historySyncLookbackDays: lookbackDays });
});

syncNowButton.addEventListener('click', async () => {
  syncNowStatus.textContent = 'Syncing…';
  const didSync = await sendMessage<boolean>({ type: 'forceSync' });
  syncNowStatus.textContent = didSync ? 'Synced just now' : 'Enable the toggle above first';
});

exportCopyButton.addEventListener('click', async () => {
  const queue = await getActiveQueue();
  await navigator.clipboard.writeText(buildQueueExportText(queue));
  exportCopyStatus.textContent = `Copied ${queue.items.length} item(s) — paste it wherever suits you, then bring it to your other device`;
});

importButton.addEventListener('click', async () => {
  const parsed = parseQueueExport(importTextarea.value);
  if (!parsed) {
    importStatus.textContent = "Couldn't read that — paste the exact text copied from Export";
    return;
  }

  const confirmed = window.confirm(`Replace your current queue with these ${parsed.items.length} item(s)?`);
  if (!confirmed) return;

  await setActiveQueue({
    items: parsed.items,
    currentItemId: parsed.currentItemId,
    selectedView: 'all',
    playbackView: 'all',
    drivingTabId: null,
    drivingWindowId: null,
    updatedAt: Date.now()
  });
  importStatus.textContent = `Imported ${parsed.items.length} item(s)`;
  importTextarea.value = '';
});
