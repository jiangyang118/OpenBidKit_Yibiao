// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusinessBidState } from './types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { buildBusinessBidExcelBuffer, buildBusinessBidReportMarkdown, buildBusinessBidWordBuffer, createBusinessBidStore } = require('../../../electron/services/businessBidStore.cjs') as {
  buildBusinessBidExcelBuffer: (state: BusinessBidState) => Buffer;
  buildBusinessBidReportMarkdown: (state: BusinessBidState) => string;
  buildBusinessBidWordBuffer: (state: BusinessBidState) => Promise<Buffer>;
  createBusinessBidStore: (options: {
    db: unknown;
    technicalPlanStore?: unknown;
    workspaceRoot?: string;
    fileService?: { importTechnicalPlanDocument: (label?: string) => Promise<Record<string, unknown>> };
    aiService?: { requestJson: (request: Record<string, unknown>) => Promise<unknown> };
  }) => {
    importTenderDocument: () => Promise<{ success: boolean; message: string; state: BusinessBidState }>;
    enhanceWithAi: () => Promise<{ success: boolean; message: string; state: BusinessBidState }>;
    importAttachments: (options: { filePaths: string[]; kind?: string; owner?: string; note?: string }) => Promise<{ success: boolean; message: string; state: BusinessBidState }>;
    updateAttachment: (id: string, patch: Record<string, unknown>) => BusinessBidState;
    deleteAttachment: (id: string) => BusinessBidState;
    exportOfficePackage: (options: { format: 'docx' | 'xlsx'; filePath: string }) => Promise<{ success: boolean; message: string; bytes: number; format: string; filePath: string }>;
    updateClause: (id: string, patch: Record<string, unknown>) => BusinessBidState;
  };
};

const reportState: BusinessBidState = {
  source: {
    type: 'technical-plan',
    fileName: '商务招标文件.docx',
    contentHash: 'hash-1',
    generatedAt: '2026-06-15T09:00:00.000Z',
  },
  clauses: [
    {
      id: 'business-001',
      category: 'contract',
      label: '合同条款',
      originalText: '合同违约责任按招标文件执行。',
      responseText: '完全响应合同违约责任要求。',
      deviationType: 'none',
      riskLevel: 'medium',
      materialRequirement: '补充合同响应承诺。',
      owner: '商务负责人',
      confirmedBy: '项目经理',
      confirmed: true,
      sourceHint: '技术方案招标文件',
      sortOrder: 0,
      updatedAt: '2026-06-15T09:00:00.000Z',
    },
    {
      id: 'business-002',
      category: 'qualification',
      label: '资信材料',
      originalText: '需提供近三年类似业绩证明。',
      responseText: '响应并提供业绩证明。',
      deviationType: 'pending',
      riskLevel: 'high',
      materialRequirement: '补充业绩合同和验收证明。',
      owner: '',
      confirmedBy: '',
      confirmed: false,
      sourceHint: '技术方案招标文件',
      sortOrder: 1,
      updatedAt: '2026-06-15T09:00:00.000Z',
    },
    {
      id: 'business-003',
      category: 'quote',
      label: '报价要求',
      originalText: '投标文件应包含分项报价表。',
      responseText: '响应并提供分项报价表。',
      deviationType: 'none',
      riskLevel: 'medium',
      materialRequirement: '补充分项报价表。',
      owner: '报价负责人',
      confirmedBy: '财务经理',
      confirmed: true,
      sourceHint: '技术方案招标文件',
      sortOrder: 2,
      updatedAt: '2026-06-15T09:00:00.000Z',
    },
  ],
  attachments: [
    {
      id: 'attachment-001',
      kind: 'quote',
      fileName: '分项报价表.xlsx',
      storedPath: 'business-bid/attachments/attachment-001-分项报价表.xlsx',
      originalPath: '',
      fileSize: 2048,
      status: 'ready',
      owner: '报价负责人',
      note: '最终报价附件。',
      createdAt: '2026-06-15T09:00:00.000Z',
      updatedAt: '2026-06-15T09:00:00.000Z',
    },
  ],
};

