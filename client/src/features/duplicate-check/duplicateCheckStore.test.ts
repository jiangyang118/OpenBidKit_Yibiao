// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { DuplicateCheckWorkspaceState } from '../../shared/types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { buildContentIgnoreRulePackage, normalizeImportedContentIgnoreRules, buildDuplicateCheckReportMarkdown, buildDuplicateCheckReportDocxBuffer, buildDuplicateCheckReportPdfBuffer } = require('../../../electron/services/duplicateCheckStore.cjs') as {
  buildContentIgnoreRulePackage: (rules: Array<{ pattern: string; normalized: string; category?: string }>) => { kind: string; version: number; rules: Array<{ pattern: string; normalized: string; category: string; category_label: string }> };
  normalizeImportedContentIgnoreRules: (payload: unknown) => { rules: Array<{ pattern: string; normalized: string; category: string }>; skippedCount: number };
  buildDuplicateCheckReportMarkdown: (state: DuplicateCheckWorkspaceState) => string;
  buildDuplicateCheckReportDocxBuffer: (state: DuplicateCheckWorkspaceState) => Promise<Buffer>;
  buildDuplicateCheckReportPdfBuffer: (state: DuplicateCheckWorkspaceState) => Buffer;
};
const { buildDuplicateImages, hammingDistance64 } = require('../../../electron/services/duplicateCheckService.cjs') as {
  buildDuplicateImages: (globalImages: Map<string, unknown>) => Array<Record<string, unknown>>;
  hammingDistance64: (left: string, right: string) => number;
};

function createDuplicateReportState(): DuplicateCheckWorkspaceState {
  return {
    tenderFile: {
      id: 'tender-1',
      file_name: '招标文件.docx',
      file_path: '/tmp/招标文件.docx',
      extension: '.docx',
      size: 2048,
      modified_at: '2026-06-15T09:00:00.000Z',
    },
    bidFiles: [
      {
        id: 'bid-1',
        file_name: '投标文件A.docx',
        file_path: '/tmp/投标文件A.docx',
        extension: '.docx',
        size: 1024,
        modified_at: '2026-06-15T10:00:00.000Z',
      },
      {
        id: 'bid-2',
        file_name: '投标文件B.docx',
        file_path: '/tmp/投标文件B.docx',
        extension: '.docx',
        size: 1536,
        modified_at: '2026-06-15T10:05:00.000Z',
      },
    ],
    step: 'analysis',
    activeAnalysisTab: 'content',
    metadataAnalysis: {
      status: 'success',
      progress: 100,
      message: '元数据分析完成',
      contentExtraction: { status: 'success', completed: 2, total: 2 },
      metadataExtraction: { status: 'success', completed: 2, total: 2 },
      files: [],
      rows: [],
      contentFiles: [],
    },
    outlineAnalysis: {
      status: 'success',
      progress: 100,
      message: '目录分析完成',
      tenderSentenceCount: 0,
      tenderMatchedItemCount: 0,
      extraction: { status: 'success', completed: 2, total: 2 },
      files: [],
      duplicateGroups: [],
      pairwiseSimilarities: [],
    },
    contentAnalysis: {
      status: 'success',
      progress: 100,
      message: '正文比对完成',
      tenderSentenceCount: 0,
      tenderMatchedSentenceCount: 0,
      totalSentenceCount: 4,
      extraction: { status: 'success', completed: 2, total: 2 },
      duplicateSentences: [
        {
          id: 'C000001',
          sentence: '项目团队提供驻场服务。',
          normalized: '项目团队提供驻场服务。',
          file_ids: ['bid-1', 'bid-2'],
          occurrences: { 'bid-1': 1, 'bid-2': 1 },
          first_order: 1,
          resolution_status: 'pending',
        },
        {
          id: 'C000002',
          sentence: '售后服务承诺完全相同。',
          normalized: '售后服务承诺完全相同。',
          file_ids: ['bid-1', 'bid-2'],
          occurrences: { 'bid-1': 1, 'bid-2': 1 },
          first_order: 2,
          resolution_status: 'confirmed',
        },
        {
          id: 'C000003',
          sentence: '固定模板声明。',
          normalized: '固定模板声明。',
          file_ids: ['bid-1', 'bid-2'],
          occurrences: { 'bid-1': 1, 'bid-2': 1 },
          first_order: 3,
          resolution_status: 'ignored',
        },
      ],
    },
    imageAnalysis: {
      status: 'success',
      progress: 100,
      message: '图片比对完成',
      extraction: { status: 'success', completed: 2, total: 2 },
      totalImageCount: 3,
      files: [],
      duplicateImages: [
        {
          id: 'IMG-001',
          hash: 'hash-001',
          preview_url: '',
          file_ids: ['bid-1', 'bid-2'],
          occurrences: { 'bid-1': 1, 'bid-2': 1 },
          resolution_status: 'pending',
        },
        {
          id: 'IMG-002',
          hash: 'hash-002',
          preview_url: '',
          file_ids: ['bid-1', 'bid-2'],
          occurrences: { 'bid-1': 1, 'bid-2': 1 },
          resolution_status: 'confirmed',
          match_type: 'similar',
          similarity_score: 0.9219,
          similarity_reason: '感知哈希相似度 92%，疑似压缩、缩放或截图后复用',
          locations: {
            'bid-1': [{ image_index: 1, directory: '方案', previous_sentence: '系统架构图' }],
            'bid-2': [{ image_index: 2, directory: '方案', previous_sentence: '系统架构截图' }],
          },
        },
      ],
    },
    contentIgnoreRules: [
      {
        rule_id: 'RULE-001',
        pattern: '固定模板声明。',
        normalized: '固定模板声明。',
        created_at: '2026-06-15T11:00:00.000Z',
        updated_at: '2026-06-15T11:00:00.000Z',
      },
    ],
  };
}

