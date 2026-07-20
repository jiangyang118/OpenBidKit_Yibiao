// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { writeBidDocumentWordFile } = require('../../../electron/services/bidDocumentWordBuilder.cjs') as {
  writeBidDocumentWordFile: (input: Record<string, unknown>, outputPath: string) => Promise<{ success: boolean; buildLog: Record<string, any>; filePath?: string; bytes: number }>;
};
const { validateDocxAssetPlacement, validateDocxContent, validateDocxForbiddenWords, validateDocxLayout, validateDocxPageBreaks, validateDocxQuoteIntegrity, validateDocxSectionOrder, validateDocxStyles, validateDocxTables, validateDocxTechnicalDensity, validateDocxToc, validateImagesInserted } = require('../../../electron/services/bidDocumentValidation.cjs') as {
  validateDocxAssetPlacement: (outputPath: string, assetMap: Record<string, unknown>, input?: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxContent: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[] };
  validateDocxForbiddenWords: (outputPath: string) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxLayout: (outputPath: string) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxPageBreaks: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxQuoteIntegrity: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxSectionOrder: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxStyles: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxTables: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxTechnicalDensity: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocxToc: (outputPath: string, input: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateImagesInserted: (outputPath: string, assetMap: Record<string, unknown>, input?: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
};

const tempDirs: string[] = [];
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createAssetMap(keys: string[]) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-bid-document-'));
  tempDirs.push(tempDir);
  return Object.fromEntries(keys.map((key) => {
    const filePath = path.join(tempDir, `${key}.png`);
    fs.writeFileSync(filePath, onePixelPng);
    return [key, { key, title: `${key} 图片`, filePath, type: 'image', required: true, sectionId: 'technical-solution' }];
  }));
}

function createGenericInput() {
  const assetMap = createAssetMap(['product_image']);
  return {
    template: {
      id: 'generic-test',
      name: '通用测试模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: ['product_image'],
      validationProfile: {
        requiredSectionIds: ['quote-summary', 'supplier-basic-info', 'technical-solution', 'implementation-plan', 'after-sales-plan', 'warranty-period', 'other-materials'],
      },
      sections: [
        { id: 'cover', title: '封面', level: 0, required: true },
        { id: 'supplier-and-authorized-representative', title: '供应商及授权代表页', level: 1, required: true },
        { id: 'toc', title: '目录', level: 0, required: true },
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'quote-detail', title: '1-2 分项报价表', level: 2, required: true, parentId: 'quote-summary' },
        { id: 'supplier-basic-info', title: '四、供应商基本情况表', level: 1, required: true },
        { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
        { id: 'project-understanding', title: '项目理解', level: 2, required: true, parentId: 'technical-solution' },
        { id: 'implementation-plan', title: '七、项目实施方案', level: 1, required: true },
        { id: 'after-sales-plan', title: '八、产品售后方案', level: 1, required: true },
        { id: 'warranty-period', title: '九、质保期', level: 1, required: true },
        { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
        { id: 'backup-service', title: '后备服务', level: 2, required: false, parentId: 'other-materials' },
      ],
    },
    projectData: {
      templateId: 'generic-test',
      projectName: '通用测试项目',
      purchaserName: '测试采购人',
      supplierName: '测试供应商',
      totalWithTax: 300,
      totalWithoutTax: 265.49,
      taxPolicy: { softwareHardwareRate: 0.13, serviceRate: 0.06 },
      paymentTerms: [
        { stage: '到货', ratio: 50, text: '设备到现场支付合同总价款的 50%。' },
        { stage: '验收', ratio: 50, text: '设备调试合格后支付合同总价款的 50%。' },
      ],
    },
    quoteItems: [
      { name: '软件', quantity: 1, brandModel: '测试 SYS V1.0', unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13 },
      { name: '硬件', quantity: 2, brandModel: '测试 DEVICE', unitPriceWithTax: 100, totalWithTax: 200, taxRate: 0.13 },
    ],
    assetMap,
  };
}

describe('bid document Word builder', () => {
  it('writes an openable generic docx with quote data, payment terms and inserted media', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '通用响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.buildLog.docxContentCheck?.passed).toBe(true);
    expect(result.buildLog.docxContentCheck?.details?.checkedTextCount).toBe(7);
    expect(result.buildLog.docxContentCheck?.details?.checkedAssetTitleCount).toBe(Object.keys(sample.assetMap).length);
    expect(result.buildLog.docxSectionOrderCheck?.passed).toBe(true);
    expect(result.buildLog.docxSectionOrderCheck?.details?.checkedSectionCount).toBe(sample.template.sections.length - 1);
    expect(result.buildLog.docxTableCheck?.passed).toBe(true);
    expect(result.buildLog.docxTableCheck?.details?.checkedTables).toEqual(expect.arrayContaining([
      'quote-summary',
      'payment-terms',
      'quote-detail',
      'supplier-basic-info',
      'implementation-plan',
    ]));
    expect(result.buildLog.docxQuoteIntegrityCheck?.passed).toBe(true);
    expect(result.buildLog.docxQuoteIntegrityCheck?.details).toMatchObject({
      checkedQuoteRowCount: sample.quoteItems.length,
      checkedPaymentTermCount: sample.projectData.paymentTerms.length,
      missingQuoteRows: [],
      missingPaymentRows: [],
    });
    expect(result.buildLog.docxLayoutCheck?.passed).toBe(true);
    expect(result.buildLog.docxLayoutCheck?.details).toMatchObject({
      hasA4PageSize: true,
      hasStandardMargins: true,
      hasPageNumberFooter: true,
    });
    expect(result.buildLog.docxTocCheck?.passed).toBe(true);
    expect(result.buildLog.docxTocCheck?.details).toMatchObject({
      hasTocHeading: true,
      hasTocField: true,
      hasHeadingRange: true,
      hasHyperlinks: true,
      isMarkedDirty: true,
    });
    expect(result.buildLog.docxStyleCheck?.passed).toBe(true);
    expect(result.buildLog.docxStyleCheck?.details?.checkedHeadingCount).toBe(sample.template.sections.length - 1);
    expect(result.buildLog.docxStyleCheck?.details?.tableCount).toBeGreaterThan(0);
    expect(result.buildLog.docxTechnicalDensityCheck?.passed).toBe(true);
    expect(result.buildLog.docxTechnicalDensityCheck?.details).toMatchObject({
      expectedTableCount: 0,
      expectedImageAssetCount: 1,
      technicalImageReferenceCount: 1,
      longParagraphs: [],
      repeatedParagraphs: [],
    });
    expect(result.buildLog.docxPageBreakCheck?.passed).toBe(true);
    expect(result.buildLog.docxPageBreakCheck?.details?.checkedBoundaries).toEqual(expect.arrayContaining([
      'toc->quote-summary',
      'implementation-plan->after-sales-plan',
      'after-sales-plan->warranty-period',
      'warranty-period->other-materials',
    ]));
    expect(result.buildLog.imageInsertionCheck?.details?.imageRelationshipCount).toBeGreaterThanOrEqual(Object.keys(sample.assetMap).length);
    expect(result.buildLog.docxAssetPlacementCheck?.passed).toBe(true);
    expect(result.buildLog.docxAssetPlacementCheck?.details?.checkedAssetCount).toBe(Object.keys(sample.assetMap).length);
    expect(result.buildLog.docxAssetPlacementCheck?.details?.missingAdjacentImages).toEqual([]);
    expect(result.buildLog.docxAssetPlacementCheck?.details?.missingPageBreaks).toEqual([]);
    expect(fs.existsSync(outputPath)).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText('word/document.xml');
    const mediaEntries = zip.getEntries().filter((entry: { entryName: string }) => entry.entryName.startsWith('word/media/'));

    expect(documentXml).toContain('响应文件');
    expect(documentXml).toContain('通用测试项目');
    expect(documentXml).toContain('300.00 元');
    expect(documentXml).toContain('测试 DEVICE');
    expect(documentXml).toContain('本项目按采购需求、响应范围、交付成果和验收要求组织响应文件');
    expect(documentXml).not.toContain('菜品设置-称重取餐');
    expect(documentXml).not.toContain('内容由 AI 生成');
    expect(documentXml).not.toContain('投标技术文件');
    expect(documentXml).not.toContain('图：证明材料页');
    expect(mediaEntries.length).toBeGreaterThanOrEqual(Object.keys(sample.assetMap).length);
  });

  it('lists optional document assets as real files without counting them as embedded images', async () => {
    const sample = createGenericInput();
    const tempDir = tempDirs[0];
    const documentPath = path.join(tempDir, 'contract-case.pdf');
    fs.writeFileSync(documentPath, '%PDF-1.4\n');
    sample.assetMap.contract_case_scan = {
      key: 'contract_case_scan',
      title: '合同案例证明原始文件',
      filePath: documentPath,
      type: 'document',
      required: false,
      sectionId: 'other-materials',
    };
    const outputPath = path.join(tempDir, '含原始文件响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    expect(result.buildLog.docxContentCheck?.details?.checkedAssetTitleCount).toBe(2);
    expect(result.buildLog.imageInsertionCheck?.details?.expectedImageAssetCount).toBe(1);
    expect(result.buildLog.docxAssetPlacementCheck?.details?.checkedAssetCount).toBe(1);
    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText('word/document.xml');
    expect(documentXml).toContain('合同案例证明原始文件');
    expect(documentXml).toContain('contract-case.pdf');
  });

  it('fails content validation if disabled optional section titles or asset titles leak into the final docx', async () => {
    const sample = createGenericInput();
    const tempDir = tempDirs[0];
    const backupAssetPath = path.join(tempDir, 'backup-service-proof.png');
    fs.writeFileSync(backupAssetPath, onePixelPng);
    (sample.projectData as Record<string, unknown>).disabledSectionIds = ['backup-service'];
    sample.template.requiredAssetKeys.push('backup_service_proof');
    sample.assetMap.backup_service_proof = {
      key: 'backup_service_proof',
      title: '备用支持证明材料',
      filePath: backupAssetPath,
      type: 'image',
      required: true,
      sectionId: 'backup-service',
    };
    const outputPath = path.join(tempDir, '禁用章节泄漏校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    expect(documentXml).not.toContain('后备服务');
    expect(documentXml).not.toContain('备用支持证明材料');

    const changedDocumentXml = documentXml.replace(
      '<w:body>',
      '<w:body><w:p><w:r><w:t>后备服务</w:t></w:r></w:p><w:p><w:r><w:t>备用支持证明材料</w:t></w:r></w:p>',
    );
    expect(changedDocumentXml).not.toBe(documentXml);
    zip.updateFile(documentPath, Buffer.from(changedDocumentXml, 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxContent(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx contains disabled section title: backup-service');
    expect(invalid.errors.join('\n')).toContain('docx contains disabled section asset title: assetTitle:backup_service_proof');
  });

  it('renders tax policy text from generic project data instead of forcing smart-canteen wording', async () => {
    const sample = createGenericInput();
    sample.projectData.taxPolicy = { defaultRate: 0.09 } as any;
    const outputPath = path.join(tempDirs[0], '综合税率响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    const documentXml = new AdmZip(outputPath).readAsText('word/document.xml');
    expect(documentXml).toContain('综合税率 9%');
    expect(documentXml).not.toContain('软硬件 0%');
  });

  it('renders explicit tax policy descriptions from project data', async () => {
    const sample = createGenericInput();
    sample.projectData.taxPolicy = { description: '按采购文件约定的适用税率执行' } as any;
    const outputPath = path.join(tempDirs[0], '税率说明响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    const documentXml = new AdmZip(outputPath).readAsText('word/document.xml');
    expect(documentXml).toContain('按采购文件约定的适用税率执行');
  });

  it('fails image insertion validation when image relationships target missing media files', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '图片关系校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const relsPath = 'word/_rels/document.xml.rels';
    const relsXml = zip.readAsText(relsPath);
    zip.updateFile(relsPath, Buffer.from(relsXml.replace(/Target="media\//, 'Target="missing-media/'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateImagesInserted(outputPath, sample.assetMap, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx image relationship targets are missing media entries');
  });

  it('fails asset placement validation when an asset title is no longer adjacent to an image', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '附件排版图片邻接校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    const changedDocumentXml = documentXml.replace(
      /(<w:p\b[^>]*>[\s\S]*?<w:t\b[^>]*>product_image 图片<\/w:t>[\s\S]*?<\/w:p>)/,
      '$1<w:p><w:r><w:t>附件图片被错误插入到标题之后的文字段落后面</w:t></w:r></w:p>',
    );
    expect(changedDocumentXml).not.toBe(documentXml);
    zip.updateFile(documentPath, Buffer.from(changedDocumentXml, 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxAssetPlacement(outputPath, sample.assetMap, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx asset image is not adjacent to title');
    expect(invalid.details?.missingAdjacentImages).toEqual(expect.arrayContaining(['product_image']));
  });

  it('fails asset placement validation when an asset title is not separated by a page break', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '附件排版分页校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    const changedDocumentXml = documentXml.replace(/<w:br w:type="page"\/>/g, '');
    expect(changedDocumentXml).not.toBe(documentXml);
    zip.updateFile(documentPath, Buffer.from(changedDocumentXml, 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxAssetPlacement(outputPath, sample.assetMap, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx asset title is not on a separated page');
    expect(invalid.details?.missingPageBreaks).toEqual(expect.arrayContaining(['product_image']));
  });

  it('fails generated docx content validation when final document text does not match project data', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '内容校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const invalid = validateDocxContent(outputPath, {
      ...sample,
      projectData: {
        ...sample.projectData,
        projectName: '不存在的项目名称',
      },
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx missing required text: projectName');
  });

  it('fails generated docx content validation when required asset titles are not present', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '附件标题校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const invalidAssetMap = {
      ...sample.assetMap,
      product_image: {
        ...sample.assetMap.product_image,
        title: '不存在的附件标题',
      },
    };
    const invalid = validateDocxContent(outputPath, {
      ...sample,
      assetMap: invalidAssetMap,
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx missing required asset title: assetTitle:product_image');
  });

  it('fails preflight when a referenced optional asset points to an unknown section', async () => {
    const sample = createGenericInput();
    const optionalAssetPath = path.join(tempDirs[0], 'optional-proof.png');
    fs.writeFileSync(optionalAssetPath, onePixelPng);
    sample.assetMap.optional_proof = {
      key: 'optional_proof',
      title: '可选证明材料图片',
      filePath: optionalAssetPath,
      type: 'image',
      required: false,
      sectionId: 'non-rendered-section',
    };
    const outputPath = path.join(tempDirs[0], '可选附件未插入响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(false);
    expect(result.buildLog.assetCheck?.passed).toBe(false);
    expect(result.buildLog.docxContentCheck?.errors).toEqual(['not_run']);
    expect(result.buildLog.imageInsertionCheck?.errors).toEqual(['not_run']);
    expect(result.buildLog.docxForbiddenWordsCheck?.errors).toEqual(['not_run']);
    expect(result.buildLog.errors.join('\n')).toContain('assetMap.optional_proof.sectionId does not exist in template: non-rendered-section');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('keeps the existing final file untouched when preflight validation fails', async () => {
    const sample = createGenericInput();
    sample.assetMap.product_image = {
      ...sample.assetMap.product_image,
      sectionId: 'non-rendered-section',
    };
    const outputPath = path.join(tempDirs[0], '既有最终文件.docx');
    const existingContent = 'existing-final-file';
    fs.writeFileSync(outputPath, existingContent, 'utf8');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(false);
    expect(result.buildLog.assetCheck?.passed).toBe(false);
    expect(result.buildLog.docxContentCheck?.errors).toEqual(['not_run']);
    expect(result.buildLog.docxForbiddenWordsCheck?.errors).toEqual(['not_run']);
    expect(result.buildLog.errors.join('\n')).toContain('assetMap.product_image.sectionId does not exist in template: non-rendered-section');
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(existingContent);
    const tempFiles = fs.readdirSync(tempDirs[0]).filter((entry) => entry.includes('.tmp.docx'));
    expect(tempFiles).toEqual([]);
  });

  it('replaces an existing final file only after validation succeeds and removes temporary artifacts', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '覆盖既有文件.docx');
    fs.writeFileSync(outputPath, 'old-final-file', 'utf8');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).not.toBe('old-final-file');
    expect(() => new AdmZip(outputPath)).not.toThrow();
    const leftoverFiles = fs.readdirSync(tempDirs[0]).filter((entry) => entry.includes('.tmp.docx') || entry.includes('.bak.docx'));
    expect(leftoverFiles).toEqual([]);
  });

  it('checks forbidden words against decoded docx document text', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '成品禁用词复检响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('通用测试项目', '内容由 AI 生&#x6210;'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxForbiddenWords(outputPath);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('内容由 AI 生成');
  });

  it('renders top-level sections in the order declared by the template package', async () => {
    const sample = createGenericInput();
    sample.template.sections = [
      { id: 'cover', title: '封面', level: 0, required: true },
      { id: 'after-sales-plan', title: '八、产品售后方案', level: 1, required: true },
      { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
      { id: 'quote-detail', title: '1-2 分项报价表', level: 2, required: true, parentId: 'quote-summary' },
      { id: 'supplier-basic-info', title: '四、供应商基本情况表', level: 1, required: true },
      { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
      { id: 'implementation-plan', title: '七、项目实施方案', level: 1, required: true },
      { id: 'warranty-period', title: '九、质保期', level: 1, required: true },
      { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
    ];
    const outputPath = path.join(tempDirs[0], '模板顺序响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText('word/document.xml');
    expect(documentXml.indexOf('八、产品售后方案')).toBeLessThan(documentXml.indexOf('一、报价一览表'));
    expect(result.buildLog.docxSectionOrderCheck?.passed).toBe(true);
  });

  it('fails docx section order validation when the final document order differs from template order', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '章节顺序校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const invalid = validateDocxSectionOrder(outputPath, {
      ...sample,
      template: {
        ...sample.template,
        sections: [
          sample.template.sections[0],
          sample.template.sections[1],
          sample.template.sections[2],
          sample.template.sections[8],
          sample.template.sections[3],
          ...sample.template.sections.slice(4, 8),
          ...sample.template.sections.slice(9),
        ],
      },
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx section order mismatch');
  });

  it('fails docx section order validation when final Word contains headings outside the template', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '模板外标题校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    const unexpectedHeading = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>十一、模型自行新增章节</w:t></w:r></w:p>';
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('</w:body>', `${unexpectedHeading}</w:body>`), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxSectionOrder(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx unexpected section heading');
    expect(invalid.details?.unexpectedHeadings).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '十一、模型自行新增章节' }),
    ]));
  });

  it('fails docx table validation when a formal table header is missing', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '表格校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('付款节点', '付款项目'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxTables(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx missing expected table: payment-terms');
  });

  it('fails docx quote integrity validation when a quote item is changed in the final Word table', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '报价完整性校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    const changedDocumentXml = documentXml.replace(/(<w:t\b[^>]*>)测试 DEVICE(<\/w:t>)/, '$1测试 DEVICE 错误型号$2');
    expect(changedDocumentXml).not.toBe(documentXml);
    zip.updateFile(documentPath, Buffer.from(changedDocumentXml, 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxQuoteIntegrity(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx quote item missing in quote detail table');
    expect(invalid.details?.missingQuoteRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ brandModel: '测试 DEVICE' }),
    ]));
  });

  it('fails docx quote integrity validation when a payment ratio is changed in the final Word table', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '付款完整性校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    const changedDocumentXml = documentXml.replace(/(<w:t\b[^>]*>)50%(<\/w:t>)/, '$140%$2');
    expect(changedDocumentXml).not.toBe(documentXml);
    zip.updateFile(documentPath, Buffer.from(changedDocumentXml, 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxQuoteIntegrity(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx payment term missing in payment table');
    expect(invalid.details?.missingPaymentRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: '到货', ratio: 50 }),
    ]));
  });

  it('fails docx layout validation when page margins are not the formal template margins', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '页面布局校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('w:top="1440"', 'w:top="720"'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxLayout(outputPath);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx page margins should be 1440 DXA on all sides');
  });

  it('fails docx page break validation when formal section pagination is removed', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '分页校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace(/<w:br w:type="page"\/>/g, ''), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxPageBreaks(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx missing page break between sections');
  });

  it('fails docx TOC validation when the updateable TOC field is removed', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '目录字段校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('TOC \\h \\o &quot;1-3&quot;', 'STATIC TOC'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxToc(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx TOC field should cover heading levels 1-3');
    expect(invalid.errors.join('\n')).toContain('docx TOC field should enable hyperlinks');
  });

  it('fails docx style validation when heading styles are downgraded', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '样式校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace('w:val="Heading1"', 'w:val="Normal"'), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxStyles(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx heading style mismatch');
  });

  it('fails post-generation validation when technical solution text becomes a long AI-like paragraph', async () => {
    const sample = createGenericInput();
    (sample.template as Record<string, unknown>).contentProfile = {
      projectUnderstanding: '技术方案说明'.repeat(90),
    };
    const outputPath = path.join(tempDirs[0], '技术方案密度校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(false);
    expect(result.buildLog.docxTechnicalDensityCheck?.passed).toBe(false);
    expect(result.buildLog.errors.join('\n')).toContain('docx technical paragraph too long');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('fails docx technical density validation when inserted technical images are removed', async () => {
    const sample = createGenericInput();
    const outputPath = path.join(tempDirs[0], '技术方案图片密度校验响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);
    expect(result.success).toBe(true);

    const zip = new AdmZip(outputPath);
    const documentPath = 'word/document.xml';
    const documentXml = zip.readAsText(documentPath);
    zip.updateFile(documentPath, Buffer.from(documentXml.replace(/<a:blip\b[^>]*\/>/, ''), 'utf-8'));
    zip.writeZip(outputPath);

    const invalid = validateDocxTechnicalDensity(outputPath, sample);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('docx technical solution missing inserted technical assets');
  });

  it('omits disabled optional template sections from the generated Word document', async () => {
    const sample = createGenericInput();
    (sample.projectData as Record<string, unknown>).disabledSectionIds = ['backup-service'];
    const outputPath = path.join(tempDirs[0], '可选章节关闭响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    expect(result.buildLog.sectionSelectionCheck?.passed).toBe(true);
    const documentXml = new AdmZip(outputPath).readAsText('word/document.xml');
    expect(documentXml).not.toContain('后备服务');
    expect(documentXml).toContain('十、其他材料');
  });

  it('does not require optional assets attached to disabled optional sections in final Word checks', async () => {
    const sample = createGenericInput();
    const optionalAssetPath = path.join(tempDirs[0], 'backup-service-proof.png');
    fs.writeFileSync(optionalAssetPath, onePixelPng);
    sample.assetMap.backup_service_proof = {
      key: 'backup_service_proof',
      title: '后备服务可选证明材料',
      filePath: optionalAssetPath,
      type: 'image',
      required: false,
      sectionId: 'backup-service',
    };
    (sample.projectData as Record<string, unknown>).disabledSectionIds = ['backup-service'];
    const outputPath = path.join(tempDirs[0], '可选章节附件关闭响应文件.docx');

    const result = await writeBidDocumentWordFile(sample, outputPath);

    expect(result.success).toBe(true);
    expect(result.buildLog.docxContentCheck?.passed).toBe(true);
    expect(result.buildLog.imageInsertionCheck?.passed).toBe(true);
    expect(result.buildLog.docxContentCheck?.details?.checkedAssetTitleCount).toBe(1);
    expect(result.buildLog.imageInsertionCheck?.details?.referencedCount).toBe(1);
    const documentXml = new AdmZip(outputPath).readAsText('word/document.xml');
    expect(documentXml).not.toContain('后备服务可选证明材料');
  });
});
