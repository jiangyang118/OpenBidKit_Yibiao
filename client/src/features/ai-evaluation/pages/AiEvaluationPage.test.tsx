import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { AiEvaluationState } from '../types';
import AiEvaluationPage from './AiEvaluationPage';

const evaluationState: AiEvaluationState = {
  source: {
    type: 'technical-plan',
    fileName: '招标文件.md',
    contentHash: 'hash-1',
    generatedAt: '2026-06-14T10:00:00.000Z',
  },
  aiExtractionTask: {
    task_id: 'task-ai-evaluation',
    type: 'ai-evaluation-extraction',
    status: 'success',
    progress: 100,
    logs: ['AI 已重新抽取 1 个评分项'],
    stats: { item_count: 1 },
    error: null,
    started_at: '2026-06-14T10:00:00.000Z',
    updated_at: '2026-06-14T10:01:00.000Z',
  },
  batchScoringTask: {
    task_id: 'task-ai-evaluation-batch',
    type: 'ai-evaluation-batch-scoring',
    status: 'success',
    progress: 100,
    logs: ['已批量评分 1 份投标文件'],
    stats: { document_count: 1, scored_count: 1 },
    error: null,
    started_at: '2026-06-14T10:02:00.000Z',
    updated_at: '2026-06-14T10:03:00.000Z',
  },
  bidDocuments: [
    {
      id: 'bid-hash-1',
      fileName: '投标文件A.docx',
      contentHash: 'bid-hash-1',
      contentChars: 1200,
      parserLabel: '本地解析',
      importedAt: '2026-06-14T10:02:00.000Z',
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
  expertScores: [
    {
      id: 'expert-1',
      itemId: 'eval-1',
      expertName: '专家A',
      score: 45,
      opinion: '证据充分，建议略调分。',
      createdAt: '2026-06-14T10:03:00.000Z',
      updatedAt: '2026-06-14T10:03:00.000Z',
    },
  ],
  expertReviewSummary: {
    expertCount: 1,
    scoreCount: 1,
    conflictCount: 0,
    maxDeviation: 4,
    conclusion: '专家打分暂未发现明显偏差。',
  },
  auditOpinions: [
    {
      id: 'audit-1',
      type: 'risk',
      severity: 'high',
      title: '高风险评分项：技术方案完整性',
      targetType: 'item',
      targetId: 'eval-1',
      evidence: '技术方案满分 50 分',
      recommendation: '请由评标负责人确认证据、分值和扣分原因后再形成正式结论。',
      status: 'open',
      sortOrder: 0,
      updatedAt: '2026-06-14T10:03:00.000Z',
    },
  ],
  latestReport: {
    id: 'report-1',
    type: 'self-evaluation',
    title: 'AI 评标自评报告',
    markdownChars: 1500,
    summary: {},
    generatedAt: '2026-06-14T10:04:00.000Z',
    exportedPath: '/tmp/ai-evaluation.md',
    exportedAt: '2026-06-14T10:04:00.000Z',
  },
  summary: {
    totalMaxScore: 50,
    totalFinalScore: 41,
    confirmedCount: 0,
    highRiskCount: 1,
    itemCount: 1,
    conclusion: '自评存在中等风险，建议优先处理扣分项和未确认项。',
  },
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
      updatedAt: '2026-06-14T10:00:00.000Z',
    },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <AiEvaluationPage />
    </ToastProvider>,
  );
}

