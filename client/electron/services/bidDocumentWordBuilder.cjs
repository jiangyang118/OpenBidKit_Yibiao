const fs = require('node:fs');
const path = require('node:path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const {
  validateBidDocumentProject,
  validateDocxContent,
  validateDocxForbiddenWords,
  validateDocxOpenable,
  getEnabledTemplateSections,
  validateImagesInserted,
  validateDocxSectionOrder,
  validateDocxTables,
  validateDocxQuoteIntegrity,
  validateDocxLayout,
  validateDocxPageBreaks,
  validateDocxToc,
  validateDocxStyles,
  validateDocxTechnicalDensity,
  validateDocxAssetPlacement,
  assetShouldEmbedAsImage,
} = require('./bidDocumentValidation.cjs');
const { imageRunTypeForPath } = require('./bidDocumentAssets.cjs');

const TABLE_WIDTH = 9000;
const IMAGE_WIDTH = 430;
const IMAGE_HEIGHT = 300;
const A4_PAGE = {
  width: 11906,
  height: 16838,
  margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
};
function textRun(text, options = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font: 'SimSun',
    size: options.size || 24,
    bold: Boolean(options.bold),
  });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    text: undefined,
    heading: options.heading,
    alignment: options.alignment,
    spacing: { before: options.before || 120, after: options.after || 120, line: 360 },
    children: [textRun(text, options)],
  });
}

function heading(text, level = 1) {
  const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return paragraph(text, { heading: headingLevel, bold: true, size: level === 1 ? 32 : 28, before: 260, after: 160 });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function tableCell(text, options = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    shading: options.header ? { fill: 'EAF1FF', type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [paragraph(text, { bold: options.header, size: 22, before: 0, after: 0 })],
  });
}

function columnWidthsFor(rows) {
  const maxLength = Math.max(1, ...rows.map((row) => row.length));
  const baseWidth = Math.floor(TABLE_WIDTH / maxLength);
  return Array.from({ length: maxLength }, (_item, index) => (index === maxLength - 1 ? TABLE_WIDTH - baseWidth * (maxLength - 1) : baseWidth));
}

