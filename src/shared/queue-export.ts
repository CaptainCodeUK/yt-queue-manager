import { ActiveQueue, QueueItem, VideoId } from './types';

// Text-based export/import for the manual Vivaldi Notes relay: the extension
// never touches Notes directly (no third-party extension API for that
// exists), it only produces/consumes this text — the user carries it via a
// Note themselves.

const EXPORT_MARKER = 1;

interface QueueExportPayload {
  yqm: typeof EXPORT_MARKER;
  updatedAt: number;
  currentItemId: VideoId | null;
  items: QueueItem[];
}

export function buildQueueExportText(queue: ActiveQueue): string {
  const payload: QueueExportPayload = {
    yqm: EXPORT_MARKER,
    updatedAt: queue.updatedAt,
    currentItemId: queue.currentItemId,
    items: queue.items
  };
  return JSON.stringify(payload, null, 2);
}

export interface ParsedQueueExport {
  items: QueueItem[];
  currentItemId: VideoId | null;
}

function isQueueItem(value: unknown): value is QueueItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.position === 'number';
}

/** Parses text pasted back from a Note. Returns null for anything that isn't a valid export — malformed JSON, a stray note, or an export from something else entirely. */
export function parseQueueExport(text: string): ParsedQueueExport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const payload = parsed as Record<string, unknown>;
  if (payload.yqm !== EXPORT_MARKER) return null;
  if (!Array.isArray(payload.items) || !payload.items.every(isQueueItem)) return null;

  const currentItemId = typeof payload.currentItemId === 'string' ? payload.currentItemId : null;
  return { items: payload.items, currentItemId };
}
