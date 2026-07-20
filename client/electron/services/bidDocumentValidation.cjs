const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const {
  SUPPORTED_IMAGE_EXTENSION_DOT_SET: SUPPORTED_IMAGE_EXTENSIONS,
} = require('./bidDocumentAssets.cjs');

const SUPPORTED_ASSET_TYPES = new Set(['image', 'scan', 'document']);
const SUPPORTED_QUOTE_CATEGORIES = new Set(['software', 'hardware', 'service', 'material', 'other']);

const FORBIDDEN_WORDS = [
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

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function passed(details = {}) {
  return { passed: true, errors: [], details };
}

function failed(errors, details = {}) {
  return { passed: false, errors: Array.isArray(errors) ? errors : [String(errors)], details };
}

function mergeResults(results) {
  const errors = [];
  const details = {};
  for (const [key, result] of Object.entries(results)) {
    details[key] = result;
    if (!result.passed) errors.push(...result.errors);
  }
  return errors.length ? failed(errors, details) : passed(details);
}

function validateImageFileSignature(filePath, extension) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    const slice = header.subarray(0, bytesRead);
    const hex = slice.toString('hex');
    if (extension === '.png') {
      return hex.startsWith('89504e470d0a1a0a');
    }
    if (extension === '.jpg' || extension === '.jpeg') {
      return slice.length >= 3 && slice[0] === 0xff && slice[1] === 0xd8 && slice[2] === 0xff;
    }
    if (extension === '.gif') {
      const signature = slice.subarray(0, 6).toString('ascii');
      return signature === 'GIF87a' || signature === 'GIF89a';
    }
    if (extension === '.bmp') {
      return slice.length >= 2 && slice[0] === 0x42 && slice[1] === 0x4d;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function assetShouldEmbedAsImage(asset = {}) {
  const type = String(asset?.type || '').trim();
  return type === 'image' || type === 'scan';
}

function collectDocumentText({ template, projectData, quoteItems, assetMap }) {
  const sectionText = (template?.sections || []).map((section) => section.title).join('\n');
  const contentProfileText = JSON.stringify(template?.contentProfile || {});
  const taxPolicyText = JSON.stringify(projectData?.taxPolicy || {});
  const paymentText = (projectData?.paymentTerms || []).map((term) => `${term.stage || ''} ${term.text || ''}`).join('\n');
  const quoteText = (quoteItems || []).map((item) => `${item.name} ${item.brandModel} ${item.quantity} ${item.unitPriceWithTax} ${item.totalWithTax}`).join('\n');
  const assetText = Object.values(assetMap || {})
    .filter((asset) => assetNeedsDocxPresence(asset, template, projectData))
    .map((asset) => `${asset.key || ''} ${asset.title || ''} ${asset.sectionId || ''} ${asset.filePath ? path.basename(asset.filePath) : ''}`)
    .join('\n');
  return [
    template?.documentTitle || '',
    template?.name || '',
    template?.industry || '',
    projectData?.projectName || '',
    projectData?.purchaserName || '',
    projectData?.supplierName || '',
    sectionText,
    contentProfileText,
    taxPolicyText,
    paymentText,
    quoteText,
    assetText,
  ].join('\n');
}

function validateQuoteTotals(projectData = {}, quoteItems = [], template = {}) {
  const errors = [];
  const profile = template.validationProfile || {};
  const taxPolicy = projectData.taxPolicy && typeof projectData.taxPolicy === 'object' && !Array.isArray(projectData.taxPolicy)
    ? projectData.taxPolicy
    : {};
  const rows = Array.isArray(quoteItems) ? quoteItems : [];
  const rawProjectTotal = Number(projectData.totalWithTax);
  const rawProjectTotalWithoutTax = Number(projectData.totalWithoutTax);
  let sum = 0;
  const invalidTaxPolicyFields = [];
  const invalidQuoteCategories = [];
  const invalidQuoteTaxRates = [];
  const mismatchedQuoteTaxRates = [];

  const normalizeRate = (value) => Math.round(Number(value) * 1000000) / 1000000;
  const validateTaxPolicyRate = (field) => {
    if (!Object.prototype.hasOwnProperty.call(taxPolicy, field)) return null;
    const value = Number(taxPolicy[field]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      invalidTaxPolicyFields.push(field);
      errors.push(`projectData.taxPolicy.${field} should be a rate between 0 and 1`);
      return null;
    }
    return value;
  };
  const softwareHardwareRate = validateTaxPolicyRate('softwareHardwareRate');
  const serviceRate = validateTaxPolicyRate('serviceRate');
  const defaultRate = validateTaxPolicyRate('defaultRate');

  const expectedRateForCategory = (category) => {
    if (category === 'software' || category === 'hardware' || category === 'material') {
      return softwareHardwareRate == null ? null : { field: 'softwareHardwareRate', value: softwareHardwareRate };
    }
    if (category === 'service') {
      return serviceRate == null ? null : { field: 'serviceRate', value: serviceRate };
    }
    if (category === 'other') {
      return defaultRate == null ? null : { field: 'defaultRate', value: defaultRate };
    }
    return null;
  };

  if (!rows.length) {
    errors.push('quote_items should contain at least one row');
  }

  if (!Number.isFinite(rawProjectTotal) || rawProjectTotal <= 0) {
    errors.push('projectData.totalWithTax should be greater than 0');
  }
  if (!Number.isFinite(rawProjectTotalWithoutTax) || rawProjectTotalWithoutTax <= 0) {
    errors.push('projectData.totalWithoutTax should be greater than 0');
  }
  if (Number.isFinite(rawProjectTotal) && Number.isFinite(rawProjectTotalWithoutTax) && rawProjectTotalWithoutTax > rawProjectTotal) {
    errors.push('projectData.totalWithoutTax should not exceed totalWithTax');
  }

  rows.forEach((item, index) => {
    const name = String(item.name || '').trim();
    const brandModel = String(item.brandModel || '').trim();
    const quantity = Number(item.quantity);
    const unitPriceWithTax = Number(item.unitPriceWithTax);
    const totalWithTax = Number(item.totalWithTax);
    const rawCategory = String(item.category || '').trim();
    const hasTaxRate = Object.prototype.hasOwnProperty.call(item, 'taxRate') && item.taxRate !== '' && item.taxRate != null;
    const taxRate = Number(item.taxRate);
    const expected = roundMoney(quantity * unitPriceWithTax);
    const actual = roundMoney(totalWithTax);
    sum += actual;
    if (!name) {
      errors.push(`quote_items[${index}] missing name`);
    }
    if (!brandModel) {
      errors.push(`quote_items[${index}] missing brandModel`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`quote_items[${index}] quantity should be greater than 0`);
    }
    if (!Number.isFinite(unitPriceWithTax) || unitPriceWithTax <= 0) {
      errors.push(`quote_items[${index}] unitPriceWithTax should be greater than 0`);
    }
    if (!Number.isFinite(totalWithTax) || totalWithTax <= 0) {
      errors.push(`quote_items[${index}] totalWithTax should be greater than 0`);
    }
    if (expected !== actual) {
      errors.push(`quote_items[${index}] quantity * unitPriceWithTax should equal totalWithTax: expected ${expected}, got ${actual}`);
    }
    if (rawCategory && !SUPPORTED_QUOTE_CATEGORIES.has(rawCategory)) {
      invalidQuoteCategories.push(`${index}:${rawCategory}`);
      errors.push(`quote_items[${index}] category should be software|hardware|service|material|other`);
    }
    if (hasTaxRate && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1)) {
      invalidQuoteTaxRates.push(`${index}:${item.taxRate}`);
      errors.push(`quote_items[${index}] taxRate should be a rate between 0 and 1`);
    }
    if (hasTaxRate && Number.isFinite(taxRate) && rawCategory && SUPPORTED_QUOTE_CATEGORIES.has(rawCategory)) {
      const expectedTaxRate = expectedRateForCategory(rawCategory);
      if (expectedTaxRate && normalizeRate(taxRate) !== normalizeRate(expectedTaxRate.value)) {
        mismatchedQuoteTaxRates.push(`${index}:${rawCategory}:${taxRate}->${expectedTaxRate.field}:${expectedTaxRate.value}`);
        errors.push(`quote_items[${index}] taxRate should match projectData.taxPolicy.${expectedTaxRate.field} for ${rawCategory}: expected ${expectedTaxRate.value}, got ${taxRate}`);
      }
    }
  });

  const projectTotal = roundMoney(rawProjectTotal);
  const itemTotal = roundMoney(sum);
  if (itemTotal !== projectTotal) {
    errors.push(`quote_items total should equal project totalWithTax: expected ${projectTotal}, got ${itemTotal}`);
  }

  if (typeof profile.quoteTotalWithTax === 'number' && projectTotal !== roundMoney(profile.quoteTotalWithTax)) {
    errors.push(`template profile requires totalWithTax ${profile.quoteTotalWithTax}, got ${projectTotal}`);
  }

  if (Array.isArray(profile.requiredModels) && profile.requiredModels.length) {
    const models = new Set(rows.map((item) => String(item.brandModel || '').trim()));
    for (const model of profile.requiredModels) {
      if (!models.has(model)) errors.push(`missing required quote model: ${model}`);
    }
  }

  const projectTotalWithoutTax = roundMoney(rawProjectTotalWithoutTax);
  const details = {
    projectTotal,
    projectTotalWithoutTax,
    itemTotal,
    rowCount: rows.length,
    invalidTaxPolicyFields,
    invalidQuoteCategories,
    invalidQuoteTaxRates,
    mismatchedQuoteTaxRates,
  };
  return errors.length ? failed(errors, details) : passed(details);
}

function validatePaymentTerms(projectData = {}, template = {}) {
  const terms = Array.isArray(projectData.paymentTerms) ? projectData.paymentTerms : [];
  const text = terms.map((term) => `${term.stage || ''} ${term.text || ''}`).join('\n');
  const ratioTotal = roundMoney(terms.reduce((sum, term) => sum + Number(term.ratio || 0), 0));
  const errors = [];
  const profile = template.validationProfile || {};

  if (!terms.length) {
    errors.push('payment terms should contain at least one row');
  }
  terms.forEach((term, index) => {
    const ratio = Number(term.ratio);
    if (!String(term.stage || '').trim()) {
      errors.push(`payment_terms[${index}] missing stage`);
    }
    if (!String(term.text || '').trim()) {
      errors.push(`payment_terms[${index}] missing text`);
    }
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 100) {
      errors.push(`payment_terms[${index}] ratio should be greater than 0 and less than or equal to 100`);
    }
  });
  if (ratioTotal !== 100) {
    errors.push(`payment term ratios should equal 100, got ${ratioTotal}`);
  }
  if (profile.paymentRequiredText && !text.includes(profile.paymentRequiredText)) {
    errors.push(`missing required payment text: ${profile.paymentRequiredText}`);
  }
  if (profile.paymentForbiddenText && text.includes(profile.paymentForbiddenText)) {
    errors.push(`forbidden payment text found: ${profile.paymentForbiddenText}`);
  }

  return errors.length ? failed(errors, { ratioTotal, termCount: terms.length }) : passed({ ratioTotal, termCount: terms.length });
}

