import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { trackResourceClick } from '../../../shared/analytics/analytics';
import ResourcesPage from './ResourcesPage';

vi.mock('../../../shared/analytics/analytics', () => ({
  trackResourceClick: vi.fn(),
}));

const resourceResponse = {
  code: 0,
  resources: [
    {
      id: 'template-1',
      title: '投标文件结构模板',
      description: '用于快速搭建投标文件章节。',
      tags: ['模板', '技术标'],
      modalContent: '## 下载说明\n请按项目需要复制模板。',
      imageUrl: '',
      analyticsKey: 'template-1',
      clickCount: 12,
    },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <ResourcesPage />
    </ToastProvider>,
  );
}

describe('ResourcesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackResourceClick).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('loads resources and tracks resource clicks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => resourceResponse,
    } as Response);

    renderPage();

    const resourceButton = await screen.findByRole('button', { name: '查看资源：投标文件结构模板' });
    expect(screen.getByText('累计点击 12 次')).toBeInTheDocument();

    fireEvent.click(resourceButton);

    expect(trackResourceClick).toHaveBeenCalledWith('template-1');
    expect(localStorage.getItem('yibiao.resources.cache.v1')).toContain('投标文件结构模板');
  });

  it('falls back to cached resources when the API request fails', async () => {
    localStorage.setItem('yibiao.resources.cache.v1', JSON.stringify({
      cachedAt: '2026-06-15T00:00:00.000Z',
      resources: resourceResponse.resources,
    }));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText('投标文件结构模板')).toBeInTheDocument();
    expect(screen.getByText(/当前显示离线缓存资源/)).toBeInTheDocument();
  });

  it('shows a friendly empty state when the API fails without cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText('暂时无法显示资源')).toBeInTheDocument();
    expect(screen.getAllByText('资源接口暂不可用，且本机暂无可用缓存').length).toBeGreaterThan(0);
  });
});