function table(rows, header = true) {
  const columnWidths = columnWidthsFor(rows);
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
    rows: rows.map((row, index) => new TableRow({
      tableHeader: header && index === 0,
      children: row.map((cell, cellIndex) => tableCell(cell, { header: header && index === 0, width: columnWidths[cellIndex] })),
    })),
  });
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} 元`;
}

function formatPercentRate(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function taxPolicyText(taxPolicy = {}) {
  const description = String(taxPolicy.description || '').trim();
  if (description) return description;

  const parts = [];
  if (typeof taxPolicy.softwareHardwareRate === 'number') {
    parts.push(`软硬件 ${formatPercentRate(taxPolicy.softwareHardwareRate)}`);
  }
  if (typeof taxPolicy.serviceRate === 'number') {
    parts.push(`实施服务 ${formatPercentRate(taxPolicy.serviceRate)}`);
  }
  if (parts.length) return parts.join('，');
  if (typeof taxPolicy.defaultRate === 'number') {
    return `综合税率 ${formatPercentRate(taxPolicy.defaultRate)}`;
  }
  return '按分项报价表、采购文件及合同约定执行';
}

function assetListForSection(assetMap, sectionId) {
  return Object.values(assetMap || {}).filter((asset) => asset.sectionId === sectionId && asset.filePath);
}

function assetBlocks(assetMap, sectionId) {
  const assets = assetListForSection(assetMap, sectionId);
  const blocks = [];
  for (const asset of assets) {
    blocks.push(pageBreak());
    blocks.push(paragraph(asset.title, { alignment: AlignmentType.CENTER, bold: true, size: 26 }));
    if (!assetShouldEmbedAsImage(asset)) {
      blocks.push(paragraph(`附件原始文件：${path.basename(asset.filePath)}`, { alignment: AlignmentType.CENTER, size: 22 }));
      continue;
    }
    blocks.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [
        new ImageRun({
          type: imageRunTypeForPath(asset.filePath),
          data: fs.readFileSync(asset.filePath),
          transformation: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
          altText: {
            title: asset.title,
            description: asset.title,
            name: asset.key,
          },
        }),
      ],
    }));
  }
  return blocks;
}

function paymentRows(paymentTerms) {
  return [
    ['付款节点', '付款比例', '付款说明'],
    ...(paymentTerms || []).map((term) => [term.stage, `${term.ratio}%`, term.text]),
  ];
}

function quoteRows(quoteItems) {
  return [
    ['序号', '名称', '数量', '品牌及型号', '含税单价', '含税总价'],
    ...(quoteItems || []).map((item, index) => [
      String(index + 1),
      item.name,
      String(item.quantity),
      item.brandModel,
      formatMoney(item.unitPriceWithTax),
      formatMoney(item.totalWithTax),
    ]),
  ];
}

const DEFAULT_CONTENT_PROFILE = {
  qualificationSummary: '营业执照、资质证书、体系认证、信用证明、检测报告及采购文件要求的其他证明材料。',
  projectUnderstanding: '本项目按采购需求、响应范围、交付成果和验收要求组织响应文件，重点保持报价、技术、实施、售后和附件材料一致。',
  architectureRows: [
    ['用户入口层', '管理端、业务端、现场使用端', '覆盖项目相关人员的日常操作入口。'],
    ['采集与执行层', '终端设备、业务表单、现场记录', '支撑业务数据采集、过程执行和结果留痕。'],
    ['业务应用层', '配置管理、业务处理、查询统计、异常处理', '按采购范围组织功能，不扩大合同边界。'],
    ['数据与接口层', '基础档案、业务数据、第三方接口', '接口对接以对方系统开放能力、字段说明、测试账号和权限为前提。'],
    ['安全运维层', '权限、日志、备份、巡检', '保障系统可追溯、可维护、可交接。'],
  ],
  flowRows: [
    ['基础配置', '维护项目基础资料、角色权限和业务规则。', '以合同和采购文件确认范围为准。'],
    ['业务办理', '按业务流程记录申请、处理、审核和结果。', '流程节点可按项目约定配置。'],
    ['数据汇总', '形成业务台账、统计报表和过程记录。', '报表口径以双方确认的数据来源为准。'],
    ['异常处理', '记录异常、处理结果和追溯信息。', '不承诺合同范围外的无限开发。'],
  ],
  keyFunctionRows: [
    ['基础资料管理', '维护项目、人员、组织、设备或服务基础信息。', '按项目实例数据初始化。', '保证后续业务处理口径一致。'],
    ['业务流程管理', '支撑采购文件约定的核心办理流程。', '按合同范围交付。', '提高执行过程规范性。'],
    ['统计报表', '形成项目运行、交付、服务和异常统计。', '报表字段以启用模块和数据来源为准。', '支撑验收和运营复盘。'],
  ],
  interfaceRows: [
    ['人员/组织系统', '对方系统开放接口，提供字段说明、测试账号和权限。', '按合同范围实施基础数据对接。'],
    ['业务系统', '对方明确数据来源、更新频率和字段口径。', '完成约定字段同步或结果回传。'],
    ['财务/支付系统', '对方提供接口文档、联调环境和测试权限。', '不承诺合同范围外的无限开发。'],
  ],
  dataSecurityText: '系统通过账号权限、操作日志、数据备份和运维巡检保障运行可追溯，运维服务按照合同约定范围执行。',
  deliveryResultsText: '交付成果包括系统或产品、基础配置、安装调试记录、培训材料、验收资料和合同约定的附件材料。',
  detailedFunctionsIntro: '详细功能介绍按功能内容、投标响应说明和管理价值/交付边界组织，并与系统截图或产品图片紧邻呈现。',
  supportingEquipmentText: '相关配套产品或服务以分项报价表中的名称、型号、数量和交付范围为准。',
};

const PAGE_BREAK_AFTER = new Set([
  'cover',
  'supplier-and-authorized-representative',
  'toc',
  'quote-detail',
  'authorization-letter',
  'supplier-basic-info',
  'qualification-documents',
  'supporting-equipment',
  'implementation-plan',
  'after-sales-plan',
  'warranty-period',
]);

function contentProfileFor(template = {}) {
  return {
    ...DEFAULT_CONTENT_PROFILE,
    ...(template.contentProfile || {}),
  };
}

function temporaryDocxPathFor(outputPath) {
  const dir = path.dirname(outputPath);
  const ext = path.extname(outputPath) || '.docx';
  const base = path.basename(outputPath, ext);
  return path.join(dir, `${base}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp${ext}`);
}

function backupDocxPathFor(outputPath) {
  const dir = path.dirname(outputPath);
  const ext = path.extname(outputPath) || '.docx';
  const base = path.basename(outputPath, ext);
  return path.join(dir, `${base}.${Date.now()}.${Math.random().toString(36).slice(2)}.bak${ext}`);
}

function finalizeValidatedDocx(tempOutputPath, outputPath) {
  const hadExistingOutput = fs.existsSync(outputPath);
  const backupOutputPath = hadExistingOutput ? backupDocxPathFor(outputPath) : null;
  try {
    if (backupOutputPath) fs.copyFileSync(outputPath, backupOutputPath);
    fs.copyFileSync(tempOutputPath, outputPath);
    fs.rmSync(tempOutputPath, { force: true });
    if (backupOutputPath) fs.rmSync(backupOutputPath, { force: true });
  } catch (error) {
    if (backupOutputPath && fs.existsSync(backupOutputPath)) {
      try { fs.copyFileSync(backupOutputPath, outputPath); } catch {}
      try { fs.rmSync(backupOutputPath, { force: true }); } catch {}
    } else if (!hadExistingOutput) {
      try { fs.rmSync(outputPath, { force: true }); } catch {}
    }
    try { fs.rmSync(tempOutputPath, { force: true }); } catch {}
    throw error;
  }
}

function withHeader(header, rows = []) {
  return [header, ...(Array.isArray(rows) ? rows : [])];
}

function renderCover({ template, projectData }) {
  return [
    paragraph(template.documentTitle || '响应文件', { alignment: AlignmentType.CENTER, bold: true, size: 44, before: 3000, after: 400 }),
    paragraph(projectData.projectName, { alignment: AlignmentType.CENTER, bold: true, size: 32, before: 200, after: 300 }),
    paragraph(`采购人：${projectData.purchaserName}`, { alignment: AlignmentType.CENTER, size: 26 }),
    paragraph(`供应商：${projectData.supplierName}`, { alignment: AlignmentType.CENTER, size: 26 }),
    paragraph(`日期：${new Date().toISOString().slice(0, 10)}`, { alignment: AlignmentType.CENTER, size: 24, before: 500 }),
  ];
}

function renderSupplierRepresentative(section, { template, projectData }) {
  return [
    heading(section.title, section.level || 1),
    table([
      ['项目', '内容'],
      ['项目名称', projectData.projectName],
      ['采购人', projectData.purchaserName],
      ['供应商', projectData.supplierName],
      ['文件类型', template.documentTitle || '响应文件'],
    ]),
  ];
}

function renderToc(section) {
  return [
    heading(section.title || '目录', 1),
    new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' }),
  ];
}

function renderQuoteSummary(section, { projectData }) {
  return [
    heading(section.title, section.level || 1),
    table([
      ['项目', '响应内容'],
      ['项目名称', projectData.projectName],
      ['供应商', projectData.supplierName],
      ['报价含税总价', formatMoney(projectData.totalWithTax)],
      ['不含税金额', formatMoney(projectData.totalWithoutTax)],
      ['税率口径', taxPolicyText(projectData.taxPolicy)],
    ]),
    paragraph('付款方式：', { bold: true }),
    table(paymentRows(projectData.paymentTerms)),
  ];
}

function renderQuoteDetail(section, { quoteItems }) {
  return [
    heading(section.title, section.level || 2),
    table(quoteRows(quoteItems)),
  ];
}

function renderSupplierBasicInfo(section, input, profile) {
  const { projectData, assetMap } = input;
  return [
    heading(section.title, section.level || 1),
    table([
      ['项目', '内容'],
      ['供应商名称', projectData.supplierName],
      ['响应项目', projectData.projectName],
      ['资质材料', profile.qualificationSummary],
    ]),
    ...assetBlocks(assetMap, 'supplier-basic-info'),
  ];
}

function templateHasSection(template = {}, sectionId) {
  return (template.sections || []).some((section) => section.id === sectionId);
}

function renderTechnicalHeading(section, input) {
  const blocks = [heading(section.title, section.level || 1)];
  if (!templateHasSection(input.template, 'detailed-functions')) {
    blocks.push(...assetBlocks(input.assetMap, 'technical-solution'));
  }
  return blocks;
}

function renderKnownSection(section, input, profile) {
  const { projectData, quoteItems, assetMap } = input;
  switch (section.id) {
    case 'cover':
      return renderCover(input);
    case 'supplier-and-authorized-representative':
      return renderSupplierRepresentative(section, input);
    case 'toc':
      return renderToc(section);
    case 'quote-summary':
      return renderQuoteSummary(section, input);
    case 'quote-detail':
      return renderQuoteDetail(section, input);
    case 'legal-representative-id':
      return [
        heading(section.title, section.level || 1),
        paragraph(`供应商 ${projectData.supplierName} 按采购文件要求提交法定代表人身份证明文件，相关身份信息以正式签章页和证件扫描件为准。`),
      ];
    case 'authorization-letter':
      return [
        heading(section.title, section.level || 1),
        paragraph(`${projectData.supplierName} 按采购文件授权代表参与本项目响应文件签署、递交、澄清和合同洽谈等事项。`),
      ];
    case 'supplier-basic-info':
      return renderSupplierBasicInfo(section, input, profile);
    case 'qualification-documents':
      return [
        heading(section.title, section.level || 1),
        paragraph('供应商资格证明文件按采购文件要求组织，资质、信用、认证、检测报告和承诺材料均以本响应文件附件及签章材料为准。'),
      ];
    case 'technical-solution':
      return renderTechnicalHeading(section, input);
    case 'project-understanding':
      return [heading(section.title, section.level || 2), paragraph(profile.projectUnderstanding)];
    case 'overall-architecture':
      return [heading(section.title, section.level || 2), table(withHeader(['层级', '建设内容', '投标响应说明'], profile.architectureRows))];
    case 'core-business-flow':
      return [heading(section.title, section.level || 2), table(withHeader(['流程', '功能内容', '交付边界'], profile.flowRows))];
    case 'key-function-design':
      return [heading(section.title, section.level || 2), table(withHeader(['功能模块', '功能内容', '投标响应说明', '管理价值/交付边界'], profile.keyFunctionRows))];
    case 'third-party-interface-boundary':
      return [heading(section.title, section.level || 2), table(withHeader(['接口类别', '前置条件', '交付边界'], profile.interfaceRows))];
    case 'data-security-operations':
      return [heading(section.title, section.level || 2), paragraph(profile.dataSecurityText)];
    case 'delivery-results':
      return [heading(section.title, section.level || 2), paragraph(profile.deliveryResultsText)];
    case 'detailed-functions':
      return [
        heading(section.title, section.level || 2),
        paragraph(profile.detailedFunctionsIntro),
        ...assetBlocks(assetMap, 'technical-solution'),
      ];
    case 'function-parameter-response':
      return [heading(section.title, section.level || 2), table(quoteRows(quoteItems))];
    case 'supporting-equipment':
      return [heading(section.title, section.level || 2), paragraph(profile.supportingEquipmentText)];
    case 'implementation-plan':
      return [
        heading(section.title, section.level || 1),
        table([
          ['阶段', '工作内容', '交付结果'],
          ['启动准备', '项目启动、现场确认、计划排期。', '实施计划和现场确认记录。'],
          ['安装调试', '设备安装、系统配置、基础数据初始化。', '可运行的系统和设备联调记录。'],
          ['试运行', '业务验证、问题修正、用户培训。', '试运行问题闭环和培训记录。'],
          ['验收交付', '按合同和采购要求组织验收。', '验收资料和运维交接材料。'],
        ]),
      ];
    case 'after-sales-plan':
      return [heading(section.title, section.level || 1), paragraph('供应商提供电话、远程和现场相结合的售后服务，响应方式、响应时间和服务范围按合同约定执行。')];
    case 'warranty-period':
      return [heading(section.title, section.level || 1), paragraph('质保期及质保金支付按照采购文件、合同和本响应文件付款条款执行。')];
    case 'other-materials':
      return [
        heading(section.title, section.level || 1),
        ...(!templateHasSection(input.template, 'contract-case-proof') ? assetBlocks(assetMap, 'other-materials') : []),
      ];
    case 'contract-case-proof':
      return [
        heading(section.title, section.level || 2),
        paragraph('合同案例证明以本项目提供的正式扫描件为准。'),
        ...assetBlocks(assetMap, 'other-materials'),
      ];
    case 'backup-service':
      return [heading(section.title, section.level || 2), paragraph('项目后备服务包括远程支持、备件协调、人员调度和运维记录归档，按合同范围和实际运行情况执行。')];
    default:
      return [
        heading(section.title, section.level || 1),
        paragraph('本节按照模板包要求组织响应内容，具体材料以项目实例数据、附件和签章文件为准。'),
        ...assetBlocks(assetMap, section.id),
      ];
  }
}

function buildDocumentChildren(input) {
  const { template = {}, projectData = {} } = input;
  const sections = getEnabledTemplateSections(template, projectData);
  const profile = contentProfileFor(template);
  const children = [];

  sections.forEach((section, index) => {
    children.push(...renderKnownSection(section, input, profile));
    if (PAGE_BREAK_AFTER.has(section.id) && index < sections.length - 1) {
      children.push(pageBreak());
    }
  });

  return children;
}

function createBidDocumentDocx(input) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'SimSun', size: 24 },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: A4_PAGE.width,
            height: A4_PAGE.height,
          },
          margin: A4_PAGE.margin,
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [textRun('第 '), new TextRun({ children: [PageNumber.CURRENT] }), textRun(' 页')],
            }),
          ],
        }),
      },
      children: buildDocumentChildren(input),
    }],
  });
}

async function buildBidDocumentWordBuffer(input = {}) {
  const preflight = validateBidDocumentProject(input);
  if (!preflight.passed) {
    return { success: false, buildLog: preflight, buffer: null };
  }
  const doc = createBidDocumentDocx(input);
  const buffer = await Packer.toBuffer(doc);
  return { success: true, buildLog: preflight, buffer };
}

async function writeBidDocumentWordFile(input = {}, outputPath) {
  const result = await buildBidDocumentWordBuffer(input);
  if (!result.success) {
    return { success: false, buildLog: result.buildLog, filePath: outputPath, bytes: 0 };
  }
  const tempOutputPath = temporaryDocxPathFor(outputPath);
  fs.writeFileSync(tempOutputPath, result.buffer);
  const docxOpenCheck = validateDocxOpenable(tempOutputPath);
  const docxContentCheck = validateDocxContent(tempOutputPath, input);
  const docxSectionOrderCheck = validateDocxSectionOrder(tempOutputPath, input);
  const docxTableCheck = validateDocxTables(tempOutputPath, input);
  const docxQuoteIntegrityCheck = validateDocxQuoteIntegrity(tempOutputPath, input);
  const docxLayoutCheck = validateDocxLayout(tempOutputPath);
  const docxTocCheck = validateDocxToc(tempOutputPath, input);
  const docxStyleCheck = validateDocxStyles(tempOutputPath, input);
  const docxTechnicalDensityCheck = validateDocxTechnicalDensity(tempOutputPath, input);
  const docxPageBreakCheck = validateDocxPageBreaks(tempOutputPath, input);
  const imageInsertionCheck = validateImagesInserted(tempOutputPath, input.assetMap, input);
  const docxAssetPlacementCheck = validateDocxAssetPlacement(tempOutputPath, input.assetMap, input);
  const docxForbiddenWordsCheck = validateDocxForbiddenWords(tempOutputPath);
  const errors = [
    ...(result.buildLog.errors || []),
    ...(docxOpenCheck.errors || []),
    ...(docxContentCheck.errors || []),
    ...(docxSectionOrderCheck.errors || []),
    ...(docxTableCheck.errors || []),
    ...(docxQuoteIntegrityCheck.errors || []),
    ...(docxLayoutCheck.errors || []),
    ...(docxTocCheck.errors || []),
    ...(docxStyleCheck.errors || []),
    ...(docxTechnicalDensityCheck.errors || []),
    ...(docxPageBreakCheck.errors || []),
    ...(imageInsertionCheck.errors || []),
    ...(docxAssetPlacementCheck.errors || []),
    ...(docxForbiddenWordsCheck.errors || []),
  ];
  const buildLog = {
    ...result.buildLog,
    docxOpenCheck,
    docxContentCheck,
    docxSectionOrderCheck,
    docxTableCheck,
    docxQuoteIntegrityCheck,
    docxLayoutCheck,
    docxTocCheck,
    docxStyleCheck,
    docxTechnicalDensityCheck,
    docxPageBreakCheck,
    imageInsertionCheck,
    docxAssetPlacementCheck,
    docxForbiddenWordsCheck,
    passed: errors.length === 0,
    errors,
    outputPath,
  };
  if (!buildLog.passed) {
    try { fs.rmSync(tempOutputPath, { force: true }); } catch {}
    return { success: false, buildLog, filePath: outputPath, bytes: 0 };
  }
  finalizeValidatedDocx(tempOutputPath, outputPath);
  return { success: true, buildLog, filePath: outputPath, bytes: result.buffer.length };
}

module.exports = {
  buildBidDocumentWordBuffer,
  createBidDocumentDocx,
  writeBidDocumentWordFile,
};
