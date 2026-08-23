import { getActiveQueue, getSettings, setActiveQueue, setSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';
import { buildQueueExportText, parseQueueExport } from '../shared/queue-export';

const syncToggle = document.getElementById('experimental-sync-toggle') as HTMLInputElement;
const syncNowButton = document.getElementById('sync-now-button') as HTMLButtonElement;
const syncNowStatus = document.getElementById('sync-now-status')!;

const vivaldiSection = document.getElementById('vivaldi-notes-section')!;
const vivaldiCopyButton = document.getElementById('vivaldi-copy-button') as HTMLButtonElement;
const vivaldiCopyStatus = document.getElementById('vivaldi-copy-status')!;
const vivaldiImportTextarea = document.getElementById('vivaldi-import-textarea') as HTMLTextAreaElement;
const vivaldiImportButton = document.getElementById('vivaldi-import-button') as HTMLButtonElement;
const vivaldiImportStatus = document.getElementById('vivaldi-import-status')!;

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

// Best-effort: Vivaldi can mask this string on ordinary web pages, but
// there's no reliable way to detect it otherwise — this section just stays
// hidden if that happens, rather than showing on a browser it's not for.
if (navigator.userAgent.includes('Vivaldi')) {
  vivaldiSection.hidden = false;
}

vivaldiCopyButton.addEventListener('click', async () => {
  const queue = await getActiveQueue();
  await navigator.clipboard.writeText(buildQueueExportText(queue));
  vivaldiCopyStatus.textContent = `Copied ${queue.items.length} item(s) — paste into a Vivaldi Note`;
});

vivaldiImportButton.addEventListener('click', async () => {
  const parsed = parseQueueExport(vivaldiImportTextarea.value);
  if (!parsed) {
    vivaldiImportStatus.textContent = "Couldn't read that — paste the exact text copied from Export";
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
  vivaldiImportStatus.textContent = `Imported ${parsed.items.length} item(s)`;
  vivaldiImportTextarea.value = '';
});
