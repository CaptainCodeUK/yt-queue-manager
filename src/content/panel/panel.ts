import { getActiveQueue, subscribe, updateActiveQueue } from '../../shared/storage';
import { removeItem, reorder, clearPlayed } from '../../shared/queue-engine';
import { renderQueueList } from '../../shared/queue-list-view';
import { sendMessage } from '../../shared/messaging';
import { ActiveQueue } from '../../shared/types';
import panelCss from './panel.css?inline';

const PANEL_HOST_ID = 'yqm-panel-host';

let listContainer: HTMLElement | null = null;
let initialized = false;

function mountPanel(): void {
  if (document.getElementById(PANEL_HOST_ID)) return;

  const host = document.createElement('div');
  host.id = PANEL_HOST_ID;
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadowRoot.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'yqm-panel';
  shadowRoot.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'yqm-panel-header';
  header.textContent = 'Queue';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'yqm-panel-toggle';
  toggle.textContent = '▾';
  header.appendChild(toggle);
  panel.appendChild(header);

  const content = document.createElement('div');
  content.className = 'yqm-panel-content';
  panel.appendChild(content);

  listContainer = document.createElement('div');
  content.appendChild(listContainer);

  let collapsed = false;
  const toggleCollapsed = () => {
    collapsed = !collapsed;
    content.style.display = collapsed ? 'none' : '';
    toggle.textContent = collapsed ? '▸' : '▾';
  };
  header.addEventListener('click', toggleCollapsed);
}

function render(queue: ActiveQueue): void {
  if (!listContainer) return;
  renderQueueList(listContainer, queue, {
    onReorder: (orderedIds) => void updateActiveQueue((q) => reorder(q, orderedIds)),
    onRemove: (id) => void updateActiveQueue((q) => removeItem(q, id)),
    onPlayNow: (id) => void sendMessage({ type: 'navigateToVideo', videoId: id }),
    onClearPlayed: () => void updateActiveQueue((q) => clearPlayed(q))
  });
}

/** Idempotent: safe to call on every SPA navigation, since document.body normally survives YouTube's route changes but this guards against the rare case it doesn't. */
export function startPanel(): void {
  mountPanel();
  if (initialized) return;
  initialized = true;
  getActiveQueue().then(render);
  subscribe('activeQueue', render);
}
