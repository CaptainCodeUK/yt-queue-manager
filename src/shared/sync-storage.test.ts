import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chunkItems,
  decideMerge,
  reassembleChunks,
  pushActiveQueueToSync,
  pullActiveQueueFromSync,
  initSyncBridge,
  forceSync,
  SyncMeta,
  SyncChunk
} from './sync-storage';
import { ActiveQueue, QueueItem, defaultSettings, emptyActiveQueue } from './types';
import { installChromeMock, uninstallChromeMock, fireChange, ChromeMock } from './test-support/chrome-mock';

function makeItem(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: 'vid',
    title: 'A video title',
    channelName: 'A channel',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid/hqdefault.jpg',
    durationSeconds: 120,
    durationSource: 'player',
    played: false,
    addedAt: Date.now(),
    position: 0,
    ...overrides
  };
}

function makeQueue(overrides: Partial<ActiveQueue> = {}): ActiveQueue {
  return { ...emptyActiveQueue(), ...overrides };
}

describe('chunkItems', () => {
  it('returns an empty array for an empty queue', () => {
    expect(chunkItems([])).toEqual([]);
  });

  it('packs a small queue into a single chunk', () => {
    const items = [makeItem({ id: 'a', position: 0 }), makeItem({ id: 'b', position: 1 })];
    const chunks = chunkItems(items);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('splits a large queue across multiple chunks, each under budget, ordered by position', () => {
    // ~30 items with long titles comfortably crosses the 7000B chunk budget.
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ id: `v${i}`, position: 29 - i, title: 'x'.repeat(300) })
    );
    const chunks = chunkItems(items);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      const bytes = new TextEncoder().encode(JSON.stringify(chunk)).length;
      expect(bytes).toBeLessThan(8192);
    }

    const flattened = chunks.flat();
    expect(flattened.map((i) => i.position)).toEqual(items.map((i) => i.position).sort((a, b) => a - b));
  });
});

describe('decideMerge', () => {
  const local = makeQueue({
    items: [makeItem({ id: 'local-item' })],
    currentItemId: 'local-item',
    drivingTabId: 42,
    drivingWindowId: 7,
    updatedAt: 1000
  });

  it('merges in remote data when remote is strictly newer, keeping local driving-tab fields', () => {
    const remote = { items: [makeItem({ id: 'remote-item' })], currentItemId: 'remote-item', updatedAt: 2000 };
    const merged = decideMerge(local, remote);
    expect(merged).toEqual({
      items: remote.items,
      currentItemId: 'remote-item',
      drivingTabId: 42,
      drivingWindowId: 7,
      updatedAt: 2000
    });
  });

  it('ignores remote data that is older than local', () => {
    const remote = { items: [makeItem({ id: 'remote-item' })], currentItemId: 'remote-item', updatedAt: 500 };
    expect(decideMerge(local, remote)).toBeNull();
  });

  it('ignores remote data with the same updatedAt as local', () => {
    const remote = { items: [makeItem({ id: 'remote-item' })], currentItemId: 'remote-item', updatedAt: 1000 };
    expect(decideMerge(local, remote)).toBeNull();
  });
});

