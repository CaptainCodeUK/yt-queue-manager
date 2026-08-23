export type VideoId = string;

export type DurationSource = 'player' | 'ytInitialData' | 'domBadge' | 'unknown';

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
    drivingTabId: null,
    drivingWindowId: null,
    updatedAt: Date.now()
  };
}

export function defaultSettings(): Settings {
  return {
    autoAdvance: true,
    suppressNativeQueueUI: true,
    experimentalSync: false
  };
}
