import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeveloperDemoPage from './DeveloperDemoPage';

describe('DeveloperDemoPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders a real prompt lab instead of the old demo shell', () => {
    render(<DeveloperDemoPage sectionId="developer-prompt-lab" />);

    expect(screen.getByRole('heading', { name: 'Prompt调试台' })).toBeInTheDocument();
    expect(screen.getAllByText('招标解析 - 项目信息 JSON').length).toBeGreaterThan(0);
    expect(screen.getByText('变量注入后的消息')).toBeInTheDocument();
    expect(screen.getByText(/项目名称：易标测试项目/)).toBeInTheDocument();
  });

  it('switches prompt chains and displays the selected schema', () => {
    render(<DeveloperDemoPage sectionId="developer-prompt-lab" />);

    fireEvent.click(screen.getByRole('button', { name: /废标项检查 - JSON 定稿/ }));

    expect(screen.getByText('{"findings":[{"type":"invalidBid","severity":"high","title":"","summary":"","requirement":"","bidEvidence":"","riskReason":"","suggestion":""}]}')).toBeInTheDocument();
    expect(screen.getByText(/资格材料可通过电子文件正文判断/)).toBeInTheDocument();
  });

  it('builds an export dry-run report from technical plan outline content', async () => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue({ export_format: { page: { header_enabled: true, header_text: '测试页眉' } } }),
      },
      technicalPlan: {
        loadState: vi.fn().mockResolvedValue({
          outlineData: {
            project_name: '易标测试项目',
            outline: [
              {
                id: '1',
                title: '实施方案',
                description: '',
                content: '正文内容\n\n```mermaid\ngraph TD\nA-->B\n```\n\n![现场图](workspace/image.png)\n\n| 名称 | 说明 |\n| --- | --- |\n| A | B |',
              },
              {
                id: '2',
                title: '空章节',
                description: '',
                content: '',
              },
            ],
          },
        }),
      },
      export: {
        previewWordExport: vi.fn().mockResolvedValue({
          success: true,
          message: 'Word dry-run 已完成，未发现阻断性导出问题。',
          warnings: ['导出预检：检测到 1 张 Mermaid 图，导出时会联网转换为 Word 图片。'],
          preflight: {
            leafCount: 2,
            mermaidCount: 1,
            imageCount: 1,
            dataUrlImageCount: 0,
            localImageCount: 1,
            remoteImageCount: 0,
            assetImageCount: 0,
            missingLocalImageCount: 1,
            unknownImageCount: 0,
            warnings: ['导出预检：检测到 1 张 Mermaid 图，导出时会联网转换为 Word 图片。'],
          },
          stats: { leafCount: 2, mermaidCount: 1 },
          duration_ms: 32,
          docx_bytes: 16384,
        }),
      },
    } as unknown) as typeof window.yibiao;

    render(<DeveloperDemoPage sectionId="developer-export-preview" />);

    expect(await screen.findByRole('heading', { name: '导出链路预演' })).toBeInTheDocument();
    expect(await screen.findByText('已生成报告')).toBeInTheDocument();
    expect(screen.getAllByText('空章节').length).toBeGreaterThan(0);
    expect(screen.getByText('本地图片需 Main 转换')).toBeInTheDocument();
    expect(screen.getByText('Mermaid')).toBeInTheDocument();
    expect(await screen.findByText('真实 Word dry-run')).toBeInTheDocument();
    expect(screen.getByText('dry-run 完成')).toBeInTheDocument();
    expect(screen.getByText('16KB')).toBeInTheDocument();
    expect(window.yibiao?.export.previewWordExport).toHaveBeenCalledWith(expect.objectContaining({
      project_name: '易标测试项目',
      outline: expect.any(Array),
      export_format: expect.objectContaining({ page: expect.objectContaining({ header_text: '测试页眉' }) }),
    }));
  });

  it('runs the parser sandbox through the file bridge', async () => {
    window.yibiao = ({
      file: {
        getDeveloperParserCapabilities: vi.fn().mockResolvedValue({
          providers: [],
          samples: [
            {
              extension: '.pdf',
              local_supported: true,
              mineru_accurate_supported: true,
              mineru_agent_supported: true,
              recommended_provider: 'local',
              status: 'mixed',
              note: '文本型 PDF 可先走本地解析；扫描件 PDF 建议使用 MinerU OCR。',
            },
            {
              extension: '.ofd',
              local_supported: false,
              mineru_accurate_supported: false,
              mineru_agent_supported: false,
              recommended_provider: '',
              status: 'unsupported',
              note: '当前未接入 OFD 解析；建议先转换为 PDF/DOCX。',
            },
          ],
          chinese_path_smoke: {
            required: true,
            note: '解析回归样本应至少包含一个中文目录和中文文件名。',
            example: 'C:\\投标项目\\样本文档\\技术方案样例.docx',
          },
          scanned_document_policy: '扫描件 PDF、JPEG、PNG 不走本地解析，优先使用 MinerU OCR。',
        }),
        parseDeveloperSample: vi.fn().mockResolvedValue({
          success: true,
          message: '文件解析完成',
          file: {
            id: 'file-1',
            file_name: 'sample.docx',
            file_path: '/tmp/sample.docx',
            extension: '.docx',
            size: 1024,
            modified_at: '2026-06-14T10:00:00.000Z',
          },
          parser_provider: 'local',
          parser_label: '本地解析',
          duration_ms: 128,
          markdown_preview: '# 样本文档\n\n![图](asset.png)',
          markdown_chars: 18,
          image_count: 1,
          line_count: 3,
        }),
      },
    } as unknown) as typeof window.yibiao;

    render(<DeveloperDemoPage sectionId="developer-parser-sandbox" />);

    expect(await screen.findByText('样本覆盖矩阵')).toBeInTheDocument();
    expect(screen.getByText('.pdf')).toBeInTheDocument();
    expect(screen.getByText('.ofd')).toBeInTheDocument();
    expect(screen.getByText(/扫描件 PDF、JPEG、PNG/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '选择并解析样本' }));

    expect(await screen.findByText('解析完成')).toBeInTheDocument();
    expect(screen.getByText('sample.docx')).toBeInTheDocument();
    expect(screen.getAllByText('本地解析').length).toBeGreaterThan(0);
    expect(screen.getByText(/# 样本文档/)).toBeInTheDocument();
    expect(screen.getByText(/当前未接入 OFD 解析/)).toBeInTheDocument();
    expect(window.yibiao?.file.getDeveloperParserCapabilities).toHaveBeenCalled();
    expect(window.yibiao?.file.parseDeveloperSample).toHaveBeenCalledWith({ provider: 'local', preserveImages: false });
  });
});
