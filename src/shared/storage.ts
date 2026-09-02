import {
  ActiveQueue,
  SavedPlaylist,
  Settings,
  StorageSchema,
  defaultSettings,
  emptyActiveQueue
} from './types';

type StorageKey = keyof StorageSchema;

const DEFAULTS: StorageSchema = {
  activeQueue: emptyActiveQueue(),
  savedPlaylists: [],
  driverHeartbeatAt: 0,
  settings: defaultSettings()
};

function isContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('extension context invalidated');
}

export async function getValue<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  try {
    const result = await chrome.storage.local.get(key);
    return (result[key] as StorageSchema[K] | undefined) ?? DEFAULTS[key];
  } catch (error) {
    if (isContextInvalidatedError(error)) return DEFAULTS[key];
    throw error;
  }
}

export async function setValue<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    if (isContextInvalidatedError(error)) return;
    throw error;
  }
}

export async function getActiveQueue(): Promise<ActiveQueue> {
  return getValue('activeQueue');
}

export async function setActiveQueue(queue: ActiveQueue): Promise<void> {
  await setValue('activeQueue', { ...queue, updatedAt: Date.now() });
}

export async function getSavedPlaylists(): Promise<SavedPlaylist[]> {
  return getValue('savedPlaylists');
}

export async function setSavedPlaylists(playlists: SavedPlaylist[]): Promise<void> {
  await setValue('savedPlaylists', playlists);
}

export async function getSettings(): Promise<Settings> {
  const settings = await getValue('settings');
  return { ...defaultSettings(), ...settings };
}

export async function setSettings(settings: Settings): Promise<void> {
  await setValue('settings', settings);
}

/**
 * Mutates the active queue via an updater function, using the current stored
 * value as input. Not transactional across processes (last write wins), but
 * that's an acceptable tradeoff for a low-stakes single-user queue.
 */
export async function updateActiveQueue(
  updater: (queue: ActiveQueue) => ActiveQueue
): Promise<ActiveQueue> {
  const current = await getActiveQueue();
  const next = updater(current);
  await setActiveQueue(next);
  return next;
}

export function subscribe<K extends StorageKey>(
  key: K,
  callback: (newValue: StorageSchema[K]) => void
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[key];
    if (change === undefined) return;
    callback((change.newValue as StorageSchema[K] | undefined) ?? DEFAULTS[key]);
  };
  try {
    chrome.storage.onChanged.addListener(listener);
  } catch (error) {
    if (isContextInvalidatedError(error)) return () => {};
    throw error;
  }

  return () => {
    try {
      chrome.storage.onChanged.removeListener(listener);
    } catch (error) {
      if (!isContextInvalidatedError(error)) throw error;
    }
  };
}
