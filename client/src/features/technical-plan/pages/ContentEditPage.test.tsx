import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { OutlineItem } from '../../../shared/types';
import type { BackgroundTaskState, ContentGenerationOptions, ContentGenerationSections } from '../types';
import ContentEditPage from './ContentEditPage';

const generationOptions: ContentGenerationOptions = {
  useAiImages: true,
  maxAiImages: 3,
  useMermaidImages: true,
  tableRequirement: 'moderate',
  minimumWords: 0,
  enableConsistencyAudit: true,
  consistencyRepairMode: 'agent',
  enableOriginalPlanCoverageAudit: false,
  originalPlanCoverageRepairMode: 'agent',
};

const sections: ContentGenerationSections = {
  'section-1': {
    id: 'section-1',
    title: '实施方案',
    status: 'success',
    content: [
      '这是已经生成的正文内容。',
      '',
      '![现场部署图](https://example.com/figure.png)',
      '',
      '*图：现场部署图*',
    ].join('\n'),
  },
};

const imageKnowledgeState = {
  categories: ['资质证书'],
  tags: ['证书'],
  assets: [
    {
      id: 'img-1',
      fileName: 'certificate.png',
      title: '企业资质证书',
      category: '资质证书',
      description: '用于资信章节',
      source: '企业资料',
      scenario: '资信证明',
      tags: ['证书'],
      mimeType: 'image/png',
      size: 2048,
      width: 800,
      height: 600,
      contentHash: 'hash-1',
      thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      referenceCount: 0,
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    },
  ],
};

const completedTask: BackgroundTaskState = {
  task_id: 'task-1',
  type: 'content-generation',
  status: 'success',
  progress: 100,
  logs: ['正文生成完成。'],
  started_at: '2026-06-14T10:00:00.000Z',
  updated_at: '2026-06-14T10:10:00.000Z',
  stats: {
    content: {
      phase: 'done',
      planning_total: 1,
      planning_completed: 1,
      generation_total: 1,
      generation_completed: 1,
      illustration_total: 3,
      illustration_completed: 3,
    },
    images: {
      total: { planned: 3, attempted: 3, success: 2, failed: 1, skipped: 0 },
      ai: { planned: 2, attempted: 2, success: 1, failed: 1, skipped: 0 },
      mermaid: { planned: 1, attempted: 1, success: 1, failed: 0, skipped: 0 },
    },
    audit: {
      enabled: true,
      ran: true,
      status: 'partial',
      group_total: 2,
      group_completed: 2,
      conflict_total: 2,
      fixed_total: 1,
      manual_total: 1,
      failed_group_total: 1,
      items: [
        {
          section_id: 'section-1',
          title: '实施方案',
          fact_title: '交付期限',
          evidence: '正文写明 10 天交付',
          reason: '与全局事实 7 天交付冲突',
          severity: 'high',
          status: 'fixed',
          applied_count: 1,
          errors: [],
        },
        {
          section_id: 'section-1',
          title: '实施方案',
          fact_title: '质保期',
          evidence: '正文写明质保 1 年',
          reason: '与全局事实 3 年质保冲突',
          severity: 'medium',
          status: 'manual',
          applied_count: 0,
          errors: ['未能唯一定位替换内容'],
        },
      ],
      failed_groups: [
        { index: 2, total: 2, error: '模型返回无效', section_ids: ['section-1'] },
      ],
      updated_at: '2026-06-14T10:08:00.000Z',
    },
    originalCoverage: {
      enabled: true,
      ran: true,
      status: 'partial',
      source_total: 4,
      audited_total: 4,
      covered_total: 2,
      partial_total: 1,
      missing_total: 1,
      conflict_total: 1,
      fixed_total: 1,
      manual_total: 2,
      coverage_rate: 0.5,
      items: [
        {
          source_id: 'P001',
          node_id: 'section-1',
          title: '实施方案',
          source_title: '原方案 > 实施组织',
          status: 'covered',
          missing_points: [],
          repair_suggestion: '',
          repair_status: 'none',
          errors: [],
        },
        {
          source_id: 'P002',
          node_id: 'section-1',
          title: '实施方案',
          source_title: '原方案 > 服务承诺',
          status: 'partial',
          missing_points: ['缺少7x24小时响应承诺'],
          repair_suggestion: '补充7x24小时响应承诺',
          repair_status: 'fixed',
          errors: [],
        },
        {
          source_id: 'P003',
          node_id: 'section-1',
          title: '实施方案',
          source_title: '原方案 > 质保承诺',
          status: 'missing',
          missing_points: ['缺少三年质保承诺'],
          repair_suggestion: '补充质保期承诺',
          repair_status: 'manual',
          errors: ['补写 patch 应用后正文没有变化'],
        },
        {
          source_id: 'P004',
          node_id: 'section-1',
          title: '实施方案',
          source_title: '原方案 > 项目周期',
          status: 'conflict',
          missing_points: ['周期承诺与原方案相反'],
          repair_suggestion: '',
          repair_status: 'none',
          errors: [],
        },
      ],
      unassigned_total: 1,
      pending_unassigned_total: 1,
      unassigned_items: [
        {
          source_id: 'P005',
          source_title: '原方案 > 培训安排',
          chars: 96,
          excerpt: '原方案中包含现场培训、交付后回访和操作手册移交要求。',
          status: 'pending',
        },
      ],
      commitment_summary: {
        total: 3,
        preserved_total: 1,
        partial_total: 0,
        missing_total: 1,
        conflict_total: 1,
        risk_total: 2,
        preservation_rate: 0.3333,
        items: [
          {
            source_id: 'P002',
            source_title: '原方案 > 服务承诺',
            node_id: 'section-1',
            title: '实施方案',
            category: '服务响应',
            status: 'preserved',
            missing_points: ['缺少7x24小时响应承诺'],
            repair_status: 'fixed',
            errors: [],
          },
          {
            source_id: 'P003',
            source_title: '原方案 > 质保承诺',
            node_id: 'section-1',
            title: '实施方案',
            category: '售后质保',
            status: 'missing',
            missing_points: ['缺少三年质保承诺'],
            repair_status: 'manual',
            errors: ['补写 patch 应用后正文没有变化'],
          },
          {
            source_id: 'P004',
            source_title: '原方案 > 项目周期',
            node_id: 'section-1',
            title: '实施方案',
            category: '交付周期',
            status: 'conflict',
            missing_points: ['周期承诺与原方案相反'],
            repair_status: 'none',
            errors: [],
          },
        ],
      },
      failed_sections: [
        { node_id: 'section-1', title: '实施方案', error: '模型返回无效' },
      ],
      updated_at: '2026-06-14T10:09:00.000Z',
    },
  },
};

