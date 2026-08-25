import { describe, it, expect } from 'vitest';
import { defaultSettings } from './types';

describe('defaultSettings', () => {
  it('defaults experimentalSync to false', () => {
    expect(defaultSettings().experimentalSync).toBe(false);
  });

  it('defaults watchedThresholdPercent to 95', () => {
    expect(defaultSettings().watchedThresholdPercent).toBe(95);
  });
});
