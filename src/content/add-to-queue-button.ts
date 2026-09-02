import { updateActiveQueue } from '../shared/storage';
import { addItem, addItemNext } from '../shared/queue-engine';
import { QueueItem } from '../shared/types';

export type AddButtonVideoInfo = Pick<
  QueueItem,
  'id' | 'title' | 'channelName' | 'channelId' | 'thumbnailUrl' | 'durationSeconds' | 'durationSource'
>;

/** Where a newly added video lands: right after the current item, or at the end of the queue. */
export type AddMode = 'next' | 'last';

/**
 * Shared labels/icons so every entry point (thumbnail overlay, watch-page
 * button, injected menu item) reads as the same, unmistakably-ours action —
 * deliberately distinct from YouTube's own "Add to queue" wording so the
 * two aren't confused for each other.
 */
export const ADD_TO_QUEUE_ICON = '+';
export const PLAY_NEXT_ICON = '⏭';
export const ADD_TO_QUEUE_LABEL = 'Add to My Queue';
export const PLAY_NEXT_LABEL = `${ADD_TO_QUEUE_LABEL} - Play Next`;
export const PLAY_LAST_LABEL = `${ADD_TO_QUEUE_LABEL} - Play Last`;
export const ADDED_LABEL = 'Added ✓';

export function addModeIcon(mode: AddMode): string {
  return mode === 'next' ? PLAY_NEXT_ICON : ADD_TO_QUEUE_ICON;
}

export function addModeLabel(mode: AddMode): string {
  return mode === 'next' ? PLAY_NEXT_LABEL : PLAY_LAST_LABEL;
}

export async function addVideoToQueue(info: AddButtonVideoInfo, mode: AddMode = 'last'): Promise<void> {
  await updateActiveQueue((queue) => (mode === 'next' ? addItemNext(queue, info) : addItem(queue, info)));
}

export interface AddButtonOptions {
  /** Renders icon-only with the full label as a tooltip, for cramped hosts like thumbnail overlays. */
  compact?: boolean;
}

export function createAddToQueueButton(
  info: AddButtonVideoInfo,
  mode: AddMode = 'last',
  options: AddButtonOptions = {}
): HTMLButtonElement {
  const label = addModeLabel(mode);
  const icon = addModeIcon(mode);
  const idleText = options.compact ? icon : `${icon} ${label}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `yqm-add-to-queue-button yqm-add-${mode}`;
  button.title = label;
  button.textContent = idleText;

  button.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = options.compact ? '✓' : ADDED_LABEL;
      await addVideoToQueue(info, mode);
      setTimeout(() => {
        button.disabled = false;
        button.textContent = idleText;
      }, 1500);
    },
    { capture: true }
  );

  return button;
}

/** Both add actions ("Play Next" and "Play Last") wrapped in a single container. */
export function createAddToQueueButtonGroup(
  info: AddButtonVideoInfo,
  options: AddButtonOptions = {}
): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'yqm-add-to-queue-group';
  group.appendChild(createAddToQueueButton(info, 'next', options));
  group.appendChild(createAddToQueueButton(info, 'last', options));
  return group;
}