function utf16BeHex(text: string) {
  return [...text].map((char) => {
    const codePoint = char.codePointAt(0) || 0;
    if (codePoint > 0xffff) {
      const value = codePoint - 0x10000;
      const high = 0xd800 + (value >> 10);
      const low = 0xdc00 + (value & 0x3ff);
      return `${high.toString(16).padStart(4, '0')}${low.toString(16).padStart(4, '0')}`;
    }
    return codePoint.toString(16).padStart(4, '0');
  }).join('').toUpperCase();
}

describe('duplicateCheckStore report export', () => {
  it('builds batch handling suggestions from content and image resolution state', () => {
    const markdown = buildDuplicateCheckReportMarkdown(createDuplicateReportState());

    expect(markdown).toContain('# 标书查重报告');
    expect(markdown).toContain('## 批量处理建议');
    expect(markdown).toContain('- 正文重复句：仍有 1 条未处理');
    expect(markdown).toContain('- 已确认正文重复：1 条');
    expect(markdown).toContain('- 正文忽略项：已忽略 1 条，当前保存 1 条常用忽略规则');
    expect(markdown).toContain('- 重复图片：仍有 1 组未处理');
    expect(markdown).toContain('- 已确认重复图片：1 组');
    expect(markdown).toContain('| 已确认 | 相似图片 | 92% | hash-002 |');
    expect(markdown).toContain('疑似压缩、缩放或截图后复用');
    expect(markdown).toContain('### 相似图片复核视图');
    expect(markdown).toContain('- 图片组 IMG-002（相似图片，92%）：hash-002');
    expect(markdown).toContain('- 投标文件A.docx：图序 1；目录：方案；前文：系统架构图');
    expect(markdown).toContain('- 投标文件B.docx：图序 2；目录：方案；前文：系统架构截图');
    expect(markdown).toContain('建议人工打开涉及文件逐图核对裁剪、缩放、压缩、水印或截图复用痕迹');
    expect(markdown).toContain('## 后续处理建议');
  });

  it('builds a docx report from the same duplicate check report content', async () => {
    const buffer = await buildDuplicateCheckReportDocxBuffer(createDuplicateReportState());
    const zip = new AdmZip(buffer);
    const documentXml = zip.readAsText('word/document.xml');

    expect(documentXml).toContain('标书查重报告');
    expect(documentXml).toContain('批量处理建议');
    expect(documentXml).toContain('项目团队提供驻场服务。');
    expect(documentXml).toContain('重复/相似图片');
    expect(documentXml).toContain('相似图片');
    expect(documentXml).toContain('相似图片复核视图');
    expect(documentXml).toContain('图序 1；目录：方案；前文：系统架构图');
  });

  it('builds a pdf text report from the same duplicate check report content', () => {
    const buffer = buildDuplicateCheckReportPdfBuffer(createDuplicateReportState());
    const pdf = buffer.toString('binary');

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf).toContain('/BaseFont /STSong-Light');
    expect(pdf).toContain(`<${utf16BeHex('标书查重报告')}>`);
    expect(pdf).toContain(`<${utf16BeHex('批量处理建议')}>`);
    expect(pdf).toContain(utf16BeHex('项目团队提供驻场服务。'));
    expect(pdf).toContain(`<${utf16BeHex('重复/相似图片')}>`);
    expect(pdf).toContain(utf16BeHex('相似图片'));
    expect(pdf).toContain(`<${utf16BeHex('相似图片复核视图')}>`);
    expect(pdf).toContain(utf16BeHex('图序 1；目录：方案；前文：系统架构图'));
    expect(pdf).toContain('0.91 0.96 0.98 rg');
    expect(pdf).toContain('0.10 0.55 0.65 RG');
    expect(pdf).toContain('500 17 re f');
  });
});

