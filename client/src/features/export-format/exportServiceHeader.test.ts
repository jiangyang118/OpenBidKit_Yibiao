// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip') as any;
const { buildDocxResult, createExportService } = require('../../../electron/services/exportService.cjs') as {
  buildDocxResult: (payload: unknown) => Promise<{
    buffer: Buffer;
    warnings: string[];
    preflight: {
      imageCount: number;
      missingLocalImageCount: number;
      warnings: string[];
    };
  }>;
  createExportService: () => {
    previewWordExport: (payload: unknown) => Promise<{
      success: boolean;
      message: string;
      warnings: string[];
      preflight: {
        leafCount: number;
        imageCount: number;
        missingLocalImageCount: number;
      };
      docx_bytes?: number;
      duration_ms?: number;
    }>;
  };
};
const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('exportService header rendering', () => {
  it('writes enabled header config into generated docx headers', async () => {
    const result = await buildDocxResult({
      project_name: '页眉测试项目',
      export_format: {
        page: {
          header_enabled: true,
          header_text: '易标投标文件页眉',
          header_font: '黑体',
          header_size: '五号',
          header_alignment: '右对齐',
        },
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '测试章节',
          content: '测试正文',
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const headerEntry = zip.getEntries().find((entry: { entryName: string }) => /^word\/header\d+\.xml$/i.test(entry.entryName));

    expect(headerEntry).toBeDefined();
    expect(headerEntry?.getData().toString('utf8')).toContain('易标投标文件页眉');
  });

  it('writes first-page and even-page header variants into generated docx', async () => {
    const result = await buildDocxResult({
      project_name: '高级页眉测试项目',
      export_format: {
        page: {
          header_enabled: true,
          header_text: '常规页眉',
          header_first_page_different: true,
          header_first_page_text: '首页页眉',
          header_even_odd_different: true,
          header_even_text: '偶数页页眉',
          header_font: '宋体',
          header_size: '小五',
          header_alignment: '居中对齐',
        },
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '测试章节',
          content: '测试正文',
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const headerEntries = zip.getEntries().filter((entry: { entryName: string }) => /^word\/header\d+\.xml$/i.test(entry.entryName));
    const headerXml = headerEntries.map((entry: { getData: () => Buffer }) => entry.getData().toString('utf8')).join('\n');
    const documentXml = zip.readAsText('word/document.xml');
    const settingsXml = zip.readAsText('word/settings.xml');

    expect(headerEntries.length).toBe(3);
    expect(headerXml).toContain('常规页眉');
    expect(headerXml).toContain('首页页眉');
    expect(headerXml).toContain('偶数页页眉');
    expect(documentXml).toContain('w:type="default"');
    expect(documentXml).toContain('w:type="first"');
    expect(documentXml).toContain('w:type="even"');
    expect(documentXml).toContain('<w:titlePg');
    expect(settingsXml).toContain('<w:evenAndOddHeaders');
  });

  it('centers markdown images and figure captions in generated docx', async () => {
    const result = await buildDocxResult({
      project_name: '图片图例测试项目',
      export_format: {
        page: {},
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '图片章节',
          content: [
            `![现场部署图](${tinyPngDataUrl})`,
            '',
            '*图：现场部署图*',
          ].join('\n'),
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');
    const captionIndex = documentXml.indexOf('图：现场部署图');
    const imageRunIndex = documentXml.indexOf('<w:drawing>');

    expect(imageRunIndex).toBeGreaterThan(-1);
    expect(captionIndex).toBeGreaterThan(imageRunIndex);
    expect(documentXml.slice(Math.max(0, imageRunIndex - 500), imageRunIndex)).toContain('<w:jc w:val="center"');
    expect(documentXml.slice(Math.max(0, captionIndex - 500), captionIndex)).toContain('<w:jc w:val="center"');
  });

  it('keeps exporting when a local image is missing and returns unified preflight warnings', async () => {
    const result = await buildDocxResult({
      project_name: '缺失图片测试项目',
      base_dir: '/tmp/yibiao-export-missing-image-test',
      export_format: {
        page: {},
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '缺失图片章节',
          content: '![缺失图片](./missing-local-image.png)\n\n导出不能因为图片缺失而失败。',
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.preflight.imageCount).toBe(1);
    expect(result.preflight.missingLocalImageCount).toBe(1);
    expect(result.preflight.warnings[0]).toContain('导出预检');
    expect(result.warnings.some((warning) => warning.includes('导出预检'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('图片无法导出'))).toBe(true);
    expect(documentXml).toContain('图片无法导出');
    expect(documentXml).toContain('导出不能因为图片缺失而失败');
  });

  it('runs a Word dry-run without writing an output file', async () => {
    const service = createExportService();
    const result = await service.previewWordExport({
      project_name: '导出预演测试项目',
      base_dir: '/tmp/yibiao-export-preview-test',
      export_format: {
        page: {
          header_enabled: true,
          header_text: '预演页眉',
        },
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '预演章节',
          content: '![缺失图片](./missing-preview-image.png)\n\n| 名称 | 说明 |\n| --- | --- |\n| A | B |',
          children: [],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.docx_bytes).toBeGreaterThan(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.preflight.leafCount).toBe(1);
    expect(result.preflight.imageCount).toBe(1);
    expect(result.preflight.missingLocalImageCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes('导出预检'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('图片无法导出'))).toBe(true);
  });
});
