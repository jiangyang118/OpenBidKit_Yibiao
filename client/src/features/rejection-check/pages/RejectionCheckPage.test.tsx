import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentParseNoticeProvider, ToastProvider } from '../../../shared/ui';
import type { RejectionCheckWorkspaceState, RejectionDocumentContent } from '../types';
import RejectionCheckPage from './RejectionCheckPage';

const tenderDocument: RejectionDocumentContent = {
  id: 'tender',
  role: 'tender',
  fileName: '招标文件.docx',
  content: '## 废标项\n未按要求提供授权书将被否决投标。',
  source: 'upload',
  importedAt: '2026-06-14T10:00:00.000Z',
};

const bidDocument: RejectionDocumentContent = {
  id: 'bid-1',
  role: 'bid',
  fileName: '投标文件A.docx',
  content: '## 授权文件\n授权书将在中标后补充。',
  source: 'upload',
  importedAt: '2026-06-14T10:05:00.000Z',
};

function createDocumentSignature(document: RejectionDocumentContent | null) {
  if (!document) return '';
  const content = document.content.trim();
  const signatureId = document.role === 'bid' && document.id === 'bid-1' ? 'bid' : document.id || document.role;
  return [
    signatureId,
    document.source,
    document.fileName,
    content.length,
    content.slice(0, 800),
    content.slice(-800),
  ].join('\n---yibiao-rejection-signature---\n');
}

function createBidDocumentsSignature(documents: RejectionDocumentContent[]) {
  return documents.map(createDocumentSignature).filter(Boolean).join('\n---yibiao-rejection-bid-signature---\n');
}

function createRejectionCheckInputSignature(
  bidDocuments: RejectionDocumentContent[],
  invalidBidAndRejectionItems: string,
  customCheckItems: string,
) {
  const bidSignature = bidDocuments.map(createDocumentSignature).filter(Boolean).join('\n---yibiao-rejection-bid-document---\n');
  const analysis = invalidBidAndRejectionItems.trim();
  if (!bidSignature || !analysis) return '';
  const custom = customCheckItems.trim();
  return [
    bidSignature,
    analysis.length,
    analysis.slice(0, 800),
    analysis.slice(-800),
    custom.length,
    custom.slice(0, 800),
    custom.slice(-800),
  ].join('\n---yibiao-rejection-check-input---\n');
}

const extractionContent = '- 未按要求提供授权书将被否决投标。';
const bidDocuments = [bidDocument];
const baseState: RejectionCheckWorkspaceState = {
  tenderDocument,
  bidDocuments,
  activeDocumentTab: 'tender',
  step: 'results',
  activeResultTab: 'analysis',
  activeCheckResultTab: 'rejection',
  invalidBidAndRejectionItems: {
    status: 'success',
    content: extractionContent,
    source: 'ai',
    tenderSignature: createDocumentSignature(tenderDocument),
    updatedAt: '2026-06-14T10:10:00.000Z',
  },
  customCheckItems: '',
  checkOptions: { rejectionCheck: true, typoCheck: true, logicCheck: true },
  rejectionCheckResult: {
    status: 'success',
    inputSignature: createRejectionCheckInputSignature(bidDocuments, extractionContent, ''),
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
        id: 'risk-2',
        bidDocumentId: 'bid-1',
        type: 'rejectionItem',
        severity: 'medium',
        title: '已处理的页码格式问题',
        summary: '该项已人工确认无需处理',
        requirement: '页码格式需统一。',
        bidEvidence: '目录页码样式不同。',
        riskReason: '人工判断不影响响应。',
        suggestion: '无需修改。',
        resolution_status: 'ignored',
        resolved_at: '2026-06-14T10:20:00.000Z',
      },
    ],
  },
  typoCheckResult: {
    status: 'success',
    inputSignature: createBidDocumentsSignature(bidDocuments),
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
    inputSignature: createBidDocumentsSignature(bidDocuments),
    findings: [
      {
        id: 'logic-1',
        bidDocumentId: 'bid-1',
        title: '授权书提交时间矛盾',
        originalText: '目录列明已提交授权书，正文又写将在中标后补充。',
        locationHint: '授权文件章节与附件目录',
        fallacyReason: '同一材料的提交状态前后不一致。',
        suggestion: '统一为投标时已提交，或补齐附件。',
      },
    ],
  },
};

function renderPage() {
  return render(
    <Tooltip.Provider>
      <ToastProvider>
        <DocumentParseNoticeProvider>
          <RejectionCheckPage />
        </DocumentParseNoticeProvider>
      </ToastProvider>
    </Tooltip.Provider>,
  );
}

