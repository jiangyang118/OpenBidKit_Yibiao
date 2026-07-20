// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  validateTemplateDefinition,
} = require('../../../electron/services/bidDocumentValidation.cjs') as {
  validateTemplateDefinition: (template: Record<string, unknown>) => { passed: boolean; errors: string[] };
};
const {
  DEFAULT_BID_DOCUMENT_TEMPLATE_ID,
  createBidDocumentSample,
  createSmartCanteenSample,
  getBidDocumentProjectConfigSchema,
  getBidDocumentSchemaDefinitions,
  getBidDocumentTemplate,
  getBidDocumentTemplates,
  getGenericAssetMap,
  getGenericProjectData,
  getGenericQuoteItems,
  getBidDocumentTemplateInfo,
  getSmartCanteenAssetMap,
  getSmartCanteenProjectData,
  getSmartCanteenQuoteItems,
} = require('../../../electron/services/bidDocumentTemplates.cjs') as {
  DEFAULT_BID_DOCUMENT_TEMPLATE_ID: string;
  createBidDocumentSample: (overrides?: Record<string, unknown>) => Record<string, any>;
  createSmartCanteenSample: () => Record<string, any>;
  getBidDocumentProjectConfigSchema: (templateId?: string) => Record<string, any>;
  getBidDocumentSchemaDefinitions: () => Record<string, any>;
  getBidDocumentTemplate: (templateId?: string) => Record<string, any> | null;
  getBidDocumentTemplates: () => Array<Record<string, any>>;
  getGenericAssetMap: () => Record<string, any>;
  getGenericProjectData: () => Record<string, any>;
  getGenericQuoteItems: () => Array<Record<string, any>>;
  getBidDocumentTemplateInfo: (templateId?: string) => Record<string, any>;
  getSmartCanteenAssetMap: () => Record<string, any>;
  getSmartCanteenProjectData: () => Record<string, any>;
  getSmartCanteenQuoteItems: () => Array<Record<string, any>>;
};

