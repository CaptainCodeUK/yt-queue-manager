/**
 * YouTube is a client-rendered SPA — content scripts are not re-injected on
 * internal navigation. `yt-navigate-finish` is the primary signal; a
 * MutationObserver on <title> (which YouTube always updates on navigation)
 * is a fail-open backstop in case that event doesn't fire for some reason.
 */
export function onYouTubeNavigate(callback: () => void): void {
  document.addEventListener('yt-navigate-finish', callback);

  let lastHref = location.href;
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const observer = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        callback();
      }
    });
    observer.observe(titleEl, { childList: true });
  }

  callback();
}
