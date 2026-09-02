import { onYouTubeNavigate } from './navigation';
import { getCurrentWatchPageInfo } from '../shared/youtube-parsing';
import { createAddToQueueButtonGroup } from './add-to-queue-button';
import { monitorWatchPageVideo } from './video-monitor';
import { ensurePlayerQueueButtons } from './player-controls';
import { startThumbnailScanner, scanForThumbnails } from './thumbnail-scanner';
import { startPanel } from './panel/panel';
import { startNativeUiSuppression, runNativeUiSuppression } from './native-ui-suppress';
import { startNativeMenuHook } from './native-menu-hook';
import { startHistorySync } from './history-sync';

const BUTTON_CONTAINER_ID = 'yqm-watch-page-button-container';

function findPlayerHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#movie_player, .html5-video-player');
}

function ensureWatchPageButton(): void {
  document.getElementById(BUTTON_CONTAINER_ID)?.remove();

  const info = getCurrentWatchPageInfo();
  if (!info) return;

  const playerHost = findPlayerHost();
  if (!playerHost) {
    window.setTimeout(ensureWatchPageButton, 500);
    return;
  }

  const container = document.createElement('div');
  container.id = BUTTON_CONTAINER_ID;
  container.className = 'yqm-watch-page-button-container';
  container.appendChild(
    createAddToQueueButtonGroup({
      id: info.videoId,
      title: info.title,
      channelName: info.channelName,
      channelId: info.channelId,
      thumbnailUrl: info.thumbnailUrl,
      durationSeconds: info.durationSeconds,
      durationSource: info.durationSeconds !== null ? 'player' : 'unknown'
    })
  );
  playerHost.appendChild(container);

  monitorWatchPageVideo(info.videoId);
  ensurePlayerQueueButtons();
}

onYouTubeNavigate(() => {
  ensureWatchPageButton();
  scanForThumbnails();
  startPanel();
  runNativeUiSuppression();
});
startThumbnailScanner();
startNativeUiSuppression();
startNativeMenuHook();
startHistorySync();

console.log('[yt-queue-manager] content script loaded');
