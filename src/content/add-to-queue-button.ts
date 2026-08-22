import { updateActiveQueue } from '../shared/storage';
import { addItem } from '../shared/queue-engine';
import { QueueItem } from '../shared/types';

export type AddButtonVideoInfo = Pick<
  QueueItem,
  'id' | 'title' | 'channelName' | 'channelId' | 'thumbnailUrl' | 'durationSeconds' | 'durationSource'
>;

/**
 * Shared label/icon so every entry point (thumbnail overlay, watch-page
 * button, injected menu item) reads as the same, unmistakably-ours action —
 * deliberately distinct from YouTube's own "Add to queue" wording so the
 * two aren't confused for each other.
 */
export const ADD_TO_QUEUE_ICON = '➕';
export const ADD_TO_QUEUE_LABEL = 'Add to My Queue';
export const ADDED_LABEL = 'Added ✓';

export async function addVideoToQueue(info: AddButtonVideoInfo): Promise<void> {
  await updateActiveQueue((queue) => addItem(queue, info));
}

export function createAddToQueueButton(info: AddButtonVideoInfo): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yqm-add-to-queue-button';
  button.textContent = `${ADD_TO_QUEUE_ICON} ${ADD_TO_QUEUE_LABEL}`;

  button.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = ADDED_LABEL;
      await addVideoToQueue(info);
      setTimeout(() => {
        button.disabled = false;
        button.textContent = `${ADD_TO_QUEUE_ICON} ${ADD_TO_QUEUE_LABEL}`;
      }, 1500);
    },
    { capture: true }
  );

  return button;
}
