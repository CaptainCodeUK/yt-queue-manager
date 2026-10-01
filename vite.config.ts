import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [
    crx({
      manifest,
      // Bundle as a self-contained IIFE: the default loader's dynamic import of a
      // chrome-extension:// URL fails with "Unsafe attempt to load URL" on some YouTube frames.
      contentScripts: { standaloneFiles: ['src/content/main.ts'] }
    })
  ],
  build: {
    // Content-script chunks run in an isolated world; Chrome can't use
    // modulepreload links for them, so they just log console warnings.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        settings: 'src/settings/settings.html'
      }
    }
  }
});
