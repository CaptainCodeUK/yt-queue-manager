const SUPPRESS_CLASS = 'yqm-native-hidden';
const STYLE_ID = 'yqm-native-suppress-style';

function ensureStyleInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.${SUPPRESS_CLASS} { display: none !important; }`;
  document.head.appendChild(style);
}

function hasPlaylistParam(): boolean {
  return new URLSearchParams(location.search).has('list');
}

/**
 * Hides YouTube's native "up next" auto-queue panel, but only when there's
 * no `list=` param — that indicates the user is legitimately watching a
 * real YouTube playlist, which is left alone. CSS-hide (not DOM removal)
 * since YouTube's own JS may still reference the node. Fail open: if the
 * expected element isn't present, this does nothing further.
 */
function suppressQueuePanel(): void {
  const panel = document.querySelector<HTMLElement>('ytd-playlist-panel-renderer');
  if (!panel) return;
  panel.classList.toggle(SUPPRESS_CLASS, !hasPlaylistParam());
}

/** Best-effort: hides the "Added to queue" toast. Text-matching is not locale-proof, but the toast self-dismisses anyway, so a missed match is low severity. */
function suppressQueueToasts(): void {
  document.querySelectorAll<HTMLElement>('tp-yt-paper-toast, ytd-notification-action-renderer').forEach((toast) => {
    if (toast.classList.contains(SUPPRESS_CLASS)) return;
    if (toast.textContent?.toLowerCase().includes('queue')) {
      toast.classList.add(SUPPRESS_CLASS);
    }
  });
}

export function runNativeUiSuppression(): void {
  ensureStyleInjected();
  suppressQueuePanel();
  suppressQueueToasts();
}

let observer: MutationObserver | null = null;

/** Starts an ongoing MutationObserver pass in addition to the direct call from the navigation handler — the toast in particular can appear without a full navigation. */
export function startNativeUiSuppression(): void {
  runNativeUiSuppression();
  if (observer) return;
  observer = new MutationObserver(runNativeUiSuppression);
  observer.observe(document.body, { childList: true, subtree: true });
}
