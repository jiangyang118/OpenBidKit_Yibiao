// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RejectionCheckWorkspaceState } from './types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const {
  createRejectionCheckStore,
  buildRejectionCheckReportMarkdown,
  buildRejectionCheckReportMarkdownWithEvidenceCrops,
  buildRejectionCheckReportDocxBuffer,
  buildRejectionCheckReportPdfBuffer,
} = require('../../../electron/services/rejectionCheckStore.cjs') as {
  createRejectionCheckStore: (options: { app: { getPath: (name: string) => string }; db: unknown }) => {
    updateRejectionCheck: (partial: Partial<RejectionCheckWorkspaceState>) => RejectionCheckWorkspaceState;
    loadRejectionCheck: () => RejectionCheckWorkspaceState;
  };
  buildRejectionCheckReportMarkdown: (state: RejectionCheckWorkspaceState) => string;
  buildRejectionCheckReportMarkdownWithEvidenceCrops: (state: RejectionCheckWorkspaceState, app: { getPath: (name: string) => string }) => Promise<string>;
  buildRejectionCheckReportDocxBuffer: (state: RejectionCheckWorkspaceState, options?: { app?: { getPath: (name: string) => string }; markdown?: string }) => Promise<Buffer>;
  buildRejectionCheckReportPdfBuffer: (state: RejectionCheckWorkspaceState, options?: { markdown?: string }) => Buffer;
};

const tempDirs: string[] = [];

function createTempApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-rejection-check-'));
  tempDirs.push(userDataDir);
  return {
    getPath(name: string) {
      if (name !== 'userData') throw new Error(`unexpected app path: ${name}`);
      return userDataDir;
    },
  };
}

function createFakeRejectionCheckDb() {
  let meta: Record<string, unknown> | undefined;
  let documents: Array<Record<string, unknown>> = [];
  const sortDocuments = (rows: Array<Record<string, unknown>>) => [...rows].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  return {
    transaction(fn: (...args: unknown[]) => unknown) {
      return (...args: unknown[]) => fn(...args);
    },
    prepare(sql: string) {
      if (/SELECT \* FROM rejection_check_meta WHERE id = 1/i.test(sql)) {
        return { get: () => meta };
      }
      if (/INSERT INTO rejection_check_meta/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            meta = {
              id: 1,
              step: 'documents',
              active_document_tab: 'tender',
              active_result_tab: 'analysis',
              active_check_result_tab: 'rejection',
              custom_check_items: '',
              check_options_json: params.check_options_json,
              created_at: params.timestamp,
              updated_at: params.timestamp,
            };
            return { changes: 1 };
          },
        };
      }
      if (/UPDATE rejection_check_meta SET/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            meta = { ...(meta || {}), ...params };
            return { changes: 1 };
          },
        };
      }
      if (/INSERT INTO rejection_check_documents/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const existingIndex = documents.findIndex((item) => item.document_id === params.document_id);
            if (existingIndex >= 0) documents[existingIndex] = { ...documents[existingIndex], ...params };
            else documents.push({ ...params });
            return { changes: 1 };
          },
        };
      }
      if (/SELECT \* FROM rejection_check_documents WHERE document_id = \? AND role = \?/i.test(sql)) {
        return { get: (documentId: string, role: string) => documents.find((item) => item.document_id === documentId && item.role === role) };
      }
      if (/SELECT \* FROM rejection_check_documents WHERE document_id = \?/i.test(sql)) {
        return { get: (documentId: string) => documents.find((item) => item.document_id === documentId) };
      }
      if (/SELECT \* FROM rejection_check_documents WHERE role = 'tender'/i.test(sql)) {
        return { get: () => sortDocuments(documents.filter((item) => item.role === 'tender'))[0], all: () => documents.filter((item) => item.role === 'tender') };
      }
      if (/SELECT \* FROM rejection_check_documents WHERE role = 'bid'/i.test(sql)) {
        return { get: () => sortDocuments(documents.filter((item) => item.role === 'bid'))[0], all: () => sortDocuments(documents.filter((item) => item.role === 'bid')) };
      }
      if (/SELECT document_id FROM rejection_check_documents WHERE role = 'bid'/i.test(sql)) {
        return {
          get: () => sortDocuments(documents.filter((item) => item.role === 'bid')).map((item) => ({ document_id: item.document_id }))[0],
          all: () => sortDocuments(documents.filter((item) => item.role === 'bid')).map((item) => ({ document_id: item.document_id })),
        };
      }
      if (/UPDATE rejection_check_documents SET sort_order/i.test(sql)) {
        return {
          run: (sortOrder: number, updatedAt: string, documentId: string) => {
            const row = documents.find((item) => item.document_id === documentId);
            if (row) {
              row.sort_order = sortOrder;
              row.updated_at = updatedAt;
            }
            return { changes: row ? 1 : 0 };
          },
        };
      }
      if (/DELETE FROM rejection_check_documents WHERE role = 'bid'/i.test(sql)) {
        return { run: () => { documents = documents.filter((item) => item.role !== 'bid'); return { changes: 1 }; } };
      }
      if (/DELETE FROM rejection_check_documents WHERE role = 'tender'/i.test(sql)) {
        return { run: () => { documents = documents.filter((item) => item.role !== 'tender'); return { changes: 1 }; } };
      }
      if (/SELECT \* FROM rejection_check_tasks/i.test(sql)) return { all: () => [] };
      if (/SELECT \* FROM rejection_check_extraction WHERE id = 1/i.test(sql)) return { get: () => undefined };
      if (/SELECT \* FROM rejection_check_results WHERE result_type = \?/i.test(sql)) return { get: () => undefined };
      if (/SELECT \* FROM rejection_check_(risk|typo|logic)_findings/i.test(sql)) return { all: () => [] };
      if (/DELETE FROM rejection_check_/i.test(sql)) return { run: () => ({ changes: 1 }) };
      throw new Error(`Unhandled SQL in fake rejection-check DB: ${sql}`);
    },
  };
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

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

