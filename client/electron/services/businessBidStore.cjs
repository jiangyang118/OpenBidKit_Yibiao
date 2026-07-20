const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { dialog } = require('electron');
const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const { getWorkspaceDir } = require('../utils/paths.cjs');

const categoryLabels = {
  payment: '付款与结算',
  bond: '保证金/保函',
  quote: '报价要求',
  contract: '合同条款',
  qualification: '资信材料',
  schedule: '工期/服务期',
  other: '其他商务要求',
};

const categoryKeywords = [
  { category: 'payment', keywords: ['付款', '支付', '结算', '进度款', '验收后', '发票', '付款方式', '税率'] },
  { category: 'bond', keywords: ['履约保证金', '保证金', '保函', '担保'] },
  { category: 'quote', keywords: ['报价', '最高限价', '控制价', '投标报价', '分项报价', '报价一览表', '含税投标单价', '含税投标总价'] },
  { category: 'contract', keywords: ['合同', '违约', '质保', '保修', '验收', '合同条款', '售后服务', '维护服务'] },
  { category: 'qualification', keywords: ['资格', '资质', '证书', '业绩', '证明材料', '授权书', '法定代表人', '授权委托书', '营业执照', '承诺函', '信用中国', '中国政府采购网', '软著', '软件著作权', '专利', 'CNAS', '检测报告', '公章', '签章'] },
  { category: 'schedule', keywords: ['工期', '服务期', '交付期', '完成时间', '实施周期', '供货期'] },
];

const fullResponseTemplateItems = [
  { title: '封面与项目信息', purpose: '形成响应文件首页，填写项目名称、采购人、供应商、授权代表和日期。', output: '封面、项目基本信息' },
  { title: '报价一览表', purpose: '响应总价、税率、付款方式和盖章签字要求。', output: '报价一览表' },
  { title: '分项报价表', purpose: '按设备和系统逐项列明数量、品牌型号、单价和总价。', output: '分项报价表' },
  { title: '法定代表人身份证明', purpose: '证明供应商法定代表人身份并附身份证明文件。', output: '法定代表人身份证明' },
  { title: '法定代表人授权委托书', purpose: '明确授权代表、授权范围和签署责任。', output: '授权委托书' },
  { title: '供应商基本情况表', purpose: '汇总营业执照、体系认证、专利软著、信用和资质证书。', output: '基本情况表及证书清单' },
  { title: '供应商资格证明文件', purpose: '逐项响应资格要求并提供承诺函、网页截图和证明材料。', output: '资格证明文件' },
  { title: '商务响应与合同条款', purpose: '对付款、发票、质保、服务期、合同和偏离条款进行确认。', output: '商务响应表、合同条款偏离表' },
  { title: '技术方案', purpose: '承接技术方案正文，覆盖系统功能、设备配置、实施、培训、售后和质保。', output: '技术方案正文' },
  { title: '图文证据与功能截图', purpose: '按成熟智慧食堂方案写法，将后台、移动端、消费终端、称重绑盘设备、架构图、报表图和检测报告正文匹配到对应技术章节。', output: '图文证据核对清单、截图/设备图/报告正文附件' },
  { title: '部署安全与接口对接', purpose: '补齐部署拓扑、网络安全、权限控制、数据安全、日志审计、第三方系统接口和迁移运维说明。', output: '部署安全方案、接口对接说明' },
  { title: '合同案例证明', purpose: '补充类似项目业绩、合同案例和项目证明材料。', output: '业绩及合同案例证明' },
  { title: '附件清单', purpose: '列明报价、资信、合同、保证金和其他附件的准备状态。', output: '附件总清单' },
];

const supplierProfileDefaults = {
  supplierName: '北京康比特体育科技股份有限公司',
  projectName: '智慧餐厅称重系统改造',
  purchaserName: '北京蓝色港湾科技有限责任公司',
  companyNature: '民营上市公司',
  address: '北京市昌平区科技园区利祥路5号',
  establishedAt: '2001 年 5 月 16 日',
  operatingPeriod: '长期',
  legalRepresentative: '白厚增',
  legalRepresentativeTitle: '董事长',
};

const deviationTypes = new Set(['none', 'positive', 'negative', 'pending']);
const riskLevels = new Set(['low', 'medium', 'high']);
const attachmentKinds = new Set(['quote', 'qualification', 'contract', 'bond', 'other']);
const attachmentStatuses = new Set(['pending', 'ready', 'missing']);

const attachmentKindLabels = {
  quote: '报价附件',
  qualification: '资信证明',
  contract: '合同附件',
  bond: '保证金/保函',
  other: '其他附件',
};

const attachmentStatusLabels = {
  pending: '待补充',
  ready: '已就绪',
  missing: '缺失待补',
};

function now() {
  return new Date().toISOString();
}

