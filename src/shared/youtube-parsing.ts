interface YtPlayerVideoDetails {
  title?: string;
  author?: string;
  channelId?: string;
  lengthSeconds?: string;
}

interface YtInitialPlayerResponse {
  videoDetails?: YtPlayerVideoDetails;
}

function getYtInitialPlayerResponse(): YtInitialPlayerResponse | null {
  return (window as unknown as { ytInitialPlayerResponse?: YtInitialPlayerResponse })
    .ytInitialPlayerResponse ?? null;
}

export interface WatchPageVideoInfo {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Returns the video id from the URL if the current page is a watch page, else null. */
export function getCurrentVideoId(): string | null {
  if (location.pathname !== '/watch') return null;
  return new URLSearchParams(location.search).get('v');
}

/**
 * Best-effort extraction of the current watch page's video metadata.
 * `ytInitialPlayerResponse` is authoritative for the currently loaded video
 * but isn't guaranteed fresh after every SPA navigation, so callers should
 * treat `durationSeconds` as a first pass, correctable later from the
 * <video> element once its metadata loads.
 */
export function getCurrentWatchPageInfo(): WatchPageVideoInfo | null {
  const videoId = getCurrentVideoId();
  if (!videoId) return null;

  const details = getYtInitialPlayerResponse()?.videoDetails;
  const title = details?.title ?? document.title.replace(/ - YouTube$/, '');
  const channelName = details?.author ?? '';
  const parsedDuration = details?.lengthSeconds ? Number(details.lengthSeconds) : NaN;

  return {
    videoId,
    title,
    channelName,
    channelId: details?.channelId,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: Number.isFinite(parsedDuration) ? parsedDuration : null
  };
}

/**
 * Video-card containers across youtube.com, covering both the legacy
 * ytd-* renderer system and the newer yt-lockup-view-model system YouTube
 * has been migrating thumbnails to. Keep this in sync across every module
 * that scans for thumbnails/menus — a stale list here is the most likely
 * reason an injected control silently stops appearing.
 */
export const THUMBNAIL_CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-reel-item-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model'
].join(', ');

export const WATCH_PAGE_CONTAINER_SELECTOR = 'ytd-watch-metadata, ytd-watch-flexy';

/** Extracts a video id from a URL string or href, handling both `?v=` watch URLs and `/shorts/<id>` paths. */
export function extractVideoIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, location.origin);
    const v = url.searchParams.get('v');
    if (v) return v;
    const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
  } catch {
    // ignore malformed URLs
  }
  return null;
}

/** Finds the thumbnail link anchor within a card, handling both the legacy a#thumbnail structure and the newer yt-thumbnail-view-model layout. */
export function findThumbnailAnchor(card: Element): HTMLAnchorElement | null {
  const legacy = card.querySelector<HTMLAnchorElement>('a#thumbnail, a.ytd-thumbnail');
  if (legacy) return legacy;

  const thumbModel = card.querySelector('yt-thumbnail-view-model');
  const ancestorAnchor = thumbModel?.closest<HTMLAnchorElement>('a[href]');
  if (ancestorAnchor) return ancestorAnchor;

  return card.querySelector<HTMLAnchorElement>('a[href*="watch?v="], a[href*="/shorts/"]');
}

/** Finds the element to use as an overlay's positioning host: the new yt-thumbnail-view-model if present, else the legacy thumbnail anchor/element, else the card itself. */
export function findThumbnailHost(card: Element): HTMLElement {
  const thumbModel = card.querySelector<HTMLElement>('yt-thumbnail-view-model');
  if (thumbModel) return thumbModel;
  const legacy = card.querySelector<HTMLElement>('a#thumbnail, ytd-thumbnail');
  return legacy ?? (card as HTMLElement);
}

/** Best-effort title extraction across both legacy and new-layout cards. */
export function extractCardTitle(card: Element, anchor: HTMLAnchorElement | null): string {
  const titleEl = card.querySelector('#video-title, h3, .yt-lockup-metadata-view-model-wiz__title');
  const text = titleEl?.textContent?.trim();
  if (text) return text;
  return anchor?.title?.trim() || anchor?.getAttribute('aria-label')?.trim() || '';
}

export function extractCardChannelName(card: Element): string {
  return (
    card.querySelector('ytd-channel-name #text, #channel-name #text, #byline')?.textContent?.trim() ?? ''
  );
}

/**
 * Finds the row of text to dock the add-to-queue button into: the
 * views/upload-age line under the title (last `.ytContentMetadataViewModelMetadataRow`
 * — the channel-name row, if present, comes first), the Shorts view-count
 * subhead, or the legacy `#metadata-line`. Anchoring here instead of on the
 * thumbnail means the button lives in normal document flow, out of reach of
 * whatever YouTube's hover-preview player does to the thumbnail itself.
 */
export function findMetadataRow(card: Element): HTMLElement | null {
  const rows = card.querySelectorAll<HTMLElement>('.ytContentMetadataViewModelMetadataRow');
  if (rows.length > 0) return rows[rows.length - 1];
  const shortsSubhead = card.querySelector<HTMLElement>('.shortsLockupViewModelHostMetadataSubhead');
  if (shortsSubhead) return shortsSubhead;
  return card.querySelector<HTMLElement>('#metadata-line');
}
