const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const {
  getEnabledTemplateSections,
  validateQuoteTotals,
} = require('./bidDocumentValidation.cjs');
const { isSupportedImageExtensionWithDot } = require('./bidDocumentAssets.cjs');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function markdownTableCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
  return text || '-';
}

function markdownInline(value) {
  const text = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
  return text || '-';
}

function markdownTableRow(cells) {
  return `| ${cells.map(markdownTableCell).join(' | ')} |`;
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function worksheetXml(rows) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => {
      const ref = `${columnName(cellIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" s="${rowIndex === 0 ? 1 : 0}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function sanitizeSheetName(value, fallback) {
  const normalized = String(value || fallback).replace(/[:\\/?*\[\]]/g, '').slice(0, 31);
  return normalized || fallback;
}

function normalizeReport(report = {}) {
  const quoteTotal = report.quoteTotal ?? report.quote_total ?? 0;
  const targetTotal = report.targetTotal ?? report.target_total ?? 0;
  const quoteItems = report.quoteItems || report.quote_items || [];
  const quoteReconciliation = report.quoteReconciliation || report.quote_reconciliation || buildQuoteReconciliation(quoteItems, targetTotal);
  return {
    ready: Boolean(report.ready),
    templateId: report.templateId || report.template_id || '',
    projectName: report.projectName || report.project_name || '',
    purchaserName: report.purchaserName || report.purchaser_name || '',
    supplierName: report.supplierName || report.supplier_name || '',
    quoteTotal,
    targetTotal,
    quoteDifference: report.quoteDifference ?? report.quote_difference ?? 0,
    quoteReconciliation,
    quoteResolutionActions: report.quoteResolutionActions || report.quote_resolution_actions || buildQuoteResolutionActions(quoteReconciliation),
    assetPackage: report.assetPackage || report.asset_package || null,
    assetInventory: report.assetInventory || report.asset_inventory || [],
    blockers: report.blockers || {},
    missingAssets: report.missingAssets || report.missing_assets || [],
    checks: report.checks || [],
  };
}

function classifyReadinessErrors(errors = []) {
  const groups = {
    quote: [],
    payment: [],
    identity: [],
    forbiddenWords: [],
    assets: [],
    sections: [],
    template: [],
    demoAssets: [],
    other: [],
  };
  for (const error of errors) {
    const text = String(error || '');
    if (!text) continue;
    if (text.includes('demo_assets_not_allowed_for_formal_build')) {
      groups.demoAssets.push(text);
    } else if (text.includes('quote_') || text.includes('quote items') || text.includes('quote_items') || text.includes('totalWithTax') || text.includes('brandModel')) {
      groups.quote.push(text);
    } else if (text.includes('payment') || text.includes('12 个月') || text.includes('3 个月')) {
      groups.payment.push(text);
    } else if (text.includes('projectData') || text.includes('supplier') || text.includes('purchaser') || text.includes('templateId')) {
      groups.identity.push(text);
    } else if (text.includes('forbidden') || text.includes('禁用') || text.includes('待补') || text.includes('请填写')) {
      groups.forbiddenWords.push(text);
    } else if (text.includes('asset') || text.includes('missing_assets') || text.includes('unsupported_asset_type')) {
      groups.assets.push(text);
    } else if (text.includes('section') || text.includes('required section') || text.includes('Heading')) {
      groups.sections.push(text);
    } else if (text.includes('template') || text.includes('unknown_template_id')) {
      groups.template.push(text);
    } else {
      groups.other.push(text);
    }
  }
  return Object.fromEntries(Object.entries(groups).filter(([, items]) => items.length > 0));
}

function extractReadinessMissingAssets(assetMap = {}, buildLog = {}) {
  const assetErrors = new Set([
    ...(buildLog.assetCheck?.errors || []),
    ...(buildLog.errors || []).filter((error) => String(error).includes('missing_assets')),
  ]);
  const missingKeys = new Set();
  for (const error of assetErrors) {
    const match = String(error).match(/missing_assets:([^\s,;]+)/);
    if (match) missingKeys.add(match[1]);
  }
  return Object.entries(assetMap)
    .filter(([key, asset]) => {
      const filePath = String(asset?.filePath || '').trim();
      return missingKeys.has(key) || (asset?.required && !filePath);
    })
    .map(([key, asset]) => ({
      key,
      title: asset?.title || key,
      sectionId: asset?.sectionId || '',
      required: Boolean(asset?.required),
      filePath: asset?.filePath || '',
    }));
}

function collectReadinessCheckSummaries(buildLog = {}) {
  return Object.entries(buildLog)
    .filter(([key, value]) => key.endsWith('Check') && value && typeof value === 'object')
    .map(([key, value]) => {
      const errors = Array.isArray(value.errors) ? value.errors : [];
      const notRun = errors.length === 1 && errors[0] === 'not_run';
      return {
        key,
        passed: Boolean(value.passed),
        status: notRun ? 'not_run' : (value.passed ? 'passed' : 'failed'),
        errors,
        details: value.details || {},
      };
    });
}

function applyDemoAssetPackageGuard(buildLog = {}, assetPackage = null) {
  if (!assetPackage?.demoOnly) return buildLog;
  const demoAssetError = 'demo_assets_not_allowed_for_formal_build';
  if ((buildLog.errors || []).includes(demoAssetError)) return buildLog;
  const assetCheck = {
    ...(buildLog.assetCheck || { errors: [] }),
    passed: false,
    errors: [...(buildLog.assetCheck?.errors || []), demoAssetError],
    details: {
      ...(buildLog.assetCheck?.details || {}),
      assetPackage,
    },
  };
  return {
    ...buildLog,
    assetCheck,
    passed: false,
    errors: [...(buildLog.errors || []), demoAssetError],
  };
}

function createReadinessReport(input = {}, buildLog = {}) {
  const projectData = input.projectData || {};
  const template = input.template || {};
  const quoteItems = input.quoteItems || [];
  const assetMap = input.assetMap || {};
  const assetPackage = input.assetPackage || null;
  const quoteTotal = quoteItems.reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0);
  const targetTotal = Number(projectData.totalWithTax || 0);
  const quoteReconciliation = buildQuoteReconciliation(quoteItems, targetTotal);
  const quoteResolutionActions = buildQuoteResolutionActions(quoteReconciliation);
  return {
    ready: Boolean(buildLog.passed),
    templateId: template.id || projectData.templateId || '',
    projectName: projectData.projectName || '',
    purchaserName: projectData.purchaserName || '',
    supplierName: projectData.supplierName || '',
    quoteTotal,
    targetTotal,
    quoteDifference: Number((targetTotal - quoteTotal).toFixed(2)),
    quoteReconciliation,
    quoteResolutionActions,
    assetPackage,
    assetInventory: buildAssetInventory(assetMap, template.sections || [], assetPackage, {
      projectData,
      template,
    }),
    blockers: classifyReadinessErrors(buildLog.errors || []),
    missingAssets: extractReadinessMissingAssets(assetMap, buildLog),
    checks: collectReadinessCheckSummaries(buildLog),
    buildLog,
  };
}

function toSnakeReadinessReport(report = {}, options = {}) {
  const normalized = normalizeReport(report);
  return {
    ready: normalized.ready,
    input: options.inputPath || report.input || report.input_path || '',
    template_id: normalized.templateId,
    project_name: normalized.projectName,
    purchaser_name: normalized.purchaserName,
    supplier_name: normalized.supplierName,
    quote_total: normalized.quoteTotal,
    target_total: normalized.targetTotal,
    quote_difference: normalized.quoteDifference,
    quote_reconciliation: normalized.quoteReconciliation,
    quote_resolution_actions: normalized.quoteResolutionActions,
    asset_package: normalized.assetPackage,
    asset_inventory: normalized.assetInventory,
    blockers: normalized.blockers,
    missing_assets: normalized.missingAssets,
    checks: normalized.checks,
    build_log: report.buildLog || report.build_log || options.buildLog || {},
  };
}

function renderReadinessReportMarkdown(report = {}) {
  const normalized = normalizeReport(report);
  const lines = [
    '# 标书正式构建准备度报告',
    '',
    `- 状态：${normalized.ready ? '可正式构建' : '存在阻断项'}`,
    `- 模板：${markdownInline(normalized.templateId)}`,
    `- 项目名称：${markdownInline(normalized.projectName)}`,
    `- 采购人：${markdownInline(normalized.purchaserName)}`,
    `- 供应商：${markdownInline(normalized.supplierName)}`,
    `- 分项报价合计：${normalized.quoteTotal}`,
    `- 项目含税总价：${normalized.targetTotal}`,
    `- 报价差额：${normalized.quoteDifference}`,
    '',
    '## 报价核对',
    '',
    '| 序号 | 名称 | 品牌及型号 | 数量 | 含税单价 | 声明含税合计 | 计算含税合计 | 行差额 | 状态 |',
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  const quoteItems = normalized.quoteReconciliation?.items || [];
  if (quoteItems.length > 0) {
    for (const item of quoteItems) {
      lines.push(markdownTableRow([
        item.index,
        item.name || '-',
        item.brandModel || '-',
        item.quantity,
        item.unitPriceWithTax,
        item.declaredTotalWithTax,
        item.computedTotalWithTax,
        item.difference,
        item.status === 'passed' ? '通过' : '未通过',
      ]));
    }
  } else {
    lines.push('| - | 无 | 无 |  |  |  |  |  | 当前配置未提供分项报价 |');
  }
  lines.push(markdownTableRow(['合计', '', '', '', '', normalized.quoteReconciliation?.quoteTotal ?? normalized.quoteTotal, normalized.quoteReconciliation?.computedQuoteTotal ?? '-', normalized.quoteReconciliation?.rowDifferenceTotal ?? '-', '']));
  lines.push(markdownTableRow(['项目含税总价', '', '', '', '', normalized.targetTotal, '', '', '']));
  lines.push(markdownTableRow(['项目级差额', '', '', '', '', normalized.quoteDifference, '', '', '']));
  lines.push('');

  if ((normalized.quoteResolutionActions || []).length > 0) {
    lines.push('## 报价差额处理建议', '');
    lines.push('| 处理项 | 操作建议 |');
    lines.push('| --- | --- |');
    for (const item of normalized.quoteResolutionActions) {
      lines.push(markdownTableRow([item.title, item.action]));
    }
    lines.push('');
  }

  const blockerEntries = Object.entries(normalized.blockers || {});
  lines.push('## 阻断项', '');
  if (blockerEntries.length > 0) {
    for (const [group, errors] of blockerEntries) {
      lines.push(`### ${markdownInline(group)}`);
      for (const error of errors) lines.push(`- ${markdownInline(error)}`);
      lines.push('');
    }
  } else {
    lines.push('- 无', '');
  }

  if (normalized.assetPackage?.demoOnly) {
    lines.push('## 演示附件包', '');
    lines.push('- 当前配置标记为 demoOnly，仅用于验证流程，不能生成正式可递交 Word。');
    lines.push('');
  }

  if ((normalized.assetInventory || []).length > 0) {
    lines.push('## 附件清单', '');
    lines.push('| key | 材料名称 | 章节 | 必填 | 类型 | 状态 | 建议文件名 | 处理说明 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const asset of normalized.assetInventory) {
      const status = asset.status === 'present' ? '已配置' : (asset.status === 'demo_only' ? '演示附件' : (asset.status === 'missing_optional' ? '可选缺失' : '必填缺失'));
      lines.push(markdownTableRow([
        asset.key,
        asset.title,
        asset.sectionTitle || asset.sectionId || '-',
        asset.required ? '是' : '否',
        asset.type || 'image',
        status,
        asset.suggestedFileName || '-',
        asset.collectionNote || '-',
      ]));
    }
    lines.push('');
  }

  if ((normalized.missingAssets || []).length > 0) {
    lines.push('## 缺失附件', '');
    lines.push('| key | 标题 | 章节 | 必填 | 当前路径 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const asset of normalized.missingAssets) {
      lines.push(markdownTableRow([asset.key, asset.title, asset.sectionId || '-', asset.required ? '是' : '否', asset.filePath || '-']));
    }
    lines.push('');
  }

  lines.push('## 校验项', '');
  lines.push('| 校验 | 结果 | 错误数 |');
  lines.push('| --- | --- | ---: |');
  for (const check of normalized.checks || []) {
    const label = check.status === 'not_run' ? '未运行' : (check.passed ? '通过' : '未通过');
    lines.push(markdownTableRow([check.key, label, (check.errors || []).length]));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function toMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function buildQuoteReconciliation(quoteItems = [], targetTotal = 0) {
  const items = (quoteItems || []).map((item, index) => {
    const quantity = toMoney(item.quantity ?? item.qty ?? 0);
    const unitPriceWithTax = toMoney(item.unitPriceWithTax ?? item.unit_price_with_tax ?? 0);
    const declaredTotalWithTax = toMoney(item.totalWithTax ?? item.total_with_tax ?? 0);
    const computedTotalWithTax = toMoney(quantity * unitPriceWithTax);
    const difference = toMoney(declaredTotalWithTax - computedTotalWithTax);
    return {
      index: index + 1,
      name: item.name || item.itemName || item.item_name || '',
      brandModel: item.brandModel || item.brand_model || '',
      quantity,
      unitPriceWithTax,
      declaredTotalWithTax,
      computedTotalWithTax,
      difference,
      taxRate: item.taxRate ?? item.tax_rate ?? '',
      category: item.category || '',
      status: Math.abs(difference) < 0.01 ? 'passed' : 'failed',
    };
  });
  const quoteTotal = toMoney(items.reduce((sum, item) => sum + item.declaredTotalWithTax, 0));
  const computedQuoteTotal = toMoney(items.reduce((sum, item) => sum + item.computedTotalWithTax, 0));
  const rowDifferenceTotal = toMoney(items.reduce((sum, item) => sum + item.difference, 0));
  return {
    items,
    quoteTotal,
    computedQuoteTotal,
    targetTotal: toMoney(targetTotal),
    quoteDifference: toMoney(Number(targetTotal || 0) - quoteTotal),
    rowDifferenceTotal,
  };
}

function buildQuoteResolutionActions(quoteReconciliation = {}) {
  const quoteTotal = toMoney(quoteReconciliation.quoteTotal ?? 0);
  const targetTotal = toMoney(quoteReconciliation.targetTotal ?? 0);
  const quoteDifference = toMoney(quoteReconciliation.quoteDifference ?? (targetTotal - quoteTotal));
  if (Math.abs(quoteDifference) < 0.01) return [];
  const absoluteDifference = toMoney(Math.abs(quoteDifference));
  const direction = quoteDifference > 0 ? '分项报价少于项目含税总价' : '分项报价高于项目含税总价';
  return [
    {
      key: 'confirm_project_total',
      title: '确认项目含税总价',
      action: `如项目总价应以分项报价合计为准，请将项目含税总价调整为 ${quoteTotal}，并同步不含税金额和采购文件口径。`,
    },
    {
      key: 'add_confirmed_quote_item',
      title: '新增经确认的真实分项',
      action: `如项目含税总价必须保持 ${targetTotal}，请新增经商务确认的真实报价行，含税金额合计为 ${absoluteDifference}，并提供名称、品牌型号、数量、单价、税率和交付边界。`,
    },
    {
      key: 'correct_existing_quote_items',
      title: '修正已有报价行',
      action: `如差额来自已有报价行录入错误，请修正对应行的数量、含税单价或含税合计；当前差异方向为：${direction}。`,
    },
  ];
}

function sanitizeAssetFileName(value, fallback) {
  const normalized = String(value || fallback || 'asset')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  const safeName = normalized || fallback || 'asset';
  const baseName = safeName.split('.')[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/.test(baseName)) {
    return `_${safeName}`;
  }
  return safeName;
}

function sanitizeDirectoryName(value, fallback) {
  return sanitizeAssetFileName(value, fallback).replace(/\.+$/g, '') || fallback || 'dir';
}

function suggestedExtensionForAsset(asset = {}) {
  const type = String(asset?.type || '').trim();
  const existingExtension = path.extname(String(asset?.filePath || '').trim()).toLowerCase();
  if (type === 'document') return existingExtension || '.pdf';
  return existingExtension && isSupportedImageExtensionWithDot(existingExtension) ? existingExtension : '.png';
}

function collectionNoteForAsset(asset = {}, status = '') {
  const type = String(asset?.type || '').trim();
  if (status === 'demo_only') {
    return '当前为演示附件路径，正式构建前必须替换为真实可递交材料。';
  }
  if (type === 'document') {
    return asset?.required
      ? '配置错误：必填材料必须配置为图片或扫描件，并提供可插入 Word 的真实扫描件、截图或设备图片。'
      : '如本项目适用，请提供真实原始文件；不适用可在模板中关闭或保持可选。';
  }
  return asset?.required
    ? '必须提供真实扫描件、截图或设备图片后才能正式构建。'
    : '如本项目适用，请提供真实扫描件、截图或设备图片；不适用可在模板中关闭或保持可选。';
}

function isPathInsideDirectory(parentDir, candidatePath) {
  const relative = path.relative(parentDir, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveAssetTargetFile(rootDir, asset = {}) {
  const key = String(asset?.key || '').trim() || 'unknown';
  const targetFile = String(asset?.targetFile || '').trim();
  if (!targetFile) {
    return {
      targetFile,
      resolvedPath: '',
      exists: false,
    };
  }
  if (path.isAbsolute(targetFile) || path.win32.isAbsolute(targetFile)) {
    throw new Error(`invalid_asset_target_file:absolute_path:${key}:${targetFile}`);
  }
  const resolvedPath = path.resolve(rootDir, targetFile);
  if (!isPathInsideDirectory(rootDir, resolvedPath)) {
    throw new Error(`invalid_asset_target_file:outside_package:${key}:${targetFile}`);
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile() || fs.statSync(resolvedPath).size <= 0) {
    return {
      targetFile,
      resolvedPath: '',
      exists: false,
    };
  }
  const realRootDir = fs.realpathSync(rootDir);
  const realAssetPath = fs.realpathSync(resolvedPath);
  if (!isPathInsideDirectory(realRootDir, realAssetPath)) {
    throw new Error(`invalid_asset_target_file:outside_package:${key}:${targetFile}`);
  }
  return {
    targetFile,
    resolvedPath,
    exists: true,
  };
}

function buildAssetInventory(assetMap = {}, sections = [], assetPackage = null, options = {}) {
  const sectionTitleById = new Map((sections || []).map((section) => [section.id, section.title || section.id]));
  const projectData = options.projectData || {};
  const template = options.template || { sections };
  const knownSectionIds = new Set((sections || []).map((section) => section.id).filter(Boolean));
  const enabledSectionIds = new Set(getEnabledTemplateSections(template, projectData).map((section) => section.id));
  return Object.entries(assetMap || {}).filter(([, asset]) => {
    const sectionId = asset?.sectionId || '';
    return !knownSectionIds.has(sectionId) || enabledSectionIds.has(sectionId);
  }).map(([key, asset]) => {
    const filePath = String(asset?.filePath || '').trim();
    const sectionId = asset?.sectionId || '';
    const sectionTitle = sectionTitleById.get(sectionId) || sectionId;
    const ext = suggestedExtensionForAsset(asset);
    const suggestedFileName = `${sanitizeAssetFileName(sectionTitle || '附件', '附件')}-${sanitizeAssetFileName(asset?.title || key, key)}${ext}`;
    const required = Boolean(asset?.required);
    let status = 'present';
    if (!filePath && required) status = 'missing_required';
    if (!filePath && !required) status = 'missing_optional';
    if (filePath && assetPackage?.demoOnly) status = 'demo_only';
    return {
      key,
      title: asset?.title || key,
      sectionId,
      sectionTitle,
      required,
      type: asset?.type || 'image',
      filePath,
      status,
      suggestedFileName,
      collectionNote: collectionNoteForAsset({ ...asset, required }, status),
    };
  });
}

function writeAssetCollectionPackage({ outputDir, projectData = {}, template = {}, assetInventory = [], readinessReport = null }) {
  const rootDir = path.resolve(outputDir);
  const assetsDir = path.join(rootDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const quoteReconciliation = readinessReport?.quoteReconciliation || readinessReport?.quote_reconciliation || null;
  const quoteResolutionActions = readinessReport?.quoteResolutionActions || readinessReport?.quote_resolution_actions || [];
  const readinessIssues = flattenReadinessIssues(readinessReport || {});

  const sectionIndexes = new Map();
  const manifestAssets = (assetInventory || []).map((asset) => {
    const sectionName = asset.sectionTitle || asset.sectionId || '未分组材料';
    if (!sectionIndexes.has(sectionName)) sectionIndexes.set(sectionName, sectionIndexes.size + 1);
    const sectionIndex = String(sectionIndexes.get(sectionName)).padStart(2, '0');
    const sectionDirName = `${sectionIndex}-${sanitizeDirectoryName(sectionName, 'section')}`;
    const targetDir = path.join(assetsDir, sectionDirName);
    fs.mkdirSync(targetDir, { recursive: true });
    return {
      ...asset,
      targetDirectory: path.relative(rootDir, targetDir).replace(/\\/g, '/'),
      targetFile: path.posix.join(path.relative(rootDir, targetDir).replace(/\\/g, '/'), asset.suggestedFileName || `${asset.key}.png`),
    };
  });

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    templateId: template.id || projectData.templateId || '',
    templateName: template.name || '',
    projectName: projectData.projectName || '',
    purchaserName: projectData.purchaserName || '',
    supplierName: projectData.supplierName || '',
    assetCount: manifestAssets.length,
    requiredAssetCount: manifestAssets.filter((asset) => asset.required).length,
    demoOnlyAssetCount: manifestAssets.filter((asset) => asset.status === 'demo_only').length,
    replacementRequiredAssetCount: manifestAssets.filter((asset) => asset.status === 'demo_only').length,
    missingRequiredAssetCount: manifestAssets.filter((asset) => asset.status === 'missing_required').length,
    readinessReady: Boolean(readinessReport?.ready),
    readinessIssues,
    quoteTotal: readinessReport?.quoteTotal ?? readinessReport?.quote_total ?? quoteReconciliation?.quoteTotal ?? 0,
    targetTotal: readinessReport?.targetTotal ?? readinessReport?.target_total ?? quoteReconciliation?.targetTotal ?? 0,
    quoteDifference: readinessReport?.quoteDifference ?? readinessReport?.quote_difference ?? quoteReconciliation?.quoteDifference ?? 0,
    quoteReconciliation,
    quoteResolutionActions,
    assets: manifestAssets,
  };

  const manifestPath = path.join(rootDir, 'asset-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const manifestSchemaPath = path.join(rootDir, 'asset-manifest.schema.json');
  fs.writeFileSync(manifestSchemaPath, JSON.stringify({
    version: 1,
    title: 'Bid document asset collection package manifest schema',
    templateId: manifest.templateId,
    projectName: manifest.projectName,
    description: '材料收集包 manifest 由系统生成。人工只应按 targetFile 放入真实附件，不应修改 key、sectionId、templateId、status 或计数字段。',
    required: ['version', 'templateId', 'projectName', 'assets'],
    statusEnum: ['present', 'demo_only', 'missing_required', 'missing_optional'],
    assetFields: {
      key: 'string',
      title: 'string',
      sectionId: 'string',
      sectionTitle: 'string',
      required: 'boolean',
      type: 'image|scan|document',
      typeRules: 'image/scan 需要可插入 Word 的图片文件；必填材料必须使用 image/scan。document 仅用于可选原始文件，需要真实非空文件，系统会按原始文件后缀或 .pdf 生成建议文件名。',
      status: 'present|demo_only|missing_required|missing_optional',
      targetDirectory: 'string',
      targetFile: 'relative string inside material package',
      suggestedFileName: 'string',
    },
    counters: {
      assetCount: 'number',
      requiredAssetCount: 'number',
      demoOnlyAssetCount: 'number',
      replacementRequiredAssetCount: 'number',
      missingRequiredAssetCount: 'number',
    },
  }, null, 2), 'utf8');
  const quoteResolutionPath = path.join(rootDir, 'quote-resolution.json');
  const quoteResolutionSchemaPath = path.join(rootDir, 'quote-resolution.schema.json');
  const actionRules = {
    confirm_project_total: {
      description: '确认项目含税总价以当前分项报价合计为准。',
      requiredFields: ['selectedAction', 'projectDataPatch.totalWithTax', 'projectDataPatch.totalWithoutTax'],
      allowedDataFields: ['projectDataPatch'],
      forbiddenDataFields: ['quoteItemsReplacement', 'quoteItemsAppend'],
    },
    add_confirmed_quote_item: {
      description: '保持项目含税总价，新增经商务确认的真实报价行。',
      requiredFields: ['selectedAction', 'quoteItemsAppend'],
      allowedDataFields: ['quoteItemsAppend'],
      forbiddenDataFields: ['projectDataPatch', 'quoteItemsReplacement'],
    },
    correct_existing_quote_items: {
      description: '修正已有报价行的数量、单价、合计或税率。',
      requiredFields: ['selectedAction', 'quoteItemsReplacement'],
      allowedDataFields: ['quoteItemsReplacement'],
      forbiddenDataFields: ['projectDataPatch', 'quoteItemsAppend'],
    },
  };
  const quoteResolution = {
    version: 1,
    templateId: manifest.templateId,
    projectName: manifest.projectName,
    quoteTotal: manifest.quoteTotal,
    targetTotal: manifest.targetTotal,
    quoteDifference: manifest.quoteDifference,
    status: Math.abs(Number(manifest.quoteDifference || 0)) < 0.01 ? 'not_required' : 'requires_manual_confirmation',
    selectedAction: '',
    actionRules,
    allowedActions: manifest.quoteResolutionActions.map((item) => ({
      key: item.key,
      title: item.title,
      action: item.action,
    })),
    projectDataPatch: {},
    quoteItemsReplacement: [],
    quoteItemsAppend: [],
    notes: '',
  };
  fs.writeFileSync(quoteResolutionPath, JSON.stringify(quoteResolution, null, 2), 'utf8');
  fs.writeFileSync(quoteResolutionSchemaPath, JSON.stringify({
    version: 1,
    title: 'Bid document quote resolution decision schema',
    templateId: manifest.templateId,
    projectName: manifest.projectName,
    description: '填写 quote-resolution.json 时，必须先选择 selectedAction，再按对应 actionRules 只填写允许的数据区。导入时会再次运行正式报价校验。',
    required: ['version', 'templateId', 'projectName', 'selectedAction'],
    selectedActionEnum: manifest.quoteResolutionActions.map((item) => item.key),
    identityRules: [
      'version must be 1; unsupported versions return unsupported_quote_resolution_version and are not applied.',
      'templateId must match asset-manifest.json templateId; mismatches return quote_resolution_template_mismatch and are not applied.',
    ],
    actionRules,
    projectDataPatchFields: {
      totalWithTax: 'number > 0; optional, only for confirm_project_total',
      totalWithoutTax: 'number > 0 and <= totalWithTax; optional, only for confirm_project_total',
      taxPolicy: 'object; optional, only for confirm_project_total',
    },
    projectDataPatchAllowedFields: [...QUOTE_RESOLUTION_ALLOWED_PROJECT_PATCH_KEYS],
    quoteItemFields: {
      name: 'string, required',
      quantity: 'number > 0, required',
      brandModel: 'string, required',
      unitPriceWithTax: 'number > 0, required',
      totalWithTax: 'number > 0, required and must equal quantity * unitPriceWithTax',
      taxRate: 'optional number between 0 and 1; after applying the decision, taxRate must match the effective project taxPolicy for the row category',
      category: 'optional software|hardware|service|material|other; software/hardware/material map to softwareHardwareRate, service maps to serviceRate, other maps to defaultRate',
    },
    validationRules: [
      'selectedAction must match the single data area allowed by actionRules.',
      'projectDataPatch may only contain totalWithTax, totalWithoutTax, and taxPolicy.',
      'quoteItemsAppend and quoteItemsReplacement rows must contain name, brandModel, quantity, unitPriceWithTax, and totalWithTax.',
      'quote item totalWithTax must equal quantity * unitPriceWithTax.',
      'After quote-resolution is applied in memory, the complete quote table is rechecked by formal quote validation, including project totals, tax policy rates, quote item categories, and quote item taxRate/category mapping.',
    ],
  }, null, 2), 'utf8');

  const markdownLines = [
    '# 标书材料收集清单',
    '',
    `- 项目名称：${markdownInline(manifest.projectName)}`,
    `- 模板：${markdownInline(manifest.templateName || manifest.templateId)}`,
    `- 采购人：${markdownInline(manifest.purchaserName)}`,
    `- 供应商：${markdownInline(manifest.supplierName)}`,
    `- 附件数量：${manifest.assetCount}`,
    `- 必填附件：${manifest.requiredAssetCount}`,
    `- 演示附件：${manifest.demoOnlyAssetCount}`,
    `- 需替换演示附件：${manifest.replacementRequiredAssetCount}`,
    `- 必填缺失：${manifest.missingRequiredAssetCount}`,
    `- 报价差额：${manifest.quoteDifference}`,
    `- 正式构建阻断项：${manifest.readinessIssues.length}`,
    '',
    '## 使用方式',
    '',
    '1. 按“目标目录”和“建议文件名”放入真实扫描件或截图。',
    '2. `asset-manifest.json` 由系统生成，先查看 `asset-manifest.schema.json`，不要修改 key、模板或状态字段。',
    '3. 替换演示附件后，在项目配置中重新选择或导入真实文件路径。',
    '4. 如存在报价差额，按 `quote-resolution.json` 选择处理方式并填写经确认的数据。',
    '5. 填写报价决策前先查看 `quote-resolution.schema.json`，动作和数据区必须一一匹配。',
    '6. 再运行准备度报告或正式 Word 导出校验。',
    '',
    '## 正式构建阻断项',
    '',
    '| 类别 | 阻断原因 |',
    '| --- | --- |',
  ];
  if (manifest.readinessIssues.length > 0) {
    for (const issue of manifest.readinessIssues) {
      markdownLines.push(markdownTableRow([issue.group, issue.error]));
    }
  } else {
    markdownLines.push('| 无 | 当前无阻断项。 |');
  }
  markdownLines.push(
    '',
    '## 报价核对摘要',
    '',
    '| 项目 | 金额 |',
    '| --- | ---: |',
    `| 分项报价合计 | ${manifest.quoteTotal} |`,
    `| 项目含税总价 | ${manifest.targetTotal} |`,
    `| 项目级差额 | ${manifest.quoteDifference} |`,
    '',
  );
  if (manifest.quoteResolutionActions.length > 0) {
    markdownLines.push('## 报价差额处理建议', '');
    markdownLines.push('| 处理项 | 操作建议 |');
    markdownLines.push('| --- | --- |');
    for (const item of manifest.quoteResolutionActions) {
      markdownLines.push(markdownTableRow([item.title, item.action]));
    }
    markdownLines.push('');
  }
  markdownLines.push(
    '## 附件清单',
    '',
    '| key | 材料名称 | 章节 | 必填 | 类型 | 状态 | 目标目录 | 建议文件名 | 处理说明 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const asset of manifestAssets) {
    const status = asset.status === 'present' ? '已配置' : (asset.status === 'demo_only' ? '演示附件' : (asset.status === 'missing_optional' ? '可选缺失' : '必填缺失'));
    markdownLines.push(markdownTableRow([
      asset.key,
      asset.title,
      asset.sectionTitle || asset.sectionId || '-',
      asset.required ? '是' : '否',
      asset.type || 'image',
      status,
      asset.targetDirectory,
      asset.suggestedFileName || '-',
      asset.collectionNote || '-',
    ]));
  }
  markdownLines.push('');
  const markdownPath = path.join(rootDir, '材料收集清单.md');
  fs.writeFileSync(markdownPath, `${markdownLines.join('\n')}\n`, 'utf8');

  return {
    outputDir: rootDir,
    assetsDir,
    manifestPath,
    manifestSchemaPath,
    quoteResolutionPath,
    quoteResolutionSchemaPath,
    markdownPath,
    manifest,
  };
}

function normalizeQuoteResolutionAction(value) {
  const text = String(value || '').trim();
  return text || '';
}

function validateQuoteResolutionActionPayload(selectedAction, projectDataPatch, quoteItemsReplacement, quoteItemsAppend) {
  const errors = [];
  const hasProjectDataPatch = Object.keys(projectDataPatch || {}).length > 0;
  const hasQuoteItemsReplacement = (quoteItemsReplacement || []).length > 0;
  const hasQuoteItemsAppend = (quoteItemsAppend || []).length > 0;
  const hasData = hasProjectDataPatch || hasQuoteItemsReplacement || hasQuoteItemsAppend;
  if (!selectedAction && hasData) {
    errors.push('quote_resolution_action_required_for_data');
  }
  if (selectedAction && !hasData) {
    errors.push(`quote_resolution_action_without_data:${selectedAction}`);
  }
  if (selectedAction === 'confirm_project_total') {
    if (!hasProjectDataPatch) errors.push(`quote_resolution_action_requires_project_data_patch:${selectedAction}`);
    if (hasQuoteItemsReplacement || hasQuoteItemsAppend) errors.push(`quote_resolution_action_forbids_quote_item_changes:${selectedAction}`);
  }
  if (selectedAction === 'add_confirmed_quote_item') {
    if (!hasQuoteItemsAppend) errors.push(`quote_resolution_action_requires_quote_items_append:${selectedAction}`);
    if (hasProjectDataPatch || hasQuoteItemsReplacement) errors.push(`quote_resolution_action_forbids_project_patch_or_replacement:${selectedAction}`);
  }
  if (selectedAction === 'correct_existing_quote_items') {
    if (!hasQuoteItemsReplacement) errors.push(`quote_resolution_action_requires_quote_items_replacement:${selectedAction}`);
    if (hasProjectDataPatch || hasQuoteItemsAppend) errors.push(`quote_resolution_action_forbids_project_patch_or_append:${selectedAction}`);
  }
  return errors;
}

const QUOTE_RESOLUTION_ALLOWED_PROJECT_PATCH_KEYS = new Set(['totalWithTax', 'totalWithoutTax', 'taxPolicy']);

function validateQuoteResolutionProjectDataPatch(projectDataPatch = {}) {
  const errors = [];
  for (const key of Object.keys(projectDataPatch || {})) {
    if (!QUOTE_RESOLUTION_ALLOWED_PROJECT_PATCH_KEYS.has(key)) {
      errors.push(`quote_resolution_forbidden_project_data_patch_field:${key}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(projectDataPatch, 'totalWithTax')) {
    const value = Number(projectDataPatch.totalWithTax);
    if (!Number.isFinite(value) || value <= 0) errors.push('quote_resolution_invalid_project_total_with_tax');
  }
  if (Object.prototype.hasOwnProperty.call(projectDataPatch, 'totalWithoutTax')) {
    const value = Number(projectDataPatch.totalWithoutTax);
    if (!Number.isFinite(value) || value <= 0) errors.push('quote_resolution_invalid_project_total_without_tax');
  }
  if (
    Object.prototype.hasOwnProperty.call(projectDataPatch, 'totalWithTax')
    && Object.prototype.hasOwnProperty.call(projectDataPatch, 'totalWithoutTax')
    && Number(projectDataPatch.totalWithoutTax) > Number(projectDataPatch.totalWithTax)
  ) {
    errors.push('quote_resolution_total_without_tax_exceeds_total_with_tax');
  }
  if (Object.prototype.hasOwnProperty.call(projectDataPatch, 'taxPolicy')) {
    const taxPolicy = projectDataPatch.taxPolicy;
    if (!taxPolicy || typeof taxPolicy !== 'object' || Array.isArray(taxPolicy)) {
      errors.push('quote_resolution_invalid_tax_policy');
    }
  }
  return errors;
}

function validateQuoteResolutionItems(items = [], fieldName = 'quoteItems') {
  const errors = [];
  items.forEach((item, index) => {
    const prefix = `quote_resolution_invalid_${fieldName}:${index}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${prefix}:not_object`);
      return;
    }
    const name = String(item.name || '').trim();
    const brandModel = String(item.brandModel || '').trim();
    const quantity = Number(item.quantity);
    const unitPriceWithTax = Number(item.unitPriceWithTax);
    const totalWithTax = Number(item.totalWithTax);
    if (!name) errors.push(`${prefix}:missing_name`);
    if (!brandModel) errors.push(`${prefix}:missing_brand_model`);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`${prefix}:invalid_quantity`);
    if (!Number.isFinite(unitPriceWithTax) || unitPriceWithTax <= 0) errors.push(`${prefix}:invalid_unit_price_with_tax`);
    if (!Number.isFinite(totalWithTax) || totalWithTax <= 0) errors.push(`${prefix}:invalid_total_with_tax`);
    if (
      Number.isFinite(quantity)
      && Number.isFinite(unitPriceWithTax)
      && Number.isFinite(totalWithTax)
      && Math.abs(Number((quantity * unitPriceWithTax - totalWithTax).toFixed(2))) >= 0.01
    ) {
      errors.push(`${prefix}:row_total_mismatch`);
    }
  });
  return errors;
}

function readQuoteResolutionFile(rootDir, manifest = {}) {
  const filePath = path.join(rootDir, 'quote-resolution.json');
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      applied: false,
      selectedAction: '',
      projectDataPatch: {},
      quoteItemsReplacement: [],
      quoteItemsAppend: [],
      errors: [],
    };
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const selectedAction = normalizeQuoteResolutionAction(parsed.selectedAction);
  const allowedActions = new Set((manifest.quoteResolutionActions || []).map((item) => item.key));
  const errors = [];
  if (Number(parsed.version || 0) !== 1) {
    errors.push(`unsupported_quote_resolution_version:${parsed.version ?? 'missing'}`);
  }
  const parsedTemplateId = String(parsed.templateId || '').trim();
  const manifestTemplateId = String(manifest.templateId || '').trim();
  if (parsedTemplateId && manifestTemplateId && parsedTemplateId !== manifestTemplateId) {
    errors.push(`quote_resolution_template_mismatch:${parsedTemplateId}:${manifestTemplateId}`);
  }
  if (selectedAction && allowedActions.size > 0 && !allowedActions.has(selectedAction)) {
    errors.push(`unsupported_quote_resolution_action:${selectedAction}`);
  }
  const projectDataPatch = parsed.projectDataPatch && typeof parsed.projectDataPatch === 'object' && !Array.isArray(parsed.projectDataPatch)
    ? parsed.projectDataPatch
    : {};
  const quoteItemsReplacement = Array.isArray(parsed.quoteItemsReplacement) ? parsed.quoteItemsReplacement : [];
  const quoteItemsAppend = Array.isArray(parsed.quoteItemsAppend) ? parsed.quoteItemsAppend : [];
  if (!errors.some((error) => error.startsWith('unsupported_quote_resolution_action:'))) {
    errors.push(...validateQuoteResolutionActionPayload(selectedAction, projectDataPatch, quoteItemsReplacement, quoteItemsAppend));
  }
  if (Object.keys(projectDataPatch).length > 0) {
    errors.push(...validateQuoteResolutionProjectDataPatch(projectDataPatch));
  }
  if (quoteItemsAppend.length > 0) {
    errors.push(...validateQuoteResolutionItems(quoteItemsAppend, 'quoteItemsAppend'));
  }
  if (quoteItemsReplacement.length > 0) {
    errors.push(...validateQuoteResolutionItems(quoteItemsReplacement, 'quoteItemsReplacement'));
  }
  const hasData = Object.keys(projectDataPatch).length > 0 || quoteItemsReplacement.length > 0 || quoteItemsAppend.length > 0;
  return {
    path: filePath,
    exists: true,
    applied: Boolean(selectedAction && hasData && errors.length === 0),
    selectedAction,
    projectDataPatch,
    quoteItemsReplacement,
    quoteItemsAppend,
    errors,
  };
}

function applyQuoteResolutionToProject(projectData = {}, quoteItems = [], quoteResolution = {}) {
  const errors = Array.isArray(quoteResolution.errors) ? [...quoteResolution.errors] : [];
  if (!quoteResolution.applied || errors.length > 0) {
    return {
      projectData,
      quoteItems,
      applied: false,
      errors,
      selectedAction: quoteResolution.selectedAction || '',
    };
  }
  const nextProjectData = {
    ...projectData,
    ...(quoteResolution.projectDataPatch || {}),
  };
  let nextQuoteItems = Array.isArray(quoteItems) ? [...quoteItems] : [];
  if ((quoteResolution.quoteItemsReplacement || []).length > 0) {
    nextQuoteItems = quoteResolution.quoteItemsReplacement;
  }
  if ((quoteResolution.quoteItemsAppend || []).length > 0) {
    nextQuoteItems = [...nextQuoteItems, ...quoteResolution.quoteItemsAppend];
  }
  const quoteCheck = validateQuoteTotals(nextProjectData, nextQuoteItems, { validationProfile: {} });
  if (!quoteCheck.passed) {
    const quoteCheckErrors = quoteCheck.errors.map((error) => `quote_resolution_post_apply_quote_check:${error}`);
    return {
      projectData,
      quoteItems,
      applied: false,
      errors: quoteCheckErrors,
      selectedAction: quoteResolution.selectedAction || '',
    };
  }
  return {
    projectData: nextProjectData,
    quoteItems: nextQuoteItems,
    applied: true,
    errors: [],
    selectedAction: quoteResolution.selectedAction || '',
  };
}

function readAssetCollectionPackage(packageDir) {
  const rootDir = path.resolve(packageDir);
  const manifestPath = path.join(rootDir, 'asset-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`材料收集包缺少 asset-manifest.json：${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (Number(manifest.version || 0) !== 1) {
    throw new Error(`unsupported_asset_manifest_version:${manifest.version ?? 'missing'}`);
  }
  const quoteResolution = readQuoteResolutionFile(rootDir, manifest);
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const resolvedAssets = assets.map((asset) => {
    const resolvedTarget = resolveAssetTargetFile(rootDir, asset);
    return {
      key: asset?.key || '',
      title: asset?.title || asset?.key || '',
      sectionId: asset?.sectionId || '',
      required: Boolean(asset?.required),
      type: asset?.type || 'image',
      targetFile: resolvedTarget.targetFile,
      resolvedPath: resolvedTarget.resolvedPath,
      exists: resolvedTarget.exists,
    };
  }).filter((asset) => asset.key);
  return {
    rootDir,
    manifestPath,
    manifestSchemaPath: path.join(rootDir, 'asset-manifest.schema.json'),
    manifest,
    quoteResolution,
    assets: resolvedAssets,
    appliedCount: resolvedAssets.filter((asset) => asset.exists).length,
    missingCount: resolvedAssets.filter((asset) => !asset.exists).length,
    missingRequiredCount: resolvedAssets.filter((asset) => asset.required && !asset.exists).length,
  };
}

function flattenReadinessIssues(readinessReport = {}) {
  const rows = [];
  const blockers = readinessReport.blockers || {};
  for (const [group, errors] of Object.entries(blockers || {})) {
    for (const error of errors || []) {
      rows.push({
        group,
        error,
      });
    }
  }
  if (rows.length > 0) return rows;
  for (const error of readinessReport.buildLog?.errors || readinessReport.build_log?.errors || []) {
    rows.push({
      group: 'buildLog',
      error,
    });
  }
  return rows;
}

function flattenReadinessBlockers(blockers = {}) {
  const rows = [];
  for (const [group, errors] of Object.entries(blockers || {})) {
    for (const error of errors || []) {
      let action = '按错误信息补齐或修正项目配置后重新运行准备度校验。';
      if (group === 'quote') action = '请商务确认分项报价合计、项目总价和是否需要新增/调整报价行。';
      if (group === 'assets') action = '请补齐真实扫描件或图片文件，并更新附件映射路径。';
      if (group === 'demoAssets') action = '请替换 demo sidecar 附件为真实可递交材料，并移除 demoOnly 标记。';
      if (group === 'payment') action = '请按采购文件确认付款节点、比例和关键期限。';
      rows.push([group, error, action]);
    }
  }
  return rows;
}

function buildReadinessReportExcelBuffer(rawReport) {
  const report = normalizeReport(rawReport);
  const checks = report.checks || [];
  const missingAssets = report.missingAssets || [];
  const assetInventory = report.assetInventory || [];
  const quoteItems = report.quoteReconciliation?.items || [];
  const quoteResolutionActions = report.quoteResolutionActions || [];
  const blockers = flattenReadinessBlockers(report.blockers || {});
  const tables = [
    {
      title: '概览',
      rows: [
        ['字段', '值'],
        ['状态', report.ready ? '可正式构建' : '存在阻断项'],
        ['模板', report.templateId || ''],
        ['项目名称', report.projectName || ''],
        ['采购人', report.purchaserName || ''],
        ['供应商', report.supplierName || ''],
        ['分项报价合计', report.quoteTotal],
        ['项目含税总价', report.targetTotal],
        ['报价差额', report.quoteDifference],
        ['演示附件包', report.assetPackage?.demoOnly ? '是' : '否'],
      ],
    },
    {
      title: '报价核对',
      rows: [
        ['序号', '名称', '品牌及型号', '数量', '含税单价', '声明含税合计', '计算含税合计', '行差额', '税率', '类别', '状态'],
        ...(quoteItems.length > 0
          ? quoteItems.map((item) => [
            item.index,
            item.name,
            item.brandModel,
            item.quantity,
            item.unitPriceWithTax,
            item.declaredTotalWithTax,
            item.computedTotalWithTax,
            item.difference,
            item.taxRate,
            item.category,
            item.status === 'passed' ? '通过' : '未通过',
          ])
          : [['无', '无', '无', '', '', '', '', '', '', '', '当前配置未提供分项报价。']]),
        ['合计', '', '', '', '', report.quoteReconciliation?.quoteTotal ?? report.quoteTotal, report.quoteReconciliation?.computedQuoteTotal ?? '', report.quoteReconciliation?.rowDifferenceTotal ?? '', '', '', ''],
        ['项目含税总价', '', '', '', '', report.targetTotal, '', '', '', '', ''],
        ['项目级差额', '', '', '', '', report.quoteDifference, '', '', '', '', ''],
        ...((quoteResolutionActions.length > 0)
          ? [
            ['差额处理建议', '', '', '', '', '', '', '', '', '', ''],
            ...quoteResolutionActions.map((item) => ['', item.title, '', '', '', '', '', '', '', item.key, item.action]),
          ]
          : []),
      ],
    },
    {
      title: '阻断项',
      rows: [
        ['类别', '阻断原因', '处理建议'],
        ...(blockers.length > 0 ? blockers : [['无', '无', '当前无阻断项。']]),
      ],
    },
    {
      title: '附件清单',
      rows: [
        ['Asset Key', '材料名称', '章节', '必填', '类型', '收集状态', '当前路径', '建议文件名', '处理说明'],
        ...(assetInventory.length > 0
          ? assetInventory.map((asset) => [
            asset.key,
            asset.title,
            asset.sectionTitle || asset.sectionId || '',
            asset.required ? '是' : '否',
            asset.type || '',
            asset.status === 'present' ? '已配置' : (asset.status === 'demo_only' ? '演示附件' : (asset.status === 'missing_optional' ? '可选缺失' : '必填缺失')),
            asset.filePath || '',
            asset.suggestedFileName || '',
            asset.collectionNote || '',
          ])
          : [['无', '无', '无', '否', '', '无', '', '', '当前模板未声明附件清单。']]),
      ],
    },
    {
      title: '缺失附件',
      rows: [
        ['Asset Key', '材料名称', '章节', '必填', '当前路径', '处理建议'],
        ...(missingAssets.length > 0
          ? missingAssets.map((asset) => [
            asset.key,
            asset.title,
            asset.sectionId || '',
            asset.required ? '是' : '否',
            asset.filePath || '',
            '提供真实图片或扫描件后更新配置路径。',
          ])
          : [['无', '无', '无', '否', '', '当前无缺失附件。']]),
      ],
    },
    {
      title: '校验项',
      rows: [
        ['校验', '结果', '错误数', '错误详情'],
        ...checks.map((check) => [
          check.key,
          check.status === 'not_run' ? '未运行' : (check.passed ? '通过' : '未通过'),
          check.errors.length,
          (check.errors || []).join('\n'),
        ]),
      ],
    },
  ];
  const sheetNames = tables.map((table, index) => sanitizeSheetName(table.title, `Sheet${index + 1}`));
  const zip = new AdmZip();
  const contentTypeOverrides = sheetNames.map((_name, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypeOverrides}
</Types>`, 'utf-8'));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, 'utf-8'));
  zip.addFile('xl/workbook.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`, 'utf-8'));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetNames.map((_name, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, 'utf-8'));
  zip.addFile('xl/styles.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="12"/><name val="微软雅黑"/></font>
    <font><b/><sz val="12"/><name val="微软雅黑"/></font>
  </fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`, 'utf-8'));
  tables.forEach((table, index) => {
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(worksheetXml(table.rows), 'utf-8'));
  });
  return zip.toBuffer();
}

module.exports = {
  buildAssetInventory,
  applyQuoteResolutionToProject,
  applyDemoAssetPackageGuard,
  createReadinessReport,
  toSnakeReadinessReport,
  classifyReadinessErrors,
  collectReadinessCheckSummaries,
  buildQuoteReconciliation,
  buildQuoteResolutionActions,
  buildReadinessReportExcelBuffer,
  extractReadinessMissingAssets,
  readAssetCollectionPackage,
  renderReadinessReportMarkdown,
  writeAssetCollectionPackage,
};
