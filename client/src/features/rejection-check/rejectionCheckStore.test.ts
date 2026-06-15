// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { RejectionCheckWorkspaceState } from './types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { buildRejectionCheckReportMarkdown, buildRejectionCheckReportDocxBuffer, buildRejectionCheckReportPdfBuffer } = require('../../../electron/services/rejectionCheckStore.cjs') as {
  buildRejectionCheckReportMarkdown: (state: RejectionCheckWorkspaceState) => string;
  buildRejectionCheckReportDocxBuffer: (state: RejectionCheckWorkspaceState) => Promise<Buffer>;
  buildRejectionCheckReportPdfBuffer: (state: RejectionCheckWorkspaceState) => Buffer;
};

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
    expect(markdown).toContain('以下为文本型截图视图，保留目标行和前后文，便于在 Markdown、Word 和 PDF 中复核证据。');
    expect(markdown).toContain('- ▶ 第 4 行 | 授权书将在中标后补充。');
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
    expect(pdf).toContain('0.90 0.94 1 rg');
    expect(pdf).toContain('0.20 0.45 0.88 RG');
    expect(pdf).toContain('500 17 re f');
    expect(pdf).not.toContain(utf16BeHex('已忽略证据'));
  });
});
