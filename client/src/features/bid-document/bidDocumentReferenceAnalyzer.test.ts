// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createBidDocumentSample } = require('../../../electron/services/bidDocumentTemplates.cjs') as {
  createBidDocumentSample: (overrides?: Record<string, unknown>) => Record<string, any>;
};
const { writeBidDocumentWordFile } = require('../../../electron/services/bidDocumentWordBuilder.cjs') as {
  writeBidDocumentWordFile: (input: Record<string, unknown>, outputPath: string) => Promise<{ success: boolean; buildLog: Record<string, any>; bytes: number }>;
};
const { analyzeBidReferenceDocument, compareBidReferenceAnalyses } = require('../../../electron/services/bidDocumentReferenceAnalyzer.cjs') as {
  analyzeBidReferenceDocument: (filePath: string) => Record<string, any>;
  compareBidReferenceAnalyses: (referenceAnalysis: Record<string, any>, candidateAnalysis: Record<string, any>) => { passed: boolean; errors: string[]; details: Record<string, any> };
};

const tempDirs: string[] = [];
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function attachAssets(sample: Record<string, any>, outputDir: string) {
  const assetDir = path.join(outputDir, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  sample.assetMap = Object.fromEntries(Object.entries(sample.assetMap || {}).map(([key, asset]) => {
    const filePath = path.join(assetDir, `${key}.png`);
    fs.writeFileSync(filePath, onePixelPng);
    return [key, {
      ...(asset as Record<string, unknown>),
      filePath,
      type: 'image',
      required: true,
    }];
  }));
  return sample;
}

describe('bid document reference analyzer', () => {
  it('extracts headings, tables, images, TOC, page breaks and page layout from a real generated docx', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-reference-analyzer-'));
    tempDirs.push(tempDir);
    const sample = attachAssets(createBidDocumentSample({ templateId: 'generic-response' }), tempDir);
    const outputPath = path.join(tempDir, 'generic-response.docx');
    const build = await writeBidDocumentWordFile(sample, outputPath);

    expect(build.success).toBe(true);

    const analysis = analyzeBidReferenceDocument(outputPath);

    expect(analysis.ok).toBe(true);
    expect(analysis.summary.headingCount).toBeGreaterThanOrEqual(7);
    expect(analysis.summary.tableCount).toBeGreaterThanOrEqual(3);
    expect(analysis.summary.imageReferenceCount).toBe(Object.keys(sample.assetMap).length);
    expect(analysis.summary.tocFieldCount).toBeGreaterThanOrEqual(1);
    expect(analysis.summary.pageBreakCount).toBeGreaterThanOrEqual(5);
    expect(analysis.summary.hasPageNumberFooter).toBe(true);
    expect(analysis.layout.pageSize).toMatchObject({ width: '11906', height: '16838', orientation: 'portrait' });
    expect(analysis.layout.margins).toMatchObject({ top: '1440', right: '1440', bottom: '1440', left: '1440' });
    expect(analysis.headings.map((heading: Record<string, unknown>) => heading.text)).toEqual(expect.arrayContaining([
      '一、报价一览表',
      '六、技术方案',
      '七、项目实施方案',
      '八、产品售后方案',
      '九、质保期',
      '十、其他材料',
    ]));
    expect(analysis.tables.some((table: Record<string, any>) => table.textPreview.includes('项目名称'))).toBe(true);
    expect(analysis.images.every((image: Record<string, unknown>) => String(image.target || '').startsWith('media/'))).toBe(true);

    const alignment = compareBidReferenceAnalyses(analysis, analysis);
    expect(alignment.passed).toBe(true);
    expect(alignment.errors).toEqual([]);
  });

  it('returns a structured error when the reference file is missing', () => {
    const missing = analyzeBidReferenceDocument('/tmp/not-a-real-reference-docx.docx');

    expect(missing.ok).toBe(false);
    expect(missing.error).toBe('reference_docx_not_found');
  });

  it('reports missing and extra headings when candidate structure diverges from the reference', () => {
    const reference = {
      ok: true,
      layout: { pageSize: { width: '11906', height: '16838', orientation: 'portrait' }, margins: { top: '1440', right: '1440', bottom: '1440', left: '1440' } },
      summary: { tocFieldCount: 1, pageBreakCount: 2, imageReferenceCount: 1, footerCount: 1, hasPageNumberFooter: true },
      headings: [{ level: 1, text: '一、报价一览表' }, { level: 1, text: '六、技术方案' }],
      tables: [{ firstRow: ['序号', '名称', '品牌及型号'] }],
    };
    const candidate = {
      ok: true,
      layout: reference.layout,
      summary: reference.summary,
      headings: [{ level: 1, text: '一、报价一览表' }, { level: 1, text: '模型新增章节' }],
      tables: [{ firstRow: ['序号', '名称', '品牌及型号'] }],
    };

    const alignment = compareBidReferenceAnalyses(reference, candidate);

    expect(alignment.passed).toBe(false);
    expect(alignment.details.missingHeadings).toContain('1:六、技术方案');
    expect(alignment.details.extraHeadings).toContain('1:模型新增章节');
    expect(alignment.errors.join('\n')).toContain('missing headings');
  });
});