function stableHash(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDeviationType(value) {
  return deviationTypes.has(value) ? value : 'pending';
}

function normalizeRiskLevel(value) {
  return riskLevels.has(value) ? value : 'medium';
}

function normalizeAttachmentKind(value) {
  return attachmentKinds.has(value) ? value : 'other';
}

function normalizeAttachmentStatus(value) {
  return attachmentStatuses.has(value) ? value : 'pending';
}

function normalizeCategory(value) {
  return categoryLabels[value] ? value : 'other';
}

function normalizeParagraph(line) {
  return String(line || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)、]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(markdown) {
  return String(markdown || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n+/)
    .map(normalizeParagraph)
    .filter((line) => line.length >= 8 && line.length <= 900);
}

function inferCategory(text) {
  for (const item of categoryKeywords) {
    if (item.keywords.some((keyword) => text.includes(keyword))) return item.category;
  }
  return 'other';
}

function inferRiskLevel(category, text) {
  if (/(必须|不得|否则|废标|无效|实质性|违约|保证金|保函)/.test(text)) return 'high';
  if (category === 'contract' || category === 'payment' || category === 'qualification') return 'medium';
  return 'low';
}

function inferMaterialRequirement(category, text) {
  if (category === 'bond') return '补充保证金缴纳方式、保函开具机构、金额和有效期。';
  if (category === 'quote') return '补充报价一览表、分项报价表、报价说明、税率、付款方式和签字盖章页。';
  if (category === 'qualification') return '补充营业执照、体系认证、软著专利、CNAS/检测报告、授权委托书、承诺函、信用截图、业绩证明等资信材料。';
  if (category === 'payment') return '补充付款节点响应、发票类型和结算资料。';
  if (category === 'schedule') return '补充交付计划、服务周期和关键里程碑承诺。';
  if (/质保|保修/.test(text)) return '补充质保期、售后服务承诺和联系人。';
  return '按招标文件要求补充对应证明或承诺材料。';
}

function createClauseId(category, text, index) {
  const hash = stableHash(`${category}\n${text}`).slice(0, 16);
  return `business-${String(index + 1).padStart(3, '0')}-${hash}`;
}

function createAttachmentId(filePath, index) {
  const hash = stableHash(`${filePath}\n${Date.now()}\n${index}`).slice(0, 16);
  return `business-attachment-${hash}`;
}

function sanitizeFileName(value) {
  return String(value || 'attachment')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'attachment';
}

function getBusinessBidWorkspaceRoot(options = {}) {
  if (options.workspaceRoot) return options.workspaceRoot;
  const app = options.app;
  if (app?.getPath) return getWorkspaceDir(app);
  throw new Error('商务标附件工作区未初始化');
}

function toWorkspaceRelativePath(absolutePath, workspaceRoot) {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
}

function resolveWorkspacePath(relativePath, workspaceRoot) {
  return path.join(workspaceRoot, String(relativePath || '').replace(/\//g, path.sep));
}

function extractBusinessClauses(markdown, options = {}) {
  const paragraphs = splitParagraphs(markdown);
  const seen = new Set();
  const clauses = [];
  const sourceHint = String(options.sourceHint || '技术方案招标文件');

  for (const paragraph of paragraphs) {
    const category = inferCategory(paragraph);
    if (category === 'other' && !/(商务|响应|偏离|报价|合同|资信|资格|付款|保证金|服务期|工期|响应文件|投标文件|授权|承诺函|盖章|签章|证书|证明|检测报告)/.test(paragraph)) {
      continue;
    }
    const signature = stableHash(paragraph).slice(0, 20);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const riskLevel = inferRiskLevel(category, paragraph);
    clauses.push({
      id: createClauseId(category, paragraph, clauses.length),
      category,
      label: categoryLabels[category],
      originalText: paragraph,
      responseText: '响应招标文件要求，具体商务承诺以投标文件最终确认内容为准。',
      deviationType: riskLevel === 'high' ? 'pending' : 'none',
      riskLevel,
      materialRequirement: inferMaterialRequirement(category, paragraph),
      owner: '',
      confirmedBy: '',
      confirmed: false,
      sourceHint,
      sortOrder: clauses.length,
      updatedAt: now(),
    });
    if (clauses.length >= 120) break;
  }

  return clauses;
}

function buildBusinessBidExtractionMessages(markdown, ruleClauses = []) {
  const rulePreview = ruleClauses.slice(0, 30).map((clause, index) => ({
    index: index + 1,
    category: clause.category,
    originalText: clause.originalText,
    riskLevel: clause.riskLevel,
    materialRequirement: clause.materialRequirement,
  }));
  return [
    {
      role: 'system',
      content: [
        '你是投标商务标专家，负责从招标文件中抽取商务响应矩阵。',
        '只返回 JSON，不要输出 Markdown、解释或前后缀。',
        '字段枚举：category 只能是 payment、bond、quote、contract、qualification、schedule、other；deviationType 只能是 none、positive、negative、pending；riskLevel 只能是 low、medium、high。',
        '每条 clause 必须保留招标文件原文依据，并给出投标文件需要响应的文字、待补充材料和风险等级。',
        '必须覆盖响应文件格式、报价表、分项报价表、法定代表人身份证明、授权委托书、供应商基本情况、资格证明、承诺函、证书、检测报告、业绩证明、商务合同条款等整标模板要求。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于下面招标文件 Markdown 抽取商务响应矩阵和整标模板缺口。',
        '',
        '输出 JSON 格式：',
        '{"clauses":[{"category":"payment","originalText":"条款原文","responseText":"建议响应内容","deviationType":"pending","riskLevel":"medium","materialRequirement":"待补充材料","sourceHint":"原文位置或章节线索"}]}',
        '',
        '规则提取初稿可作为参考，但你需要补充遗漏、合并重复，并修正分类和风险：',
        JSON.stringify(rulePreview, null, 2),
        '',
        '招标文件 Markdown：',
        String(markdown || '').slice(0, 90000),
      ].join('\n'),
    },
  ];
}

function normalizeAiBusinessClauses(payload, options = {}) {
  const sourceHint = String(options.sourceHint || 'AI 结构化提取');
  const rows = Array.isArray(payload?.clauses) ? payload.clauses : [];
  const seen = new Set();
  const clauses = [];
  for (const row of rows) {
    const originalText = normalizeParagraph(row?.originalText || row?.original_text || row?.requirement || row?.text);
    if (!originalText) continue;
    const signature = stableHash(originalText).slice(0, 20);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const category = normalizeCategory(row?.category);
    const riskLevel = normalizeRiskLevel(row?.riskLevel || row?.risk_level);
    const deviationType = normalizeDeviationType(row?.deviationType || row?.deviation_type);
    clauses.push({
      id: createClauseId(category, originalText, clauses.length),
      category,
      label: categoryLabels[category],
      originalText,
      responseText: normalizeParagraph(row?.responseText || row?.response_text || row?.response) || '响应招标文件要求，具体商务承诺以投标文件最终确认内容为准。',
      deviationType,
      riskLevel,
      materialRequirement: normalizeParagraph(row?.materialRequirement || row?.material_requirement || row?.materials) || inferMaterialRequirement(category, originalText),
      owner: '',
      confirmedBy: '',
      confirmed: false,
      sourceHint: normalizeParagraph(row?.sourceHint || row?.source_hint) || sourceHint,
      sortOrder: clauses.length,
      updatedAt: now(),
    });
    if (clauses.length >= 80) break;
  }
  return clauses;
}

function validateAiBusinessClauses(clauses) {
  if (!Array.isArray(clauses) || !clauses.length) {
    throw new Error('AI 未返回可用商务条款');
  }
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim() || '-';
}

function getBusinessBidDeliveryTables(state) {
  const clauses = Array.isArray(state?.clauses) ? state.clauses : [];
  return [
    { title: '商务响应表', rows: clauses },
    { title: '合同条款偏离表', rows: clauses.filter((clause) => clause.category === 'contract' || clause.deviationType !== 'none') },
    { title: '资信证明材料清单', rows: clauses.filter((clause) => clause.category === 'qualification') },
    { title: '报价附件清单', rows: clauses.filter((clause) => clause.category === 'quote') },
  ];
}

const deliveryTableHeaders = ['序号', '分类', '条款原文', '响应内容', '偏离类型', '风险等级', '待补充材料', '负责人', '确认人', '确认状态'];
const attachmentTableHeaders = ['序号', '附件类型', '文件名', '状态', '负责人', '大小', '备注'];

function formatClauseCells(clause, index) {
  return [
    index + 1,
    clause.label || categoryLabels[normalizeCategory(clause.category)],
    clause.originalText,
    clause.responseText,
    clause.deviationType,
    clause.riskLevel,
    clause.materialRequirement,
    clause.owner,
    clause.confirmedBy,
    clause.confirmed ? '已确认' : '待确认',
  ];
}

function buildClauseTable(clauses) {
  if (!clauses.length) {
    return '暂无记录。';
  }
  const rows = clauses.map((clause, index) => `| ${formatClauseCells(clause, index).map(escapeMarkdownTableCell).join(' | ')} |`);
  return [
    `| ${deliveryTableHeaders.join(' | ')} |`,
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '-';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function formatAttachmentCells(attachment, index) {
  return [
    index + 1,
    attachmentKindLabels[normalizeAttachmentKind(attachment.kind)],
    attachment.fileName,
    attachmentStatusLabels[normalizeAttachmentStatus(attachment.status)],
    attachment.owner,
    formatFileSize(attachment.fileSize),
    attachment.note,
  ];
}

function buildAttachmentTable(attachments) {
  if (!attachments.length) {
    return '暂无独立附件。';
  }
  const rows = attachments.map((attachment, index) => `| ${formatAttachmentCells(attachment, index).map(escapeMarkdownTableCell).join(' | ')} |`);
  return [
    `| ${attachmentTableHeaders.join(' | ')} |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildBusinessBidReportMarkdown(state) {
  const source = state?.source;
  const clauses = Array.isArray(state?.clauses) ? state.clauses : [];
  const attachments = Array.isArray(state?.attachments) ? state.attachments : [];
  const deliveryTables = getBusinessBidDeliveryTables(state);
  const confirmedCount = clauses.filter((clause) => clause.confirmed).length;
  const pendingCount = clauses.length - confirmedCount;
  const highRiskCount = clauses.filter((clause) => clause.riskLevel === 'high').length;
  const missingAttachmentCount = attachments.filter((attachment) => attachment.status === 'missing').length;

  return [
    '# 响应文件商务与模板核对包',
    '',
    '## 基本信息',
    '',
    `- 来源文件：${source?.fileName || '未记录'}`,
    `- 来源类型：${source?.type || '未记录'}`,
    `- 生成时间：${source?.generatedAt || '未记录'}`,
    `- 条款总数：${clauses.length}`,
    `- 已确认：${confirmedCount}`,
    `- 待确认：${pendingCount}`,
    `- 高风险：${highRiskCount}`,
    `- 独立附件：${attachments.length}`,
    `- 缺失附件：${missingAttachmentCount}`,
    '',
    '## 整标模板核对清单',
    '',
    '| 序号 | 整标模块 | 用途 | 输出内容 |',
    '| --- | --- | --- | --- |',
    ...formatFullResponseTemplateRows().map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`),
    '',
    ...deliveryTables.flatMap((table) => [`## ${table.title}`, '', buildClauseTable(table.rows), '']),
    '## 独立附件清单',
    '',
    buildAttachmentTable(attachments),
    '',
    '',
    '## 处理建议',
    '',
    highRiskCount > 0 ? '- 存在高风险商务条款，提交前需要逐条复核并确认响应口径。' : '- 暂未发现高风险商务条款。',
    pendingCount > 0 ? '- 仍有待确认条款，建议在导出正式商务标前完成确认。' : '- 所有识别条款均已确认。',
    missingAttachmentCount > 0 ? '- 存在缺失附件，请在正式导出前补齐或标记处理口径。' : '- 独立附件清单暂无缺失项。',
    '',
  ].join('\n');
}

function createDocxParagraph(text, options = {}) {
  return new Paragraph({
    ...options,
    children: [new TextRun({ text: String(text ?? ''), font: '宋体', size: 21, bold: Boolean(options.bold) })],
  });
}

function createDocxTableCell(value, options = {}) {
  return new TableCell({
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    shading: options.header ? { fill: 'EEF3FA' } : undefined,
    children: [
      new Paragraph({
        alignment: options.header ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: String(value ?? '-') || '-', font: '宋体', size: 18, bold: Boolean(options.header) })],
      }),
    ],
  });
}

function createDocxTable(rows) {
  const tableRows = [
    new TableRow({ children: deliveryTableHeaders.map((header) => createDocxTableCell(header, { header: true })) }),
    ...rows.map((clause, index) => new TableRow({
      children: formatClauseCells(clause, index).map((value) => createDocxTableCell(value)),
    })),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
    },
    rows: rows.length ? tableRows : [
      tableRows[0],
      new TableRow({ children: [createDocxTableCell('暂无记录。')] }),
    ],
  });
}