describe('bid document templates', () => {
  it('keeps all built-in template packages structurally valid', () => {
    const templates = getBidDocumentTemplates();

    for (const template of templates) {
      const result = validateTemplateDefinition(template);
      expect(result.passed, `${template.id}: ${result.errors.join('\n')}`).toBe(true);
    }
  });

  it('declares the smart canteen response template as a template package', () => {
    const templates = getBidDocumentTemplates();
    const template = templates.find((item) => item.id === 'smart-canteen-response');

    expect(templates.map((item) => item.id)).toEqual(expect.arrayContaining(['smart-canteen-response', 'generic-response']));
    expect(template).toBeTruthy();
    expect(template?.documentTitle).toBe('响应文件');
    expect(template?.sections.map((section: Record<string, unknown>) => section.id)).toEqual(expect.arrayContaining([
      'quote-summary',
      'supplier-basic-info',
      'technical-solution',
      'implementation-plan',
      'after-sales-plan',
      'warranty-period',
      'other-materials',
    ]));
    expect(template?.validationProfile.requiredModels).toContain('康比特 CPT-Nutr-GMSC450-LITE');
    expect(template?.contentProfile.projectUnderstanding).toContain('菜品设置-称重取餐');
    expect(template?.sections.find((section: Record<string, unknown>) => section.id === 'backup-service')?.required).toBe(true);
    expect(template?.assetDefinitions?.map((asset: Record<string, unknown>) => asset.key)).toEqual(template?.requiredAssetKeys);
  });

  it('keeps smart canteen project data, quote rows and assets in the sample package', () => {
    const projectData = getSmartCanteenProjectData();
    const quoteItems = getSmartCanteenQuoteItems();
    const assetMap = getSmartCanteenAssetMap();
    const sample = createSmartCanteenSample();

    expect(projectData.projectName).toBe('智慧餐厅称重系统改造');
    expect(quoteItems).toHaveLength(6);
    expect(quoteItems.map((item) => item.brandModel)).toContain('康比特 CPT-FT248');
    expect(Object.keys(assetMap)).toHaveLength(18);
    expect(sample.template.id).toBe('smart-canteen-response');
    expect(sample.projectData.supplierName).toBe('北京康比特体育科技股份有限公司');
  });

  it('provides a generic response template package without smart canteen constants', () => {
    const projectData = getGenericProjectData();
    const quoteItems = getGenericQuoteItems();
    const assetMap = getGenericAssetMap();
    const sample = createBidDocumentSample({ templateId: 'generic-response' });

    expect(projectData.projectName).toBe('通用完整标书样例项目');
    expect(quoteItems.map((item) => item.brandModel)).toEqual(['GEN-SYS V1.0', 'GEN-DEVICE-100']);
    expect(Object.keys(assetMap)).toEqual(['qualification_scan', 'solution_screenshot', 'contract_case_scan']);
    expect(sample.template.id).toBe('generic-response');
    expect(sample.projectData.supplierName).toBe('样例供应商');
    expect(sample.template.validationProfile.requiredModels).toBeUndefined();
    expect(sample.template.contentProfile.projectUnderstanding).not.toContain('菜品设置');
    expect(sample.template.sections.find((section: Record<string, unknown>) => section.id === 'backup-service')?.required).toBe(false);
  });

  it('uses the generic response template for no-template calls', () => {
    const sample = createBidDocumentSample();
    const template = getBidDocumentTemplate();
    const schema = getBidDocumentProjectConfigSchema();

    expect(DEFAULT_BID_DOCUMENT_TEMPLATE_ID).toBe('generic-response');
    expect(sample.template.id).toBe('generic-response');
    expect(sample.projectData.templateId).toBe('generic-response');
    expect(template?.id).toBe('generic-response');
    expect(schema.defaultTemplateId).toBe('generic-response');
    expect(schema.validationNotes.join('\n')).toContain('project-specific blueprints');
    expect(sample.template.contentProfile.projectUnderstanding).not.toContain('菜品设置');
  });

  it('rejects explicit unknown template ids instead of silently falling back to smart canteen', () => {
    expect(getBidDocumentTemplate('unknown-response-template')).toBeNull();
    expect(() => createBidDocumentSample({ templateId: 'unknown-response-template' })).toThrow('Unknown bid document template id');
  });

  it('preserves project-specific extra assets instead of dropping them during sample merge', () => {
    const sample = createBidDocumentSample({
      templateId: 'generic-response',
      assetMap: {
        contract_case_document: {
          key: 'contract_case_document',
          title: '合同案例证明原始文件',
          filePath: '/tmp/contract-case.pdf',
          type: 'document',
          required: true,
          sectionId: 'other-materials',
          templateId: 'generic-response',
        },
      },
    });

    expect(sample.assetMap.qualification_scan).toBeDefined();
    expect(sample.assetMap.contract_case_document).toMatchObject({
      title: '合同案例证明原始文件',
      type: 'document',
      sectionId: 'other-materials',
    });
  });

  it('builds sample asset maps from custom template assetDefinitions', () => {
    const genericTemplate = getBidDocumentTemplate('generic-response');
    const sample = createBidDocumentSample({
      template: {
        ...genericTemplate,
        id: 'custom-response',
        name: '自定义响应文件模板',
        requiredAssetKeys: ['custom_license'],
        assetDefinitions: [
          {
            key: 'custom_license',
            title: '自定义资质证明扫描件',
            sectionId: 'supplier-basic-info',
            type: 'scan',
            required: false,
          },
          {
            key: 'custom_optional_document',
            title: '自定义可选原始文件',
            sectionId: 'other-materials',
            type: 'document',
            required: false,
          },
        ],
      },
      projectData: {
        ...getGenericProjectData(),
        templateId: 'custom-response',
      },
      assetMap: {
        custom_optional_document: {
          filePath: '/tmp/custom-proof.pdf',
        },
      },
    });

    expect(Object.keys(sample.assetMap)).toEqual(['custom_license', 'custom_optional_document']);
    expect(sample.assetMap.custom_license).toMatchObject({
      key: 'custom_license',
      title: '自定义资质证明扫描件',
      type: 'scan',
      required: true,
      sectionId: 'supplier-basic-info',
      templateId: 'custom-response',
    });
    expect(sample.assetMap.custom_optional_document).toMatchObject({
      key: 'custom_optional_document',
      title: '自定义可选原始文件',
      filePath: '/tmp/custom-proof.pdf',
      type: 'document',
      required: false,
      sectionId: 'other-materials',
      templateId: 'custom-response',
    });
    expect(sample.assetMap.qualification_scan).toBeUndefined();
  });

  it('exports project config schema rules for asset mapping validation', () => {
    const schema = getBidDocumentProjectConfigSchema('generic-response');

    expect(schema.assetTypeEnum).toEqual(['image', 'scan', 'document']);
    expect(schema.allowedSectionIds).toContain('technical-solution');
    expect(schema.assetRefFields.key).toContain('must equal');
    expect(schema.assetRefFields.sectionId).toContain('must exist');
    expect(schema.assetRefValidationRules.join('\n')).toContain('assetMap.<key>.key must equal <key>');
    expect(schema.assetRefValidationRules.join('\n')).toContain(
      'not inserted, file-checked, or scanned for forbidden words',
    );
    expect(schema.assetRefValidationRules.join('\n')).toContain(
      'Required assets must use type=image or type=scan',
    );
    expect(schema.assetMappingExample.qualification_scan.sectionId).toBe('supplier-basic-info');
    expect(schema.sectionTemplateValidationRules.join('\n')).toContain('level 2/3 sections must declare parentId');
    expect(schema.sectionTemplateValidationRules.join('\n')).toContain('parent sections must appear before child sections');
    expect(schema.paymentTermFields.ratio).toContain('sum to 100');
    expect(schema.paymentTermValidationRules.join('\n')).toContain('paymentRequiredText');
    expect(schema.buildLogFields.preflightCheckKeys).toContain('quoteCheck');
    expect(schema.buildLogFields.postGenerationCheckKeys).toContain('docxOpenCheck');
    expect(schema.buildLogFields.postGenerationCheckKeys).toContain('docxForbiddenWordsCheck');
    expect(schema.buildLogFields.importCheckKeys).toContain('quoteResolutionCheck');
    expect(schema.readinessReportFields.desktopShape).toContain('BidDocumentReadinessReport');
    expect(schema.readinessReportFields.cliShape).toContain('snake_case aliases');
    expect(schema.readinessReportFields.assetInventory).toContain('BidDocumentAssetInventoryItem[]');
    expect(schema.projectDataFields.templateId).toContain('top-level templateId');
    expect(schema.validationNotes.join('\n')).toContain('does not invent missing quote differences');
    expect(schema.validationNotes.join('\n')).toContain('templateId and projectData.templateId mismatches');
    expect(schema.validationNotes.join('\n')).toContain('version must be 1');
  });

  it('exports section template schema rules in template info', () => {
    const info = getBidDocumentTemplateInfo('smart-canteen-response');

    expect(info.schema.BidDocumentSectionTemplate.fields.parentId).toContain('required for level 2/3 sections');
    expect(info.schema.BidDocumentAssetDefinition.validationRules.join('\n')).toContain('Every key in template.requiredAssetKeys');
    expect(info.schema.BidDocumentSectionTemplate.validationRules.join('\n')).toContain('section.title must be unique');
    expect(info.schema.BidDocumentSectionTemplate.validationRules.join('\n')).toContain('parent section must appear before child section');
    expect(info.schema.BidDocumentPaymentTerm.validationRules.join('\n')).toContain('all payment term ratios must sum to 100');
    expect(info.schema.BidDocumentValidationProfile.validationRules.join('\n')).toContain('requiredSectionIds must be a non-empty array');
    expect(info.schema.BidDocumentBuildLog.preflightCheckKeys).toContain('quoteCheck');
    expect(info.schema.BidDocumentBuildLog.postGenerationCheckKeys).toContain('docxOpenCheck');
    expect(info.schema.BidDocumentBuildLog.fields.docxForbiddenWordsCheck).toBe('BidDocumentValidationResult');
    expect(info.schema.BidDocumentBuildLog.importCheckKeys).toContain('quoteResolutionCheck');
    expect(info.schema.BidDocumentBuildLog.fields.quoteResolutionCheck).toBe('BidDocumentValidationResult');
    expect(info.schema.BidDocumentReadinessReport.fields.quoteReconciliation).toBe('BidDocumentQuoteReconciliation');
    expect(info.schema.BidDocumentReadinessReport.cliFieldAliases.quoteReconciliation).toBe('quote_reconciliation');
    expect(info.schema.BidDocumentReadinessReport.validationRules.join('\n')).toContain('Desktop reports use camelCase fields');
    expect(info.templates[0].template.sections.find((section: Record<string, unknown>) => section.id === 'quote-detail')?.parentId).toBe('quote-summary');
  });

  it('exports standalone schema definitions for payment and validation profiles', () => {
    const schema = getBidDocumentSchemaDefinitions();

    expect(schema.BidDocumentTaxPolicy.fields.description).toContain('forbidden placeholder words');
    expect(schema.BidDocumentPaymentTerm.fields.text).toContain('required/forbidden profile text');
    expect(schema.BidDocumentValidationProfile.fields.requiredModels).toContain('quoteItems.brandModel');
    expect(schema.BidDocumentAssetDefinition.fields.sectionId).toContain('template section');
    expect(schema.BidDocumentValidationProfile.validationRules.join('\n')).toContain('paymentRequiredText');
    expect(schema.BidDocumentAssetRef.validationRules.join('\n')).toContain('required assets');
    expect(schema.BidDocumentAssetRef.validationRules.join('\n')).toContain('type=document is allowed only for optional original files');
    expect(schema.BidDocumentValidationResult.required).toEqual(['passed', 'errors', 'details']);
    expect(schema.BidDocumentBuildLog.validationRules.join('\n')).toContain('errors=["not_run"]');
    expect(schema.BidDocumentBuildLog.validationRules.join('\n')).toContain('Import workflows may include importCheckKeys');
    expect(schema.BidDocumentReadinessReport.required).toContain('assetInventory');
    expect(schema.BidDocumentQuoteReconciliation.fields.quoteDifference).toContain('targetTotal - quoteTotal');
    expect(schema.BidDocumentAssetInventoryItem.fields.status).toContain('demo_only');
    expect(schema.BidDocumentReadinessCheckSummary.fields.status).toBe('passed|failed|not_run');
  });
});
