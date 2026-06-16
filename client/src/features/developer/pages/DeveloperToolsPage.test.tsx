import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeveloperToolsPage from './DeveloperToolsPage';

describe('DeveloperToolsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders a real prompt lab instead of the old demo shell', () => {
    render(<DeveloperToolsPage sectionId="developer-prompt-lab" />);

    expect(screen.getByRole('heading', { name: 'Prompt调试台' })).toBeInTheDocument();
    expect(screen.getAllByText('招标解析 - 项目信息 JSON').length).toBeGreaterThan(0);
    expect(screen.getByText('变量注入后的消息')).toBeInTheDocument();
    expect(screen.getByText(/项目名称：易标测试项目/)).toBeInTheDocument();
  });

  it('switches prompt chains and displays the selected schema', () => {
    render(<DeveloperToolsPage sectionId="developer-prompt-lab" />);

    fireEvent.click(screen.getByRole('button', { name: /废标项检查 - JSON 定稿/ }));

    expect(screen.getByText('{"findings":[{"type":"invalidBid","severity":"high","title":"","summary":"","requirement":"","bidEvidence":"","riskReason":"","suggestion":""}]}')).toBeInTheDocument();
    expect(screen.getByText(/资格材料可通过电子文件正文判断/)).toBeInTheDocument();
  });

  it('saves a sanitized prompt debug record through the AI bridge', async () => {
    const savePromptDebugRecord = vi.fn().mockResolvedValue({
      success: true,
      message: 'Prompt 调试记录已保存',
      filePath: '/tmp/yibiao/logs/developer-prompt-lab/debug-records.jsonl',
    });
    window.yibiao = ({
      ai: { savePromptDebugRecord },
    } as unknown) as typeof window.yibiao;

    render(<DeveloperToolsPage sectionId="developer-prompt-lab" />);

    fireEvent.click(screen.getByRole('button', { name: '保存到开发者日志' }));

    expect(await screen.findByText(/已保存到 .*debug-records\.jsonl/)).toBeInTheDocument();
    expect(savePromptDebugRecord).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 'bid-analysis-project-info',
      chainLabel: '招标解析 - 项目信息 JSON',
      responseFormat: 'json_object',
      messageCount: expect.any(Number),
      charCount: expect.any(Number),
      messages: expect.any(Array),
      redaction: expect.objectContaining({
        apiKey: 'not included',
        baseUrl: 'not included',
      }),
    }));
  });

  it('shows the expanded prompt lab chain catalogue for technical plan and duplicate check workflows', () => {
    render(<DeveloperToolsPage sectionId="developer-prompt-lab" />);

    expect(screen.getAllByText('全局事实预设').length).toBeGreaterThan(0);
    expect(screen.getAllByText('正文编排 - 章节计划 JSON').length).toBeGreaterThan(0);
    expect(screen.getAllByText('正文生成 - 单章节 Markdown').length).toBeGreaterThan(0);
    expect(screen.getAllByText('原方案还原 - 段落归属 JSON').length).toBeGreaterThan(0);
    expect(screen.getAllByText('查重 - 正文重复规则观察').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /正文编排 - 章节计划 JSON/ }));
    expect(screen.getByText(/knowledge.item_ids 只能从本小节已筛选的参考知识库条目 id 中选择/)).toBeInTheDocument();
    expect(screen.getAllByText(/项目团队配置/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /查重 - 正文重复规则观察/ }));
    expect(screen.getAllByText(/查重当前是确定性规则链路/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/normalized_text/).length).toBeGreaterThan(0);
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

    render(<DeveloperToolsPage sectionId="developer-export-preview" />);

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
              note: '文本型 PDF 可先走本地解析；扫描件 PDF 建议优先使用本地 OCR。',
            },
            {
              extension: '.ofd',
              local_supported: false,
              mineru_accurate_supported: false,
              mineru_agent_supported: false,
              recommended_provider: 'local-ocr',
              status: 'local-ocr',
              note: 'OFD 可走本地 OCR 兜底：优先通过本机 OFD 转 PDF 工具或 LibreOffice 转为页面 PDF，再按页面截图调用 PaddleOCR。',
            },
          ],
          chinese_path_smoke: {
            required: true,
            note: '解析回归样本应至少包含一个中文目录和中文文件名。',
            example: 'C:\\投标项目\\样本文档\\技术方案样例.docx',
          },
          scanned_document_policy: '扫描件 PDF、JPEG、PNG 可先走本地 OCR；本地 OCR 默认优先使用 PaddleOCR。',
        }),
        parseDeveloperSample: vi.fn().mockImplementation((options?: { filePath?: string; provider?: string }) => Promise.resolve(options?.filePath ? {
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
          parser_provider: options.provider || 'mineru-accurate-api',
          parser_label: 'MinerU 精准解析 API',
          requested_provider: options.provider || 'mineru-accurate-api',
          duration_ms: 256,
          markdown_preview: '# 样本文档\n\n解析结果增加了表格内容\n\n![图](asset.png)',
          markdown_chars: 31,
          image_count: 1,
          line_count: 5,
        } : {
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
        })),
      },
    } as unknown) as typeof window.yibiao;

    render(<DeveloperToolsPage sectionId="developer-parser-sandbox" />);

    expect(await screen.findByText('样本覆盖矩阵')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /本地 OCR 解析适合扫描 PDF、OFD 和图片/ })).toBeInTheDocument();
    expect(screen.getByText('.pdf')).toBeInTheDocument();
    expect(screen.getByText('.ofd')).toBeInTheDocument();
    expect(screen.getByText(/扫描件 PDF、JPEG、PNG/)).toBeInTheDocument();
    expect(screen.queryByText(/扫描件 PDF 建议使用 MinerU OCR/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '选择并解析样本' }));

    expect(await screen.findByText('解析完成')).toBeInTheDocument();
    expect(screen.getByText('sample.docx')).toBeInTheDocument();
    expect(screen.getAllByText('本地解析').length).toBeGreaterThan(0);
    expect(screen.getByText(/# 样本文档/)).toBeInTheDocument();
    expect(screen.getByText(/OFD 可走本地 OCR/)).toBeInTheDocument();
    expect(window.yibiao?.file.getDeveloperParserCapabilities).toHaveBeenCalled();
    expect(window.yibiao?.file.parseDeveloperSample).toHaveBeenCalledWith({ provider: 'local', preserveImages: false });

    fireEvent.click(screen.getByRole('button', { name: '用另一解析器对比当前样本' }));

    expect(await screen.findByText('对比完成')).toBeInTheDocument();
    expect(screen.getByText('字符差异')).toBeInTheDocument();
    expect(screen.getByText('+13')).toBeInTheDocument();
    expect(screen.getByText(/解析结果增加了表格内容/)).toBeInTheDocument();
    expect(window.yibiao?.file.parseDeveloperSample).toHaveBeenCalledWith({
      provider: 'mineru-accurate-api',
      preserveImages: false,
      filePath: '/tmp/sample.docx',
    });
  });
});