function createDocxAttachmentTable(rows) {
  const tableRows = [
    new TableRow({ children: attachmentTableHeaders.map((header) => createDocxTableCell(header, { header: true })) }),
    ...rows.map((attachment, index) => new TableRow({
      children: formatAttachmentCells(attachment, index).map((value) => createDocxTableCell(value)),
    })),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
    },
    rows: rows.length ? tableRows : [
      tableRows[0],
      new TableRow({ children: [createDocxTableCell('暂无独立附件。')] }),
    ],
  });
}

function createSimpleDocxTable(headers, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D0D7DE' },
    },
    rows: [
      new TableRow({ children: headers.map((header) => createDocxTableCell(header, { header: true })) }),
      ...(safeRows.length ? safeRows : [headers.map(() => '')]).map((row) => new TableRow({
        children: row.map((value) => createDocxTableCell(value)),
      })),
    ],
  });
}

function createDocxHeading(text, level = 1) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: '宋体', size: level === 1 ? 26 : 23, bold: true })],
  });
}

function formatFullResponseTemplateRows() {
  return fullResponseTemplateItems.map((item, index) => [
    index + 1,
    item.title,
    item.purpose,
    item.output,
  ]);
}

function getTechnicalPlanLeafRows(technicalPlan) {
  const outline = Array.isArray(technicalPlan?.outlineData?.outline) ? technicalPlan.outlineData.outline : [];
  const rows = [];
  function visit(items, pathParts = []) {
    for (const item of items || []) {
      const title = String(item?.title || '').trim();
      const pathText = [...pathParts, title].filter(Boolean).join(' / ');
      if (String(item?.content || '').trim()) {
        rows.push([
          rows.length + 1,
          pathText,
          String(item.content || '').trim().slice(0, 180),
        ]);
      }
      if (Array.isArray(item?.children) && item.children.length) visit(item.children, [...pathParts, title]);
    }
  }
  visit(outline);
  return rows;
}

