import { ActiveQueue, QueueListView, VideoId } from './types';
import { computeTotals, formatDuration, itemsForQueueListView, normalizeQueueListView, PlaylistDurationWindows } from './queue-engine';

export interface QueueListCallbacks {
  onReorder: (orderedIds: VideoId[]) => void;
  onRemove: (id: VideoId) => void;
  onPlayNow: (id: VideoId, view: QueueListView) => void;
  onClearPlayed: () => void;
  onViewChange: (view: QueueListView) => void;
}

const QUEUE_LIST_TABS: Array<[QueueListView, string]> = [
  ['all', 'All'],
  ['short', 'Short'],
  ['long', 'Long'],
  ['essays', 'Essays']
];

function totalsLabel(totals: ReturnType<typeof computeTotals>): string {
  const total = `${formatDuration(totals.totalSeconds)}${
    totals.totalUnknownCount > 0 ? ` +${totals.totalUnknownCount} unknown` : ''
  }`;
  const remaining = `${formatDuration(totals.remainingSeconds)}${
    totals.remainingUnknownCount > 0 ? ` +${totals.remainingUnknownCount} unknown` : ''
  }`;
  return `Total: ${total} · Remaining: ${remaining}`;
}

/**
 * Imperative, framework-free renderer shared by the popup and the in-page
 * panel so drag-and-drop/list logic isn't duplicated. Full re-render on
 * every call — list sizes are realistically in the tens of items, so
 * fine-grained diffing isn't worth the complexity.
 */
export function renderQueueList(
  container: HTMLElement,
  queue: ActiveQueue,
  callbacks: QueueListCallbacks,
  windows: PlaylistDurationWindows
): void {
  container.innerHTML = '';
  const view = normalizeQueueListView(queue.selectedView);

  const tabs = document.createElement('div');
  tabs.className = 'yqm-queue-tabs';
  tabs.setAttribute('role', 'tablist');
  QUEUE_LIST_TABS.forEach(([tabView, label]) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'yqm-queue-tab';
    tab.textContent = label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(tabView === view));
    if (tabView === view) tab.classList.add('selected');
    tab.addEventListener('click', () => callbacks.onViewChange(tabView));
    tabs.appendChild(tab);
  });
  container.appendChild(tabs);

  const totalsEl = document.createElement('div');
  totalsEl.className = 'yqm-totals';
  totalsEl.textContent = totalsLabel(computeTotals(queue, view, windows));
  container.appendChild(totalsEl);

  const sorted = itemsForQueueListView(queue, view, windows);
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'yqm-empty-state';
    empty.textContent = view === 'all' ? 'Queue is empty' : 'No videos in this list';
    container.appendChild(empty);
    return;
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'yqm-clear-played-button';
  clearButton.textContent = 'Clear played';
  clearButton.addEventListener('click', () => callbacks.onClearPlayed());
  container.appendChild(clearButton);

  const list = document.createElement('ul');
  list.className = 'yqm-queue-list';

  sorted.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'yqm-queue-item';
    li.draggable = true;
    li.dataset.id = item.id;
    if (item.played) li.classList.add('played');
    if (item.id === queue.currentItemId) li.classList.add('current');

    const dragHandle = document.createElement('span');
    dragHandle.className = 'yqm-drag-handle';
    dragHandle.textContent = '⠿';
    li.appendChild(dragHandle);

    const thumb = document.createElement('img');
    thumb.className = 'yqm-item-thumb';
    thumb.src = item.thumbnailUrl;
    thumb.alt = '';
    li.appendChild(thumb);

    const title = document.createElement('span');
    title.className = 'yqm-item-title';
    title.textContent = item.title || item.id;
    title.title = item.title || item.id;
    li.appendChild(title);

    const duration = document.createElement('span');
    duration.className = 'yqm-item-duration';
    duration.textContent = item.durationSeconds !== null ? formatDuration(item.durationSeconds) : '—';
    li.appendChild(duration);

    const moveControls = document.createElement('span');
    moveControls.className = 'yqm-move-controls';
    const isFirst = index === 0;
    const isLast = index === sorted.length - 1;
    const moveButtons: Array<[string, string, string, boolean]> = [
      ['start', '⤒', 'Move to start', isFirst],
      ['up', '▲', 'Move up', isFirst],
      ['down', '▼', 'Move down', isLast],
      ['end', '⤓', 'Move to end', isLast]
    ];
    moveButtons.forEach(([target, glyph, label, disabled]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `yqm-move-button yqm-move-${target}`;
      button.title = label;
      button.textContent = glyph;
      button.disabled = disabled;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const ids = sorted.map((queuedItem) => queuedItem.id);
        const currentIndex = ids.indexOf(item.id);
        const destination =
          target === 'start' ? 0 : target === 'end' ? ids.length - 1 : target === 'up' ? currentIndex - 1 : currentIndex + 1;
        ids.splice(currentIndex, 1);
        ids.splice(destination, 0, item.id);
        callbacks.onReorder(ids);
      });
      moveControls.appendChild(button);
    });
    li.appendChild(moveControls);

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'yqm-play-button';
    playButton.title = 'Play now';
    playButton.textContent = '▶';
    playButton.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onPlayNow(item.id, view);
    });
    li.appendChild(playButton);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'yqm-remove-button';
    removeButton.title = 'Remove';
    removeButton.textContent = '✕';
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onRemove(item.id);
    });
    li.appendChild(removeButton);

    li.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', item.id);
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (event) => event.preventDefault());
    li.addEventListener('drop', (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer?.getData('text/plain');
      if (!draggedId || draggedId === item.id) return;
      const ids = sorted.map((i) => i.id);
      const fromIndex = ids.indexOf(draggedId);
      const toIndex = ids.indexOf(item.id);
      if (fromIndex === -1 || toIndex === -1) return;
      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, draggedId);
      callbacks.onReorder(ids);
    });

    list.appendChild(li);
  });

  container.appendChild(list);
}
