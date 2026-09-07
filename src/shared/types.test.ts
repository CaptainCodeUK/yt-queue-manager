import { describe, it, expect } from 'vitest';
import { defaultSettings } from './types';

describe('defaultSettings', () => {
  it('defaults experimentalSync to false', () => {
    expect(defaultSettings().experimentalSync).toBe(false);
  });

  it('defaults watchedThresholdPercent to 95', () => {
    expect(defaultSettings().watchedThresholdPercent).toBe(95);
  });

  it('defaults theme to follow the site', () => {
    expect(defaultSettings().theme).toBe('site');
  });

  it('defaults playlist duration windows to the existing boundaries', () => {
    expect(defaultSettings()).toMatchObject({
      shortPlaylistMaxMinutes: 10,
      essaysPlaylistMinMinutes: 60
    });
  });
});