function createQualificationRows(clauses) {
  const qualificationClauses = clauses.filter((clause) => clause.category === 'qualification').slice(0, 20);
  const baseRows = [
    ['营业执照', '提供营业执照复印件并加盖公章', '待核对附件'],
    ['质量管理体系认证', '提供 ISO9001 等体系认证文件', '待核对附件'],
    ['信息技术服务管理/信息安全认证', '提供 ISO20000、ISO27001 等相关证书', '待核对附件'],
    ['软件著作权、专利及产品资质', '提供与智慧食堂、营养管理、移动端、人脸安全相关证明', '待核对附件'],
    ['检测报告及 CNAS 相关证明', '提供软件和硬件检测报告原文或可核验文件', '待核对附件'],
    ['类似项目业绩', '提供合同案例、验收或项目证明材料', '待核对附件'],
  ];
  for (const clause of qualificationClauses) {
    baseRows.push([
      clause.label || categoryLabels.qualification,
      clause.originalText,
      clause.materialRequirement || '按原文补充证明材料',
    ]);
  }
  return baseRows;
}

function createQuoteRows() {
  return [
    ['智慧食堂管理系统含手机端', '1', '待填写', '待填写', '待填写'],
    ['智能称重设备', '30', '待填写', '待填写', '待填写'],
    ['智能绑盘机', '1', '待填写', '待填写', '待填写'],
    ['双屏消费机', '3', '待填写', '待填写', '待填写'],
    ['称重消费机', '1', '待填写', '待填写', '待填写'],
    ['托盘', '400', '待填写', '待填写', '待填写'],
  ];
}

function createVisualEvidenceRows() {
  return [
    ['总体方案与系统架构', '总体架构图、部署拓扑图、软硬件组成图', '应从方案资料或图片知识库中匹配真实架构图；无图时列为待补，不使用概念性占位图替代'],
    ['后台管理功能', '多食堂、档口、设备、会员、钱包、补贴、报表等后台截图', '每类核心功能至少匹配关键页面截图或操作说明，避免只写文字功能描述'],
    ['手机端与线上订餐', '移动端首页、菜品展示、订餐、营养健康、支付或消息页面截图', '图片标题使用最终投标材料口径，不暴露导入来源、原始素材或 AI 生成痕迹'],
    ['消费终端与设备场景', '双屏消费机、称重台、称重消费机、绑盘机、托盘、电子价签等产品图和界面图', '核对投标型号；同系列但型号不同的检测报告只能标记待补同型号报告'],
    ['营养健康与数据报表', '营养分析、订单统计、消费统计、补贴统计、经营驾驶舱等报表图', '正文按业务指标、统计口径、管理价值和截图证据组织'],
    ['检测报告与证书资质', '软件 CNAS/CMA 检测报告正文、硬件检测报告、软著、专利、营业执照、体系认证、团队人员证书', '报告必须引用测试范围、测试环境、测试方法、测试结论或关键指标；封面和证书图片仅作附件页'],
    ['厂家盖章与承诺文件', '厂家盖章功能证明、授权函、参数确认文件、产品彩页、功能清单', '从知识库或附件库匹配正式文件；缺失时标记待补盖章文件，不在正文中编造成已提供'],
  ];
}

