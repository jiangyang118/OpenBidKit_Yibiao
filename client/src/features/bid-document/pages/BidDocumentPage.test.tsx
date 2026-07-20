import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { BidDocumentState } from '../types';
import BidDocumentPage from './BidDocumentPage';

const smartTemplate = {
  id: 'smart-canteen-response',
  name: '智慧食堂响应文件模板',
  documentTitle: '响应文件',
  industry: '智慧食堂',
  requiredAssetKeys: ['business_license'],
  validationProfile: {
    requiredSectionIds: ['quote-summary', 'technical-solution'],
  },
  sections: [
    { id: 'cover', title: '封面', level: 0, required: true },
    { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
    { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
    { id: 'project-understanding', title: '项目理解', level: 2, required: true, parentId: 'technical-solution' },
  ],
};

const genericTemplate = {
  id: 'generic-response',
  name: '通用响应文件模板',
  documentTitle: '响应文件',
  industry: '通用项目',
  requiredAssetKeys: ['qualification_scan', 'solution_screenshot', 'contract_case_scan'],
  validationProfile: {
    requiredSectionIds: ['quote-summary', 'technical-solution'],
  },
  sections: [
    { id: 'cover', title: '封面', level: 0, required: true },
    { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
    { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
    { id: 'backup-service', title: '后备服务', level: 2, required: false, parentId: 'technical-solution' },
  ],
};

const bidDocumentState: BidDocumentState = {
  templates: [smartTemplate, genericTemplate],
  template: smartTemplate,
  projectData: {
    templateId: 'smart-canteen-response',
    projectName: '智慧餐厅称重系统改造',
    purchaserName: '北京蓝色港湾科技有限责任公司',
    supplierName: '北京康比特体育科技股份有限公司',
    totalWithTax: 135050,
    totalWithoutTax: 119630.15,
    taxPolicy: {
      softwareHardwareRate: 0.13,
      serviceRate: 0.06,
    },
    paymentTerms: [
      { stage: '使用 12 个月', ratio: 100, text: '使用时间 12 个月后无质量问题，支付总价款。' },
    ],
  },
  quoteItems: [
    { name: '智慧食堂管理系统含手机端', quantity: 1, brandModel: '康比特 CPT-Nutr-GMPLTF V2.0', unitPriceWithTax: 135050, totalWithTax: 135050 },
  ],
  assetMap: {
    business_license: {
      key: 'business_license',
      title: '营业执照',
      filePath: '',
      type: 'image',
      required: true,
      sectionId: 'supplier-basic-info',
      templateId: 'smart-canteen-response',
    },
  },
  lastBuildLog: null,
};

const genericBidDocumentState: BidDocumentState = {
  ...bidDocumentState,
  template: genericTemplate,
  projectData: {
    templateId: 'generic-response',
    projectName: '通用完整标书样例项目',
    purchaserName: '样例采购人',
    supplierName: '样例供应商',
    totalWithTax: 300,
    totalWithoutTax: 265.49,
    taxPolicy: {
      softwareHardwareRate: 0.13,
      serviceRate: 0.06,
    },
    paymentTerms: [
      { stage: '到货', ratio: 50, text: '设备到现场支付合同总价款的 50%。' },
      { stage: '验收', ratio: 50, text: '设备调试合格后支付合同总价款的 50%。' },
    ],
  },
  quoteItems: [
    { name: '样例管理系统', quantity: 1, brandModel: 'GEN-SYS V1.0', unitPriceWithTax: 100, totalWithTax: 100 },
    { name: '样例终端设备', quantity: 2, brandModel: 'GEN-DEVICE-100', unitPriceWithTax: 100, totalWithTax: 200 },
  ],
  assetMap: {
    qualification_scan: {
      key: 'qualification_scan',
      title: '资质证明扫描件',
      filePath: '',
      type: 'image',
      required: true,
      sectionId: 'supplier-basic-info',
      templateId: 'generic-response',
    },
    solution_screenshot: {
      key: 'solution_screenshot',
      title: '系统或产品截图',
      filePath: '',
      type: 'image',
      required: true,
      sectionId: 'technical-solution',
      templateId: 'generic-response',
    },
    contract_case_scan: {
      key: 'contract_case_scan',
      title: '合同案例证明扫描件',
      filePath: '',
      type: 'image',
      required: true,
      sectionId: 'other-materials',
      templateId: 'generic-response',
    },
    backup_service_proof: {
      key: 'backup_service_proof',
      title: '后备服务证明材料',
      filePath: '',
      type: 'document',
      required: false,
      sectionId: 'backup-service',
      templateId: 'generic-response',
    },
  },
};

function renderPage() {
  return render(
    <ToastProvider>
      <BidDocumentPage />
    </ToastProvider>,
  );
}

describe('BidDocumentPage', () => {
  beforeEach(() => {
    window.yibiao = ({
      bidDocument: {
        loadState: vi.fn().mockResolvedValue(bidDocumentState),
        saveState: vi.fn().mockImplementation((payload?: { templateId?: string }) => Promise.resolve(payload?.templateId === 'generic-response' ? genericBidDocumentState : bidDocumentState)),
        validate: vi.fn().mockResolvedValue({
          success: false,
          buildLog: {
            quoteCheck: { passed: true, errors: [] },
            paymentCheck: { passed: true, errors: [] },
            titleCheck: { passed: true, errors: [] },
            identityCheck: { passed: true, errors: [] },
            forbiddenWordsCheck: { passed: true, errors: [] },
            assetCheck: { passed: false, errors: ['missing_assets:business_license'] },
            sectionCheck: { passed: true, errors: [] },
            docxOpenCheck: { passed: false, errors: ['not_run'] },
            docxContentCheck: { passed: false, errors: ['not_run'] },
            imageInsertionCheck: { passed: false, errors: ['not_run'] },
            docxForbiddenWordsCheck: { passed: false, errors: ['not_run'] },
            passed: false,
            errors: ['missing_assets:business_license'],
          },
        }),
        selectAsset: vi.fn().mockResolvedValue({ success: false, canceled: true, message: '已取消选择' }),
        analyzeReference: vi.fn().mockResolvedValue({
          success: false,
          message: '参考响应文件结构对齐未通过，请查看差异。',
          referencePath: '/tmp/reference.docx',
          candidatePath: '/tmp/candidate.docx',
          alignment: {
            passed: false,
            errors: ['missing headings: 1:六、技术方案'],
            details: {
              missingHeadings: ['1:六、技术方案'],
              extraHeadings: [],
              missingTableHeaders: [],
              layoutDiffs: [],
              summaryDiffs: [],
            },
          },
        }),
        exportTemplateInfo: vi.fn().mockResolvedValue({
          success: true,
          message: '完整标书模板配置 JSON 已导出。',
          filePath: '/tmp/smart-canteen-template-info.json',
          templateInfo: {},
        }),
        exportProjectConfig: vi.fn().mockResolvedValue({
          success: true,
          message: '完整标书项目配置 JSON 已导出。',
          filePath: '/tmp/project-config.json',
          projectConfig: {},
        }),
        exportReadinessReport: vi.fn().mockResolvedValue({
          success: true,
          readinessReady: false,
          message: '完整标书准备度报告已导出，仍存在正式构建阻断项。',
          markdownPath: '/tmp/readiness.md',
          jsonPath: '/tmp/readiness.json',
          xlsxPath: '/tmp/readiness.xlsx',
          readinessReport: {
            ready: false,
            quoteDifference: 2000,
          },
          buildLog: {
            quoteCheck: { passed: false, errors: ['quote_items total should equal project totalWithTax: expected 135050, got 133050'] },
            paymentCheck: { passed: true, errors: [] },
            titleCheck: { passed: true, errors: [] },
            identityCheck: { passed: true, errors: [] },
            forbiddenWordsCheck: { passed: true, errors: [] },
            assetCheck: { passed: false, errors: ['missing_assets:business_license'] },
            sectionCheck: { passed: true, errors: [] },
            docxOpenCheck: { passed: false, errors: ['not_run'] },
            docxContentCheck: { passed: false, errors: ['not_run'] },
            imageInsertionCheck: { passed: false, errors: ['not_run'] },
            docxForbiddenWordsCheck: { passed: false, errors: ['not_run'] },
            passed: false,
            errors: [
              'quote_items total should equal project totalWithTax: expected 135050, got 133050',
              'missing_assets:business_license',
            ],
          },
        }),
        exportAssetCollectionPackage: vi.fn().mockResolvedValue({
          success: true,
          readinessReady: false,
          message: '完整标书材料收集包已导出，仍需按清单补齐或替换材料。',
          outputDir: '/tmp/material-package',
          markdownPath: '/tmp/material-package/材料收集清单.md',
          manifestPath: '/tmp/material-package/asset-manifest.json',
          manifestSchemaPath: '/tmp/material-package/asset-manifest.schema.json',
          quoteResolutionPath: '/tmp/material-package/quote-resolution.json',
          quoteResolutionSchemaPath: '/tmp/material-package/quote-resolution.schema.json',
          assetCount: 18,
          demoOnlyAssetCount: 18,
          replacementRequiredAssetCount: 18,
          readinessReport: {
            ready: false,
            quoteDifference: 2000,
          },
          buildLog: {
            quoteCheck: { passed: false, errors: ['quote_items total should equal project totalWithTax: expected 135050, got 133050'] },
            paymentCheck: { passed: true, errors: [] },
            titleCheck: { passed: true, errors: [] },
            identityCheck: { passed: true, errors: [] },
            forbiddenWordsCheck: { passed: true, errors: [] },
            assetCheck: { passed: false, errors: ['missing_assets:business_license'] },
            sectionCheck: { passed: true, errors: [] },
            docxOpenCheck: { passed: false, errors: ['not_run'] },
            passed: false,
            errors: ['quote_items total should equal project totalWithTax: expected 135050, got 133050'],
          },
        }),
        importAssetCollectionPackage: vi.fn().mockResolvedValue({
          success: true,
          validationPassed: false,
          message: '材料收集包已导入，已回填 1 项附件，仍有 1 项必填材料缺失或其他校验问题。',
          packageDir: '/tmp/material-package',
          manifestPath: '/tmp/material-package/asset-manifest.json',
          manifestSchemaPath: '/tmp/material-package/asset-manifest.schema.json',
          quoteResolutionPath: '/tmp/material-package/quote-resolution.json',
          quoteResolutionApplied: true,
          quoteResolutionAction: 'confirm_project_total',
          quoteResolutionErrors: [],
          appliedCount: 1,
          missingRequiredCount: 1,
          state: {
            ...bidDocumentState,
            assetMap: {
              ...bidDocumentState.assetMap,
              business_license: {
                ...bidDocumentState.assetMap.business_license,
                filePath: '/tmp/material-package/assets/营业执照.png',
              },
            },
          },
          buildLog: {
            quoteCheck: { passed: false, errors: ['quote_items total should equal project totalWithTax: expected 135050, got 133050'] },
            paymentCheck: { passed: true, errors: [] },
            titleCheck: { passed: true, errors: [] },
            identityCheck: { passed: true, errors: [] },
            forbiddenWordsCheck: { passed: true, errors: [] },
            assetCheck: { passed: false, errors: ['missing_assets:iso9001'] },
            sectionCheck: { passed: true, errors: [] },
            docxOpenCheck: { passed: false, errors: ['not_run'] },
            passed: false,
            errors: ['missing_assets:iso9001'],
          },
        }),
        importProjectConfig: vi.fn().mockResolvedValue({
          success: true,
          validationPassed: false,
          message: '完整标书项目配置 JSON 已导入，校验未通过，请查看构建日志。',
          filePath: '/tmp/project-config.json',
          state: {
            ...genericBidDocumentState,
            lastBuildLog: {
              templateCheck: { passed: true, errors: [] },
              quoteCheck: { passed: true, errors: [] },
              paymentCheck: { passed: true, errors: [] },
              titleCheck: { passed: true, errors: [] },
              identityCheck: { passed: true, errors: [] },
              forbiddenWordsCheck: { passed: true, errors: [] },
              assetCheck: { passed: false, errors: ['missing_assets:qualification_scan'] },
              sectionSelectionCheck: { passed: true, errors: [] },
              sectionCheck: { passed: true, errors: [] },
              docxOpenCheck: { passed: false, errors: ['not_run'] },
              docxContentCheck: { passed: false, errors: ['not_run'] },
              imageInsertionCheck: { passed: false, errors: ['not_run'] },
              docxForbiddenWordsCheck: { passed: false, errors: ['not_run'] },
              passed: false,
              errors: ['missing_assets:qualification_scan'],
            },
          },
          buildLog: {
            templateCheck: { passed: true, errors: [] },
            quoteCheck: { passed: true, errors: [] },
            paymentCheck: { passed: true, errors: [] },
            titleCheck: { passed: true, errors: [] },
            identityCheck: { passed: true, errors: [] },
            forbiddenWordsCheck: { passed: true, errors: [] },
            assetCheck: { passed: false, errors: ['missing_assets:qualification_scan'] },
            sectionSelectionCheck: { passed: true, errors: [] },
            sectionCheck: { passed: true, errors: [] },
            docxOpenCheck: { passed: false, errors: ['not_run'] },
            docxContentCheck: { passed: false, errors: ['not_run'] },
            imageInsertionCheck: { passed: false, errors: ['not_run'] },
            docxForbiddenWordsCheck: { passed: false, errors: ['not_run'] },
            passed: false,
            errors: ['missing_assets:qualification_scan'],
          },
        }),
        exportWord: vi.fn(),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('renders template selection and section preview from the template package', async () => {
    renderPage();

    expect(await screen.findAllByText('智慧食堂响应文件模板')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /模板选择/ })).toHaveClass('is-active');

    fireEvent.click(screen.getByRole('button', { name: /模板预览/ }));
    expect(screen.getByLabelText('模板章节预览')).toBeInTheDocument();
    expect(screen.getByText('一、报价一览表')).toBeInTheDocument();
    expect(screen.getByText('项目理解')).toBeInTheDocument();
  });

  it('moves through the bid document workflow steps with adjacent controls', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /模板选择/ })).toHaveClass('is-active');
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole('button', { name: /项目数据/ })).toHaveClass('is-active');
    expect(screen.getByDisplayValue('智慧餐厅称重系统改造')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole('button', { name: /附件资产/ })).toHaveClass('is-active');
    const assetRow = screen.getByText('营业执照').closest('.bid-document-asset-row') as HTMLElement;
    expect(assetRow).toBeInTheDocument();
    expect(within(assetRow).getByText('必填材料')).toBeInTheDocument();
    expect(within(assetRow).getByText('图片')).toBeInTheDocument();
    expect(within(assetRow).getByText('章节已启用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    expect(screen.getByRole('button', { name: /项目数据/ })).toHaveClass('is-active');
  });

  it('switches to a generic template package through the bridge', async () => {
    renderPage();

    const templateSelect = await screen.findByDisplayValue('智慧食堂响应文件模板');
    fireEvent.change(templateSelect, { target: { value: 'generic-response' } });

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.saveState).toHaveBeenCalledWith({ templateId: 'generic-response' });
      expect(screen.getByText('3 项缺失')).toBeInTheDocument();
      expect(screen.getAllByText('通用响应文件模板')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /项目数据/ }));
    expect(screen.getByDisplayValue('通用完整标书样例项目')).toBeInTheDocument();
  });

  it('describes the current generic template without smart canteen wording', async () => {
    (window.yibiao?.bidDocument.loadState as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(genericBidDocumentState);

    renderPage();

    expect(await screen.findAllByText('通用响应文件模板')).toHaveLength(2);
    expect(screen.getByText('当前使用通用响应文件模板，可按项目配置、报价、附件映射和模板章节生成完整响应文件。')).toBeInTheDocument();
    expect(screen.queryByText('当前以智慧食堂响应文件模板作为蓝本，核心数据由模板包和项目实例驱动，不在生成器内写死项目事实。')).not.toBeInTheDocument();
  });

  it('excludes disabled optional section assets from the missing required asset summary', async () => {
    const stateWithDisabledRequiredAsset: BidDocumentState = {
      ...genericBidDocumentState,
      projectData: {
        ...genericBidDocumentState.projectData,
        disabledSectionIds: ['backup-service'],
      },
      assetMap: {
        ...genericBidDocumentState.assetMap,
        backup_service_proof: {
          ...genericBidDocumentState.assetMap.backup_service_proof,
          required: true,
        },
      },
    };
    (window.yibiao?.bidDocument.loadState as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(stateWithDisabledRequiredAsset);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('3 项缺失')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /附件资产/ }));
    const assetRow = (await screen.findByText('后备服务证明材料')).closest('.bid-document-asset-row') as HTMLElement;
    expect(within(assetRow).getByText('必填材料')).toBeInTheDocument();
    expect(within(assetRow).getByText('章节已关闭')).toBeInTheDocument();
    expect(screen.queryByText('4 项缺失')).not.toBeInTheDocument();
  });

  it('shows the quote shortage in the summary before validation runs', async () => {
    const stateWithQuoteDifference: BidDocumentState = {
      ...bidDocumentState,
      quoteItems: [
        {
          ...bidDocumentState.quoteItems[0],
          unitPriceWithTax: 133050,
          totalWithTax: 133050,
        },
      ],
    };
    (window.yibiao?.bidDocument.loadState as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(stateWithQuoteDifference);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/项目总价 135050\.00 元 · 分项少 2000\.00 元/)).toBeInTheDocument();
    });
  });

  it('shows the quote overage in the summary before validation runs', async () => {
    const stateWithQuoteOverage: BidDocumentState = {
      ...bidDocumentState,
      quoteItems: [
        {
          ...bidDocumentState.quoteItems[0],
          unitPriceWithTax: 136000,
          totalWithTax: 136000,
        },
      ],
    };
    (window.yibiao?.bidDocument.loadState as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(stateWithQuoteOverage);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/项目总价 135050\.00 元 · 分项多 950\.00 元/)).toBeInTheDocument();
    });
  });

  it('exports the current template schema and asset mapping from the template step', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导出模板配置 JSON' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.exportTemplateInfo).toHaveBeenCalledWith({ templateId: 'smart-canteen-response' });
      expect(screen.getAllByText('完整标书模板配置 JSON 已导出。').length).toBeGreaterThan(0);
    });
  });

  it('exports the current project config from the top action bar', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导出配置' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.exportProjectConfig).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          projectName: '智慧餐厅称重系统改造',
        }),
        quoteItems: expect.arrayContaining([
          expect.objectContaining({ brandModel: '康比特 CPT-Nutr-GMPLTF V2.0' }),
        ]),
        assetMap: expect.objectContaining({
          business_license: expect.objectContaining({ title: '营业执照' }),
        }),
      }));
      expect(screen.getAllByText('完整标书项目配置 JSON 已导出。').length).toBeGreaterThan(0);
    });
  });

  it('exports a formal-build readiness report from the top action bar', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导出缺口报告' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.exportReadinessReport).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          projectName: '智慧餐厅称重系统改造',
        }),
        assetMap: expect.objectContaining({
          business_license: expect.objectContaining({ title: '营业执照' }),
        }),
      }));
      expect(screen.getAllByText('完整标书准备度报告已导出，仍存在正式构建阻断项。').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /生成与校验/ })).toHaveClass('is-active');
    expect(screen.getByText('quote_items total should equal project totalWithTax: expected 135050, got 133050')).toBeInTheDocument();
    expect(screen.getByLabelText('最近导出的缺口报告')).toBeInTheDocument();
    expect(screen.getByText('最近缺口报告：仍有阻断项')).toBeInTheDocument();
    expect(screen.getByText('Markdown：/tmp/readiness.md')).toBeInTheDocument();
    expect(screen.getByText('JSON：/tmp/readiness.json')).toBeInTheDocument();
    expect(screen.getByText('Excel：/tmp/readiness.xlsx')).toBeInTheDocument();
  });

  it('exports an asset collection package from the top action bar', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导出材料包' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.exportAssetCollectionPackage).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          projectName: '智慧餐厅称重系统改造',
        }),
        assetMap: expect.objectContaining({
          business_license: expect.objectContaining({ title: '营业执照' }),
        }),
      }));
      expect(screen.getAllByText('完整标书材料收集包已导出，仍需按清单补齐或替换材料。').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /生成与校验/ })).toHaveClass('is-active');
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('/tmp/material-package/asset-manifest.schema.json');
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('/tmp/material-package/quote-resolution.json');
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('/tmp/material-package/quote-resolution.schema.json');
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('需替换演示附件：18');
  });

  it('imports an asset collection package and switches to assets step', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导入材料包' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.importAssetCollectionPackage).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          projectName: '智慧餐厅称重系统改造',
        }),
      }));
      expect(screen.getAllByText('材料收集包已导入，已回填 1 项附件，仍有 1 项必填材料缺失或其他校验问题。').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /附件资产/ })).toHaveClass('is-active');
    expect(screen.getByText('/tmp/material-package/assets/营业执照.png')).toBeInTheDocument();
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('/tmp/material-package/asset-manifest.schema.json');
    expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('报价决策已应用：confirm_project_total');
  });

  it('shows the build log when asset package import fails with validation details', async () => {
    const importAssetCollectionPackageMock = window.yibiao?.bidDocument.importAssetCollectionPackage as unknown as ReturnType<typeof vi.fn>;
    importAssetCollectionPackageMock.mockResolvedValueOnce({
      success: false,
      message: '材料收集包导入失败：完整标书模板不存在。',
      buildLog: {
        templateCheck: { passed: false, errors: ['完整标书模板不存在：unknown-template'] },
        quoteCheck: { passed: true, errors: [] },
        assetCheck: { passed: true, errors: [] },
        passed: false,
        errors: ['完整标书模板不存在：unknown-template'],
      },
    });

    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导入材料包' }));

    await waitFor(() => {
      expect(screen.getAllByText('材料收集包导入失败：完整标书模板不存在。').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /生成与校验/ })).toHaveClass('is-active');
      expect(screen.getByText('完整标书模板不存在：unknown-template')).toBeInTheDocument();
    });
  });

  it('shows quote resolution errors in the build log when asset package import rejects a decision', async () => {
    const importAssetCollectionPackageMock = window.yibiao?.bidDocument.importAssetCollectionPackage as unknown as ReturnType<typeof vi.fn>;
    importAssetCollectionPackageMock.mockResolvedValueOnce({
      success: false,
      message: '材料收集包导入失败：报价决策未应用。',
      buildLog: {
        templateCheck: { passed: true, errors: [], details: {} },
        quoteCheck: { passed: false, errors: ['quote_items total should equal project totalWithTax'], details: {} },
        assetCheck: { passed: true, errors: [], details: {} },
        quoteResolutionCheck: {
          passed: false,
          errors: ['quote_resolution_action_payload_mismatch:add_confirmed_quote_item'],
          details: {
            selectedAction: 'add_confirmed_quote_item',
            quoteResolutionPath: '/tmp/material-package/quote-resolution.json',
          },
        },
        passed: false,
        errors: ['quote_resolution_action_payload_mismatch:add_confirmed_quote_item'],
      },
    });

    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导入材料包' }));

    await waitFor(() => {
      expect(screen.getAllByText('材料收集包导入失败：报价决策未应用。').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /生成与校验/ })).toHaveClass('is-active');
      expect(screen.getByText('报价决策校验')).toBeInTheDocument();
      expect(screen.getByText('quote_resolution_action_payload_mismatch:add_confirmed_quote_item')).toBeInTheDocument();
    });
  });

  it('imports project config and replaces the current page state', async () => {
    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导出材料包' }));

    await waitFor(() => {
      expect(screen.getByLabelText('最近材料包状态')).toHaveTextContent('/tmp/material-package/asset-manifest.schema.json');
    });

    fireEvent.click(screen.getByRole('button', { name: '导入配置' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.importProjectConfig).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /项目数据/ })).toHaveClass('is-active');
      expect(screen.getByDisplayValue('通用完整标书样例项目')).toBeInTheDocument();
      expect(screen.getAllByText('完整标书项目配置 JSON 已导入，校验未通过，请查看构建日志。').length).toBeGreaterThan(0);
    });

    expect(screen.queryByLabelText('最近材料包状态')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /生成与校验/ }));
    expect(screen.getByText('missing_assets:qualification_scan')).toBeInTheDocument();
  });

  it('shows the build log when project config import fails with validation details', async () => {
    const importProjectConfigMock = window.yibiao?.bidDocument.importProjectConfig as unknown as ReturnType<typeof vi.fn>;
    importProjectConfigMock.mockResolvedValueOnce({
      success: false,
      message: '项目配置导入失败：模板定义校验未通过。',
      buildLog: {
        templateCheck: { passed: true, errors: [] },
        quoteCheck: { passed: true, errors: [] },
        assetCheck: { passed: false, errors: ['missing_assets:qualification_scan'] },
        passed: false,
        errors: ['missing_assets:qualification_scan'],
      },
    });

    renderPage();

    await screen.findAllByText('智慧食堂响应文件模板');
    fireEvent.click(screen.getByRole('button', { name: '导入配置' }));

    await waitFor(() => {
      expect(screen.getAllByText('项目配置导入失败：模板定义校验未通过。').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /生成与校验/ })).toHaveClass('is-active');
      expect(screen.getByText('missing_assets:qualification_scan')).toBeInTheDocument();
    });
  });

  it('toggles optional template sections and submits disabled section ids to validation', async () => {
    renderPage();

    const templateSelect = await screen.findByDisplayValue('智慧食堂响应文件模板');
    fireEvent.change(templateSelect, { target: { value: 'generic-response' } });
    await waitFor(() => expect(screen.getAllByText('通用响应文件模板')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /模板预览/ }));
    fireEvent.click(screen.getByLabelText('启用 · backup-service'));
    fireEvent.click(screen.getByRole('button', { name: '运行校验' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.validate).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          disabledSectionIds: ['backup-service'],
        }),
      }));
    });
  });

  it('keeps missing asset wording in build logs instead of the asset row placeholder', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /附件资产/ }));
    const assetRow = await screen.findByText('营业执照');
    expect(within(assetRow.closest('.bid-document-asset-row') as HTMLElement).getByText('未选择附件')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '运行校验' }));
    fireEvent.click(screen.getByRole('button', { name: /生成与校验/ }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.validate).toHaveBeenCalled();
      expect(screen.getByText('missing_assets:business_license')).toBeInTheDocument();
      expect(screen.getByText('Word 禁用词复检')).toBeInTheDocument();
    });
    expect(screen.queryByText('报价决策校验')).not.toBeInTheDocument();
    const docxOpenRow = screen.getByText('docx 打开校验').closest('.bid-document-check-row') as HTMLElement;
    expect(within(docxOpenRow).getByText('未运行')).toBeInTheDocument();
    expect(screen.queryByText('not_run')).not.toBeInTheDocument();
  });

  it('passes the asset type to the desktop file picker', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /附件资产/ }));
    const assetRow = (await screen.findByText('营业执照')).closest('.bid-document-asset-row') as HTMLElement;
    fireEvent.click(within(assetRow).getByRole('button', { name: '选择文件' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.selectAsset).toHaveBeenCalledWith({
        key: 'business_license',
        title: '营业执照',
        type: 'image',
      });
    });
  });

  it('marks assets under disabled optional sections as not participating in the build', async () => {
    renderPage();

    const templateSelect = await screen.findByDisplayValue('智慧食堂响应文件模板');
    fireEvent.change(templateSelect, { target: { value: 'generic-response' } });
    await waitFor(() => expect(screen.getAllByText('通用响应文件模板')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /模板预览/ }));
    fireEvent.click(screen.getByLabelText('启用 · backup-service'));
    fireEvent.click(screen.getByRole('button', { name: /附件资产/ }));

    const assetRow = (await screen.findByText('后备服务证明材料')).closest('.bid-document-asset-row') as HTMLElement;
    expect(within(assetRow).getByText('可选材料')).toBeInTheDocument();
    expect(within(assetRow).getByText('原始文件')).toBeInTheDocument();
    expect(within(assetRow).getByText('章节已关闭')).toBeInTheDocument();
  });

  it('edits payment terms and submits the current terms to validation', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /项目数据/ }));
    fireEvent.change(screen.getByLabelText('税率口径说明'), { target: { value: '按采购文件约定的适用税率执行' } });
    fireEvent.change(screen.getByLabelText('综合税率'), { target: { value: '0.09' } });

    const paymentText = await screen.findByDisplayValue('使用时间 12 个月后无质量问题，支付总价款。');
    fireEvent.change(paymentText, { target: { value: '使用时间 3 个月后无质量问题，支付总价款。' } });

    const ratioInput = screen.getByDisplayValue('100');
    fireEvent.change(ratioInput, { target: { value: '90' } });

    fireEvent.click(screen.getByRole('button', { name: '新增付款节点' }));

    fireEvent.click(screen.getByRole('button', { name: '运行校验' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.validate).toHaveBeenCalledWith(expect.objectContaining({
        projectData: expect.objectContaining({
          taxPolicy: expect.objectContaining({
            description: '按采购文件约定的适用税率执行',
            defaultRate: 0.09,
          }),
          paymentTerms: expect.arrayContaining([
            expect.objectContaining({
              ratio: 90,
              text: '使用时间 3 个月后无质量问题，支付总价款。',
            }),
            expect.objectContaining({
              stage: '',
              ratio: 0,
              text: '',
            }),
          ]),
        }),
      }));
    });
  });

  it('adds editable quote rows and submits them to validation', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /项目数据/ }));
    fireEvent.click(screen.getByRole('button', { name: '新增报价项' }));

    fireEvent.change(screen.getByLabelText('报价项名称 2'), { target: { value: '实施服务' } });
    fireEvent.change(screen.getByLabelText('报价项品牌型号 2'), { target: { value: 'SVC-IMPL-01' } });
    fireEvent.change(screen.getByLabelText('报价项含税单价 2'), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('报价项含税总价 2'), { target: { value: '2000' } });

    fireEvent.click(screen.getByRole('button', { name: '运行校验' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.validate).toHaveBeenCalledWith(expect.objectContaining({
        quoteItems: expect.arrayContaining([
          expect.objectContaining({
            name: '实施服务',
            quantity: 1,
            brandModel: 'SVC-IMPL-01',
            unitPriceWithTax: 2000,
            totalWithTax: 2000,
            category: 'other',
          }),
        ]),
      }));
    });
  });

  it('runs reference alignment from the build step and renders the alignment summary', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /生成与校验/ }));
    fireEvent.click(screen.getByRole('button', { name: '选择参考并对齐' }));

    await waitFor(() => {
      expect(window.yibiao?.bidDocument.analyzeReference).toHaveBeenCalledWith({ candidatePath: undefined });
      expect(screen.getAllByText('参考响应文件结构对齐未通过，请查看差异。').length).toBeGreaterThan(0);
      expect(screen.getByText('missing headings: 1:六、技术方案')).toBeInTheDocument();
      expect(screen.getByText('缺失标题 1')).toBeInTheDocument();
    });
  });
});
