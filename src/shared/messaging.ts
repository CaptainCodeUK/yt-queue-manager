export type ExtensionMessage =
  | { type: 'claimDriver' }
  | { type: 'releaseDriver'; tabId: number }
  | { type: 'heartbeat'; tabId: number }
  | { type: 'navigateToVideo'; videoId: string };

export interface ClaimDriverResponse {
  tabId: number;
  windowId: number;
}

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