function renderPage(options: {
  onContentSaved?: (item: OutlineItem, content: string) => Promise<void> | void;
  onStateChanged?: (state: unknown) => void;
  workflowKind?: 'technical-plan' | 'existing-plan-expansion';
  task?: BackgroundTaskState;
} = {}) {
  return render(
    <ToastProvider>
      <ContentEditPage
        workflowKind={options.workflowKind || 'technical-plan'}
        outlineData={{ outline: [{ id: 'section-1', title: '实施方案', description: '实施方案说明' }] }}
        task={options.task || completedTask}
        contentGenerationOptions={generationOptions}
        sections={sections}
        onContentGenerationOptionsChange={vi.fn()}
        onContentSaved={options.onContentSaved || vi.fn()}
        onStateChanged={options.onStateChanged}
      />
    </ToastProvider>,
  );
}

describe('ContentEditPage illustration report', () => {
  beforeEach(() => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({
          developer_mode: false,
          image_model: { status: 'available' },
        }),
      },
      tasks: {
        startContentGeneration: vi.fn(),
        pauseContentGeneration: vi.fn(),
      },
      technicalPlan: {
        resolveConsistencyAuditItem: vi.fn().mockResolvedValue({
          contentGenerationTask: {
            ...completedTask,
            stats: {
              ...completedTask.stats,
              audit: {
                ...completedTask.stats?.audit,
                fixed_total: 2,
                manual_total: 0,
              },
            },
          },
        }),
        handleOriginalCoverageUnassignedSegment: vi.fn().mockResolvedValue({
          contentGenerationTask: {
            ...completedTask,
            stats: {
              ...completedTask.stats,
              originalCoverage: {
                ...completedTask.stats?.originalCoverage,
                pending_unassigned_total: 0,
              },
            },
          },
        }),
      },
      imageKnowledgeBase: {
        list: vi.fn().mockResolvedValue(imageKnowledgeState),
        createMarkdownReference: vi.fn().mockResolvedValue({
          reference: {
            id: 'ref-1',
            imageId: 'img-1',
            targetType: 'technical-plan',
            targetId: 'section-1',
            createdAt: '2026-06-14T10:05:00.000Z',
          },
          markdown: '![企业资质证书](yibiao-asset://image-knowledge-base/img-1.png)\n\n*图：企业资质证书，用于资信章节*',
          state: {
            ...imageKnowledgeState,
            assets: imageKnowledgeState.assets.map((asset) => ({ ...asset, referenceCount: 1 })),
          },
        }),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('shows illustration success and failure stats to normal users', () => {
    renderPage();

    expect(screen.getByLabelText('配图策略报告')).toBeInTheDocument();
    expect(screen.getByText('配图已完成：计划 3 张，成功 2 张，失败 1 张，跳过 0 张。')).toBeInTheDocument();
    expect(screen.getByText('AI 生图：计划 2，已尝试 2，成功 1，失败 1，跳过 0')).toBeInTheDocument();
    expect(screen.getByText('Mermaid：计划 1，已尝试 1，成功 1，失败 0，跳过 0')).toBeInTheDocument();
    expect(screen.queryByLabelText('开发者生成统计')).not.toBeInTheDocument();
  });

  it('shows image knowledge base stats when generated content used matched assets', () => {
    renderPage({
      task: {
        ...completedTask,
        stats: {
          ...completedTask.stats,
          images: {
            total: { planned: 3, attempted: 3, success: 3, failed: 0, skipped: 0 },
            ai: { planned: 1, attempted: 1, success: 1, failed: 0, skipped: 0 },
            mermaid: { planned: 1, attempted: 1, success: 1, failed: 0, skipped: 0 },
            knowledge: { planned: 1, attempted: 1, success: 1, failed: 0, skipped: 0 },
          },
        },
      },
    });

    expect(screen.getByText('图片知识库：计划 1，已尝试 1，成功 1，失败 0，跳过 0')).toBeInTheDocument();
  });

  it('shows consistency audit report with fixed and manual items', () => {
    renderPage();

    expect(screen.getByLabelText('全文一致性审计报告')).toBeInTheDocument();
    expect(screen.getByText('审计已完成但需要人工核对：发现 2 条冲突，已修复 1 条，1 条需处理，1 组审计失败。')).toBeInTheDocument();
    expect(screen.getByText('已修复 · 高风险 · 交付期限')).toBeInTheDocument();
    expect(screen.getByText('需人工核对 · 中风险 · 质保期')).toBeInTheDocument();
    expect(screen.getByText('证据：正文写明 10 天交付')).toBeInTheDocument();
    expect(screen.getByText('处理提示：未能唯一定位替换内容')).toBeInTheDocument();
    expect(screen.getByText('第 2/2 组审计失败')).toBeInTheDocument();
    expect(screen.getByText('涉及章节：section-1')).toBeInTheDocument();
  });

  it('shows original plan coverage report in expansion mode', () => {
    renderPage({ workflowKind: 'existing-plan-expansion' });

    expect(screen.getByLabelText('原方案覆盖审计报告')).toBeInTheDocument();
    expect(screen.getByText('覆盖率 50%：已覆盖 2 段，部分覆盖 1 段，未覆盖 1 段，冲突 1 段。 核心承诺保留率 33%，2 条需核对。')).toBeInTheDocument();
    expect(screen.getByText('核心承诺保留审计')).toBeInTheDocument();
    expect(screen.getByText('保留率 33% · 已保留 1 条 · 需核对 2 条')).toBeInTheDocument();
    expect(screen.getByText('未保留 · 售后质保 · P003 原方案 > 质保承诺：缺少三年质保承诺')).toBeInTheDocument();
    expect(screen.getByText('存在冲突 · 交付周期 · P004 原方案 > 项目周期：周期承诺与原方案相反')).toBeInTheDocument();
    expect(screen.getByText('已补回 · P002 · 原方案 > 服务承诺')).toBeInTheDocument();
    expect(screen.getByText('未覆盖 · P003 · 原方案 > 质保承诺')).toBeInTheDocument();
    expect(screen.getByText('存在冲突 · P004 · 原方案 > 项目周期')).toBeInTheDocument();
    expect(screen.getByText('P005 原方案 > 培训安排')).toBeInTheDocument();
    expect(screen.getByText('未分配原方案段落 · 96 字')).toBeInTheDocument();
    expect(screen.getByText('缺失要点：缺少三年质保承诺')).toBeInTheDocument();
    expect(screen.getByText('覆盖审计失败')).toBeInTheDocument();
  });

  it('binds and ignores unassigned original plan segments', async () => {
    const onStateChanged = vi.fn();
    renderPage({ workflowKind: 'existing-plan-expansion', onStateChanged });

    fireEvent.click(screen.getByRole('button', { name: '绑定章节' }));

    await waitFor(() => {
      expect(window.yibiao?.technicalPlan.handleOriginalCoverageUnassignedSegment).toHaveBeenCalledWith({
        sourceId: 'P005',
        action: 'bind',
        nodeId: 'section-1',
      });
      expect(onStateChanged).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: '忽略' }));

    await waitFor(() => {
      expect(window.yibiao?.technicalPlan.handleOriginalCoverageUnassignedSegment).toHaveBeenCalledWith({
        sourceId: 'P005',
        action: 'ignore',
      });
    });
  });

  it('lets users jump, edit, recheck, and resolve manual audit items', async () => {
    const onStateChanged = vi.fn();
    renderPage({ onStateChanged });

    fireEvent.click(screen.getAllByRole('button', { name: '查看章节' })[1]);
    expect(screen.getByText('正文内容')).toBeInTheDocument();
    expect(screen.getAllByText('section-1 实施方案').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '编辑章节' })[1]);
    expect(screen.getByPlaceholderText('输入 Markdown 正文...')).toHaveValue(sections['section-1'].content);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '重新审计' }));
    expect(screen.getByRole('dialog', { name: 'section-1 实施方案' })).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/例如：强化实施步骤/) as HTMLTextAreaElement).value).toContain('质保期');

    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));

    await waitFor(() => {
      expect(window.yibiao?.technicalPlan.resolveConsistencyAuditItem).toHaveBeenCalledWith({ sectionId: 'section-1', index: 1 });
      expect(onStateChanged).toHaveBeenCalled();
    });
  });

  it('starts an audit-only task for failed audit groups', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '重新审计失败分组' }));

    await waitFor(() => {
      expect(window.yibiao?.tasks.startContentGeneration).toHaveBeenCalledWith(expect.objectContaining({
        auditOnly: true,
        auditTargetItemIds: ['section-1'],
        generationOptions: expect.objectContaining({
          enableConsistencyAudit: true,
          enableOriginalPlanCoverageAudit: false,
        }),
      }));
    });
  });

  it('opens generated images in the fullscreen preview dialog', async () => {
    renderPage();

    const inlineImageButton = screen.getByRole('button', { name: '现场部署图' });
    fireEvent.click(inlineImageButton);

    expect(screen.getByRole('dialog', { name: '现场部署图' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '现场部署图' })).toHaveAttribute('src', 'https://example.com/figure.png');
    expect(screen.getByRole('button', { name: '关闭图片预览' })).toBeInTheDocument();
    expect(screen.getByText('图：现场部署图').closest('p')).toHaveClass('markdown-figure-caption');
    await waitFor(() => expect(window.yibiao?.config.load).toHaveBeenCalled());
  });

  it('inserts image knowledge assets into the active chapter markdown', async () => {
    const onContentSaved = vi.fn();
    renderPage({ onContentSaved });

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '插入图片' }));

    expect(await screen.findByLabelText('从图片知识库插入')).toBeInTheDocument();
    expect(screen.getByText('企业资质证书')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '插入' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.createMarkdownReference).toHaveBeenCalledWith({
        imageId: 'img-1',
        targetType: 'technical-plan',
        targetId: 'section-1',
      });
    });

    expect((screen.getByPlaceholderText('输入 Markdown 正文...') as HTMLTextAreaElement).value)
      .toContain('![企业资质证书](yibiao-asset://image-knowledge-base/img-1.png)');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onContentSaved).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'section-1' }),
        expect.stringContaining('*图：企业资质证书，用于资信章节*'),
      );
    });
  });
});