function validateProjectIdentity(input = {}) {
  const { template = {}, projectData = {}, assetMap = {} } = input;
  const errors = [];
  ['projectName', 'purchaserName', 'supplierName'].forEach((field) => {
    if (!String(projectData[field] || '').trim()) errors.push(`missing project identity field: ${field}`);
  });

  const templateId = String(template.id || '').trim();
  const projectTemplateId = String(projectData.templateId || '').trim();
  if (templateId && !projectTemplateId) {
    errors.push('missing project identity field: templateId');
  } else if (templateId && projectTemplateId !== templateId) {
    errors.push(`projectData.templateId should match template.id: expected ${templateId}, got ${projectTemplateId}`);
  }

  const mismatchedAssetTemplateIds = [];
  Object.values(assetMap || {}).forEach((asset) => {
    const assetKey = String(asset?.key || '').trim();
    const assetTemplateId = String(asset?.templateId || '').trim();
    if (templateId && assetTemplateId && assetTemplateId !== templateId) {
      mismatchedAssetTemplateIds.push(assetKey || assetTemplateId);
      errors.push(`assetMap.${assetKey || 'unknown'}.templateId should match template.id: expected ${templateId}, got ${assetTemplateId}`);
    }
  });

  return errors.length ? failed(errors, { mismatchedAssetTemplateIds }) : passed({
    templateId,
    projectTemplateId,
    projectName: projectData.projectName,
    purchaserName: projectData.purchaserName,
    supplierName: projectData.supplierName,
    checkedAssetCount: Object.keys(assetMap || {}).length,
  });
}

function validateDocumentTitle(template = {}) {
  const title = String(template.documentTitle || '').trim();
  const requiredText = String(template.validationProfile?.requiredDocumentTitleText || '响应文件').trim();
  const errors = [];
  if (!title) {
    errors.push('missing document title');
  }
  if (requiredText && !title.includes(requiredText)) {
    errors.push(`document title should include: ${requiredText}`);
  }
  return errors.length ? failed(errors, { documentTitle: title, requiredText }) : passed({ documentTitle: title, requiredText });
}

