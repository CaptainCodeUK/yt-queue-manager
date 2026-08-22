import { ActiveQueue, VideoId } from './types';
import { computeTotals, formatDuration } from './queue-engine';

export interface QueueListCallbacks {
  onReorder: (orderedIds: VideoId[]) => void;
  onRemove: (id: VideoId) => void;
  onPlayNow: (id: VideoId) => void;
  onClearPlayed: () => void;
}

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
export function renderQueueList(container: HTMLElement, queue: ActiveQueue, callbacks: QueueListCallbacks): void {
  container.innerHTML = '';

  const totalsEl = document.createElement('div');
  totalsEl.className = 'yqm-totals';
  totalsEl.textContent = totalsLabel(computeTotals(queue));
  container.appendChild(totalsEl);

  if (queue.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'yqm-empty-state';
    empty.textContent = 'Queue is empty';
    container.appendChild(empty);
    return;
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'yqm-clear-played-button';
  clearButton.textContent = 'Clear played';
  clearButton.addEventListener('click', () => callbacks.onClearPlayed());
  container.appendChild(clearButton);

  const sorted = [...queue.items].sort((a, b) => a.position - b.position);
  const list = document.createElement('ul');
  list.className = 'yqm-queue-list';

  sorted.forEach((item) => {
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

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'yqm-play-button';
    playButton.title = 'Play now';
    playButton.textContent = '▶';
    playButton.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onPlayNow(item.id);
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