describe('reassembleChunks', () => {
  const writeId = 'write-1';
  const items = [makeItem({ id: 'a', position: 1 }), makeItem({ id: 'b', position: 0 })];

  it('returns an empty array when the meta declares zero chunks', () => {
    const meta: SyncMeta = { version: 1, updatedAt: 0, currentItemId: null, chunkCount: 0, writeId };
    expect(reassembleChunks(meta, [])).toEqual([]);
  });

  it('reassembles matching chunks in position order', () => {
    const meta: SyncMeta = { version: 1, updatedAt: 0, currentItemId: null, chunkCount: 1, writeId };
    const chunks: SyncChunk[] = [{ writeId, index: 0, items }];
    expect(reassembleChunks(meta, chunks)?.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('returns null when a chunk is missing', () => {
    const meta: SyncMeta = { version: 1, updatedAt: 0, currentItemId: null, chunkCount: 2, writeId };
    const chunks: (SyncChunk | undefined)[] = [{ writeId, index: 0, items }, undefined];
    expect(reassembleChunks(meta, chunks)).toBeNull();
  });

  it('returns null when a chunk carries a mismatched writeId (torn cross-device write)', () => {
    const meta: SyncMeta = { version: 1, updatedAt: 0, currentItemId: null, chunkCount: 1, writeId };
    const chunks: SyncChunk[] = [{ writeId: 'stale-write', index: 0, items }];
    expect(reassembleChunks(meta, chunks)).toBeNull();
  });
});

describe('push/pull round trip and quota guard', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    mock = installChromeMock();
  });

  afterEach(() => {
    uninstallChromeMock();
  });

  it('reassembles a pushed queue spanning multiple chunks back to its original items', async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeItem({ id: `v${i}`, position: i, title: 'x'.repeat(200) }));
    const queue = makeQueue({ items, currentItemId: 'v10', updatedAt: 12345 });

    await pushActiveQueueToSync(queue);
    expect(mock.sync.store.size).toBeGreaterThan(1); // meta + multiple chunk keys

    const remote = await pullActiveQueueFromSync();
    expect(remote?.currentItemId).toBe('v10');
    expect(remote?.updatedAt).toBe(12345);
    expect(remote?.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it('removes stale trailing chunk keys once the queue shrinks', async () => {
    const bigItems = Array.from({ length: 50 }, (_, i) => makeItem({ id: `v${i}`, position: i, title: 'x'.repeat(200) }));
    await pushActiveQueueToSync(makeQueue({ items: bigItems, updatedAt: 1 }));
    const chunkKeysAfterBig = [...mock.sync.store.keys()].filter((k) => k.startsWith('yqm_sync_chunk_'));
    expect(chunkKeysAfterBig.length).toBeGreaterThan(1);

    await pushActiveQueueToSync(makeQueue({ items: [makeItem({ id: 'only' })], updatedAt: 2 }));
    const chunkKeysAfterShrink = [...mock.sync.store.keys()].filter((k) => k.startsWith('yqm_sync_chunk_'));
    expect(chunkKeysAfterShrink).toEqual(['yqm_sync_chunk_0']);
  });

  it('aborts without writing when the serialized queue exceeds the total sync budget', async () => {
    const hugeItems = Array.from({ length: 10 }, (_, i) => makeItem({ id: `v${i}`, position: i, title: 'x'.repeat(10000) }));
    await pushActiveQueueToSync(makeQueue({ items: hugeItems, updatedAt: 1 }));
    expect(mock.sync.set).not.toHaveBeenCalled();
    expect(mock.sync.store.size).toBe(0);
  });
});

describe('initSyncBridge debouncing', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = installChromeMock();
    mock.local.store.set('settings', { ...defaultSettings(), experimentalSync: true });
    mock.local.store.set('activeQueue', makeQueue({ items: [makeItem({ id: 'a' })], updatedAt: 1 }));
  });

  afterEach(() => {
    uninstallChromeMock();
    vi.useRealTimers();
  });

  it('coalesces several rapid local queue changes into a single sync push', async () => {
    initSyncBridge();

    const changedQueue = { newValue: makeQueue({ items: [makeItem({ id: 'a' })], updatedAt: 2 }) };
    fireChange(mock, 'local', { activeQueue: changedQueue });
    fireChange(mock, 'local', { activeQueue: changedQueue });
    fireChange(mock, 'local', { activeQueue: changedQueue });

    await vi.advanceTimersByTimeAsync(2500);

    expect(mock.sync.set).toHaveBeenCalledTimes(1);
  });
});

describe('forceSync', () => {
  let mock: ChromeMock;

  beforeEach(() => {
    mock = installChromeMock();
  });

  afterEach(() => {
    uninstallChromeMock();
  });

  it('is a no-op when experimentalSync is disabled', async () => {
    mock.local.store.set('settings', { ...defaultSettings(), experimentalSync: false });
    const didSync = await forceSync();
    expect(didSync).toBe(false);
    expect(mock.sync.set).not.toHaveBeenCalled();
  });

  it('adopts a remote queue on a device that has never stored one locally', async () => {
    // Seed sync storage with a real remote queue, but leave local storage's
    // 'activeQueue' key completely unset — simulating a brand-new device.
    // Regression test: getActiveQueue()'s fallback stamps a fresh
    // Date.now() on a synthetic empty queue, which used to look newer than
    // any real remote data and made this a permanent no-op.
    const remoteItems = [makeItem({ id: 'remote-a', position: 0 })];
    await pushActiveQueueToSync(makeQueue({ items: remoteItems, currentItemId: 'remote-a', updatedAt: 500 }));
    mock.local.store.set('settings', { ...defaultSettings(), experimentalSync: true });

    const didSync = await forceSync();
    expect(didSync).toBe(true);

    const stored = mock.local.store.get('activeQueue') as ActiveQueue;
    expect(stored.items.map((i) => i.id)).toEqual(['remote-a']);
    expect(stored.updatedAt).toBe(500);
  });

  it('publishes the local queue when local is newer than whatever is synced', async () => {
    mock.local.store.set('settings', { ...defaultSettings(), experimentalSync: true });
    mock.local.store.set('activeQueue', makeQueue({ items: [makeItem({ id: 'local-a' })], updatedAt: 999999 }));

    const didSync = await forceSync();
    expect(didSync).toBe(true);
    expect(mock.sync.set).toHaveBeenCalled();

    const calls = mock.sync.set.mock.calls;
    const lastPayload = calls[calls.length - 1][0] as { yqm_sync_meta: SyncMeta };
    expect(lastPayload.yqm_sync_meta.updatedAt).toBe(999999);
  });
});