function validateTemplateDefinition(template = {}) {
  const errors = [];
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const validationProfile = template.validationProfile || {};
  const requiredSectionIds = Array.isArray(validationProfile.requiredSectionIds) ? validationProfile.requiredSectionIds : null;
  const requiredAssetKeys = Array.isArray(template.requiredAssetKeys) ? template.requiredAssetKeys : null;
  const assetDefinitions = Array.isArray(template.assetDefinitions) ? template.assetDefinitions : null;
  const seenSectionIds = new Set();
  const seenSectionTitles = new Set();
  const duplicateSectionIds = [];
  const duplicateSectionTitles = [];
  const missingNestedParentIds = [];
  const missingParentIds = [];
  const missingRequiredSectionIds = [];
  const invalidRequiredSectionIds = [];
  const duplicateRequiredSectionIds = [];
  const invalidSections = [];
  const invalidParentLevels = [];
  const invalidParentLevelSkips = [];
  const invalidParentOrder = [];
  const parentCycles = [];
  const requiredSectionsUnderOptionalAncestors = [];
  const profileRequiredSectionsNotMarkedRequired = [];
  const invalidValidationProfileFields = [];
  const invalidRequiredModels = [];
  const duplicateRequiredModels = [];
  const invalidAssetDefinitions = [];
  const duplicateAssetDefinitionKeys = [];
  const missingRequiredAssetDefinitions = [];
  const inconsistentRequiredAssetDefinitions = [];
  const invalidAssetDefinitionSections = [];
  const invalidAssetDefinitionTypes = [];

  if (!String(template.id || '').trim()) errors.push('template missing id');
  if (!String(template.name || '').trim()) errors.push('template missing name');
  if (!String(template.documentTitle || '').trim()) errors.push('template missing documentTitle');
  if (!String(template.industry || '').trim()) errors.push('template missing industry');
  if (!sections.length) errors.push('template sections should contain at least one section');
  if (!requiredAssetKeys) errors.push('template requiredAssetKeys should be an array');
  if (!validationProfile || typeof validationProfile !== 'object' || Array.isArray(validationProfile)) {
    errors.push('template validationProfile should be an object');
  }
  if (!requiredSectionIds) {
    errors.push('template validationProfile.requiredSectionIds should be an array');
  } else if (!requiredSectionIds.length) {
    errors.push('template validationProfile.requiredSectionIds should not be empty');
  }
  if (validationProfile && typeof validationProfile === 'object' && !Array.isArray(validationProfile)) {
    if (Object.prototype.hasOwnProperty.call(validationProfile, 'quoteTotalWithTax')) {
      const quoteTotalWithTax = Number(validationProfile.quoteTotalWithTax);
      if (!Number.isFinite(quoteTotalWithTax) || quoteTotalWithTax <= 0) {
        invalidValidationProfileFields.push('quoteTotalWithTax');
        errors.push('template validationProfile.quoteTotalWithTax should be greater than 0 when provided');
      }
    }
    ['paymentRequiredText', 'paymentForbiddenText', 'requiredDocumentTitleText'].forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(validationProfile, field)) return;
      if (!String(validationProfile[field] || '').trim()) {
        invalidValidationProfileFields.push(field);
        errors.push(`template validationProfile.${field} should not be empty when provided`);
      }
    });
    if (Object.prototype.hasOwnProperty.call(validationProfile, 'requiredModels')) {
      if (!Array.isArray(validationProfile.requiredModels)) {
        invalidValidationProfileFields.push('requiredModels');
        errors.push('template validationProfile.requiredModels should be an array when provided');
      } else {
        const seenModels = new Set();
        validationProfile.requiredModels.forEach((model, index) => {
          const normalizedModel = String(model || '').trim();
          if (!normalizedModel) {
            invalidRequiredModels.push(index);
            errors.push(`template validationProfile.requiredModels[${index}] is empty`);
            return;
          }
          if (seenModels.has(normalizedModel)) {
            duplicateRequiredModels.push(normalizedModel);
            errors.push(`template required quote model duplicated: ${normalizedModel}`);
          }
          seenModels.add(normalizedModel);
        });
      }
    }
  }

  sections.forEach((section, index) => {
    const sectionId = String(section?.id || '').trim();
    const title = String(section?.title || '').trim();
    const level = Number(section?.level);
    if (!sectionId) {
      invalidSections.push(index);
      errors.push(`template sections[${index}] missing id`);
      return;
    }
    if (seenSectionIds.has(sectionId)) {
      duplicateSectionIds.push(sectionId);
      errors.push(`template section id duplicated: ${sectionId}`);
    }
    seenSectionIds.add(sectionId);
    if (!title) {
      invalidSections.push(sectionId);
      errors.push(`template section missing title: ${sectionId}`);
    } else if (seenSectionTitles.has(title)) {
      duplicateSectionTitles.push(title);
      errors.push(`template section title duplicated: ${title}`);
    }
    if (title) seenSectionTitles.add(title);
    if (!Number.isInteger(level) || level < 0 || level > 3) {
      invalidSections.push(sectionId);
      errors.push(`template section level should be 0-3: ${sectionId}`);
    }
    if (typeof section.required !== 'boolean') {
      invalidSections.push(sectionId);
      errors.push(`template section required should be boolean: ${sectionId}`);
    }
    if (Number.isInteger(level) && level > 1 && !String(section?.parentId || '').trim()) {
      missingNestedParentIds.push(sectionId);
      errors.push(`template nested section should declare parentId: ${sectionId}`);
    }
  });

  const sectionById = new Map(sections
    .filter((section) => String(section?.id || '').trim())
    .map((section) => [String(section.id).trim(), section]));
  const sectionIndexById = new Map();
  sections.forEach((section, index) => {
    const sectionId = String(section?.id || '').trim();
    if (sectionId && !sectionIndexById.has(sectionId)) sectionIndexById.set(sectionId, index);
  });
  const parentById = new Map();

  sections.forEach((section) => {
    const sectionId = String(section?.id || '').trim();
    const parentId = String(section?.parentId || '').trim();
    if (sectionId) parentById.set(sectionId, parentId);
    if (sectionId && parentId && !seenSectionIds.has(parentId)) {
      missingParentIds.push(`${sectionId}:${parentId}`);
      errors.push(`template section parent does not exist: ${sectionId} -> ${parentId}`);
    }
    if (sectionId && parentId && seenSectionIds.has(parentId)) {
      const parentLevel = Number(sectionById.get(parentId)?.level);
      const childLevel = Number(section?.level);
      if (Number.isInteger(parentLevel) && Number.isInteger(childLevel) && childLevel <= parentLevel) {
        invalidParentLevels.push(`${sectionId}:${childLevel}->${parentId}:${parentLevel}`);
        errors.push(`template section parent level should be lower than child: ${sectionId} -> ${parentId}`);
      }
      if (Number.isInteger(parentLevel) && Number.isInteger(childLevel) && childLevel > parentLevel + 1) {
        invalidParentLevelSkips.push(`${sectionId}:${childLevel}->${parentId}:${parentLevel}`);
        errors.push(`template section parent level should be direct parent: ${sectionId} -> ${parentId}`);
      }
      const parentIndex = sectionIndexById.get(parentId);
      const childIndex = sectionIndexById.get(sectionId);
      if (Number.isInteger(parentIndex) && Number.isInteger(childIndex) && parentIndex > childIndex) {
        invalidParentOrder.push(`${sectionId}:${childIndex}->${parentId}:${parentIndex}`);
        errors.push(`template section parent should appear before child: ${parentId} -> ${sectionId}`);
      }
    }
  });

  const reportedCycleStarts = new Set();
  sections.forEach((section) => {
    const startId = String(section?.id || '').trim();
    if (!startId || reportedCycleStarts.has(startId)) return;
    const chain = [];
    const seenInChain = new Set();
    let currentId = startId;
    while (currentId) {
      if (seenInChain.has(currentId)) {
        const cycleStartIndex = chain.indexOf(currentId);
        const cycle = chain.slice(cycleStartIndex).concat(currentId);
        const cycleText = cycle.join(' -> ');
        cycle.forEach((id) => reportedCycleStarts.add(id));
        parentCycles.push(cycleText);
        errors.push(`template section parent cycle detected: ${cycleText}`);
        break;
      }
      seenInChain.add(currentId);
      chain.push(currentId);
      const parentId = parentById.get(currentId);
      if (!parentId || !seenSectionIds.has(parentId)) break;
      currentId = parentId;
    }
  });

  const seenRequiredSectionIds = new Set();
  (requiredSectionIds || []).forEach((sectionId, index) => {
    const normalizedSectionId = String(sectionId || '').trim();
    if (!normalizedSectionId) {
      invalidRequiredSectionIds.push(index);
      errors.push(`template validationProfile.requiredSectionIds[${index}] is empty`);
      return;
    }
    if (seenRequiredSectionIds.has(normalizedSectionId)) {
      duplicateRequiredSectionIds.push(normalizedSectionId);
      errors.push(`template required section id duplicated: ${normalizedSectionId}`);
    }
    seenRequiredSectionIds.add(normalizedSectionId);
    if (!seenSectionIds.has(normalizedSectionId)) {
      missingRequiredSectionIds.push(normalizedSectionId);
      errors.push(`template required section does not exist: ${normalizedSectionId}`);
      return;
    }
    const section = sectionById.get(normalizedSectionId);
    if (section?.required !== true) {
      profileRequiredSectionsNotMarkedRequired.push(normalizedSectionId);
      errors.push(`template required section should be marked required: ${normalizedSectionId}`);
    }
  });

  const profileRequiredSectionIds = new Set((requiredSectionIds || []).map((sectionId) => String(sectionId || '').trim()).filter(Boolean));
  sections.forEach((section) => {
    const sectionId = String(section?.id || '').trim();
    if (!sectionId) return;
    const isRequiredSection = Boolean(section?.required) || profileRequiredSectionIds.has(sectionId);
    if (!isRequiredSection) return;
    let parentId = String(section?.parentId || '').trim();
    const chain = new Set([sectionId]);
    while (parentId && seenSectionIds.has(parentId) && !chain.has(parentId)) {
      chain.add(parentId);
      const parent = sectionById.get(parentId);
      if (parent && parent.required === false) {
        requiredSectionsUnderOptionalAncestors.push(`${sectionId}->${parentId}`);
        errors.push(`template required section cannot be under optional ancestor: ${sectionId} -> ${parentId}`);
        break;
      }
      parentId = String(parent?.parentId || '').trim();
    }
  });

  const duplicateRequiredAssetKeys = [];
  const assetDefinitionKeys = new Set();
  if (assetDefinitions) {
    const seenAssetDefinitionKeys = new Set();
    assetDefinitions.forEach((definition, index) => {
      const assetKey = String(definition?.key || '').trim();
      const title = String(definition?.title || '').trim();
      const sectionId = String(definition?.sectionId || '').trim();
      const type = String(definition?.type || '').trim();
      if (!assetKey) {
        invalidAssetDefinitions.push(index);
        errors.push(`template assetDefinitions[${index}] missing key`);
      } else if (seenAssetDefinitionKeys.has(assetKey)) {
        duplicateAssetDefinitionKeys.push(assetKey);
        errors.push(`template asset definition key duplicated: ${assetKey}`);
      }
      if (assetKey) {
        seenAssetDefinitionKeys.add(assetKey);
        assetDefinitionKeys.add(assetKey);
      }
      if (!title) {
        invalidAssetDefinitions.push(assetKey || index);
        errors.push(`template asset definition missing title: ${assetKey || index}`);
      }
      if (!sectionId) {
        invalidAssetDefinitionSections.push(`${assetKey || index}:missing`);
        errors.push(`template asset definition missing sectionId: ${assetKey || index}`);
      } else if (!seenSectionIds.has(sectionId)) {
        invalidAssetDefinitionSections.push(`${assetKey || index}:${sectionId}`);
        errors.push(`template asset definition section does not exist: ${assetKey || index} -> ${sectionId}`);
      }
      if (type && !SUPPORTED_ASSET_TYPES.has(type)) {
        invalidAssetDefinitionTypes.push(`${assetKey || index}:${type}`);
        errors.push(`template asset definition type should be image|scan|document: ${assetKey || index}`);
      }
      if (Object.prototype.hasOwnProperty.call(definition || {}, 'required') && typeof definition.required !== 'boolean') {
        invalidAssetDefinitions.push(assetKey || index);
        errors.push(`template asset definition required should be boolean: ${assetKey || index}`);
      }
      if (assetKey && requiredAssetKeys && requiredAssetKeys.includes(assetKey) && definition.required === false) {
        inconsistentRequiredAssetDefinitions.push(assetKey);
        errors.push(`template required asset definition cannot be optional: ${assetKey}`);
      }
    });
  }
  if (requiredAssetKeys) {
    const seenAssetKeys = new Set();
    requiredAssetKeys.forEach((key, index) => {
      const assetKey = String(key || '').trim();
      if (!assetKey) {
        errors.push(`template requiredAssetKeys[${index}] is empty`);
        return;
      }
      if (seenAssetKeys.has(assetKey)) {
        duplicateRequiredAssetKeys.push(assetKey);
        errors.push(`template required asset key duplicated: ${assetKey}`);
      }
      seenAssetKeys.add(assetKey);
      if (assetDefinitions && !assetDefinitionKeys.has(assetKey)) {
        missingRequiredAssetDefinitions.push(assetKey);
        errors.push(`template required asset key has no asset definition: ${assetKey}`);
      }
    });
  }

  const details = {
    sectionCount: sections.length,
    requiredSectionCount: requiredSectionIds ? requiredSectionIds.length : 0,
    requiredAssetCount: requiredAssetKeys ? requiredAssetKeys.length : 0,
    duplicateSectionIds,
    duplicateSectionTitles,
    missingNestedParentIds,
    missingParentIds,
    missingRequiredSectionIds,
    invalidRequiredSectionIds,
    duplicateRequiredSectionIds,
    invalidParentLevels,
    invalidParentLevelSkips,
    invalidParentOrder,
    parentCycles,
    requiredSectionsUnderOptionalAncestors,
    profileRequiredSectionsNotMarkedRequired,
    invalidValidationProfileFields,
    invalidRequiredModels,
    duplicateRequiredModels,
    duplicateRequiredAssetKeys,
    assetDefinitionCount: assetDefinitions ? assetDefinitions.length : 0,
    invalidAssetDefinitions,
    duplicateAssetDefinitionKeys,
    missingRequiredAssetDefinitions,
    inconsistentRequiredAssetDefinitions,
    invalidAssetDefinitionSections,
    invalidAssetDefinitionTypes,
    invalidSections,
  };
  return errors.length ? failed(errors, details) : passed(details);
}

