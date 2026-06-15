const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
const { getDuplicateCheckContentDir, getDuplicateCheckDir } = require('../utils/paths.cjs');
const { deleteImportedImageBatches } = require('../utils/importedImages.cjs');

const initialState = {
  tenderFile: null,
  bidFiles: [],
  step: 'upload',
  activeAnalysisTab: 'metadata',
  analysisTask: undefined,
  metadataAnalysis: undefined,
  outlineAnalysis: undefined,
  contentAnalysis: undefined,
  imageAnalysis: undefined,
  contentIgnoreRules: [],
};

const contentIgnoreRuleCategories = ['manual', 'tender-reference', 'boilerplate', 'batch'];
const contentIgnoreRuleCategoryLabels = {
  manual: '手动忽略',
  'tender-reference': '招标引用',
  boilerplate: '固定模板',
  batch: '批量规则',
};

const sectionFields = {
  metadata: 'metadataAnalysis',
  outline: 'outlineAnalysis',
  content: 'contentAnalysis',
  image: 'imageAnalysis',
};

const fieldSections = Object.fromEntries(Object.entries(sectionFields).map(([section, field]) => [field, section]));

function now() {
  return new Date().toISOString();
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonOrNull(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function hashContent(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function hashFileIfReadable(filePath) {
  const targetPath = String(filePath || '').trim();
  if (!targetPath || !fs.existsSync(targetPath)) return null;
  return hashContent(fs.readFileSync(targetPath, 'utf-8'));
}

function toDbBool(value) {
  return value ? 1 : 0;
}

function fromDbBool(value) {
  return Number(value) === 1;
}

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function stableFileId(file) {
  return file?.id || crypto.createHash('sha1').update(String(file?.file_path || file?.file_name || '')).digest('hex');
}

function createSignature({ tenderFile, bidFiles } = {}) {
  const files = [tenderFile, ...(Array.isArray(bidFiles) ? bidFiles : [])]
    .filter(Boolean)
    .map((file) => `${file.file_path}|${file.size}|${file.modified_at}`);
  return crypto.createHash('sha1').update(files.join('\n')).digest('hex');
}

function scopedOutlineItemId(fileId, itemId) {
  return `${fileId}::${itemId}`;
}

function unscopedOutlineItemId(itemId) {
  return String(itemId || '').includes('::') ? String(itemId).split('::').slice(1).join('::') : String(itemId || '');
}

function normalizeStep(value) {
  return value === 'analysis' ? 'analysis' : 'upload';
}

function normalizeTab(value) {
  return ['metadata', 'outline', 'content', 'image'].includes(value) ? value : 'metadata';
}

function normalizeResolutionStatus(value) {
  return ['pending', 'confirmed', 'ignored'].includes(value) ? value : 'pending';
}

function stripLeadingContentSequence(value) {
  let text = String(value || '').trim();
  const patterns = [
    /^\s*(?:第\s*)?[一二三四五六七八九十百千万零〇]+[、.．）)]\s*/,
    /^\s*(?:\d{1,3}|[A-Za-z])(?:\.\d{1,3}){0,6}[、.．）)]\s*/,
    /^\s*[(（](?:\d{1,3}|[一二三四五六七八九十百千万零〇]+|[A-Za-z])[)）]\s*/,
    /^\s*[（(][一二三四五六七八九十百千万零〇]+[）)]\s*/,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of patterns) {
      const next = text.replace(pattern, '');
      if (next !== text) {
        text = next.trimStart();
        changed = true;
        break;
      }
    }
  }
  return text;
}

function normalizeContentIgnoreRuleText(value) {
  return stripLeadingContentSequence(String(value || ''))
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

function normalizeContentIgnoreRuleCategory(value) {
  const category = String(value || '').trim();
  return contentIgnoreRuleCategories.includes(category) ? category : 'manual';
}

function buildContentIgnoreRulePackage(rules) {
  return {
    kind: 'yibiao.duplicateCheck.contentIgnoreRules',
    version: 1,
    exported_at: now(),
    rules: (Array.isArray(rules) ? rules : []).map((rule) => ({
      pattern: String(rule?.pattern || ''),
      normalized: String(rule?.normalized || ''),
      category: normalizeContentIgnoreRuleCategory(rule?.category),
      category_label: contentIgnoreRuleCategoryLabels[normalizeContentIgnoreRuleCategory(rule?.category)],
    })),
  };
}

function normalizeImportedContentIgnoreRules(payload) {
  const rawRules = Array.isArray(payload) ? payload : Array.isArray(payload?.rules) ? payload.rules : [];
  const ruleMap = new Map();
  let skippedCount = 0;
  for (const rawRule of rawRules) {
    const pattern = String(rawRule?.pattern || rawRule?.text || rawRule?.sentence || '').trim();
    const normalized = normalizeContentIgnoreRuleText(rawRule?.normalized || pattern);
    const displayPattern = pattern || normalized;
    if (!displayPattern || !normalized) {
      skippedCount += 1;
      continue;
    }
    ruleMap.set(normalized, {
      pattern: displayPattern,
      normalized,
      category: normalizeContentIgnoreRuleCategory(rawRule?.category),
    });
  }
  return { rules: [...ruleMap.values()], skippedCount };
}

function resolutionStatusLabel(value) {
  const status = normalizeResolutionStatus(value);
  if (status === 'confirmed') return '已确认';
  if (status === 'ignored') return '已忽略';
  return '未处理';
}

function normalizeImageMatchType(value) {
  return value === 'similar' ? 'similar' : 'exact';
}

function imageMatchTypeLabel(value) {
  return normalizeImageMatchType(value) === 'similar' ? '相似图片' : '完全重复';
}

function formatSimilarityScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return '-';
  return `${Math.round(Math.min(score, 1) * 100)}%`;
}

function statusLabel(value) {
  const status = normalizeStatus(value, ['pending', 'running', 'success', 'error'], 'pending');
  if (status === 'running') return '分析中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '有错误';
  return '待分析';
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim() || '-';
}

function stripMarkdownInline(value) {
  return String(value ?? '')
    .replace(/<a\s+id="[^"]+"\s*><\/a>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\\\|/g, '|')
    .trim();
}

function splitMarkdownTableCells(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => stripMarkdownInline(cell));
}

function isMarkdownTableDelimiter(line) {
  const cells = splitMarkdownTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function createDocxText(text, options = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font: '宋体',
    size: options.size || 21,
    bold: Boolean(options.bold),
  });
}

function createDocxParagraph(text, options = {}) {
  return new Paragraph({
    heading: options.heading,
    alignment: options.alignment,
    spacing: { after: options.after ?? 120 },
    bullet: options.bullet ? { level: 0 } : undefined,
    children: [createDocxText(text, options)],
  });
}

function createDocxTableCell(value, options = {}) {
  return new TableCell({
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    shading: options.header ? { fill: 'EEF3FA' } : undefined,
    children: [
      new Paragraph({
        alignment: options.header ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [createDocxText(String(value || '-') || '-', { size: 18, bold: Boolean(options.header) })],
      }),
    ],
  });
}

function createDocxMarkdownTable(headers, rows) {
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
      ...rows.map((row) => new TableRow({ children: row.map((cell) => createDocxTableCell(cell)) })),
    ],
  });
}

function markdownReportToDocxChildren(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const children = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^\|.+\|$/.test(trimmed) && isMarkdownTableDelimiter(lines[index + 1] || '')) {
      const headers = splitMarkdownTableCells(trimmed);
      const rows = [];
      index += 2;
      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) {
        rows.push(splitMarkdownTableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      children.push(createDocxMarkdownTable(headers, rows));
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const text = stripMarkdownInline(heading[2]);
      if (level === 1) {
        children.push(createDocxParagraph(text, { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, bold: true, size: 32, after: 260 }));
      } else {
        children.push(createDocxParagraph(text, { heading: level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, bold: true, size: level === 2 ? 26 : 23, after: 180 }));
      }
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      children.push(createDocxParagraph(stripMarkdownInline(bullet[1]), { bullet: true }));
      continue;
    }

    children.push(createDocxParagraph(stripMarkdownInline(trimmed)));
  }
  return children.length ? children : [createDocxParagraph('暂无报告内容')];
}

async function buildDuplicateCheckReportDocxBuffer(state) {
  const markdown = buildDuplicateCheckReportMarkdown(state);
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: 21 },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
      },
    },
    sections: [{ children: markdownReportToDocxChildren(markdown) }],
  });
  return Packer.toBuffer(doc);
}