describe('duplicateCheckStore content ignore rules', () => {
  it('builds and normalizes categorized JSON packages for cross-project imports', () => {
    const exportedJson = buildContentIgnoreRulePackage([
      {
        pattern: '固定模板声明。',
        normalized: '固定模板声明。',
        category: 'boilerplate',
      },
    ]);
    expect(exportedJson.kind).toBe('yibiao.duplicateCheck.contentIgnoreRules');
    expect(exportedJson.rules[0]).toMatchObject({
      pattern: '固定模板声明。',
      normalized: '固定模板声明。',
      category: 'boilerplate',
      category_label: '固定模板',
    });

    const imported = normalizeImportedContentIgnoreRules({
      rules: [
        exportedJson.rules[0],
        { pattern: '  1. 招标引用句。', category: 'tender-reference' },
        { pattern: '', normalized: '' },
        { pattern: '固定模板声明。', normalized: '固定模板声明。', category: 'unknown' },
      ],
    });
    expect(imported.skippedCount).toBe(1);
    expect(imported.rules).toEqual([
      { pattern: '固定模板声明。', normalized: '固定模板声明。', category: 'manual' },
      { pattern: '1. 招标引用句。', normalized: '招标引用句。', category: 'tender-reference' },
    ]);
  });
});

describe('duplicateCheckService similar image grouping', () => {
  it('groups different image hashes by perceptual hash distance', () => {
    const images = new Map<string, unknown>([
      ['exact-a', {
        hash: 'exact-a',
        preview_url: 'file:///a.png',
        file_ids: ['bid-1'],
        occurrences: { 'bid-1': 1 },
        locations: { 'bid-1': [{ image_index: 1, directory: '方案', previous_sentence: '系统架构图' }] },
        perceptual_hash: 'ff00ff00ff00ff00',
        width: 800,
        height: 600,
      }],
      ['compressed-b', {
        hash: 'compressed-b',
        preview_url: 'file:///b.png',
        file_ids: ['bid-2'],
        occurrences: { 'bid-2': 1 },
        locations: { 'bid-2': [{ image_index: 2, directory: '方案', previous_sentence: '系统架构截图' }] },
        perceptual_hash: 'ff00ff00ff00ff0f',
        width: 400,
        height: 300,
      }],
      ['different-c', {
        hash: 'different-c',
        preview_url: 'file:///c.png',
        file_ids: ['bid-3'],
        occurrences: { 'bid-3': 1 },
        locations: { 'bid-3': [{ image_index: 1, directory: '其他', previous_sentence: '公司照片' }] },
        perceptual_hash: '00ff00ff00ff00ff',
        width: 800,
        height: 600,
      }],
    ]);

    expect(hammingDistance64('ff00ff00ff00ff00', 'ff00ff00ff00ff0f')).toBe(4);
    const groups = buildDuplicateImages(images);
    const similarGroup = groups.find((item) => item.match_type === 'similar');

    expect(similarGroup).toMatchObject({
      file_ids: ['bid-1', 'bid-2'],
      match_type: 'similar',
    });
    expect(similarGroup?.similarity_score).toBeGreaterThan(0.9);
    expect(similarGroup?.similarity_reason).toContain('感知哈希相似度');
    expect(groups.find((item) => String(item.hash).includes('different-c'))).toBeUndefined();
  });
});
