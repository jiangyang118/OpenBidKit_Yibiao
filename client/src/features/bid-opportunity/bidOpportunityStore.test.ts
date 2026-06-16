// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BidOpportunityState } from './types';

const require = createRequire(import.meta.url);
const { buildBidOpportunityCalendarIcs, buildBidOpportunityReportMarkdown, createBidOpportunityStore, htmlToReadableText } = require('../../../electron/services/bidOpportunityStore.cjs') as {
  buildBidOpportunityCalendarIcs: (state: BidOpportunityState) => { content: string; eventCount: number };
  buildBidOpportunityReportMarkdown: (state: BidOpportunityState) => string;
  createBidOpportunityStore: (options: {
    db: unknown;
    fileService?: { importTechnicalPlanDocument: (label?: string) => Promise<Record<string, unknown>> };
    aiService?: { collectJsonResponse?: (options: Record<string, unknown>) => Promise<unknown>; requestJson?: (options: Record<string, unknown>) => Promise<unknown> };
    workspaceRoot?: string;
  }) => {
    importOpportunityDocument: () => Promise<{ success: boolean; message: string; state: BidOpportunityState }>;
    importOpportunityUrl: (payload: { url: string }) => Promise<{ success: boolean; message: string; state: BidOpportunityState }>;
    saveOpportunity: (input: Record<string, unknown>) => BidOpportunityState;
    saveOpportunityWithAi: (input: Record<string, unknown>) => Promise<BidOpportunityState>;
    updateFollowUp: (id: string, patch: Record<string, unknown>) => BidOpportunityState;
    addFollowUpRecord: (id: string, payload: Record<string, unknown>) => BidOpportunityState;
    updateFollowUpRecord: (id: string, patch: Record<string, unknown>) => BidOpportunityState;
    deleteFollowUpRecord: (id: string) => BidOpportunityState;
    importAttachments: (id: string, options?: { filePaths?: string[]; kind?: string; note?: string }) => Promise<{ success: boolean; message: string; state: BidOpportunityState }>;
    updateAttachment: (id: string, patch: Record<string, unknown>) => BidOpportunityState;
    deleteAttachment: (id: string) => BidOpportunityState;
    exportCalendar: (options?: { filePath?: string }) => Promise<{ success: boolean; message: string; filePath?: string; calendarChars?: number; eventCount?: number }>;
  };
  htmlToReadableText: (html: string) => string;
};

