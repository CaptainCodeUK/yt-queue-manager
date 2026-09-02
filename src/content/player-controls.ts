import { getActiveQueue, subscribe, updateActiveQueue } from '../shared/storage';
import { advance, nextUnplayed, normalizeQueueListView, previousItem } from '../shared/queue-engine';
import { ActiveQueue } from '../shared/types';
import { watchUrl } from '../shared/youtube-parsing';
import { spaNavigate } from './navigation';

const PREV_CLASS = 'yqm-player-prev';
const NEXT_CLASS = 'yqm-player-next';

/** Seconds into a video beyond which Previous restarts it instead of stepping back a video. */
const RESTART_THRESHOLD_SECONDS = 5;

let prevButton: HTMLButtonElement | null = null;
let nextButton: HTMLButtonElement | null = null;
let playerObserver: MutationObserver | null = null;
let subscribed = false;
let latestQueue: ActiveQueue | null = null;

function createButton(className: string, glyph: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ytp-button ${className}`;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.textContent = glyph;
  return button;
}

async function goToNext(): Promise<void> {
  const queue = await getActiveQueue();
  const playbackView = normalizeQueueListView(queue.playbackView);
  const current = queue.currentItemId;
  if (!current) {
    const first = nextUnplayed(queue, null, playbackView);
    if (!first) return;
    await updateActiveQueue((q) => ({ ...q, currentItemId: first.id }));
    spaNavigate(watchUrl(first.id));
    return;
  }
  const { queue: updated, next } = advance(queue, current, playbackView);
  if (!next) return;
  await updateActiveQueue(() => updated);
  spaNavigate(watchUrl(next.id));
}

async function goToPrevious(): Promise<void> {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (video && video.currentTime > RESTART_THRESHOLD_SECONDS) {
    video.currentTime = 0;
    return;
  }
  const queue = await getActiveQueue();
  const previous = previousItem(queue, queue.currentItemId, normalizeQueueListView(queue.playbackView));
  if (!previous) return;
  await updateActiveQueue((q) => ({
    ...q,
    items: q.items.map((item) => (item.id === previous.id ? { ...item, played: false } : item)),
    currentItemId: previous.id
  }));
  spaNavigate(watchUrl(previous.id));
}

function applyQueueState(queue: ActiveQueue): void {
  latestQueue = queue;
  if (!prevButton || !nextButton) return;

  const hidden = queue.items.length === 0;
  prevButton.hidden = hidden;
  nextButton.hidden = hidden;
  if (hidden) return;

  // Previous also restarts the current video, so it stays enabled whenever
  // a queue exists; only forward movement can genuinely run out of targets.
  prevButton.disabled = false;
  nextButton.disabled = nextUnplayed(queue, queue.currentItemId, normalizeQueueListView(queue.playbackView)) === null;
}

function mount(): boolean {
  const controls = document.querySelector('.ytp-left-controls');
  const playButton = controls?.querySelector('.ytp-play-button');
  if (!controls || !playButton) return false;
  if (controls.querySelector(`.${PREV_CLASS}`) && controls.querySelector(`.${NEXT_CLASS}`)) {
    return true;
  }

  controls.querySelectorAll(`.${PREV_CLASS}, .${NEXT_CLASS}`).forEach((el) => el.remove());

  prevButton = createButton(PREV_CLASS, '⏮', 'Previous in My Queue');
  prevButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void goToPrevious();
  });

  nextButton = createButton(NEXT_CLASS, '⏭', 'Next in My Queue');
  nextButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void goToNext();
  });

  controls.insertBefore(prevButton, playButton);
  playButton.after(nextButton);

  if (latestQueue) applyQueueState(latestQueue);
  return true;
}

function ensureMounted(): void {
  const controls = document.querySelector('.ytp-left-controls');
  if (controls?.querySelector(`.${PREV_CLASS}`) && controls?.querySelector(`.${NEXT_CLASS}`)) return;
  mount();
}

/**
 * Adds Previous/Next queue buttons either side of the native play/pause
 * button. YouTube rebuilds its control bar on navigation and on player
 * size/mode changes, discarding injected children, so this keeps them
 * mounted via a MutationObserver — the same pattern used by the panel.
 */
export function ensurePlayerQueueButtons(): void {
  ensureMounted();

  if (!playerObserver) {
    playerObserver = new MutationObserver(ensureMounted);
    playerObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (!subscribed) {
    subscribed = true;
    void getActiveQueue().then(applyQueueState);
    subscribe('activeQueue', applyQueueState);
  }
}