function resolveImportedAssetPath(app: { getPath: (name: string) => string }, assetUrl: string) {
  const parsed = new URL(assetUrl);
  if (parsed.protocol !== 'yibiao-asset:' || parsed.hostname !== 'imported-images') {
    throw new Error(`unexpected asset URL: ${assetUrl}`);
  }
  return path.join(app.getPath('userData'), 'workspace', 'imported-images', decodeURIComponent(parsed.pathname.replace(/^\/+/, '')));
}

function writePageScreenshotAsset(app: { getPath: (name: string) => string }) {
  const canvas = require('@napi-rs/canvas');
  const pageCanvas = canvas.createCanvas(1000, 1400);
  const context = pageCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1000, 1400);
  context.fillStyle = '#dbeafe';
  context.fillRect(80, 240, 460, 120);
  context.fillStyle = '#111827';
  context.font = '32px sans-serif';
  context.fillText('授权书将在中标后补充。', 110, 310);
  const targetPath = resolveImportedAssetPath(app, 'yibiao-asset://imported-images/rejection-check-bid/image-0002.png');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, pageCanvas.toBuffer('image/png'));
  return targetPath;
}

function createRejectionReportState(): RejectionCheckWorkspaceState {
  return {
    tenderDocument: {
      id: 'tender',
      role: 'tender',
      fileName: '招标文件.docx',
      content: '未按要求提供授权书将被否决投标。',
      source: 'upload',
      importedAt: '2026-06-15T10:00:00.000Z',
    },
    bidDocuments: [
      {
        id: 'bid-1',
        role: 'bid',
        fileName: '投标文件A.docx',
        content: [
          '# 投标文件',
          '## 授权文件',
          '投标文件承诺授全书将在中标后补充。',
          '授权书将在中标后补充。',
          '目录列明已提交授权书，正文又写将在中标后补充。',
        ].join('\n'),
        source: 'upload',
        importedAt: '2026-06-15T10:10:00.000Z',
        pageScreenshots: [
          {
            pageNumber: 2,
            lineStart: 3,
            lineEnd: 4,
            assetUrl: 'yibiao-asset://imported-images/rejection-check-bid/image-0002.png',
            crop: { left: 80, top: 240, width: 460, height: 120 },
            note: '解析器生成的第 2 页截图。',
          },
        ],
      },
    ],
    activeDocumentTab: 'tender',
    customCheckItems: '关注授权材料。',
    invalidBidAndRejectionItems: {
      status: 'success',
      content: '- 未按要求提供授权书将被否决投标。',
    },
    rejectionCheckResult: {
      status: 'success',
      findings: [
        {
          id: 'risk-1',
          bidDocumentId: 'bid-1',
          type: 'rejectionItem',
          severity: 'high',
          title: '授权书缺失',
          summary: '授权书未按招标文件要求提供',
          requirement: '未按要求提供授权书将被否决投标。',
          bidEvidence: '授权书将在中标后补充。',
          riskReason: '投标文件没有随投标资料提交授权书。',
          suggestion: '补充有效授权书并重新核对投标文件附件。',
        },
        {
          id: 'risk-ignored',
          bidDocumentId: 'bid-1',
          type: 'rejectionItem',
          severity: 'low',
          title: '已忽略风险',
          summary: '已忽略',
          requirement: '已忽略',
          bidEvidence: '已忽略证据',
          riskReason: '已忽略原因',
          suggestion: '无需处理',
          resolution_status: 'ignored',
        },
      ],
    },
    typoCheckResult: {
      status: 'success',
      findings: [
        {
          id: 'typo-1',
          bidDocumentId: 'bid-1',
          wrongText: '授全书',
          correctText: '授权书',
          originalExcerpt: '投标文件承诺授全书将在中标后补充。',
          reason: '“授全书”疑似“授权书”的错别字。',
          locationHint: '授权文件章节第 2 段',
        },
      ],
    },
    logicCheckResult: {
      status: 'success',
      findings: [
        {
          id: 'logic-1',
          bidDocumentId: 'bid-1',
          title: '授权书提交时间矛盾',
          originalText: '目录列明已提交授权书，正文又写将在中标后补充。',
          locationHint: '授权文件章节与附件目录',
          fallacyReason: '同一材料的提交状态前后不一致。',
          suggestion: '统一授权书提交状态。',
        },
      ],
    },
  };
}

