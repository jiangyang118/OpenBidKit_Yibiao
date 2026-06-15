import { render, screen } from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { DEFAULT_EXPORT_FORMAT } from '../../../shared/types/exportFormat';
import ExportFormatPage from './ExportFormatPage';

function renderPage() {
  return render(
    <Tooltip.Provider>
      <ToastProvider>
        <ExportFormatPage />
      </ToastProvider>
    </Tooltip.Provider>,
  );
}

describe('ExportFormatPage', () => {
  beforeEach(() => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({
          export_format: {
            ...DEFAULT_EXPORT_FORMAT,
            page: {
              ...DEFAULT_EXPORT_FORMAT.page,
              header_enabled: true,
              header_text: '易标测试页眉',
              header_first_page_different: true,
              header_first_page_text: '易标首页页眉',
              header_even_odd_different: true,
              header_even_text: '易标偶数页页眉',
              header_font: '黑体',
              header_size: '五号',
              header_alignment: '右对齐',
            },
          },
        }),
        save: vi.fn().mockResolvedValue({ success: true, message: '已保存' }),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders editable header controls backed by export format config', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Word 文档排版与编号格式' })).toBeInTheDocument();
    expect(screen.queryByText('暂未支持')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('易标测试页眉')).toBeInTheDocument();
    expect(screen.getByText('首页不同')).toBeInTheDocument();
    expect(screen.getByDisplayValue('易标首页页眉')).toBeInTheDocument();
    expect(screen.getByText('奇偶页不同')).toBeInTheDocument();
    expect(screen.getByDisplayValue('易标偶数页页眉')).toBeInTheDocument();
    expect(screen.getByText('页眉写入规则')).toBeInTheDocument();
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('奇数页')).toBeInTheDocument();
    expect(screen.getByText('偶数页')).toBeInTheDocument();
    expect(screen.getByText('易标首页页眉')).toBeInTheDocument();
    expect(screen.getByText('易标偶数页页眉')).toBeInTheDocument();
    expect(screen.getByText(/字体、字号和对齐方式会同时应用/)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('黑体').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('五号').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('右对齐')).toBeInTheDocument();
  });
});
