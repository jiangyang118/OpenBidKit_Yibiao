import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentParseNoticeProvider, ToastProvider } from '../../../shared/ui';
import type { DuplicateCheckWorkspaceState } from '../../../shared/types';
import DuplicateCheckPage from './DuplicateCheckPage';

const bidFile = {
  id: 'bid-1',
  file_name: '投标文件A.docx',
  file_path: '/tmp/投标文件A.docx',
  extension: '.docx',
  size: 1024,
  modified_at: '2026-06-14T10:00:00.000Z',
};

const secondBidFile = {
  id: 'bid-2',
  file_name: '投标文件B.docx',
  file_path: '/tmp/投标文件B.docx',
  extension: '.docx',
  size: 1200,
  modified_at: '2026-06-14T10:05:00.000Z',
};

const baseState: DuplicateCheckWorkspaceState = {
  tenderFile: null,
  bidFiles: [bidFile],
  step: 'analysis',
  activeAnalysisTab: 'content',
  metadataAnalysis: {
    status: 'success',
    progress: 100,
    message: '元数据分析完成',
    signature: 'test-signature',
    contentExtraction: { status: 'success', completed: 1, total: 1 },
    metadataExtraction: { status: 'success', completed: 1, total: 1 },
    files: [],
    rows: [],
    contentFiles: [],
  },
  outlineAnalysis: {
    status: 'success',
    progress: 100,
    message: '目录分析完成',
    signature: 'test-signature',
    tenderSentenceCount: 0,
    tenderMatchedItemCount: 0,
    extraction: { status: 'success', completed: 1, total: 1 },
    files: [],
    duplicateGroups: [],
    pairwiseSimilarities: [],
  },
  contentAnalysis: {
    status: 'success',
    progress: 100,
    message: '正文比对完成',
    signature: 'test-signature',
    tenderSentenceCount: 0,
    tenderMatchedSentenceCount: 0,
    totalSentenceCount: 2,
    extraction: { status: 'success', completed: 1, total: 1 },
    duplicateSentences: [
      {
        id: 'C000001',
        sentence: '项目团队提供驻场服务。',
        normalized: '项目团队提供驻场服务。',
        file_ids: ['bid-1'],
        occurrences: { 'bid-1': 2 },
        first_order: 1,
        resolution_status: 'pending',
      },
      {
        id: 'C000002',
        sentence: '应急响应固定话术。',
        normalized: '应急响应固定话术。',
        file_ids: ['bid-1'],
        occurrences: { 'bid-1': 1 },
        first_order: 2,
        resolution_status: 'ignored',
      },
    ],
  },
  imageAnalysis: {
    status: 'success',
    progress: 100,
    message: '图片比对完成',
    signature: 'test-signature',
    extraction: { status: 'success', completed: 1, total: 1 },
    totalImageCount: 0,
    files: [],
    duplicateImages: [],
  },
  contentIgnoreRules: [],
};

function renderPage() {
  return render(
    <Tooltip.Provider>
      <ToastProvider>
        <DocumentParseNoticeProvider>
          <DuplicateCheckPage />
        </DocumentParseNoticeProvider>
      </ToastProvider>
    </Tooltip.Provider>,
  );
}

