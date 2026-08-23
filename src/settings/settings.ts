import { getActiveQueue, getSettings, setActiveQueue, setSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { buildQueueExportText, parseQueueExport } from '../shared/queue-export';

const syncToggle = document.getElementById('experimental-sync-toggle') as HTMLInputElement;
const syncNowButton = document.getElementById('sync-now-button') as HTMLButtonElement;
const syncNowStatus = document.getElementById('sync-now-status')!;

const exportCopyButton = document.getElementById('export-copy-button') as HTMLButtonElement;
const exportCopyStatus = document.getElementById('export-copy-status')!;
const importTextarea = document.getElementById('import-textarea') as HTMLTextAreaElement;
const importButton = document.getElementById('import-button') as HTMLButtonElement;
const importStatus = document.getElementById('import-status')!;

getSettings().then((settings) => {
  syncToggle.checked = settings.experimentalSync;
});

syncToggle.addEventListener('change', async () => {
  const current = await getSettings();
  await setSettings({ ...current, experimentalSync: syncToggle.checked });
  syncNowStatus.textContent = '';
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
    drivingTabId: null,
    drivingWindowId: null,
    updatedAt: Date.now()
  });
  importStatus.textContent = `Imported ${parsed.items.length} item(s)`;
  importTextarea.value = '';
});
