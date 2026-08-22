import { createAddToQueueButton } from './add-to-queue-button';
import { QueueItem } from '../shared/types';
import {
  THUMBNAIL_CARD_SELECTOR,
  extractVideoIdFromHref,
  findThumbnailAnchor,
  findThumbnailHost,
  extractCardTitle,
  extractCardChannelName
} from '../shared/youtube-parsing';

const PROCESSED_ATTR = 'data-yqm-processed';
const OVERLAY_CLASS = 'yqm-thumb-overlay';

type ThumbnailInfo = Pick<
  QueueItem,
  'id' | 'title' | 'channelName' | 'thumbnailUrl' | 'durationSeconds' | 'durationSource'
>;

/** Parses a rendered duration badge (e.g. "12:34" or "1:02:03") into seconds. Best-effort fallback only — see duration-resolution notes in the plan. */
function extractDurationSeconds(container: Element): number | null {
  const text = container
    .querySelector(
      'ytd-thumbnail-overlay-time-status-renderer #text, .badge-shape-wiz__text, .ytBadgeShapeText'
    )
    ?.textContent?.trim();
  if (!text) return null;
  const parts = text.split(':').map((part) => parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function buildThumbnailInfo(container: Element, videoId: string, anchor: HTMLAnchorElement | null): ThumbnailInfo {
  return {
    id: videoId,
    title: extractCardTitle(container, anchor),
    channelName: extractCardChannelName(container),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: extractDurationSeconds(container),
    durationSource: 'domBadge'
  };
}

function injectButton(container: Element, info: ThumbnailInfo): void {
  const host = findThumbnailHost(container);
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }
  const button = createAddToQueueButton(info);
  button.classList.add(OVERLAY_CLASS);
  host.appendChild(button);

  // YouTube's hover-preview player can wipe/rebuild the host's children,
  // evicting our button. Re-append only when it's actually gone — reacting
  // to mere reordering would fight YouTube's own re-append-to-front logic
  // for its preview frames and loop the two observers against each other
  // indefinitely (this hung the tab in testing).
  const keepMounted = new MutationObserver(() => {
    if (!host.contains(button)) host.appendChild(button);
  });
  keepMounted.observe(host, { childList: true });
}

function processContainer(container: Element): void {
  if (container.hasAttribute(PROCESSED_ATTR)) return;
  const anchor = findThumbnailAnchor(container);
  const videoId = extractVideoIdFromHref(anchor?.getAttribute('href'));
  if (!videoId) return;
  container.setAttribute(PROCESSED_ATTR, 'true');
  injectButton(container, buildThumbnailInfo(container, videoId, anchor));
}

export function scanForThumbnails(root: ParentNode = document): void {
  root.querySelectorAll(THUMBNAIL_CARD_SELECTOR).forEach(processContainer);
}

let observer: MutationObserver | null = null;
let scanScheduled = false;

function scheduleScan(): void {
  if (scanScheduled) return;
  scanScheduled = true;
  const run = () => {
    scanScheduled = false;
    scanForThumbnails();
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) {
    ric(run, { timeout: 500 });
  } else {
    window.requestAnimationFrame(run);
  }
}

/** Starts the MutationObserver-based scan. Safe to call once; also worth re-invoking `scanForThumbnails()` directly after SPA navigation as a redundant safety net. */
export function startThumbnailScanner(): void {
  scanForThumbnails();
  if (observer) return;
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}