const tempDirs: string[] = [];

function createFakeBusinessBidDb() {
  const state = {
    meta: null as null | Record<string, unknown>,
    clauses: [] as Array<Record<string, unknown>>,
    attachments: [] as Array<Record<string, unknown>>,
    tasks: [] as Array<Record<string, unknown>>,
  };
  return {
    prepare(sql: string) {
      if (/SELECT \* FROM business_bid_meta/i.test(sql)) {
        return { get: () => state.meta };
      }
      if (/INSERT INTO business_bid_meta/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.meta = {
              id: 1,
              source_type: '',
              source_file_name: '',
              source_hash: '',
              generated_at: null,
              updated_at: params.updated_at,
            };
          },
        };
      }
      if (/SELECT \* FROM business_bid_clauses WHERE clause_id = \?/i.test(sql)) {
        return { get: (clauseId: string) => state.clauses.find((item) => item.clause_id === clauseId) || null };
      }
      if (/SELECT \* FROM business_bid_attachments WHERE attachment_id = \?/i.test(sql)) {
        return { get: (attachmentId: string) => state.attachments.find((item) => item.attachment_id === attachmentId) || null };
      }
      if (/SELECT \* FROM business_bid_tasks WHERE type = \?/i.test(sql)) {
        return { get: (type: string) => state.tasks.find((item) => item.type === type) || null };
      }
      if (/SELECT \* FROM business_bid_clauses/i.test(sql)) {
        return { all: () => state.clauses };
      }
      if (/SELECT \* FROM business_bid_attachments/i.test(sql)) {
        return { all: () => state.attachments };
      }
      if (/DELETE FROM business_bid_tasks/i.test(sql)) {
        return { run: () => { state.tasks = []; } };
      }
      if (/DELETE FROM business_bid_clauses/i.test(sql)) {
        return { run: () => { state.clauses = []; } };
      }
      if (/DELETE FROM business_bid_attachments WHERE attachment_id = \?/i.test(sql)) {
        return {
          run: (attachmentId: string) => {
            state.attachments = state.attachments.filter((item) => item.attachment_id !== attachmentId);
          },
        };
      }
      if (/DELETE FROM business_bid_attachments/i.test(sql)) {
        return { run: () => { state.attachments = []; } };
      }
      if (/INSERT INTO business_bid_tasks/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const index = state.tasks.findIndex((item) => item.type === params.type);
            if (index >= 0) state.tasks[index] = params;
            else state.tasks.push(params);
          },
        };
      }
      if (/INSERT INTO business_bid_clauses/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.clauses.push(params);
          },
        };
      }
      if (/INSERT INTO business_bid_attachments/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.attachments.push(params);
          },
        };
      }
      if (/UPDATE business_bid_meta/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const sourceType = sql.includes("source_type = 'tender-document'")
              ? 'tender-document'
              : sql.includes("source_type = 'technical-plan'")
                ? 'technical-plan'
                : state.meta?.source_type;
            state.meta = { ...(state.meta || { id: 1 }), ...params, source_type: sourceType };
          },
        };
      }
      if (/UPDATE business_bid_clauses/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = state.clauses.find((item) => item.clause_id === params.clause_id);
            if (!row) return;
            row.response_text = params.response_text;
            row.deviation_type = params.deviation_type;
            row.risk_level = params.risk_level;
            row.material_requirement = params.material_requirement;
            row.owner = params.owner;
            row.confirmed_by = params.confirmed_by;
            row.confirmed = params.confirmed;
            row.updated_at = params.updated_at;
          },
        };
      }
      if (/UPDATE business_bid_attachments/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = state.attachments.find((item) => item.attachment_id === params.attachment_id);
            if (!row) return;
            row.kind = params.kind;
            row.status = params.status;
            row.owner = params.owner;
            row.note = params.note;
            row.updated_at = params.updated_at;
          },
        };
      }
      throw new Error(`Unhandled SQL in fake business bid DB: ${sql}`);
    },
    transaction(callback: (items?: unknown) => void) {
      return (items?: unknown) => callback(items);
    },
  };
}

