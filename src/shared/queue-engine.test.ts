import { describe, it, expect } from 'vitest';
import { addItemNext, moveItem, previousItem } from './queue-engine';
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