function markdownReportToPdfLines(markdown) {
  const output = [];
  const lines = String(markdown || '').split(/\r?\n/);
  let inImageReviewView = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || /^<a\s+id="[^"]+"\s*><\/a>$/i.test(trimmed) || isMarkdownTableDelimiter(trimmed)) {
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      inImageReviewView = heading[2].trim() === '相似图片复核视图';
      output.push({
        text: stripMarkdownInline(heading[2]),
        size: heading[1].length === 1 ? 17 : heading[1].length === 2 ? 14 : 12,
        gapBefore: heading[1].length === 1 ? 16 : 10,
      });
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      const cells = splitMarkdownTableCells(trimmed);
      if (cells.length) {
        output.push({ text: cells.map(stripMarkdownInline).join('  |  '), size: 9, gapBefore: 4 });
      }
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      const text = stripMarkdownInline(bullet[1]);
      if (inImageReviewView && /(?:图序|图片组|涉及文件|判断依据|复核建议)/.test(text)) {
        output.push({
          type: 'image-review-card-line',
          text,
          target: text.includes('图序') || text.startsWith('图片组'),
          size: 9,
          gapBefore: 2,
        });
        continue;
      }
      output.push({ text: `- ${text}`, size: 10, gapBefore: 4 });
      continue;
    }

    output.push({ text: stripMarkdownInline(trimmed), size: 10, gapBefore: 4 });
  }
  return output.length ? output : [{ text: '暂无报告内容', size: 10, gapBefore: 4 }];
}

function textUnitWidth(char) {
  return /[\u0000-\u00ff]/.test(char) ? 1 : 2;
}

function wrapPdfText(text, maxUnits = 84) {
  const chars = [...String(text || '').replace(/\s+/g, ' ').trim()];
  if (!chars.length) return [''];
  const lines = [];
  let current = '';
  let width = 0;
  for (const char of chars) {
    const charWidth = textUnitWidth(char);
    if (current && width + charWidth > maxUnits) {
      lines.push(current);
      current = char;
      width = charWidth;
    } else {
      current += char;
      width += charWidth;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function utf16BeHex(text) {
  const parts = [];
  for (const char of String(text || '')) {
    const codePoint = char.codePointAt(0);
    if (codePoint > 0xffff) {
      const value = codePoint - 0x10000;
      const high = 0xd800 + (value >> 10);
      const low = 0xdc00 + (value & 0x3ff);
      parts.push(high.toString(16).padStart(4, '0'), low.toString(16).padStart(4, '0'));
    } else {
      parts.push(codePoint.toString(16).padStart(4, '0'));
    }
  }
  return parts.join('').toUpperCase();
}

function pdfStringLiteral(text) {
  return `<${utf16BeHex(text)}>`;
}

function createPdfObjectStream(objects) {
  let body = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'binary'));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

function buildSimpleCjkPdf(textBlocks) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const topY = 790;
  const bottomY = 52;
  const pages = [];
  let current = [];
  let y = topY;

  const pushPage = () => {
    if (current.length) pages.push(current);
    current = [];
    y = topY;
  };

  for (const block of textBlocks) {
    const size = Number(block.size || 10);
    const isImageReviewLine = block.type === 'image-review-card-line';
    const lineHeight = isImageReviewLine ? 20 : Math.max(14, size + 5);
    const wrappedLines = wrapPdfText(block.text, size >= 14 ? 48 : 72);
    y -= Number(block.gapBefore || 4);
    for (const line of wrappedLines) {
      if (y < bottomY) pushPage();
      current.push({
        text: line,
        x: isImageReviewLine ? marginX + 12 : marginX,
        y,
        size,
        type: block.type,
        target: block.target,
      });
      y -= lineHeight;
    }
  }
  pushPage();

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_page, index) => `${6 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor 5 0 R >>',
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
  ];

  pages.forEach((pageLines, index) => {
    const content = [
      'q',
      '1 0 0 1 0 0 cm',
      ...pageLines.flatMap((line) => {
        const textCommand = `BT /F1 ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm ${pdfStringLiteral(line.text)} Tj ET`;
        if (line.type !== 'image-review-card-line') return [textCommand];
        const fill = line.target ? '0.91 0.96 0.98 rg' : '0.96 0.98 1 rg';
        const stroke = line.target ? '0.10 0.55 0.65 RG' : '0.72 0.78 0.88 RG';
        return [
          'q',
          fill,
          `${line.x - 10} ${line.y - 5} 500 17 re f`,
          stroke,
          `${line.x - 10} ${line.y - 5} 500 17 re S`,
          'Q',
          textCommand,
        ];
      }),
      'Q',
    ].join('\n');
    const contentObjectNumber = 7 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`);
  });

  return createPdfObjectStream(objects);
}

function buildDuplicateCheckReportPdfBuffer(state) {
  const markdown = buildDuplicateCheckReportMarkdown(state);
  return buildSimpleCjkPdf(markdownReportToPdfLines(markdown));
}

