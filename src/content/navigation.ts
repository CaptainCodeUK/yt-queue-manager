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

/**
 * Navigates to `url` through YouTube's own SPA router — a synthetic click on
 * an in-page link, the same entry point YouTube's UI itself uses — instead
 * of a full page load. `onYouTubeNavigate` above picks up the resulting
 * `yt-navigate-finish` event same as a real click would. Falls back to a
 * normal navigation if the URL hasn't actually changed shortly after, in
 * case YouTube ever stops intercepting synthetic clicks this way.
 */
export function spaNavigate(url: string): void {
  const before = location.href;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    if (location.href === before) location.href = url;
  }, 800);
}