async function buildBusinessBidWordBuffer(state, options = {}) {
  const source = state?.source || {};
  const clauses = Array.isArray(state?.clauses) ? state.clauses : [];
  const attachments = Array.isArray(state?.attachments) ? state.attachments : [];
  const confirmedCount = clauses.filter((clause) => clause.confirmed).length;
  const highRiskCount = clauses.filter((clause) => clause.riskLevel === 'high').length;
  const missingAttachmentCount = attachments.filter((attachment) => attachment.status === 'missing').length;
  const profile = { ...supplierProfileDefaults, ...(options.profile || {}) };
  const technicalPlanRows = getTechnicalPlanLeafRows(options.technicalPlan);
  const quoteClauses = clauses.filter((clause) => clause.category === 'quote');
  const paymentClauses = clauses.filter((clause) => clause.category === 'payment');
  const contractClauses = clauses.filter((clause) => clause.category === 'contract' || clause.deviationType !== 'none');
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${profile.projectName}响应文件`, font: '宋体', size: 32, bold: true })],
    }),
    createDocxParagraph(`采购人：${profile.purchaserName}`),
    createDocxParagraph(`项目名称：${profile.projectName}`),
    createDocxParagraph(`供应商：${profile.supplierName}`),
    createDocxParagraph('授权代表：'),
    createDocxParagraph(new Date().toISOString().slice(0, 10)),
    createDocxHeading('一、报价一览表'),
    createSimpleDocxTable(['序号', '单位名称', '不含税（元）', '税率（%）', '含税总价（元）', '备注'], [[
      1,
      profile.supplierName,
      '待填写',
      '按最终报价填写',
      '待填写',
      '报价应包含设备、运输、包装、调试、配套软件、系统对接、维护服务等相关费用。',
    ]]),
    createDocxParagraph(`供应商名称：${profile.supplierName}（公章）`),
    createDocxParagraph('法定代表人或法人授权代表（签字或签章）：'),
    createDocxHeading('1-2 分项报价表', 2),
    createSimpleDocxTable(['设备类型', '数量', '品牌及型号', '含税投标单价（元）', '含税投标总价（元）'], createQuoteRows()),
    createDocxHeading('二、法定代表人身份证明'),
    createSimpleDocxTable(['项目', '内容'], [
      ['供应商名称', profile.supplierName],
      ['单位性质', profile.companyNature],
      ['地址', profile.address],
      ['成立时间', profile.establishedAt],
      ['经营期限', profile.operatingPeriod],
      ['法定代表人', `${profile.legalRepresentative}，职务：${profile.legalRepresentativeTitle}`],
      ['附件', '法定代表人身份证复印件'],
    ]),
    createDocxParagraph(`特此证明。供应商名称：${profile.supplierName}（公章）`),
    createDocxHeading('三、法定代表人授权委托书'),
    createDocxParagraph(`兹委派我单位授权代表参加 ${profile.projectName} 采购活动，并全权代表单位处理本次响应文件签署、澄清、合同签订等相关事务。我单位对授权代表签署内容承担责任。`),
    createDocxParagraph('本授权书自签字盖章后生效，在采购人收到撤销授权的书面通知以前持续有效。委托代理人无权转委托。'),
    createDocxParagraph('附件：委托人及被授权人身份证复印件。'),
    createDocxHeading('四、供应商基本情况表'),
    createSimpleDocxTable(['材料类别', '应提供材料', '当前状态'], createQualificationRows(clauses)),
    createDocxHeading('五、供应商资格证明文件'),
    createDocxParagraph('供应商应按照采购文件资格要求逐项提供证明文件，并对营业执照、独立法人资格、良好商业信誉、信用查询、关联关系、联合体限制等内容进行书面承诺。'),
    createSimpleDocxTable(['序号', '资格/资信要求', '响应及材料要求'], clauses.filter((clause) => clause.category === 'qualification').slice(0, 30).map((clause, index) => [
      index + 1,
      clause.originalText,
      clause.materialRequirement || '按采购文件要求提供证明材料并加盖公章',
    ])),
    createDocxHeading('六、商务响应与合同条款'),
    createDocxParagraph(`来源文件：${source.fileName || '未记录'}；条款总数：${clauses.length}；已确认：${confirmedCount}；待确认：${clauses.length - confirmedCount}；高风险：${highRiskCount}。`),
    createDocxHeading('6.1 付款与报价响应', 2),
    createDocxTable([...quoteClauses, ...paymentClauses]),
    createDocxHeading('6.2 合同条款偏离表', 2),
    createDocxTable(contractClauses),
    createDocxHeading('七、技术方案'),
    createDocxParagraph('技术方案正文应承接技术方案模块生成结果，覆盖项目理解、总体架构、核心业务流程、关键功能、接口边界、数据安全、设备配置、实施计划、测试验收、培训、售后服务和质保期等内容。'),
    createSimpleDocxTable(['序号', '技术章节', '内容摘要'], technicalPlanRows.length ? technicalPlanRows.slice(0, 80) : [[1, '技术方案正文', '当前商务标导出未读取到技术方案正文，请先完成技术方案生成并导出正式技术章节。']]),
    createDocxHeading('7.1 图文证据与附件核对清单', 2),
    createDocxParagraph('本清单用于把技术方案正文与真实界面截图、设备图片、检测报告正文、证书和盖章文件逐项对应，导出正式响应文件前应按本清单补齐附件并核对型号、项目名称和责任主体。'),
    createSimpleDocxTable(['对应章节/场景', '应匹配材料', '编制要求'], createVisualEvidenceRows()),
    createDocxHeading('八、部署安全、接口对接与数据报表'),
    createDocxParagraph('正式响应文件应补充部署拓扑、网络及数据安全、权限与日志审计、第三方系统接口、数据迁移、报表统计和运行监控说明，并用架构图、接口清单、报表截图或运维记录支撑。'),
    createDocxHeading('九、项目实施、培训、售后与质保'),
    createDocxParagraph('本章节应结合技术方案中的项目实施、组织分工、进度计划、安装调试、测试验收、培训方案、售后服务和质保期内容，形成可直接装入响应文件的正式章节。'),
    createDocxHeading('十、合同案例证明'),
    createDocxParagraph('供应商应补充近年智慧食堂、营养健康管理、称重结算、消费终端等类似项目合同案例、验收证明或用户证明材料，并与商务评分要求保持一致。'),
    createDocxHeading('十一、附件清单'),
    createDocxAttachmentTable(attachments),
    createDocxHeading('整标模板核对清单'),
    createSimpleDocxTable(['序号', '整标模块', '用途', '输出内容'], formatFullResponseTemplateRows()),
    createDocxHeading('处理建议'),
    createDocxParagraph(highRiskCount > 0 ? '存在高风险商务条款，提交前需要逐条复核并确认响应口径。' : '暂未发现高风险商务条款。'),
    createDocxParagraph(confirmedCount < clauses.length ? '仍有待确认条款，建议在导出正式响应文件前完成确认。' : '所有识别条款均已确认。'),
    createDocxParagraph(missingAttachmentCount > 0 ? '存在缺失附件，请在正式导出前补齐或标记处理口径。' : '独立附件清单暂无缺失项。'),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: 21 },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
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

function buildBusinessBidExcelBuffer(state) {
  const zip = new AdmZip();
  const attachments = Array.isArray(state?.attachments) ? state.attachments : [];
  const tables = [
    {
      title: '整标模板核对清单',
      rows: [['序号', '整标模块', '用途', '输出内容'], ...formatFullResponseTemplateRows()],
    },
    ...getBusinessBidDeliveryTables(state).map((table) => ({
      title: table.title,
      rows: [deliveryTableHeaders, ...table.rows.map((clause, rowIndex) => formatClauseCells(clause, rowIndex))],
    })),
    {
      title: '独立附件清单',
      rows: [attachmentTableHeaders, ...attachments.map((attachment, rowIndex) => formatAttachmentCells(attachment, rowIndex))],
    },
  ];
  const sheetNames = tables.map((table, index) => sanitizeSheetName(table.title, `Sheet${index + 1}`));
  const contentTypeOverrides = sheetNames.map((_name, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
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
</Relationships>`, 'utf-8'));
  tables.forEach((table, index) => {
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(worksheetXml(table.rows), 'utf-8'));
  });
  return zip.toBuffer();
}

