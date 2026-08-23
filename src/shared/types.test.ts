import { describe, it, expect } from 'vitest';
import { defaultSettings } from './types';

describe('defaultSettings', () => {
  it('defaults experimentalSync to false', () => {
    expect(defaultSettings().experimentalSync).toBe(false);
  });
});
