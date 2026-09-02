export type VideoId = string;

export type DurationSource = 'player' | 'ytInitialData' | 'domBadge' | 'unknown';

export type QueueListView = 'all' | 'short' | 'long' | 'essays';

export interface QueueItem {
  id: VideoId;
  title: string;
  channelName: string;
  channelId?: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  durationSource: DurationSource;
  played: boolean;
  addedAt: number;
  position: number;
}

export interface ActiveQueue {
  items: QueueItem[];
  currentItemId: VideoId | null;
  selectedView: QueueListView;
  playbackView: QueueListView;
  drivingTabId: number | null;
  drivingWindowId: number | null;
  updatedAt: number;
}

export interface SavedPlaylist {
  playlistId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: QueueItem[];
}

export interface Settings {
  autoAdvance: boolean;
  watchedThresholdPercent: number;
  suppressNativeQueueUI: boolean;
  experimentalSync: boolean;
}

export interface StorageSchema {
  activeQueue: ActiveQueue;
  savedPlaylists: SavedPlaylist[];
  driverHeartbeatAt: number;
  settings: Settings;
}

export function emptyActiveQueue(): ActiveQueue {
  return {
    items: [],
    currentItemId: null,
    selectedView: 'all',
    playbackView: 'all',
    drivingTabId: null,
    drivingWindowId: null,
    updatedAt: Date.now()
  };
}

export function defaultSettings(): Settings {
  return {
    autoAdvance: true,
    watchedThresholdPercent: 95,
    suppressNativeQueueUI: true,
    experimentalSync: false
  };
}
