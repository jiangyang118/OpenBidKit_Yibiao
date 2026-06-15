// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiEvaluationState } from './types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { buildAiEvaluationExcelBuffer, buildAiEvaluationReportMarkdown, buildAiEvaluationWordBuffer, createAiEvaluationStore, evaluateItemsAgainstBidDocument, normalizeAiEvaluationItems } = require('../../../electron/services/aiEvaluationStore.cjs') as {
  buildAiEvaluationExcelBuffer: (state: AiEvaluationState) => Buffer;
  buildAiEvaluationReportMarkdown: (state: AiEvaluationState) => string;
  buildAiEvaluationWordBuffer: (state: AiEvaluationState) => Promise<Buffer>;
  createAiEvaluationStore: (options: {
    app?: { getPath: (name: string) => string };
    db: unknown;
    technicalPlanStore?: unknown;
    fileService?: { importTechnicalPlanDocument: (label?: string) => Promise<Record<string, unknown>> };
  }) => {
    generateFromTechnicalPlan: () => AiEvaluationState;
    importBidDocument: () => Promise<{ success: boolean; message: string; state: AiEvaluationState }>;
    scoreImportedBidDocuments: () => Promise<{ success: boolean; message: string; state: AiEvaluationState; stats: Record<string, unknown> }>;
    saveExpertScore: (payload: { itemId: string; expertName: string; score: number; opinion?: string }) => AiEvaluationState;
    exportReport: (options: { filePath: string }) => Promise<{ success: boolean; message: string; reportId?: string; filePath: string; markdownChars: number }>;
    exportOfficePackage: (options: { format: 'docx' | 'xlsx'; filePath: string }) => Promise<{ success: boolean; message: string; reportId?: string; filePath: string; bytes: number; format: string }>;
    clear: () => AiEvaluationState;
  };
  evaluateItemsAgainstBidDocument: (items: AiEvaluationState['items'], bidMarkdown: string) => AiEvaluationState['items'];
  normalizeAiEvaluationItems: (payload: unknown) => AiEvaluationState['items'];
};

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-ai-evaluation-'));
  tempDirs.push(dir);
  return dir;
}

