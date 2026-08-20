import { getActiveQueue, subscribe, updateActiveQueue } from '../shared/storage';
import { removeItem, reorder, clearPlayed } from '../shared/queue-engine';
import { renderQueueList } from '../shared/queue-list-view';
import { sendMessage } from '../shared/messaging';
import { ActiveQueue } from '../shared/types';

const app = document.getElementById('app')!;

function render(queue: ActiveQueue): void {
  renderQueueList(app, queue, {
    onReorder: (orderedIds) => void updateActiveQueue((q) => reorder(q, orderedIds)),
    onRemove: (id) => void updateActiveQueue((q) => removeItem(q, id)),
    onPlayNow: (id) => void sendMessage({ type: 'navigateToVideo', videoId: id }),
    onClearPlayed: () => void updateActiveQueue((q) => clearPlayed(q))
  });
}

getActiveQueue().then(render);
subscribe('activeQueue', render);
