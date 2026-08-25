import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'YouTube Queue Manager',
  description:
    'Replace YouTube\'s queue: add videos anywhere, reorder with drag-and-drop, track played videos, and auto-advance.',
  version: pkg.version,
  icons: {
    16: 'public/icons/icon16.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png'
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'public/icons/icon16.png',
      48: 'public/icons/icon48.png',
      128: 'public/icons/icon128.png'
    }
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module'
  },
  options_ui: {
    page: 'src/settings/settings.html',
    open_in_tab: true
  },
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content/main.ts'],
      css: ['src/content/content.css'],
      run_at: 'document_idle'
    }
  ],
  permissions: ['storage', 'tabs', 'scripting', 'alarms'],
  host_permissions: ['https://www.youtube.com/*']
});
