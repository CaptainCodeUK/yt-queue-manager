import { ActiveQueue, QueueItem, VideoId } from './types';
import { getActiveQueue, getSettings, setValue } from './storage';

// Best-effort mirror of the active queue via chrome.storage.sync, gated
// behind Settings.experimentalSync. Deliberately excludes drivingTabId/
// drivingWindowId (local tab/window ids, meaningless on another device) and
// driverHeartbeatAt (high-frequency, purely local) — this module only ever
// reads/writes `items`/`currentItemId`, never the rest of ActiveQueue or the
// separate heartbeat key, which is what keeps those out of sync structurally
// rather than by a filter that could be forgotten.

const SYNC_META_KEY = 'yqm_sync_meta';
const SYNC_CHUNK_KEY_PREFIX = 'yqm_sync_chunk_';

// Headroom under chrome.storage.sync's real per-item (8192B) and total
// (102400B) quotas — never write right up to the edge.
const CHUNK_BUDGET_BYTES = 7000;
const SYNC_TOTAL_BUDGET_BYTES = 90000;

const PUSH_DEBOUNCE_MS = 2000;

function isContextInvalidatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes('extension context invalidated');
}

export interface SyncMeta {
  version: 1;
  updatedAt: number;
  currentItemId: VideoId | null;
  chunkCount: number;
  writeId: string;
}

export interface SyncChunk {
  writeId: string;
  index: number;
  items: QueueItem[];
}

export interface RemoteQueue {
  items: QueueItem[];
  currentItemId: VideoId | null;
  updatedAt: number;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Packs items into chunks that each stay under CHUNK_BUDGET_BYTES once
 * serialized, sized by actual byte length rather than a fixed item count so
 * it self-adjusts for title-length variance. Output is ordered by
 * `position` regardless of input order.
 */
export function chunkItems(items: QueueItem[]): QueueItem[][] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return [];

  const chunks: QueueItem[][] = [];
  let current: QueueItem[] = [];
  let currentBytes = 2; // conservative allowance for the array's own brackets

