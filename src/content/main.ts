import { onYouTubeNavigate } from './navigation';
import { getCurrentWatchPageInfo } from '../shared/youtube-parsing';
import { createAddToQueueButton } from './add-to-queue-button';
import { monitorWatchPageVideo } from './video-monitor';
import { startThumbnailScanner, scanForThumbnails } from './thumbnail-scanner';
import { startPanel } from './panel/panel';

const BUTTON_CONTAINER_ID = 'yqm-watch-page-button-container';

function ensureWatchPageButton(): void {
  document.getElementById(BUTTON_CONTAINER_ID)?.remove();

  const info = getCurrentWatchPageInfo();
  if (!info) return;

  const container = document.createElement('div');
  container.id = BUTTON_CONTAINER_ID;
  container.className = 'yqm-watch-page-button-container';
  container.appendChild(
    createAddToQueueButton({
      id: info.videoId,
      title: info.title,
      channelName: info.channelName,
      channelId: info.channelId,
      thumbnailUrl: info.thumbnailUrl,
      durationSeconds: info.durationSeconds,
      durationSource: info.durationSeconds !== null ? 'player' : 'unknown'
    })
  );
  document.body.appendChild(container);

  monitorWatchPageVideo(info.videoId);
}

onYouTubeNavigate(() => {
  ensureWatchPageButton();
  scanForThumbnails();
  startPanel();
});
startThumbnailScanner();

console.log('[yt-queue-manager] content script loaded');