function validateAssets(assetMap = {}, template = {}, projectData = {}) {
  const errors = [];
  const missingAssets = [];
  const missingAssetFiles = [];
  const unsupportedAssets = [];
  const invalidSignatureAssets = [];
  const documentAssets = [];
  const invalidAssetRecords = [];
  const missingAssetTitles = [];
  const invalidAssetTypes = [];
  const invalidAssetSections = [];
  const mismatchedAssetKeys = [];
  const invalidAssetRequiredValues = [];
  const missingRequiredAssetMappings = [];
  const requiredDocumentAssets = [];
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const knownSectionIds = new Set(sections.map((section) => String(section?.id || '').trim()).filter(Boolean));
  const requiredKeys = new Set();
  Object.entries(assetMap || {}).forEach(([mapKey, asset]) => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      invalidAssetRecords.push(mapKey);
      errors.push(`invalid_asset_record:${mapKey}`);
      return;
    }
    const assetKey = String(asset.key || '').trim();
    const title = String(asset.title || '').trim();
    const type = String(asset.type || '').trim();
    const sectionId = String(asset.sectionId || '').trim();
    if (!assetKey) {
      mismatchedAssetKeys.push(`${mapKey}:missing`);
      errors.push(`assetMap.${mapKey}.key should equal map key`);
    } else if (assetKey !== mapKey) {
      mismatchedAssetKeys.push(`${mapKey}:${assetKey}`);
      errors.push(`assetMap.${mapKey}.key should equal map key`);
    }
    if (!title) {
      missingAssetTitles.push(mapKey);
      errors.push(`assetMap.${mapKey}.title is required`);
    }
    if (!SUPPORTED_ASSET_TYPES.has(type)) {
      invalidAssetTypes.push(`${mapKey}:${type || 'missing'}`);
      errors.push(`assetMap.${mapKey}.type should be image|scan|document`);
    }
    if (!Object.prototype.hasOwnProperty.call(asset, 'required') || typeof asset.required !== 'boolean') {
      invalidAssetRequiredValues.push(mapKey);
      errors.push(`assetMap.${mapKey}.required should be boolean`);
    }
    if (!sectionId) {
      invalidAssetSections.push(`${mapKey}:missing`);
      errors.push(`assetMap.${mapKey}.sectionId is required`);
    } else if (knownSectionIds.size > 0 && !knownSectionIds.has(sectionId)) {
      invalidAssetSections.push(`${mapKey}:${sectionId}`);
      errors.push(`assetMap.${mapKey}.sectionId does not exist in template: ${sectionId}`);
    }
    if (asset.required === true && assetNeedsDocxPresence(asset, template, projectData)) requiredKeys.add(mapKey);
  });
  (template.requiredAssetKeys || []).forEach((key) => {
    const asset = assetMap?.[key];
    if (!asset) {
      missingRequiredAssetMappings.push(key);
      errors.push(`missing_required_asset_mapping:${key}`);
    }
    if (!asset || assetNeedsDocxPresence(asset, template, projectData)) requiredKeys.add(key);
  });

  const checkedKeys = new Set(requiredKeys);
  Object.entries(assetMap || {}).forEach(([mapKey, asset]) => {
    if (String(asset?.filePath || '').trim() && assetNeedsDocxPresence(asset, template, projectData)) {
      checkedKeys.add(mapKey);
    }
  });

  checkedKeys.forEach((key) => {
    const asset = assetMap[key];
    const filePath = String(asset?.filePath || '').trim();
    const required = requiredKeys.has(key);
    if (!asset || !filePath) {
      if (required) {
        missingAssets.push(key);
        errors.push(`missing_assets:${key}`);
      }
      return;
    }
    if (!fs.existsSync(filePath)) {
      if (required) {
        missingAssets.push(key);
        errors.push(`missing_assets:${key}`);
      } else {
        missingAssetFiles.push(key);
        errors.push(`missing_asset_file:${key}`);
      }
      return;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      if (required) {
        missingAssets.push(key);
        errors.push(`missing_assets:${key}`);
      } else {
        missingAssetFiles.push(key);
        errors.push(`missing_asset_file:${key}`);
      }
      return;
    }
    if (stat.size <= 0) {
      missingAssetFiles.push(key);
      errors.push(`empty_asset_file:${key}`);
      return;
    }
    if (!assetShouldEmbedAsImage(asset)) {
      if (required) {
        requiredDocumentAssets.push(key);
        errors.push(`required_asset_must_be_image_or_scan:${key}`);
        return;
      }
      documentAssets.push(key);
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      unsupportedAssets.push(key);
      errors.push(`unsupported_asset_type:${key}:${extension || 'unknown'}`);
      return;
    }
    if (!validateImageFileSignature(filePath, extension)) {
      invalidSignatureAssets.push(key);
      errors.push(`invalid_asset_file_signature:${key}:${extension}`);
    }
  });

  return errors.length ? failed(errors, {
    missing_assets: missingAssets,
    missing_asset_files: missingAssetFiles,
    unsupported_assets: unsupportedAssets,
    invalid_asset_file_signatures: invalidSignatureAssets,
    invalid_asset_records: invalidAssetRecords,
    missing_asset_titles: missingAssetTitles,
    invalid_asset_types: invalidAssetTypes,
    invalid_asset_sections: invalidAssetSections,
    mismatched_asset_keys: mismatchedAssetKeys,
    invalid_asset_required_values: invalidAssetRequiredValues,
    missing_required_asset_mappings: missingRequiredAssetMappings,
    required_document_assets: requiredDocumentAssets,
    document_assets: documentAssets,
    checked: checkedKeys.size,
  }) : passed({ checked: checkedKeys.size, document_assets: documentAssets });
}

function validateForbiddenWords(text = '') {
  const source = String(text || '');
  const hits = FORBIDDEN_WORDS.filter((word) => source.includes(word));
  return hits.length ? failed(hits.map((word) => `forbidden word found: ${word}`), { hits }) : passed({ hits: [] });
}

function getDisabledSectionIds(projectData = {}) {
  return new Set((Array.isArray(projectData.disabledSectionIds) ? projectData.disabledSectionIds : []).map((sectionId) => String(sectionId || '').trim()).filter(Boolean));
}

function getEnabledTemplateSections(template = {}, projectData = {}) {
  const disabledSectionIds = getDisabledSectionIds(projectData);
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const profileRequiredSectionIds = new Set((template.validationProfile?.requiredSectionIds || []).map((sectionId) => String(sectionId || '').trim()).filter(Boolean));
  const enabledCache = new Map();
  const isEnabled = (section, visiting = new Set()) => {
    if (!section?.id) return false;
    if (enabledCache.has(section.id)) return enabledCache.get(section.id);
    if (visiting.has(section.id)) {
      enabledCache.set(section.id, false);
      return false;
    }
    const nextVisiting = new Set(visiting);
    nextVisiting.add(section.id);
    const parent = section.parentId ? sectionById.get(section.parentId) : null;
    const parentEnabled = parent ? isEnabled(parent, nextVisiting) : true;
    const enabled = parentEnabled && (section.required || profileRequiredSectionIds.has(section.id) || !disabledSectionIds.has(section.id));
    enabledCache.set(section.id, enabled);
    return enabled;
  };
  return sections.filter((section) => isEnabled(section));
}

function validateSectionSelection(template = {}, projectData = {}) {
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const childrenByParentId = new Map();
  sections.forEach((section) => {
    const parentId = String(section?.parentId || '').trim();
    if (!parentId) return;
    if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
    childrenByParentId.get(parentId).push(section);
  });
  const profileRequiredSectionIds = new Set((template.validationProfile?.requiredSectionIds || []).map((sectionId) => String(sectionId || '').trim()).filter(Boolean));
  const disabledSectionIds = getDisabledSectionIds(projectData);
  const errors = [];
  const unknown = [];
  const required = [];
  const requiredDescendants = [];
  const findRequiredDescendants = (sectionId, visiting = new Set()) => {
    if (!sectionId || visiting.has(sectionId)) return [];
    const nextVisiting = new Set(visiting);
    nextVisiting.add(sectionId);
    const children = childrenByParentId.get(sectionId) || [];
    return children.flatMap((child) => {
      const childId = String(child?.id || '').trim();
      const descendants = findRequiredDescendants(childId, nextVisiting);
      if (child?.required || profileRequiredSectionIds.has(childId)) {
        return [childId, ...descendants];
      }
      return descendants;
    });
  };

  for (const sectionId of disabledSectionIds) {
    const section = sectionById.get(sectionId);
    if (!section) {
      unknown.push(sectionId);
      errors.push(`disabled section does not exist in template: ${sectionId}`);
      continue;
    }
    if (section.required || profileRequiredSectionIds.has(sectionId)) {
      required.push(sectionId);
      errors.push(`required section cannot be disabled: ${sectionId}`);
    }
    const descendantIds = findRequiredDescendants(sectionId);
    if (descendantIds.length) {
      requiredDescendants.push(`${sectionId}:${descendantIds.join(',')}`);
      errors.push(`section with required descendants cannot be disabled: ${sectionId} -> ${descendantIds.join(', ')}`);
    }
  }

  return errors.length ? failed(errors, { disabled: [...disabledSectionIds], unknown, required, requiredDescendants }) : passed({ disabled: [...disabledSectionIds] });
}

function validateRequiredSections(template = {}, projectData = {}) {
  const present = new Set(getEnabledTemplateSections(template, projectData).map((section) => section.id));
  const required = template.validationProfile?.requiredSectionIds || [];
  const missing = required.filter((sectionId) => !present.has(sectionId));
  return missing.length ? failed(missing.map((sectionId) => `missing required section: ${sectionId}`), { missing }) : passed({ checked: required.length });
}

function assetNeedsDocxPresence(asset, template = {}, projectData = {}) {
  const requiredAssetKeys = new Set([...(template.requiredAssetKeys || [])]);
  const hasFilePath = Boolean(String(asset?.filePath || '').trim());
  const required = asset?.required === true || requiredAssetKeys.has(asset?.key);
  if (!hasFilePath && !required) return false;

  const sectionId = String(asset?.sectionId || '').trim();
  if (!sectionId) return true;
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const knownSectionIds = new Set(sections.map((section) => section.id));
  if (!knownSectionIds.has(sectionId)) return true;

  const enabledSectionIds = new Set(getEnabledTemplateSections(template, projectData).map((section) => section.id));
  return enabledSectionIds.has(sectionId);
}

function validateDocxOpenable(outputPath) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const zip = new AdmZip(outputPath);
    const entries = new Set(zip.getEntries().map((entry) => entry.entryName));
    const required = ['[Content_Types].xml', 'word/document.xml', 'word/_rels/document.xml.rels'];
    const missing = required.filter((entryName) => !entries.has(entryName));
    return missing.length ? failed(missing.map((entryName) => `docx missing entry: ${entryName}`), { entries: entries.size }) : passed({ entries: entries.size });
  } catch (error) {
    return failed(`docx cannot be opened: ${error.message || String(error)}`);
  }
}

