import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { BidOpportunityState } from '../types';
import BidOpportunityPage from './BidOpportunityPage';

const existingState: BidOpportunityState = {
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
      knowledgeMatches: [
        {
          itemId: 'item-1',
          title: '智慧园区历史业绩',
          resume: '可复用为类似项目业绩。',
          sourceFile: '历史项目.md',
          score: 48,
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
          contactPerson: '代理王经理',
          content: '确认答疑文件发布时间。',
          nextAction: '补充授权文件',
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
      risks: [],
      recommendation: '建议重点跟进',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <BidOpportunityPage />
    </ToastProvider>,
  );
}

describe('BidOpportunityPage', () => {
  beforeEach(() => {
    window.yibiao = ({
      bidOpportunity: {
        loadState: vi.fn().mockResolvedValue(existingState),
        saveOpportunity: vi.fn().mockResolvedValue(existingState),
        saveOpportunityWithAi: vi.fn().mockResolvedValue(existingState),
        importDocument: vi.fn().mockResolvedValue({ success: true, message: '公告文件已导入并生成投标机会', state: existingState }),
        importUrl: vi.fn().mockResolvedValue({ success: true, message: '公告 URL 已读取并生成投标机会', state: existingState }),
        updateStatus: vi.fn().mockResolvedValue(existingState),
        updateFollowUp: vi.fn().mockResolvedValue(existingState),
        addFollowUpRecord: vi.fn().mockResolvedValue(existingState),
        updateFollowUpRecord: vi.fn().mockResolvedValue(existingState),
        deleteFollowUpRecord: vi.fn().mockResolvedValue(existingState),
        importAttachments: vi.fn().mockResolvedValue({ success: true, message: '已导入 1 个投标机会附件', state: existingState }),
        updateAttachment: vi.fn().mockResolvedValue(existingState),
        deleteAttachment: vi.fn().mockResolvedValue(existingState),
        deleteOpportunity: vi.fn().mockResolvedValue({ opportunities: [], activeOpportunityId: null }),
        exportReport: vi.fn().mockResolvedValue({ success: true, message: '投标机会建议报告已导出', filePath: '/tmp/opportunity.md', markdownChars: 1200 }),
        exportCalendar: vi.fn().mockResolvedValue({ success: true, message: '投标机会提醒日历已导出', filePath: '/tmp/opportunity.ics', calendarChars: 900, eventCount: 1 }),
        clear: vi.fn().mockResolvedValue({ opportunities: [], activeOpportunityId: null }),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders persisted opportunities from the bridge state', async () => {
    renderPage();

    expect(await screen.findAllByText('产业园智慧运维平台建设项目')).not.toHaveLength(0);
    expect(screen.getAllByText('建议重点跟进')).not.toHaveLength(0);
    expect(screen.getAllByText('广东省深圳市')).not.toHaveLength(0);
    expect(screen.getByLabelText('负责人')).toHaveValue('张三');
    expect(screen.getByLabelText('下一步动作')).toHaveValue('确认本地化服务承诺');
    expect(screen.getByText('智慧园区历史业绩')).toBeInTheDocument();
    expect(screen.getByText(/命中：智慧、园区、业绩/)).toBeInTheDocument();
    expect(screen.getByText('确认答疑文件发布时间。')).toBeInTheDocument();
    expect(screen.getByText('代理沟通纪要.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('评分拆解')).toBeInTheDocument();
    expect(screen.getByText('竞争强度')).toBeInTheDocument();
    expect(screen.getByText('利润空间')).toBeInTheDocument();
    expect(screen.getByText('工期可控性')).toBeInTheDocument();
    expect(screen.getByText('历史中标相似度')).toBeInTheDocument();
  });

  it('focuses one opportunity panel from the top display buttons', async () => {
    renderPage();

    await screen.findAllByText('产业园智慧运维平台建设项目');
    fireEvent.click(screen.getByRole('button', { name: /看板全屏/ }));

    const workspace = document.querySelector('.opportunity-workspace-grid');
    expect(workspace).toHaveClass('is-focused-list');
    expect(screen.getByLabelText('机会看板面板')).toHaveClass('is-focused');
    expect(screen.getByLabelText('公告录入面板')).toHaveClass('is-hidden-by-focus');
    expect(screen.getByLabelText('机会详情面板')).toHaveClass('is-hidden-by-focus');

    fireEvent.click(screen.getByRole('button', { name: /看板全屏/ }));
    expect(workspace).not.toHaveClass('is-focused-list');
  });

  it('collapses and expands opportunity panels', async () => {
    renderPage();

    const inputPanel = await screen.findByLabelText('公告录入面板');
    fireEvent.click(within(inputPanel).getByRole('button', { name: '收起' }));

    expect(inputPanel).toHaveClass('is-collapsed');

    fireEvent.click(within(inputPanel).getByRole('button', { name: '展开' }));
    expect(inputPanel).toHaveClass('is-expanded');
  });

  it('saves announcement text through the bridge', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('公告原文'), {
      target: { value: '项目名称：医院后勤一体化服务\n预算金额：800万元' },
    });
    fireEvent.click(screen.getByRole('button', { name: '规则解析保存' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.saveOpportunity).toHaveBeenCalledWith({
        title: '',
        sourceText: '项目名称：医院后勤一体化服务\n预算金额：800万元',
      });
    });
  });

  it('saves announcement text with AI parsing through the bridge', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('公告原文'), {
      target: { value: '项目名称：智慧医院平台\n预算金额：1500万元' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 解析并保存' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.saveOpportunityWithAi).toHaveBeenCalledWith({
        title: '',
        sourceText: '项目名称：智慧医院平台\n预算金额：1500万元',
      });
    });
  });

  it('imports an announcement document through the bridge', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '导入公告文件' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.importDocument).toHaveBeenCalled();
    });
  });

  it('imports an announcement URL through the bridge', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('公告 URL'), {
      target: { value: 'https://example.com/notice' },
    });
    fireEvent.click(screen.getByRole('button', { name: '读取公告 URL' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.importUrl).toHaveBeenCalledWith({ url: 'https://example.com/notice' });
    });
  });

  it('exports the bid opportunity recommendation report', async () => {
    renderPage();

    const exportButton = await screen.findByRole('button', { name: '导出投标建议报告' });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.exportReport).toHaveBeenCalled();
    });
  });

  it('exports the bid opportunity reminder calendar', async () => {
    renderPage();

    const exportButton = await screen.findByRole('button', { name: '导出提醒日历' });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.exportCalendar).toHaveBeenCalled();
    });
  });

  it('saves follow-up owner, next action and reminder fields', async () => {
    renderPage();

    const ownerInput = await screen.findByLabelText('负责人');
    fireEvent.change(ownerInput, { target: { value: '李四' } });
    fireEvent.blur(ownerInput);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.updateFollowUp).toHaveBeenCalledWith('opp-1', {
        owner: '李四',
        nextAction: '确认本地化服务承诺',
        reminderAt: '2026-07-01T09:30',
      });
    });

    const actionInput = screen.getByLabelText('下一步动作');
    fireEvent.change(actionInput, { target: { value: '预约投标评审会' } });
    fireEvent.blur(actionInput);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.updateFollowUp).toHaveBeenCalledWith('opp-1', {
        owner: '张三',
        nextAction: '预约投标评审会',
        reminderAt: '2026-07-01T09:30',
      });
    });

    const reminderInput = screen.getByLabelText('提醒时间');
    fireEvent.change(reminderInput, { target: { value: '2026-07-02T14:00' } });
    fireEvent.blur(reminderInput);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.updateFollowUp).toHaveBeenCalledWith('opp-1', {
        owner: '张三',
        nextAction: '确认本地化服务承诺',
        reminderAt: '2026-07-02T14:00',
      });
    });
  });

  it('adds and deletes multi-round follow-up records through the bridge', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('方式'), { target: { value: 'meeting' } });
    fireEvent.change(screen.getByLabelText('跟进负责人'), { target: { value: '李四' } });
    fireEvent.change(screen.getByLabelText('沟通对象'), { target: { value: '采购代理王经理' } });
    fireEvent.change(screen.getByLabelText('下次跟进'), { target: { value: '2026-07-03T10:00' } });
    fireEvent.change(screen.getByLabelText('本次沟通记录'), { target: { value: '确认答疑文件发布时间。' } });
    fireEvent.change(screen.getByLabelText('记录下一步动作'), { target: { value: '补充授权文件' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.addFollowUpRecord).toHaveBeenCalledWith('opp-1', {
        method: 'meeting',
        content: '确认答疑文件发布时间。',
        nextAction: '补充授权文件',
        nextFollowUpAt: '2026-07-03T10:00',
        owner: '李四',
        contactPerson: '采购代理王经理',
      });
    });

    const followUpPanel = screen.getByLabelText('多轮跟进记录');
    fireEvent.click(within(followUpPanel).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.deleteFollowUpRecord).toHaveBeenCalledWith('follow-1');
    });
  });

  it('imports, updates and deletes bid opportunity attachments through the bridge', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '导入附件' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.importAttachments).toHaveBeenCalledWith('opp-1', { kind: 'announcement' });
    });

    const kindSelect = screen.getByDisplayValue('沟通附件');
    fireEvent.change(kindSelect, { target: { value: 'qualification' } });

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.updateAttachment).toHaveBeenCalledWith('attachment-1', { kind: 'qualification' });
    });

    const noteInput = screen.getByPlaceholderText('附件说明');
    fireEvent.change(noteInput, { target: { value: '已更新附件说明' } });
    fireEvent.blur(noteInput);

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.updateAttachment).toHaveBeenCalledWith('attachment-1', { note: '已更新附件说明' });
    });

    const attachmentPanel = screen.getByLabelText('公告和沟通附件');
    fireEvent.click(within(attachmentPanel).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(window.yibiao?.bidOpportunity.deleteAttachment).toHaveBeenCalledWith('attachment-1');
    });
  });
});
