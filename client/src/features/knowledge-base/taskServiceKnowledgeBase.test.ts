import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createTaskService } = require('../../../electron/services/taskService.cjs') as {
  createTaskService: (options: Record<string, unknown>) => {
    getActiveTasks: () => Array<Record<string, unknown>>;
    startBusinessBidAiExtraction: (payload: Record<string, unknown>) => Record<string, unknown>;
    startAiEvaluationExtraction: (payload: Record<string, unknown>) => Record<string, unknown>;
    startAiEvaluationBatchScoring: (payload: Record<string, unknown>) => Record<string, unknown>;
    subscribe: (webContents: { isDestroyed: () => boolean; send: (...args: unknown[]) => void; once: (...args: unknown[]) => void }) => void;
  };
};

function createWorkspaceStore() {
  return {
    loadTechnicalPlan: vi.fn().mockReturnValue({}),
    updateTechnicalPlan: vi.fn((partial) => partial),
    loadRejectionCheck: vi.fn().mockReturnValue({}),
    updateRejectionCheck: vi.fn((partial) => partial),
    loadDuplicateCheck: vi.fn().mockReturnValue({}),
    updateDuplicateCheck: vi.fn((partial) => partial),
  };
}

describe('taskService knowledge-base active tasks', () => {
  it('recovers interrupted content generation immediately when the service is created', () => {
    const technicalPlanState = {
      contentGenerationTask: {
        type: 'content-generation',
        status: 'running',
        progress: 86,
        logs: ['开始生成：2.1.2 15日交付进度安排'],
        stats: { content: { phase: 'generating' } },
      },
      contentGenerationSections: {
        '2.1.2': { status: 'running', error: '', updated_at: '2026-06-29T09:55:30.000Z' },
        '2.1.1': { status: 'success', error: '', updated_at: '2026-06-29T09:50:00.000Z' },
      },
      contentGenerationRuntime: { phase: 'generating' },
      outlineData: {
        outline: [{
          id: '2.1',
          title: '项目实施',
          children: [
            { id: '2.1.1', title: '实施准备', content: '已有正文' },
            { id: '2.1.2', title: '15日交付进度安排', content: '未完成正文' },
          ],
        }],
      },
    };
    const stores = createWorkspaceStore();
    stores.loadTechnicalPlan.mockReturnValue(technicalPlanState);

    createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService: { getActiveTasks: vi.fn().mockReturnValue({ tasks: [], documents: [] }) },
      duplicateCheckService: {},
    });

    expect(stores.updateTechnicalPlan).toHaveBeenCalledWith(expect.objectContaining({
      contentGenerationTask: expect.objectContaining({
        status: 'paused',
        logs: expect.arrayContaining(['上次正文生成因应用关闭而暂停，可点击继续恢复。']),
      }),
      contentGenerationSections: expect.objectContaining({
        '2.1.2': expect.objectContaining({
          status: 'error',
          error: '上次生成被中断，请继续生成。',
        }),
      }),
      outlineData: expect.objectContaining({
        outline: [expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ id: '2.1.2', content: '' }),
          ]),
        })],
      }),
    }));
  });

  it('exposes multiple document-scoped knowledge tasks without collapsing their scopes', () => {
    const stores = createWorkspaceStore();
    const knowledgeBaseService = {
      getActiveTasks: vi.fn().mockReturnValue({
        tasks: [
          {
            document_id: 'doc-1',
            phase: 'preparing',
            document: {
              id: 'doc-1',
              file_name: '实施方案.docx',
              progress: 35,
              message: 'AI 正在首次提取知识条目',
              created_at: '2026-06-15T01:00:00.000Z',
              updated_at: '2026-06-15T01:02:00.000Z',
            },
          },
          {
            document_id: 'doc-2',
            phase: 'matching',
            document: {
              id: 'doc-2',
              file_name: '类似业绩.pdf',
              progress: 72,
              message: 'AI 正在匹配段落 3/5',
              created_at: '2026-06-15T01:01:00.000Z',
              updated_at: '2026-06-15T01:03:00.000Z',
            },
          },
        ],
        documents: [],
      }),
    };
    const taskService = createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService,
      duplicateCheckService: {},
    });

    const activeTasks = taskService.getActiveTasks();

    expect(activeTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        task_id: 'knowledge-base:preparing:doc-1',
        type: 'knowledge-base-preparation',
        group: 'knowledge-base',
        lock_policy: 'scope-exclusive',
        scope_id: 'doc-1',
        progress: 35,
      }),
      expect.objectContaining({
        task_id: 'knowledge-base:matching:doc-2',
        type: 'knowledge-base-matching',
        group: 'knowledge-base',
        lock_policy: 'scope-exclusive',
        scope_id: 'doc-2',
        progress: 72,
      }),
    ]));
    expect(new Set(activeTasks.map((task) => task.scope_id))).toEqual(new Set(['doc-1', 'doc-2']));
  });

  it('emits document-scoped knowledge tasks to task subscribers', () => {
    const stores = createWorkspaceStore();
    const knowledgeBaseService = {
      getActiveTasks: vi.fn().mockReturnValue({
        tasks: [
          {
            document_id: 'doc-1',
            phase: 'matching',
            document: {
              id: 'doc-1',
              file_name: '投标素材.docx',
              progress: 80,
              message: 'AI 正在匹配段落 4/5',
              created_at: '2026-06-15T01:00:00.000Z',
              updated_at: '2026-06-15T01:04:00.000Z',
            },
          },
        ],
        documents: [],
      }),
    };
    const taskService = createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService,
      duplicateCheckService: {},
    });
    const webContents = {
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn(),
      once: vi.fn(),
    };

    taskService.subscribe(webContents);

    expect(webContents.send).toHaveBeenCalledWith('tasks:event', expect.objectContaining({
      task: expect.objectContaining({
        type: 'knowledge-base-matching',
        scope_id: 'doc-1',
        document_id: 'doc-1',
      }),
      knowledgeBaseActiveTasks: expect.any(Object),
    }));
  });

  it('runs business bid AI extraction as a managed task with business snapshots', async () => {
    const stores = createWorkspaceStore();
    const businessState = {
      source: { type: 'tender-document', fileName: '商务招标文件.docx', contentHash: 'hash-1', generatedAt: '2026-06-15T01:00:00.000Z' },
      clauses: [] as Array<Record<string, unknown>>,
      aiExtractionTask: undefined as Record<string, unknown> | undefined,
    };
    const businessBidStore = {
      loadState: vi.fn(() => businessState),
      updateBusinessBid: vi.fn((partial: Record<string, unknown>) => {
        businessState.aiExtractionTask = partial.aiExtractionTask as Record<string, unknown>;
        return businessState;
      }),
      enhanceWithAi: vi.fn(async ({ progressCallback }: { progressCallback?: (message: string) => void }) => {
        progressCallback?.('AI 已返回商务条款 JSON。');
        businessState.clauses = [{ id: 'business-001', category: 'payment' }];
        return { success: true, message: 'AI 已重新提取 1 条商务条款', state: businessState };
      }),
    };
    const taskService = createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService: { getActiveTasks: vi.fn().mockReturnValue({ tasks: [], documents: [] }) },
      duplicateCheckService: {},
      businessBidStore,
    });

    const task = taskService.startBusinessBidAiExtraction({});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(task).toMatchObject({
      type: 'business-bid-ai-extraction',
      group: 'business-bid',
      status: 'running',
    });
    expect(businessBidStore.enhanceWithAi).toHaveBeenCalled();
    expect(businessState.aiExtractionTask).toMatchObject({
      type: 'business-bid-ai-extraction',
      status: 'success',
      progress: 100,
      stats: { clause_count: 1 },
    });
  });

  it('runs AI evaluation structured extraction as a managed task with evaluation snapshots', async () => {
    const stores = createWorkspaceStore();
    const evaluationState = {
      source: { type: 'technical-plan', fileName: '评分办法.docx', contentHash: 'hash-1', generatedAt: '2026-06-15T01:00:00.000Z' },
      items: [] as Array<Record<string, unknown>>,
      summary: { itemCount: 0 },
      aiExtractionTask: undefined as Record<string, unknown> | undefined,
    };
    const aiEvaluationStore = {
      loadState: vi.fn(() => evaluationState),
      updateAiEvaluation: vi.fn((partial: Record<string, unknown>) => {
        evaluationState.aiExtractionTask = partial.aiExtractionTask as Record<string, unknown>;
        return evaluationState;
      }),
      enhanceWithAi: vi.fn(async ({ progressCallback }: { progressCallback?: (message: string) => void }) => {
        progressCallback?.('AI 已返回评分项 JSON。');
        evaluationState.items = [{ id: 'eval-001', category: 'technical' }];
        return { success: true, message: 'AI 已重新抽取 1 个评分项', state: evaluationState };
      }),
    };
    const taskService = createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService: { getActiveTasks: vi.fn().mockReturnValue({ tasks: [], documents: [] }) },
      duplicateCheckService: {},
      aiEvaluationStore,
    });

    const task = taskService.startAiEvaluationExtraction({});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(task).toMatchObject({
      type: 'ai-evaluation-extraction',
      group: 'ai-evaluation',
      status: 'running',
    });
    expect(aiEvaluationStore.enhanceWithAi).toHaveBeenCalled();
    expect(evaluationState.aiExtractionTask).toMatchObject({
      type: 'ai-evaluation-extraction',
      status: 'success',
      progress: 100,
      stats: { item_count: 1 },
    });
  });

  it('runs AI evaluation batch scoring as a managed task with evaluation snapshots', async () => {
    const stores = createWorkspaceStore();
    const evaluationState = {
      source: { type: 'technical-plan', fileName: '评分办法.docx', contentHash: 'hash-1', generatedAt: '2026-06-15T01:00:00.000Z' },
      items: [{ id: 'eval-001', category: 'technical' }],
      bidDocuments: [{ id: 'bid-1', fileName: '投标文件A.docx' }],
      summary: { itemCount: 1 },
      batchScoringTask: undefined as Record<string, unknown> | undefined,
    };
    const aiEvaluationStore = {
      loadState: vi.fn(() => evaluationState),
      updateAiEvaluation: vi.fn((partial: Record<string, unknown>) => {
        evaluationState.batchScoringTask = partial.batchScoringTask as Record<string, unknown>;
        return evaluationState;
      }),
      scoreImportedBidDocuments: vi.fn(async ({ progressCallback }: { progressCallback?: (message: string, stats?: Record<string, unknown>) => void }) => {
        progressCallback?.('已完成 投标文件A.docx 评分。', { documentCount: 1, scoredCount: 1, skippedCount: 0 });
        return {
          success: true,
          message: '已批量评分 1 份投标文件',
          state: evaluationState,
          stats: { document_count: 1, scored_count: 1, skipped_count: 0 },
        };
      }),
    };
    const taskService = createTaskService({
      aiService: {},
      technicalPlanStore: stores,
      rejectionCheckStore: stores,
      duplicateCheckStore: stores,
      knowledgeBaseService: { getActiveTasks: vi.fn().mockReturnValue({ tasks: [], documents: [] }) },
      duplicateCheckService: {},
      aiEvaluationStore,
    });

    const task = taskService.startAiEvaluationBatchScoring({});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(task).toMatchObject({
      type: 'ai-evaluation-batch-scoring',
      group: 'ai-evaluation',
      status: 'running',
    });
    expect(aiEvaluationStore.scoreImportedBidDocuments).toHaveBeenCalled();
    expect(evaluationState.batchScoringTask).toMatchObject({
      type: 'ai-evaluation-batch-scoring',
      status: 'success',
      progress: 100,
      stats: { document_count: 1, scored_count: 1, skipped_count: 0 },
    });
  });
});