describe('AiEvaluationPage', () => {
  beforeEach(() => {
    window.yibiao = ({
      aiEvaluation: {
        loadState: vi.fn().mockResolvedValue(evaluationState),
        generateFromTechnicalPlan: vi.fn().mockResolvedValue(evaluationState),
        importBidDocument: vi.fn().mockResolvedValue({ success: true, message: '投标文件已导入，评分证据和自评风险已更新', state: evaluationState }),
        updateItem: vi.fn().mockResolvedValue(evaluationState),
        saveExpertScore: vi.fn().mockResolvedValue(evaluationState),
        exportReport: vi.fn().mockResolvedValue({ success: true, message: 'AI 评标自评报告已导出', filePath: '/tmp/ai-evaluation.md', markdownChars: 1200 }),
        exportOfficePackage: vi.fn().mockResolvedValue({ success: true, message: 'AI 评标正式报告已导出', filePath: '/tmp/ai-evaluation.docx', bytes: 1200, format: 'docx' }),
        clear: vi.fn().mockResolvedValue({
          source: null,
          items: [],
          summary: {
            totalMaxScore: 0,
            totalFinalScore: 0,
            confirmedCount: 0,
            highRiskCount: 0,
            itemCount: 0,
            conclusion: '请先生成评分表',
          },
        }),
      },
      tasks: {
        startAiEvaluationExtraction: vi.fn().mockResolvedValue({
          task_id: 'task-ai-evaluation-2',
          type: 'ai-evaluation-extraction',
          status: 'running',
          progress: 0,
          logs: [],
          started_at: '2026-06-14T10:02:00.000Z',
          updated_at: '2026-06-14T10:02:00.000Z',
        }),
        startAiEvaluationBatchScoring: vi.fn().mockResolvedValue({
          task_id: 'task-ai-evaluation-batch-2',
          type: 'ai-evaluation-batch-scoring',
          status: 'running',
          progress: 0,
          logs: [],
          started_at: '2026-06-14T10:04:00.000Z',
          updated_at: '2026-06-14T10:04:00.000Z',
        }),
        getActiveTasks: vi.fn().mockResolvedValue([]),
        onTaskEvent: vi.fn().mockReturnValue(vi.fn()),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders persisted evaluation items from the bridge state', async () => {
    renderPage();

    expect(await screen.findByText('技术方案完整性')).toBeInTheDocument();
    expect(screen.getByText('41/50')).toBeInTheDocument();
    expect(screen.getByDisplayValue('技术方案满分 50 分')).toBeInTheDocument();
    expect(screen.getByText(/AI 抽取：已完成 · 100%/)).toBeInTheDocument();
    expect(screen.getByText(/批量评分：已完成 · 100%/)).toBeInTheDocument();
    expect(screen.getAllByText('投标文件A.docx')[0]).toBeInTheDocument();
    expect(screen.getByText(/41\/50 · 高风险 1/)).toBeInTheDocument();
    expect(screen.getByText(/审计意见：1 条/)).toBeInTheDocument();
    expect(screen.getByText(/专家打分：1 条/)).toBeInTheDocument();
    expect(screen.getByText('交叉审核')).toBeInTheDocument();
    expect(screen.getByText(/专家A：45 分/)).toBeInTheDocument();
    expect(screen.getByText('高风险评分项：技术方案完整性')).toBeInTheDocument();
    expect(screen.getByText(/已保存报告快照/)).toBeInTheDocument();
  });

  it('generates the evaluation table through the bridge', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '从技术方案生成评分表' }));

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.generateFromTechnicalPlan).toHaveBeenCalled();
    });
  });

  it('imports a bid document to match evaluation evidence', async () => {
    renderPage();

    const importButton = await screen.findByRole('button', { name: '导入投标文件匹配证据' });
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.importBidDocument).toHaveBeenCalled();
    });
  });

  it('starts AI structured extraction as a managed task', async () => {
    renderPage();

    const enhanceButton = await screen.findByRole('button', { name: 'AI 结构化抽取评分项' });
    fireEvent.click(enhanceButton);

    await waitFor(() => {
      expect(window.yibiao?.tasks.startAiEvaluationExtraction).toHaveBeenCalledWith({});
    });
  });

  it('starts batch scoring as a managed task', async () => {
    renderPage();

    const batchButton = await screen.findByRole('button', { name: '批量重评投标文件' });
    fireEvent.click(batchButton);

    await waitFor(() => {
      expect(window.yibiao?.tasks.startAiEvaluationBatchScoring).toHaveBeenCalledWith({});
    });
  });

  it('updates manual score through the bridge', async () => {
    renderPage();
    await screen.findByText('技术方案完整性');

    const manualScoreInput = screen.getByPlaceholderText('未调整');
    fireEvent.change(manualScoreInput, { target: { value: '45' } });
    fireEvent.blur(manualScoreInput);

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.updateItem).toHaveBeenCalledWith('eval-1', { manualScore: 45 });
    });
  });

  it('saves expert score through the bridge', async () => {
    renderPage();
    await screen.findByText('技术方案完整性');

    fireEvent.change(screen.getByPlaceholderText('例如：专家A'), { target: { value: '专家B' } });
    fireEvent.change(screen.getByPlaceholderText('0-50'), { target: { value: '32' } });
    fireEvent.change(screen.getByPlaceholderText('评分口径、分差原因或复核说明'), { target: { value: '与当前自评分差较大' } });
    fireEvent.click(screen.getByRole('button', { name: '保存专家打分' }));

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.saveExpertScore).toHaveBeenCalledWith({
        itemId: 'eval-1',
        expertName: '专家B',
        score: 32,
        opinion: '与当前自评分差较大',
      });
    });
  });

  it('exports the AI evaluation report', async () => {
    renderPage();

    const exportButton = await screen.findByRole('button', { name: '导出自评报告' });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.exportReport).toHaveBeenCalled();
    });
  });

  it('exports formal Word and Excel AI evaluation reports', async () => {
    renderPage();

    const wordButton = await screen.findByRole('button', { name: '导出 Word 报告' });
    fireEvent.click(wordButton);
    const excelButton = await screen.findByRole('button', { name: '导出 Excel 报告' });
    fireEvent.click(excelButton);

    await waitFor(() => {
      expect(window.yibiao?.aiEvaluation.exportOfficePackage).toHaveBeenCalledWith({ format: 'docx' });
      expect(window.yibiao?.aiEvaluation.exportOfficePackage).toHaveBeenCalledWith({ format: 'xlsx' });
    });
  });
});
