// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyNativeThemeSource,
  getNativeThemeSourceFromConfig,
  normalizeNativeThemeSource,
} = require('../../../electron/utils/nativeTheme.cjs') as {
  applyNativeThemeSource: (nativeTheme: { themeSource?: string } | null, config: unknown) => string;
  getNativeThemeSourceFromConfig: (config: unknown) => string;
  normalizeNativeThemeSource: (value: unknown, fallback?: string) => string;
};

describe('native theme source helpers', () => {
  it('normalizes app theme values for Electron nativeTheme', () => {
    expect(normalizeNativeThemeSource('system')).toBe('system');
    expect(normalizeNativeThemeSource('light')).toBe('light');
    expect(normalizeNativeThemeSource('dark')).toBe('dark');
    expect(normalizeNativeThemeSource('unknown')).toBe('system');
    expect(normalizeNativeThemeSource(undefined, 'dark')).toBe('dark');
  });

  it('reads theme source from persisted config objects', () => {
    expect(getNativeThemeSourceFromConfig({ theme: 'dark' })).toBe('dark');
    expect(getNativeThemeSourceFromConfig({ theme: 'light' })).toBe('light');
    expect(getNativeThemeSourceFromConfig({ theme: 'system' })).toBe('system');
    expect(getNativeThemeSourceFromConfig({ theme: 'invalid' })).toBe('system');
  });

  it('applies theme source to Electron nativeTheme without forcing light mode', () => {
    const nativeTheme = { themeSource: 'light' };

    expect(applyNativeThemeSource(nativeTheme, { theme: 'dark' })).toBe('dark');
    expect(nativeTheme.themeSource).toBe('dark');

    expect(applyNativeThemeSource(nativeTheme, { theme: 'system' })).toBe('system');
    expect(nativeTheme.themeSource).toBe('system');
  });
});