describe('rejectionCheckStore report export', () => {
  it('persists imported page screenshot candidates with rejection-check documents', () => {
    const store = createRejectionCheckStore({ app: createTempApp(), db: createFakeRejectionCheckDb() });

    store.updateRejectionCheck({
      bidDocuments: [
        {
          id: 'bid-screenshot',
          role: 'bid',
          fileName: '投标文件截图.docx',
          content: '授权书将在中标后补充。',
          source: 'upload',
          importedAt: '2026-06-15T10:10:00.000Z',
          pageScreenshots: [
            {
              pageNumber: 1,
              lineStart: 1,
              lineEnd: 1,
              assetUrl: 'yibiao-asset://imported-images/rejection-check-bid-abc/image-0001.png',
              note: '图片说明：授权书页；前文：授权文件扫描页如下。',
            },
          ],
        },
      ],
    });

    const loaded = store.loadRejectionCheck();

    expect(loaded.bidDocuments[0].pageScreenshots).toEqual([
      {
        pageNumber: 1,
        lineStart: 1,
        lineEnd: 1,
        assetUrl: 'yibiao-asset://imported-images/rejection-check-bid-abc/image-0001.png',
        note: '图片说明：授权书页；前文：授权文件扫描页如下。',
      },
    ]);
  });

  it('builds evidence location details for rejection, typo and logic findings', () => {
    const markdown = buildRejectionCheckReportMarkdown(createRejectionReportState());

    expect(markdown).toContain('# 废标项检查报告');
    expect(markdown).toContain('## 证据定位明细');
    expect(markdown).toContain('| 序号 | 类型 | 投标文件 | 标题 | 定位 |');
    expect(markdown).toContain('| 1 | 废标项风险 | 投标文件1（投标文件A.docx） | [授权书缺失](#evidence-rejection-risk-1) |');
    expect(markdown).toContain('| 2 | 错别字 | 投标文件1（投标文件A.docx） | [授全书](#evidence-typo-typo-1) |');
    expect(markdown).toContain('| 3 | 逻辑问题 | 投标文件1（投标文件A.docx） | [授权书提交时间矛盾](#evidence-logic-logic-1) |');
    expect(markdown).toContain('<a id="evidence-rejection-risk-1"></a>');
    expect(markdown).toContain('### 废标项风险 1：授权书缺失');
    expect(markdown).toContain('- 投标文件：投标文件1（投标文件A.docx）');
    expect(markdown).toContain('- 原文证据：授权书将在中标后补充。');
    expect(markdown).toContain('- 原文定位：章节：授权文件；行号：第 4 行附近');
    expect(markdown).toContain('前后文：3: 投标文件承诺授全书将在中标后补充。 / 4: 授权书将在中标后补充。 / 5: 目录列明已提交授权书，正文又写将在中标后补充。');
    expect(markdown).toContain('#### 证据截图视图');
    expect(markdown).toContain('以下为文本型截图视图，保留目标行、前后文和可用页面截图候选，便于在 Markdown、Word 和 PDF 中复核证据。');
    expect(markdown).toContain('- ▶ 第 4 行 | 授权书将在中标后补充。');
    expect(markdown).toContain('- [页面截图] 页面：第 2 页（按行号范围匹配）');
    expect(markdown).toContain('- [页面截图] 素材：yibiao-asset://imported-images/rejection-check-bid/image-0002.png');
    expect(markdown).toContain('- [页面截图] 裁剪状态：已提供裁剪框：x=80, y=240, w=460, h=120');
    expect(markdown).toContain('- [页面截图] 说明：解析器生成的第 2 页截图。');
    expect(markdown).toContain('<a id="evidence-typo-typo-1"></a>');
    expect(markdown).toContain('### 错别字 1：授全书');
    expect(markdown).toContain('- 位置线索：授权文件章节第 2 段');
    expect(markdown).toContain('- 原文定位：章节：授权文件；行号：第 3 行附近');
    expect(markdown).toContain('<a id="evidence-logic-logic-1"></a>');
    expect(markdown).toContain('### 逻辑问题 1：授权书提交时间矛盾');
    expect(markdown).toContain('- 原文定位：章节：授权文件；行号：第 5 行附近');
    expect(markdown).toContain('- 问题原因：同一材料的提交状态前后不一致。');
    expect(markdown).not.toContain('已忽略证据');
  });

  it('builds automatic crop boxes for matched page screenshot candidates without crop metadata', () => {
    const state = createRejectionReportState();
    state.bidDocuments[0].pageScreenshots = [
      {
        pageNumber: 2,
        lineStart: 3,
        lineEnd: 5,
        assetUrl: 'yibiao-asset://imported-images/rejection-check-bid/image-0002.png',
        width: 1000,
        height: 1400,
        note: '解析器生成的第 2 页截图候选。',
      },
    ];

    const markdown = buildRejectionCheckReportMarkdown(state);

    expect(markdown).toContain('- [页面截图] 页面：第 2 页（按行号范围匹配）');
    expect(markdown).toContain('- [页面截图] 裁剪状态：自动生成裁剪框：x=80, y=574, w=840, h=252');
  });

  it('generates cropped evidence image assets for matched page screenshots', async () => {
    const app = createTempApp();
    writePageScreenshotAsset(app);
    const state = createRejectionReportState();

    const markdown = await buildRejectionCheckReportMarkdownWithEvidenceCrops(state, app);

    const cropAssetMatch = markdown.match(/\[页面截图\] 裁剪图：(yibiao-asset:\/\/imported-images\/rejection-check-evidence-crops\/crop-[^) \n]+\.png)/);
    expect(cropAssetMatch?.[1]).toBeTruthy();
    expect(markdown).toContain(`![证据裁剪图](${cropAssetMatch?.[1]})`);

    const cropPath = resolveImportedAssetPath(app, cropAssetMatch?.[1] || '');
    const crop = fs.readFileSync(cropPath);
    expect(crop.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    const docxBuffer = await buildRejectionCheckReportDocxBuffer(state, { app, markdown });
    const zip = new AdmZip(docxBuffer);
    const mediaEntries = zip.getEntries().filter((entry: { entryName: string }) => /^word\/media\/.+\.png$/i.test(entry.entryName));
    expect(mediaEntries.length).toBeGreaterThan(0);
  });

  it('builds a docx report with evidence index and details', async () => {
    const buffer = await buildRejectionCheckReportDocxBuffer(createRejectionReportState());
    const zip = new AdmZip(buffer);
    const documentXml = zip.readAsText('word/document.xml');

    expect(documentXml).toContain('废标项检查报告');
    expect(documentXml).toContain('证据定位明细');
    expect(documentXml).toContain('证据截图视图');
    expect(documentXml).toContain('授权书缺失');
    expect(documentXml).toContain('授权书将在中标后补充。');
    expect(documentXml).toContain('▶ 第 4 行 | 授权书将在中标后补充。');
    expect(documentXml).toContain('[页面截图] 页面：第 2 页（按行号范围匹配）');
    expect(documentXml).toContain('[页面截图] 裁剪状态：已提供裁剪框：x=80, y=240, w=460, h=120');
    expect(documentXml).toContain('授权书提交时间矛盾');
    expect(documentXml).not.toContain('已忽略证据');
  });

  it('builds a pdf report with evidence index and details', () => {
    const buffer = buildRejectionCheckReportPdfBuffer(createRejectionReportState());
    const pdf = buffer.toString('binary');

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf).toContain('/BaseFont /STSong-Light');
    expect(pdf).toContain(utf16BeHex('废标项检查报告'));
    expect(pdf).toContain(utf16BeHex('证据定位明细'));
    expect(pdf).toContain(utf16BeHex('证据截图视图'));
    expect(pdf).toContain(utf16BeHex('授权书缺失'));
    expect(pdf).toContain(utf16BeHex('授权书将在中标后补充。'));
    expect(pdf).toContain(utf16BeHex('▶ 第 4 行 | 授权书将在中标后补充。'));
    expect(pdf).toContain(utf16BeHex('[页面截图] 页面：第 2 页（按行号范围匹配）'));
    expect(pdf).toContain(utf16BeHex('[页面截图] 裁剪状态：已提供裁剪框：x=80, y=240, w=460, h=120'));
    expect(pdf).toContain('0.90 0.94 1 rg');
    expect(pdf).toContain('0.20 0.45 0.88 RG');
    expect(pdf).toContain('500 17 re f');
    expect(pdf).not.toContain(utf16BeHex('已忽略证据'));
  });
});
