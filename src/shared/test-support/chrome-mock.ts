import { vi } from 'vitest';

type StorageChangeMap = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: StorageChangeMap, areaName: string) => void;

export interface MockStorageArea {
  store: Map<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export interface ChromeMock {
  local: MockStorageArea;
  sync: MockStorageArea;
  listeners: ChangeListener[];
}

function createArea(): MockStorageArea {
  const store = new Map<string, unknown>();

  const get = vi.fn((keys?: string | string[] | null): Promise<Record<string, unknown>> => {
    if (keys === null || keys === undefined) {
      return Promise.resolve(Object.fromEntries(store));
    }
    const list = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of list) {
      if (store.has(key)) result[key] = store.get(key);
    }
    return Promise.resolve(result);
  });

  const set = vi.fn((items: Record<string, unknown>): Promise<void> => {
    for (const [key, value] of Object.entries(items)) store.set(key, value);
    return Promise.resolve();
  });

  const remove = vi.fn((keys: string | string[]): Promise<void> => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) store.delete(key);
    return Promise.resolve();
  });

  return { store, get, set, remove };
}

/**
 * Installs a minimal in-memory fake of chrome.storage.{local,sync} as the
 * global `chrome`, scoped to what sync-storage.ts actually calls
 * (get/set/remove, onChanged.addListener) — not a general chrome-API mock.
 */
export function installChromeMock(): ChromeMock {
  const local = createArea();
  const sync = createArea();
  const listeners: ChangeListener[] = [];

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local,
      sync,
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.push(listener)
      }
    }
  };

  return { local, sync, listeners };
}

export function uninstallChromeMock(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

/** Manually fires a storage.onChanged event, mirroring how a real write notifies other contexts. */
export function fireChange(mock: ChromeMock, areaName: 'local' | 'sync', changes: StorageChangeMap): void {
  mock.listeners.forEach((listener) => listener(changes, areaName));
}
