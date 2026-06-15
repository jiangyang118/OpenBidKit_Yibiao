import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeveloperTestPage from './DeveloperTestPage';

function mockAiBridge(result: unknown = { ok: true }, options: { savedSamples?: unknown[]; replayLogs?: unknown[]; rejectRequest?: boolean } = {}) {
  const requestJson = options.rejectRequest
    ? vi.fn().mockRejectedValue(result)
    : vi.fn().mockResolvedValue(result);
  const listJsonFailureSamples = vi.fn().mockResolvedValue({ success: true, samples: options.savedSamples || [] });
  const listJsonReplayLogs = vi.fn().mockResolvedValue({ success: true, logs: options.replayLogs || [] });
  const saveJsonFailureSample = vi.fn().mockResolvedValue({
    success: true,
    samples: [{
      id: 'sample-saved',
      created_at: '2026-06-15T10:00:00.000Z',
      scenario_id: 'rejection-final',
      scenario_label: '废标项检查 JSON 定稿',
      schema_name: 'rejection-findings',
      target_description: '废标项检查定稿 JSON',
      invalid_content: '{"findings":[]}',
      issues: ['模型返回无效 JSON'],
      error_message: '模型返回无效 JSON',
    }],
  });
  const clearJsonFailureSamples = vi.fn().mockResolvedValue({ success: true, samples: [] });
  window.yibiao = ({
    ai: {
      requestJson,
      listJsonFailureSamples,
      listJsonReplayLogs,
      saveJsonFailureSample,
      clearJsonFailureSamples,
    },
  } as unknown) as typeof window.yibiao;
  return { requestJson, listJsonFailureSamples, listJsonReplayLogs, saveJsonFailureSample, clearJsonFailureSamples };
}