function createStoreContext(fileContent: string, aiService?: { requestJson: (request: Record<string, unknown>) => Promise<unknown> }, workspaceRoot?: string) {
  const store = createBusinessBidStore({
    db: createFakeBusinessBidDb(),
    aiService,
    workspaceRoot,
    fileService: {
      importTechnicalPlanDocument: async () => ({
        success: true,
        file_name: '独立商务标招标文件.docx',
        file_content: fileContent,
      }),
    },
  });
  return { store };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('businessBidStore report export', () => {
  it('builds a business bid delivery package with response, deviation and material sections', () => {
    const markdown = buildBusinessBidReportMarkdown(reportState);

    expect(markdown).toContain('# 商务标响应交付包');
    expect(markdown).toContain('商务招标文件.docx');
    expect(markdown).toContain('## 商务响应表');
    expect(markdown).toContain('## 合同条款偏离表');
    expect(markdown).toContain('## 资信证明材料清单');
    expect(markdown).toContain('## 报价附件清单');
    expect(markdown).toContain('## 独立附件清单');
    expect(markdown).toContain('| 负责人 | 确认人 | 确认状态 |');
    expect(markdown).toContain('| 附件类型 | 文件名 | 状态 | 负责人 | 大小 | 备注 |');
    expect(markdown).toContain('商务负责人');
    expect(markdown).toContain('财务经理');
    expect(markdown).toContain('分项报价表.xlsx');
    expect(markdown).toContain('合同违约责任按招标文件执行。');
    expect(markdown).toContain('近三年类似业绩证明');
    expect(markdown).toContain('分项报价表');
    expect(markdown).toContain('存在高风险商务条款');
  });

  it('builds Word and Excel delivery files with the same business tables', async () => {
    const wordBuffer = await buildBusinessBidWordBuffer(reportState);
    const wordZip = new AdmZip(wordBuffer);
    const documentXml = wordZip.readAsText('word/document.xml');

    expect(documentXml).toContain('商务标响应交付包');
    expect(documentXml).toContain('商务响应表');
    expect(documentXml).toContain('合同条款偏离表');
    expect(documentXml).toContain('独立附件清单');
    expect(documentXml).toContain('商务负责人');
    expect(documentXml).toContain('报价负责人');
    expect(documentXml).toContain('分项报价表.xlsx');

    const excelBuffer = buildBusinessBidExcelBuffer(reportState);
    const excelZip = new AdmZip(excelBuffer);
    const workbookXml = excelZip.readAsText('xl/workbook.xml');
    const responseSheetXml = excelZip.readAsText('xl/worksheets/sheet1.xml');
    const quoteSheetXml = excelZip.readAsText('xl/worksheets/sheet4.xml');
    const attachmentSheetXml = excelZip.readAsText('xl/worksheets/sheet5.xml');

    expect(workbookXml).toContain('商务响应表');
    expect(workbookXml).toContain('报价附件清单');
    expect(workbookXml).toContain('独立附件清单');
    expect(responseSheetXml).toContain('商务负责人');
    expect(responseSheetXml).toContain('合同违约责任按招标文件执行。');
    expect(quoteSheetXml).toContain('分项报价表');
    expect(attachmentSheetXml).toContain('分项报价表.xlsx');
  });

  it('imports an independent tender document into the business response matrix', async () => {
    const { store } = createStoreContext(`
# 商务条款
付款方式：验收合格后 30 日内支付合同价款。
投标文件应包含分项报价表。
需提供近三年类似业绩证明。
`);

    const result = await store.importTenderDocument();

    expect(result.success).toBe(true);
    expect(result.state.source?.type).toBe('tender-document');
    expect(result.state.source?.fileName).toBe('独立商务标招标文件.docx');
    expect(result.state.clauses.length).toBeGreaterThanOrEqual(3);
    expect(result.state.clauses.some((item) => item.category === 'payment')).toBe(true);
    expect(result.state.clauses.some((item) => item.category === 'quote')).toBe(true);
    expect(result.state.clauses[0].sourceHint).toBe('独立商务标招标文件');
    expect(result.state.clauses[0].owner).toBe('');
    expect(result.state.clauses[0].confirmedBy).toBe('');
  });

  it('updates owner and confirmer without clearing other clause fields', async () => {
    const { store } = createStoreContext(`
# 商务条款
付款方式：验收合格后 30 日内支付合同价款。
`);

    const imported = await store.importTenderDocument();
    const clause = imported.state.clauses[0];

    const updated = store.updateClause(clause.id, {
      owner: '商务负责人',
      confirmedBy: '项目经理',
    });

    expect(updated.clauses[0]).toMatchObject({
      id: clause.id,
      responseText: clause.responseText,
      materialRequirement: clause.materialRequirement,
      owner: '商务负责人',
      confirmedBy: '项目经理',
    });
  });

  it('imports, updates and deletes independent business bid attachments', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-business-attachments-'));
    tempDirs.push(tempDir);
    const sourceFile = path.join(tempDir, '报价附件.xlsx');
    fs.writeFileSync(sourceFile, 'quote attachment', 'utf-8');
    const workspaceRoot = path.join(tempDir, 'workspace');
    const { store } = createStoreContext('付款方式：验收合格后付款。', undefined, workspaceRoot);

    const imported = await store.importAttachments({
      filePaths: [sourceFile],
      kind: 'quote',
      owner: '报价负责人',
      note: '待财务确认最终报价',
    });

    expect(imported.success).toBe(true);
    expect(imported.state.attachments).toHaveLength(1);
    const attachment = imported.state.attachments?.[0];
    expect(attachment).toMatchObject({
      kind: 'quote',
      fileName: '报价附件.xlsx',
      owner: '报价负责人',
      note: '待财务确认最终报价',
      status: 'pending',
    });
    expect(fs.existsSync(path.join(workspaceRoot, attachment?.storedPath || ''))).toBe(true);

    const updated = store.updateAttachment(attachment?.id || '', {
      status: 'ready',
      owner: '财务经理',
      note: '已确认',
    });
    expect(updated.attachments?.[0]).toMatchObject({
      status: 'ready',
      owner: '财务经理',
      note: '已确认',
    });

    const deleted = store.deleteAttachment(attachment?.id || '');
    expect(deleted.attachments).toHaveLength(0);
    expect(fs.existsSync(path.join(workspaceRoot, attachment?.storedPath || ''))).toBe(false);
  });

  it('enhances the current business matrix with AI structured extraction', async () => {
    const requestJson = vi.fn(async (request: Record<string, unknown>) => {
      expect(request.schemaName).toBe('BusinessBidClauseExtraction');
      expect(JSON.stringify(request.messages)).toContain('商务响应矩阵');
      const normalizer = request.normalizer as (payload: unknown) => unknown;
      const validator = request.validator as (payload: unknown) => void;
      const normalized = normalizer({
        clauses: [
          {
            category: 'bond',
            originalText: '投标人须在投标截止前提交履约保证金保函。',
            responseText: '按招标要求提交履约保证金保函。',
            deviationType: 'pending',
            riskLevel: 'high',
            materialRequirement: '补充保函开具机构、金额和有效期。',
            sourceHint: '第二章 投标人须知',
          },
        ],
      });
      validator(normalized);
      return normalized;
    });
    const { store } = createStoreContext(`
# 商务条款
投标人须在投标截止前提交履约保证金保函。
`, { requestJson });

    await store.importTenderDocument();
    const result = await store.enhanceWithAi();

    expect(result.success).toBe(true);
    expect(result.message).toContain('AI 已重新提取 1 条商务条款');
    expect(result.state.clauses).toHaveLength(1);
    expect(result.state.clauses[0]).toMatchObject({
      category: 'bond',
      riskLevel: 'high',
      sourceHint: '第二章 投标人须知',
      materialRequirement: '补充保函开具机构、金额和有效期。',
    });
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});
