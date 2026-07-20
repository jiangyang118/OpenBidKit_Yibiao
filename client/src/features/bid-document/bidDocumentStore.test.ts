// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { BidDocumentBuildLog } from './types';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { createBidDocumentStore } = require('../../../electron/services/bidDocumentStore.cjs') as {
  createBidDocumentStore: (options: { app: { getPath: (name: string) => string }; db?: any }) => {
    loadState: () => Record<string, any>;
    saveState: (payload?: Record<string, unknown>) => Record<string, any>;
    selectAsset: (options: { key: string; title: string }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; message: string }>;
    analyzeReference: (options?: { referencePath?: string; candidatePath?: string }) => Promise<{ success: boolean; message: string; alignment?: { passed: boolean } }>;
    exportTemplateInfo: (options?: { templateId?: string; filePath?: string }) => Promise<{ success: boolean; filePath?: string; templateInfo?: Record<string, any> }>;
    exportProjectConfig: (options?: Record<string, unknown> & { filePath?: string }) => Promise<{ success: boolean; message: string; filePath?: string; schemaPath?: string; projectConfig?: Record<string, any>; assetPackage?: Record<string, any> }>;
    exportReadinessReport: (options?: Record<string, unknown> & { filePath?: string; jsonPath?: string; xlsxPath?: string }) => Promise<{ success: boolean; readinessReady?: boolean; message: string; markdownPath?: string; jsonPath?: string; xlsxPath?: string; readinessReport?: Record<string, any>; buildLog?: BidDocumentBuildLog }>;
    exportAssetCollectionPackage: (options?: Record<string, unknown> & { outputDir?: string }) => Promise<{ success: boolean; readinessReady?: boolean; message: string; outputDir?: string; markdownPath?: string; manifestPath?: string; manifestSchemaPath?: string; quoteResolutionPath?: string; quoteResolutionSchemaPath?: string; assetsDir?: string; assetCount?: number; demoOnlyAssetCount?: number; replacementRequiredAssetCount?: number; missingRequiredAssetCount?: number; readinessReport?: Record<string, any>; buildLog?: BidDocumentBuildLog }>;
    importAssetCollectionPackage: (options?: Record<string, unknown> & { packageDir?: string }) => Promise<{ success: boolean; validationPassed?: boolean; message: string; packageDir?: string; manifestPath?: string; manifestSchemaPath?: string; quoteResolutionPath?: string; quoteResolutionApplied?: boolean; quoteResolutionAction?: string; quoteResolutionErrors?: string[]; appliedCount?: number; missingRequiredCount?: number; state?: Record<string, any>; buildLog?: BidDocumentBuildLog }>;
    importProjectConfig: (options?: { filePath?: string }) => Promise<{ success: boolean; validationPassed?: boolean; message: string; filePath?: string; state?: Record<string, any>; buildLog?: BidDocumentBuildLog }>;
    validate: (payload?: Record<string, unknown>) => { success: boolean; buildLog: BidDocumentBuildLog };
    exportWord: (options?: Record<string, unknown> & { filePath?: string }) => Promise<{ success: boolean; message: string; filePath?: string; buildLog: BidDocumentBuildLog }>;
  };
};
const { createBidDocumentSample } = require('../../../electron/services/bidDocumentTemplates.cjs') as {
  createBidDocumentSample: (options?: Record<string, unknown>) => Record<string, any>;
};
const { writeBidDocumentWordFile } = require('../../../electron/services/bidDocumentWordBuilder.cjs') as {
  writeBidDocumentWordFile: (input: Record<string, unknown>, outputPath: string) => Promise<{ success: boolean; filePath: string }>;
};
const { DOCUMENT_ASSET_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } = require('../../../electron/services/bidDocumentAssets.cjs') as {
  DOCUMENT_ASSET_EXTENSIONS: string[];
  SUPPORTED_IMAGE_EXTENSIONS: string[];
};
const {
  classifyReadinessErrors,
  createReadinessReport,
  extractReadinessMissingAssets,
  renderReadinessReportMarkdown,
} = require('../../../electron/services/bidDocumentReadinessReport.cjs') as {
  classifyReadinessErrors: (errors: string[]) => Record<string, string[]>;
  createReadinessReport: (input: Record<string, unknown>, buildLog: BidDocumentBuildLog) => Record<string, unknown>;
  extractReadinessMissingAssets: (assetMap: Record<string, unknown>, buildLog: BidDocumentBuildLog) => Array<Record<string, unknown>>;
  renderReadinessReportMarkdown: (report: Record<string, unknown>) => string;
};
const {
  readBidDocumentProjectConfig,
  resolveProjectConfigAssetMap,
} = require('../../../electron/services/bidDocumentProjectConfig.cjs') as {
  readBidDocumentProjectConfig: (filePath: string) => Record<string, any>;
  resolveProjectConfigAssetMap: (assetMap: Record<string, any>, configPath: string) => Record<string, any>;
};

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function expectCompleteTemplateErrorBuildLog(buildLog: BidDocumentBuildLog | undefined, templateId = 'unknown-response-template') {
  expect(buildLog).toBeDefined();
  expect(buildLog?.passed).toBe(false);
  expect(buildLog?.templateCheck.passed).toBe(false);
  expect(buildLog?.templateCheck.details.templateId).toBe(templateId);
  expect(buildLog?.quoteCheck.errors).toEqual(['not_run']);
  expect(buildLog?.paymentCheck.errors).toEqual(['not_run']);
  expect(buildLog?.assetCheck.errors).toEqual(['not_run']);
  expect(buildLog?.docxForbiddenWordsCheck.errors).toEqual(['not_run']);
  expect(Object.keys(buildLog || {})).toEqual(expect.arrayContaining([
    'templateCheck',
    'quoteCheck',
    'paymentCheck',
    'titleCheck',
    'identityCheck',
    'forbiddenWordsCheck',
    'assetCheck',
    'sectionSelectionCheck',
    'sectionCheck',
    'docxOpenCheck',
    'docxContentCheck',
    'docxSectionOrderCheck',
    'docxTableCheck',
    'docxQuoteIntegrityCheck',
    'docxLayoutCheck',
    'docxTocCheck',
    'docxStyleCheck',
    'docxTechnicalDensityCheck',
    'docxPageBreakCheck',
    'imageInsertionCheck',
    'docxAssetPlacementCheck',
    'docxForbiddenWordsCheck',
    'passed',
    'errors',
  ]));
}

