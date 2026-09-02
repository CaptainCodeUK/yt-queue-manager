import { createAddToQueueButtonGroup } from './add-to-queue-button';
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

// Overlaid bottom-left on the thumbnail itself. Docking it in the metadata
// row instead (to dodge YouTube's hover-preview player) kept landing on
// shelves/carousels differently than in a plain grid, causing more
// regressions than it fixed — this is simpler and correct everywhere,
// accepting that it can get covered or evicted while a preview is playing.
function injectButton(container: Element, info: ThumbnailInfo): void {
  const host = findThumbnailHost(container);
  ensurePositioned(host);
  const button = createAddToQueueButtonGroup(info, { compact: true });
  button.classList.add(OVERLAY_CLASS);
  host.appendChild(button);

  // YouTube's hover-preview player can wipe a host's children, or swap the
  // host element for a new instance entirely. A MutationObserver bound to
  // the old host never fires once it's been replaced, so we watch the
  // stable card container instead and re-resolve the host on demand. Gated
  // on the button actually leaving the container (not merely being
  // reordered within it) to avoid fighting YouTube's own re-append-to-front
  // logic for its preview frames, which hung the tab when we reacted to
  // every reorder.
  const keepMounted = new MutationObserver(() => {
    if (container.contains(button)) return;
    const currentHost = findThumbnailHost(container);
    ensurePositioned(currentHost);
    currentHost.appendChild(button);
  });
  keepMounted.observe(container, { childList: true, subtree: true });
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
