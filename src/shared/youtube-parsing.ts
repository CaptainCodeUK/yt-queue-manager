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
