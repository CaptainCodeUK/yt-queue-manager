import { describe, it, expect } from 'vitest';
import { buildQueueExportText, parseQueueExport } from './queue-export';
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

function makeQueue(overrides: Partial<ActiveQueue> = {}): ActiveQueue {
  return { ...emptyActiveQueue(), ...overrides };
}

describe('buildQueueExportText / parseQueueExport round trip', () => {
  it('round-trips a queue with items', () => {
    const queue = makeQueue({
      items: [makeItem({ id: 'a', position: 0 }), makeItem({ id: 'b', position: 1 })],
      currentItemId: 'b'
    });
    const parsed = parseQueueExport(buildQueueExportText(queue));
    expect(parsed?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(parsed?.currentItemId).toBe('b');
  });

  it('round-trips an empty queue', () => {
    const parsed = parseQueueExport(buildQueueExportText(makeQueue()));
    expect(parsed).toEqual({ items: [], currentItemId: null });
  });
});

describe('parseQueueExport rejects invalid input', () => {
  it('returns null for text that is not valid JSON', () => {
    expect(parseQueueExport('paste me into a note, please')).toBeNull();
  });

  it('returns null for valid JSON missing the yqm marker', () => {
    expect(parseQueueExport(JSON.stringify({ items: [], currentItemId: null }))).toBeNull();
  });

  it('returns null when an item is missing required fields', () => {
    const text = JSON.stringify({ yqm: 1, currentItemId: null, items: [{ title: 'no id or position' }] });
    expect(parseQueueExport(text)).toBeNull();
  });
});