function createFakeBidDocumentDb() {
  let row: Record<string, any> | null = null;
  return {
    prepare: (sql: string) => ({
      get: () => row,
      run: (params: Record<string, any>) => {
        row = {
          id: 1,
          template_id: params.templateId,
          project_data_json: params.projectDataJson,
          quote_items_json: params.quoteItemsJson,
          asset_map_json: params.assetMapJson,
          asset_package_json: params.assetPackageJson,
          last_build_log_json: params.lastBuildLogJson,
          created_at: params.timestamp,
          updated_at: params.timestamp,
        };
        return { changes: 1 };
      },
      all: () => {
        if (/SELECT/i.test(sql) && row) return [row];
        return [];
      },
    }),
    readRow: () => row,
    cleanup: () => {
      row = null;
    },
  };
}

function createFakeBidDocumentDbWithRow(row: Record<string, any>) {
  return {
    prepare: () => ({
      get: () => row,
      run: (params: Record<string, any>) => {
        Object.assign(row, {
          id: 1,
          template_id: params.templateId,
          project_data_json: params.projectDataJson,
          quote_items_json: params.quoteItemsJson,
          asset_map_json: params.assetMapJson,
          asset_package_json: params.assetPackageJson,
          last_build_log_json: params.lastBuildLogJson,
          created_at: row.created_at || params.timestamp,
          updated_at: params.timestamp,
        });
        return { changes: 1 };
      },
      all: () => [row],
    }),
    readRow: () => row,
  };
}

function loadSmartCanteenState(store: ReturnType<typeof createBidDocumentStore>) {
  return store.saveState({ templateId: 'smart-canteen-response' });
}

