// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createConfigStore } = require('../../../electron/services/configStore.cjs') as {
  createConfigStore: (app: { getPath: (name: string) => string }) => {
    load: () => { language: string; theme: string; sidebar_layout: string };
    save: (config: Record<string, unknown>) => { success: boolean };
  };
};

let tempDirs: string[] = [];

function createTempStore() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'yibiao-config-'));
  tempDirs.push(userDataDir);
  return createConfigStore({
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected app path: ${name}`);
      return userDataDir;
    },
  });
}

describe('configStore appearance settings', () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it('persists normalized language, theme and sidebar layout', () => {
    const store = createTempStore();

    expect(store.load()).toMatchObject({
      language: 'zh-CN',
      theme: 'system',
      sidebar_layout: 'classic',
    });

    expect(store.save({
      language: 'zh-CN',
      theme: 'dark',
      sidebar_layout: 'compact',
    }).success).toBe(true);

    expect(store.load()).toMatchObject({
      language: 'zh-CN',
      theme: 'dark',
      sidebar_layout: 'compact',
    });
  });
});
