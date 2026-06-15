import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentParseNoticeProvider, ToastProvider } from '../../../shared/ui';
import type { KnowledgeDocument } from '../types';
import KnowledgeBasePage from './KnowledgeBasePage';

const activeDocument: KnowledgeDocument = {
  id: 'doc-1',
  folder_id: 'folder-1',
  file_name: '投标素材.docx',
  status: 'matching',
  progress: 72,
  message: 'AI 正在匹配段落 3/5',
  item_count: 0,
  block_count: 36,
  filtered_block_count: 4,
  candidate_item_count: 12,
  created_at: '2026-06-14T10:00:00.000Z',
  updated_at: '2026-06-14T10:05:00.000Z',
};

function renderPage() {
  return render(
    <ToastProvider>
      <DocumentParseNoticeProvider>
        <KnowledgeBasePage />
      </DocumentParseNoticeProvider>
    </ToastProvider>,
  );
}

describe('KnowledgeBasePage active tasks', () => {
  beforeEach(() => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({ developer_mode: true }),
      },
      knowledgeBase: {
        getMigrationStatus: vi.fn().mockResolvedValue({ needsMigration: false, legacyFolderCount: 0, legacyDocumentCount: 0 }),
        list: vi.fn().mockResolvedValue({
          folders: [{ id: 'folder-1', name: '默认知识库', created_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-14T10:00:00.000Z' }],
          documents: [],
        }),
        getActiveTasks: vi.fn().mockResolvedValue({
          tasks: [{ document_id: activeDocument.id, phase: 'matching', document: activeDocument }],
          documents: [activeDocument],
        }),
        createFolder: vi.fn(),
        renameFolder: vi.fn(),
        reorderFolder: vi.fn(),
        deleteFolder: vi.fn(),
        deleteDocument: vi.fn(),
        moveDocument: vi.fn(),
        uploadDocuments: vi.fn(),
        retryDocument: vi.fn(),
        startMatching: vi.fn(),
        readMarkdown: vi.fn(),
        readItems: vi.fn(),
        readAnalysis: vi.fn(),
        onEvent: vi.fn().mockReturnValue(vi.fn()),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('loads and displays active document task snapshots', async () => {
    renderPage();

    await waitFor(() => {
      expect(window.yibiao?.knowledgeBase.getActiveTasks).toHaveBeenCalled();
    });

    expect(screen.getByLabelText('知识库处理任务')).toBeInTheDocument();
    expect(screen.getByText('正在处理 1 个文档')).toBeInTheDocument();
    expect(screen.getByText('投标素材.docx（匹配段落 72%）')).toBeInTheDocument();
    expect(screen.getByText('投标素材.docx')).toBeInTheDocument();
    expect(screen.getByText('AI 正在匹配段落 3/5')).toBeInTheDocument();
  });
});
