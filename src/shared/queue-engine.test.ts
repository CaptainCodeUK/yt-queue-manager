import { describe, it, expect } from 'vitest';
import {
  advance,
  computeTotals,
  isInQueueListView,
  itemsForQueueListView,
  normalizePlaylistDurationWindows,
  nextUnplayed,
  previousItem,
  reorderInQueueListView,
  addItemNext,
  moveItem,
  loadPlaylist,
  markPlayedByIds
} from './queue-engine';
import { ActiveQueue, QueueItem, emptyActiveQueue } from './types';

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

function makeQueue(ids: string[], currentItemId: string | null = null): ActiveQueue {
  return {
    ...emptyActiveQueue(),
    items: ids.map((id, index) => makeItem({ id, position: index })),
    currentItemId
  };
}

const newItem = {
  id: 'x',
  title: 'New',
  channelName: 'C',
  thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
  durationSeconds: 60,
  durationSource: 'domBadge' as const
};

describe('addItemNext', () => {
  it('inserts directly after the current item', () => {
    const result = addItemNext(makeQueue(['a', 'b', 'c'], 'b'), newItem);
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b', 'x', 'c']);
    expect(result.items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
  });

  it('inserts at the front when there is no current item', () => {
    const result = addItemNext(makeQueue(['a', 'b']), newItem);
    expect(result.items.map((i) => i.id)).toEqual(['x', 'a', 'b']);
  });

  it('is a no-op for a video already in the queue', () => {
    const queue = makeQueue(['a', 'x'], 'a');
    expect(addItemNext(queue, newItem)).toBe(queue);
  });
});

describe('moveItem', () => {
  it('moves to start and end', () => {
    expect(moveItem(makeQueue(['a', 'b', 'c']), 'c', 'start').items.map((i) => i.id)).toEqual([
      'c',
      'a',
      'b'
    ]);
    expect(moveItem(makeQueue(['a', 'b', 'c']), 'a', 'end').items.map((i) => i.id)).toEqual([
      'b',
      'c',
      'a'
    ]);
  });

  it('moves up and down one place and renumbers positions', () => {
    const up = moveItem(makeQueue(['a', 'b', 'c']), 'c', 'up');
    expect(up.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(up.items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(moveItem(makeQueue(['a', 'b', 'c']), 'a', 'down').items.map((i) => i.id)).toEqual([
      'b',
      'a',
      'c'
    ]);
  });

  it('is a no-op at boundaries or for a missing id', () => {
    const queue = makeQueue(['a', 'b']);
    expect(moveItem(queue, 'a', 'up')).toBe(queue);
    expect(moveItem(queue, 'a', 'start')).toBe(queue);
    expect(moveItem(queue, 'b', 'down')).toBe(queue);
    expect(moveItem(queue, 'b', 'end')).toBe(queue);
    expect(moveItem(queue, 'zz', 'up')).toBe(queue);
  });
});

describe('previousItem', () => {
  it('returns the preceding item even when played', () => {
    const queue = makeQueue(['a', 'b', 'c'], 'c');
    queue.items[1].played = true;
    expect(previousItem(queue, 'c')?.id).toBe('b');
  });

  it('returns null at the head of the queue or with no current item', () => {
    const queue = makeQueue(['a', 'b']);
    expect(previousItem(queue, 'a')).toBeNull();
    expect(previousItem(queue, null)).toBeNull();
  });
});

describe('markPlayedByIds', () => {
  it('marks matching unplayed items once and preserves unrelated items', () => {
    const queue = makeQueue(['a', 'b', 'c'], 'b');
    queue.items[1].played = true;
    const result = markPlayedByIds(queue, ['a', 'a', 'b', 'missing']);

    expect(result.markedCount).toBe(1);
    expect(result.queue.items.map((item) => item.played)).toEqual([true, true, false]);
    expect(result.queue.items[0]).toMatchObject({ id: 'a', title: 'A video title', position: 0 });
    expect(result.queue.currentItemId).toBe('b');
  });

  it('is idempotent when applied more than once', () => {
    const queue = makeQueue(['a', 'b']);
    const first = markPlayedByIds(queue, ['a', 'b']);
    const second = markPlayedByIds(first.queue, ['a', 'b']);

    expect(first.markedCount).toBe(2);
    expect(second.markedCount).toBe(0);
    expect(second.queue).toEqual(first.queue);
  });
});

describe('dynamic queue list views', () => {
  it('classifies exact duration boundaries and unknown videos', () => {
    expect(isInQueueListView(makeItem({ durationSeconds: null }), 'short')).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 599 }), 'short')).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 600 }), 'long')).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 3599 }), 'long')).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 3600 }), 'essays')).toBe(true);
  });

  it('uses configured duration boundaries and normalizes invalid values', () => {
    const windows = normalizePlaylistDurationWindows({ shortPlaylistMaxMinutes: 5, essaysPlaylistMinMinutes: 30 });
    expect(isInQueueListView(makeItem({ durationSeconds: null }), 'short', windows)).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 299 }), 'short', windows)).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 300 }), 'long', windows)).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 1799 }), 'long', windows)).toBe(true);
    expect(isInQueueListView(makeItem({ durationSeconds: 1800 }), 'essays', windows)).toBe(true);
    expect(normalizePlaylistDurationWindows({ shortPlaylistMaxMinutes: 0, essaysPlaylistMinMinutes: 1 })).toEqual({
      shortMaxSeconds: 60,
      essaysMinSeconds: 120
    });
  });

  it('keeps canonical order when filtering and reorders only matching slots', () => {
    const queue = makeQueue(['a', 'b', 'c', 'd']);
    queue.items[0].durationSeconds = 60;
    queue.items[1].durationSeconds = 1200;
    queue.items[2].durationSeconds = 300;
    queue.items[3].durationSeconds = 7200;
    expect(itemsForQueueListView(queue, 'short').map((item) => item.id)).toEqual(['a', 'c']);
    expect(reorderInQueueListView(queue, ['c', 'a'], 'short').items.map((item) => item.id)).toEqual([
      'c',
      'b',
      'a',
      'd'
    ]);
  });

  it('navigates only matching, unplayed videos in a dynamic list', () => {
    const queue = makeQueue(['a', 'b', 'c', 'd'], 'a');
    queue.items[0].durationSeconds = 60;
    queue.items[1].durationSeconds = 1200;
    queue.items[2].durationSeconds = 120;
    queue.items[3].durationSeconds = 180;
    queue.items[2].played = true;
    expect(nextUnplayed(queue, 'a', 'short')?.id).toBe('d');
    expect(previousItem(queue, 'd', 'short')?.id).toBe('c');
    expect(advance(queue, 'a', 'short').next?.id).toBe('d');
  });

  it('filters and navigates using configured duration boundaries', () => {
    const queue = makeQueue(['a', 'b', 'c'], 'a');
    queue.items[0].durationSeconds = 120;
    queue.items[1].durationSeconds = 600;
    queue.items[2].durationSeconds = 2100;
    const windows = normalizePlaylistDurationWindows({ shortPlaylistMaxMinutes: 5, essaysPlaylistMinMinutes: 30 });

    expect(itemsForQueueListView(queue, 'long', windows).map((item) => item.id)).toEqual(['b']);
    expect(nextUnplayed(queue, 'a', 'essays', windows)?.id).toBe('c');
    expect(computeTotals(queue, 'long', windows)).toMatchObject({ totalSeconds: 600, remainingSeconds: 600 });
  });

  it('keeps the selected list when loading a saved playlist', () => {
    const playlist = {
      playlistId: 'playlist',
      name: 'Saved',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [makeItem({ id: 'short', durationSeconds: 60 })]
    };
    expect(loadPlaylist(playlist, 'short').selectedView).toBe('short');
  });
});