function createFakeAiEvaluationDb() {
  const state = {
    meta: null as null | Record<string, unknown>,
    items: [] as Array<Record<string, unknown>>,
    bidDocuments: [] as Array<Record<string, unknown>>,
    bidScores: [] as Array<Record<string, unknown>>,
    auditOpinions: [] as Array<Record<string, unknown>>,
    expertScores: [] as Array<Record<string, unknown>>,
    reports: [] as Array<Record<string, unknown>>,
    tasks: [] as Array<Record<string, unknown>>,
  };
  return {
    prepare(sql: string) {
      if (/SELECT \* FROM ai_evaluation_meta WHERE id = 1/i.test(sql)) {
        return { get: () => state.meta };
      }
      if (/INSERT INTO ai_evaluation_meta/i.test(sql)) {
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
      if (/SELECT \* FROM ai_evaluation_items WHERE item_id = \?/i.test(sql)) {
        return { get: (itemId: string) => state.items.find((item) => item.item_id === itemId) || null };
      }
      if (/SELECT \* FROM ai_evaluation_items/i.test(sql)) {
        return {
          all: () => [...state.items].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)),
        };
      }
      if (/SELECT \* FROM ai_evaluation_tasks WHERE type = \?/i.test(sql)) {
        return { get: (type: string) => state.tasks.find((item) => item.type === type) || null };
      }
      if (/SELECT \* FROM ai_evaluation_bid_documents WHERE document_id = \?/i.test(sql)) {
        return { get: (documentId: string) => state.bidDocuments.find((item) => item.document_id === documentId) || null };
      }
      if (/SELECT \* FROM ai_evaluation_bid_documents/i.test(sql)) {
        return {
          all: () => [...state.bidDocuments].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)),
        };
      }
      if (/SELECT \* FROM ai_evaluation_bid_scores/i.test(sql)) {
        return { all: () => [...state.bidScores] };
      }
      if (/SELECT \* FROM ai_evaluation_audit_opinions/i.test(sql)) {
        return {
          all: () => [...state.auditOpinions].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)),
        };
      }
      if (/SELECT \* FROM ai_evaluation_expert_scores WHERE score_id = \?/i.test(sql)) {
        return { get: (scoreId: string) => state.expertScores.find((item) => item.score_id === scoreId) || null };
      }
      if (/SELECT \* FROM ai_evaluation_expert_scores/i.test(sql)) {
        return {
          all: () => [...state.expertScores].sort((left, right) => String(left.item_id || '').localeCompare(String(right.item_id || ''))),
        };
      }
      if (/SELECT \* FROM ai_evaluation_reports WHERE report_type = 'self-evaluation'/i.test(sql)) {
        return {
          get: () => [...state.reports]
            .filter((item) => item.report_type === 'self-evaluation')
            .sort((left, right) => String(right.generated_at || '').localeCompare(String(left.generated_at || '')))[0] || null,
        };
      }
      if (/SELECT COALESCE\(MAX\(sort_order\), -1\) AS max_sort_order FROM ai_evaluation_bid_documents/i.test(sql)) {
        return {
          get: () => ({
            max_sort_order: state.bidDocuments.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), -1),
          }),
        };
      }
      if (/SELECT sort_order FROM ai_evaluation_bid_documents WHERE document_id = \?/i.test(sql)) {
        return {
          get: (documentId: string) => state.bidDocuments.find((item) => item.document_id === documentId) || null,
        };
      }
      if (/SELECT COUNT\(\*\) AS count FROM ai_evaluation_bid_documents/i.test(sql)) {
        return { get: () => ({ count: state.bidDocuments.length }) };
      }
      if (/SELECT COUNT\(\*\) AS count FROM ai_evaluation_audit_opinions/i.test(sql)) {
        return { get: () => ({ count: state.auditOpinions.length }) };
      }
      if (/SELECT COUNT\(\*\) AS count FROM ai_evaluation_reports/i.test(sql)) {
        return { get: () => ({ count: state.reports.length }) };
      }
      if (/DELETE FROM ai_evaluation_items/i.test(sql)) {
        return { run: () => { state.items = []; } };
      }
      if (/DELETE FROM ai_evaluation_audit_opinions/i.test(sql)) {
        return { run: () => { state.auditOpinions = []; } };
      }
      if (/DELETE FROM ai_evaluation_expert_scores/i.test(sql)) {
        return { run: () => { state.expertScores = []; } };
      }
      if (/DELETE FROM ai_evaluation_reports/i.test(sql)) {
        return { run: () => { state.reports = []; } };
      }
      if (/DELETE FROM ai_evaluation_bid_scores WHERE document_id = \?/i.test(sql)) {
        return {
          run: (documentId: string) => {
            state.bidScores = state.bidScores.filter((item) => item.document_id !== documentId);
          },
        };
      }
      if (/DELETE FROM ai_evaluation_bid_scores/i.test(sql)) {
        return { run: () => { state.bidScores = []; } };
      }
      if (/DELETE FROM ai_evaluation_bid_documents/i.test(sql)) {
        return { run: () => { state.bidDocuments = []; } };
      }
      if (/INSERT INTO ai_evaluation_items/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.items.push(params);
          },
        };
      }
      if (/INSERT INTO ai_evaluation_bid_documents/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const index = state.bidDocuments.findIndex((item) => item.document_id === params.document_id);
            if (index >= 0) state.bidDocuments[index] = params;
            else state.bidDocuments.push(params);
          },
        };
      }
      if (/INSERT INTO ai_evaluation_bid_scores/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const index = state.bidScores.findIndex((item) => item.document_id === params.document_id && item.item_id === params.item_id);
            if (index >= 0) state.bidScores[index] = params;
            else state.bidScores.push(params);
          },
        };
      }
      if (/INSERT INTO ai_evaluation_audit_opinions/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.auditOpinions.push(params);
          },
        };
      }
      if (/INSERT INTO ai_evaluation_expert_scores/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const index = state.expertScores.findIndex((item) => item.score_id === params.score_id);
            if (index >= 0) state.expertScores[index] = { ...state.expertScores[index], ...params };
            else state.expertScores.push(params);
          },
        };
      }
      if (/INSERT INTO ai_evaluation_reports/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            state.reports.push(params);
          },
        };
      }
      if (/UPDATE ai_evaluation_meta/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const sourceType = sql.includes("source_type = 'bid-document'")
              ? 'bid-document'
              : sql.includes("source_type = 'technical-plan'")
                ? 'technical-plan'
                : '';
            state.meta = {
              ...(state.meta || { id: 1 }),
              source_type: sourceType,
              source_file_name: params.source_file_name || '',
              source_hash: params.source_hash || '',
              generated_at: params.generated_at || null,
              updated_at: params.updated_at,
            };
          },
        };
      }
      throw new Error(`Unhandled SQL in fake AI evaluation DB: ${sql}`);
    },
    transaction(callback: (...args: unknown[]) => void) {
      return (...args: unknown[]) => callback(...args);
    },
  };
}

