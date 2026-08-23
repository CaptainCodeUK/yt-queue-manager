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
const ROW_CLASS = 'yqm-metadata-row';
const ROW_PARENT_CLASS = 'yqm-metadata-row-parent';
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

// Docked into the views/age (or Shorts view-count) row rather than overlaid
// on the thumbnail. The thumbnail is where YouTube's hover-preview player
// lives, and nothing we tried — re-anchoring on host swap, chasing z-index,
// even a viewport-fixed portal layer — could reliably stay above or ahead of
// it. The metadata row is plain text YouTube doesn't touch on hover, so the
// button just becomes part of normal document flow, right-aligned.
function injectButton(container: Element, info: ThumbnailInfo): void {
  const row = findMetadataRow(container);
  if (!row) return;
  row.classList.add(ROW_CLASS);
  // yt-content-metadata-view-model (the row's parent, for the non-Shorts
  // layout) is an unstyled custom element and defaults to display:inline,
  // which shrink-wraps it to the row's own content instead of filling the
  // genuinely-wide box above it — that's why margin-left: auto on the row
  // has no space to push into. Forcing it to a block that fills its parent
  // routes that real width down to the row.
  if (row.parentElement) row.parentElement.classList.add(ROW_PARENT_CLASS);
  const button = createAddToQueueButton(info);
  button.classList.add(OVERLAY_CLASS);
  row.appendChild(button);
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
  scanForThumbnails();
  if (observer) return;
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}
