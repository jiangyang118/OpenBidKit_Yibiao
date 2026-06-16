// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createDeveloperParserCapabilityReport, extractPageScreenshotCandidates, resolveFileParser } = require('../../../electron/services/fileService.cjs') as {
  createDeveloperParserCapabilityReport: () => {
    samples: Array<{
      extension: string;
      local_supported: boolean;
      local_ocr_supported: boolean;
      mineru_accurate_supported: boolean;
      mineru_agent_supported: boolean;
      recommended_provider: string;
      status: string;
      note: string;
    }>;
    chinese_path_smoke: { required: boolean; note: string; example: string };
    scanned_document_policy: string;
  };
  resolveFileParser: (config: unknown, filePath: string) => {
    provider: string;
    requestedProvider: string;
    ext: string;
    supported: boolean;
    fallbackToLocal: boolean;
  };
  extractPageScreenshotCandidates: (markdown: string, options?: { sourceType?: string; notePrefix?: string; recoverPageNumber?: boolean }) => Array<{
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    imageLine: number;
    assetUrl: string;
    sourceType?: string;
    note: string;
  }>;
};

describe('fileService parser capability report', () => {
  it('covers the parser hardening sample extensions and scanning guidance', () => {
    const report = createDeveloperParserCapabilityReport();
    const byExtension = new Map(report.samples.map((sample) => [sample.extension, sample]));

    expect([...byExtension.keys()]).toEqual(['.pdf', '.docx', '.doc', '.wps', '.ofd', '.jpeg', '.png']);
    expect(byExtension.get('.pdf')?.note).toContain('扫描件 PDF');
    expect(byExtension.get('.jpeg')?.status).toBe('local-ocr');
    expect(byExtension.get('.png')?.recommended_provider).toBe('local-ocr');
    expect(byExtension.get('.png')?.local_ocr_supported).toBe(true);
    expect(byExtension.get('.ofd')?.status).toBe('local-ocr');
    expect(byExtension.get('.ofd')?.recommended_provider).toBe('local-ocr');
    expect(byExtension.get('.ofd')?.note).toContain('OFD 可走本地 OCR');
    expect(report.scanned_document_policy).toContain('本地 OCR');
  });

  it('keeps Chinese path smoke requirements explicit and preserves local fallback behavior', () => {
    const report = createDeveloperParserCapabilityReport();
    const parser = resolveFileParser(
      { file_parser: { provider: 'mineru-agent-api' } },
      'C:\\投标项目\\样本文档\\技术方案样例.wps',
    );

    expect(report.chinese_path_smoke.required).toBe(true);
    expect(report.chinese_path_smoke.example).toContain('技术方案样例.docx');
    expect(parser.provider).toBe('local');
    expect(parser.fallbackToLocal).toBe(true);
  });

  it('extracts rejection-check page screenshot candidates from parsed Markdown images', () => {
    const candidates = extractPageScreenshotCandidates([
      '# 投标文件',
      '授权文件扫描页如下。',
      '![授权书页](yibiao-asset://imported-images/rejection-check-bid-abc/image-0001.png)',
      '复核页如下。',
      '<img src="yibiao-asset://imported-images/rejection-check-bid-abc/image-0002.png" />',
    ].join('\n'));

    expect(candidates).toEqual([
      {
        pageNumber: 1,
        lineStart: 1,
        lineEnd: 4,
        imageLine: 3,
        assetUrl: 'yibiao-asset://imported-images/rejection-check-bid-abc/image-0001.png',
        note: '图片说明：授权书页；前文：授权文件扫描页如下。；自动行号范围：第 1-4 行',
      },
      {
        pageNumber: 2,
        lineStart: 4,
        lineEnd: 5,
        imageLine: 5,
        assetUrl: 'yibiao-asset://imported-images/rejection-check-bid-abc/image-0002.png',
        note: '前文：复核页如下。；自动行号范围：第 4-5 行',
      },
    ]);
  });

  it('marks MinerU remote page images and recovers page numbers from image descriptions', () => {
    const candidates = extractPageScreenshotCandidates([
      '# 投标文件',
      '授权文件在远程解析第 3 页。',
      '![第3页 授权书](yibiao-asset://imported-images/mineru-abc/image-0001.png)',
      '下一页是承诺函。',
      '![page-4 commitment](yibiao-asset://imported-images/mineru-abc/image-0002.png)',
    ].join('\n'), {
      sourceType: 'mineru-remote-image',
      notePrefix: 'MinerU 精准解析 API返回的页面图片',
    });

    expect(candidates).toMatchObject([
      {
        pageNumber: 3,
        sourceType: 'mineru-remote-image',
        assetUrl: 'yibiao-asset://imported-images/mineru-abc/image-0001.png',
      },
      {
        pageNumber: 4,
        sourceType: 'mineru-remote-image',
        assetUrl: 'yibiao-asset://imported-images/mineru-abc/image-0002.png',
      },
    ]);
    expect(candidates[0].note).toContain('MinerU 精准解析 API返回的页面图片');
    expect(candidates[0].note).toContain('图片说明：第3页 授权书');
    expect(candidates[1].note).toContain('图片说明：page-4 commitment');
  });
});
