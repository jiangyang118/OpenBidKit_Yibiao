// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip') as any;
const { buildDocxResult, createExportService } = require('../../../electron/services/exportService.cjs') as {
  buildDocxResult: (payload: unknown, options?: { mermaidRetryAttempts?: number; mermaidRetryDelayMs?: number }) => Promise<{
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
const widePngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAggAAACgCAYAAABpLJTJAAADNUlEQVR42u3dvQmAMBCA0YziDE6SLjtkUpextoytjQriz0me8HoJB/mqS5rGoQEAbCWHAAAIBABAIAAANwRCW2YAoDMCAQAQCACAQAAABAIAIBAAAIEAAAgEAEAgAAACAQAQCACAQAAABAIAIBAAAIEAAAgEgQAAAkEgAAACAQAQCACAQAAABAIAIBAAAIEAAAgEAEAgAAACAQAQCACAQAAABAIAIBAAAIEgEABAIAgEAEAgAAACAQAQCACAQAAABAIAIBAAAIEAAAgEAEAgAAACAQAQCE/+WO8MKwACQSAIBAAEgkCIGwi1ZAD4nEAQCAAgEAQCAAgEgQAAAkEgAIBAEAgAIBAEAgAIBIEAAAJBIAgEAASCQBAIAAiE3Yv45BMIACAQBIKhBEAgCAQA8FiTQAAAgSAQAEAgCAQAEAgCAQAEgkAAAIEgEAwrAAJBIAgEAASCQBAIAAgEgSAQABAIAkEgACAQBIJAAEAgCASBAIBAEAgCAQCBIBA89wzAwTPEAkEgCAQABIJAEAgCAUAgCASBIBAABIJAEAgCAUAgCASBIBAABIJAEAgCAUAgCASBIBAABIJAEAhWLQMgEASCQABAIAQPhKgMKwACQSAIBAAEgkAQCAAIBIEgEAAQCAJBIAAgEASCQABAIAgEgQCAQBAIAgEAgSAQBAIAAkEgCAQAEAhWLQOAQBAIACAQBAIACASBAAACQSC8oZYMdMgFiUAQCAIBEAgIBIEgEACBgEAQCAIBEAgIBIuSBAIgEBAIAkEgAAIBgSAQBAIgEBAICARAICAQBIJAAAQCAkEgCARAICAQBIJVywAIBIEgEAAQCAJBIAAgEASCQABAIAAAAkEgAIBAEAgAgEAAAAQCACAQAACBAAAIBABAIAAAAgEAEAgAgEAAAAQCACAQAACBAAAIBABAIAgEABAIAgEAEAgAgEAAAAQCACAQAACBAAAIBABAIAAAAgEAEAgAgEAAAAQCACAQAACBAAAIBIEAAAJBIAAAAgEAEAgAgEAAAAQCACAQAACBAAAIBABAIAAAAgEA+H8gAAAIBABAIAAAAgEAuGAFkvvXZJyV2HQAAAAASUVORK5CYII=';

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

  it('writes enabled text watermark into generated docx headers', async () => {
    const result = await buildDocxResult({
      project_name: '水印测试项目',
      export_format: {
        page: {
          header_enabled: false,
          watermark_enabled: true,
          watermark_text: '内部资料',
          watermark_font: '黑体',
          watermark_size_pt: 64,
          watermark_color: 'C9CDD4',
          watermark_opacity: 0.32,
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
    const headerXml = headerEntry?.getData().toString('utf8') || '';
    const documentXml = zip.readAsText('word/document.xml');

    expect(headerEntry).toBeDefined();
    expect(headerXml).toContain('YibiaoWatermark');
    expect(headerXml).toContain('内部资料');
    expect(headerXml).toContain('font-size:64pt');
    expect(headerXml).toContain('fillcolor="#C9CDD4"');
    expect(headerXml).toContain('opacity="32%"');
    expect(documentXml).toContain('w:type="default"');
  });

  it('writes configured cover page before generated content', async () => {
    const result = await buildDocxResult({
      project_name: '正文项目名称',
      export_format: {
        page: {
          cover_enabled: true,
          cover_title: '测试封面标题',
          cover_subtitle: '技术标',
          cover_company: '易标测试公司',
          cover_date: '2026年6月15日',
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
    const documentXml = zip.readAsText('word/document.xml');
    const coverIndex = documentXml.indexOf('测试封面标题');
    const contentIndex = documentXml.indexOf('内容由 AI 生成');
    const chapterIndex = documentXml.indexOf('测试章节');

    expect(coverIndex).toBeGreaterThan(-1);
    expect(documentXml).toContain('技术标');
    expect(documentXml).toContain('易标测试公司');
    expect(documentXml).toContain('2026年6月15日');
    expect(contentIndex).toBeGreaterThan(coverIndex);
    expect(chapterIndex).toBeGreaterThan(contentIndex);
    expect(documentXml).toContain('<w:br w:type="page"/>');
  });

  it('writes configured table of contents field before generated content', async () => {
    const result = await buildDocxResult({
      project_name: '目录测试项目',
      export_format: {
        page: {
          toc_enabled: true,
          toc_title: '投标文件目录',
          toc_depth: 4,
        },
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '第一章内容',
          content: '',
          children: [
            {
              id: '1.1',
              title: '第一节内容',
              content: '测试正文',
              children: [],
            },
          ],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');
    const tocIndex = documentXml.indexOf('TOC \\h \\o &quot;1-4&quot;');
    const contentIndex = documentXml.indexOf('内容由 AI 生成');
    const chapterIndex = documentXml.indexOf('第一章内容');

    expect(documentXml).toContain('投标文件目录');
    expect(tocIndex).toBeGreaterThan(-1);
    expect(documentXml).toContain('w:dirty="true"');
    expect(contentIndex).toBeGreaterThan(tocIndex);
    expect(chapterIndex).toBeGreaterThan(contentIndex);
    expect(documentXml).toContain('<w:br w:type="page"/>');
  });

  it('writes next-page section breaks between top-level chapters when enabled', async () => {
    const result = await buildDocxResult({
      project_name: '分节符测试项目',
      export_format: {
        page: {
          chapter_section_break_enabled: true,
        },
        headings: [],
        body_text: {},
      },
      outline: [
        {
          id: '1',
          title: '第一章',
          content: '第一章正文',
          children: [],
        },
        {
          id: '2',
          title: '第二章',
          content: '第二章正文',
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');
    const sectionCount = (documentXml.match(/<w:sectPr/g) || []).length;
    const firstChapterIndex = documentXml.indexOf('第一章');
    const secondChapterIndex = documentXml.indexOf('第二章');

    expect(sectionCount).toBeGreaterThanOrEqual(2);
    expect(documentXml).toContain('<w:type w:val="nextPage"/>');
    expect(firstChapterIndex).toBeGreaterThan(-1);
    expect(secondChapterIndex).toBeGreaterThan(firstChapterIndex);
  });

  it('inserts a visible fallback image when Mermaid conversion fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network blocked')) as unknown as typeof fetch;

    try {
      const result = await buildDocxResult({
        project_name: 'Mermaid 失败替代图测试项目',
        export_format: {
          page: {},
          headings: [],
          body_text: {},
        },
        outline: [
          {
            id: '1',
            title: '图表章节',
            content: '```mermaid\ngraph TD\nA-->B\n```',
            children: [],
          },
        ],
      }, { mermaidRetryAttempts: 0, mermaidRetryDelayMs: 0 });

      const zip = new AdmZip(result.buffer);
      const documentXml = zip.readAsText('word/document.xml');

      expect(result.warnings.some((warning) => warning.includes('Mermaid 图'))).toBe(true);
      expect(documentXml).toContain('<w:drawing>');
      expect(documentXml).toContain('Mermaid 图转换失败，已插入替代图');
      expect(documentXml).toContain('图表章节');
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it('applies configured Word image max width to exported image dimensions', async () => {
    const result = await buildDocxResult({
      project_name: '图片宽度策略测试项目',
      export_format: {
        page: {},
        headings: [],
        body_text: {},
        image: {
          max_width_px: 260,
        },
      },
      outline: [
        {
          id: '1',
          title: '图片章节',
          content: `![宽图](${widePngDataUrl})`,
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');

    expect(documentXml).toContain('<w:drawing>');
    expect(documentXml).toContain('cx="2476500"');
    expect(documentXml).toContain('cy="762000"');
  });

  it('applies configured table colors and cell margins to markdown tables', async () => {
    const result = await buildDocxResult({
      project_name: '表格样式测试项目',
      export_format: {
        page: {},
        headings: [],
        body_text: {},
        table: {
          header_fill_color: 'D9EAD3',
          border_color: '70AD47',
          inside_border_color: 'A9D18E',
          cell_margin_twips: 200,
        },
      },
      outline: [
        {
          id: '1',
          title: '表格章节',
          content: '| 指标 | 说明 |\n| --- | --- |\n| 响应时效 | 2 小时内响应 |',
          children: [],
        },
      ],
    });

    const zip = new AdmZip(result.buffer);
    const documentXml = zip.readAsText('word/document.xml');

    expect(documentXml).toContain('w:fill="D9EAD3"');
    expect(documentXml).toContain('w:color="70AD47"');
    expect(documentXml).toContain('w:color="A9D18E"');
    expect(documentXml).toContain('<w:tcMar>');
    expect(documentXml).toContain('w:w="200"');
    expect(documentXml).toContain('响应时效');
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