function decodeXmlEntities(text = '') {
  return String(text || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#([0-9]+);/g, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readDocxMainDocumentText(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  return decodeXmlEntities(documentXml.replace(/<[^>]+>/g, ''));
}

function textFromParagraphXml(paragraphXml = '') {
  return decodeXmlEntities(
    [...String(paragraphXml).matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join(''),
  );
}

function readDocxHeadingTexts(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  return paragraphs
    .filter((paragraphXml) => /<w:pStyle\b[^>]*\bw:val="Heading[1-3]"/.test(paragraphXml))
    .map((paragraphXml) => textFromParagraphXml(paragraphXml))
    .filter((text) => String(text || '').trim());
}

function readDocxParagraphSummaries(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  return paragraphs.map((paragraphXml, index) => ({
    index,
    text: textFromParagraphXml(paragraphXml),
    headingStyle: (paragraphXml.match(/<w:pStyle\b[^>]*\bw:val="([^"]+)"/) || [])[1] || '',
    hasPageBreak: /<w:br\b[^>]*\bw:type="page"/.test(paragraphXml),
  }));
}

function readDocxTableTexts(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  const tables = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  return tables.map((tableXml) => decodeXmlEntities(
    [...tableXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join('\t'),
  ));
}

function readDocxTableXmls(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  return documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
}

function tableRowsFromXml(tableXml = '') {
  const rowXmls = String(tableXml).match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return rowXmls.map((rowXml) => {
    const cellXmls = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    return cellXmls.map((cellXml) => decodeXmlEntities(
      [...cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => match[1])
        .join(''),
    ));
  });
}

function readDocxBodyBlocks(outputPath) {
  const zip = new AdmZip(outputPath);
  const documentXml = zip.readAsText('word/document.xml');
  return [...documentXml.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)].map((match, index) => {
    const xml = match[0];
    const type = match[1] === 'tbl' ? 'table' : 'paragraph';
    return {
      index,
      type,
      text: type === 'table' ? decodeXmlEntities([...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((textMatch) => textMatch[1]).join('\t')) : textFromParagraphXml(xml),
      rows: type === 'table' ? tableRowsFromXml(xml) : [],
      headingStyle: type === 'paragraph' ? (xml.match(/<w:pStyle\b[^>]*\bw:val="([^"]+)"/) || [])[1] || '' : '',
      hasPageBreak: /<w:br\b[^>]*\bw:type="page"/.test(xml),
      hasImageReference: /<a:blip\b/.test(xml),
    };
  });
}

function formatMoneyForDocx(value) {
  return `${Number(value || 0).toFixed(2)} 元`;
}

function validateDocxForbiddenWords(outputPath) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    return validateForbiddenWords(readDocxMainDocumentText(outputPath));
  } catch (error) {
    return failed(`docx text cannot be checked for forbidden words: ${error.message || String(error)}`);
  }
}

function validateDocxContent(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const quoteItems = Array.isArray(input.quoteItems) ? input.quoteItems : [];
    const assetMap = input.assetMap || {};
    const profile = template.validationProfile || {};
    const documentText = readDocxMainDocumentText(outputPath);
    const errors = [];
    const missingTexts = [];

    const requiredTextChecks = [
      ['documentTitle', template.documentTitle],
      ['projectName', projectData.projectName],
      ['purchaserName', projectData.purchaserName],
      ['supplierName', projectData.supplierName],
      ['totalWithTax', formatMoneyForDocx(projectData.totalWithTax)],
      ['paymentRequiredText', profile.paymentRequiredText],
      ...quoteItems.map((item, index) => [`quoteItems[${index}].brandModel`, item.brandModel]),
      ...(Array.isArray(profile.requiredModels) ? profile.requiredModels.map((model) => [`requiredModel:${model}`, model]) : []),
    ].filter(([, value]) => String(value || '').trim());

    const assetTitleChecks = Object.values(assetMap)
      .filter((asset) => assetNeedsDocxPresence(asset, template, projectData))
      .map((asset) => [`assetTitle:${asset.key}`, asset.title])
      .filter(([, value]) => String(value || '').trim());

    for (const [label, value] of requiredTextChecks) {
      if (!documentText.includes(String(value))) {
        missingTexts.push(label);
        errors.push(`docx missing required text: ${label}`);
      }
    }

    const missingAssetTitles = [];
    for (const [label, value] of assetTitleChecks) {
      if (!documentText.includes(String(value))) {
        missingAssetTitles.push(label);
        errors.push(`docx missing required asset title: ${label}`);
      }
    }

    const enabledSections = getEnabledTemplateSections(template, projectData);
    const enabledSectionIds = new Set(enabledSections.map((section) => section.id));
    const sectionById = new Map(enabledSections.map((section) => [section.id, section]));
    const requiredSectionIds = Array.isArray(profile.requiredSectionIds) ? profile.requiredSectionIds : [];
    const missingSections = [];
    for (const sectionId of requiredSectionIds) {
      const title = sectionById.get(sectionId)?.title;
      if (title && !documentText.includes(title)) {
        missingSections.push(sectionId);
        errors.push(`docx missing required section title: ${sectionId}`);
      }
    }

    const disabledSections = (Array.isArray(template.sections) ? template.sections : [])
      .filter((section) => section?.id && !enabledSectionIds.has(section.id))
      .filter((section) => String(section.title || '').trim());
    const disabledSectionTitles = [];
    for (const section of disabledSections) {
      if (documentText.includes(String(section.title))) {
        disabledSectionTitles.push(section.id);
        errors.push(`docx contains disabled section title: ${section.id}`);
      }
    }

    const knownSectionIds = new Set((Array.isArray(template.sections) ? template.sections : []).map((section) => section.id).filter(Boolean));
    const disabledAssetTitles = [];
    Object.values(assetMap || {}).forEach((asset) => {
      const title = String(asset?.title || '').trim();
      const sectionId = String(asset?.sectionId || '').trim();
      if (!title || !sectionId || !knownSectionIds.has(sectionId) || enabledSectionIds.has(sectionId)) return;
      if (documentText.includes(title)) {
        disabledAssetTitles.push(asset?.key || title);
        errors.push(`docx contains disabled section asset title: assetTitle:${asset?.key || title}`);
      }
    });

    return errors.length
      ? failed(errors, { missingTexts, missingAssetTitles, missingSections, disabledSectionTitles, disabledAssetTitles, checkedTextCount: requiredTextChecks.length, checkedAssetTitleCount: assetTitleChecks.length, checkedSectionCount: requiredSectionIds.length, checkedDisabledSectionCount: disabledSections.length })
      : passed({ checkedTextCount: requiredTextChecks.length, checkedAssetTitleCount: assetTitleChecks.length, checkedSectionCount: requiredSectionIds.length, checkedDisabledSectionCount: disabledSections.length });
  } catch (error) {
    return failed(`docx content cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxSectionOrder(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const headingTexts = readDocxHeadingTexts(outputPath);
    const sections = getEnabledTemplateSections(template, projectData)
      .filter((section) => section.id !== 'cover')
      .filter((section) => String(section.title || '').trim());
    const allowedHeadingTexts = new Set(sections.map((section) => String(section.title)));
    const errors = [];
    const missingSections = [];
    const outOfOrderSections = [];
    const unexpectedHeadings = [];
    const positions = [];
    let searchFromIndex = 0;
    let previousSectionId = '';

    headingTexts.forEach((headingText, index) => {
      if (!allowedHeadingTexts.has(headingText)) {
        unexpectedHeadings.push({ headingIndex: index, text: headingText });
        errors.push(`docx unexpected section heading: ${headingText}`);
      }
    });

    for (const section of sections) {
      const title = String(section.title);
      const headingIndex = headingTexts.findIndex((headingText, index) => index >= searchFromIndex && headingText === title);
      positions.push({ sectionId: section.id, title, headingIndex });
      if (headingIndex < 0) {
        const earlierHeadingIndex = headingTexts.findIndex((headingText) => headingText === title);
        if (earlierHeadingIndex >= 0) {
          outOfOrderSections.push(section.id);
          errors.push(`docx section order mismatch: ${section.id} appears before ${previousSectionId}`);
          continue;
        }
        missingSections.push(section.id);
        errors.push(`docx missing ordered section title: ${section.id}`);
        continue;
      }
      searchFromIndex = headingIndex + 1;
      previousSectionId = section.id;
    }

    const details = {
      checkedSectionCount: sections.length,
      orderedSectionIds: sections.map((section) => section.id),
      missingSections,
      outOfOrderSections,
      unexpectedHeadings,
      positions,
      headingTexts,
    };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx section order cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxTables(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const quoteItems = Array.isArray(input.quoteItems) ? input.quoteItems : [];
    const enabledSectionIds = new Set(getEnabledTemplateSections(template, projectData).map((section) => section.id));
    const tableTexts = readDocxTableTexts(outputPath);
    const errors = [];
    const checkedTables = [];
    const missingTables = [];

    const includesAll = (source, values) => values.every((value) => source.includes(String(value || '')));
    const checkTable = (id, requiredTexts) => {
      checkedTables.push(id);
      const found = tableTexts.some((tableText) => includesAll(tableText, requiredTexts));
      if (!found) {
        missingTables.push(id);
        errors.push(`docx missing expected table: ${id}`);
      }
    };

    if (enabledSectionIds.has('quote-summary')) {
      checkTable('quote-summary', ['项目', '响应内容', '报价含税总价', '不含税金额', '税率口径']);
    }
    if (enabledSectionIds.has('quote-summary') && Array.isArray(projectData.paymentTerms) && projectData.paymentTerms.length) {
      checkTable('payment-terms', [
        '付款节点',
        '付款比例',
        '付款说明',
        ...projectData.paymentTerms.map((term) => term.text),
      ]);
    }
    if (enabledSectionIds.has('quote-detail')) {
      checkTable('quote-detail', [
        '序号',
        '名称',
        '数量',
        '品牌及型号',
        '含税单价',
        '含税总价',
        ...quoteItems.map((item) => item.brandModel),
      ]);
    }
    if (enabledSectionIds.has('supplier-basic-info')) {
      checkTable('supplier-basic-info', ['项目', '内容', '供应商名称', '响应项目', '资质材料']);
    }
    if (enabledSectionIds.has('overall-architecture')) {
      checkTable('overall-architecture', ['层级', '建设内容', '投标响应说明']);
    }
    if (enabledSectionIds.has('core-business-flow')) {
      checkTable('core-business-flow', ['流程', '功能内容', '交付边界']);
    }
    if (enabledSectionIds.has('key-function-design')) {
      checkTable('key-function-design', ['功能模块', '功能内容', '投标响应说明', '管理价值/交付边界']);
    }
    if (enabledSectionIds.has('third-party-interface-boundary')) {
      checkTable('third-party-interface-boundary', ['接口类别', '前置条件', '交付边界']);
    }
    if (enabledSectionIds.has('function-parameter-response')) {
      checkTable('function-parameter-response', [
        '序号',
        '名称',
        '数量',
        '品牌及型号',
        '含税单价',
        '含税总价',
        ...quoteItems.map((item) => item.brandModel),
      ]);
    }
    if (enabledSectionIds.has('implementation-plan')) {
      checkTable('implementation-plan', ['阶段', '工作内容', '交付结果']);
    }

    const details = {
      tableCount: tableTexts.length,
      checkedTables,
      checkedTableCount: checkedTables.length,
      missingTables,
    };
    if (!tableTexts.length && checkedTables.length) {
      return failed('docx tables are missing', details);
    }
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx tables cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxQuoteIntegrity(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const quoteItems = Array.isArray(input.quoteItems) ? input.quoteItems : [];
    const paymentTerms = Array.isArray(projectData.paymentTerms) ? projectData.paymentTerms : [];
    const enabledSections = getEnabledTemplateSections(template, projectData);
    const enabledSectionIds = new Set(enabledSections.map((section) => section.id));
    const sectionById = new Map(enabledSections.map((section) => [section.id, section]));
    const bodyBlocks = readDocxBodyBlocks(outputPath);
    const errors = [];
    const missingQuoteSummaryFields = [];
    const missingQuoteRows = [];
    const missingPaymentRows = [];
    const includesAll = (source, values) => values.every((value) => source.includes(String(value ?? '')));
    const findTablesAfterHeading = (sectionId, untilSectionIds = []) => {
      const section = sectionById.get(sectionId);
      if (!section) return [];
      const startIndex = bodyBlocks.findIndex((block) => block.type === 'paragraph' && /^Heading[1-3]$/.test(block.headingStyle) && block.text === section.title);
      if (startIndex < 0) return [];
      const untilTitles = new Set(untilSectionIds.map((id) => sectionById.get(id)?.title).filter(Boolean));
      const tables = [];
      for (let index = startIndex + 1; index < bodyBlocks.length; index += 1) {
        const block = bodyBlocks[index];
        if (block.type === 'paragraph' && /^Heading[1-3]$/.test(block.headingStyle) && untilTitles.has(block.text)) break;
        if (block.type === 'table') tables.push(block);
      }
      return tables;
    };
    const rowIncludesAll = (rows, values) => rows.some((row) => values.every((value) => row.includes(String(value ?? ''))));

    const quoteSummaryTables = enabledSectionIds.has('quote-summary')
      ? findTablesAfterHeading('quote-summary', ['quote-detail'])
      : [];
    const quoteDetailTables = enabledSectionIds.has('quote-detail')
      ? findTablesAfterHeading('quote-detail', ['legal-representative-id', 'supplier-basic-info', 'technical-solution', 'implementation-plan', 'after-sales-plan', 'warranty-period', 'other-materials'])
      : [];
    const quoteSummaryTable = quoteSummaryTables.find((tableBlock) => includesAll(tableBlock.text, ['报价含税总价', '不含税金额', '税率口径'])) || null;
    const quoteDetailTable = quoteDetailTables.find((tableBlock) => rowIncludesAll(tableBlock.rows, ['序号', '名称', '数量', '品牌及型号', '含税单价', '含税总价'])) || null;
    const paymentTable = quoteSummaryTables.find((tableBlock) => rowIncludesAll(tableBlock.rows, ['付款节点', '付款比例', '付款说明'])) || null;

    if (enabledSectionIds.has('quote-summary')) {
      if (!quoteSummaryTable) {
        errors.push('docx quote summary table is missing');
      } else {
        [
          ['totalWithTax', formatMoneyForDocx(projectData.totalWithTax)],
          ['totalWithoutTax', formatMoneyForDocx(projectData.totalWithoutTax)],
        ].forEach(([field, expectedText]) => {
          if (!rowIncludesAll(quoteSummaryTable.rows, [expectedText])) {
            missingQuoteSummaryFields.push(field);
            errors.push(`docx quote summary missing field: ${field}`);
          }
        });
      }
    }

    if (enabledSectionIds.has('quote-detail')) {
      if (!quoteDetailTable) {
        errors.push('docx quote detail table is missing');
      } else {
        quoteItems.forEach((item, index) => {
          const requiredRowTexts = [
            String(index + 1),
            item.name,
            String(item.quantity),
            item.brandModel,
            formatMoneyForDocx(item.unitPriceWithTax),
            formatMoneyForDocx(item.totalWithTax),
          ];
          if (!rowIncludesAll(quoteDetailTable.rows, requiredRowTexts)) {
            missingQuoteRows.push({ index, name: item.name, brandModel: item.brandModel });
            errors.push(`docx quote item missing in quote detail table: ${index + 1}`);
          }
        });
      }
    }

    if (enabledSectionIds.has('quote-summary')) {
      if (!paymentTable) {
        errors.push('docx payment terms table is missing');
      } else {
        paymentTerms.forEach((term, index) => {
          const requiredPaymentTexts = [term.stage, `${term.ratio}%`, term.text];
          if (!rowIncludesAll(paymentTable.rows, requiredPaymentTexts)) {
            missingPaymentRows.push({ index, stage: term.stage, ratio: term.ratio });
            errors.push(`docx payment term missing in payment table: ${index + 1}`);
          }
        });
      }
    }

    const details = {
      quoteSummaryChecked: enabledSectionIds.has('quote-summary'),
      quoteDetailChecked: enabledSectionIds.has('quote-detail'),
      paymentTermsChecked: enabledSectionIds.has('quote-summary'),
      quoteSummaryTableCount: quoteSummaryTables.length,
      quoteDetailTableCount: quoteDetailTables.length,
      checkedQuoteRowCount: quoteItems.length,
      checkedPaymentTermCount: paymentTerms.length,
      missingQuoteSummaryFields,
      missingQuoteRows,
      missingPaymentRows,
    };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx quote integrity cannot be checked: ${error.message || String(error)}`);
  }
}

