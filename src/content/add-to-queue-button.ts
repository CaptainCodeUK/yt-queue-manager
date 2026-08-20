import { updateActiveQueue } from '../shared/storage';
import { addItem } from '../shared/queue-engine';
import { QueueItem } from '../shared/types';

export type AddButtonVideoInfo = Pick<
  QueueItem,
  'id' | 'title' | 'channelName' | 'channelId' | 'thumbnailUrl' | 'durationSeconds' | 'durationSource'
>;

export async function addVideoToQueue(info: AddButtonVideoInfo): Promise<void> {
  await updateActiveQueue((queue) => addItem(queue, info));
}

export function createAddToQueueButton(info: AddButtonVideoInfo): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yqm-add-to-queue-button';
  button.textContent = '+ Add to queue';

  button.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Added ✓';
      await addVideoToQueue(info);
      setTimeout(() => {
        button.disabled = false;
        button.textContent = '+ Add to queue';
      }, 1500);
    },
    { capture: true }
  );

  return button;
}
