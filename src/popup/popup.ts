import { getActiveQueue, subscribe } from '../shared/storage';
import { computeTotals, formatDuration } from '../shared/queue-engine';
import { ActiveQueue } from '../shared/types';

const app = document.getElementById('app')!;

function render(queue: ActiveQueue): void {
  if (queue.items.length === 0) {
    app.innerHTML = '<div class="empty-state">Queue is empty</div>';
    return;
  }

  const totals = computeTotals(queue);
  const totalLabel = `${formatDuration(totals.totalSeconds)}${
    totals.totalUnknownCount > 0 ? ` + ${totals.totalUnknownCount} unknown` : ''
  }`;
  const remainingLabel = `${formatDuration(totals.remainingSeconds)}${
    totals.remainingUnknownCount > 0 ? ` + ${totals.remainingUnknownCount} unknown` : ''
  }`;

  const rows = queue.items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (item) =>
        `<li${item.played ? ' class="played"' : ''}>${item.played ? '✓ ' : ''}${escapeHtml(item.title)}</li>`
    )
    .join('');

  app.innerHTML = `
    <div class="totals">Total: ${totalLabel} · Remaining: ${remainingLabel}</div>
    <ul id="queue-list">${rows}</ul>
  `;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

getActiveQueue().then(render);
subscribe('activeQueue', render);
