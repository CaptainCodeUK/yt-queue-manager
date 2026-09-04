import { onYouTubeNavigate } from './navigation';
import { getCurrentWatchPageInfo } from '../shared/youtube-parsing';
import { monitorWatchPageVideo } from './video-monitor';
import { ensurePlayerQueueButtons } from './player-controls';
import { startThumbnailScanner, scanForThumbnails } from './thumbnail-scanner';
import { startPanel } from './panel/panel';
import { startNativeUiSuppression, runNativeUiSuppression } from './native-ui-suppress';
import { startNativeMenuHook } from './native-menu-hook';
import { startHistorySync } from './history-sync';

function ensureWatchPageControls(): void {
  document.getElementById('yqm-watch-page-button-container')?.remove();

  const info = getCurrentWatchPageInfo();
  if (!info) return;

  monitorWatchPageVideo(info.videoId);
  ensurePlayerQueueButtons();
}

onYouTubeNavigate(() => {
  ensureWatchPageControls();
  scanForThumbnails();
  startPanel();
  runNativeUiSuppression();
});
startThumbnailScanner();
startNativeUiSuppression();
startNativeMenuHook();
startHistorySync();

console.log('[yt-queue-manager] content script loaded');
