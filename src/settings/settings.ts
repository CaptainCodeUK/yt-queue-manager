import { getActiveQueue, getSettings, setActiveQueue, setSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { buildQueueExportText, parseQueueExport } from '../shared/queue-export';
import { ThemePreference } from '../shared/types';

const watchedThresholdInput = document.getElementById('watched-threshold-input') as HTMLInputElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
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

function applyTheme(theme: ThemePreference): void {
  const resolvedTheme = theme === 'site' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme === 'site' ? 'light' : theme;
  document.documentElement.dataset.yqmTheme = resolvedTheme;
}

getSettings().then((settings) => {
  themeSelect.value = settings.theme;
  applyTheme(settings.theme);
  watchedThresholdInput.value = String(normalizedWatchedThresholdPercent(settings.watchedThresholdPercent));
  syncToggle.checked = settings.experimentalSync;
  historyLookbackSelect.value = String(normalizedHistoryLookbackDays(settings.historySyncLookbackDays));
});

themeSelect.addEventListener('change', async () => {
  const current = await getSettings();
  const theme = themeSelect.value as ThemePreference;
  await setSettings({ ...current, theme });
  applyTheme(theme);
});

watchedThresholdInput.addEventListener('change', async () => {
  const current = await getSettings();
  const threshold = normalizedWatchedThresholdPercent(Number(watchedThresholdInput.value));
  watchedThresholdInput.value = String(threshold);
  await setSettings({ ...current, watchedThresholdPercent: threshold });
});

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