function createFakeBidOpportunityDb(knowledgeItems: Array<Record<string, unknown>> = []) {
  const rows: Array<Record<string, unknown>> = [];
  const followUps: Array<Record<string, unknown>> = [];
  const attachments: Array<Record<string, unknown>> = [];
  return {
    prepare(sql: string) {
      if (/SELECT item_id, title, resume, content, source_file\s+FROM knowledge_items/i.test(sql)) {
        return { all: () => knowledgeItems };
      }
      if (/SELECT \* FROM bid_opportunity_opportunities WHERE opportunity_id = \?/i.test(sql)) {
        return { get: (opportunityId: string) => rows.find((item) => item.opportunity_id === opportunityId) };
      }
      if (/SELECT \* FROM bid_opportunity_opportunities/i.test(sql)) {
        return { all: () => [...rows].reverse() };
      }
      if (/SELECT \* FROM bid_opportunity_follow_ups/i.test(sql)) {
        return {
          all: () => [...followUps].reverse(),
          get: (recordId: string) => followUps.find((item) => item.record_id === recordId),
        };
      }
      if (/SELECT \* FROM bid_opportunity_attachments WHERE attachment_id = \?/i.test(sql)) {
        return { get: (attachmentId: string) => attachments.find((item) => item.attachment_id === attachmentId) };
      }
      if (/SELECT \* FROM bid_opportunity_attachments WHERE opportunity_id = \?/i.test(sql)) {
        return { all: (opportunityId: string) => attachments.filter((item) => item.opportunity_id === opportunityId) };
      }
      if (/SELECT \* FROM bid_opportunity_attachments/i.test(sql)) {
        return { all: () => [...attachments].reverse() };
      }
      if (/INSERT INTO bid_opportunity_opportunities/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            rows.push(params);
            return { changes: 1 };
          },
        };
      }
      if (/INSERT INTO bid_opportunity_follow_ups/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            followUps.push(params);
            return { changes: 1 };
          },
        };
      }
      if (/INSERT INTO bid_opportunity_attachments/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            attachments.push(params);
            return { changes: 1 };
          },
        };
      }
      if (/UPDATE bid_opportunity_opportunities/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = rows.find((item) => item.opportunity_id === params.opportunity_id);
            if (!row) return { changes: 0 };
            if (/owner = @owner/i.test(sql)) {
              row.owner = params.owner;
              row.next_action = params.next_action;
              row.reminder_at = params.reminder_at;
            }
            if (/status = @status/i.test(sql)) {
              row.status = params.status;
            }
            row.updated_at = params.updated_at;
            return { changes: 1 };
          },
        };
      }
      if (/UPDATE bid_opportunity_follow_ups/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = followUps.find((item) => item.record_id === params.record_id);
            if (!row) return { changes: 0 };
            row.occurred_at = params.occurred_at;
            row.method = params.method;
            row.owner = params.owner;
            row.contact_person = params.contact_person;
            row.content = params.content;
            row.next_action = params.next_action;
            row.next_follow_up_at = params.next_follow_up_at;
            row.updated_at = params.updated_at;
            return { changes: 1 };
          },
        };
      }
      if (/UPDATE bid_opportunity_attachments/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = attachments.find((item) => item.attachment_id === params.attachment_id);
            if (!row) return { changes: 0 };
            row.kind = params.kind;
            row.note = params.note;
            row.updated_at = params.updated_at;
            return { changes: 1 };
          },
        };
      }
      if (/DELETE FROM bid_opportunity_follow_ups/i.test(sql)) {
        return {
          run: (recordId?: string) => {
            if (!recordId) {
              const changes = followUps.length;
              followUps.length = 0;
              return { changes };
            }
            const index = followUps.findIndex((item) => item.record_id === recordId);
            if (index === -1) return { changes: 0 };
            followUps.splice(index, 1);
            return { changes: 1 };
          },
        };
      }
      if (/DELETE FROM bid_opportunity_attachments/i.test(sql)) {
        return {
          run: (attachmentId?: string) => {
            if (!attachmentId) {
              const changes = attachments.length;
              attachments.length = 0;
              return { changes };
            }
            const index = attachments.findIndex((item) => item.attachment_id === attachmentId);
            if (index === -1) return { changes: 0 };
            attachments.splice(index, 1);
            return { changes: 1 };
          },
        };
      }
      if (/DELETE FROM bid_opportunity_opportunities/i.test(sql)) {
        return { run: () => ({ changes: 1 }) };
      }
      throw new Error(`Unhandled SQL in fake bid opportunity DB: ${sql}`);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bidOpportunityStore report export', () => {
  it('builds a bid opportunity recommendation report with scores, risks and actions', () => {
    const markdown = buildBidOpportunityReportMarkdown({
      activeOpportunityId: 'opp-1',
      opportunities: [
        {
          id: 'opp-1',
          title: '产业园智慧运维平台建设项目',
          sourceText: '项目名称：产业园智慧运维平台建设项目',
          status: 'tracking',
            owner: '张三',
            nextAction: '确认本地化服务承诺',
            reminderAt: '2026-07-01T09:30',
            knowledgeMatches: [
              {
                itemId: 'item-1',
                title: '智慧园区平台建设业绩',
                resume: '可复用为类似项目业绩。',
                sourceFile: '历史项目.md',
                score: 42,
                matchedKeywords: ['智慧', '园区', '业绩'],
              },
            ],
            followUps: [
              {
                id: 'follow-1',
                opportunityId: 'opp-1',
                occurredAt: '2026-06-15T10:30',
                method: 'meeting',
                owner: '张三',
                contactPerson: '采购代理王经理',
                content: '确认答疑文件预计本周发布。',
                nextAction: '跟进答疑文件并补充授权资料',
                nextFollowUpAt: '2026-06-16T09:00',
                createdAt: '2026-06-15T10:30:00.000Z',
                updatedAt: '2026-06-15T10:30:00.000Z',
              },
            ],
            attachments: [
              {
                id: 'attachment-1',
                opportunityId: 'opp-1',
                kind: 'communication',
                fileName: '代理沟通纪要.pdf',
                storedPath: 'bid-opportunity/attachments/opp-1/代理沟通纪要.pdf',
                originalPath: '/tmp/代理沟通纪要.pdf',
                fileSize: 1024,
                note: '电话沟通后整理的纪要',
                createdAt: '2026-06-15T10:40:00.000Z',
                updatedAt: '2026-06-15T10:40:00.000Z',
              },
            ],
            parsedFields: {
            projectName: '产业园智慧运维平台建设项目',
            buyer: '某产业园管理委员会',
            budget: '3200万元',
            region: '广东省深圳市',
            industry: '信息化',
            registrationDeadline: '',
            bidDeadline: '2026年07月08日 09:30',
            qualification: '类似智慧园区平台建设业绩',
            scoringSummary: '商务资信 30 分，技术方案 50 分，报价 20 分',
          },
          score: 94,
          scoreBreakdown: {
            qualification: 24,
            budget: 22,
            timing: 16,
            region: 14,
            delivery: 18,
            competition: 5,
            profit: 10,
            schedule: 7,
            historicalSimilarity: 8,
          },
          risks: [
            { level: 'medium', text: '需要确认本地化服务承诺。' },
          ],
          recommendation: '建议重点跟进',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
    });

    expect(markdown).toContain('# 投标机会建议报告');
    expect(markdown).toContain('## 机会看板');
    expect(markdown).toContain('## 重点机会详情');
    expect(markdown).toContain('产业园智慧运维平台建设项目');
    expect(markdown).toContain('建议重点跟进');
    expect(markdown).toContain('资格匹配：24');
    expect(markdown).toContain('竞争强度：5');
    expect(markdown).toContain('利润空间：10');
    expect(markdown).toContain('工期可控性：7');
    expect(markdown).toContain('历史中标相似度：8');
    expect(markdown).toContain('[medium] 需要确认本地化服务承诺。');
    expect(markdown).toContain('| 负责人 | 下一步动作 | 提醒时间 |');
    expect(markdown).toContain('张三');
    expect(markdown).toContain('2026-07-01T09:30');
    expect(markdown).toContain('#### 知识库/历史项目匹配');
    expect(markdown).toContain('智慧园区平台建设业绩');
    expect(markdown).toContain('#### 跟进记录');
    expect(markdown).toContain('确认答疑文件预计本周发布。');
    expect(markdown).toContain('#### 公告/沟通附件');
    expect(markdown).toContain('代理沟通纪要.pdf');
    expect(markdown).toContain('优先安排高评分机会');
  });

  it('builds an iCalendar reminder file for opportunities with reminder time', () => {
    const calendar = buildBidOpportunityCalendarIcs({
      activeOpportunityId: 'opp-1',
      opportunities: [
        {
          id: 'opp-1',
          title: '产业园智慧运维平台建设项目',
          sourceText: '项目名称：产业园智慧运维平台建设项目',
          status: 'tracking',
          owner: '张三',
          nextAction: '确认本地化服务承诺',
          reminderAt: '2026-07-01T09:30',
          parsedFields: {
            projectName: '产业园智慧运维平台建设项目',
            buyer: '某产业园管理委员会',
            budget: '3200万元',
            region: '广东省深圳市',
            industry: '信息化',
            registrationDeadline: '',
            bidDeadline: '2026年07月08日 09:30',
            qualification: '',
            scoringSummary: '',
          },
          score: 94,
          scoreBreakdown: {
            qualification: 24,
            budget: 22,
            timing: 16,
            region: 14,
            delivery: 18,
            competition: 8,
            profit: 10,
            schedule: 7,
            historicalSimilarity: 2,
          },
          risks: [],
          recommendation: '建议重点跟进',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
    });

    expect(calendar.eventCount).toBe(1);
    expect(calendar.content).toContain('BEGIN:VCALENDAR');
    expect(calendar.content).toContain('BEGIN:VEVENT');
    expect(calendar.content).toContain('DTSTART:20260701T093000');
    expect(calendar.content).toContain('SUMMARY:投标机会跟进：产业园智慧运维平台建设项目');
    expect(calendar.content).toContain('负责人：张三');
    expect(calendar.content).toContain('下一步动作：确认本地化服务承诺');
  });

  it('imports an announcement document through file parsing and saves an opportunity', async () => {
    const store = createBidOpportunityStore({
      db: createFakeBidOpportunityDb(),
      fileService: {
        importTechnicalPlanDocument: async () => ({
          success: true,
          file_name: '公告文件.docx',
          file_content: '项目名称：医院后勤一体化服务\n预算金额：800万元\n投标截止：2026年07月08日 09:30',
        }),
      },
    });

    const result = await store.importOpportunityDocument();

    expect(result.success).toBe(true);
    expect(result.state.opportunities).toHaveLength(1);
    expect(result.state.opportunities[0].title).toContain('医院后勤一体化服务');
    expect(result.state.opportunities[0].parsedFields.budget).toContain('800万元');
  });

  it('imports an announcement URL as readable text and saves an opportunity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<html><body><h1>项目名称：智慧园区平台</h1><p>预算金额：1200万元</p><script>hidden()</script></body></html>',
    }));
    const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb() });

    const result = await store.importOpportunityUrl({ url: 'https://example.com/notice' });

    expect(result.success).toBe(true);
    expect(result.state.opportunities[0].sourceText).toContain('公告来源URL：https://example.com/notice');
    expect(result.state.opportunities[0].title).toContain('智慧园区平台');
    expect(result.state.opportunities[0].sourceText).not.toContain('hidden()');
  });

  it('parses an announcement with AI fields before saving an opportunity', async () => {
    const collectJsonResponse = vi.fn().mockResolvedValue({
      projectName: 'AI 识别智慧医院平台',
      buyer: 'AI 医院',
      budget: '1500万元',
      region: '浙江省杭州市',
      industry: '医疗信息化',
      bidDeadline: '2026年08月01日 09:30',
      qualification: '需要医疗信息化项目业绩。',
      scoringSummary: '技术 60 分，商务 20 分，报价 20 分。',
    });
    const store = createBidOpportunityStore({
      db: createFakeBidOpportunityDb(),
      aiService: { collectJsonResponse },
    });

    const result = await store.saveOpportunityWithAi({
      sourceText: '项目名称：智慧医院平台\n预算金额：1500万元',
    });

    expect(collectJsonResponse).toHaveBeenCalled();
    expect(result.opportunities[0].title).toBe('AI 识别智慧医院平台');
    expect(result.opportunities[0].parsedFields.buyer).toBe('AI 医院');
    expect(result.opportunities[0].parsedFields.scoringSummary).toContain('技术 60 分');
  });

  it('matches saved opportunities against knowledge base items', () => {
    const store = createBidOpportunityStore({
      db: createFakeBidOpportunityDb([
        {
          item_id: 'item-knowledge-1',
          title: '智慧园区平台建设业绩',
          resume: '包含智慧园区平台、运维和本地化服务案例。',
          content: '项目提供智慧园区平台建设、7x24 运维、本地化服务和软件著作权。',
          source_file: '历史业绩.md',
        },
      ]),
    });

    const result = store.saveOpportunity({
      sourceText: '项目名称：产业园智慧运维平台\n资格要求：须提供智慧园区平台建设业绩和本地化服务承诺。',
    });

    expect(result.opportunities[0].knowledgeMatches?.[0]).toMatchObject({
      itemId: 'item-knowledge-1',
      title: '智慧园区平台建设业绩',
      sourceFile: '历史业绩.md',
    });
    expect(result.opportunities[0].knowledgeMatches?.[0].matchedKeywords).toContain('业绩');
  });

  it('scores opportunities with competition, profit, schedule and historical similarity factors', () => {
    const store = createBidOpportunityStore({
      db: createFakeBidOpportunityDb([
        {
          item_id: 'item-win-1',
          title: '智慧园区平台中标业绩',
          resume: '已中标并验收的智慧园区平台案例。',
          content: '包含智慧园区平台运维服务、广东省深圳市、类似项目中标业绩、公开招标、综合评分、价格分、三年服务期和分阶段实施经验。',
          source_file: '中标业绩.md',
        },
      ]),
    });

    const result = store.saveOpportunity({
      sourceText: [
        '项目名称：智慧园区平台运维服务',
        '预算金额：1800万元',
        '项目地点：广东省深圳市',
        '投标截止：2026年08月08日 09:30',
        '资格要求：须提供智慧园区平台类似项目中标业绩。',
        '评标办法：公开招标，综合评分，价格分 40 分。',
        '服务期：三年，分阶段实施。',
      ].join('\n'),
    });

    const opportunity = result.opportunities[0];
    expect(opportunity.scoreBreakdown).toMatchObject({
      competition: 5,
      profit: 5,
      schedule: 9,
      historicalSimilarity: 10,
    });
    expect(opportunity.score).toBeGreaterThanOrEqual(80);
    expect(opportunity.risks.some((risk) => risk.text.includes('竞争强度'))).toBe(true);
    expect(opportunity.risks.some((risk) => risk.text.includes('利润空间'))).toBe(true);

    const markdown = buildBidOpportunityReportMarkdown(result);
    expect(markdown).toContain('竞争强度：5');
    expect(markdown).toContain('利润空间：5');
    expect(markdown).toContain('工期可控性：9');
    expect(markdown).toContain('历史中标相似度：10');
  });

  it('falls back to rule parsing when AI announcement parsing fails', async () => {
    const store = createBidOpportunityStore({
      db: createFakeBidOpportunityDb(),
      aiService: { collectJsonResponse: vi.fn().mockRejectedValue(new Error('model failed')) },
    });

    const result = await store.saveOpportunityWithAi({
      sourceText: '项目名称：规则兜底项目\n预算金额：900万元',
    });

    expect(result.opportunities[0].title).toContain('规则兜底项目');
    expect(result.opportunities[0].risks.some((risk) => risk.text.includes('AI 结构化解析失败'))).toBe(true);
  });

  it('updates follow-up owner, next action and reminder fields', () => {
    const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb() });

    const saved = store.saveOpportunity({
      sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
      owner: '张三',
      nextAction: '初筛资质',
      reminderAt: '2026-07-01T09:30',
    });
    const opportunityId = saved.opportunities[0].id;

    const updated = store.updateFollowUp(opportunityId, {
      owner: '李四',
      nextAction: '预约投标评审会',
      reminderAt: '2026-07-02T14:00',
    });

    expect(updated.opportunities[0]).toMatchObject({
      id: opportunityId,
      owner: '李四',
      nextAction: '预约投标评审会',
      reminderAt: '2026-07-02T14:00',
    });

    const partiallyUpdated = store.updateFollowUp(opportunityId, {
      nextAction: '补充授权文件',
    });

    expect(partiallyUpdated.opportunities[0]).toMatchObject({
      id: opportunityId,
      owner: '李四',
      nextAction: '补充授权文件',
      reminderAt: '2026-07-02T14:00',
    });
  });

  it('adds multi-round follow-up records and syncs current action summary', () => {
    const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb() });
    const saved = store.saveOpportunity({
      sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
      owner: '张三',
    });
    const opportunityId = saved.opportunities[0].id;

    const updated = store.addFollowUpRecord(opportunityId, {
      method: 'meeting',
      owner: '李四',
      contactPerson: '代理王经理',
      content: '确认答疑文件发布时间。',
      nextAction: '补充授权文件',
      nextFollowUpAt: '2026-07-03T10:00',
    });

    expect(updated.opportunities[0]).toMatchObject({
      id: opportunityId,
      status: 'tracking',
      owner: '李四',
      nextAction: '补充授权文件',
      reminderAt: '2026-07-03T10:00',
    });
    expect(updated.opportunities[0].followUps?.[0]).toMatchObject({
      method: 'meeting',
      owner: '李四',
      contactPerson: '代理王经理',
      content: '确认答疑文件发布时间。',
      nextAction: '补充授权文件',
    });
  });

  it('updates and deletes multi-round follow-up records', () => {
    const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb() });
    const saved = store.saveOpportunity({
      sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
      owner: '张三',
    });
    const opportunityId = saved.opportunities[0].id;
    const withRecord = store.addFollowUpRecord(opportunityId, {
      method: 'phone',
      owner: '张三',
      content: '首次电话沟通。',
      nextAction: '等待答疑。',
    });
    const recordId = withRecord.opportunities[0].followUps?.[0]?.id || '';

    const updated = store.updateFollowUpRecord(recordId, {
      method: 'email',
      owner: '李四',
      contactPerson: '代理王经理',
      content: '邮件确认答疑时间。',
      nextAction: '周五前补充材料。',
      nextFollowUpAt: '2026-07-05T15:00',
    });

    expect(updated.opportunities[0].followUps?.[0]).toMatchObject({
      id: recordId,
      method: 'email',
      owner: '李四',
      contactPerson: '代理王经理',
      content: '邮件确认答疑时间。',
      nextAction: '周五前补充材料。',
      nextFollowUpAt: '2026-07-05T15:00',
    });

    const deleted = store.deleteFollowUpRecord(recordId);

    expect(deleted.opportunities[0].followUps).toHaveLength(0);
  });

  it('imports bid opportunity attachments into the workspace', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-opportunity-attachments-'));
    const sourcePath = path.join(tempDir, '公告答疑.pdf');
    fs.writeFileSync(sourcePath, 'attachment-content', 'utf-8');
    try {
      const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb(), workspaceRoot: tempDir });
      const saved = store.saveOpportunity({
        sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
      });
      const opportunityId = saved.opportunities[0].id;

      const result = await store.importAttachments(opportunityId, {
        filePaths: [sourcePath],
        kind: 'communication',
        note: '答疑沟通附件',
      });

      expect(result.success).toBe(true);
      const attachment = result.state.opportunities[0].attachments?.[0];
      expect(attachment).toMatchObject({
        kind: 'communication',
        fileName: '公告答疑.pdf',
        note: '答疑沟通附件',
      });
      expect(fs.existsSync(path.join(tempDir, attachment?.storedPath || ''))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('updates attachment metadata and removes the copied workspace file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-opportunity-attachment-delete-'));
    const sourcePath = path.join(tempDir, '资格证明.pdf');
    fs.writeFileSync(sourcePath, 'attachment-content', 'utf-8');
    try {
      const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb(), workspaceRoot: tempDir });
      const saved = store.saveOpportunity({
        sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
      });
      const opportunityId = saved.opportunities[0].id;
      const imported = await store.importAttachments(opportunityId, {
        filePaths: [sourcePath],
        kind: 'announcement',
      });
      const attachment = imported.state.opportunities[0].attachments?.[0];
      const attachmentId = attachment?.id || '';
      const copiedPath = path.join(tempDir, attachment?.storedPath || '');

      const updated = store.updateAttachment(attachmentId, {
        kind: 'qualification',
        note: '资格证明原件',
      });

      expect(updated.opportunities[0].attachments?.[0]).toMatchObject({
        id: attachmentId,
        kind: 'qualification',
        note: '资格证明原件',
      });
      expect(fs.existsSync(copiedPath)).toBe(true);

      const deleted = store.deleteAttachment(attachmentId);

      expect(deleted.opportunities[0].attachments).toHaveLength(0);
      expect(fs.existsSync(copiedPath)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('exports reminder calendar to an iCalendar file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-opportunity-calendar-'));
    const outputPath = path.join(tempDir, 'opportunity.ics');
    try {
      const store = createBidOpportunityStore({ db: createFakeBidOpportunityDb() });
      store.saveOpportunity({
        sourceText: '项目名称：智慧园区平台\n预算金额：1200万元',
        owner: '张三',
        nextAction: '初筛资质',
        reminderAt: '2026-07-01T09:30',
      });

      const result = await store.exportCalendar({ filePath: outputPath });

      expect(result.success).toBe(true);
      expect(result.eventCount).toBe(1);
      expect(fs.readFileSync(outputPath, 'utf-8')).toContain('BEGIN:VCALENDAR');
      expect(fs.readFileSync(outputPath, 'utf-8')).toContain('DTSTART:20260701T093000');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('converts announcement HTML into readable text', () => {
    expect(htmlToReadableText('<h1>公告</h1><p>项目名称：测试项目&nbsp;</p>')).toContain('项目名称：测试项目');
  });
});
