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
              cover_enabled: true,
              cover_title: '易标封面标题',
              cover_subtitle: '技术标',
              cover_company: '易标测试公司',
              cover_date: '2026年6月15日',
              toc_enabled: true,
              toc_title: '投标文件目录',
              toc_depth: 4,
              chapter_section_break_enabled: true,
              watermark_enabled: true,
              watermark_text: '内部资料',
              watermark_font: '楷体',
              watermark_size_pt: 60,
              watermark_color: 'C9CDD4',
              watermark_opacity: 0.32,
            },
            table: {
              header_fill_color: 'D9EAD3',
              border_color: '70AD47',
              inside_border_color: 'A9D18E',
              cell_margin_twips: 200,
            },
            image: {
              max_width_px: 360,
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
    expect(screen.getByText('封面页')).toBeInTheDocument();
    expect(screen.getByDisplayValue('易标封面标题')).toBeInTheDocument();
    expect(screen.getByLabelText('封面副标题')).toHaveValue('技术标');
    expect(screen.getByLabelText('封面投标单位')).toHaveValue('易标测试公司');
    expect(screen.getByLabelText('封面日期')).toHaveValue('2026年6月15日');
    expect(screen.getByText('目录页')).toBeInTheDocument();
    expect(screen.getByDisplayValue('投标文件目录')).toBeInTheDocument();
    expect(screen.getByLabelText('目录收录层级')).toHaveValue(4);
    expect(screen.getByText('一级章节分节')).toBeInTheDocument();
    expect(screen.getByText('文字水印')).toBeInTheDocument();
    expect(screen.getByDisplayValue('内部资料')).toBeInTheDocument();
    expect(screen.getByDisplayValue('楷体')).toBeInTheDocument();
    expect(screen.getByLabelText('水印字号')).toHaveValue(60);
    expect(screen.getByLabelText('水印颜色')).toHaveValue('#c9cdd4');
    expect(screen.getByLabelText('水印透明度')).toHaveValue('0.32');
    expect(screen.getByText('表格样式')).toBeInTheDocument();
    expect(screen.getByLabelText('表头底色')).toHaveValue('#d9ead3');
    expect(screen.getByLabelText('表格外框线颜色')).toHaveValue('#70ad47');
    expect(screen.getByLabelText('表格内框线颜色')).toHaveValue('#a9d18e');
    expect(screen.getByLabelText('表格单元格留白')).toHaveValue(200);
    expect(screen.getByText('图片导出策略')).toBeInTheDocument();
    expect(screen.getByLabelText('Word 图片最大宽度')).toHaveValue(360);
    expect(screen.getAllByDisplayValue('黑体').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('五号').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('右对齐')).toBeInTheDocument();
  });
});
