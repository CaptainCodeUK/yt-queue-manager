# YT Queue Manager

A Chrome extension that replaces YouTube's built-in queue. Persistent, reorderable, and time-aware.

## Features

**Adding to the queue**

- Overlay button on every video thumbnail — home feed, search, sidebar, channel pages, Shorts
- "Add to My Queue" injected at the top of YouTube's three-dot context menu
- Add button on the watch page itself

**Queue panel (header button)**

- Persists across tab closes, navigations, and browser restarts
- Drag-and-drop reorder
- Played tracking — watched videos are marked so you always know where you are
- Real time totals — total length and time remaining from the current position, calculated from actual video durations
- Auto-advance to the next unplayed video when the current one ends
- Clear played entries in one click

**Popup**

- Full queue view and controls from the toolbar icon
- Save the current queue as a named playlist
- Load, rename, or delete saved playlists

**Settings**

- Toggle auto-advance and YouTube native queue UI suppression
- Export the queue to text and import it on another device
- Experimental Chrome Sync to mirror the queue across devices

## Tech stack

| Tool | Purpose |
|---|---|
| TypeScript 5 (strict) | All source |
| Vite 5 + @crxjs/vite-plugin | Build and hot-reload |
| Vitest | Unit tests |
| Manifest V3 | Extension platform |

No runtime dependencies — zero `dependencies` in package.json.

## Development

```sh
npm install

# Hot-reload dev build (load dist/ as an unpacked extension)
npm run dev

# Type-check only (no emit)
npm run typecheck

# Production build
npm run build

# Run tests
npm test
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions` with Developer mode on.

## Project structure

```
src/
  background/
    service-worker.ts     # MV3 service worker — navigation, driver claim/release, alarms
  content/
    main.ts               # Content script entry — wires everything together on navigation
    add-to-queue-button.ts
    thumbnail-scanner.ts  # MutationObserver-based overlay button injection
    native-menu-hook.ts   # Injects into YouTube's three-dot dropdown
    native-ui-suppress.ts # Hides YouTube's own queue panel and toasts
    video-monitor.ts      # Tracks playback end, corrects durations, drives auto-advance
    navigation.ts         # SPA navigation detection and synthetic link navigation
    panel/
      panel.ts            # Header button + queue dropdown (Shadow DOM)
  popup/
    popup.ts              # Toolbar popup — queue + saved playlists
  settings/
    settings.ts           # Options page — sync, export/import
  shared/
    types.ts              # Core types (QueueItem, ActiveQueue, SavedPlaylist, Settings)
    queue-engine.ts       # Pure queue operations (add, remove, reorder, advance, totals)
    storage.ts            # chrome.storage.local typed wrappers
    sync-storage.ts       # Experimental Chrome Sync bridge (chunked, debounced)
    queue-export.ts       # Text-based queue export/import
    queue-list-view.ts    # Shared drag-and-drop list renderer
    messaging.ts          # Typed message passing between contexts
    youtube-parsing.ts    # DOM selectors and URL/data extraction
```

## Architecture notes

- The service worker holds no in-memory state — MV3 workers are killed and restarted freely, so everything is read from `chrome.storage.local` on each event.
- The tab that is currently playing from the queue claims the "driver" role via a heartbeat/alarm system. The background evicts a stale driver if its heartbeat stops, covering crashes and hangs that don't fire `tabs.onRemoved`.
- Navigation uses YouTube's own SPA router (synthetic anchor click) rather than `chrome.tabs.update`, so the page doesn't fully reload.
- The queue panel is mounted in a Shadow DOM to isolate its styles from YouTube's stylesheet.
- Chrome Sync splits the queue into size-bounded chunks to stay inside `chrome.storage.sync`'s per-item and total quotas, and uses a `writeId` to detect mid-propagation partial reads on other devices.

## Privacy

No data is collected. The queue is stored locally in `chrome.storage.local`. If Chrome Sync is enabled, queue data follows Google's own sync privacy policy. The extension makes no outbound network requests of its own.
