// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createGenericSample,
  createSmartCanteenSample,
  getBidDocumentTemplate,
} = require('../../../electron/services/bidDocumentTemplates.cjs') as {
  createGenericSample: (overrides?: Record<string, unknown>) => {
    template: Record<string, any>;
    projectData: Record<string, any>;
    quoteItems: Array<Record<string, any>>;
    assetMap: Record<string, Record<string, any>>;
  };
  createSmartCanteenSample: (overrides?: Record<string, unknown>) => {
    template: Record<string, any>;
    projectData: Record<string, any>;
    quoteItems: Array<Record<string, any>>;
    assetMap: Record<string, Record<string, any>>;
  };
  getBidDocumentTemplate: (templateId?: string) => Record<string, any>;
};
const {
  validateBidDocumentProject,
  validateAssets,
  validateDocumentTitle,
  validateForbiddenWords,
  validatePaymentTerms,
  validateQuoteTotals,
  validateSectionSelection,
  validateTemplateDefinition,
} = require('../../../electron/services/bidDocumentValidation.cjs') as {
  validateBidDocumentProject: (input: Record<string, unknown>) => { passed: boolean; errors: string[]; assetCheck: { passed: boolean; errors: string[] }; forbiddenWordsCheck: { passed: boolean; errors: string[] }; identityCheck: { passed: boolean; errors: string[] }; templateCheck?: { passed: boolean; errors: string[] }; titleCheck: { passed: boolean; errors: string[] } };
  validateAssets: (assetMap: Record<string, unknown>, template: Record<string, unknown>, projectData?: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateDocumentTitle: (template: Record<string, unknown>) => { passed: boolean; errors: string[] };
  validateForbiddenWords: (text: string) => { passed: boolean; errors: string[] };
  validatePaymentTerms: (projectData: Record<string, unknown>, template: Record<string, unknown>) => { passed: boolean; errors: string[] };
  validateQuoteTotals: (projectData: Record<string, unknown>, quoteItems: Array<Record<string, unknown>>, template: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, any> };
  validateSectionSelection: (template: Record<string, unknown>, projectData: Record<string, unknown>) => { passed: boolean; errors: string[] };
  validateTemplateDefinition: (template: Record<string, unknown>) => { passed: boolean; errors: string[]; details?: Record<string, unknown> };
};

describe('bid document validation', () => {
  it('exposes a smart canteen template without hard-coding it as the only template shape', () => {
    const template = getBidDocumentTemplate('smart-canteen-response');

    expect(template.id).toBe('smart-canteen-response');
    expect(template.sections.map((section: Record<string, unknown>) => section.id)).toContain('technical-solution');
    expect(template.requiredAssetKeys).toContain('business_license');
    expect(template.validationProfile.quoteTotalWithTax).toBe(135050);
  });

  it('catches the smart canteen source-data total mismatch instead of inventing a correction', () => {
    const sample = createSmartCanteenSample({ assetMap: {} });
    const invalid = validateQuoteTotals(sample.projectData, sample.quoteItems, sample.template);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('133050');
    expect(invalid.errors.join('\n')).toContain('135050');
  });

  it('passes generic quote validation when project data and rows are consistent', () => {
    const template = { validationProfile: {} };
    const projectData = { totalWithTax: 300, totalWithoutTax: 265.49, taxPolicy: { softwareHardwareRate: 0.13 } };
    const quoteItems = [
      { name: '软件', brandModel: 'GEN-SYS V1.0', quantity: 1, unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13, category: 'software' },
      { name: '硬件', brandModel: 'GEN-DEVICE-100', quantity: 2, unitPriceWithTax: 100, totalWithTax: 200, taxRate: 0.13, category: 'hardware' },
    ];

    const valid = validateQuoteTotals(projectData, quoteItems, template);

    expect(valid.passed).toBe(true);
  });

  it('rejects quote tax rates and categories that do not match the project tax policy', () => {
    const invalid = validateQuoteTotals(
      {
        totalWithTax: 400,
        totalWithoutTax: 360,
        taxPolicy: {
          softwareHardwareRate: 0.13,
          serviceRate: 0.06,
          defaultRate: 1.2,
        },
      },
      [
        { name: '软件', brandModel: 'GEN-SYS V1.0', quantity: 1, unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.06, category: 'software' },
        { name: '实施服务', brandModel: 'GEN-SVC', quantity: 1, unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13, category: 'service' },
        { name: '其他', brandModel: 'GEN-OTHER', quantity: 1, unitPriceWithTax: 100, totalWithTax: 100, taxRate: 2, category: 'other' },
        { name: '错误分类', brandModel: 'GEN-BAD', quantity: 1, unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13, category: 'contract' },
      ],
      { validationProfile: {} },
    );

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('projectData.taxPolicy.defaultRate should be a rate between 0 and 1');
    expect(invalid.errors.join('\n')).toContain('quote_items[0] taxRate should match projectData.taxPolicy.softwareHardwareRate for software: expected 0.13, got 0.06');
    expect(invalid.errors.join('\n')).toContain('quote_items[1] taxRate should match projectData.taxPolicy.serviceRate for service: expected 0.06, got 0.13');
    expect(invalid.errors.join('\n')).toContain('quote_items[2] taxRate should be a rate between 0 and 1');
    expect(invalid.errors.join('\n')).toContain('quote_items[3] category should be software|hardware|service|material|other');
    expect(invalid.errors.join('\n')).not.toContain('projectData.taxPolicy.defaultRate for other');
    expect(invalid.errors.join('\n')).not.toContain('contract: expected');
    expect(invalid.details?.invalidTaxPolicyFields).toEqual(expect.arrayContaining(['defaultRate']));
    expect(invalid.details?.invalidQuoteTaxRates).toEqual(expect.arrayContaining(['2:2']));
    expect(invalid.details?.invalidQuoteCategories).toEqual(expect.arrayContaining(['3:contract']));
    expect(invalid.details?.mismatchedQuoteTaxRates).toEqual(expect.arrayContaining([
      '0:software:0.06->softwareHardwareRate:0.13',
      '1:service:0.13->serviceRate:0.06',
    ]));
  });

  it('keeps smart canteen quote tax rates aligned with the 13 percent software and hardware policy', () => {
    const sample = createSmartCanteenSample({ assetMap: {} });
    const invalid = validateQuoteTotals(
      sample.projectData,
      sample.quoteItems.map((item: Record<string, unknown>, index: number) => (
        index === 0 ? { ...item, taxRate: 0.06 } : item
      )),
      sample.template,
    );

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('quote_items[0] taxRate should match projectData.taxPolicy.softwareHardwareRate for software: expected 0.13, got 0.06');
  });

  it('validates template package structure before data and Word generation', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-template',
      name: '错误模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: ['license', 'license'],
      validationProfile: {
        requiredSectionIds: ['quote-summary', 'not-in-template'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'quote-summary', title: '重复报价一览表', level: 1, required: true },
        { id: 'duplicate-title-section', title: '一、报价一览表', level: 1, required: true },
        { id: 'missing-parent-nested', title: '缺少父级的二级章节', level: 2, required: true },
        { id: 'child-section', title: '子章节', level: 2, required: true, parentId: 'missing-parent' },
      ],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template section id duplicated: quote-summary');
    expect(invalid.errors.join('\n')).toContain('template section title duplicated: 一、报价一览表');
    expect(invalid.errors.join('\n')).toContain('template nested section should declare parentId: missing-parent-nested');
    expect(invalid.errors.join('\n')).toContain('template section parent does not exist: child-section -> missing-parent');
    expect(invalid.errors.join('\n')).toContain('template required section does not exist: not-in-template');
    expect(invalid.errors.join('\n')).toContain('template required asset key duplicated: license');
    expect(invalid.details?.duplicateSectionTitles).toEqual(expect.arrayContaining(['一、报价一览表']));
    expect(invalid.details?.missingNestedParentIds).toEqual(expect.arrayContaining(['missing-parent-nested']));
  });

  it('rejects required template assets that are not declared as asset definitions', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-asset-definition-template',
      name: '附件定义错误模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: ['qualification_scan', 'missing_required_scan', 'optional_required_scan'],
      assetDefinitions: [
        { key: 'qualification_scan', title: '资质证明扫描件', sectionId: 'supplier-basic-info', type: 'image', required: true },
        { key: 'optional_required_scan', title: '矛盾必填附件', sectionId: 'supplier-basic-info', type: 'image', required: false },
        { key: 'duplicate_scan', title: '重复附件 A', sectionId: 'supplier-basic-info', type: 'image', required: true },
        { key: 'duplicate_scan', title: '重复附件 B', sectionId: 'supplier-basic-info', type: 'image', required: true },
        { key: 'bad_section_scan', title: '错误章节附件', sectionId: 'missing-section', type: 'image', required: true },
        { key: 'bad_type_scan', title: '错误类型附件', sectionId: 'supplier-basic-info', type: 'webp', required: true },
      ],
      validationProfile: {
        requiredSectionIds: ['supplier-basic-info'],
      },
      sections: [{ id: 'supplier-basic-info', title: '四、供应商基本情况表', level: 1, required: true }],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template required asset key has no asset definition: missing_required_scan');
    expect(invalid.errors.join('\n')).toContain('template required asset definition cannot be optional: optional_required_scan');
    expect(invalid.errors.join('\n')).toContain('template asset definition key duplicated: duplicate_scan');
    expect(invalid.errors.join('\n')).toContain('template asset definition section does not exist: bad_section_scan -> missing-section');
    expect(invalid.errors.join('\n')).toContain('template asset definition type should be image|scan|document: bad_type_scan');
    expect(invalid.details?.missingRequiredAssetDefinitions).toEqual(expect.arrayContaining(['missing_required_scan']));
    expect(invalid.details?.inconsistentRequiredAssetDefinitions).toEqual(expect.arrayContaining(['optional_required_scan']));
    expect(invalid.details?.duplicateAssetDefinitionKeys).toEqual(expect.arrayContaining(['duplicate_scan']));
    expect(invalid.details?.invalidAssetDefinitionSections).toEqual(expect.arrayContaining(['bad_section_scan:missing-section']));
    expect(invalid.details?.invalidAssetDefinitionTypes).toEqual(expect.arrayContaining(['bad_type_scan:webp']));
  });

  it('requires template validation profiles to declare non-empty unique required section ids', () => {
    const missingRequiredSectionIds = validateTemplateDefinition({
      id: 'missing-required-sections-template',
      name: '缺少必备章节声明模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {},
      sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
    });
    const emptyRequiredSectionIds = validateTemplateDefinition({
      id: 'empty-required-sections-template',
      name: '空必备章节声明模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: { requiredSectionIds: [] },
      sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
    });
    const invalidRequiredSectionIds = validateTemplateDefinition({
      id: 'invalid-required-sections-template',
      name: '错误必备章节声明模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: { requiredSectionIds: ['', 'quote-summary', 'quote-summary'] },
      sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
    });

    expect(missingRequiredSectionIds.passed).toBe(false);
    expect(missingRequiredSectionIds.errors.join('\n')).toContain('template validationProfile.requiredSectionIds should be an array');
    expect(emptyRequiredSectionIds.passed).toBe(false);
    expect(emptyRequiredSectionIds.errors.join('\n')).toContain('template validationProfile.requiredSectionIds should not be empty');
    expect(invalidRequiredSectionIds.passed).toBe(false);
    expect(invalidRequiredSectionIds.errors.join('\n')).toContain('template validationProfile.requiredSectionIds[0] is empty');
    expect(invalidRequiredSectionIds.errors.join('\n')).toContain('template required section id duplicated: quote-summary');
    expect(invalidRequiredSectionIds.details?.invalidRequiredSectionIds).toEqual(expect.arrayContaining([0]));
    expect(invalidRequiredSectionIds.details?.duplicateRequiredSectionIds).toEqual(expect.arrayContaining(['quote-summary']));
  });

  it('rejects malformed optional validation profile constraints before generation', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-validation-profile-template',
      name: '错误校验 Profile 模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {
        requiredSectionIds: ['quote-summary'],
        quoteTotalWithTax: 0,
        requiredModels: ['', 'MODEL-A', 'MODEL-A'],
        paymentRequiredText: '',
        paymentForbiddenText: '   ',
        requiredDocumentTitleText: '',
      },
      sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template validationProfile.quoteTotalWithTax should be greater than 0 when provided');
    expect(invalid.errors.join('\n')).toContain('template validationProfile.requiredModels[0] is empty');
    expect(invalid.errors.join('\n')).toContain('template required quote model duplicated: MODEL-A');
    expect(invalid.errors.join('\n')).toContain('template validationProfile.paymentRequiredText should not be empty when provided');
    expect(invalid.errors.join('\n')).toContain('template validationProfile.paymentForbiddenText should not be empty when provided');
    expect(invalid.errors.join('\n')).toContain('template validationProfile.requiredDocumentTitleText should not be empty when provided');
    expect(invalid.details?.invalidValidationProfileFields).toEqual(expect.arrayContaining([
      'quoteTotalWithTax',
      'paymentRequiredText',
      'paymentForbiddenText',
      'requiredDocumentTitleText',
    ]));
    expect(invalid.details?.invalidRequiredModels).toEqual(expect.arrayContaining([0]));
    expect(invalid.details?.duplicateRequiredModels).toEqual(expect.arrayContaining(['MODEL-A']));
  });

  it('rejects requiredModels when provided as a non-array profile value', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-required-models-template',
      name: '错误型号 Profile 模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {
        requiredSectionIds: ['quote-summary'],
        requiredModels: 'MODEL-A',
      },
      sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template validationProfile.requiredModels should be an array when provided');
    expect(invalid.details?.invalidValidationProfileFields).toEqual(expect.arrayContaining(['requiredModels']));
  });

  it('rejects template section parent cycles and invalid parent level ordering', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-section-tree-template',
      name: '章节树错误模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {
        requiredSectionIds: ['quote-summary'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'level-parent', title: '父级层级错误', level: 2, required: true },
        { id: 'level-child', title: '子级层级错误', level: 1, required: true, parentId: 'level-parent' },
        { id: 'cycle-a', title: '循环章节 A', level: 2, required: true, parentId: 'cycle-b' },
        { id: 'cycle-b', title: '循环章节 B', level: 3, required: true, parentId: 'cycle-a' },
        { id: 'late-parent-child', title: '早于父级的子章节', level: 2, required: true, parentId: 'late-parent' },
        { id: 'late-parent', title: '晚出现的父章节', level: 1, required: true },
        { id: 'skip-parent', title: '跳级父章节', level: 1, required: true },
        { id: 'skip-child', title: '跳级子章节', level: 3, required: true, parentId: 'skip-parent' },
      ],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template section parent level should be lower than child: level-child -> level-parent');
    expect(invalid.errors.join('\n')).toContain('template section parent level should be direct parent: skip-child -> skip-parent');
    expect(invalid.errors.join('\n')).toContain('template section parent cycle detected: cycle-a -> cycle-b -> cycle-a');
    expect(invalid.errors.join('\n')).toContain('template section parent should appear before child: late-parent -> late-parent-child');
    expect(invalid.details?.invalidParentLevels).toEqual(expect.arrayContaining(['level-child:1->level-parent:2']));
    expect(invalid.details?.invalidParentLevelSkips).toEqual(expect.arrayContaining(['skip-child:3->skip-parent:1']));
    expect(invalid.details?.invalidParentOrder).toEqual(expect.arrayContaining(['late-parent-child:5->late-parent:6']));
    expect(invalid.details?.parentCycles).toEqual(expect.arrayContaining(['cycle-a -> cycle-b -> cycle-a']));
  });

  it('rejects template required sections placed under optional ancestors', () => {
    const invalid = validateTemplateDefinition({
      id: 'bad-optional-parent-template',
      name: '可选父章节错误模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {
        requiredSectionIds: ['profile-required-child'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'optional-parent', title: '可选父章节', level: 1, required: false },
        { id: 'required-child', title: '必选子章节', level: 2, required: true, parentId: 'optional-parent' },
        { id: 'profile-required-child', title: 'Profile 必备子章节', level: 2, required: false, parentId: 'optional-parent' },
      ],
    });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('template required section cannot be under optional ancestor: required-child -> optional-parent');
    expect(invalid.errors.join('\n')).toContain('template required section cannot be under optional ancestor: profile-required-child -> optional-parent');
    expect(invalid.errors.join('\n')).toContain('template required section should be marked required: profile-required-child');
    expect(invalid.details?.requiredSectionsUnderOptionalAncestors).toEqual(expect.arrayContaining([
      'required-child->optional-parent',
      'profile-required-child->optional-parent',
    ]));
    expect(invalid.details?.profileRequiredSectionsNotMarkedRequired).toEqual(expect.arrayContaining(['profile-required-child']));
  });

  it('blocks preflight when the selected template package is structurally invalid', () => {
    const result = validateBidDocumentProject({
      template: {
        id: 'bad-template',
        name: '错误模板',
        documentTitle: '响应文件',
        industry: '通用',
        requiredAssetKeys: [],
        validationProfile: {
          requiredSectionIds: ['not-in-template'],
        },
        sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
      },
      projectData: {
        projectName: '测试项目',
        purchaserName: '测试采购人',
        supplierName: '测试供应商',
        totalWithTax: 100,
        paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付合同总价款的 100%。' }],
      },
      quoteItems: [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
      assetMap: {},
    });

    expect(result.passed).toBe(false);
    expect(result.templateCheck?.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('template required section does not exist: not-in-template');
  });

  it('requires quote rows to carry item names and brand models', () => {
    const invalid = validateQuoteTotals(
      { totalWithTax: 100, totalWithoutTax: 90 },
      [{ name: '', quantity: 1, brandModel: '', unitPriceWithTax: 100, totalWithTax: 100 }],
      { validationProfile: {} },
    );

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('quote_items[0] missing name');
    expect(invalid.errors.join('\n')).toContain('quote_items[0] missing brandModel');
  });

  it('rejects missing or zero formal quote amounts before Word generation', () => {
    const missingSummary = validateQuoteTotals(
      { totalWithTax: 100 },
      [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
      { validationProfile: {} },
    );
    const zeroRow = validateQuoteTotals(
      { totalWithTax: 0, totalWithoutTax: 0 },
      [{ name: '赠品', quantity: 1, brandModel: 'FREE-ITEM', unitPriceWithTax: 0, totalWithTax: 0 }],
      { validationProfile: {} },
    );
    const impossibleTax = validateQuoteTotals(
      { totalWithTax: 100, totalWithoutTax: 120 },
      [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
      { validationProfile: {} },
    );

    expect(missingSummary.passed).toBe(false);
    expect(missingSummary.errors.join('\n')).toContain('projectData.totalWithoutTax should be greater than 0');
    expect(zeroRow.passed).toBe(false);
    expect(zeroRow.errors.join('\n')).toContain('projectData.totalWithTax should be greater than 0');
    expect(zeroRow.errors.join('\n')).toContain('quote_items[0] unitPriceWithTax should be greater than 0');
    expect(zeroRow.errors.join('\n')).toContain('quote_items[0] totalWithTax should be greater than 0');
    expect(impossibleTax.passed).toBe(false);
    expect(impossibleTax.errors.join('\n')).toContain('projectData.totalWithoutTax should not exceed totalWithTax');
  });

  it('allows disabling optional template sections but rejects required or unknown sections', () => {
    const template = {
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'backup-service', title: '后备服务', level: 2, required: false },
      ],
    };

    const valid = validateSectionSelection(template, { disabledSectionIds: ['backup-service'] });
    const invalidRequired = validateSectionSelection(template, { disabledSectionIds: ['quote-summary'] });
    const invalidUnknown = validateSectionSelection(template, { disabledSectionIds: ['not-in-template'] });

    expect(valid.passed).toBe(true);
    expect(invalidRequired.passed).toBe(false);
    expect(invalidRequired.errors.join('\n')).toContain('required section cannot be disabled: quote-summary');
    expect(invalidUnknown.passed).toBe(false);
    expect(invalidUnknown.errors.join('\n')).toContain('disabled section does not exist in template: not-in-template');
  });

  it('rejects disabling an optional parent section that contains required descendants', () => {
    const template = {
      validationProfile: {
        requiredSectionIds: ['profile-required-child'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'optional-parent', title: '可选父章节', level: 1, required: false },
        { id: 'required-child', title: '必选子章节', level: 2, required: true, parentId: 'optional-parent' },
        { id: 'profile-required-child', title: 'Profile 必备子章节', level: 2, required: false, parentId: 'optional-parent' },
      ],
    };

    const invalid = validateSectionSelection(template, { disabledSectionIds: ['optional-parent'] });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('section with required descendants cannot be disabled: optional-parent -> required-child, profile-required-child');
  });

  it('rejects disabling a section required by the template validation profile', () => {
    const template = {
      validationProfile: {
        requiredSectionIds: ['profile-required-section'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'profile-required-section', title: 'Profile 必备章节', level: 1, required: false },
      ],
    };

    const invalid = validateSectionSelection(template, { disabledSectionIds: ['profile-required-section'] });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('required section cannot be disabled: profile-required-section');
  });

  it('blocks old technical-file title wording before Word generation', () => {
    const result = validateBidDocumentProject({
      template: {
        id: 'bad-title',
        name: '错误标题模板',
        documentTitle: '投标技术文件',
        industry: '通用',
        requiredAssetKeys: [],
        validationProfile: {},
        sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
      },
      projectData: {
        projectName: '测试项目',
        purchaserName: '测试采购人',
        supplierName: '测试供应商',
        totalWithTax: 100,
        paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付合同总价款的 100%。' }],
      },
      quoteItems: [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
      assetMap: {},
    });

    expect(result.passed).toBe(false);
    expect(result.forbiddenWordsCheck.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('投标技术文件');
  });

  it('requires a formal response document title', () => {
    const invalid = validateDocumentTitle({ documentTitle: '项目技术说明书', validationProfile: {} });

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('响应文件');
  });

  it('rejects project data and asset mappings that belong to a different template package', () => {
    const sample = createGenericSample();
    const result = validateBidDocumentProject({
      ...sample,
      projectData: {
        ...sample.projectData,
        templateId: 'smart-canteen-response',
      },
      assetMap: {
        ...sample.assetMap,
        qualification_scan: {
          ...sample.assetMap.qualification_scan,
          templateId: 'smart-canteen-response',
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.identityCheck.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('projectData.templateId should match template.id: expected generic-response, got smart-canteen-response');
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.templateId should match template.id: expected generic-response, got smart-canteen-response');
  });

  it('requires project data to declare the selected template id in direct validation calls', () => {
    const sample = createGenericSample();
    const { templateId: _templateId, ...projectDataWithoutTemplateId } = sample.projectData;

    const result = validateBidDocumentProject({
      ...sample,
      projectData: projectDataWithoutTemplateId,
    });

    expect(result.passed).toBe(false);
    expect(result.identityCheck.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('missing project identity field: templateId');
  });

  it('blocks compact AI-origin wording variants', () => {
    const invalid = validateForbiddenWords('内容由AI生成');

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('内容由AI生成');
  });

  it('blocks every formal bid forbidden phrase required by the response-file generator', () => {
    const forbiddenPhrases = [
      '内容由 AI 生成',
      '内容由AI生成',
      '投标技术文件',
      '待补',
      '页码待最终装订后填写',
      'P__',
      '图：证明材料页',
      '如当前未',
      '仅作为同系列样例',
      '拟装订',
      '不得以历史样式文件替代',
      '本页待补',
      '请填写',
    ];

    for (const phrase of forbiddenPhrases) {
      const invalid = validateForbiddenWords(`正式响应文件正文 ${phrase}`);

      expect(invalid.passed).toBe(false);
      expect(invalid.errors.join('\n')).toContain(phrase);
    }
  });

  it('blocks incomplete form prompts before Word generation', () => {
    const invalid = validateForbiddenWords('请填写付款说明。');

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('请填写');
  });

  it('blocks incomplete tax policy descriptions before Word generation', () => {
    const sample = createGenericSample();
    const result = validateBidDocumentProject({
      ...sample,
      projectData: {
        ...sample.projectData,
        taxPolicy: {
          description: '请填写最终税率口径。',
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.forbiddenWordsCheck.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('请填写');
  });

  it('blocks incomplete payment stage labels before Word generation', () => {
    const sample = createGenericSample();
    const result = validateBidDocumentProject({
      ...sample,
      projectData: {
        ...sample.projectData,
        paymentTerms: [
          { stage: '待补付款节点', ratio: 100, text: '验收后支付合同总价款的 100%。' },
        ],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.forbiddenWordsCheck.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('待补');
  });

  it('blocks incomplete document asset filenames before Word generation', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-document-name-'));
    try {
      const documentPath = path.join(tempDir, '待补合同案例.pdf');
      fs.writeFileSync(documentPath, '%PDF-1.4\n');
      const result = validateBidDocumentProject({
        template: {
          id: 'document-name-test',
          name: '附件文件名测试模板',
          documentTitle: '响应文件',
          industry: '通用',
          requiredAssetKeys: ['contract_case_scan'],
          validationProfile: {
            requiredSectionIds: ['quote-summary'],
          },
          sections: [
            { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
            { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
          ],
        },
        projectData: {
          templateId: 'document-name-test',
          projectName: '测试项目',
          purchaserName: '测试采购人',
          supplierName: '测试供应商',
          totalWithTax: 100,
          totalWithoutTax: 88,
          paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付合同总价款的 100%。' }],
        },
        quoteItems: [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
        assetMap: {
          contract_case_scan: {
            key: 'contract_case_scan',
            title: '合同案例证明原始文件',
            filePath: documentPath,
            type: 'document',
            required: true,
            sectionId: 'other-materials',
            templateId: 'document-name-test',
          },
        },
      });

      expect(result.passed).toBe(false);
      expect(result.assetCheck.passed).toBe(false);
      expect(result.assetCheck.errors.join('\n')).toContain('required_asset_must_be_image_or_scan:contract_case_scan');
      expect(result.forbiddenWordsCheck.passed).toBe(false);
      expect(result.errors.join('\n')).toContain('待补');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps the 12 month payment requirement in the smart canteen profile', () => {
    const sample = createSmartCanteenSample();
    const valid = validatePaymentTerms(sample.projectData, sample.template);
    expect(valid.passed).toBe(true);

    const invalid = validatePaymentTerms({
      ...sample.projectData,
      paymentTerms: sample.projectData.paymentTerms.map((term: Record<string, unknown>) => ({
        ...term,
        text: String(term.text).replace('12 个月', '3 个月'),
      })),
    }, sample.template);
    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('12 个月');
  });

  it('checks smart canteen payment profile text across stage labels and descriptions', () => {
    const sample = createSmartCanteenSample();
    const stageCarriesRequirement = validatePaymentTerms({
      ...sample.projectData,
      paymentTerms: [
        { stage: '设备到现场', ratio: 30, text: '支付合同总价款的 30%。' },
        { stage: '设备调试合格', ratio: 20, text: '支付合同总价款的 20%。' },
        { stage: '使用时间 12 个月后无质量问题', ratio: 45, text: '支付总价款的 45%。' },
        { stage: '质保期结束', ratio: 5, text: '无质量问题 10 日内支付总价款的 5% 质保金。' },
      ],
    }, sample.template);
    const stageCarriesForbiddenTerm = validatePaymentTerms({
      ...sample.projectData,
      paymentTerms: [
        { stage: '设备到现场', ratio: 30, text: '支付合同总价款的 30%。' },
        { stage: '设备调试合格', ratio: 20, text: '支付合同总价款的 20%。' },
        { stage: '使用时间 3 个月后无质量问题', ratio: 45, text: '支付总价款的 45%。' },
        { stage: '质保期结束', ratio: 5, text: '无质量问题 10 日内支付总价款的 5% 质保金。' },
      ],
    }, sample.template);

    expect(stageCarriesRequirement.passed).toBe(true);
    expect(stageCarriesForbiddenTerm.passed).toBe(false);
    expect(stageCarriesForbiddenTerm.errors.join('\n')).toContain('forbidden payment text found: 使用时间 3 个月后无质量问题');
  });

  it('rejects invalid payment term row ratios even when the ratio total is 100', () => {
    const sample = createGenericSample();
    const invalid = validatePaymentTerms({
      ...sample.projectData,
      paymentTerms: [
        { stage: '扣减项', ratio: -20, text: '扣减 20%。' },
        { stage: '异常尾款', ratio: 120, text: '支付 120%。' },
      ],
    }, sample.template);

    expect(invalid.passed).toBe(false);
    expect(invalid.errors.join('\n')).toContain('payment_terms[0] ratio should be greater than 0 and less than or equal to 100');
    expect(invalid.errors.join('\n')).toContain('payment_terms[1] ratio should be greater than 0 and less than or equal to 100');
  });

  it('blocks final generation when required assets are missing', () => {
    const sample = createSmartCanteenSample();
    const result = validateBidDocumentProject(sample);

    expect(result.passed).toBe(false);
    expect(result.assetCheck.passed).toBe(false);
    expect(result.assetCheck.errors[0]).toContain('missing_assets');
  });

  it('blocks forbidden words in asset titles during preflight validation', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-asset-title-'));
    try {
      const filePath = path.join(tempDir, 'license.png');
      fs.writeFileSync(filePath, 'png-bytes');
      const result = validateBidDocumentProject({
        template: {
          id: 'asset-title-test',
          name: '附件标题测试模板',
          documentTitle: '响应文件',
          industry: '通用',
          requiredAssetKeys: ['business_license'],
          validationProfile: {
            requiredSectionIds: ['quote-summary'],
          },
          sections: [{ id: 'quote-summary', title: '一、报价一览表', level: 1, required: true }],
        },
        projectData: {
          projectName: '测试项目',
          purchaserName: '测试采购人',
          supplierName: '测试供应商',
          totalWithTax: 100,
          paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付合同总价款的 100%。' }],
        },
        quoteItems: [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }],
        assetMap: {
          business_license: {
            key: 'business_license',
            title: '图：证明材料页',
            filePath,
            type: 'image',
            required: true,
            sectionId: 'supplier-basic-info',
          },
        },
      });

      expect(result.passed).toBe(false);
      expect(result.forbiddenWordsCheck.passed).toBe(false);
      expect(result.errors.join('\n')).toContain('图：证明材料页');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('ignores forbidden words in optional assets attached to disabled optional sections only', () => {
    const template = {
      id: 'optional-disabled-asset-forbidden-test',
      name: '可选附件禁用词测试模板',
      documentTitle: '响应文件',
      industry: '通用',
      requiredAssetKeys: [],
      validationProfile: {
        requiredSectionIds: ['quote-summary'],
      },
      sections: [
        { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
        { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
        { id: 'backup-service', title: '后备服务', level: 2, required: false, parentId: 'other-materials' },
      ],
    };
    const projectData = {
      templateId: 'optional-disabled-asset-forbidden-test',
      projectName: '测试项目',
      purchaserName: '测试采购人',
      supplierName: '测试供应商',
      totalWithTax: 100,
      totalWithoutTax: 88,
      paymentTerms: [{ stage: '验收', ratio: 100, text: '验收后支付合同总价款的 100%。' }],
    };
    const quoteItems = [{ name: '软件', quantity: 1, brandModel: 'TEST-SYS', unitPriceWithTax: 100, totalWithTax: 100 }];
    const assetMap = {
      backup_service_proof: {
        key: 'backup_service_proof',
        title: '待补后备服务证明材料',
        filePath: '/tmp/yibiao-disabled-optional-asset.png',
        type: 'image',
        required: true,
        sectionId: 'backup-service',
        templateId: 'optional-disabled-asset-forbidden-test',
      },
    };

    const disabled = validateBidDocumentProject({
      template,
      projectData: {
        ...projectData,
        disabledSectionIds: ['backup-service'],
      },
      quoteItems,
      assetMap,
    });
    const enabled = validateBidDocumentProject({
      template,
      projectData,
      quoteItems,
      assetMap,
    });

    expect(disabled.forbiddenWordsCheck.passed).toBe(true);
    expect(disabled.assetCheck.passed).toBe(true);
    expect(disabled.errors.join('\n')).not.toContain('forbidden word found: 待补');
    expect(disabled.errors.join('\n')).not.toContain('missing_assets:backup_service_proof');
    expect(enabled.forbiddenWordsCheck.passed).toBe(false);
    expect(enabled.errors.join('\n')).toContain('forbidden word found: 待补');
  });

  it('rejects malformed asset mapping records before Word generation', () => {
    const sample = createGenericSample();
    const assetMap = {
      ...sample.assetMap,
      qualification_scan: {
        ...sample.assetMap.qualification_scan,
        key: 'wrong_asset_key',
        title: '',
        type: 'video',
        required: 'false',
        sectionId: 'not-in-template',
      },
    };

    const result = validateAssets(assetMap, sample.template, sample.projectData);

    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.key should equal map key');
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.title is required');
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.type should be image|scan|document');
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.required should be boolean');
    expect(result.errors.join('\n')).toContain('assetMap.qualification_scan.sectionId does not exist in template: not-in-template');
    expect(result.details?.invalid_asset_required_values).toEqual(expect.arrayContaining(['qualification_scan']));
  });

  it('rejects required asset keys that do not have an asset mapping record', () => {
    const sample = createGenericSample();
    const { qualification_scan: _qualificationScan, ...assetMapWithoutRequiredKey } = sample.assetMap;

    const result = validateAssets(assetMapWithoutRequiredKey, sample.template, sample.projectData);

    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('missing_required_asset_mapping:qualification_scan');
    expect(result.details?.missing_required_asset_mappings).toEqual(expect.arrayContaining(['qualification_scan']));
  });

  it('rejects required assets that exist but cannot be inserted as images', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-assets-'));
    try {
      const pdfPath = path.join(tempDir, 'contract.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4\n');
      const result = validateAssets({
        contract_case_scan: {
          key: 'contract_case_scan',
          title: '合同案例证明扫描件',
          filePath: pdfPath,
          type: 'image',
          required: true,
          sectionId: 'other-materials',
        },
      }, { requiredAssetKeys: ['contract_case_scan'] });

      expect(result.passed).toBe(false);
      expect(result.errors.join('\n')).toContain('unsupported_asset_type:contract_case_scan:.pdf');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects required document asset references because formal materials must be inserted as images or scans', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-assets-'));
    try {
      const pdfPath = path.join(tempDir, 'contract.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4\n');
      const result = validateAssets({
        contract_case_scan: {
          key: 'contract_case_scan',
          title: '合同案例证明原始文件',
          filePath: pdfPath,
          type: 'document',
          required: true,
          sectionId: 'other-materials',
        },
      }, { requiredAssetKeys: ['contract_case_scan'] });

      expect(result.passed).toBe(false);
      expect(result.errors.join('\n')).toContain('required_asset_must_be_image_or_scan:contract_case_scan');
      expect(result.details?.required_document_assets).toEqual(['contract_case_scan']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('accepts optional document asset references as real non-empty files without image insertion checks', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-assets-'));
    try {
      const pdfPath = path.join(tempDir, 'contract.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4\n');
      const result = validateAssets({
        contract_case_document: {
          key: 'contract_case_document',
          title: '合同案例证明原始文件',
          filePath: pdfPath,
          type: 'document',
          required: false,
          sectionId: 'other-materials',
        },
      }, { requiredAssetKeys: [] });

      expect(result.passed).toBe(true);
      expect(result.details?.document_assets).toEqual(['contract_case_document']);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects optional asset references when their selected files are missing', () => {
    const result = validateAssets({
      optional_screenshot: {
        key: 'optional_screenshot',
        title: '可选截图',
        filePath: '/tmp/yibiao-missing-optional-asset.png',
        type: 'image',
        required: false,
        sectionId: 'technical-solution',
      },
    }, { requiredAssetKeys: [] });

    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('missing_asset_file:optional_screenshot');
  });

  it('does not validate optional asset files attached to disabled optional sections', () => {
    const result = validateAssets({
      backup_service_proof: {
        key: 'backup_service_proof',
        title: '后备服务可选证明材料',
        filePath: '/tmp/yibiao-disabled-optional-asset.png',
        type: 'image',
        required: true,
        sectionId: 'backup-service',
      },
    }, {
      requiredAssetKeys: ['backup_service_proof'],
      sections: [
        { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
        { id: 'backup-service', title: '后备服务', level: 2, required: false, parentId: 'other-materials' },
      ],
    }, { disabledSectionIds: ['backup-service'] });

    expect(result.passed).toBe(true);
    expect(result.errors.join('\n')).not.toContain('missing_assets:backup_service_proof');
  });

  it('still validates optional asset files attached to unknown sections', () => {
    const result = validateAssets({
      unknown_optional_asset: {
        key: 'unknown_optional_asset',
        title: '未知章节附件',
        filePath: '/tmp/yibiao-unknown-section-asset.png',
        type: 'image',
        required: false,
        sectionId: 'not-in-template',
      },
    }, {
      requiredAssetKeys: [],
      sections: [
        { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
      ],
    }, {});

    expect(result.passed).toBe(false);
    expect(result.errors.join('\n')).toContain('missing_asset_file:unknown_optional_asset');
  });

  it('rejects optional asset references when their selected formats cannot be inserted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-optional-assets-'));
    try {
      const pdfPath = path.join(tempDir, 'optional-proof.pdf');
      fs.writeFileSync(pdfPath, '%PDF-1.4\n');
      const result = validateAssets({
        optional_proof: {
          key: 'optional_proof',
          title: '可选证明材料',
          filePath: pdfPath,
          type: 'image',
          required: false,
          sectionId: 'other-materials',
        },
      }, { requiredAssetKeys: [] });

      expect(result.passed).toBe(false);
      expect(result.errors.join('\n')).toContain('unsupported_asset_type:optional_proof:.pdf');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps asset validation aligned with Word image insertion formats', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bid-document-image-formats-'));
    try {
      const jpegPath = path.join(tempDir, 'certificate.jpeg');
      const webpPath = path.join(tempDir, 'certificate.webp');
      fs.writeFileSync(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      fs.writeFileSync(webpPath, 'webp-bytes');

      const jpegResult = validateAssets({
        certificate_scan: {
          key: 'certificate_scan',
          title: '证书扫描件',
          filePath: jpegPath,
          type: 'image',
          required: true,
          sectionId: 'supplier-basic-info',
        },
      }, { requiredAssetKeys: ['certificate_scan'] });
      const webpResult = validateAssets({
        certificate_scan: {
          key: 'certificate_scan',
          title: '证书扫描件',
          filePath: webpPath,
          type: 'image',
          required: true,
          sectionId: 'supplier-basic-info',
        },
      }, { requiredAssetKeys: ['certificate_scan'] });

      expect(jpegResult.passed).toBe(true);
      expect(webpResult.passed).toBe(false);
      expect(webpResult.errors.join('\n')).toContain('unsupported_asset_type:certificate_scan:.webp');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