function expectedHeadingStyleForSection(section = {}) {
  const sectionLevel = Number(section.level);
  const level = sectionLevel === 0 ? 1 : Math.min(3, Math.max(1, sectionLevel));
  return `Heading${level}`;
}

function validateDocxStyles(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const sections = getEnabledTemplateSections(template, projectData)
      .filter((section) => section.id !== 'cover')
      .filter((section) => String(section.title || '').trim());
    const paragraphs = readDocxParagraphSummaries(outputPath);
    const tableXmls = readDocxTableXmls(outputPath);
    const errors = [];
    const missingHeadingStyles = [];
    const tableHeaderStyleFailures = [];

    const findHeadingParagraph = (title, expectedStyle) => {
      return paragraphs.find((paragraph) => paragraph.text === title && paragraph.headingStyle === expectedStyle);
    };

    for (const section of sections) {
      const expectedStyle = expectedHeadingStyleForSection(section);
      const headingParagraph = findHeadingParagraph(section.title, expectedStyle);
      if (!headingParagraph) {
        const actualParagraph = paragraphs.find((paragraph) => paragraph.text === section.title);
        missingHeadingStyles.push({
          sectionId: section.id,
          title: section.title,
          expectedStyle,
          actualStyle: actualParagraph?.headingStyle || '',
        });
        errors.push(`docx heading style mismatch: ${section.id} should use ${expectedStyle}`);
      }
    }

    tableXmls.forEach((tableXml, index) => {
      const firstRowXml = (tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/) || [''])[0];
      const hasTableHeader = /<w:tblHeader\b/.test(firstRowXml);
      const hasBoldText = /<w:b\b/.test(firstRowXml);
      const hasHeaderShading = /<w:shd\b/.test(firstRowXml);
      if (!firstRowXml || !hasTableHeader || !hasBoldText || !hasHeaderShading) {
        tableHeaderStyleFailures.push({ tableIndex: index, hasTableHeader, hasBoldText, hasHeaderShading });
        errors.push(`docx table header style missing: table ${index + 1}`);
      }
    });

    const details = {
      checkedHeadingCount: sections.length,
      tableCount: tableXmls.length,
      missingHeadingStyles,
      tableHeaderStyleFailures,
    };
    if (!tableXmls.length) {
      errors.push('docx styled tables are missing');
    }
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx styles cannot be checked: ${error.message || String(error)}`);
  }
}

function normalizeDensityText(text = '') {
  return String(text || '').replace(/\s+/g, '').trim();
}

function validateDocxTechnicalDensity(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const assetMap = input.assetMap || {};
    const profile = template.validationProfile || {};
    const enabledSections = getEnabledTemplateSections(template, projectData);
    const technicalSection = enabledSections.find((section) => section.id === 'technical-solution');
    const errors = [];
    const longParagraphs = [];
    const repeatedParagraphs = [];
    const expectedTableSectionIds = [
      'overall-architecture',
      'core-business-flow',
      'key-function-design',
      'third-party-interface-boundary',
      'function-parameter-response',
    ].filter((sectionId) => enabledSections.some((section) => section.id === sectionId));
    const expectedImageAssetCount = Object.values(assetMap || {}).filter((asset) => {
      return String(asset?.sectionId || '') === 'technical-solution'
        && String(asset?.filePath || '').trim()
        && assetShouldEmbedAsImage(asset)
        && assetNeedsDocxPresence(asset, template, projectData);
    }).length;
    const maxParagraphLength = Number(profile.technicalMaxParagraphLength || 260);

    const skippedDetails = {
      technicalSectionEnabled: Boolean(technicalSection),
      expectedTableSectionIds,
      expectedImageAssetCount,
      maxParagraphLength,
    };
    if (!technicalSection) return passed(skippedDetails);

    const blocks = readDocxBodyBlocks(outputPath);
    const sectionByTitle = new Map(enabledSections.map((section) => [section.title, section]));
    const technicalStartIndex = blocks.findIndex((block) => block.type === 'paragraph' && /^Heading[1-3]$/.test(block.headingStyle) && block.text === technicalSection.title);
    let technicalEndIndex = blocks.length;
    if (technicalStartIndex >= 0) {
      for (let index = technicalStartIndex + 1; index < blocks.length; index += 1) {
        const block = blocks[index];
        const section = sectionByTitle.get(block.text);
        if (block.type === 'paragraph' && section && /^Heading[1-3]$/.test(block.headingStyle) && Number(section.level) <= Number(technicalSection.level)) {
          technicalEndIndex = index;
          break;
        }
      }
    }

    if (technicalStartIndex < 0) {
      errors.push('docx technical solution heading is missing');
    }

    const technicalBlocks = technicalStartIndex >= 0 ? blocks.slice(technicalStartIndex + 1, technicalEndIndex) : [];
    const technicalTableCount = technicalBlocks.filter((block) => block.type === 'table').length;
    const technicalImageReferenceCount = technicalBlocks.filter((block) => block.hasImageReference).length;
    const paragraphOccurrences = new Map();
    technicalBlocks
      .filter((block) => block.type === 'paragraph' && !/^Heading[1-3]$/.test(block.headingStyle) && !block.hasImageReference)
      .forEach((block) => {
        const normalized = normalizeDensityText(block.text);
        if (!normalized) return;
        if (normalized.length > maxParagraphLength) {
          longParagraphs.push({ index: block.index, length: normalized.length, preview: normalized.slice(0, 40) });
          errors.push(`docx technical paragraph too long: paragraph ${block.index}`);
        }
        if (normalized.length >= 24) {
          paragraphOccurrences.set(normalized, (paragraphOccurrences.get(normalized) || 0) + 1);
        }
      });

    for (const [text, count] of paragraphOccurrences.entries()) {
      if (count > 1) {
        repeatedParagraphs.push({ count, preview: text.slice(0, 40) });
        errors.push(`docx technical paragraph repeated: ${text.slice(0, 40)}`);
      }
    }

    if (technicalTableCount < expectedTableSectionIds.length) {
      errors.push(`docx technical solution should be table-driven: expected at least ${expectedTableSectionIds.length} tables, got ${technicalTableCount}`);
    }
    if (technicalImageReferenceCount < expectedImageAssetCount) {
      errors.push(`docx technical solution missing inserted technical assets: expected ${expectedImageAssetCount} images, got ${technicalImageReferenceCount}`);
    }

    const details = {
      technicalSectionEnabled: true,
      technicalStartIndex,
      technicalEndIndex,
      technicalBlockCount: technicalBlocks.length,
      technicalTableCount,
      expectedTableSectionIds,
      expectedTableCount: expectedTableSectionIds.length,
      technicalImageReferenceCount,
      expectedImageAssetCount,
      maxParagraphLength,
      longParagraphs,
      repeatedParagraphs,
    };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx technical density cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxLayout(outputPath) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText('word/document.xml');
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    const sectionXml = (documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/) || [''])[0];
    const footerRelationshipMatches = [...relsXml.matchAll(/<Relationship\b[^>]*\bType="[^"]+\/footer"[^>]*\bTarget="([^"]+)"/g)];
    const errors = [];
    const details = {
      hasSectionProperties: Boolean(sectionXml),
      hasA4PageSize: false,
      hasPortraitOrientation: false,
      hasStandardMargins: false,
      footerRelationshipCount: footerRelationshipMatches.length,
      hasPageNumberFooter: false,
    };

    if (!sectionXml) {
      errors.push('docx section properties are missing');
    } else {
      details.hasA4PageSize = /<w:pgSz\b[^>]*\bw:w="11906"[^>]*\bw:h="16838"/.test(sectionXml);
      details.hasPortraitOrientation = /<w:pgSz\b[^>]*(\bw:orient="portrait"|\/>)/.test(sectionXml);
      details.hasStandardMargins = ['top', 'right', 'bottom', 'left'].every((side) => new RegExp(`\\bw:${side}="1440"`).test(sectionXml));
      if (!details.hasA4PageSize) errors.push('docx page size should be A4 11906x16838 DXA');
      if (!details.hasPortraitOrientation) errors.push('docx page orientation should be portrait');
      if (!details.hasStandardMargins) errors.push('docx page margins should be 1440 DXA on all sides');
      if (!/<w:footerReference\b/.test(sectionXml)) errors.push('docx footer reference is missing');
    }

    if (!footerRelationshipMatches.length) {
      errors.push('docx footer relationship is missing');
    }

    const footerTargets = footerRelationshipMatches.map((match) => decodeXmlEntities(match[1]));
    for (const target of footerTargets) {
      const footerPath = target.startsWith('word/') ? target : path.posix.join('word', target);
      if (!zip.getEntry(footerPath)) {
        errors.push(`docx footer target is missing: ${footerPath}`);
        continue;
      }
      const footerXml = zip.readAsText(footerPath);
      if (/<w:instrText\b[^>]*>PAGE<\/w:instrText>/.test(footerXml) && footerXml.includes('第 ') && footerXml.includes(' 页')) {
        details.hasPageNumberFooter = true;
      }
    }
    if (!details.hasPageNumberFooter) {
      errors.push('docx page number footer is missing');
    }

    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx layout cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxToc(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const enabledSectionIds = new Set(getEnabledTemplateSections(template, projectData).map((section) => section.id));
    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText('word/document.xml');
    const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    const tocHeadingParagraph = paragraphs.find((paragraphXml) => {
      return /<w:pStyle\b[^>]*\bw:val="Heading1"/.test(paragraphXml) && textFromParagraphXml(paragraphXml) === '目录';
    });
    const tocFieldParagraph = paragraphs.find((paragraphXml) => /<w:instrText\b[^>]*>[\s\S]*?TOC[\s\S]*?<\/w:instrText>/.test(paragraphXml));
    const tocInstruction = tocFieldParagraph
      ? decodeXmlEntities((tocFieldParagraph.match(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/) || [])[1] || '')
      : '';
    const errors = [];
    const details = {
      tocSectionEnabled: enabledSectionIds.has('toc'),
      hasTocHeading: Boolean(tocHeadingParagraph),
      hasTocField: Boolean(tocFieldParagraph),
      hasHeadingRange: tocInstruction.includes('"1-3"'),
      hasHyperlinks: /\\h/.test(tocInstruction),
      isMarkedDirty: Boolean(tocFieldParagraph && /<w:fldChar\b[^>]*\bw:dirty="true"/.test(tocFieldParagraph)),
      headingCount: readDocxHeadingTexts(outputPath).length,
      tocInstruction,
    };

    if (!details.tocSectionEnabled) return passed(details);
    if (!details.hasTocHeading) errors.push('docx TOC heading is missing');
    if (!details.hasTocField) errors.push('docx TOC field is missing');
    if (details.hasTocField && !details.hasHeadingRange) errors.push('docx TOC field should cover heading levels 1-3');
    if (details.hasTocField && !details.hasHyperlinks) errors.push('docx TOC field should enable hyperlinks');
    if (details.hasTocField && !details.isMarkedDirty) errors.push('docx TOC field should be marked dirty for page update');
    if (details.headingCount < 2) errors.push('docx TOC cannot update because heading paragraphs are missing');

    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx TOC cannot be checked: ${error.message || String(error)}`);
  }
}

