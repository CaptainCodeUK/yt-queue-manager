import { getActiveQueue, subscribe, updateActiveQueue, getSavedPlaylists, setSavedPlaylists } from '../shared/storage';
import { removeItem, reorder, clearPlayed, toSavedPlaylist, loadPlaylist, clearActiveQueue } from '../shared/queue-engine';
import { renderQueueList } from '../shared/queue-list-view';
import { sendMessage } from '../shared/messaging';
import { ActiveQueue, SavedPlaylist } from '../shared/types';

const queueSection = document.getElementById('queue-section')!;
const playlistsSection = document.getElementById('playlists-section')!;
const saveButton = document.getElementById('save-playlist-button') as HTMLButtonElement;
const clearQueueButton = document.getElementById('clear-queue-button') as HTMLButtonElement;

function renderQueue(queue: ActiveQueue): void {
  renderQueueList(queueSection, queue, {
    onReorder: (orderedIds) => void updateActiveQueue((q) => reorder(q, orderedIds)),
    onRemove: (id) => void updateActiveQueue((q) => removeItem(q, id)),
    onPlayNow: (id) => void sendMessage({ type: 'navigateToVideo', videoId: id }),
    onClearPlayed: () => void updateActiveQueue((q) => clearPlayed(q))
  });
  queueSection.querySelector('.yqm-queue-item.current')?.scrollIntoView({ block: 'nearest' });
}

function renderPlaylists(playlists: SavedPlaylist[]): void {
  playlistsSection.innerHTML = '';

  if (playlists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'yqm-empty-state';
    empty.textContent = 'No saved playlists';
    playlistsSection.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'yqm-playlist-list';

  playlists.forEach((playlist) => {
    const li = document.createElement('li');
    li.className = 'yqm-playlist-item';

    const name = document.createElement('span');
    name.className = 'yqm-playlist-name';
    name.textContent = `${playlist.name} (${playlist.items.length})`;
    name.title = playlist.name;
    li.appendChild(name);

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.textContent = 'Load';
    loadButton.addEventListener('click', () => void updateActiveQueue(() => loadPlaylist(playlist)));
    li.appendChild(loadButton);

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'Rename';
    renameButton.addEventListener('click', async () => {
      const newName = window.prompt('Rename playlist', playlist.name);
      if (!newName) return;
      const all = await getSavedPlaylists();
      await setSavedPlaylists(
        all.map((p) => (p.playlistId === playlist.playlistId ? { ...p, name: newName, updatedAt: Date.now() } : p))
      );
    });
    li.appendChild(renameButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      const all = await getSavedPlaylists();
      await setSavedPlaylists(all.filter((p) => p.playlistId !== playlist.playlistId));
    });
    li.appendChild(deleteButton);

    list.appendChild(li);
  });

  playlistsSection.appendChild(list);
}

saveButton.addEventListener('click', async () => {
  const name = window.prompt('Playlist name');
  if (!name) return;
  const queue = await getActiveQueue();
  const playlist = toSavedPlaylist(queue, name, crypto.randomUUID());
  const all = await getSavedPlaylists();
  await setSavedPlaylists([...all, playlist]);
});

clearQueueButton.addEventListener('click', () => void updateActiveQueue(() => clearActiveQueue()));

getActiveQueue().then(renderQueue);
subscribe('activeQueue', renderQueue);

getSavedPlaylists().then(renderPlaylists);
subscribe('savedPlaylists', renderPlaylists);
