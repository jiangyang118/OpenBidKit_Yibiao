import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackBusinessBidAction } from '../../../shared/analytics/analytics';
import { ToastProvider } from '../../../shared/ui';
import type { BusinessBidState } from '../types';
import BusinessBidPage from './BusinessBidPage';

vi.mock('../../../shared/analytics/analytics', () => ({
  trackBusinessBidAction: vi.fn(),
}));

const businessBidState: BusinessBidState = {
  source: {
    type: 'technical-plan',
    fileName: '招标文件.docx',
    contentHash: 'hash-1',
    generatedAt: '2026-06-14T10:00:00.000Z',
  },
  aiExtractionTask: {
    task_id: 'task-business-ai',
    type: 'business-bid-ai-extraction',
    status: 'success',
    progress: 100,
    logs: ['AI 已重新提取 1 条商务条款'],
    stats: { clause_count: 1 },
    error: null,
    started_at: '2026-06-14T10:00:00.000Z',
    updated_at: '2026-06-14T10:01:00.000Z',
  },
  clauses: [
    {
      id: 'business-001',
      category: 'payment',
      label: '付款与结算',
      originalText: '付款方式：验收合格后 30 日内支付合同价款。',
      responseText: '响应付款方式要求。',
      deviationType: 'none',
      riskLevel: 'medium',
      materialRequirement: '补充发票和结算资料。',
      owner: '张三',
      confirmedBy: '李四',
      confirmed: false,
      sourceHint: '技术方案招标文件',
      sortOrder: 0,
      updatedAt: '2026-06-14T10:00:00.000Z',
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
      status: 'pending',
      owner: '报价负责人',
      note: '待财务确认最终报价',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <BusinessBidPage />
    </ToastProvider>,
  );
}

describe('BusinessBidPage', () => {
  beforeEach(() => {
    vi.mocked(trackBusinessBidAction).mockClear();
    window.yibiao = ({
      businessBid: {
        loadState: vi.fn().mockResolvedValue(businessBidState),
        importFromTechnicalPlan: vi.fn().mockResolvedValue(businessBidState),
        importTenderDocument: vi.fn().mockResolvedValue({ success: true, message: '商务标招标文件已导入，商务响应矩阵已生成', state: businessBidState }),
        enhanceWithAi: vi.fn().mockResolvedValue({ success: true, message: 'AI 已重新提取 1 条商务条款', state: businessBidState }),
        updateClause: vi.fn().mockResolvedValue(businessBidState),
        importAttachments: vi.fn().mockResolvedValue({ success: true, message: '已导入 1 个商务标附件', state: businessBidState }),
        updateAttachment: vi.fn().mockResolvedValue(businessBidState),
        deleteAttachment: vi.fn().mockResolvedValue({ ...businessBidState, attachments: [] }),
        exportReport: vi.fn().mockResolvedValue({ success: true, message: '商务标响应交付包已导出', filePath: '/tmp/business-bid.md', markdownChars: 1200 }),
        exportOfficePackage: vi.fn().mockResolvedValue({ success: true, message: '响应文件 Word 编制稿已导出', filePath: '/tmp/business-bid.docx', bytes: 2048, format: 'docx' }),
        clear: vi.fn().mockResolvedValue({ source: null, clauses: [] }),
      },
      tasks: {
        startBusinessBidAiExtraction: vi.fn().mockResolvedValue({
          task_id: 'task-business-ai-2',
          type: 'business-bid-ai-extraction',
          status: 'running',
          progress: 0,
          logs: [],
          started_at: '2026-06-14T10:02:00.000Z',
          updated_at: '2026-06-14T10:02:00.000Z',
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

  it('renders persisted business clauses from the bridge state', async () => {
    renderPage();

    expect(await screen.findByText('付款方式：验收合格后 30 日内支付合同价款。')).toBeInTheDocument();
    expect(screen.getByText('来源：招标文件.docx')).toBeInTheDocument();
    expect(screen.getByDisplayValue('响应付款方式要求。')).toBeInTheDocument();
    expect(screen.getByDisplayValue('张三')).toBeInTheDocument();
    expect(screen.getByDisplayValue('李四')).toBeInTheDocument();
    expect(screen.getByText(/AI 提取：已完成 · 100%/)).toBeInTheDocument();
    expect(screen.getByText('分项报价表.xlsx')).toBeInTheDocument();
    expect(screen.getByDisplayValue('报价负责人')).toBeInTheDocument();
    expect(screen.getByDisplayValue('待财务确认最终报价')).toBeInTheDocument();
  });

  it('starts matrix generation from the technical plan tender document', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '从技术方案生成矩阵' }));

    await waitFor(() => {
      expect(window.yibiao?.businessBid.importFromTechnicalPlan).toHaveBeenCalled();
      expect(trackBusinessBidAction).toHaveBeenCalledWith('generate_matrix_from_technical_plan');
    });
  });

  it('imports an independent business bid tender document', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '导入商务标招标文件' }));

    await waitFor(() => {
      expect(window.yibiao?.businessBid.importTenderDocument).toHaveBeenCalled();
      expect(trackBusinessBidAction).toHaveBeenCalledWith('import_tender_document');
    });
  });

  it('imports and edits independent business bid attachments through the bridge', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '导入报价附件' }));

    await waitFor(() => {
      expect(window.yibiao?.businessBid.importAttachments).toHaveBeenCalledWith({ kind: 'quote' });
    });

    const ownerInput = screen.getByDisplayValue('报价负责人');
    fireEvent.change(ownerInput, { target: { value: '财务经理' } });
    fireEvent.blur(ownerInput);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.updateAttachment).toHaveBeenCalledWith('attachment-001', { owner: '财务经理' });
    });

    const noteInput = screen.getByDisplayValue('待财务确认最终报价');
    fireEvent.change(noteInput, { target: { value: '已确认最终报价' } });
    fireEvent.blur(noteInput);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.updateAttachment).toHaveBeenCalledWith('attachment-001', { note: '已确认最终报价' });
    });

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(window.yibiao?.businessBid.deleteAttachment).toHaveBeenCalledWith('attachment-001');
    });
  });

  it('enhances the business response matrix with AI extraction', async () => {
    renderPage();

    const enhanceButton = await screen.findByRole('button', { name: 'AI 结构化提取' });
    fireEvent.click(enhanceButton);

    await waitFor(() => {
      expect(window.yibiao?.tasks.startBusinessBidAiExtraction).toHaveBeenCalledWith({});
      expect(trackBusinessBidAction).toHaveBeenCalledWith('start_ai_extraction');
    });
  });

  it('exports the business bid delivery package from the current matrix', async () => {
    renderPage();

    const exportButton = await screen.findByRole('button', { name: '导出 Markdown' });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.exportReport).toHaveBeenCalled();
      expect(trackBusinessBidAction).toHaveBeenCalledWith('export_markdown');
    });
  });

  it('exports Word and Excel business bid delivery files', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '导出 Word' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }));

    await waitFor(() => {
      expect(window.yibiao?.businessBid.exportOfficePackage).toHaveBeenCalledWith({ format: 'docx' });
      expect(window.yibiao?.businessBid.exportOfficePackage).toHaveBeenCalledWith({ format: 'xlsx' });
      expect(trackBusinessBidAction).toHaveBeenCalledWith('export_word');
      expect(trackBusinessBidAction).toHaveBeenCalledWith('export_excel');
    });
  });

  it('saves clause owner and confirmer through the bridge', async () => {
    renderPage();

    const ownerInput = await screen.findByDisplayValue('张三');
    fireEvent.change(ownerInput, { target: { value: '王五' } });
    fireEvent.blur(ownerInput);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.updateClause).toHaveBeenCalledWith('business-001', { owner: '王五' });
    });

    const confirmerInput = screen.getByDisplayValue('李四');
    fireEvent.change(confirmerInput, { target: { value: '赵六' } });
    fireEvent.blur(confirmerInput);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.updateClause).toHaveBeenCalledWith('business-001', { confirmedBy: '赵六' });
    });
  });

  it('tracks clause confirmation without sending clause content', async () => {
    renderPage();

    const confirmedToggle = await screen.findByRole('checkbox', { name: '已确认' });
    fireEvent.click(confirmedToggle);

    await waitFor(() => {
      expect(window.yibiao?.businessBid.updateClause).toHaveBeenCalledWith('business-001', { confirmed: true });
      expect(trackBusinessBidAction).toHaveBeenCalledWith('confirm_clause');
    });
  });
});
