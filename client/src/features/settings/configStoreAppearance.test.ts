// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createConfigStore } = require('../../../electron/services/configStore.cjs') as {
  createConfigStore: (app: { getPath: (name: string) => string }) => {
    load: () => {
      language: string;
      theme: string;
      sidebar_layout: string;
      export_format: {
        page: {
          cover_enabled: boolean;
          cover_title: string;
          cover_subtitle: string;
          cover_company: string;
          cover_date: string;
          toc_enabled: boolean;
          toc_title: string;
          toc_depth: number;
          chapter_section_break_enabled: boolean;
          watermark_enabled: boolean;
          watermark_text: string;
          watermark_size_pt: number;
          watermark_color: string;
          watermark_opacity: number;
        };
        table: {
          header_fill_color: string;
          border_color: string;
          inside_border_color: string;
          cell_margin_twips: number;
        };
        image: {
          max_width_px: number;
        };
      };
    };
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

  it('normalizes missing and invalid Word watermark export settings', () => {
    const store = createTempStore();

    expect(store.save({
      export_format: {
        page: {
          watermark_enabled: true,
          watermark_text: '密级文件',
          watermark_size_pt: 500,
          watermark_color: 'not-a-color',
          watermark_opacity: 3,
        },
      },
    }).success).toBe(true);

    expect(store.load().export_format.page).toMatchObject({
      watermark_enabled: true,
      watermark_text: '密级文件',
      watermark_size_pt: 120,
      watermark_color: 'D9D9D9',
      watermark_opacity: 0.8,
    });
  });

  it('normalizes missing Word cover export settings', () => {
    const store = createTempStore();

    expect(store.save({
      export_format: {
        page: {
          cover_enabled: true,
          cover_title: '   ',
          cover_subtitle: ' 技术标 ',
          cover_company: ' 易标测试公司 ',
          cover_date: ' 2026年6月15日 ',
        },
      },
    }).success).toBe(true);

    expect(store.load().export_format.page).toMatchObject({
      cover_enabled: true,
      cover_title: '投标技术文件',
      cover_subtitle: '技术标',
      cover_company: '易标测试公司',
      cover_date: '2026年6月15日',
    });
  });

  it('normalizes missing and invalid Word table of contents export settings', () => {
    const store = createTempStore();

    expect(store.save({
      export_format: {
        page: {
          toc_enabled: true,
          toc_title: '   ',
          toc_depth: 99,
          chapter_section_break_enabled: true,
        },
      },
    }).success).toBe(true);

    expect(store.load().export_format.page).toMatchObject({
      toc_enabled: true,
      toc_title: '目录',
      toc_depth: 6,
      chapter_section_break_enabled: true,
    });
  });

  it('normalizes missing and invalid Word table export settings', () => {
    const store = createTempStore();

    expect(store.save({
      export_format: {
        table: {
          header_fill_color: 'd9ead3',
          border_color: 'bad-color',
          inside_border_color: 'a9d18e',
          cell_margin_twips: 999,
        },
      },
    }).success).toBe(true);

    expect(store.load().export_format.table).toMatchObject({
      header_fill_color: 'D9EAD3',
      border_color: 'DCDFF6',
      inside_border_color: 'A9D18E',
      cell_margin_twips: 360,
    });
  });

  it('normalizes missing and invalid Word image export settings', () => {
    const store = createTempStore();

    expect(store.save({
      export_format: {
        image: {
          max_width_px: 2000,
        },
      },
    }).success).toBe(true);

    expect(store.load().export_format.image).toMatchObject({
      max_width_px: 960,
    });
  });
});
