import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { ImageKnowledgeArchiveImportResult, ImageKnowledgeState, ImageKnowledgeUploadResult } from '../types';
import ImageKnowledgeBasePage from './ImageKnowledgeBasePage';

const imageState: ImageKnowledgeState = {
  categories: ['资质证书'],
  folders: ['资信材料'],
  tags: ['证书', '企业资质'],
  assets: [
    {
      id: 'img-1',
      fileName: 'certificate.png',
      title: '企业资质证书',
      category: '资质证书',
      folder: '资信材料',
      description: '用于资信章节的证书扫描件',
      source: '企业资料',
      scenario: '资信证明',
      tags: ['证书', '企业资质'],
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

const uploadResult: ImageKnowledgeUploadResult = {
  ...imageState,
  imported: 1,
  skipped: 0,
  message: '已导入 1 张图片',
};

const archiveImportResult: ImageKnowledgeArchiveImportResult = {
  ...imageState,
  imported: 2,
  skipped: 0,
  archives: 1,
  message: '已导入 2 张图片素材图示图片',
};

function renderPage() {
  return render(
    <ToastProvider>
      <ImageKnowledgeBasePage />
    </ToastProvider>,
  );
}

describe('ImageKnowledgeBasePage', () => {
  beforeEach(() => {
    window.yibiao = ({
      imageKnowledgeBase: {
        list: vi.fn().mockResolvedValue(imageState),
        uploadImages: vi.fn().mockResolvedValue(uploadResult),
        importHistoricalArchives: vi.fn().mockResolvedValue(archiveImportResult),
        updateAsset: vi.fn().mockResolvedValue(imageState),
        batchUpdateAssets: vi.fn().mockResolvedValue({ ...imageState, affected: 1, message: '已批量更新 1 张图片' }),
        renameTag: vi.fn().mockResolvedValue({
          ...imageState,
          tags: ['荣誉证书', '企业资质'],
          affected: 1,
          message: '已将 1 张图片的标签“证书”重命名为“荣誉证书”',
        }),
        deleteTag: vi.fn().mockResolvedValue({
          ...imageState,
          tags: ['企业资质'],
          affected: 1,
          message: '已从 1 张图片中删除标签“证书”',
        }),
        deleteAsset: vi.fn().mockResolvedValue({ assets: [], categories: [], folders: [], tags: [] }),
        batchDeleteAssets: vi.fn().mockResolvedValue({ assets: [], categories: [], folders: [], tags: [], affected: 1, message: '已删除 1 张图片素材' }),
        createMarkdownReference: vi.fn(),
        listReferences: vi.fn().mockResolvedValue([
          {
            id: 'ref-1',
            imageId: 'img-1',
            targetType: 'technical-plan',
            targetId: 'section-1',
            createdAt: '2026-06-14T10:05:00.000Z',
          },
        ]),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders persisted image assets from the bridge state', async () => {
    renderPage();

    expect(await screen.findByText('企业资质证书')).toBeInTheDocument();
    expect(screen.getByDisplayValue('资质证书')).toBeInTheDocument();
    expect(screen.getByLabelText('素材文件夹')).toHaveValue('资信材料');
    expect(screen.getByText('image/png')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('图片引用记录')).toHaveTextContent('技术方案 · section-1');
    });
  });

  it('uploads images through the bridge', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '上传图片' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.uploadImages).toHaveBeenCalled();
    });
  });

  it('imports historical archives into the selected image knowledge section', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '导入图片素材图示' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.importHistoricalArchives).toHaveBeenCalledWith('图片素材图示');
    });

    fireEvent.click(screen.getByRole('button', { name: '导入资质扫描管理' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.importHistoricalArchives).toHaveBeenCalledWith('资质扫描管理');
    });
  });

  it('updates asset metadata through the bridge', async () => {
    renderPage();
    const titleInput = await screen.findByDisplayValue('企业资质证书');

    fireEvent.change(titleInput, { target: { value: '荣誉证书' } });

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.updateAsset).toHaveBeenCalledWith('img-1', { title: '荣誉证书' });
    });

    fireEvent.change(screen.getByLabelText('素材文件夹'), { target: { value: '证书归档' } });

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.updateAsset).toHaveBeenCalledWith('img-1', { folder: '证书归档' });
    });
  });

  it('batch updates selected asset category, folder and tags through the bridge', async () => {
    renderPage();

    fireEvent.click(await screen.findByLabelText('选择企业资质证书'));
    fireEvent.change(screen.getByLabelText('批量分类'), { target: { value: '荣誉证书' } });
    fireEvent.click(screen.getByRole('button', { name: '批量设置分类' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.batchUpdateAssets).toHaveBeenCalledWith({
        ids: ['img-1'],
        patch: { category: '荣誉证书' },
        appendTags: false,
      });
    });

    fireEvent.change(screen.getByLabelText('批量文件夹'), { target: { value: '证书归档' } });
    fireEvent.click(screen.getByRole('button', { name: '批量设置文件夹' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.batchUpdateAssets).toHaveBeenCalledWith({
        ids: ['img-1'],
        patch: { folder: '证书归档' },
        appendTags: false,
      });
    });

    fireEvent.change(screen.getByLabelText('追加标签'), { target: { value: '投标,证书' } });
    fireEvent.click(screen.getByRole('button', { name: '批量追加标签' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.batchUpdateAssets).toHaveBeenCalledWith({
        ids: ['img-1'],
        patch: { tags: ['投标', '证书'] },
        appendTags: true,
      });
    });
  });

  it('batch deletes selected image assets through the bridge', async () => {
    renderPage();

    fireEvent.click(await screen.findByLabelText('选择企业资质证书'));
    fireEvent.click(screen.getByRole('button', { name: '批量删除所选' }));

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.batchDeleteAssets).toHaveBeenCalledWith(['img-1']);
    });
  });

  it('renames and deletes tags through the bridge', async () => {
    renderPage();

    const tagSelect = await screen.findByLabelText('选择标签');
    fireEvent.change(tagSelect, { target: { value: '证书' } });
    fireEvent.change(screen.getByLabelText('新标签名'), { target: { value: '荣誉证书' } });
    const renameButton = screen.getByRole('button', { name: '重命名标签' });
    await waitFor(() => {
      expect(renameButton).not.toBeDisabled();
    });
    fireEvent.click(renameButton);

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.renameTag).toHaveBeenCalledWith('证书', '荣誉证书');
    });

    fireEvent.change(tagSelect, { target: { value: '荣誉证书' } });
    const deleteTagButton = screen.getByRole('button', { name: '删除标签' });
    await waitFor(() => {
      expect(deleteTagButton).not.toBeDisabled();
    });
    fireEvent.click(deleteTagButton);

    await waitFor(() => {
      expect(window.yibiao?.imageKnowledgeBase.deleteTag).toHaveBeenCalledWith('荣誉证书');
    });
  });
});