describe('RejectionCheckPage report export', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const ignoredState: RejectionCheckWorkspaceState = {
      ...baseState,
      rejectionCheckResult: {
        status: 'success',
        inputSignature: createRejectionCheckInputSignature(bidDocuments, extractionContent, ''),
        findings: baseState.rejectionCheckResult?.findings.map((finding) => (
          finding.id === 'risk-1'
            ? { ...finding, resolution_status: 'ignored', resolved_at: '2026-06-14T10:30:00.000Z' }
            : finding
        )) || [],
      },
    };
    const deletedState: RejectionCheckWorkspaceState = {
      ...baseState,
      rejectionCheckResult: {
        status: 'success',
        inputSignature: createRejectionCheckInputSignature(bidDocuments, extractionContent, ''),
        findings: baseState.rejectionCheckResult?.findings.filter((finding) => finding.id !== 'risk-1') || [],
      },
    };
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({}),
      },
      rejectionCheck: {
        loadState: vi.fn().mockResolvedValue(baseState),
        importDocument: vi.fn(),
        importTenderFromTechnicalPlan: vi.fn(),
        removeDocument: vi.fn(),
        saveUiState: vi.fn().mockResolvedValue(baseState),
        updateState: vi.fn().mockResolvedValue(baseState),
        resolveFinding: vi.fn().mockResolvedValue(ignoredState),
        batchHandleFindings: vi.fn().mockImplementation((payload: { action: string }) => Promise.resolve(payload.action === 'delete' ? deletedState : ignoredState)),
        exportReport: vi.fn().mockResolvedValue({ success: true, message: '废标项检查报告已导出', filePath: '/tmp/rejection-report.md', markdownChars: 1600 }),
        clear: vi.fn(),
      },
      tasks: {
        onTaskEvent: vi.fn().mockReturnValue(vi.fn()),
        getActiveTasks: vi.fn().mockResolvedValue([]),
        startRejectionItemsExtraction: vi.fn(),
        startRejectionCheck: vi.fn(),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('exports the current rejection check report from the results page', async () => {
    renderPage();

    expect(await screen.findByText('授权书缺失')).toBeInTheDocument();
    expect(screen.queryByText('已处理的页码格式问题')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '显示已忽略 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.exportReport).toHaveBeenCalledWith({ format: 'md' });
    });

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.exportReport).toHaveBeenCalledWith({ format: 'docx' });
    });

    fireEvent.click(screen.getByRole('button', { name: '导出 PDF' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.exportReport).toHaveBeenCalledWith({ format: 'pdf' });
    });

    fireEvent.click(screen.getByRole('button', { name: '忽略授权书缺失' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.resolveFinding).toHaveBeenCalledWith({
        section: 'rejection',
        findingId: 'risk-1',
        status: 'ignored',
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('授权书缺失')).not.toBeInTheDocument();
    });
  });

  it('batch ignores and deletes the currently displayed findings through the bridge', async () => {
    renderPage();

    expect(await screen.findByText('授权书缺失')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量忽略当前结果 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除当前显示 1' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '批量忽略当前结果 1' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.batchHandleFindings).toHaveBeenCalledWith({
        section: 'rejection',
        findingIds: ['risk-1'],
        action: 'resolve',
        status: 'ignored',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '显示已忽略 2' }));
    fireEvent.click(screen.getByRole('button', { name: '删除当前显示 2' }));

    await waitFor(() => {
      expect(window.yibiao?.rejectionCheck.batchHandleFindings).toHaveBeenCalledWith({
        section: 'rejection',
        findingIds: ['risk-1', 'risk-2'],
        action: 'delete',
        status: undefined,
      });
    });
  });

  it('copies rejection, typo, and logic evidence with location context', async () => {
    renderPage();

    expect(await screen.findByText('授权书缺失')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制授权书缺失证据' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('投标文件：投标文件1'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('投标文件证据：授权书将在中标后补充。'));
    });

    fireEvent.click(screen.getByRole('tab', { name: /错别字检查/ }));
    expect(await screen.findByText('授全书')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制授全书所在原文' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('位置线索：授权文件章节第 2 段'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('原文：投标文件承诺授全书将在中标后补充。'));
    });

    fireEvent.click(screen.getByRole('tab', { name: /逻辑谬误检查/ }));
    expect(await screen.findByText('授权书提交时间矛盾')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制授权书提交时间矛盾证据' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('位置线索：授权文件章节与附件目录'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('谬误原因：同一材料的提交状态前后不一致。'));
    });
  });

  it('starts a current bid document recheck without clearing other result scope', async () => {
    renderPage();

    expect(await screen.findByText('授权书缺失')).toBeInTheDocument();
    const bidFilter = screen.getByRole('tablist', { name: '按投标文件筛选结果' });
    fireEvent.click(within(bidFilter).getByRole('button', { name: /投标文件1/ }));
    fireEvent.click(screen.getByRole('button', { name: '重新检查当前投标文件' }));

    await waitFor(() => {
      expect(window.yibiao?.tasks.startRejectionCheck).toHaveBeenCalledWith({
        checkOptions: { rejectionCheck: true, typoCheck: true, logicCheck: true },
        runOptions: { rejectionCheck: true, typoCheck: false, logicCheck: false },
        customCheckItems: '',
        targetBidDocumentIds: ['bid-1'],
      });
    });
  });
});
