import { getActiveQueue, subscribe, updateActiveQueue } from '../../shared/storage';
import { clearActiveQueue, clearPlayed, removeItem, reorderInQueueListView } from '../../shared/queue-engine';
import { renderQueueList } from '../../shared/queue-list-view';
import { ActiveQueue } from '../../shared/types';
import { watchUrl } from '../../shared/youtube-parsing';
import { spaNavigate } from '../navigation';
import panelCss from './panel.css?inline';

const HOST_ID = 'yqm-header-host';
const CREATE_LABEL_PATTERN = /^create$/i;

function findButtonsContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('ytd-masthead #end #buttons');
}

/** Finds the "+ Create" button so our button can be inserted just before it. Fails open: returns null (caller falls back to prepending) rather than guessing at an unfamiliar element. */
function findCreateButton(container: HTMLElement): Element | null {
  const candidates = container.querySelectorAll('ytd-button-renderer, a, button');
  for (const el of candidates) {
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
    if (CREATE_LABEL_PATTERN.test(label)) {
      return el.closest('ytd-button-renderer') ?? el;
    }
  }
  return null;
}

let listContainer: HTMLElement | null = null;
let dropdown: HTMLElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let badge: HTMLElement | null = null;
let latestQueue: ActiveQueue | null = null;
let subscribed = false;
let mastheadObserver: MutationObserver | null = null;
let lastCurrentItemId: string | null = null;

function positionDropdown(): void {
  if (!toggleButton || !dropdown) return;
  const rect = toggleButton.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 8}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
}

function closeDropdown(): void {
  dropdown?.classList.remove('yqm-open');
}

function scrollCurrentIntoView(): void {
  listContainer?.querySelector('.yqm-queue-item.current')?.scrollIntoView({ block: 'nearest' });
}

function toggleDropdown(): void {
  if (!dropdown) return;
  const opening = !dropdown.classList.contains('yqm-open');
  if (opening) positionDropdown();
  dropdown.classList.toggle('yqm-open', opening);
  if (opening) scrollCurrentIntoView();
}

function onDocumentClickCapture(event: MouseEvent): void {
  if (!dropdown?.classList.contains('yqm-open')) return;
  // event.target is retargeted to the shadow host for listeners outside the
  // shadow tree, so `dropdown.contains(target)` is always false for clicks
  // inside it. composedPath() gives the real path through the shadow DOM.
  const path = event.composedPath();
  if ((dropdown && path.includes(dropdown)) || (toggleButton && path.includes(toggleButton))) return;
  closeDropdown();
}

function render(queue: ActiveQueue): void {
  latestQueue = queue;
  if (!listContainer || !badge) return;

  const currentChanged = queue.currentItemId !== lastCurrentItemId;
  lastCurrentItemId = queue.currentItemId;

  renderQueueList(listContainer, queue, {
    onReorder: (orderedIds) => void updateActiveQueue((q) => reorderInQueueListView(q, orderedIds, q.selectedView ?? 'all')),
    onRemove: (id) => void updateActiveQueue((q) => removeItem(q, id)),
    onPlayNow: (id, playbackView) => {
      void updateActiveQueue((q) => ({ ...q, currentItemId: id, playbackView })).then(() => spaNavigate(watchUrl(id)));
    },
    onClearPlayed: () => void updateActiveQueue((q) => clearPlayed(q)),
    onViewChange: (selectedView) => void updateActiveQueue((q) => ({ ...q, selectedView }))
  });

  if (currentChanged && dropdown?.classList.contains('yqm-open')) {
    scrollCurrentIntoView();
  }

  const unplayedCount = queue.items.filter((item) => !item.played).length;
  badge.textContent = String(unplayedCount);
  badge.hidden = unplayedCount === 0;
}

/**
 * Builds and inserts the header button + dropdown. YouTube's masthead is
 * initially skeleton-rendered (placeholder icons, no real buttons yet) and
 * gets rebuilt once real content hydrates — which silently discards
 * anything inserted into it beforehand. So this doesn't just run once:
 * `ensureMounted` below re-invokes it whenever the host has gone missing.
 */
function mountHeaderButton(): boolean {
  const buttonsContainer = findButtonsContainer();
  if (!buttonsContainer) return false;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.display = 'inline-flex';
  host.style.alignItems = 'center';

  const createButton = findCreateButton(buttonsContainer);
  if (createButton) {
    buttonsContainer.insertBefore(host, createButton);
  } else {
    buttonsContainer.prepend(host);
  }

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadowRoot.appendChild(style);

  toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'yqm-header-button';
  toggleButton.innerHTML =
    '<span class="yqm-header-icon">+</span><span>My Queue</span><span class="yqm-header-badge" hidden></span>';
  toggleButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleDropdown();
  });
  shadowRoot.appendChild(toggleButton);
  badge = toggleButton.querySelector('.yqm-header-badge');

  dropdown = document.createElement('div');
  dropdown.className = 'yqm-dropdown';
  shadowRoot.appendChild(dropdown);

  const toolbar = document.createElement('div');
  toolbar.className = 'yqm-panel-toolbar';
  const clearQueueButton = document.createElement('button');
  clearQueueButton.type = 'button';
  clearQueueButton.className = 'yqm-clear-queue-button';
  clearQueueButton.textContent = 'Clear queue';
  clearQueueButton.addEventListener('click', () => void updateActiveQueue(() => clearActiveQueue()));
  toolbar.appendChild(clearQueueButton);
  dropdown.appendChild(toolbar);

  listContainer = document.createElement('div');
  dropdown.appendChild(listContainer);

  if (latestQueue) render(latestQueue);

  return true;
}

function ensureMounted(): void {
  if (document.getElementById(HOST_ID)) return;
  mountHeaderButton();
}

/**
 * Mounts the header button/dropdown and keeps it mounted. Uses a
 * MutationObserver rather than a one-shot retry: the masthead can render
 * (and re-render, wiping earlier children) at any point, not just once
 * early on, so this re-checks on every relevant DOM change — the same
 * resilience pattern used for thumbnail scanning and the watch-page
 * button elsewhere in this content script.
 */
export function startPanel(): void {
  ensureMounted();

  if (!mastheadObserver) {
    mastheadObserver = new MutationObserver(ensureMounted);
    mastheadObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onDocumentClickCapture, { capture: true });
    window.addEventListener('resize', () => {
      if (dropdown?.classList.contains('yqm-open')) positionDropdown();
    });
  }

  if (!subscribed) {
    subscribed = true;
    getActiveQueue().then(render);
    subscribe('activeQueue', render);
  }
}