const REQUIRED_PAGE_BREAK_BOUNDARIES = [
  ['toc', 'quote-summary'],
  ['quote-detail', 'legal-representative-id'],
  ['supplier-basic-info', 'qualification-documents'],
  ['qualification-documents', 'technical-solution'],
  ['supporting-equipment', 'implementation-plan'],
  ['implementation-plan', 'after-sales-plan'],
  ['after-sales-plan', 'warranty-period'],
  ['warranty-period', 'other-materials'],
];

function validateDocxPageBreaks(outputPath, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  try {
    const template = input.template || {};
    const projectData = input.projectData || {};
    const enabledSections = getEnabledTemplateSections(template, projectData);
    const sectionById = new Map(enabledSections.map((section) => [section.id, section]));
    const sectionIndexById = new Map(enabledSections.map((section, index) => [section.id, index]));
    const paragraphs = readDocxParagraphSummaries(outputPath);
    const headingIndexesByTitle = new Map();
    paragraphs.forEach((paragraph) => {
      if (/^Heading[1-3]$/.test(paragraph.headingStyle) && paragraph.text) {
        if (!headingIndexesByTitle.has(paragraph.text)) headingIndexesByTitle.set(paragraph.text, []);
        headingIndexesByTitle.get(paragraph.text).push(paragraph.index);
      }
    });

    const errors = [];
    const checkedBoundaries = [];
    const missingBoundaries = [];
    const skippedBoundaries = [];
    const findHeadingIndex = (section) => {
      const indexes = headingIndexesByTitle.get(section.title) || [];
      return indexes[0] ?? -1;
    };

    for (const [fromId, toId] of REQUIRED_PAGE_BREAK_BOUNDARIES) {
      const fromSection = sectionById.get(fromId);
      const toSection = sectionById.get(toId);
      if (!fromSection || !toSection) {
        skippedBoundaries.push(`${fromId}->${toId}`);
        continue;
      }
      if ((sectionIndexById.get(fromId) ?? -1) >= (sectionIndexById.get(toId) ?? -1)) {
        skippedBoundaries.push(`${fromId}->${toId}`);
        continue;
      }
      const fromIndex = findHeadingIndex(fromSection);
      const toIndex = findHeadingIndex(toSection);
      checkedBoundaries.push(`${fromId}->${toId}`);
      if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) {
        missingBoundaries.push(`${fromId}->${toId}`);
        errors.push(`docx page break boundary headings are missing or out of order: ${fromId}->${toId}`);
        continue;
      }
      const hasPageBreak = paragraphs
        .slice(fromIndex + 1, toIndex)
        .some((paragraph) => paragraph.hasPageBreak);
      if (!hasPageBreak) {
        missingBoundaries.push(`${fromId}->${toId}`);
        errors.push(`docx missing page break between sections: ${fromId}->${toId}`);
      }
    }

    const pageBreakCount = paragraphs.filter((paragraph) => paragraph.hasPageBreak).length;
    const details = {
      pageBreakCount,
      checkedBoundaries,
      checkedBoundaryCount: checkedBoundaries.length,
      missingBoundaries,
      skippedBoundaries,
    };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx page breaks cannot be checked: ${error.message || String(error)}`);
  }
}

function validateImagesInserted(outputPath, assetMap = {}, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  const template = input.template || {};
  const projectData = input.projectData || {};
  const assets = Object.values(assetMap || {});
  const imageAssets = assets.filter((asset) => assetShouldEmbedAsImage(asset));
  const requiredCount = imageAssets.filter((asset) => asset?.required && assetNeedsDocxPresence(asset, template, projectData)).length;
  const referencedCount = imageAssets.filter((asset) => String(asset?.filePath || '').trim() && assetNeedsDocxPresence(asset, template, projectData)).length;
  const expectedImageAssetCount = Math.max(requiredCount, referencedCount);
  try {
    const zip = new AdmZip(outputPath);
    const mediaEntries = zip.getEntries().filter((entry) => /^word\/media\//.test(entry.entryName));
    const mediaEntryNames = new Set(mediaEntries.map((entry) => entry.entryName));
    const documentXml = zip.readAsText('word/document.xml');
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    const imageReferenceCount = (documentXml.match(/<a:blip\b/g) || []).length;
    const imageRelationshipIds = [...documentXml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)].map((match) => match[1]);
    const relationshipTargets = new Map(
      [...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((match) => [match[1], decodeXmlEntities(match[2])]),
    );
    const missingImageRelationships = [];
    const missingMediaTargets = [];
    if (!mediaEntries.length && expectedImageAssetCount > 0) {
      return failed('docx media entries are missing', { mediaCount: 0, requiredCount, referencedCount, expectedImageAssetCount, imageReferenceCount, imageRelationshipCount: imageRelationshipIds.length });
    }
    if (imageReferenceCount < expectedImageAssetCount) {
      return failed(`docx image reference count ${imageReferenceCount} is less than expected asset image count ${expectedImageAssetCount}`, { mediaCount: mediaEntries.length, requiredCount, referencedCount, expectedImageAssetCount, imageReferenceCount, imageRelationshipCount: imageRelationshipIds.length });
    }
    for (const relationshipId of imageRelationshipIds) {
      const target = relationshipTargets.get(relationshipId);
      if (!target) {
        missingImageRelationships.push(relationshipId);
        continue;
      }
      const normalizedTarget = target.startsWith('/')
        ? target.replace(/^\/+/, '')
        : target.startsWith('word/')
          ? target
          : path.posix.join('word', target);
      if (!mediaEntryNames.has(normalizedTarget)) {
        missingMediaTargets.push(`${relationshipId}:${target}`);
      }
    }
    const errors = [];
    if (missingImageRelationships.length) {
      errors.push(`docx image relationships are missing: ${missingImageRelationships.join(', ')}`);
    }
    if (missingMediaTargets.length) {
      errors.push(`docx image relationship targets are missing media entries: ${missingMediaTargets.join(', ')}`);
    }
    const details = { mediaCount: mediaEntries.length, requiredCount, referencedCount, expectedImageAssetCount, imageReferenceCount, imageRelationshipCount: imageRelationshipIds.length, missingImageRelationships, missingMediaTargets };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx media cannot be checked: ${error.message || String(error)}`);
  }
}