describe('bid document store', () => {
  it('starts new bid document workspaces from the generic template', () => {
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      const state = store.loadState();
      const row = temp.readRow();

      expect(state.template.id).toBe('generic-response');
      expect(state.projectData.templateId).toBe('generic-response');
      expect(state.projectData.projectName).toBe('通用完整标书样例项目');
      expect(JSON.parse(row!.project_data_json).templateId).toBe('generic-response');
    } finally {
      temp.cleanup();
    }
  });

  it('uses a shared project config reader for envelope validation and relative asset paths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-config-'));
    const configPath = path.join(tempDir, 'project-config.json');
    const sample = createBidDocumentSample({ templateId: 'generic-response' });
    fs.writeFileSync(configPath, JSON.stringify({
      bidDocument: {
        version: 1,
        templateId: sample.template.id,
        projectData: sample.projectData,
        quoteItems: sample.quoteItems,
        assetMap: {
          qualification_scan: {
            ...sample.assetMap.qualification_scan,
            filePath: './project-config.assets/qualification_scan.png',
          },
        },
      },
    }, null, 2), 'utf8');

    const projectConfig = readBidDocumentProjectConfig(configPath);
    const assetMap = resolveProjectConfigAssetMap(projectConfig.assetMap, configPath);

    expect(projectConfig.templateId).toBe('generic-response');
    expect(assetMap.qualification_scan.filePath).toBe(path.join(tempDir, 'project-config.assets', 'qualification_scan.png'));

    const invalidPath = path.join(tempDir, 'invalid-config.json');
    fs.writeFileSync(invalidPath, JSON.stringify({
      version: 1,
      projectData: sample.projectData,
      quoteItems: sample.quoteItems,
      assetMap: sample.assetMap,
    }, null, 2), 'utf8');
    expect(() => readBidDocumentProjectConfig(invalidPath)).toThrow('invalid_project_config:missing_templateId');

    const mismatchPath = path.join(tempDir, 'mismatch-config.json');
    fs.writeFileSync(mismatchPath, JSON.stringify({
      version: 1,
      templateId: 'generic-response',
      projectData: {
        ...sample.projectData,
        templateId: 'smart-canteen-response',
      },
      quoteItems: sample.quoteItems,
      assetMap: sample.assetMap,
    }, null, 2), 'utf8');
    expect(() => readBidDocumentProjectConfig(mismatchPath)).toThrow(
      'invalid_project_config:templateId_mismatch:generic-response:smart-canteen-response',
    );
  });

  function createTempSampleDocx() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-store-'));
    const sample = createBidDocumentSample({ templateId: 'generic-response' });
    sample.assetMap = Object.fromEntries(Object.entries(sample.assetMap).map(([key, asset]: [string, any]) => {
      const filePath = path.join(tempDir, `${key}.png`);
      fs.writeFileSync(filePath, Buffer.from(TINY_PNG_BASE64, 'base64'));
      return [key, { ...asset, filePath }];
    }));
    return {
      tempDir,
      sample,
      outputPath: path.join(tempDir, 'generic-response-sample.docx'),
    };
  }

  it('selects a real asset path through the desktop file picker', async () => {
    const showOpenDialogMock = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/license.png'] });
    const store = createBidDocumentStore({
      app: { getPath: () => '/tmp' },
      dialog: { showOpenDialog: showOpenDialogMock },
    } as any);

    const result = await store.selectAsset({ key: 'business_license', title: '营业执照', type: 'image' } as any);

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('/tmp/license.png');
    expect(showOpenDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '选择营业执照',
      properties: ['openFile'],
      filters: [{ name: '图片或扫描件', extensions: SUPPORTED_IMAGE_EXTENSIONS }],
    }));
  });

  it('allows document assets to select original proof files', async () => {
    const showOpenDialogMock = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/case-proof.pdf'] });
    const store = createBidDocumentStore({
      app: { getPath: () => '/tmp' },
      dialog: { showOpenDialog: showOpenDialogMock },
    } as any);

    const result = await store.selectAsset({ key: 'contract_case_scan', title: '合同案例证明', type: 'document' } as any);

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('/tmp/case-proof.pdf');
    expect(showOpenDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '选择合同案例证明',
      properties: ['openFile'],
      filters: [
        { name: '原始文件或证明材料', extensions: DOCUMENT_ASSET_EXTENSIONS },
        { name: '所有文件', extensions: ['*'] },
      ],
    }));
  });

  it('aligns a generated candidate document against a selected reference document', async () => {
    const { sample, outputPath } = createTempSampleDocx();
    const writeResult = await writeBidDocumentWordFile(sample, outputPath);
    expect(writeResult.success).toBe(true);

    const showOpenDialogMock = vi
      .fn()
      .mockResolvedValueOnce({ canceled: false, filePaths: [outputPath] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [outputPath] });
    const store = createBidDocumentStore({
      app: { getPath: () => '/tmp' },
      dialog: { showOpenDialog: showOpenDialogMock },
    } as any);

    const result = await store.analyzeReference();

    expect(result.success).toBe(true);
    expect(result.alignment?.passed).toBe(true);
    expect(showOpenDialogMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: '选择参考响应文件',
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    }));
    expect(showOpenDialogMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: '选择候选生成文件',
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    }));
  });

  it('exports template schema and asset mapping through the desktop save dialog', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-template-info-'));
    const outputPath = path.join(tempDir, 'smart-canteen-template-info.json');
    const showSaveDialogMock = vi.fn().mockResolvedValue({ canceled: false, filePath: outputPath });
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
      dialog: { showSaveDialog: showSaveDialogMock },
    } as any);

    const result = await store.exportTemplateInfo({ templateId: 'smart-canteen-response' });

    expect(result.success).toBe(true);
    expect(result.filePath).toBe(outputPath);
    expect(showSaveDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '导出完整标书模板配置 JSON',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    }));
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(exported.schema.BidDocumentAssetRef).toBeDefined();
    expect(exported.templates[0].asset_mapping_example.business_license.title).toBe('营业执照');
    expect(exported.templates[0].sample_quote_items.reduce((sum: number, item: any) => sum + item.totalWithTax, 0)).toBe(133050);
  });

  it('exports the current project config as portable JSON with a sidecar asset directory', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-config-'));
    const outputPath = path.join(tempDir, 'project-config.json');
    const showSaveDialogMock = vi.fn().mockResolvedValue({ canceled: false, filePath: outputPath });
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
      dialog: { showSaveDialog: showSaveDialogMock },
    } as any);
    const state = store.saveState({ templateId: 'generic-response' });
    const sourceAssetPath = path.join(tempDir, 'source-qualification.png');
    fs.writeFileSync(sourceAssetPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

    const result = await store.exportProjectConfig({
      ...state,
      assetMap: {
        ...state.assetMap,
        qualification_scan: {
          ...state.assetMap.qualification_scan,
          filePath: sourceAssetPath,
        },
      },
      filePath: outputPath,
    });

    expect(result.success).toBe(true);
    expect(result.filePath).toBe(outputPath);
    expect(result.schemaPath).toBe(path.join(tempDir, 'project-config.schema.json'));
    expect(result.message).toContain('复制 1 个附件');
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const exportedSchema = JSON.parse(fs.readFileSync(path.join(tempDir, 'project-config.schema.json'), 'utf8'));
    expect(exported.version).toBe(1);
    expect(exported.templateId).toBe('generic-response');
    expect(exported.projectData.projectName).toBe('通用完整标书样例项目');
    expect(exported.quoteItems.map((item: any) => item.brandModel)).toEqual(['GEN-SYS V1.0', 'GEN-DEVICE-100']);
    expect(exported.assetPackage).toMatchObject({
      type: 'sidecar-directory',
      path: './project-config.assets',
      copiedCount: 1,
    });
    expect(exported.assetMap.qualification_scan.filePath).toBe('./project-config.assets/qualification_scan.png');
    expect(fs.existsSync(path.join(tempDir, 'project-config.assets', 'qualification_scan.png'))).toBe(true);
    expect(exportedSchema.templateId).toBe('generic-response');
    expect(exportedSchema.required).toContain('assetMap');
    expect(exportedSchema.assetRefFields.filePath).toContain('relative');
  });

  it('returns a controlled canceled result when project config export is canceled', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-config-cancel-'));
    const showSaveDialogMock = vi.fn().mockResolvedValue({ canceled: true });
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
      dialog: { showSaveDialog: showSaveDialogMock },
    } as any);

    const result = await store.exportProjectConfig();

    expect(result.success).toBe(false);
    expect((result as any).canceled).toBe(true);
    expect(result.message).toBe('已取消导出项目配置');
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });

  it('preserves demo asset package metadata and blocks desktop formal Word export', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-demo-assets-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    const outputDocx = path.join(tempDir, 'should-not-exist.docx');
    const assetDir = path.join(tempDir, 'project-config.assets');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, 'qualification_scan.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(path.join(assetDir, 'solution_screenshot.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(path.join(assetDir, 'contract_case_scan.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 1,
      templateId: 'generic-response',
      projectData: {
        templateId: 'generic-response',
        projectName: 'Demo 附件阻断测试',
        purchaserName: '测试采购人',
        supplierName: '测试供应商',
        totalWithTax: 300,
        totalWithoutTax: 265.49,
        taxPolicy: { defaultRate: 0.13 },
        paymentTerms: [
          { stage: '到货', ratio: 50, text: '设备到现场支付合同总价款的 50%。' },
          { stage: '验收', ratio: 50, text: '设备调试合格后支付合同总价款的 50%。' },
        ],
      },
      quoteItems: [
        { name: '样例管理系统', quantity: 1, brandModel: 'GEN-SYS V1.0', unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13, category: 'software' },
        { name: '样例终端设备', quantity: 2, brandModel: 'GEN-DEVICE-100', unitPriceWithTax: 100, totalWithTax: 200, taxRate: 0.13, category: 'hardware' },
      ],
      assetMap: {
        qualification_scan: { key: 'qualification_scan', title: '资质证明扫描件', filePath: './project-config.assets/qualification_scan.png', type: 'image', required: true, sectionId: 'supplier-basic-info', templateId: 'generic-response' },
        solution_screenshot: { key: 'solution_screenshot', title: '系统或产品截图', filePath: './project-config.assets/solution_screenshot.png', type: 'image', required: true, sectionId: 'technical-solution', templateId: 'generic-response' },
        contract_case_scan: { key: 'contract_case_scan', title: '合同案例证明扫描件', filePath: './project-config.assets/contract_case_scan.png', type: 'image', required: true, sectionId: 'other-materials', templateId: 'generic-response' },
      },
      assetPackage: {
        type: 'sidecar-directory',
        path: './project-config.assets',
        copiedCount: 3,
        demoOnly: true,
      },
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const imported = await store.importProjectConfig({ filePath: inputPath });
      expect(imported.success).toBe(true);
      expect(imported.validationPassed).toBe(false);
      expect(imported.state?.assetPackage?.demoOnly).toBe(true);
      expect(imported.buildLog?.errors.join('\n')).toContain('demo_assets_not_allowed_for_formal_build');

      const exported = await store.exportWord({
        ...(imported.state || {}),
        filePath: outputDocx,
      });

      expect(exported.success).toBe(false);
      expect(exported.message).toBe('当前项目配置使用演示附件包，未生成 Word。');
      expect(exported.buildLog.errors.join('\n')).toContain('demo_assets_not_allowed_for_formal_build');
      expect(fs.existsSync(outputDocx)).toBe(false);

      const reloadedStore = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });
      const reloaded = reloadedStore.loadState();
      expect(reloaded.assetPackage.demoOnly).toBe(true);
    } finally {
      temp.cleanup();
    }
  });

  it('exports a desktop readiness report without generating Word', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-readiness-'));
    const markdownPath = path.join(tempDir, 'readiness.md');
    const jsonPath = path.join(tempDir, 'readiness.json');
    const xlsxPath = path.join(tempDir, 'readiness.xlsx');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const quoteItems = state.quoteItems.map((item: Record<string, any>, index: number) => index === 0 ? {
      ...item,
      name: '智慧食堂管理系统 | 手机端',
    } : item);
    const assetMap = {
      ...state.assetMap,
      business_license: {
        ...state.assetMap.business_license,
        title: '营业执照 | 复印件\n盖章',
      },
    };

    const result = await store.exportReadinessReport({
      ...state,
      projectData: {
        ...state.projectData,
        projectName: '智慧餐厅 | 改造\n正式项目',
      },
      quoteItems,
      assetMap,
      filePath: markdownPath,
      jsonPath,
      xlsxPath,
    });

    expect(result.success).toBe(true);
    expect(result.readinessReady).toBe(false);
    expect(result.markdownPath).toBe(markdownPath);
    expect(result.jsonPath).toBe(jsonPath);
    expect(result.xlsxPath).toBe(xlsxPath);
    expect(result.buildLog?.passed).toBe(false);
    expect(result.readinessReport?.quoteDifference).toBe(2000);
    expect(result.readinessReport?.blockers).toHaveProperty('quote');
    expect(result.readinessReport).toEqual(createReadinessReport({
      ...state,
      projectData: {
        ...state.projectData,
        projectName: '智慧餐厅 | 改造\n正式项目',
      },
      quoteItems,
      assetMap,
    }, result.buildLog as BidDocumentBuildLog));
    expect(result.readinessReport?.blockers).toEqual(classifyReadinessErrors(result.buildLog?.errors || []));
    expect(result.readinessReport?.missingAssets).toEqual(extractReadinessMissingAssets(assetMap, result.buildLog as BidDocumentBuildLog));
    expect(fs.existsSync(markdownPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(xlsxPath)).toBe(true);
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    expect(markdown).toBe(renderReadinessReportMarkdown(result.readinessReport || {}));
    expect(markdown).toContain('# 标书正式构建准备度报告');
    expect(markdown).toContain('- 项目名称：智慧餐厅 \\| 改造 正式项目');
    expect(markdown).not.toContain('- 项目名称：智慧餐厅 | 改造\n正式项目');
    expect(markdown).toContain('报价差额：2000');
    expect(markdown).toContain('## 报价核对');
    expect(markdown).toContain('智慧食堂管理系统 \\| 手机端');
    expect(markdown).toContain('CPT-Nutr-GMSC450-LITE');
    expect(markdown).toContain('## 报价差额处理建议');
    expect(markdown).toContain('新增经确认的真实分项');
    expect(markdown).toContain('## 附件清单');
    expect(markdown).toContain('business_license');
    expect(markdown).toContain('营业执照 \\| 复印件<br>盖章');
    expect(markdown).not.toContain('| business_license | 营业执照 | 复印件');
    expect(markdown).toContain('必填缺失');
    expect(markdown).toContain('missing_assets:business_license');
    expect(markdown).toContain('| docxOpenCheck | 未运行 | 1 |');
    const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(saved.readinessReport.ready).toBe(false);
    expect(saved.readinessReport.quoteReconciliation.items.some((item: Record<string, unknown>) => String(item.brandModel).includes('CPT-Nutr-GMSC450-LITE'))).toBe(true);
    expect(saved.readinessReport.quoteResolutionActions.some((item: Record<string, unknown>) => item.key === 'add_confirmed_quote_item')).toBe(true);
    expect(saved.readinessReport.assetInventory.some((asset: Record<string, unknown>) => asset.key === 'business_license' && asset.status === 'missing_required')).toBe(true);
    const workbook = new AdmZip(xlsxPath);
    const entries = new Set(workbook.getEntries().map((entry: { entryName: string }) => entry.entryName));
    expect(entries.has('xl/workbook.xml')).toBe(true);
    expect(entries.has('xl/worksheets/sheet1.xml')).toBe(true);
    expect(entries.has('xl/worksheets/sheet2.xml')).toBe(true);
    expect(entries.has('xl/worksheets/sheet6.xml')).toBe(true);
    const workbookXml = workbook.readAsText('xl/workbook.xml');
    const overviewSheet = workbook.readAsText('xl/worksheets/sheet1.xml');
    const quoteSheet = workbook.readAsText('xl/worksheets/sheet2.xml');
    const blockersSheet = workbook.readAsText('xl/worksheets/sheet3.xml');
    const assetInventorySheet = workbook.readAsText('xl/worksheets/sheet4.xml');
    const stylesXml = workbook.readAsText('xl/styles.xml');
    expect(workbookXml).toContain('概览');
    expect(workbookXml).toContain('报价核对');
    expect(workbookXml).toContain('阻断项');
    expect(workbookXml).toContain('附件清单');
    expect(workbookXml).toContain('校验项');
    expect(overviewSheet).toContain('报价差额');
    expect(overviewSheet).toContain('2000');
    expect(quoteSheet).toContain('CPT-Nutr-GMSC450-LITE');
    expect(quoteSheet).toContain('项目级差额');
    expect(quoteSheet).toContain('新增经确认的真实分项');
    expect(blockersSheet).toContain('quote_items total should equal project totalWithTax');
    expect(assetInventorySheet).toContain('business_license');
    expect(assetInventorySheet).toContain('必填缺失');
    expect(stylesXml).toContain('微软雅黑');
  });

  it('exports a material collection package from the current draft', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-asset-package-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);

    const result = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.readinessReady).toBe(false);
    expect(result.outputDir).toBe(outputDir);
    expect(result.assetCount).toBeGreaterThan(0);
    expect(result.demoOnlyAssetCount).toBe(0);
    expect(result.replacementRequiredAssetCount).toBe(0);
    expect(result.buildLog?.passed).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'asset-manifest.json'))).toBe(true);
    expect(result.manifestSchemaPath).toBe(path.join(outputDir, 'asset-manifest.schema.json'));
    expect(fs.existsSync(path.join(outputDir, 'asset-manifest.schema.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'quote-resolution.json'))).toBe(true);
    expect(result.quoteResolutionSchemaPath).toBe(path.join(outputDir, 'quote-resolution.schema.json'));
    expect(fs.existsSync(path.join(outputDir, 'quote-resolution.schema.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '材料收集清单.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'assets'))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'asset-manifest.json'), 'utf8'));
    expect(manifest.projectName).toBe('智慧餐厅称重系统改造');
    expect(manifest.quoteDifference).toBe(2000);
    expect(manifest.replacementRequiredAssetCount).toBe(0);
    expect(manifest.readinessIssues.some((issue: Record<string, unknown>) => String(issue.error).includes('quote_items total should equal project totalWithTax'))).toBe(true);
    expect(manifest.quoteResolutionActions.some((action: Record<string, unknown>) => action.key === 'add_confirmed_quote_item')).toBe(true);
    expect(manifest.assets.some((asset: Record<string, unknown>) => asset.key === 'business_license' && asset.status === 'missing_required')).toBe(true);
    const manifestSchema = JSON.parse(fs.readFileSync(path.join(outputDir, 'asset-manifest.schema.json'), 'utf8'));
    expect(manifestSchema.statusEnum).toContain('demo_only');
    expect(manifestSchema.counters.replacementRequiredAssetCount).toBe('number');
    const markdown = fs.readFileSync(path.join(outputDir, '材料收集清单.md'), 'utf8');
    expect(markdown).toContain('# 标书材料收集清单');
    expect(markdown).toContain('| key | 材料名称 | 章节 | 必填 | 类型 | 状态 | 目标目录 | 建议文件名 | 处理说明 |');
    expect(markdown).toContain('## 正式构建阻断项');
    expect(markdown).toContain('quote_items total should equal project totalWithTax');
    expect(markdown).toContain('## 报价差额处理建议');
    expect(markdown).toContain('新增经确认的真实分项');
    expect(markdown).toContain('business_license');
    expect(markdown).toContain('image');
    expect(markdown).toContain('必须提供真实扫描件、截图或设备图片后才能正式构建。');
    expect(markdown).toContain('必填缺失');
    const quoteResolution = JSON.parse(fs.readFileSync(path.join(outputDir, 'quote-resolution.json'), 'utf8'));
    expect(quoteResolution.status).toBe('requires_manual_confirmation');
    expect(quoteResolution.actionRules.confirm_project_total.allowedDataFields).toEqual(['projectDataPatch']);
    expect(quoteResolution.allowedActions.some((action: Record<string, unknown>) => action.key === 'confirm_project_total')).toBe(true);
    const quoteResolutionSchema = JSON.parse(fs.readFileSync(path.join(outputDir, 'quote-resolution.schema.json'), 'utf8'));
    expect(quoteResolutionSchema.selectedActionEnum).toContain('add_confirmed_quote_item');
    expect(quoteResolutionSchema.identityRules.join('\n')).toContain('version must be 1');
    expect(quoteResolutionSchema.identityRules.join('\n')).toContain('quote_resolution_template_mismatch');
    expect(quoteResolutionSchema.actionRules.add_confirmed_quote_item.allowedDataFields).toEqual(['quoteItemsAppend']);
  });

  it('omits disabled optional section assets from desktop readiness report and material package', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-disabled-optional-assets-'));
    const markdownPath = path.join(tempDir, 'readiness.md');
    const jsonPath = path.join(tempDir, 'readiness.json');
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const sample = createBidDocumentSample({ templateId: 'generic-response' });
    sample.projectData.disabledSectionIds = ['backup-service'];
    sample.assetMap.backup_service_proof = {
      key: 'backup_service_proof',
      title: '待补后备服务证明材料',
      filePath: path.join(tempDir, 'missing-backup-service.png'),
      type: 'image',
      required: true,
      sectionId: 'backup-service',
      templateId: 'generic-response',
    };

    const readinessResult = await store.exportReadinessReport({
      ...sample,
      filePath: markdownPath,
      jsonPath,
    });
    const packageResult = await store.exportAssetCollectionPackage({
      ...sample,
      outputDir,
    });

    expect(readinessResult.success).toBe(true);
    expect(packageResult.success).toBe(true);
    expect(readinessResult.readinessReport?.assetInventory.map((asset: Record<string, unknown>) => asset.key)).not.toContain('backup_service_proof');
    const readinessMarkdown = fs.readFileSync(markdownPath, 'utf8');
    expect(readinessMarkdown).not.toContain('backup_service_proof');
    expect(readinessMarkdown).not.toContain('待补后备服务证明材料');
    const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(saved.readinessReport.assetInventory.map((asset: Record<string, unknown>) => asset.key)).not.toContain('backup_service_proof');
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'asset-manifest.json'), 'utf8'));
    expect(manifest.assets.map((asset: Record<string, unknown>) => asset.key)).not.toContain('backup_service_proof');
    const packageMarkdown = fs.readFileSync(path.join(outputDir, '材料收集清单.md'), 'utf8');
    expect(packageMarkdown).not.toContain('backup_service_proof');
    expect(packageMarkdown).not.toContain('待补后备服务证明材料');
  });

  it('sanitizes Windows reserved names in material package target files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-asset-package-safe-name-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const result = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
      assetMap: {
        ...state.assetMap,
        business_license: {
          ...state.assetMap.business_license,
          title: 'CON',
        },
      },
    });

    expect(result.success).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'asset-manifest.json'), 'utf8'));
    const businessLicense = manifest.assets.find((asset: Record<string, unknown>) => asset.key === 'business_license');
    expect(String(businessLicense.suggestedFileName)).toContain('_CON.png');
    expect(String(businessLicense.targetFile)).toContain('_CON.png');
    expect(String(businessLicense.targetFile)).not.toContain('/CON.png');
  });

  it('escapes markdown table cells in material collection package', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-asset-package-markdown-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const result = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
      projectData: {
        ...state.projectData,
        projectName: '智慧餐厅 | 改造\n正式项目',
      },
      assetMap: {
        ...state.assetMap,
        business_license: {
          ...state.assetMap.business_license,
          title: '营业执照 | 复印件\n盖章',
        },
      },
    });

    expect(result.success).toBe(true);
    const markdown = fs.readFileSync(path.join(outputDir, '材料收集清单.md'), 'utf8');
    expect(markdown).toContain('- 项目名称：智慧餐厅 \\| 改造 正式项目');
    expect(markdown).not.toContain('- 项目名称：智慧餐厅 | 改造\n正式项目');
    expect(markdown).toContain('营业执照 \\| 复印件<br>盖章');
    expect(markdown).not.toContain('| business_license | 营业执照 | 复印件');
  });

  it('imports a material collection package and applies collected asset paths', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-asset-package-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'asset-manifest.json'), 'utf8'));
    const businessLicense = manifest.assets.find((asset: Record<string, unknown>) => asset.key === 'business_license');
    const targetPath = path.join(outputDir, businessLicense.targetFile);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.validationPassed).toBe(false);
    expect(result.appliedCount).toBe(1);
    expect(result.missingRequiredCount).toBeGreaterThan(0);
    expect(result.manifestSchemaPath).toBe(path.join(outputDir, 'asset-manifest.schema.json'));
    expect(result.state?.assetMap.business_license.filePath).toBe(targetPath);
    expect(result.state?.assetMap.iso9001.filePath).toBe('');
    expect(result.buildLog?.errors.join('\n')).toContain('missing_assets:iso9001');
    expect(result.state?.assetPackage.demoOnly).toBe(false);
  });

  it('rejects unsupported material collection package manifest versions', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-asset-package-version-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const manifestPath = path.join(outputDir, 'asset-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('unsupported_asset_manifest_version:2');
    expect(result.packageDir).toBe(outputDir);
    expect(result.state).toBeUndefined();
  });

  it('returns a complete build log when material collection package template does not match the current template', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-asset-package-template-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const smartState = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...smartState,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const genericState = store.saveState({ templateId: 'generic-response' });

    const result = await store.importAssetCollectionPackage({
      ...genericState,
      packageDir: outputDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('材料收集包模板不匹配：smart-canteen-response 与当前模板 generic-response 不一致');
    expect(result.state).toBeUndefined();
    expect(result.buildLog?.passed).toBe(false);
    expect(result.buildLog?.quoteCheck.errors).toEqual(['not_run']);
    expect(result.buildLog?.docxForbiddenWordsCheck.errors).toEqual(['not_run']);
    expect(result.buildLog?.templateCheck.errors.join('\n')).toContain('asset_package_template_mismatch:smart-canteen-response:generic-response');
    expect(result.buildLog?.templateCheck.details).toMatchObject({
      error: 'asset_package_template_mismatch',
      manifestTemplateId: 'smart-canteen-response',
      currentTemplateId: 'generic-response',
    });
  });

  it('rejects material collection package asset target files outside the package directory', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-asset-package-target-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const manifestPath = path.join(outputDir, 'asset-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const businessLicense = manifest.assets.find((asset: Record<string, unknown>) => asset.key === 'business_license');
    businessLicense.targetFile = '../outside.png';
    fs.writeFileSync(path.join(tempDir, 'outside.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('invalid_asset_target_file:outside_package:business_license:../outside.png');
    expect(result.state).toBeUndefined();
  });

  it('imports a material collection package quote resolution decision', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-quote-resolution-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const quoteResolutionPath = path.join(outputDir, 'quote-resolution.json');
    const quoteResolution = JSON.parse(fs.readFileSync(quoteResolutionPath, 'utf8'));
    quoteResolution.selectedAction = 'confirm_project_total';
    quoteResolution.projectDataPatch = {
      totalWithTax: 133050,
      totalWithoutTax: 117743.36,
    };
    fs.writeFileSync(quoteResolutionPath, JSON.stringify(quoteResolution, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.quoteResolutionApplied).toBe(true);
    expect(result.quoteResolutionAction).toBe('confirm_project_total');
    expect(result.state?.projectData.totalWithTax).toBe(133050);
    expect(result.state?.quoteItems.reduce((sum: number, item: Record<string, number>) => sum + Number(item.totalWithTax || 0), 0)).toBe(133050);
    expect(result.buildLog?.errors.join('\n')).not.toContain('quote_items total should equal project totalWithTax');
    expect(result.state?.assetPackage.quoteResolutionApplied).toBe(true);
  });

  it('rejects quote resolution data that does not match the selected action', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-quote-resolution-invalid-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const quoteResolutionPath = path.join(outputDir, 'quote-resolution.json');
    const quoteResolution = JSON.parse(fs.readFileSync(quoteResolutionPath, 'utf8'));
    quoteResolution.selectedAction = 'confirm_project_total';
    quoteResolution.quoteItemsAppend = [{
      name: '未经确认的差额项',
      quantity: 1,
      brandModel: 'INVALID-ITEM',
      unitPriceWithTax: 2000,
      totalWithTax: 2000,
      taxRate: 0.13,
      category: 'other',
    }];
    fs.writeFileSync(quoteResolutionPath, JSON.stringify(quoteResolution, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.quoteResolutionApplied).toBe(false);
    expect(result.quoteResolutionErrors?.join('\n')).toContain('quote_resolution_action_requires_project_data_patch:confirm_project_total');
    expect(result.quoteResolutionErrors?.join('\n')).toContain('quote_resolution_action_forbids_quote_item_changes:confirm_project_total');
    expect(result.state?.projectData.totalWithTax).toBe(135050);
    expect(result.state?.quoteItems.some((item: Record<string, unknown>) => item.brandModel === 'INVALID-ITEM')).toBe(false);
    expect((result.buildLog as Record<string, any> | undefined)?.quoteResolutionCheck?.passed).toBe(false);
  });

  it('rejects quote resolution decisions whose applied quote rows fail formal tax policy validation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-quote-resolution-tax-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const quoteResolutionPath = path.join(outputDir, 'quote-resolution.json');
    const quoteResolution = JSON.parse(fs.readFileSync(quoteResolutionPath, 'utf8'));
    quoteResolution.selectedAction = 'add_confirmed_quote_item';
    quoteResolution.quoteItemsAppend = [{
      name: '经确认差额项',
      quantity: 1,
      brandModel: 'CONFIRMED-DIFF-ITEM',
      unitPriceWithTax: 2000,
      totalWithTax: 2000,
      taxRate: 0.06,
      category: 'software',
    }];
    fs.writeFileSync(quoteResolutionPath, JSON.stringify(quoteResolution, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.quoteResolutionApplied).toBe(false);
    expect(result.quoteResolutionErrors?.join('\n')).toContain('quote_resolution_post_apply_quote_check:quote_items[6] taxRate should match projectData.taxPolicy.softwareHardwareRate for software');
    expect(result.state?.quoteItems.some((item: Record<string, unknown>) => item.brandModel === 'CONFIRMED-DIFF-ITEM')).toBe(false);
    expect((result.buildLog as Record<string, any> | undefined)?.quoteResolutionCheck?.passed).toBe(false);
  });

  it('rejects quote resolution files from another template package', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-import-quote-resolution-template-'));
    const outputDir = path.join(tempDir, 'collection');
    const store = createBidDocumentStore({
      app: { getPath: () => tempDir },
    } as any);
    const state = loadSmartCanteenState(store);
    const exported = await store.exportAssetCollectionPackage({
      ...state,
      outputDir,
    });
    expect(exported.success).toBe(true);
    const quoteResolutionPath = path.join(outputDir, 'quote-resolution.json');
    const quoteResolution = JSON.parse(fs.readFileSync(quoteResolutionPath, 'utf8'));
    quoteResolution.templateId = 'generic-response';
    quoteResolution.selectedAction = 'confirm_project_total';
    quoteResolution.projectDataPatch = {
      totalWithTax: 133050,
      totalWithoutTax: 117743.36,
    };
    fs.writeFileSync(quoteResolutionPath, JSON.stringify(quoteResolution, null, 2), 'utf8');

    const result = await store.importAssetCollectionPackage({
      ...state,
      packageDir: outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.quoteResolutionApplied).toBe(false);
    expect(result.quoteResolutionErrors?.join('\n')).toContain('quote_resolution_template_mismatch:generic-response:smart-canteen-response');
    expect(result.state?.projectData.totalWithTax).toBe(135050);
  });

  it('imports project config JSON, resolves relative asset paths, validates it, and persists the imported draft', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-import-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    const assetDir = path.join(tempDir, 'project-config.assets');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, 'qualification_scan.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(path.join(assetDir, 'solution_screenshot.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(path.join(assetDir, 'contract_case_scan.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 1,
      templateId: 'generic-response',
      projectData: {
        templateId: 'generic-response',
        projectName: '导入项目配置测试',
        purchaserName: '导入采购人',
        supplierName: '导入供应商',
        totalWithTax: 500,
        totalWithoutTax: 442.48,
        taxPolicy: { defaultRate: 0.13 },
        paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付 100%。' }],
      },
      quoteItems: [
        { name: '导入系统', quantity: 1, brandModel: 'IMPORT-SYS', unitPriceWithTax: 500, totalWithTax: 500 },
      ],
      assetMap: {
        qualification_scan: {
          key: 'qualification_scan',
          title: '资质证明扫描件',
          filePath: './project-config.assets/qualification_scan.png',
          type: 'image',
          required: true,
          sectionId: 'supplier-basic-info',
          templateId: 'generic-response',
        },
        solution_screenshot: {
          key: 'solution_screenshot',
          title: '系统或产品截图',
          filePath: './project-config.assets/solution_screenshot.png',
          type: 'image',
          required: true,
          sectionId: 'technical-solution',
          templateId: 'generic-response',
        },
        contract_case_scan: {
          key: 'contract_case_scan',
          title: '合同案例证明扫描件',
          filePath: './project-config.assets/contract_case_scan.png',
          type: 'image',
          required: true,
          sectionId: 'other-materials',
          templateId: 'generic-response',
        },
      },
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const result = await store.importProjectConfig({ filePath: inputPath });

      expect(result.success).toBe(true);
      expect(result.validationPassed).toBe(true);
      expect(result.message).toBe('完整标书项目配置 JSON 已导入，校验通过。');
      expect(result.buildLog?.passed).toBe(true);
      expect(result.state?.projectData.projectName).toBe('导入项目配置测试');
      expect(result.state?.quoteItems[0].brandModel).toBe('IMPORT-SYS');
      expect(path.isAbsolute(result.state?.assetMap.qualification_scan.filePath)).toBe(true);
      expect(result.state?.lastBuildLog?.passed).toBe(true);

      const reloadedStore = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });
      const reloadedState = reloadedStore.loadState();
      expect(reloadedState.projectData.projectName).toBe('导入项目配置测试');
      expect(reloadedState.lastBuildLog.passed).toBe(true);
    } finally {
      temp.cleanup();
    }
  });

  it('rejects imported project config with unsupported version before saving draft state', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-import-version-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    const config = createBidDocumentSample({ templateId: 'generic-response' });
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 2,
      templateId: 'generic-response',
      projectData: config.projectData,
      quoteItems: config.quoteItems,
      assetMap: config.assetMap,
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const result = await store.importProjectConfig({ filePath: inputPath });

      expect(result.success).toBe(false);
      expect(result.message).toContain('unsupported_project_config_version:2');
      expect(result.state).toBeUndefined();
      expect(temp.readRow()).toBeNull();
    } finally {
      temp.cleanup();
    }
  });

  it('rejects imported project config missing top-level template id before using projectData fallback', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-import-missing-template-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    const config = createBidDocumentSample({ templateId: 'generic-response' });
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 1,
      projectData: config.projectData,
      quoteItems: config.quoteItems,
      assetMap: config.assetMap,
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const result = await store.importProjectConfig({ filePath: inputPath });

      expect(result.success).toBe(false);
      expect(result.message).toContain('invalid_project_config:missing_templateId');
      expect(result.state).toBeUndefined();
      expect(temp.readRow()).toBeNull();
    } finally {
      temp.cleanup();
    }
  });

  it('rejects imported project config assets whose file signature does not match the image extension', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-import-invalid-signature-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    const assetDir = path.join(tempDir, 'project-config.assets');
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, 'qualification_scan.png'), 'not a png file', 'utf8');
    fs.writeFileSync(path.join(assetDir, 'solution_screenshot.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    fs.writeFileSync(path.join(assetDir, 'contract_case_scan.png'), Buffer.from(TINY_PNG_BASE64, 'base64'));
    const config = createBidDocumentSample({ templateId: 'generic-response' });
    config.assetMap.qualification_scan.filePath = './project-config.assets/qualification_scan.png';
    config.assetMap.solution_screenshot.filePath = './project-config.assets/solution_screenshot.png';
    config.assetMap.contract_case_scan.filePath = './project-config.assets/contract_case_scan.png';
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 1,
      templateId: 'generic-response',
      projectData: config.projectData,
      quoteItems: config.quoteItems,
      assetMap: config.assetMap,
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const result = await store.importProjectConfig({ filePath: inputPath });

      expect(result.success).toBe(true);
      expect(result.validationPassed).toBe(false);
      expect(result.buildLog?.assetCheck.passed).toBe(false);
      expect(result.buildLog?.errors.join('\n')).toContain('invalid_asset_file_signature:qualification_scan:.png');
      expect(result.state?.lastBuildLog.assetCheck.details.invalid_asset_file_signatures).toEqual(['qualification_scan']);
    } finally {
      temp.cleanup();
    }
  });

  it('rejects imported project config with an unknown template id instead of falling back to smart canteen', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-project-import-unknown-'));
    const inputPath = path.join(tempDir, 'project-config.json');
    fs.writeFileSync(inputPath, JSON.stringify({
      version: 1,
      templateId: 'unknown-response-template',
      projectData: {
        templateId: 'unknown-response-template',
        projectName: '未知模板项目',
        purchaserName: '未知采购人',
        supplierName: '未知供应商',
        totalWithTax: 1,
        totalWithoutTax: 1,
        taxPolicy: { defaultRate: 0.13 },
        paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付 100%。' }],
      },
      quoteItems: [
        { name: '未知服务', quantity: 1, brandModel: 'UNKNOWN-1', unitPriceWithTax: 1, totalWithTax: 1 },
      ],
      assetMap: {},
    }, null, 2), 'utf8');
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => tempDir }, db: temp as any });

      const result = await store.importProjectConfig({ filePath: inputPath }) as any;

      expect(result.success).toBe(false);
      expect(result.error).toBe('unknown_template_id');
      expect(result.templateId).toBe('unknown-response-template');
      expect(result.availableTemplateIds).toContain('generic-response');
      expectCompleteTemplateErrorBuildLog(result.buildLog);
      expect(temp.readRow()).toBeNull();
    } finally {
      temp.cleanup();
    }
  });

  it('passes edited generic project data into validation without smart canteen constants', () => {
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' } });
    const state = store.loadState();
    const template = {
      ...state.template,
      id: 'generic-test',
      validationProfile: {
        requiredSectionIds: state.template.validationProfile.requiredSectionIds,
      },
      requiredAssetKeys: [],
    };
    const result = store.validate({
      template,
      projectData: {
        ...state.projectData,
        templateId: 'generic-test',
        projectName: '通用项目',
        purchaserName: '通用采购人',
        supplierName: '通用供应商',
        totalWithTax: 300,
        totalWithoutTax: 265.49,
        paymentTerms: [
          { stage: '首付款', ratio: 50, text: '首付款支付 50%。' },
          { stage: '验收款', ratio: 50, text: '验收后支付 50%。' },
        ],
      },
      quoteItems: [
        { name: '软件', quantity: 1, brandModel: 'GEN-SYS', unitPriceWithTax: 100, totalWithTax: 100 },
        { name: '设备', quantity: 2, brandModel: 'GEN-DEVICE', unitPriceWithTax: 100, totalWithTax: 200 },
      ],
      assetMap: {},
    });

    expect(result.success).toBe(true);
  });

  it('loads the generic template sample from a template id instead of smart canteen defaults', () => {
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' } });

    const state = store.saveState({ templateId: 'generic-response' });

    expect(state.template.id).toBe('generic-response');
    expect(state.projectData.projectName).toBe('通用完整标书样例项目');
    expect(state.quoteItems.map((item: Record<string, unknown>) => item.brandModel)).toEqual(['GEN-SYS V1.0', 'GEN-DEVICE-100']);
    expect(Object.keys(state.assetMap)).toEqual(['qualification_scan', 'solution_screenshot', 'contract_case_scan']);
  });

  it('throws on saving an unknown template id so the renderer does not treat an error as state', () => {
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' } });

    expect(() => store.saveState({ templateId: 'unknown-response-template' })).toThrow('完整标书保存失败：模板不存在');
  });

  it('returns a complete build log when validating an unknown template id', () => {
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' } });

    const result = store.validate({ templateId: 'unknown-response-template' });

    expect(result.success).toBe(false);
    expectCompleteTemplateErrorBuildLog(result.buildLog);
    expect(result.buildLog.templateCheck.errors.join('\n')).toContain('完整标书校验失败：模板不存在');
  });

  it('returns complete build logs for template errors in readiness and asset package actions', async () => {
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' } });

    const readiness = await store.exportReadinessReport({ templateId: 'unknown-response-template' });
    const exportedPackage = await store.exportAssetCollectionPackage({ templateId: 'unknown-response-template' });
    const importedPackage = await store.importAssetCollectionPackage({ templateId: 'unknown-response-template' });

    expect(readiness.success).toBe(false);
    expect(readiness.message).toContain('准备度报告导出失败');
    expectCompleteTemplateErrorBuildLog(readiness.buildLog);
    expect(exportedPackage.success).toBe(false);
    expect(exportedPackage.message).toContain('材料收集包导出失败');
    expectCompleteTemplateErrorBuildLog(exportedPackage.buildLog);
    expect(importedPackage.success).toBe(false);
    expect(importedPackage.message).toContain('材料收集包导入失败');
    expectCompleteTemplateErrorBuildLog(importedPackage.buildLog);
  });

  it('persists the selected generic template id in sqlite', () => {
    const temp = createFakeBidDocumentDb();
    try {
      const firstStore = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      firstStore.saveState({ templateId: 'generic-response' });

      const secondStore = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      const persistedState = secondStore.loadState();

      expect(persistedState.template.id).toBe('generic-response');
      expect(persistedState.projectData.projectName).toBe('通用完整标书样例项目');
    } finally {
      temp.cleanup();
    }
  });

  it('returns a complete build log when a persisted template no longer exists', () => {
    const staleDb = createFakeBidDocumentDbWithRow({
      id: 1,
      template_id: 'removed-response-template',
      project_data_json: JSON.stringify({ templateId: 'removed-response-template' }),
      quote_items_json: JSON.stringify([]),
      asset_map_json: JSON.stringify({}),
      asset_package_json: null,
      last_build_log_json: null,
      created_at: '2026-06-20T00:00:00.000Z',
      updated_at: '2026-06-20T00:00:00.000Z',
    });
    const store = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: staleDb as any });

    const state = store.loadState();

    expect(state.template.id).toBe('generic-response');
    expectCompleteTemplateErrorBuildLog(state.lastBuildLog, 'removed-response-template');
    expect(state.lastBuildLog.templateCheck.errors.join('\n')).toContain('已保存的完整标书模板不存在：removed-response-template');
    expect(JSON.parse(staleDb.readRow().last_build_log_json).quoteCheck.errors).toEqual(['not_run']);
  });

  it('persists edited bid document drafts in sqlite', () => {
    const temp = createFakeBidDocumentDb();
    try {
      const firstStore = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      const initialState = firstStore.loadState();
      firstStore.saveState({
        template: initialState.template,
        projectData: {
          ...initialState.projectData,
          projectName: '通用标书持久化测试',
        },
        quoteItems: initialState.quoteItems,
        assetMap: initialState.assetMap,
      });

      const secondStore = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      const persistedState = secondStore.loadState();

      expect(persistedState.projectData.projectName).toBe('通用标书持久化测试');
    } finally {
      temp.cleanup();
    }
  });

  it('persists validation build logs in sqlite', () => {
    const temp = createFakeBidDocumentDb();
    try {
      const store = createBidDocumentStore({ app: { getPath: () => '/tmp' }, db: temp as any });
      const result = store.validate();
      const row = temp.readRow();
      expect(row).not.toBeNull();
      const persistedLog = JSON.parse(row!.last_build_log_json);

      expect(result.success).toBe(false);
      expect(persistedLog.passed).toBe(false);
      expect(persistedLog.errors.length).toBeGreaterThan(0);
    } finally {
      temp.cleanup();
    }
  });
});
