import { ActiveQueue, QueueItem, QueueListView, SavedPlaylist, VideoId, emptyActiveQueue } from './types';

export type NewQueueItemInput = Omit<QueueItem, 'played' | 'addedAt' | 'position'>;

function nextPosition(items: QueueItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
}

function sortedByPosition(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function normalizeQueueListView(view: QueueListView | undefined): QueueListView {
  return view ?? 'all';
}

export function isInQueueListView(item: QueueItem, view: QueueListView): boolean {
  if (view === 'all') return true;
  const durationSeconds = item.durationSeconds;
  if (view === 'short') return durationSeconds === null || durationSeconds < 600;
  if (durationSeconds === null) return false;
  if (view === 'long') return durationSeconds >= 600 && durationSeconds < 3600;
  return durationSeconds >= 3600;
}

export function itemsForQueueListView(queue: ActiveQueue, view: QueueListView): QueueItem[] {
  return sortedByPosition(queue.items).filter((item) => isInQueueListView(item, view));
}

/** Adds a video to the queue. No-op if the video is already present. */
export function addItem(queue: ActiveQueue, input: NewQueueItemInput): ActiveQueue {
  if (queue.items.some((item) => item.id === input.id)) {
    return queue;
  }
  const newItem: QueueItem = {
    ...input,
    played: false,
    addedAt: Date.now(),
    position: nextPosition(queue.items)
  };
  return { ...queue, items: [...queue.items, newItem] };
}

/** Adds a video directly after the current item. No-op if the video is already present. */
export function addItemNext(queue: ActiveQueue, input: NewQueueItemInput): ActiveQueue {
  if (queue.items.some((item) => item.id === input.id)) {
    return queue;
  }
  const newItem: QueueItem = {
    ...input,
    played: false,
    addedAt: Date.now(),
    position: 0
  };
  const ordered = sortedByPosition(queue.items);
  const currentIndex = queue.currentItemId
    ? ordered.findIndex((item) => item.id === queue.currentItemId)
    : -1;
  ordered.splice(currentIndex + 1, 0, newItem);
  const items = ordered.map((item, index) => ({ ...item, position: index }));
  return { ...queue, items };
}

export type MoveTarget = 'start' | 'up' | 'down' | 'end';

/** Moves an item within the queue. No-op if the item is missing or already at that boundary. */
export function moveItem(queue: ActiveQueue, id: VideoId, target: MoveTarget): ActiveQueue {
  const ordered = sortedByPosition(queue.items);
  const from = ordered.findIndex((item) => item.id === id);
  if (from === -1) return queue;

  const last = ordered.length - 1;
  const to =
    target === 'start' ? 0 : target === 'end' ? last : target === 'up' ? from - 1 : from + 1;
  if (to === from || to < 0 || to > last) return queue;

  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const items = ordered.map((item, index) => ({ ...item, position: index }));
  return { ...queue, items };
}

export function removeItem(queue: ActiveQueue, id: VideoId): ActiveQueue {
  const items = queue.items.filter((item) => item.id !== id);
  const currentItemId = queue.currentItemId === id ? null : queue.currentItemId;
  return { ...queue, items, currentItemId };
}

export function clearPlayed(queue: ActiveQueue): ActiveQueue {
  const items = queue.items.filter((item) => !item.played);
  const currentItemId =
    queue.currentItemId !== null && !items.some((item) => item.id === queue.currentItemId)
      ? null
      : queue.currentItemId;
  return { ...queue, items, currentItemId };
}

/** Reorders only the items visible in a dynamic list, retaining all other canonical slots. */
export function reorderInQueueListView(
  queue: ActiveQueue,
  orderedIds: VideoId[],
  view: QueueListView
): ActiveQueue {
  if (view === 'all') return reorder(queue, orderedIds);

  const visibleItems = itemsForQueueListView(queue, view);
  const visibleById = new Map(visibleItems.map((item) => [item.id, item]));
  const reorderedVisible = orderedIds.flatMap((id) => {
    const item = visibleById.get(id);
    if (!item) return [];
    visibleById.delete(id);
    return [item];
  });
  reorderedVisible.push(...visibleItems.filter((item) => visibleById.has(item.id)));

  let visibleIndex = 0;
  const items = sortedByPosition(queue.items).map((item, index) => ({
    ...(isInQueueListView(item, view) ? reorderedVisible[visibleIndex++] : item),
    position: index
  }));
  return { ...queue, items };
}

export function markPlayed(queue: ActiveQueue, id: VideoId, played = true): ActiveQueue {
  const items = queue.items.map((item) => (item.id === id ? { ...item, played } : item));
  return { ...queue, items };
}

export function updateDuration(
  queue: ActiveQueue,
  id: VideoId,
  durationSeconds: number,
  durationSource: QueueItem['durationSource']
): ActiveQueue {
  const items = queue.items.map((item) =>
    item.id === id ? { ...item, durationSeconds, durationSource } : item
  );
  return { ...queue, items };
}

/**
 * Reorders the queue given a full list of ids in their new order. Ids not
 * present in `orderedIds` keep their relative order, appended after.
 */
export function reorder(queue: ActiveQueue, orderedIds: VideoId[]): ActiveQueue {
  const byId = new Map(queue.items.map((item) => [item.id, item]));
  const ordered: QueueItem[] = [];
  orderedIds.forEach((id) => {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  });
  const remaining = sortedByPosition([...byId.values()]);
  const items = [...ordered, ...remaining].map((item, index) => ({ ...item, position: index }));
  return { ...queue, items };
}

/** Returns the next unplayed item strictly after `afterId` in queue order, or the first unplayed item if `afterId` is null/not found. */
export function nextUnplayed(
  queue: ActiveQueue,
  afterId: VideoId | null,
  view: QueueListView = 'all'
): QueueItem | null {
  const ordered = itemsForQueueListView(queue, view);
  const startIndex = afterId ? ordered.findIndex((item) => item.id === afterId) : -1;
  const searchFrom = startIndex === -1 ? 0 : startIndex + 1;
  for (let i = searchFrom; i < ordered.length; i++) {
    if (!ordered[i].played) return ordered[i];
  }
  return null;
}

/** Returns the item immediately before `beforeId` in queue order, ignoring played state so finished videos can be revisited. */
export function previousItem(
  queue: ActiveQueue,
  beforeId: VideoId | null,
  view: QueueListView = 'all'
): QueueItem | null {
  const ordered = itemsForQueueListView(queue, view);
  if (ordered.length === 0) return null;
  if (!beforeId) return null;
  const index = ordered.findIndex((item) => item.id === beforeId);
  if (index <= 0) return null;
  return ordered[index - 1];
}

/** Marks the given item played and advances currentItemId to the next unplayed item. */
export function advance(
  queue: ActiveQueue,
  finishedItemId: VideoId,
  view: QueueListView = 'all'
): { queue: ActiveQueue; next: QueueItem | null } {
  const played = markPlayed(queue, finishedItemId, true);
  const next = nextUnplayed(played, finishedItemId, view);
  return { queue: { ...played, currentItemId: next?.id ?? null }, next };
}

export interface QueueTotals {
  totalSeconds: number;
  totalUnknownCount: number;
  remainingSeconds: number;
  remainingUnknownCount: number;
}

export function computeTotals(queue: ActiveQueue, view: QueueListView = 'all'): QueueTotals {
  const ordered = itemsForQueueListView(queue, view);
  let totalSeconds = 0;
  let totalUnknownCount = 0;
  let remainingSeconds = 0;
  let remainingUnknownCount = 0;

  const currentIndex = queue.currentItemId
    ? ordered.findIndex((item) => item.id === queue.currentItemId)
    : -1;

  ordered.forEach((item, index) => {
    if (item.durationSeconds === null) {
      totalUnknownCount++;
    } else {
      totalSeconds += item.durationSeconds;
    }
    const isFromCurrentOnward = currentIndex === -1 || index >= currentIndex;
    if (isFromCurrentOnward && !item.played) {
      if (item.durationSeconds === null) {
        remainingUnknownCount++;
      } else {
        remainingSeconds += item.durationSeconds;
      }
    }
  });

  return { totalSeconds, totalUnknownCount, remainingSeconds, remainingUnknownCount };
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Snapshots the current queue's items into a new named, reloadable playlist. */
export function toSavedPlaylist(queue: ActiveQueue, name: string, playlistId: string): SavedPlaylist {
  const now = Date.now();
  return {
    playlistId,
    name,
    createdAt: now,
    updatedAt: now,
    items: sortedByPosition(queue.items).map((item) => ({ ...item }))
  };
}

/** Loads a saved playlist as the active queue. Played flags reset — a saved playlist is meant to be replayed fresh, unlike the active queue's played state during normal use. */
export function loadPlaylist(playlist: SavedPlaylist, selectedView: QueueListView = 'all'): ActiveQueue {
  const items = playlist.items.map((item) => ({ ...item, played: false }));
  return {
    ...emptyActiveQueue(),
    items,
    currentItemId: items[0]?.id ?? null,
    selectedView
  };
}

export function clearActiveQueue(): ActiveQueue {
  return emptyActiveQueue();
}
