import { createAddToQueueButton } from './add-to-queue-button';
import { QueueItem } from '../shared/types';
import {
  THUMBNAIL_CARD_SELECTOR,
  extractVideoIdFromHref,
  findThumbnailAnchor,
  findMetadataRow,
  extractCardTitle,
  extractCardChannelName
} from '../shared/youtube-parsing';

const PROCESSED_ATTR = 'data-yqm-processed';
const CONTAINER_CLASS = 'yqm-thumb-container';
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

function ensurePositioned(el: HTMLElement): void {
  if (getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
  }
}

const repositionFns = new Set<() => void>();
let resizeListenerBound = false;

function ensureResizeListener(): void {
  if (resizeListenerBound) return;
  resizeListenerBound = true;
  window.addEventListener(
    'resize',
    () => repositionFns.forEach((fn) => fn()),
    { passive: true }
  );
}

// Anchored to the card itself (right edge), not the metadata row's own
// width — the row shrink-wraps through several unstyled ancestor levels
// (yt-content-metadata-view-model, its plain-div parent) with no reliable
// single point to force wide, so margin-left: auto on the row landed
// inconsistently across cards. The row is only used here to compute a
// matching vertical offset; horizontal placement comes from the card.
// Docking near the metadata text at all (rather than over the thumbnail)
// still matters: that's where YouTube's hover-preview player lives, and
// nothing tried there — re-anchoring on host swap, chasing z-index, even a
// viewport-fixed portal layer — reliably stayed visible once a preview
// started playing.
function injectButton(container: Element, info: ThumbnailInfo): void {
  const row = findMetadataRow(container);
  if (!row) return;

  const host = container as HTMLElement;
  ensurePositioned(host);

  const button = createAddToQueueButton(info);
  button.classList.add(OVERLAY_CLASS);
  host.appendChild(button);

  const positionButton = (): void => {
    if (!host.isConnected) {
      repositionFns.delete(positionButton);
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    button.style.top = `${rowRect.top - hostRect.top + (rowRect.height - button.offsetHeight) / 2}px`;
  };
  positionButton();
  repositionFns.add(positionButton);
}

function processContainer(container: Element): void {
  if (container.hasAttribute(PROCESSED_ATTR)) return;
  const anchor = findThumbnailAnchor(container);
  const videoId = extractVideoIdFromHref(anchor?.getAttribute('href'));
  if (!videoId) return;
  container.setAttribute(PROCESSED_ATTR, 'true');
  container.classList.add(CONTAINER_CLASS);
  injectButton(container, buildThumbnailInfo(container, videoId, anchor));
}

export function scanForThumbnails(root: ParentNode = document): void {
  root.querySelectorAll(THUMBNAIL_CARD_SELECTOR).forEach((container) => {
    // THUMBNAIL_CARD_SELECTOR mixes legacy and yt-lockup-view-model-era
    // selectors, and YouTube now nests one inside the other for the same
    // visual card (e.g. yt-lockup-view-model inside ytd-rich-item-renderer).
    // Without this check both match and each would get its own button.
    // Defer to the innermost match.
    if (container.querySelector(THUMBNAIL_CARD_SELECTOR)) return;
    processContainer(container);
  });
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
  ensureResizeListener();
  scanForThumbnails();
  if (observer) return;
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}