function rowToClause(row) {
  return {
    id: row.clause_id,
    category: normalizeCategory(row.category),
    label: row.label || categoryLabels[normalizeCategory(row.category)],
    originalText: row.original_text || '',
    responseText: row.response_text || '',
    deviationType: normalizeDeviationType(row.deviation_type),
    riskLevel: normalizeRiskLevel(row.risk_level),
    materialRequirement: row.material_requirement || '',
    owner: row.owner || '',
    confirmedBy: row.confirmed_by || '',
    confirmed: Number(row.confirmed || 0) === 1,
    sourceHint: row.source_hint || '',
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at || '',
  };
}

function rowToAttachment(row) {
  return {
    id: row.attachment_id,
    kind: normalizeAttachmentKind(row.kind),
    fileName: row.file_name || '',
    storedPath: row.stored_path || '',
    originalPath: row.original_path || '',
    fileSize: Number(row.file_size || 0),
    status: normalizeAttachmentStatus(row.status),
    owner: row.owner || '',
    note: row.note || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function rowToTask(row) {
  if (!row) return undefined;
  return {
    task_id: row.task_id,
    type: row.type,
    status: row.status,
    progress: Number(row.progress || 0),
    logs: safeJsonParse(row.logs_json, []),
    stats: safeJsonParse(row.stats_json, undefined),
    error: row.error || null,
    started_at: row.started_at || '',
    updated_at: row.updated_at || '',
  };
}

function createBusinessBidStore({ db, technicalPlanStore, fileService, aiService, app, workspaceRoot }) {
  let lastTenderMarkdown = '';
  let lastTenderSourceType = '';
  const workspaceOptions = { app, workspaceRoot };

  function ensureMetaRow() {
    const existing = db.prepare('SELECT * FROM business_bid_meta WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO business_bid_meta (id, source_type, source_file_name, source_hash, generated_at, updated_at)
      VALUES (1, '', '', '', NULL, @updated_at)
    `).run({ updated_at: timestamp });
    return db.prepare('SELECT * FROM business_bid_meta WHERE id = 1').get();
  }

  function loadState() {
    const meta = ensureMetaRow();
    const clauses = db.prepare('SELECT * FROM business_bid_clauses ORDER BY sort_order ASC, clause_id ASC').all().map(rowToClause);
    const attachments = db.prepare('SELECT * FROM business_bid_attachments ORDER BY updated_at DESC, created_at DESC').all().map(rowToAttachment);
    const aiExtractionTask = rowToTask(db.prepare('SELECT * FROM business_bid_tasks WHERE type = ?').get('business-bid-ai-extraction'));
    const source = meta.source_hash ? {
      type: meta.source_type || 'technical-plan',
      fileName: meta.source_file_name || '技术方案招标文件',
      contentHash: meta.source_hash,
      generatedAt: meta.generated_at || meta.updated_at,
    } : null;
    return { source, clauses, attachments, aiExtractionTask };
  }

  function saveTask(task) {
    if (!task?.type) return;
    db.prepare(`
      INSERT INTO business_bid_tasks (type, task_id, status, progress, logs_json, stats_json, error, started_at, updated_at)
      VALUES (@type, @task_id, @status, @progress, @logs_json, @stats_json, @error, @started_at, @updated_at)
      ON CONFLICT(type) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        progress = excluded.progress,
        logs_json = excluded.logs_json,
        stats_json = excluded.stats_json,
        error = excluded.error,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at
    `).run({
      type: task.type,
      task_id: task.task_id,
      status: task.status,
      progress: Number(task.progress || 0),
      logs_json: JSON.stringify(Array.isArray(task.logs) ? task.logs : []),
      stats_json: task.stats ? JSON.stringify(task.stats) : null,
      error: task.error || null,
      started_at: task.started_at || now(),
      updated_at: task.updated_at || now(),
    });
  }

  function updateBusinessBid(partial = {}) {
    if (Object.prototype.hasOwnProperty.call(partial, 'aiExtractionTask')) {
      saveTask(partial.aiExtractionTask);
    }
    return loadState();
  }

  function replaceClauses(clauses) {
    const insert = db.prepare(`
      INSERT INTO business_bid_clauses (
        clause_id, category, label, original_text, response_text, deviation_type, risk_level, material_requirement,
        owner, confirmed_by, confirmed, source_hint, sort_order, created_at, updated_at
      ) VALUES (
        @clause_id, @category, @label, @original_text, @response_text, @deviation_type, @risk_level, @material_requirement,
        @owner, @confirmed_by, @confirmed, @source_hint, @sort_order, @created_at, @updated_at
      )
    `);
    const transaction = db.transaction((items) => {
      db.prepare('DELETE FROM business_bid_clauses').run();
      const timestamp = now();
      for (const item of items) {
        insert.run({
          clause_id: item.id,
          category: item.category,
          label: item.label,
          original_text: item.originalText,
          response_text: item.responseText,
          deviation_type: item.deviationType,
          risk_level: item.riskLevel,
          material_requirement: item.materialRequirement,
          owner: item.owner || '',
          confirmed_by: item.confirmedBy || '',
          confirmed: item.confirmed ? 1 : 0,
          source_hint: item.sourceHint,
          sort_order: item.sortOrder,
          created_at: timestamp,
          updated_at: item.updatedAt || timestamp,
        });
      }
    });
    transaction(clauses);
  }

  function importFromTechnicalPlan() {
    ensureMetaRow();
    if (!technicalPlanStore?.readTenderMarkdown || !technicalPlanStore?.loadTechnicalPlan) {
      throw new Error('技术方案工作区尚未初始化');
    }
    const technicalPlan = technicalPlanStore.loadTechnicalPlan();
    const markdown = technicalPlanStore.readTenderMarkdown();
    if (!markdown.trim()) {
      throw new Error('请先在技术方案中导入招标文件，再生成商务标矩阵');
    }
    const clauses = extractBusinessClauses(markdown, { sourceHint: '技术方案招标文件' });
    if (!clauses.length) {
      throw new Error('未从招标文件中识别到商务条款，请确认文件中包含付款、合同、报价或资信要求');
    }
    const timestamp = now();
    const sourceHash = stableHash(markdown);
    db.prepare(`
      UPDATE business_bid_meta
      SET source_type = 'technical-plan', source_file_name = @source_file_name, source_hash = @source_hash,
          generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({
      source_file_name: technicalPlan.tenderFile?.fileName || '技术方案招标文件',
      source_hash: sourceHash,
      generated_at: timestamp,
      updated_at: timestamp,
    });
    lastTenderMarkdown = markdown;
    lastTenderSourceType = 'technical-plan';
    replaceClauses(clauses);
    return loadState();
  }

  async function importTenderDocument() {
    ensureMetaRow();
    const importer = fileService?.importTechnicalPlanDocument || fileService?.importDocument;
    if (!importer) {
      throw new Error('文件导入服务尚未初始化');
    }

    const result = fileService?.importTechnicalPlanDocument
      ? await fileService.importTechnicalPlanDocument('商务标招标文件')
      : await fileService.importDocument();
    if (!result?.success || !result.file_content) {
      return {
        success: false,
        message: result?.message || '未导入商务标招标文件',
        state: loadState(),
      };
    }

    const markdown = String(result.file_content || '').trim();
    const clauses = extractBusinessClauses(markdown, { sourceHint: '独立商务标招标文件' });
    if (!clauses.length) {
      throw new Error('未从商务标招标文件中识别到商务条款，请确认文件中包含付款、合同、报价或资信要求');
    }

    const timestamp = now();
    db.prepare(`
      UPDATE business_bid_meta
      SET source_type = 'tender-document', source_file_name = @source_file_name, source_hash = @source_hash,
          generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({
      source_file_name: result.file_name || '商务标招标文件',
      source_hash: stableHash(markdown),
      generated_at: timestamp,
      updated_at: timestamp,
    });
    lastTenderMarkdown = markdown;
    lastTenderSourceType = 'tender-document';
    replaceClauses(clauses);
    return {
      success: true,
      message: '商务标招标文件已导入，商务响应矩阵已生成',
      state: loadState(),
    };
  }

  async function enhanceWithAi(options = {}) {
    ensureMetaRow();
    if (!aiService?.requestJson && !aiService?.collectJsonResponse) {
      throw new Error('AI 服务尚未初始化，无法执行商务标结构化提取');
    }
    const current = loadState();
    if (!current.source) {
      throw new Error('请先导入招标文件或从技术方案生成商务响应矩阵');
    }

    let markdown = lastTenderMarkdown;
    let sourceHint = lastTenderSourceType === 'tender-document' ? 'AI 结构化提取：独立商务标招标文件' : 'AI 结构化提取：技术方案招标文件';
    if (current.source.type === 'technical-plan' && technicalPlanStore?.readTenderMarkdown) {
      markdown = technicalPlanStore.readTenderMarkdown();
      sourceHint = 'AI 结构化提取：技术方案招标文件';
    }
    if (!String(markdown || '').trim()) {
      throw new Error('当前来源文件原文未缓存，请重新导入招标文件后再执行 AI 结构化提取');
    }

    const ruleClauses = extractBusinessClauses(markdown, { sourceHint: current.source.type === 'technical-plan' ? '技术方案招标文件' : '独立商务标招标文件' });
    const collectJson = aiService.collectJsonResponse || aiService.requestJson;
    const aiClauses = await collectJson.call(aiService, {
      schemaName: 'BusinessBidClauseExtraction',
      progressLabel: '商务标 AI 结构化提取',
      progressCallback: options.progressCallback,
      failureMessage: 'AI 商务标结构化提取失败，请检查模型配置后重试',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: buildBusinessBidExtractionMessages(markdown, ruleClauses),
      normalizer: (payload) => normalizeAiBusinessClauses(payload, { sourceHint }),
      validator: validateAiBusinessClauses,
    });
    replaceClauses(aiClauses);
    const timestamp = now();
    db.prepare(`
      UPDATE business_bid_meta
      SET generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({ generated_at: timestamp, updated_at: timestamp });
    return {
      success: true,
      message: `AI 已重新提取 ${aiClauses.length} 条商务条款`,
      state: loadState(),
    };
  }

  function updateClause(id, patch) {
    const clauseId = String(id || '').trim();
    if (!clauseId) throw new Error('条款 ID 不能为空');
    const existing = db.prepare('SELECT * FROM business_bid_clauses WHERE clause_id = ?').get(clauseId);
    if (!existing) throw new Error('商务条款不存在');
    db.prepare(`
      UPDATE business_bid_clauses
      SET response_text = @response_text,
          deviation_type = @deviation_type,
          risk_level = @risk_level,
          material_requirement = @material_requirement,
          owner = @owner,
          confirmed_by = @confirmed_by,
          confirmed = @confirmed,
          updated_at = @updated_at
      WHERE clause_id = @clause_id
    `).run({
      clause_id: clauseId,
      response_text: patch?.responseText === undefined ? existing.response_text : String(patch.responseText || ''),
      deviation_type: normalizeDeviationType(patch?.deviationType === undefined ? existing.deviation_type : patch.deviationType),
      risk_level: normalizeRiskLevel(patch?.riskLevel === undefined ? existing.risk_level : patch.riskLevel),
      material_requirement: patch?.materialRequirement === undefined ? existing.material_requirement : String(patch.materialRequirement || ''),
      owner: patch?.owner === undefined ? existing.owner : String(patch.owner || '').trim().slice(0, 80),
      confirmed_by: patch?.confirmedBy === undefined ? existing.confirmed_by : String(patch.confirmedBy || '').trim().slice(0, 80),
      confirmed: patch?.confirmed === undefined ? Number(existing.confirmed || 0) : (patch.confirmed ? 1 : 0),
      updated_at: now(),
    });
    return loadState();
  }

  async function importAttachments(options = {}) {
    const kind = normalizeAttachmentKind(options.kind);
    const status = normalizeAttachmentStatus(options.status || 'pending');
    let filePaths = Array.isArray(options.filePaths) ? options.filePaths.filter(Boolean) : [];
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog({
        title: '选择商务标附件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '商务标附件', extensions: ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'wps', 'png', 'jpg', 'jpeg', 'zip', 'rar'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths.length) {
        return { success: false, message: '已取消导入附件', state: loadState() };
      }
      filePaths = result.filePaths;
    }

    const workspace = getBusinessBidWorkspaceRoot(workspaceOptions);
    const attachmentDir = path.join(workspace, 'business-bid', 'attachments');
    fs.mkdirSync(attachmentDir, { recursive: true });
    const timestamp = now();
    const imported = [];
    const insert = db.prepare(`
      INSERT INTO business_bid_attachments (
        attachment_id, kind, file_name, stored_path, original_path, file_size, status, owner, note, created_at, updated_at
      ) VALUES (
        @attachment_id, @kind, @file_name, @stored_path, @original_path, @file_size, @status, @owner, @note, @created_at, @updated_at
      )
    `);

    for (const [index, filePath] of filePaths.entries()) {
      const absolutePath = String(filePath || '').trim();
      if (!absolutePath || !fs.existsSync(absolutePath)) continue;
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) continue;
      const fileName = sanitizeFileName(path.basename(absolutePath));
      const id = createAttachmentId(absolutePath, index);
      const storedName = `${id}-${fileName}`;
      const storedAbsolutePath = path.join(attachmentDir, storedName);
      fs.copyFileSync(absolutePath, storedAbsolutePath);
      const storedPath = toWorkspaceRelativePath(storedAbsolutePath, workspace);
      insert.run({
        attachment_id: id,
        kind,
        file_name: fileName,
        stored_path: storedPath,
        original_path: absolutePath,
        file_size: stats.size,
        status,
        owner: String(options.owner || '').trim().slice(0, 80),
        note: String(options.note || '').trim().slice(0, 500),
        created_at: timestamp,
        updated_at: timestamp,
      });
      imported.push(fileName);
    }

    return {
      success: imported.length > 0,
      message: imported.length ? `已导入 ${imported.length} 个商务标附件` : '未导入有效附件',
      state: loadState(),
    };
  }

  function updateAttachment(id, patch = {}) {
    const attachmentId = String(id || '').trim();
    if (!attachmentId) throw new Error('附件 ID 不能为空');
    const existing = db.prepare('SELECT * FROM business_bid_attachments WHERE attachment_id = ?').get(attachmentId);
    if (!existing) throw new Error('商务标附件不存在');
    db.prepare(`
      UPDATE business_bid_attachments
      SET kind = @kind,
          status = @status,
          owner = @owner,
          note = @note,
          updated_at = @updated_at
      WHERE attachment_id = @attachment_id
    `).run({
      attachment_id: attachmentId,
      kind: normalizeAttachmentKind(patch.kind === undefined ? existing.kind : patch.kind),
      status: normalizeAttachmentStatus(patch.status === undefined ? existing.status : patch.status),
      owner: patch.owner === undefined ? existing.owner : String(patch.owner || '').trim().slice(0, 80),
      note: patch.note === undefined ? existing.note : String(patch.note || '').trim().slice(0, 500),
      updated_at: now(),
    });
    return loadState();
  }

  function deleteAttachment(id) {
    const attachmentId = String(id || '').trim();
    if (!attachmentId) throw new Error('附件 ID 不能为空');
    const existing = db.prepare('SELECT * FROM business_bid_attachments WHERE attachment_id = ?').get(attachmentId);
    if (!existing) return loadState();
    db.prepare('DELETE FROM business_bid_attachments WHERE attachment_id = ?').run(attachmentId);
    try {
      const workspace = getBusinessBidWorkspaceRoot(workspaceOptions);
      const storedPath = resolveWorkspacePath(existing.stored_path, workspace);
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    } catch {
      // 文件清理失败不影响附件记录删除，避免阻塞用户继续整理清单。
    }
    return loadState();
  }

  function clear() {
    const timestamp = now();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM business_bid_clauses').run();
      db.prepare('DELETE FROM business_bid_attachments').run();
      db.prepare('DELETE FROM business_bid_tasks').run();
      db.prepare(`
        UPDATE business_bid_meta
        SET source_type = '', source_file_name = '', source_hash = '', generated_at = NULL, updated_at = @updated_at
        WHERE id = 1
      `).run({ updated_at: timestamp });
    });
    transaction();
    try {
      const workspace = getBusinessBidWorkspaceRoot(workspaceOptions);
      fs.rmSync(path.join(workspace, 'business-bid', 'attachments'), { recursive: true, force: true });
    } catch {
      // 清空业务数据已完成，附件目录清理失败不影响工作台恢复。
    }
    return loadState();
  }

  async function exportReport(options = {}) {
    const state = loadState();
    const markdown = buildBusinessBidReportMarkdown(state);
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出商务标响应交付包',
        defaultPath: `商务标响应交付包-${new Date().toISOString().slice(0, 10)}.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出' };
      }
      filePath = result.filePath;
    }
    fs.writeFileSync(filePath, markdown, 'utf-8');
    return {
      success: true,
      message: '商务标响应交付包已导出',
      filePath,
      markdownChars: markdown.length,
    };
  }

  async function exportOfficePackage(options = {}) {
    const format = String(options.format || '').toLowerCase() === 'xlsx' ? 'xlsx' : 'docx';
    const state = loadState();
    const technicalPlan = technicalPlanStore?.loadTechnicalPlan ? technicalPlanStore.loadTechnicalPlan() : null;
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: format === 'xlsx' ? '导出商务标 Excel 表格' : '导出响应文件 Word 编制稿',
        defaultPath: `响应文件编制稿-${new Date().toISOString().slice(0, 10)}.${format}`,
        filters: format === 'xlsx'
          ? [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
          : [{ name: 'Word 文档', extensions: ['docx'] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出' };
      }
      filePath = result.filePath;
    }
    const buffer = format === 'xlsx'
      ? buildBusinessBidExcelBuffer(state)
      : await buildBusinessBidWordBuffer(state, { technicalPlan });
    fs.writeFileSync(filePath, buffer);
    return {
      success: true,
      message: format === 'xlsx' ? '商务标 Excel 表格已导出' : '响应文件 Word 编制稿已导出',
      filePath,
      bytes: buffer.length,
      format,
    };
  }

  return {
    loadState,
    updateBusinessBid,
    importFromTechnicalPlan,
    importTenderDocument,
    enhanceWithAi,
    updateClause,
    importAttachments,
    updateAttachment,
    deleteAttachment,
    exportReport,
    exportOfficePackage,
    clear,
  };
}

module.exports = {
  createBusinessBidStore,
  extractBusinessClauses,
  normalizeAiBusinessClauses,
  buildBusinessBidExcelBuffer,
  buildBusinessBidWordBuffer,
  buildBusinessBidReportMarkdown,
};