  for (const item of ordered) {
    const itemBytes = byteLength(item) + 1;
    if (current.length > 0 && currentBytes + itemBytes > CHUNK_BUDGET_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += itemBytes;
  }
  chunks.push(current);
  return chunks;
}

/**
 * Reassembles a queue's items from its sync chunks. Every chunk must carry
 * the meta's writeId — chrome.storage.sync writes multiple keys atomically
 * on the writing device, but they propagate to other devices independently,
 * so a reader can observe new meta alongside stale/missing chunks mid-sync.
 * Any mismatch means "still propagating," not corrupt data — the caller
 * should treat it as no usable update yet and retry on the next event.
 */
export function reassembleChunks(meta: SyncMeta, chunks: (SyncChunk | undefined)[]): QueueItem[] | null {
  if (meta.chunkCount === 0) return [];
  if (chunks.length !== meta.chunkCount) return null;

  const verified: SyncChunk[] = [];
  for (const chunk of chunks) {
    if (!chunk || chunk.writeId !== meta.writeId) return null;
    verified.push(chunk);
  }
  verified.sort((a, b) => a.index - b.index);
  return verified.flatMap((chunk) => chunk.items).sort((a, b) => a.position - b.position);
}

/**
 * Decides whether an incoming remote queue should replace local state, and
 * if so, produces the merge — last-write-wins by `updatedAt`, the same
 * philosophy `updateActiveQueue` already documents for same-device
 * concurrent writes, just applied across devices. `drivingTabId`/
 * `drivingWindowId` always come from `local`: a driving tab/window id from
 * another device refers to nothing here.
 */
export function decideMerge(local: ActiveQueue, remote: RemoteQueue): ActiveQueue | null {
  if (remote.updatedAt <= local.updatedAt) return null;
  return {
    items: remote.items,
    currentItemId: remote.currentItemId,
    drivingTabId: local.drivingTabId,
    drivingWindowId: local.drivingWindowId,
    updatedAt: remote.updatedAt
  };
}

async function readExistingChunkKeys(): Promise<string[]> {
  try {
    const all = await chrome.storage.sync.get(null);
    return Object.keys(all).filter((key) => key.startsWith(SYNC_CHUNK_KEY_PREFIX));
  } catch (error) {
    if (isContextInvalidatedError(error)) return [];
    throw error;
  }
}

export async function pushActiveQueueToSync(queue: ActiveQueue): Promise<void> {
  const chunked = chunkItems(queue.items);
  const writeId = crypto.randomUUID();
  const meta: SyncMeta = {
    version: 1,
    updatedAt: queue.updatedAt,
    currentItemId: queue.currentItemId,
    chunkCount: chunked.length,
    writeId
  };

  const payload: Record<string, SyncMeta | SyncChunk> = { [SYNC_META_KEY]: meta };
  chunked.forEach((items, index) => {
    payload[`${SYNC_CHUNK_KEY_PREFIX}${index}`] = { writeId, index, items };
  });

  const totalBytes = byteLength(payload);
  if (totalBytes > SYNC_TOTAL_BUDGET_BYTES) {
    console.warn(`[yt-queue-manager] queue too large to sync (${totalBytes}B) — skipping push`);
    return;
  }

  try {
    const existingChunkKeys = await readExistingChunkKeys();
    await chrome.storage.sync.set(payload);
    const staleKeys = existingChunkKeys.filter((key) => {
      const index = Number(key.slice(SYNC_CHUNK_KEY_PREFIX.length));
      return index >= chunked.length;
    });
    if (staleKeys.length > 0) await chrome.storage.sync.remove(staleKeys);
  } catch (error) {
    if (isContextInvalidatedError(error)) return;
    console.warn('[yt-queue-manager] failed to push queue to sync storage', error);
  }
}

export async function pullActiveQueueFromSync(): Promise<RemoteQueue | null> {
  try {
    const metaResult = (await chrome.storage.sync.get(SYNC_META_KEY)) as { [SYNC_META_KEY]?: SyncMeta };
    const meta = metaResult[SYNC_META_KEY];
    if (!meta) return null;

    if (meta.chunkCount === 0) {
      return { items: [], currentItemId: meta.currentItemId, updatedAt: meta.updatedAt };
    }

    const chunkKeys = Array.from({ length: meta.chunkCount }, (_, index) => `${SYNC_CHUNK_KEY_PREFIX}${index}`);
    const result = await chrome.storage.sync.get(chunkKeys);
    const chunks = chunkKeys.map((key) => result[key] as SyncChunk | undefined);
    const items = reassembleChunks(meta, chunks);
    if (items === null) return null;

    return { items, currentItemId: meta.currentItemId, updatedAt: meta.updatedAt };
  } catch (error) {
    if (isContextInvalidatedError(error)) return null;
    console.warn('[yt-queue-manager] failed to pull queue from sync storage', error);
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushInFlight = false;
let pushPending = false;

// Tracks the `updatedAt` of the last remote update we applied locally, so
// the local-change listener below can tell "this write is just an echo of
// what we ourselves just merged in" apart from a genuine new local edit —
// without this, applying a remote update would immediately schedule a push
// right back to sync, ping-ponging the same data.
let lastAppliedRemoteUpdatedAt: number | null = null;

function scheduleSyncPush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void runScheduledPush(), PUSH_DEBOUNCE_MS);
}

async function runScheduledPush(): Promise<void> {
  pushTimer = undefined;
  if (pushInFlight) {
    pushPending = true;
    return;
  }
  pushInFlight = true;
  try {
    const settings = await getSettings();
    if (!settings.experimentalSync) return;
    const queue = await getActiveQueue();
    await pushActiveQueueToSync(queue);
  } finally {
    pushInFlight = false;
    if (pushPending) {
      pushPending = false;
      scheduleSyncPush();
    }
  }
}

async function applyIncomingSync(): Promise<void> {
  const remote = await pullActiveQueueFromSync();
  if (!remote) return;

  // Read the raw stored value rather than getActiveQueue(): that helper
  // falls back to a freshly-timestamped empty queue (updatedAt: Date.now())
  // when nothing has ever been written locally, which would otherwise look
  // newer than any real remote queue and reject it every time — exactly the
  // case on a brand-new device that's never had an activeQueue write.
  let local: ActiveQueue | undefined;
  try {
    const raw = await chrome.storage.local.get('activeQueue');
    local = raw.activeQueue as ActiveQueue | undefined;
  } catch (error) {
    if (!isContextInvalidatedError(error)) throw error;
    return;
  }

  const merged: ActiveQueue | null = local
    ? decideMerge(local, remote)
    : {
        items: remote.items,
        currentItemId: remote.currentItemId,
        drivingTabId: null,
        drivingWindowId: null,
        updatedAt: remote.updatedAt
      };
  if (!merged) return;

  lastAppliedRemoteUpdatedAt = merged.updatedAt;
  await setValue('activeQueue', merged);
}

/** Seeds a freshly-enabled device from whatever's already synced (or publishes its own queue if it's first), so it doesn't sit empty until the next edit. */
async function reconcileOnEnable(): Promise<void> {
  await applyIncomingSync();
  const queue = await getActiveQueue();
  await pushActiveQueueToSync(queue);
}

/** Manually triggered pull-then-push, for a "Sync now" UI action. No-op (returns false) if the experimental setting is off. */
export async function forceSync(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.experimentalSync) return false;
  await reconcileOnEnable();
  return true;
}

let syncBridgeInitialized = false;

/**
 * Wires local<->sync mirroring for the active queue. Call once at background
 * service worker startup (registered synchronously at module top level, so
 * MV3 wakes the worker for this listener like its other top-level ones).
 */
export function initSyncBridge(): void {
  if (syncBridgeInitialized) return;
  syncBridgeInitialized = true;

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      const settingsChange = changes.settings;
      if (settingsChange) {
        const wasEnabled = Boolean(settingsChange.oldValue?.experimentalSync);
        const isEnabled = Boolean(settingsChange.newValue?.experimentalSync);
        if (!wasEnabled && isEnabled) void reconcileOnEnable();
      }

      const queueChange = changes.activeQueue;
      if (queueChange) {
        const newQueue = queueChange.newValue as ActiveQueue | undefined;
        if (newQueue && newQueue.updatedAt === lastAppliedRemoteUpdatedAt) return;
        scheduleSyncPush();
      }
      return;
    }

    if (areaName === 'sync') {
      const touchedSyncData = SYNC_META_KEY in changes || Object.keys(changes).some((key) => key.startsWith(SYNC_CHUNK_KEY_PREFIX));
      if (touchedSyncData) void applyIncomingSync();
    }
    });
  } catch (error) {
    if (!isContextInvalidatedError(error)) throw error;
  }
}