function validateDocxAssetPlacement(outputPath, assetMap = {}, input = {}) {
  if (!outputPath || !fs.existsSync(outputPath)) {
    return failed(`docx file does not exist: ${outputPath || ''}`);
  }
  const template = input.template || {};
  const projectData = input.projectData || {};
  const assets = Object.values(assetMap || {}).filter((asset) => {
    return String(asset?.filePath || '').trim()
      && assetShouldEmbedAsImage(asset)
      && assetNeedsDocxPresence(asset, template, projectData);
  });
  try {
    const blocks = readDocxBodyBlocks(outputPath);
    const errors = [];
    const missingAssetTitles = [];
    const missingAdjacentImages = [];
    const missingPageBreaks = [];
    const placements = [];
    const nextContentBlockAfter = (index) => {
      for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
        const block = blocks[cursor];
        if (block.text || block.hasImageReference || block.type === 'table') return block;
      }
      return null;
    };
    const hasNearbyPageBreakBefore = (index) => {
      return blocks.slice(Math.max(0, index - 2), index).some((block) => block.hasPageBreak);
    };

    assets.forEach((asset) => {
      const title = String(asset.title || '').trim();
      const titleIndex = blocks.findIndex((block) => block.type === 'paragraph' && block.text === title);
      if (titleIndex < 0) {
        missingAssetTitles.push(asset.key);
        errors.push(`docx asset title is missing before image: ${asset.key}`);
        return;
      }
      const nextBlock = nextContentBlockAfter(titleIndex);
      const hasAdjacentImage = Boolean(nextBlock?.hasImageReference);
      const hasPageBreak = hasNearbyPageBreakBefore(titleIndex);
      placements.push({
        key: asset.key,
        title,
        titleIndex,
        imageIndex: nextBlock?.hasImageReference ? nextBlock.index : -1,
        hasAdjacentImage,
        hasPageBreak,
      });
      if (!hasAdjacentImage) {
        missingAdjacentImages.push(asset.key);
        errors.push(`docx asset image is not adjacent to title: ${asset.key}`);
      }
      if (!hasPageBreak) {
        missingPageBreaks.push(asset.key);
        errors.push(`docx asset title is not on a separated page: ${asset.key}`);
      }
    });

    const details = {
      checkedAssetCount: assets.length,
      placements,
      missingAssetTitles,
      missingAdjacentImages,
      missingPageBreaks,
    };
    return errors.length ? failed(errors, details) : passed(details);
  } catch (error) {
    return failed(`docx asset placement cannot be checked: ${error.message || String(error)}`);
  }
}

function validateBidDocumentProject(input = {}) {
  const template = input.template || {};
  const projectData = input.projectData || {};
  const quoteItems = input.quoteItems || [];
  const assetMap = input.assetMap || {};
  const documentText = collectDocumentText({ template, projectData, quoteItems, assetMap });
  const templateCheck = validateTemplateDefinition(template);
  const quoteCheck = validateQuoteTotals(projectData, quoteItems, template);
  const paymentCheck = validatePaymentTerms(projectData, template);
  const titleCheck = validateDocumentTitle(template);
  const identityCheck = validateProjectIdentity({ template, projectData, assetMap });
  const assetCheck = validateAssets(assetMap, template, projectData);
  const forbiddenWordsCheck = validateForbiddenWords(documentText);
  const sectionSelectionCheck = validateSectionSelection(template, projectData);
  const sectionCheck = validateRequiredSections(template, projectData);
  const preflight = mergeResults({ templateCheck, quoteCheck, paymentCheck, titleCheck, identityCheck, assetCheck, forbiddenWordsCheck, sectionSelectionCheck, sectionCheck });

  return {
    templateCheck,
    quoteCheck,
    paymentCheck,
    titleCheck,
    identityCheck,
    forbiddenWordsCheck,
    assetCheck,
    sectionSelectionCheck,
    sectionCheck,
    docxOpenCheck: { passed: false, errors: ['not_run'], details: {} },
    docxContentCheck: { passed: false, errors: ['not_run'], details: {} },
    docxSectionOrderCheck: { passed: false, errors: ['not_run'], details: {} },
    docxTableCheck: { passed: false, errors: ['not_run'], details: {} },
    docxQuoteIntegrityCheck: { passed: false, errors: ['not_run'], details: {} },
    docxLayoutCheck: { passed: false, errors: ['not_run'], details: {} },
    docxTocCheck: { passed: false, errors: ['not_run'], details: {} },
    docxStyleCheck: { passed: false, errors: ['not_run'], details: {} },
    docxTechnicalDensityCheck: { passed: false, errors: ['not_run'], details: {} },
    docxPageBreakCheck: { passed: false, errors: ['not_run'], details: {} },
    imageInsertionCheck: { passed: false, errors: ['not_run'], details: {} },
    docxAssetPlacementCheck: { passed: false, errors: ['not_run'], details: {} },
    docxForbiddenWordsCheck: { passed: false, errors: ['not_run'], details: {} },
    passed: preflight.passed,
    errors: preflight.errors,
  };
}

module.exports = {
  FORBIDDEN_WORDS,
  SUPPORTED_IMAGE_EXTENSIONS,
  collectDocumentText,
  assetShouldEmbedAsImage,
  getEnabledTemplateSections,
  validateAssets,
  validateBidDocumentProject,
  validateDocumentTitle,
  validateDocxContent,
  validateDocxAssetPlacement,
  validateDocxForbiddenWords,
  validateDocxLayout,
  validateDocxOpenable,
  validateDocxPageBreaks,
  validateDocxQuoteIntegrity,
  validateDocxSectionOrder,
  validateDocxStyles,
  validateDocxTables,
  validateDocxTechnicalDensity,
  validateDocxToc,
  validateForbiddenWords,
  validateImagesInserted,
  validatePaymentTerms,
  validateProjectIdentity,
  validateQuoteTotals,
  validateRequiredSections,
  validateSectionSelection,
  validateTemplateDefinition,
};