describe('DeveloperTestPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders a generic JSON lab with expanded real prompt scenarios', () => {
    render(<DeveloperTestPage />);

    expect(screen.getByRole('heading', { name: 'Json请求测试' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '目录生成' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '全局事实' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '废标项检查' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '商务标条款' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '投标机会' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 评标' })).toBeInTheDocument();
    expect(screen.getByText('变量注入后的消息')).toBeInTheDocument();
    expect(screen.getByText(/"schemaName": "outline"/)).toBeInTheDocument();
    expect(screen.getAllByText(/"outline"/).length).toBeGreaterThan(0);
  });

  it('switches to global facts and shows groups schema with injected prompt content', () => {
    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '全局事实' }));

    expect(screen.getByRole('tab', { name: '全局事实' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/"schemaName": "global-facts"/)).toBeInTheDocument();
    expect(screen.getAllByText(/"groups"/).length).toBeGreaterThan(0);
    expect(screen.getByText(/后续正文需要全文保持一致的关键变量/)).toBeInTheDocument();
  });

  it('switches to business bid clause extraction and shows clause schema', () => {
    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '商务标条款' }));

    expect(screen.getByRole('tab', { name: '商务标条款' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/"schemaName": "BusinessBidClauseExtraction"/)).toBeInTheDocument();
    expect(screen.getAllByText(/"clauses"/).length).toBeGreaterThan(0);
    expect(screen.getByText(/投标人须在投标截止前提交履约保证金保函/)).toBeInTheDocument();
  });

  it('switches to bid opportunity and AI evaluation JSON schemas', () => {
    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '投标机会' }));
    expect(screen.getByText(/"schemaName": "BidOpportunityAnnouncementParsing"/)).toBeInTheDocument();
    expect(screen.getByText(/智慧园区综合运维平台采购项目/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'AI 评标' }));
    expect(screen.getByText(/"schemaName": "AiEvaluationItemExtraction"/)).toBeInTheDocument();
    expect(screen.getAllByText(/"items"/).length).toBeGreaterThan(0);
  });

  it('runs the selected JSON scenario through aiClient.requestJson', async () => {
    const { requestJson } = mockAiBridge({
      findings: [
        {
          type: 'invalidBid',
          severity: 'high',
          title: '报价超预算',
        },
      ],
    });

    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '废标项检查' }));
    fireEvent.click(screen.getByRole('button', { name: '运行 JSON 请求' }));

    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    const request = requestJson.mock.calls[0][0];
    expect(request.schemaName).toBe('rejection-findings');
    expect(request.logTitle).toBe('开发者 JSON 实验室-废标项检查');
    expect(JSON.stringify(request.messages)).toContain('第三轮：补充与定稿');
    await waitFor(() => expect(screen.getAllByText(/报价超预算/).length).toBeGreaterThan(0));
    expect(screen.getByText(/JSON 请求完成/)).toBeInTheDocument();
  });

  it('runs the business bid JSON scenario through aiClient.requestJson', async () => {
    const { requestJson } = mockAiBridge({
      clauses: [
        {
          category: 'bond',
          originalText: '投标人须在投标截止前提交履约保证金保函。',
        },
      ],
    });

    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '商务标条款' }));
    fireEvent.click(screen.getByRole('button', { name: '运行 JSON 请求' }));

    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    const request = requestJson.mock.calls[0][0];
    expect(request.schemaName).toBe('BusinessBidClauseExtraction');
    expect(request.logTitle).toBe('开发者 JSON 实验室-商务标条款');
    expect(JSON.stringify(request.messages)).toContain('商务响应矩阵');
    await waitFor(() => expect(screen.getAllByText(/履约保证金保函/).length).toBeGreaterThan(0));
  });

  it('replays JSON repair samples with the shared repair prompt', async () => {
    const { requestJson } = mockAiBridge({
      outline: [
        {
          id: '1',
          title: '实施方案',
          description: '覆盖 1. 项目理解',
          children: [],
        },
      ],
    });

    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('button', { name: '回放修复样本' }));

    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    const request = requestJson.mock.calls[0][0];
    expect(request.schemaName).toBe('outline-repair');
    expect(request.temperature).toBe(0);
    expect(JSON.stringify(request.messages)).toContain('严格的 JSON 修复助手');
    expect(JSON.stringify(request.messages)).toContain('非法反斜杠转义');
    expect(await screen.findByText(/覆盖 1. 项目理解/)).toBeInTheDocument();
    expect(screen.getByText(/JSON 修复回放完成/)).toBeInTheDocument();
  });

  it('loads saved failure samples and replays them through the repair prompt', async () => {
    const { requestJson, listJsonFailureSamples } = mockAiBridge({ fixed: true }, {
      savedSamples: [{
        id: 'sample-1',
        created_at: '2026-06-15T10:00:00.000Z',
        scenario_id: 'outline',
        scenario_label: '目录生成 JSON',
        schema_name: 'outline',
        target_description: '技术方案目录 JSON',
        invalid_content: '{"outline":[{"title":"坏 JSON\\样本"}]}',
        issues: ['非法反斜杠转义'],
        error_message: '上次请求返回非法 JSON',
      }],
    });

    render(<DeveloperTestPage />);

    expect(await screen.findByText('已保存失败样本')).toBeInTheDocument();
    expect(await screen.findByText('上次请求返回非法 JSON')).toBeInTheDocument();
    expect(listJsonFailureSamples).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '回放保存样本' }));

    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    const request = requestJson.mock.calls[0][0];
    expect(request.schemaName).toBe('outline-repair');
    expect(JSON.stringify(request.messages)).toContain('坏 JSON');
  });

  it('persists a replayable failure sample when the JSON request fails', async () => {
    const { requestJson, saveJsonFailureSample } = mockAiBridge(new Error('模型返回无效 JSON'), { rejectRequest: true });

    render(<DeveloperTestPage />);

    fireEvent.click(screen.getByRole('tab', { name: '废标项检查' }));
    fireEvent.click(screen.getByRole('button', { name: '运行 JSON 请求' }));

    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveJsonFailureSample).toHaveBeenCalledTimes(1));
    const sample = saveJsonFailureSample.mock.calls[0][0];
    expect(sample.scenario_id).toBe('rejection-final');
    expect(sample.schema_name).toBe('rejection-findings');
    expect(sample.invalid_content).toContain('承诺函缺失');
    expect(await screen.findByText(/失败样本已保存/)).toBeInTheDocument();
  });

  it('loads developer JSON replay logs and can save one as a failure sample', async () => {
    const { requestJson, listJsonReplayLogs, saveJsonFailureSample } = mockAiBridge({ fixed: true }, {
      replayLogs: [{
        id: 'log-1',
        created_at: '2026-06-15T10:00:00.000Z',
        log_title: '开发者 JSON 实验室-目录生成',
        type: 'chat',
        request_mode: 'normal',
        content_preview: '{"outline":[{"title":"坏 JSON"}]}',
        invalid_content: '{"outline":[{"title":"坏 JSON"}]}',
        issues: ['来自开发者 AI 日志：请人工确认 JSON 校验问题。'],
      }],
    });

    render(<DeveloperTestPage />);

    expect(await screen.findByText('开发者日志回放')).toBeInTheDocument();
    expect(await screen.findByText('开发者 JSON 实验室-目录生成')).toBeInTheDocument();
    expect(listJsonReplayLogs).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存为失败样本' }));
    await waitFor(() => expect(saveJsonFailureSample).toHaveBeenCalledTimes(1));
    const savedSample = saveJsonFailureSample.mock.calls[0][0];
    expect(savedSample.scenario_id).toBe('outline');
    expect(savedSample.invalid_content).toContain('坏 JSON');

    fireEvent.click(screen.getByRole('button', { name: '回放日志内容' }));
    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    expect(requestJson.mock.calls[0][0].schemaName).toBe('outline-repair');
  });
});