function createStoreForBidImport(importedDocuments: Array<{ fileName: string; markdown: string }>) {
  const userDataDir = createTempDir();
  let importIndex = 0;
  const db = createFakeAiEvaluationDb();
  const store = createAiEvaluationStore({
    app: { getPath: () => userDataDir },
    db,
    technicalPlanStore: {
      loadTechnicalPlan: () => ({ tenderFile: { fileName: '评分办法.docx' } }),
      readTenderMarkdown: () => `
# 评分办法
技术方案完整性满分 50 分，需覆盖实施计划、质量保障和运维服务。
资质证书满分 10 分，需提供信息系统建设相关资质证书。
`,
    },
    fileService: {
      importTechnicalPlanDocument: async () => {
        const current = importedDocuments[importIndex] || importedDocuments[importedDocuments.length - 1];
        importIndex += 1;
        return {
          success: true,
          file_name: current.fileName,
          file_content: current.markdown,
          parser_label: '本地解析',
        };
      },
    },
  });
  return { db, store, userDataDir };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('aiEvaluationStore report export', () => {
  it('builds an AI evaluation report with score summary, evidence and risk sections', () => {
    const markdown = buildAiEvaluationReportMarkdown({
      source: {
        type: 'technical-plan',
        fileName: '评分办法.docx',
        contentHash: 'hash-1',
        generatedAt: '2026-06-15T10:00:00.000Z',
      },
      summary: {
        totalMaxScore: 50,
        totalFinalScore: 41,
        confirmedCount: 0,
        highRiskCount: 1,
        itemCount: 1,
        conclusion: '自评存在中等风险，建议优先处理扣分项和未确认项。',
      },
      bidDocuments: [
        {
          id: 'bid-hash-1',
          fileName: '投标文件A.docx',
          contentHash: 'bid-hash-1',
          contentChars: 1200,
          parserLabel: '本地解析',
          importedAt: '2026-06-15T10:10:00.000Z',
          sortOrder: 0,
        },
      ],
      bidScoreSummaries: [
        {
          documentId: 'bid-hash-1',
          fileName: '投标文件A.docx',
          totalMaxScore: 50,
          totalFinalScore: 41,
          confirmedCount: 0,
          highRiskCount: 1,
          itemCount: 1,
          conclusion: '自评存在中等风险，建议优先处理扣分项和未确认项。',
        },
      ],
      items: [
        {
          id: 'eval-1',
          category: 'technical',
          label: '技术项',
          title: '技术方案完整性',
          requirementText: '技术方案满分 50 分，需覆盖实施计划、质量保障和运维服务。',
          maxScore: 50,
          autoScore: 41,
          manualScore: null,
          finalScore: 41,
          evidence: '技术方案满分 50 分',
          deductionReason: '需人工确认投标文件响应证据。',
          riskLevel: 'high',
          confirmed: false,
          sortOrder: 0,
          updatedAt: '2026-06-15T10:00:00.000Z',
        },
      ],
    });

    expect(markdown).toContain('# AI 评标自评报告');
    expect(markdown).toContain('评分办法.docx');
    expect(markdown).toContain('自评总分：41 / 50');
    expect(markdown).toContain('## 评分明细');
    expect(markdown).toContain('## 投标文件评分汇总');
    expect(markdown).toContain('投标文件A.docx');
    expect(markdown).toContain('## 审计意见');
    expect(markdown).toContain('高风险评分项');
    expect(markdown).toContain('## 高风险项');
    expect(markdown).toContain('## 待复核项');
    expect(markdown).toContain('技术方案完整性');
    expect(markdown).toContain('技术方案满分 50 分');
    expect(markdown).toContain('存在高风险评分项');
  });

  it('matches bid document evidence and updates risk for evaluation items', () => {
    const evaluated = evaluateItemsAgainstBidDocument([
      {
        id: 'eval-1',
        category: 'technical',
        label: '技术项',
        title: '技术方案完整性',
        requirementText: '技术方案需覆盖实施计划、质量保障和运维服务。',
        maxScore: 50,
        autoScore: 30,
        manualScore: null,
        finalScore: 30,
        evidence: '',
        deductionReason: '',
        riskLevel: 'high',
        confirmed: true,
        sortOrder: 0,
        updatedAt: '2026-06-15T10:00:00.000Z',
      },
      {
        id: 'eval-2',
        category: 'qualification',
        label: '资格项',
        title: '资质证书',
        requirementText: '需提供信息系统建设相关资质证书。',
        maxScore: 10,
        autoScore: 6,
        manualScore: null,
        finalScore: 6,
        evidence: '',
        deductionReason: '',
        riskLevel: 'high',
        confirmed: true,
        sortOrder: 1,
        updatedAt: '2026-06-15T10:00:00.000Z',
      },
    ], `
# 投标文件
## 技术方案
本项目技术方案覆盖总体实施计划、质量保障措施和 7x24 小时运维服务。
`);

    expect(evaluated[0].evidence).toContain('质量保障措施');
    expect(evaluated[0].evidence).toContain('技术方案');
    expect(evaluated[0].evidence).toMatch(/第 \d+ 行/);
    expect(evaluated[0].deductionReason).toContain('证据关键词');
    expect(evaluated[0].deductionReason).toContain('技术');
    expect(evaluated[0].riskLevel).not.toBe('high');
    expect(evaluated[0].confirmed).toBe(false);
    expect(evaluated[1].evidence).toContain('未在投标文件中定位');
    expect(evaluated[1].riskLevel).toBe('high');
  });

  it('normalizes AI extracted evaluation items into persisted scoring fields', () => {
    const items = normalizeAiEvaluationItems({
      items: [
        {
          category: 'objective',
          title: '类似项目业绩',
          requirementText: '投标人每提供一个类似项目业绩得 2 分，满分 6 分。',
          maxScore: 6,
          autoScore: 4,
          evidence: '需在投标文件中提供合同或中标通知书。',
          deductionReason: '未提供则不得分。',
          riskLevel: 'high',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: 'objective',
      label: '客观分',
      title: '类似项目业绩',
      requirementText: '投标人每提供一个类似项目业绩得 2 分，满分 6 分。',
      maxScore: 6,
      autoScore: 4,
      finalScore: 4,
      evidence: '需在投标文件中提供合同或中标通知书。',
      deductionReason: '未提供则不得分。',
      riskLevel: 'high',
      confirmed: false,
    });
    expect(items[0].id).toMatch(/^eval-001-/);
  });

  it('persists multiple bid documents, score snapshots and report summaries', async () => {
    const { db, store, userDataDir } = createStoreForBidImport([
      {
        fileName: '投标文件A.docx',
        markdown: `
# 投标文件A
本项目技术方案覆盖总体实施计划、质量保障措施和 7x24 小时运维服务。
`,
      },
      {
        fileName: '投标文件B.docx',
        markdown: `
# 投标文件B
投标文件提供信息系统建设相关资质证书，但技术方案章节较少。
`,
      },
    ]);

    store.generateFromTechnicalPlan();
    const firstResult = await store.importBidDocument();
    const secondResult = await store.importBidDocument();

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(true);
    expect(secondResult.message).toContain('已保存 2 份投标文件评分结果');
    expect(secondResult.state.bidDocuments).toHaveLength(2);
    expect(secondResult.state.bidScoreSummaries).toHaveLength(2);
    expect(secondResult.state.auditOpinions?.length).toBeGreaterThan(0);
    expect(secondResult.state.auditOpinions?.some((item) => item.type === 'review' || item.type === 'risk')).toBe(true);
    expect(secondResult.state.bidScoreSummaries?.map((item) => item.fileName)).toEqual(['投标文件A.docx', '投标文件B.docx']);

    const targetItem = secondResult.state.items[0];
    store.saveExpertScore({ itemId: targetItem.id, expertName: '专家A', score: targetItem.maxScore, opinion: '证据响应充分。' });
    const expertState = store.saveExpertScore({ itemId: targetItem.id, expertName: '专家B', score: 30, opinion: '技术章节仍需复核。' });
    expect(expertState.expertScores).toHaveLength(2);
    expect(expertState.expertReviewSummary?.conflictCount).toBeGreaterThan(0);
    expect(expertState.auditOpinions?.some((item) => item.type === 'expert-cross-review' || item.type === 'expert-score-deviation')).toBe(true);

    const documentRows = db.prepare('SELECT * FROM ai_evaluation_bid_documents ORDER BY sort_order ASC').all?.() as Array<{ markdown_path: string }>;
    const scoreRows = db.prepare('SELECT * FROM ai_evaluation_bid_scores ORDER BY document_id ASC, item_id ASC').all?.() as Array<Record<string, unknown>>;
    const auditRows = db.prepare('SELECT * FROM ai_evaluation_audit_opinions ORDER BY sort_order ASC').all?.() as Array<Record<string, unknown>>;
    expect(documentRows).toHaveLength(2);
    expect(scoreRows.length).toBeGreaterThanOrEqual(2);
    expect(auditRows.length).toBeGreaterThan(0);
    expect(documentRows[0].markdown_path).toMatch(/^ai-evaluation\/bid-documents\/bid-[a-f0-9]+\.md$/);
    expect(fs.existsSync(path.join(userDataDir, 'workspace', documentRows[0].markdown_path))).toBe(true);

    const batchResult = await store.scoreImportedBidDocuments();
    expect(batchResult.success).toBe(true);
    expect(batchResult.message).toContain('已批量评分 2 份投标文件');
    expect(batchResult.stats).toMatchObject({ document_count: 2, scored_count: 2, skipped_count: 0 });
    expect(batchResult.state.bidScoreSummaries).toHaveLength(2);

    const reportPath = path.join(userDataDir, 'ai-evaluation-report.md');
    const exportResult = await store.exportReport({ filePath: reportPath });
    const reportMarkdown = fs.readFileSync(reportPath, 'utf-8');
    expect(exportResult.success).toBe(true);
    expect(exportResult.reportId).toMatch(/^report-/);
    expect(reportMarkdown).toContain('## 投标文件评分汇总');
    expect(reportMarkdown).toContain('## 专家打分交叉审核');
    expect(reportMarkdown).toContain('## 审计意见');
    expect(reportMarkdown).toContain('专家A');
    expect(reportMarkdown).toContain('专家B');
    expect(reportMarkdown).toContain('投标文件A.docx');
    expect(reportMarkdown).toContain('投标文件B.docx');
    const reportCountStatement = db.prepare('SELECT COUNT(*) AS count FROM ai_evaluation_reports') as { get: () => { count: number } };
    expect(reportCountStatement.get().count).toBe(1);

    const wordBuffer = await buildAiEvaluationWordBuffer(expertState);
    const wordZip = new AdmZip(wordBuffer);
    const documentXml = wordZip.readAsText('word/document.xml');
    expect(documentXml).toContain('AI 评标正式报告');
    expect(documentXml).toContain('专家打分交叉审核');
    expect(documentXml).toContain('审计意见');
    expect(documentXml).toContain('技术方案完整性');

    const excelBuffer = buildAiEvaluationExcelBuffer(expertState);
    const excelZip = new AdmZip(excelBuffer);
    const workbookXml = excelZip.readAsText('xl/workbook.xml');
    const expertSheetXml = excelZip.readAsText('xl/worksheets/sheet3.xml');
    const auditSheetXml = excelZip.readAsText('xl/worksheets/sheet4.xml');
    const detailSheetXml = excelZip.readAsText('xl/worksheets/sheet5.xml');
    expect(workbookXml).toContain('报告摘要');
    expect(workbookXml).toContain('专家打分交叉审核');
    expect(workbookXml).toContain('审计意见');
    expect(workbookXml).toContain('评分明细');
    expect(expertSheetXml).toContain('专家A');
    expect(auditSheetXml).toContain('审计意见');
    expect(detailSheetXml).toContain('技术方案完整性');

    const officePath = path.join(userDataDir, 'ai-evaluation-report.xlsx');
    const officeResult = await store.exportOfficePackage({ format: 'xlsx', filePath: officePath });
    expect(officeResult.success).toBe(true);
    expect(officeResult.format).toBe('xlsx');
    expect(fs.existsSync(officePath)).toBe(true);
    expect(reportCountStatement.get().count).toBe(2);

    store.clear();
    expect(fs.existsSync(path.join(userDataDir, 'workspace', 'ai-evaluation'))).toBe(false);
    const countStatement = db.prepare('SELECT COUNT(*) AS count FROM ai_evaluation_bid_documents') as { get: () => { count: number } };
    const documentCount = countStatement.get();
    expect(documentCount.count).toBe(0);
    const auditCountStatement = db.prepare('SELECT COUNT(*) AS count FROM ai_evaluation_audit_opinions') as { get: () => { count: number } };
    expect(auditCountStatement.get().count).toBe(0);
    expect(reportCountStatement.get().count).toBe(0);
  });
});
