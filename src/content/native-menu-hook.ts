import { updateActiveQueue } from '../shared/storage';
import { addItem } from '../shared/queue-engine';

const THUMBNAIL_CONTAINER_SELECTOR =
  'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer';
const WATCH_PAGE_CONTAINER_SELECTOR = 'ytd-watch-metadata, ytd-watch-flexy';
const MENU_TRIGGER_SELECTOR = 'ytd-menu-renderer yt-icon-button#button, ytd-menu-renderer tp-yt-paper-icon-button';

function extractVideoIdFromAncestor(el: Element): string | null {
  const watchContainer = el.closest(WATCH_PAGE_CONTAINER_SELECTOR);
  if (watchContainer) {
    return new URLSearchParams(location.search).get('v');
  }

  const container = el.closest(THUMBNAIL_CONTAINER_SELECTOR);
  if (!container) return null;

  const anchor = container.querySelector<HTMLAnchorElement>('a#thumbnail, a#video-title, a[href*="/watch?v="]');
  const href = anchor?.getAttribute('href');
  if (!href) return null;
  try {
    return new URL(href, location.origin).searchParams.get('v');
  } catch {
    return null;
  }
}

function extractTitleFromAncestor(el: Element): string {
  const container = el.closest(`${THUMBNAIL_CONTAINER_SELECTOR}, ${WATCH_PAGE_CONTAINER_SELECTOR}`);
  return container?.querySelector('#video-title')?.textContent?.trim() ?? document.title.replace(/ - YouTube$/, '');
}

let pendingVideoId: string | null = null;
let pendingTitle = '';

/**
 * Best-effort interception of YouTube's own "Add to queue" three-dot menu
 * item, so a native click also lands in our queue instead of only
 * YouTube's. Text-matching the menu item is not locale-proof and YouTube's
 * markup can change — this is a "nice to have" unification layer, not the
 * reliability backbone (that's the always-present overlay button).
 */
function onDocumentClickCapture(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;

  const menuTrigger = target.closest(MENU_TRIGGER_SELECTOR);
  if (menuTrigger) {
    pendingVideoId = extractVideoIdFromAncestor(menuTrigger);
    pendingTitle = extractTitleFromAncestor(menuTrigger);
    return;
  }

  const menuItem = target.closest('ytd-menu-service-item-renderer');
  if (!menuItem) return;

  const videoId = pendingVideoId;
  pendingVideoId = null;
  if (!videoId) return;

  const text = menuItem.textContent?.toLowerCase() ?? '';
  if (!text.includes('queue')) return;

  void updateActiveQueue((queue) =>
    addItem(queue, {
      id: videoId,
      title: pendingTitle,
      channelName: '',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: null,
      durationSource: 'unknown'
    })
  );
}

export function startNativeMenuHook(): void {
  document.addEventListener('click', onDocumentClickCapture, { capture: true });
}
