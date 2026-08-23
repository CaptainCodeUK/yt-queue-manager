import { getSettings, setSettings } from '../shared/storage';
import { sendMessage } from '../shared/messaging';

const syncToggle = document.getElementById('experimental-sync-toggle') as HTMLInputElement;
const syncNowButton = document.getElementById('sync-now-button') as HTMLButtonElement;
const syncNowStatus = document.getElementById('sync-now-status')!;

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