function countByResolution(items = []) {
  return items.reduce((acc, item) => {
    const status = normalizeResolutionStatus(item.resolution_status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { pending: 0, confirmed: 0, ignored: 0 });
}

function pushDuplicateBatchSuggestions(lines, { contentResolution, imageResolution, contentIgnoreRules }) {
  const contentPending = Number(contentResolution?.pending || 0);
  const contentConfirmed = Number(contentResolution?.confirmed || 0);
  const contentIgnored = Number(contentResolution?.ignored || 0);
  const imagePending = Number(imageResolution?.pending || 0);
  const imageConfirmed = Number(imageResolution?.confirmed || 0);
  const imageIgnored = Number(imageResolution?.ignored || 0);
  const ruleCount = Array.isArray(contentIgnoreRules) ? contentIgnoreRules.length : 0;

  lines.push('## 批量处理建议', '');
  if (contentPending > 0) {
    lines.push(`- 正文重复句：仍有 ${contentPending} 条未处理，建议先筛选正文结果，对明显模板句批量忽略，对确认为异常复制的句子批量确认后回到原投标文件修改。`);
  }
  if (contentConfirmed > 0) {
    lines.push(`- 已确认正文重复：${contentConfirmed} 条，建议按涉及文件逐项改写，改写后重新查重并重新导出报告。`);
  }
  if (contentIgnored > 0 || ruleCount > 0) {
    lines.push(`- 正文忽略项：已忽略 ${contentIgnored} 条，当前保存 ${ruleCount} 条常用忽略规则；交付前应抽样复核，避免把应修改的正文误纳入模板忽略。`);
  }
  if (imagePending > 0) {
    lines.push(`- 重复图片：仍有 ${imagePending} 组未处理，建议先按图片结果批量忽略通用图标/章戳，再批量确认需要替换的产品图、流程图或截图。`);
  }
  if (imageConfirmed > 0) {
    lines.push(`- 已确认重复图片：${imageConfirmed} 组，建议替换或重新导出对应素材，并保留修改前后截图作为人工复核依据。`);
  }
  if (imageIgnored > 0) {
    lines.push(`- 图片忽略项：已忽略 ${imageIgnored} 组，建议在正式交付前复核是否存在不同投标文件复用同一关键业务截图的风险。`);
  }
  if (!contentPending && !contentConfirmed && !contentIgnored && !imagePending && !imageConfirmed && !imageIgnored) {
    lines.push('- 当前正文重复句和重复图片暂无待处理项；交付前重点复核元数据风险、目录重复组和本轮分析时间。');
  }
  lines.push('');
}

function formatFileNames(files = [], fileIds = []) {
  const byId = new Map(files.map((file) => [file.id, file.file_name]));
  return (fileIds || []).map((fileId) => byId.get(fileId) || fileId).join('、') || '-';
}

function formatImageOccurrenceLocation(entry) {
  if (!entry) return '';
  const parts = [];
  if (entry.image_index !== undefined && entry.image_index !== null) {
    parts.push(`图序 ${entry.image_index}`);
  }
  parts.push(`目录：${entry.directory || '未识别目录'}`);
  parts.push(`前文：${entry.previous_sentence || '未提取到图片前文'}`);
  return parts.join('；');
}

function imageReviewAdvice(item) {
  if (normalizeImageMatchType(item?.match_type) === 'similar') {
    return '建议人工打开涉及文件逐图核对裁剪、缩放、压缩、水印或截图复用痕迹；如为关键业务截图，优先替换或补充来源说明。';
  }
  return 'Hash 完全一致，建议确认是否为通用图标、章戳或模板装饰图；如为关键业务图片，应替换或说明来源。';
}

function pushImageReviewView(lines, duplicateImages = [], bidFiles = []) {
  const reviewItems = (Array.isArray(duplicateImages) ? duplicateImages : [])
    .filter((item) => normalizeImageMatchType(item?.match_type) === 'similar')
    .slice(0, 50);
  if (!reviewItems.length) return;

  const fileNameById = new Map(bidFiles.map((file) => [file.id, file.file_name]));
  lines.push('### 相似图片复核视图', '');
  lines.push('本节按图片组展开定位上下文，供人工核对压缩、缩放、截图、裁剪或水印后的复用风险。');
  reviewItems.forEach((item) => {
    const fileIds = Array.isArray(item.file_ids) ? item.file_ids : [];
    lines.push('');
    lines.push(`- 图片组 ${item.id || item.hash || '-'}（${imageMatchTypeLabel(item.match_type)}，${formatSimilarityScore(item.similarity_score)}）：${item.hash || '-'}`);
    lines.push(`- 涉及文件：${formatFileNames(bidFiles, fileIds)}`);
    if (item.similarity_reason) {
      lines.push(`- 判断依据：${item.similarity_reason}`);
    }
    lines.push(`- 复核建议：${imageReviewAdvice(item)}`);
    fileIds.forEach((fileId) => {
      const entries = Array.isArray(item.locations?.[fileId]) ? item.locations[fileId] : [];
      if (!entries.length) {
        lines.push(`- ${fileNameById.get(fileId) || fileId}：未提取到图片上下文`);
        return;
      }
      entries.slice(0, 3).forEach((entry) => {
        lines.push(`- ${fileNameById.get(fileId) || fileId}：${formatImageOccurrenceLocation(entry)}`);
      });
    });
  });
  lines.push('');
}

function buildDuplicateCheckReportMarkdown(state) {
  const bidFiles = state.bidFiles || [];
  const metadata = state.metadataAnalysis;
  const outline = state.outlineAnalysis;
  const content = state.contentAnalysis;
  const image = state.imageAnalysis;
  const contentResolution = countByResolution(content?.duplicateSentences || []);
  const imageResolution = countByResolution(image?.duplicateImages || []);
  const lines = [
    '# 标书查重报告',
    '',
    `生成时间：${now()}`,
    '',
    '## 文件范围',
    '',
    `- 招标文件：${state.tenderFile?.file_name || '未上传'}`,
    `- 投标文件：${bidFiles.length} 份`,
    ...bidFiles.map((file, index) => `  - ${index + 1}. ${file.file_name}`),
    '',
    '## 分析摘要',
    '',
    '| 维度 | 状态 | 关键结果 |',
    '| --- | --- | --- |',
    `| 元数据 | ${statusLabel(metadata?.status)} | ${metadata?.rows?.length || 0} 个元数据项 |`,
    `| 目录 | ${statusLabel(outline?.status)} | ${outline?.duplicateGroups?.length || 0} 个重复/相似目录组 |`,
    `| 正文 | ${statusLabel(content?.status)} | ${content?.duplicateSentences?.length || 0} 条重复句，已确认 ${contentResolution.confirmed}，已忽略 ${contentResolution.ignored} |`,
    `| 图片 | ${statusLabel(image?.status)} | ${image?.duplicateImages?.length || 0} 组重复图片，已确认 ${imageResolution.confirmed}，已忽略 ${imageResolution.ignored} |`,
    '',
  ];

  if (metadata?.rows?.length) {
    lines.push('## 元数据风险项', '', '| 元数据项 | 涉及文件 | 说明 |', '| --- | --- | --- |');
    metadata.rows
      .filter((row) => row.duplicate_file_ids?.length || row.same_day_file_ids?.length)
      .forEach((row) => {
        const fileIds = row.duplicate_file_ids?.length ? row.duplicate_file_ids : row.same_day_file_ids;
        lines.push(`| ${markdownCell(row.label)} | ${markdownCell(formatFileNames(bidFiles, fileIds))} | ${row.duplicate_file_ids?.length ? '值完全相同' : '日期相同'} |`);
      });
    lines.push('');
  }

  if (outline?.duplicateGroups?.length) {
    lines.push('## 目录重复结果', '', '| 目录 | 类型 | 涉及文件 | 相似度 |', '| --- | --- | --- | --- |');
    outline.duplicateGroups.slice(0, 100).forEach((group) => {
      lines.push(`| ${markdownCell(group.title)} | ${group.type === 'similar' ? '相似' : '重复'} | ${markdownCell(formatFileNames(bidFiles, group.file_ids))} | ${Math.round(Number(group.score || 0) * 100)}% |`);
    });
    lines.push('');
  }

  if (content?.duplicateSentences?.length) {
    lines.push('## 正文重复句', '', '| 状态 | 重复句 | 涉及文件 |', '| --- | --- | --- |');
    content.duplicateSentences.slice(0, 200).forEach((item) => {
      lines.push(`| ${resolutionStatusLabel(item.resolution_status)} | ${markdownCell(item.normalized || item.sentence)} | ${markdownCell(formatFileNames(bidFiles, item.file_ids))} |`);
    });
    lines.push('');
  }

  if (image?.duplicateImages?.length) {
    lines.push('## 重复/相似图片', '', '| 状态 | 类型 | 相似度 | Hash | 涉及文件 | 定位线索 |', '| --- | --- | --- | --- | --- | --- |');
    image.duplicateImages.slice(0, 100).forEach((item) => {
      const fileIds = Array.isArray(item.file_ids) ? item.file_ids : [];
      const location = fileIds
        .map((fileId) => item.locations?.[fileId]?.[0])
        .filter(Boolean)
        .map(formatImageOccurrenceLocation)
        .join('；');
      const evidence = [item.similarity_reason, location].filter(Boolean).join('；');
      lines.push(`| ${resolutionStatusLabel(item.resolution_status)} | ${imageMatchTypeLabel(item.match_type)} | ${formatSimilarityScore(item.similarity_score)} | ${markdownCell(item.hash)} | ${markdownCell(formatFileNames(bidFiles, fileIds))} | ${markdownCell(evidence)} |`);
    });
    lines.push('');
    pushImageReviewView(lines, image.duplicateImages, bidFiles);
  }

  pushDuplicateBatchSuggestions(lines, {
    contentResolution,
    imageResolution,
    contentIgnoreRules: state.contentIgnoreRules,
  });

  lines.push('## 后续处理建议', '');
  lines.push('- 对“未处理”重复句和重复图片逐项确认，必要时修改投标文件正文或替换图片素材。');
  lines.push('- 对“已忽略”项定期复核，避免把固定模板误判为可接受重复。');
  lines.push('- 本报告基于当前工作区缓存生成；重新查重后请重新导出。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function normalizeFile(file) {
  if (!file || typeof file !== 'object') return null;
  const fileId = stableFileId(file);
  const fileName = String(file.file_name || '').trim();
  const filePath = String(file.file_path || '').trim();
  if (!fileId || !fileName || !filePath) return null;
  return {
    id: fileId,
    file_name: fileName,
    file_path: filePath,
    extension: String(file.extension || path.extname(fileName) || '').toLowerCase(),
    size: Number(file.size || 0),
    modified_at: String(file.modified_at || ''),
  };
}

function fileFromRow(row) {
  return {
    id: row.file_id,
    file_name: row.file_name,
    file_path: row.file_path,
    extension: row.extension,
    size: Number(row.size || 0),
    modified_at: row.modified_at || '',
  };
}

function taskFromRow(row) {
  if (!row) return undefined;
  return {
    task_id: row.task_id,
    type: row.type,
    status: normalizeStatus(row.status, ['running', 'success', 'error'], 'running'),
    progress: Number(row.progress || 0),
    logs: safeJsonParse(row.logs_json, []),
    started_at: row.started_at,
    updated_at: row.updated_at,
    error: row.error || undefined,
    stats: safeJsonParse(row.stats_json, undefined),
    payload_signature: row.payload_signature || undefined,
  };
}

function createEmptyProgress(status = 'pending', total = 0) {
  return { status, completed: 0, total };
}

function buildRows(files) {
  const keyOrder = [];
  const rowsByKey = new Map();
  for (const file of files) {
    for (const item of file.metadata || []) {
      if (!rowsByKey.has(item.key)) {
        keyOrder.push(item.key);
        rowsByKey.set(item.key, { key: item.key, label: item.label, values: {}, duplicate_file_ids: [], same_day_file_ids: [] });
      }
      rowsByKey.get(item.key).values[file.file_id] = item.value;
    }
  }

  for (const key of keyOrder) {
    const row = rowsByKey.get(key);
    const normalizedToFiles = new Map();
    const dayToFiles = new Map();
    for (const file of files) {
      const item = (file.metadata || []).find((entry) => entry.key === key);
      if (!item?.comparable || !item.normalized) continue;
      if (item.date_comparable) {
        if (!item.date_day) continue;
        const list = dayToFiles.get(item.date_day) || [];
        list.push(file.file_id);
        dayToFiles.set(item.date_day, list);
        continue;
      }
      const list = normalizedToFiles.get(item.normalized) || [];
      list.push(file.file_id);
      normalizedToFiles.set(item.normalized, list);
    }
    row.duplicate_file_ids = Array.from(new Set(Array.from(normalizedToFiles.values()).filter((ids) => ids.length > 1).flat()));
    row.same_day_file_ids = Array.from(new Set(Array.from(dayToFiles.values()).filter((ids) => ids.length > 1).flat()));
  }

  return keyOrder.map((key) => rowsByKey.get(key));
}

function createSectionStats(section, analysis) {
  if (section === 'metadata') {
    return {
      contentExtraction: analysis.contentExtraction,
      metadataExtraction: analysis.metadataExtraction,
      logs: analysis.logs,
      files: Array.isArray(analysis.files)
        ? analysis.files.map((file) => ({ file_id: file.file_id, file_name: file.file_name, status: file.status, error: file.error }))
        : [],
    };
  }
  if (section === 'outline') {
    return {
      tenderSentenceCount: analysis.tenderSentenceCount,
      tenderMatchedItemCount: analysis.tenderMatchedItemCount,
      extraction: analysis.extraction,
      files: Array.isArray(analysis.files)
        ? analysis.files.map((file) => ({
            file_id: file.file_id,
            file_name: file.file_name,
            status: file.status,
            source: file.source,
            confidence: file.confidence,
            item_count: file.item_count,
            tender_matched_count: file.tender_matched_count,
            error: file.error,
          }))
        : [],
    };
  }
  if (section === 'content') {
    return {
      tenderSentenceCount: analysis.tenderSentenceCount,
      tenderMatchedSentenceCount: analysis.tenderMatchedSentenceCount,
      totalSentenceCount: analysis.totalSentenceCount,
      extraction: analysis.extraction,
    };
  }
  if (section === 'image') {
    return {
      extraction: analysis.extraction,
      totalImageCount: analysis.totalImageCount,
    };
  }
  return undefined;
}

function createDuplicateCheckStore({ app, db }) {
  const duplicateCheckDir = getDuplicateCheckDir(app);
  const contentDir = getDuplicateCheckContentDir(app);

  function ensureMetaRow() {
    const existing = db.prepare('SELECT * FROM duplicate_check_meta WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO duplicate_check_meta (id, step, active_analysis_tab, created_at, updated_at)
      VALUES (1, 'upload', 'metadata', @timestamp, @timestamp)
    `).run({ timestamp });
    return db.prepare('SELECT * FROM duplicate_check_meta WHERE id = 1').get();
  }

  function updateMeta(fields) {
    ensureMetaRow();
    const entries = Object.entries(fields || {}).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
    db.prepare(`UPDATE duplicate_check_meta SET ${assignments}, updated_at = @updated_at WHERE id = 1`).run({
      ...Object.fromEntries(entries),
      updated_at: now(),
    });
  }

  function loadFiles() {
    const rows = db.prepare('SELECT * FROM duplicate_check_files ORDER BY role ASC, sort_order ASC').all();
    const tenderRow = rows.find((row) => row.role === 'tender');
    const bidRows = rows.filter((row) => row.role === 'bid').sort((a, b) => a.sort_order - b.sort_order);
    return {
      tenderFile: tenderRow ? fileFromRow(tenderRow) : null,
      bidFiles: bidRows.map(fileFromRow),
    };
  }

  function replaceFiles(tenderFile, bidFiles) {
    db.prepare('DELETE FROM duplicate_check_files').run();
    const insert = db.prepare(`
      INSERT INTO duplicate_check_files (
        file_id, role, file_name, file_path, extension, size, modified_at, sort_order, content_hash, created_at, updated_at
      ) VALUES (
        @file_id, @role, @file_name, @file_path, @extension, @size, @modified_at, @sort_order, @content_hash, @created_at, @updated_at
      )
    `);
    const timestamp = now();
    const normalizedTender = normalizeFile(tenderFile);
    if (normalizedTender) {
      insert.run({
        file_id: normalizedTender.id,
        role: 'tender',
        file_name: normalizedTender.file_name,
        file_path: normalizedTender.file_path,
        extension: normalizedTender.extension,
        size: normalizedTender.size,
        modified_at: normalizedTender.modified_at,
        sort_order: 0,
        content_hash: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
    (Array.isArray(bidFiles) ? bidFiles : []).map(normalizeFile).filter(Boolean).forEach((file, index) => {
      insert.run({
        file_id: file.id,
        role: 'bid',
        file_name: file.file_name,
        file_path: file.file_path,
        extension: file.extension,
        size: file.size,
        modified_at: file.modified_at,
        sort_order: index,
        content_hash: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
    });
    updateMeta({ current_signature: createSignature({ tenderFile: normalizedTender, bidFiles }) });
  }

  function saveTask(type, task) {
    if (!task) {
      db.prepare('DELETE FROM duplicate_check_tasks WHERE type = ?').run(type);
      return;
    }
    const timestamp = now();
    db.prepare(`
      INSERT INTO duplicate_check_tasks (type, task_id, status, progress, logs_json, stats_json, error, payload_signature, started_at, updated_at)
      VALUES (@type, @task_id, @status, @progress, @logs_json, @stats_json, @error, @payload_signature, @started_at, @updated_at)
      ON CONFLICT(type) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        progress = excluded.progress,
        logs_json = excluded.logs_json,
        stats_json = excluded.stats_json,
        error = excluded.error,
        payload_signature = excluded.payload_signature,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at
    `).run({
      type,
      task_id: String(task.task_id || ''),
      status: String(task.status || 'running'),
      progress: Math.max(0, Math.min(100, Math.round(Number(task.progress || 0)))),
      logs_json: JSON.stringify(Array.isArray(task.logs) ? task.logs : []),
      stats_json: jsonOrNull(task.stats),
      error: task.error ? String(task.error) : null,
      payload_signature: task.payload_signature ? String(task.payload_signature) : null,
      started_at: task.started_at || timestamp,
      updated_at: task.updated_at || timestamp,
    });
  }

  function loadTask(type) {
    return taskFromRow(db.prepare('SELECT * FROM duplicate_check_tasks WHERE type = ?').get(type));
  }

  function saveSection(section, analysis) {
    if (!analysis) {
      clearSection(section);
      return;
    }

    const timestamp = now();
    db.prepare(`
      INSERT INTO duplicate_check_analysis_sections (section, status, progress, message, signature, stats_json, started_at, updated_at)
      VALUES (@section, @status, @progress, @message, @signature, @stats_json, @started_at, @updated_at)
      ON CONFLICT(section) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        message = excluded.message,
        signature = excluded.signature,
        stats_json = excluded.stats_json,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at
    `).run({
      section,
      status: String(analysis.status || 'pending'),
      progress: Math.max(0, Math.min(100, Math.round(Number(analysis.progress || 0)))),
      message: String(analysis.message || ''),
      signature: analysis.signature ? String(analysis.signature) : null,
      stats_json: jsonOrNull(createSectionStats(section, analysis)),
      started_at: analysis.started_at || timestamp,
      updated_at: analysis.updated_at || timestamp,
    });

    if (section === 'metadata') saveMetadataAnalysisDetails(analysis);
    if (section === 'outline') saveOutlineAnalysisDetails(analysis);
    if (section === 'content') saveContentAnalysisDetails(analysis);
    if (section === 'image') saveImageAnalysisDetails(analysis);
  }

  function clearSection(section) {
    db.prepare('DELETE FROM duplicate_check_analysis_sections WHERE section = ?').run(section);
    if (section === 'metadata') {
      db.prepare('DELETE FROM duplicate_check_content_files').run();
      db.prepare('DELETE FROM duplicate_check_metadata_items').run();
      db.prepare('UPDATE duplicate_check_files SET content_hash = NULL, updated_at = ?').run(now());
    }
    if (section === 'outline') {
      db.prepare('DELETE FROM duplicate_check_outline_items').run();
      db.prepare('DELETE FROM duplicate_check_outline_groups').run();
      db.prepare('DELETE FROM duplicate_check_outline_pairwise').run();
    }
    if (section === 'content') {
      db.prepare('DELETE FROM duplicate_check_content_occurrences').run();
      db.prepare('DELETE FROM duplicate_check_content_duplicates').run();
    }
    if (section === 'image') {
      db.prepare('DELETE FROM duplicate_check_image_occurrences').run();
      db.prepare('DELETE FROM duplicate_check_duplicate_images').run();
      db.prepare('DELETE FROM duplicate_check_image_files').run();
    }
  }

  function clearAnalysisState() {
    Object.keys(sectionFields).forEach(clearSection);
    db.prepare('DELETE FROM duplicate_check_tasks').run();
  }

  function saveMetadataAnalysisDetails(analysis) {
    db.prepare('DELETE FROM duplicate_check_content_files').run();
    db.prepare('DELETE FROM duplicate_check_metadata_items').run();
    const timestamp = now();
    db.prepare('UPDATE duplicate_check_files SET content_hash = NULL, updated_at = ?').run(timestamp);
    const contentInsert = db.prepare(`
      INSERT INTO duplicate_check_content_files (file_id, status, content_path, content_length, parser_label, error, updated_at)
      VALUES (@file_id, @status, @content_path, @content_length, @parser_label, @error, @updated_at)
    `);
    for (const item of Array.isArray(analysis.contentFiles) ? analysis.contentFiles : []) {
      if (!item?.file_id) continue;
      const contentHash = item.content_hash ? String(item.content_hash) : hashFileIfReadable(item.content_path);
      contentInsert.run({
        file_id: String(item.file_id),
        status: String(item.status || 'pending'),
        content_path: item.content_path ? String(item.content_path) : null,
        content_length: Number(item.content_length || 0),
        parser_label: item.parser_label ? String(item.parser_label) : null,
        error: item.error ? String(item.error) : null,
        updated_at: item.updated_at || timestamp,
      });
      db.prepare('UPDATE duplicate_check_files SET content_hash = @content_hash, updated_at = @updated_at WHERE file_id = @file_id').run({
        file_id: String(item.file_id),
        content_hash: contentHash,
        updated_at: item.updated_at || timestamp,
      });
    }

    const metadataInsert = db.prepare(`
      INSERT INTO duplicate_check_metadata_items (
        file_id, key, label, value, normalized, date_day, comparable, date_comparable, sort_order
      ) VALUES (
        @file_id, @key, @label, @value, @normalized, @date_day, @comparable, @date_comparable, @sort_order
      )
    `);
    for (const file of Array.isArray(analysis.files) ? analysis.files : []) {
      if (!file?.file_id) continue;
      (Array.isArray(file.metadata) ? file.metadata : []).forEach((item, index) => {
        if (!item?.key) return;
        metadataInsert.run({
          file_id: String(file.file_id),
          key: String(item.key),
          label: String(item.label || item.key),
          value: String(item.value || ''),
          normalized: item.normalized ? String(item.normalized) : null,
          date_day: item.date_day ? String(item.date_day) : null,
          comparable: toDbBool(item.comparable),
          date_comparable: toDbBool(item.date_comparable),
          sort_order: index,
        });
      });
    }
  }

  function saveOutlineAnalysisDetails(analysis) {
    db.prepare('DELETE FROM duplicate_check_outline_items').run();
    db.prepare('DELETE FROM duplicate_check_outline_groups').run();
    db.prepare('DELETE FROM duplicate_check_outline_pairwise').run();
    const itemInsert = db.prepare(`
      INSERT INTO duplicate_check_outline_items (
        item_id, file_id, parent_item_id, level, number, title, normalized_title, path_titles_json,
        normalized_path, source, confidence, sort_order, from_tender, matched_tender_sentence
      ) VALUES (
        @item_id, @file_id, @parent_item_id, @level, @number, @title, @normalized_title, @path_titles_json,
        @normalized_path, @source, @confidence, @sort_order, @from_tender, @matched_tender_sentence
      )
    `);
    for (const file of Array.isArray(analysis.files) ? analysis.files : []) {
      for (const item of Array.isArray(file.items) ? file.items : []) {
        if (!item?.id || !file?.file_id) continue;
        itemInsert.run({
          item_id: scopedOutlineItemId(file.file_id, item.id),
          file_id: String(file.file_id),
          parent_item_id: item.parent_id ? scopedOutlineItemId(file.file_id, item.parent_id) : null,
          level: Number(item.level || 1),
          number: item.number ? String(item.number) : null,
          title: String(item.title || ''),
          normalized_title: String(item.normalized_title || ''),
          path_titles_json: JSON.stringify(Array.isArray(item.path_titles) ? item.path_titles : []),
          normalized_path: String(item.normalized_path || ''),
          source: String(item.source || file.source || 'semantic'),
          confidence: Number(item.confidence ?? file.confidence ?? 0),
          sort_order: Number(item.order || 0),
          from_tender: toDbBool(item.from_tender),
          matched_tender_sentence: item.matched_tender_sentence ? String(item.matched_tender_sentence) : null,
        });
      }
    }

    const groupInsert = db.prepare(`
      INSERT INTO duplicate_check_outline_groups (group_id, type, title, score, file_ids_json, item_ids_json, paths_json, sort_order)
      VALUES (@group_id, @type, @title, @score, @file_ids_json, @item_ids_json, @paths_json, @sort_order)
    `);
    (Array.isArray(analysis.duplicateGroups) ? analysis.duplicateGroups : []).forEach((group, index) => {
      if (!group?.id) return;
      groupInsert.run({
        group_id: String(group.id),
        type: String(group.type || 'duplicate'),
        title: String(group.title || ''),
        score: Number(group.score || 0),
        file_ids_json: JSON.stringify(Array.isArray(group.file_ids) ? group.file_ids : []),
        item_ids_json: JSON.stringify(group.item_ids || {}),
        paths_json: JSON.stringify(group.paths || {}),
        sort_order: index,
      });
    });

    const pairwiseInsert = db.prepare(`
      INSERT INTO duplicate_check_outline_pairwise (
        file_a_id, file_b_id, score, title_overlap, path_overlap, order_similarity, shared_count, risk
      ) VALUES (
        @file_a_id, @file_b_id, @score, @title_overlap, @path_overlap, @order_similarity, @shared_count, @risk
      )
    `);
    for (const item of Array.isArray(analysis.pairwiseSimilarities) ? analysis.pairwiseSimilarities : []) {
      if (!item?.file_a_id || !item?.file_b_id) continue;
      pairwiseInsert.run({
        file_a_id: String(item.file_a_id),
        file_b_id: String(item.file_b_id),
        score: Number(item.score || 0),
        title_overlap: Number(item.title_overlap || 0),
        path_overlap: Number(item.path_overlap || 0),
        order_similarity: Number(item.order_similarity || 0),
        shared_count: Number(item.shared_count || 0),
        risk: String(item.risk || 'none'),
      });
    }
  }

  function saveContentAnalysisDetails(analysis) {
    db.prepare('DELETE FROM duplicate_check_content_occurrences').run();
    db.prepare('DELETE FROM duplicate_check_content_duplicates').run();
    const ignoredNormalizedSet = new Set(loadContentIgnoreRules().map((rule) => rule.normalized));
    const timestamp = now();
    const duplicateInsert = db.prepare(`
      INSERT INTO duplicate_check_content_duplicates (duplicate_id, sentence, normalized, file_ids_json, first_order, resolution_status, resolved_at)
      VALUES (@duplicate_id, @sentence, @normalized, @file_ids_json, @first_order, @resolution_status, @resolved_at)
    `);
    const occurrenceInsert = db.prepare(`
      INSERT INTO duplicate_check_content_occurrences (duplicate_id, file_id, occurrence_count)
      VALUES (@duplicate_id, @file_id, @occurrence_count)
    `);
    (Array.isArray(analysis.duplicateSentences) ? analysis.duplicateSentences : []).forEach((item, index) => {
      const duplicateId = item?.id || `C${String(index + 1).padStart(6, '0')}`;
      const normalized = String(item?.normalized || '');
      const inputStatus = normalizeResolutionStatus(item?.resolution_status);
      const matchedIgnoreRule = normalized && ignoredNormalizedSet.has(normalized);
      const resolutionStatus = inputStatus === 'pending' && matchedIgnoreRule ? 'ignored' : inputStatus;
      duplicateInsert.run({
        duplicate_id: duplicateId,
        sentence: String(item?.sentence || ''),
        normalized,
        file_ids_json: JSON.stringify(Array.isArray(item?.file_ids) ? item.file_ids : []),
        first_order: Number(item?.first_order ?? index),
        resolution_status: resolutionStatus,
        resolved_at: item?.resolved_at || (resolutionStatus === 'pending' ? null : timestamp),
      });
      for (const [fileId, count] of Object.entries(item?.occurrences || {})) {
        occurrenceInsert.run({ duplicate_id: duplicateId, file_id: fileId, occurrence_count: Number(count || 0) });
      }
    });
  }

  function saveImageAnalysisDetails(analysis) {
    db.prepare('DELETE FROM duplicate_check_image_occurrences').run();
    db.prepare('DELETE FROM duplicate_check_duplicate_images').run();
    db.prepare('DELETE FROM duplicate_check_image_files').run();
    const timestamp = now();
    const fileInsert = db.prepare(`
      INSERT INTO duplicate_check_image_files (file_id, status, image_count, unique_image_count, error, updated_at)
      VALUES (@file_id, @status, @image_count, @unique_image_count, @error, @updated_at)
    `);
    for (const file of Array.isArray(analysis.files) ? analysis.files : []) {
      if (!file?.file_id) continue;
      fileInsert.run({
        file_id: String(file.file_id),
        status: String(file.status || 'pending'),
        image_count: Number(file.image_count || 0),
        unique_image_count: Number(file.unique_image_count || 0),
        error: file.error ? String(file.error) : null,
        updated_at: file.updated_at || timestamp,
      });
    }

    const imageInsert = db.prepare(`
      INSERT INTO duplicate_check_duplicate_images (
        image_id, hash, preview_url, file_ids_json, sort_order, resolution_status, resolved_at,
        match_type, similarity_score, similarity_reason
      )
      VALUES (
        @image_id, @hash, @preview_url, @file_ids_json, @sort_order, @resolution_status, @resolved_at,
        @match_type, @similarity_score, @similarity_reason
      )
    `);
    const occurrenceInsert = db.prepare(`
      INSERT INTO duplicate_check_image_occurrences (image_id, file_id, occurrence_count, locations_json)
      VALUES (@image_id, @file_id, @occurrence_count, @locations_json)
    `);
    (Array.isArray(analysis.duplicateImages) ? analysis.duplicateImages : []).forEach((item, index) => {
      const imageId = item?.id || `I${String(index + 1).padStart(6, '0')}`;
      imageInsert.run({
        image_id: imageId,
        hash: String(item?.hash || ''),
        preview_url: String(item?.preview_url || ''),
        file_ids_json: JSON.stringify(Array.isArray(item?.file_ids) ? item.file_ids : []),
        sort_order: index,
        resolution_status: normalizeResolutionStatus(item?.resolution_status),
        resolved_at: item?.resolved_at || null,
        match_type: normalizeImageMatchType(item?.match_type),
        similarity_score: Number(item?.similarity_score || (normalizeImageMatchType(item?.match_type) === 'exact' ? 1 : 0)),
        similarity_reason: item?.similarity_reason ? String(item.similarity_reason) : null,
      });
      for (const [fileId, count] of Object.entries(item?.occurrences || {})) {
        occurrenceInsert.run({
          image_id: imageId,
          file_id: fileId,
          occurrence_count: Number(count || 0),
          locations_json: jsonOrNull(item?.locations?.[fileId]),
        });
      }
    });
  }

  function loadMetadataAnalysis(row) {
    if (!row) return undefined;
    const stats = safeJsonParse(row.stats_json, {});
    const contentFiles = db.prepare('SELECT * FROM duplicate_check_content_files ORDER BY file_id ASC').all().map((item) => ({
      file_id: item.file_id,
      file_name: loadFileName(item.file_id),
      status: normalizeStatus(item.status, ['pending', 'running', 'success', 'error'], 'pending'),
      content_path: item.content_path || undefined,
      content_length: Number(item.content_length || 0),
      parser_label: item.parser_label || undefined,
      error: item.error || undefined,
    }));
    const metadataRows = db.prepare('SELECT * FROM duplicate_check_metadata_items ORDER BY file_id ASC, sort_order ASC, id ASC').all();
    const statusByFile = new Map((stats.files || []).map((file) => [file.file_id, file]));
    const filesById = new Map();
    for (const file of loadFiles().bidFiles) {
      const summary = statusByFile.get(file.id) || {};
      filesById.set(file.id, { file_id: file.id, file_name: file.file_name, status: summary.status || 'pending', metadata: [], error: summary.error });
    }
    for (const item of metadataRows) {
      if (!filesById.has(item.file_id)) {
        const summary = statusByFile.get(item.file_id) || {};
        filesById.set(item.file_id, { file_id: item.file_id, file_name: loadFileName(item.file_id), status: summary.status || 'success', metadata: [], error: summary.error });
      }
      filesById.get(item.file_id).metadata.push({
        key: item.key,
        label: item.label,
        value: item.value || '',
        normalized: item.normalized || undefined,
        date_day: item.date_day || undefined,
        comparable: fromDbBool(item.comparable),
        date_comparable: fromDbBool(item.date_comparable),
      });
    }
    const files = Array.from(filesById.values());
    return {
      status: normalizeStatus(row.status, ['pending', 'running', 'success', 'error'], 'pending'),
      progress: Number(row.progress || 0),
      message: row.message || '',
      signature: row.signature || undefined,
      started_at: row.started_at || undefined,
      updated_at: row.updated_at || undefined,
      contentExtraction: stats.contentExtraction || createEmptyProgress('pending', contentFiles.length),
      metadataExtraction: stats.metadataExtraction || createEmptyProgress('pending', files.length),
      files,
      rows: buildRows(files),
      contentFiles,
      logs: Array.isArray(stats.logs) ? stats.logs : [],
    };
  }

  function loadOutlineAnalysis(row) {
    if (!row) return undefined;
    const stats = safeJsonParse(row.stats_json, {});
    const itemsByFile = new Map();
    for (const item of db.prepare('SELECT * FROM duplicate_check_outline_items ORDER BY file_id ASC, sort_order ASC').all()) {
      const list = itemsByFile.get(item.file_id) || [];
      list.push({
        id: unscopedOutlineItemId(item.item_id),
        level: Number(item.level || 1),
        number: item.number || undefined,
        title: item.title,
        normalized_title: item.normalized_title,
        path_titles: safeJsonParse(item.path_titles_json, []),
        normalized_path: item.normalized_path,
        source: item.source,
        confidence: Number(item.confidence || 0),
        order: Number(item.sort_order || 0),
        parent_id: item.parent_item_id ? unscopedOutlineItemId(item.parent_item_id) : undefined,
        from_tender: fromDbBool(item.from_tender),
        matched_tender_sentence: item.matched_tender_sentence || undefined,
        duplicate_group_ids: [],
        similar_group_ids: [],
      });
      itemsByFile.set(item.file_id, list);
    }
    const groupRows = db.prepare('SELECT * FROM duplicate_check_outline_groups ORDER BY sort_order ASC').all();
    const duplicateGroups = groupRows.map((group) => ({
      id: group.group_id,
      type: group.type,
      title: group.title,
      score: Number(group.score || 0),
      file_ids: safeJsonParse(group.file_ids_json, []),
      item_ids: safeJsonParse(group.item_ids_json, {}),
      paths: safeJsonParse(group.paths_json, {}),
    }));
    for (const group of duplicateGroups) {
      for (const [fileId, itemIds] of Object.entries(group.item_ids || {})) {
        const items = itemsByFile.get(fileId) || [];
        for (const itemId of Array.isArray(itemIds) ? itemIds : []) {
          const item = items.find((entry) => entry.id === itemId);
          if (item) {
            const field = group.type === 'similar' ? 'similar_group_ids' : 'duplicate_group_ids';
            if (!item[field].includes(group.id)) item[field].push(group.id);
          }
        }
      }
    }
    const summaryByFile = new Map((stats.files || []).map((file) => [file.file_id, file]));
    const files = loadFiles().bidFiles.map((file) => {
      const summary = summaryByFile.get(file.id) || {};
      const items = itemsByFile.get(file.id) || [];
      return {
        file_id: file.id,
        file_name: file.file_name,
        status: summary.status || (items.length ? 'success' : 'pending'),
        source: summary.source || items[0]?.source,
        confidence: Number(summary.confidence ?? items[0]?.confidence ?? 0),
        item_count: Number(summary.item_count ?? items.length),
        tender_matched_count: Number(summary.tender_matched_count ?? items.filter((item) => item.from_tender).length),
        items,
        error: summary.error,
      };
    });
    const pairwiseSimilarities = db.prepare('SELECT * FROM duplicate_check_outline_pairwise ORDER BY score DESC, id ASC').all().map((item) => ({
      file_a_id: item.file_a_id,
      file_b_id: item.file_b_id,
      score: Number(item.score || 0),
      title_overlap: Number(item.title_overlap || 0),
      path_overlap: Number(item.path_overlap || 0),
      order_similarity: Number(item.order_similarity || 0),
      shared_count: Number(item.shared_count || 0),
      risk: item.risk || 'none',
    }));
    return {
      status: normalizeStatus(row.status, ['pending', 'running', 'success', 'error'], 'pending'),
      progress: Number(row.progress || 0),
      message: row.message || '',
      signature: row.signature || undefined,
      started_at: row.started_at || undefined,
      updated_at: row.updated_at || undefined,
      tenderSentenceCount: Number(stats.tenderSentenceCount || 0),
      tenderMatchedItemCount: Number(stats.tenderMatchedItemCount || 0),
      extraction: stats.extraction || createEmptyProgress('pending', files.length),
      files,
      duplicateGroups,
      pairwiseSimilarities,
    };
  }

  function loadContentAnalysis(row) {
    if (!row) return undefined;
    const stats = safeJsonParse(row.stats_json, {});
    const occurrenceRows = db.prepare('SELECT * FROM duplicate_check_content_occurrences').all();
    const occurrenceMap = new Map();
    for (const rowItem of occurrenceRows) {
      const occurrences = occurrenceMap.get(rowItem.duplicate_id) || {};
      occurrences[rowItem.file_id] = Number(rowItem.occurrence_count || 0);
      occurrenceMap.set(rowItem.duplicate_id, occurrences);
    }
    const duplicateSentences = db.prepare('SELECT * FROM duplicate_check_content_duplicates ORDER BY first_order ASC').all().map((item) => ({
      id: item.duplicate_id,
      sentence: item.sentence,
      normalized: item.normalized,
      file_ids: safeJsonParse(item.file_ids_json, []),
      occurrences: occurrenceMap.get(item.duplicate_id) || {},
      first_order: Number(item.first_order || 0),
      resolution_status: normalizeResolutionStatus(item.resolution_status),
      resolved_at: item.resolved_at || undefined,
    }));
    return {
      status: normalizeStatus(row.status, ['pending', 'running', 'success', 'error'], 'pending'),
      progress: Number(row.progress || 0),
      message: row.message || '',
      signature: row.signature || undefined,
      started_at: row.started_at || undefined,
      updated_at: row.updated_at || undefined,
      tenderSentenceCount: Number(stats.tenderSentenceCount || 0),
      tenderMatchedSentenceCount: Number(stats.tenderMatchedSentenceCount || 0),
      totalSentenceCount: Number(stats.totalSentenceCount || 0),
      extraction: stats.extraction || createEmptyProgress('pending', loadFiles().bidFiles.length),
      duplicateSentences,
    };
  }

  function loadImageAnalysis(row) {
    if (!row) return undefined;
    const stats = safeJsonParse(row.stats_json, {});
    const files = db.prepare('SELECT * FROM duplicate_check_image_files ORDER BY file_id ASC').all().map((item) => ({
      file_id: item.file_id,
      file_name: loadFileName(item.file_id),
      status: normalizeStatus(item.status, ['pending', 'running', 'success', 'error'], 'pending'),
      image_count: Number(item.image_count || 0),
      unique_image_count: Number(item.unique_image_count || 0),
      error: item.error || undefined,
    }));
    const occurrenceRows = db.prepare('SELECT * FROM duplicate_check_image_occurrences').all();
    const occurrenceMap = new Map();
    const locationMap = new Map();
    for (const item of occurrenceRows) {
      const occurrences = occurrenceMap.get(item.image_id) || {};
      occurrences[item.file_id] = Number(item.occurrence_count || 0);
      occurrenceMap.set(item.image_id, occurrences);
      const locations = locationMap.get(item.image_id) || {};
      locations[item.file_id] = safeJsonParse(item.locations_json, []);
      locationMap.set(item.image_id, locations);
    }
    const duplicateImages = db.prepare('SELECT * FROM duplicate_check_duplicate_images ORDER BY sort_order ASC').all().map((item) => ({
      id: item.image_id,
      hash: item.hash,
      preview_url: item.preview_url,
      file_ids: safeJsonParse(item.file_ids_json, []),
      occurrences: occurrenceMap.get(item.image_id) || {},
      locations: locationMap.get(item.image_id) || {},
      resolution_status: normalizeResolutionStatus(item.resolution_status),
      resolved_at: item.resolved_at || undefined,
      match_type: normalizeImageMatchType(item.match_type),
      similarity_score: Number(item.similarity_score || (normalizeImageMatchType(item.match_type) === 'exact' ? 1 : 0)),
      similarity_reason: item.similarity_reason || undefined,
    }));
    return {
      status: normalizeStatus(row.status, ['pending', 'running', 'success', 'error'], 'pending'),
      progress: Number(row.progress || 0),
      message: row.message || '',
      signature: row.signature || undefined,
      started_at: row.started_at || undefined,
      updated_at: row.updated_at || undefined,
      extraction: stats.extraction || createEmptyProgress('pending', loadFiles().bidFiles.length),
      totalImageCount: Number(stats.totalImageCount || 0),
      files,
      duplicateImages,
    };
  }

  function loadFileName(fileId) {
    const row = db.prepare('SELECT file_name FROM duplicate_check_files WHERE file_id = ?').get(fileId);
    return row?.file_name || fileId;
  }

  function loadAnalysisSections() {
    const rows = db.prepare('SELECT * FROM duplicate_check_analysis_sections').all();
    const bySection = new Map(rows.map((row) => [row.section, row]));
    return {
      metadataAnalysis: loadMetadataAnalysis(bySection.get('metadata')),
      outlineAnalysis: loadOutlineAnalysis(bySection.get('outline')),
      contentAnalysis: loadContentAnalysis(bySection.get('content')),
      imageAnalysis: loadImageAnalysis(bySection.get('image')),
    };
  }

  const updateDuplicateCheckTransaction = db.transaction((partial) => {
    ensureMetaRow();
    const metaUpdates = {};
    if (hasOwn(partial, 'step')) metaUpdates.step = normalizeStep(partial.step);
    if (hasOwn(partial, 'activeAnalysisTab')) metaUpdates.active_analysis_tab = normalizeTab(partial.activeAnalysisTab);
    if (Object.keys(metaUpdates).length) updateMeta(metaUpdates);

    if (hasOwn(partial, 'tenderFile') || hasOwn(partial, 'bidFiles')) {
      const currentFiles = loadFiles();
      replaceFiles(
        hasOwn(partial, 'tenderFile') ? partial.tenderFile : currentFiles.tenderFile,
        hasOwn(partial, 'bidFiles') ? partial.bidFiles : currentFiles.bidFiles,
      );
    }

    if (hasOwn(partial, 'analysisTask')) saveTask('duplicate-analysis', partial.analysisTask);
    for (const [field, section] of Object.entries(fieldSections)) {
      if (hasOwn(partial, field)) saveSection(section, partial[field]);
    }
  });

  function loadDuplicateCheck() {
    const meta = ensureMetaRow();
    const files = loadFiles();
    return {
      ...initialState,
      ...files,
      step: normalizeStep(meta.step),
      activeAnalysisTab: normalizeTab(meta.active_analysis_tab),
      analysisTask: loadTask('duplicate-analysis'),
      contentIgnoreRules: loadContentIgnoreRules(),
      ...loadAnalysisSections(),
    };
  }

  function loadContentIgnoreRules() {
    return db.prepare(`
      SELECT rule_id, pattern, normalized, category, created_at, updated_at
      FROM duplicate_check_content_ignore_rules
      ORDER BY updated_at DESC, created_at DESC
    `).all().map((row) => ({
      rule_id: row.rule_id,
      pattern: row.pattern,
      normalized: row.normalized,
      category: normalizeContentIgnoreRuleCategory(row.category),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  function saveContentIgnoreRule({ pattern, normalized, category } = {}) {
    const displayPattern = String(pattern || '').trim();
    const normalizedText = normalizeContentIgnoreRuleText(normalized || displayPattern);
    if (!displayPattern || !normalizedText) {
      throw new Error('缺少要加入忽略规则的正文内容');
    }

    const timestamp = now();
    const ruleId = `RULE-${hashContent(normalizedText).slice(0, 16)}`;
    const normalizedCategory = normalizeContentIgnoreRuleCategory(category);
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO duplicate_check_content_ignore_rules (rule_id, pattern, normalized, category, created_at, updated_at)
        VALUES (@rule_id, @pattern, @normalized, @category, @created_at, @updated_at)
        ON CONFLICT(normalized) DO UPDATE SET
          pattern = excluded.pattern,
          category = excluded.category,
          updated_at = excluded.updated_at
      `).run({
        rule_id: ruleId,
        pattern: displayPattern,
        normalized: normalizedText,
        category: normalizedCategory,
        created_at: timestamp,
        updated_at: timestamp,
      });
      db.prepare(`
        UPDATE duplicate_check_content_duplicates
        SET resolution_status = 'ignored', resolved_at = @resolved_at
        WHERE normalized = @normalized AND resolution_status = 'pending'
      `).run({
        resolved_at: timestamp,
        normalized: normalizedText,
      });
    });
    transaction();
    return loadDuplicateCheck();
  }

  function deleteContentIgnoreRule(ruleId) {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) {
      throw new Error('缺少要删除的忽略规则');
    }
    db.prepare('DELETE FROM duplicate_check_content_ignore_rules WHERE rule_id = ?').run(normalizedRuleId);
    return loadDuplicateCheck();
  }

  function upsertContentIgnoreRules(rules) {
    const normalizedRules = Array.isArray(rules) ? rules : [];
    if (!normalizedRules.length) return 0;
    const timestamp = now();
    const insert = db.prepare(`
      INSERT INTO duplicate_check_content_ignore_rules (rule_id, pattern, normalized, category, created_at, updated_at)
      VALUES (@rule_id, @pattern, @normalized, @category, @created_at, @updated_at)
      ON CONFLICT(normalized) DO UPDATE SET
        pattern = excluded.pattern,
        category = excluded.category,
        updated_at = excluded.updated_at
    `);
    const markDuplicateIgnored = db.prepare(`
      UPDATE duplicate_check_content_duplicates
      SET resolution_status = 'ignored', resolved_at = @resolved_at
      WHERE normalized = @normalized AND resolution_status = 'pending'
    `);
    const transaction = db.transaction(() => {
      for (const rule of normalizedRules) {
        insert.run({
          rule_id: `RULE-${hashContent(rule.normalized).slice(0, 16)}`,
          pattern: rule.pattern,
          normalized: rule.normalized,
          category: normalizeContentIgnoreRuleCategory(rule.category),
          created_at: timestamp,
          updated_at: timestamp,
        });
        markDuplicateIgnored.run({
          resolved_at: timestamp,
          normalized: rule.normalized,
        });
      }
    });
    transaction();
    return normalizedRules.length;
  }

  async function exportContentIgnoreRules(options = {}) {
    const rules = loadContentIgnoreRules();
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出正文忽略规则',
        defaultPath: `标书查重正文忽略规则-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出' };
      }
      filePath = result.filePath;
    }
    const payload = buildContentIgnoreRulePackage(rules);
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    fs.writeFileSync(filePath, content, 'utf-8');
    return {
      success: true,
      message: `已导出 ${rules.length} 条正文忽略规则`,
      filePath,
      ruleCount: rules.length,
      bytes: Buffer.byteLength(content, 'utf-8'),
    };
  }

  async function importContentIgnoreRules(options = {}) {
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showOpenDialog({
        title: '导入正文忽略规则',
        properties: ['openFile'],
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, message: '已取消导入', state: loadDuplicateCheck() };
      }
      filePath = result.filePaths[0];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const { rules, skippedCount } = normalizeImportedContentIgnoreRules(parsed);
    const importedCount = upsertContentIgnoreRules(rules);
    const state = loadDuplicateCheck();
    return {
      success: true,
      message: `已导入 ${importedCount} 条正文忽略规则${skippedCount ? `，跳过 ${skippedCount} 条无效规则` : ''}`,
      filePath,
      importedCount,
      skippedCount,
      state,
    };
  }

  function updateDuplicateCheck(partial) {
    updateDuplicateCheckTransaction(partial || {});
    return loadDuplicateCheck();
  }

  function saveDuplicateCheck(state) {
    return updateDuplicateCheck(state || {});
  }

  function saveFiles({ tenderFile, bidFiles, step, activeAnalysisTab } = {}) {
    const transaction = db.transaction(() => {
      ensureMetaRow();
      replaceFiles(tenderFile || null, Array.isArray(bidFiles) ? bidFiles : []);
      clearAnalysisState();
      updateMeta({
        step: normalizeStep(step),
        active_analysis_tab: normalizeTab(activeAnalysisTab),
      });
    });
    transaction();
    clearDuplicateContentArtifacts();
    return loadDuplicateCheck();
  }

  function saveUiState({ step, activeAnalysisTab } = {}) {
    return updateDuplicateCheck({ step, activeAnalysisTab });
  }

  function resolveDuplicateItem({ section, itemId, status } = {}) {
    const normalizedSection = section === 'image' ? 'image' : section === 'content' ? 'content' : '';
    const normalizedStatus = normalizeResolutionStatus(status);
    const normalizedItemId = String(itemId || '').trim();
    if (!normalizedSection) {
      throw new Error('缺少要处理的查重结果类型');
    }
    if (!normalizedItemId) {
      throw new Error('缺少要处理的查重结果编号');
    }

    const tableName = normalizedSection === 'image' ? 'duplicate_check_duplicate_images' : 'duplicate_check_content_duplicates';
    const idColumn = normalizedSection === 'image' ? 'image_id' : 'duplicate_id';
    const result = db.prepare(`
      UPDATE ${tableName}
      SET resolution_status = @status, resolved_at = @resolved_at
      WHERE ${idColumn} = @item_id
    `).run({
      status: normalizedStatus,
      resolved_at: normalizedStatus === 'pending' ? null : now(),
      item_id: normalizedItemId,
    });
    if (!result.changes) {
      throw new Error('未找到要处理的查重结果');
    }
    return loadDuplicateCheck();
  }

  function getDuplicateItemTable(section) {
    const normalizedSection = section === 'image' ? 'image' : section === 'content' ? 'content' : '';
    if (!normalizedSection) {
      throw new Error('缺少要处理的查重结果类型');
    }
    return normalizedSection === 'image'
      ? { tableName: 'duplicate_check_duplicate_images', idColumn: 'image_id' }
      : { tableName: 'duplicate_check_content_duplicates', idColumn: 'duplicate_id' };
  }

  function normalizeDuplicateItemIds(itemIds) {
    const rawIds = Array.isArray(itemIds) ? itemIds : [];
    return [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }

  function batchHandleDuplicateItems({ section, itemIds, action, status } = {}) {
    const { tableName, idColumn } = getDuplicateItemTable(section);
    const ids = normalizeDuplicateItemIds(itemIds);
    const normalizedAction = action === 'delete' ? 'delete' : 'resolve';
    if (!ids.length) {
      throw new Error('缺少要批量处理的查重结果');
    }

    const transaction = db.transaction(() => {
      if (normalizedAction === 'delete') {
        const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
        ids.forEach((id) => stmt.run(id));
        return;
      }

      const normalizedStatus = normalizeResolutionStatus(status);
      const stmt = db.prepare(`
        UPDATE ${tableName}
        SET resolution_status = @status, resolved_at = @resolved_at
        WHERE ${idColumn} = @item_id
      `);
      const timestamp = now();
      ids.forEach((id) => stmt.run({
        status: normalizedStatus,
        resolved_at: normalizedStatus === 'pending' ? null : timestamp,
        item_id: id,
      }));
    });
    transaction();
    return loadDuplicateCheck();
  }

  async function exportDuplicateReport(options = {}) {
    const state = loadDuplicateCheck();
    const markdown = buildDuplicateCheckReportMarkdown(state);
    const requestedFormat = String(options.format || options.fileFormat || options.file_format || '').toLowerCase();
    const format = ['docx', 'pdf'].includes(requestedFormat) ? requestedFormat : 'md';
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出标书查重报告',
        defaultPath: `标书查重报告-${new Date().toISOString().slice(0, 10)}.${format}`,
        filters: [
          format === 'docx'
            ? { name: 'Word 文档', extensions: ['docx'] }
            : format === 'pdf'
              ? { name: 'PDF 文档', extensions: ['pdf'] }
            : { name: 'Markdown', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出' };
      }
      filePath = result.filePath;
    }
    if (format === 'docx') {
      const buffer = await buildDuplicateCheckReportDocxBuffer(state);
      fs.writeFileSync(filePath, buffer);
      return {
        success: true,
        message: '标书查重 Word 报告已导出',
        filePath,
        format,
        bytes: buffer.length,
        markdownChars: markdown.length,
      };
    }
    if (format === 'pdf') {
      const buffer = buildDuplicateCheckReportPdfBuffer(state);
      fs.writeFileSync(filePath, buffer);
      return {
        success: true,
        message: '标书查重 PDF 报告已导出',
        filePath,
        format,
        bytes: buffer.length,
        markdownChars: markdown.length,
      };
    }

    fs.writeFileSync(filePath, markdown, 'utf-8');
    return {
      success: true,
      message: '标书查重报告已导出',
      filePath,
      format,
      markdownChars: markdown.length,
    };
  }

  function clearDuplicateCheck() {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM duplicate_check_tasks').run();
      db.prepare('DELETE FROM duplicate_check_analysis_sections').run();
      db.prepare('DELETE FROM duplicate_check_image_occurrences').run();
      db.prepare('DELETE FROM duplicate_check_duplicate_images').run();
      db.prepare('DELETE FROM duplicate_check_image_files').run();
      db.prepare('DELETE FROM duplicate_check_content_occurrences').run();
      db.prepare('DELETE FROM duplicate_check_content_duplicates').run();
      db.prepare('DELETE FROM duplicate_check_outline_pairwise').run();
      db.prepare('DELETE FROM duplicate_check_outline_groups').run();
      db.prepare('DELETE FROM duplicate_check_outline_items').run();
      db.prepare('DELETE FROM duplicate_check_metadata_items').run();
      db.prepare('DELETE FROM duplicate_check_content_files').run();
      db.prepare('DELETE FROM duplicate_check_files').run();
      db.prepare('DELETE FROM duplicate_check_meta').run();
      ensureMetaRow();
    });
    transaction();
    if (fs.existsSync(duplicateCheckDir)) {
      fs.rmSync(duplicateCheckDir, { recursive: true, force: true });
    }
    deleteImportedImageBatches(app, 'duplicate-check-content');
    ensureDirectories();
    return { success: true, message: '标书查重缓存已清空', state: loadDuplicateCheck() };
  }

  function clearDuplicateContentArtifacts() {
    if (fs.existsSync(contentDir)) {
      fs.rmSync(contentDir, { recursive: true, force: true });
    }
    fs.mkdirSync(contentDir, { recursive: true });
    deleteImportedImageBatches(app, 'duplicate-check-content');
  }

  function ensureDirectories() {
    fs.mkdirSync(duplicateCheckDir, { recursive: true });
    fs.mkdirSync(contentDir, { recursive: true });
  }

  ensureDirectories();

  return {
    loadDuplicateCheck,
    saveDuplicateCheck,
    updateDuplicateCheck,
    clearDuplicateCheck,
    saveFiles,
    saveUiState,
    resolveDuplicateItem,
    batchHandleDuplicateItems,
    saveContentIgnoreRule,
    deleteContentIgnoreRule,
    exportContentIgnoreRules,
    importContentIgnoreRules,
    exportDuplicateReport,
  };
}

module.exports = {
  createDuplicateCheckStore,
  buildContentIgnoreRulePackage,
  normalizeImportedContentIgnoreRules,
  buildDuplicateCheckReportMarkdown,
  buildDuplicateCheckReportDocxBuffer,
  buildDuplicateCheckReportPdfBuffer,
  markdownReportToDocxChildren,
};
