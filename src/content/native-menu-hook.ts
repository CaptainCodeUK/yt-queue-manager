import { AddMode, addModeIcon, addModeLabel, addVideoToQueue } from './add-to-queue-button';
import {
  THUMBNAIL_CARD_SELECTOR,
  WATCH_PAGE_CONTAINER_SELECTOR,
  extractVideoIdFromHref,
  findThumbnailAnchor,
  extractCardTitle
} from '../shared/youtube-parsing';

const MENU_TRIGGER_SELECTOR = "button[title='More actions'], button[aria-label='More actions']";
const MENU_POPUP_SELECTOR =
  "ytd-menu-popup-renderer, tp-yt-iron-dropdown[aria-hidden='false'], tp-yt-iron-dropdown:not([aria-hidden])";
const MENU_ITEM_CLASS = 'yqm-menu-item';

interface PendingVideo {
  videoId: string;
  title: string;
}

function extractInfoFromTrigger(trigger: Element): PendingVideo | null {
  const watchContainer = trigger.closest(WATCH_PAGE_CONTAINER_SELECTOR);
  if (watchContainer) {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return null;
    return { videoId, title: document.title.replace(/ - YouTube$/, '') };
  }

  const card = trigger.closest(THUMBNAIL_CARD_SELECTOR);
  if (!card) return null;
  const anchor = findThumbnailAnchor(card);
  const videoId = extractVideoIdFromHref(anchor?.getAttribute('href'));
  if (!videoId) return null;
  return { videoId, title: extractCardTitle(card, anchor) };
}

let pending: PendingVideo | null = null;
let popupObserver: MutationObserver | null = null;

function closeNativeMenu(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/**
 * Injects our own "Add to queue" row into the native three-dot dropdown,
 * styled to sit alongside YouTube's real items but wired entirely to our
 * own queue — it never touches YouTube's native queue/menu handlers.
 */
function injectMenuItem(popup: Element): void {
  popup.querySelectorAll(`.${MENU_ITEM_CLASS}`).forEach((el) => el.remove());
  if (!pending) return;
  const video = pending;

  const listbox = popup.querySelector('tp-yt-paper-listbox, #items') ?? popup;

  const buildItem = (mode: AddMode): HTMLDivElement => {
    const item = document.createElement('div');
    item.className = MENU_ITEM_CLASS;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-video-id', video.videoId);
    item.innerHTML = `<span class="yqm-menu-item-icon">${addModeIcon(mode)}</span><span>${addModeLabel(mode)}</span>`;
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void addVideoToQueue(
        {
          id: video.videoId,
          title: video.title,
          channelName: '',
          thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
          durationSeconds: null,
          durationSource: 'unknown'
        },
        mode
      );
      closeNativeMenu();
    });
    return item;
  };

  listbox.prepend(buildItem('next'), buildItem('last'));
}

function watchForPopup(): void {
  popupObserver?.disconnect();
  popupObserver = new MutationObserver(() => {
    const popup = document.querySelector(MENU_POPUP_SELECTOR);
    if (!popup) return;
    const existing = popup.querySelector(`.${MENU_ITEM_CLASS}`);
    const existingVideoId = existing?.getAttribute('data-video-id');
    if (existingVideoId !== pending?.videoId) {
      injectMenuItem(popup);
    }
  });
  popupObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden']
  });
  window.setTimeout(() => popupObserver?.disconnect(), 2000);
}

function onDocumentClickCapture(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;
  const trigger = target.closest(MENU_TRIGGER_SELECTOR);
  if (!trigger) return;
  pending = extractInfoFromTrigger(trigger);
  if (pending) watchForPopup();
}

export function startNativeMenuHook(): void {
  document.addEventListener('click', onDocumentClickCapture, { capture: true });
}