describe('DuplicateCheckPage resolution actions', () => {
  beforeEach(() => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({}),
      },
      duplicateCheck: {
        loadState: vi.fn().mockResolvedValue(baseState),
        saveUiState: vi.fn().mockResolvedValue(baseState),
        saveFiles: vi.fn(),
        updateState: vi.fn(),
        exportReport: vi.fn().mockResolvedValue({ success: true, message: '标书查重报告已导出', filePath: '/tmp/report.md', markdownChars: 1200 }),
        exportContentIgnoreRules: vi.fn().mockResolvedValue({ success: true, message: '已导出 1 条正文忽略规则', filePath: '/tmp/rules.json', ruleCount: 1 }),
        importContentIgnoreRules: vi.fn().mockResolvedValue({
          success: true,
          message: '已导入 1 条正文忽略规则',
          filePath: '/tmp/rules.json',
          importedCount: 1,
          skippedCount: 0,
          state: {
            ...baseState,
            contentIgnoreRules: [{
              rule_id: 'RULE-IMPORT',
              pattern: '导入固定模板句。',
              normalized: '导入固定模板句。',
              category: 'boilerplate',
              created_at: '2026-06-15T00:00:00.000Z',
              updated_at: '2026-06-15T00:00:00.000Z',
            }],
          },
        }),
        resolveItem: vi.fn().mockResolvedValue({
          ...baseState,
          contentAnalysis: {
            ...baseState.contentAnalysis,
            duplicateSentences: baseState.contentAnalysis?.duplicateSentences.map((item) => (
              item.id === 'C000001' ? { ...item, resolution_status: 'confirmed' } : item
            )),
          },
        }),
        batchHandleItems: vi.fn().mockResolvedValue({
          ...baseState,
          contentAnalysis: {
            ...baseState.contentAnalysis,
            duplicateSentences: baseState.contentAnalysis?.duplicateSentences.map((item) => (
              item.id === 'C000001' ? { ...item, resolution_status: 'ignored' } : item
            )),
          },
        }),
        saveContentIgnoreRule: vi.fn().mockResolvedValue({
          ...baseState,
          contentIgnoreRules: [{
            rule_id: 'RULE-001',
            pattern: '项目团队提供驻场服务。',
            normalized: '项目团队提供驻场服务。',
            category: 'boilerplate',
            created_at: '2026-06-15T00:00:00.000Z',
            updated_at: '2026-06-15T00:00:00.000Z',
          }],
          contentAnalysis: {
            ...baseState.contentAnalysis,
            duplicateSentences: baseState.contentAnalysis?.duplicateSentences.map((item) => (
              item.id === 'C000001' ? { ...item, resolution_status: 'ignored' } : item
            )),
          },
        }),
        deleteContentIgnoreRule: vi.fn().mockResolvedValue(baseState),
        clear: vi.fn(),
      },
      tasks: {
        onTaskEvent: vi.fn().mockReturnValue(vi.fn()),
        getActiveTasks: vi.fn().mockResolvedValue([]),
        startDuplicateAnalysis: vi.fn().mockResolvedValue({}),
      },
      file: {
        selectDuplicateCheckFiles: vi.fn(),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('hides ignored content duplicates and persists confirmed status', async () => {
    renderPage();

    expect(await screen.findByText('项目团队提供驻场服务。')).toBeInTheDocument();
    expect(screen.queryByText(/后续接入查重任务/)).not.toBeInTheDocument();
    expect(screen.queryByText('应急响应固定话术。')).not.toBeInTheDocument();
    expect(screen.getByText('未处理')).toBeInTheDocument();
    expect(screen.getByText(/已忽略 1 条/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认重复' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.resolveItem).toHaveBeenCalledWith({
        section: 'content',
        itemId: 'C000001',
        status: 'confirmed',
      });
    });

    expect(await screen.findByText('已确认')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.exportReport).toHaveBeenCalledWith({ format: 'md' });
    });

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.exportReport).toHaveBeenCalledWith({ format: 'docx' });
    });

    fireEvent.click(screen.getByRole('button', { name: '导出 PDF' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.exportReport).toHaveBeenCalledWith({ format: 'pdf' });
    });
  });

  it('batch ignores current visible duplicate content items', async () => {
    renderPage();

    expect(await screen.findByText('项目团队提供驻场服务。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量确认当前结果 1' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '批量忽略当前结果 1' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.batchHandleItems).toHaveBeenCalledWith({
        section: 'content',
        itemIds: ['C000001'],
        action: 'resolve',
        status: 'ignored',
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('项目团队提供驻场服务。')).not.toBeInTheDocument();
    });
  });

  it('saves current duplicate sentence as a reusable ignore rule', async () => {
    renderPage();

    expect(await screen.findByText('项目团队提供驻场服务。')).toBeInTheDocument();
    expect(screen.getByText('已保存 0 条；重新查重时相同正文会自动标为已忽略。')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('正文忽略规则分类'), { target: { value: 'boilerplate' } });
    fireEvent.click(screen.getByRole('button', { name: '加入忽略规则' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.saveContentIgnoreRule).toHaveBeenCalledWith({
        pattern: '项目团队提供驻场服务。',
        normalized: '项目团队提供驻场服务。',
        category: 'boilerplate',
      });
    });

    expect(await screen.findByText('已保存 1 条；重新查重时相同正文会自动标为已忽略。')).toBeInTheDocument();
    expect(screen.getAllByText('固定模板').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '删除忽略规则 项目团队提供驻场服务。' })).toBeInTheDocument();
  });

  it('exports and imports content ignore rules', async () => {
    const ruleState: DuplicateCheckWorkspaceState = {
      ...baseState,
      contentIgnoreRules: [{
        rule_id: 'RULE-001',
        pattern: '固定模板声明。',
        normalized: '固定模板声明。',
        category: 'boilerplate',
        created_at: '2026-06-15T00:00:00.000Z',
        updated_at: '2026-06-15T00:00:00.000Z',
      }],
    };
    vi.mocked(window.yibiao!.duplicateCheck.loadState).mockResolvedValueOnce(ruleState);

    renderPage();

    expect(await screen.findByText('固定模板声明。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '导出规则' }));
    fireEvent.click(screen.getByRole('button', { name: '导入规则' }));

    await waitFor(() => {
      expect(window.yibiao?.duplicateCheck.exportContentIgnoreRules).toHaveBeenCalled();
      expect(window.yibiao?.duplicateCheck.importContentIgnoreRules).toHaveBeenCalled();
    });
    expect(await screen.findByText('导入固定模板句。')).toBeInTheDocument();
  });

  it('shows similar image evidence and similarity score', async () => {
    const imageState: DuplicateCheckWorkspaceState = {
      ...baseState,
      bidFiles: [bidFile, secondBidFile],
      activeAnalysisTab: 'image',
      imageAnalysis: {
        status: 'success',
        progress: 100,
        message: '图片比对完成',
        signature: 'test-signature',
        extraction: { status: 'success', completed: 2, total: 2 },
        totalImageCount: 2,
        files: [],
        duplicateImages: [
          {
            id: 'IMG-002',
            hash: 'similar-001',
            preview_url: 'data:image/png;base64,iVBORw0KGgo=',
            file_ids: ['bid-1', 'bid-2'],
            occurrences: { 'bid-1': 1, 'bid-2': 1 },
            match_type: 'similar',
            similarity_score: 0.9375,
            similarity_reason: '感知哈希相似度 94%，疑似压缩、缩放或截图后复用',
            resolution_status: 'pending',
          },
        ],
      },
    };
    vi.mocked(window.yibiao!.duplicateCheck.loadState).mockResolvedValueOnce(imageState);
    vi.mocked(window.yibiao!.duplicateCheck.saveUiState).mockResolvedValue(imageState);

    renderPage();

    expect(await screen.findByText(/相似图片 similar-001/)).toBeInTheDocument();
    expect(screen.getByText('相似度 94%')).toBeInTheDocument();
    expect(screen.getByText('感知哈希相似度 94%，疑似压缩、缩放或截图后复用')).toBeInTheDocument();
  });
});
