/** How often the driving tab's content script pings the background to prove it's still alive — shared with the background's staleness check. */
export const HEARTBEAT_INTERVAL_MS = 15000;

export type ExtensionMessage =
  | { type: 'claimDriver' }
  | { type: 'releaseDriver'; tabId: number }
  | { type: 'heartbeat'; tabId: number }
  | { type: 'navigateToVideo'; videoId: string }
  | { type: 'forceSync' };

export interface ClaimDriverResponse {
  tabId: number;
  windowId: number;
}

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
