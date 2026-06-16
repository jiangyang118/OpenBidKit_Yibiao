const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { imageSize } = require('image-size');
const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const { getImportedImagesDir, getRejectionCheckDir, getRejectionCheckDocumentMarkdownPath } = require('../utils/paths.cjs');
const { deleteImportedImageBatches, deleteImportedImageBatchesForExactScope } = require('../utils/importedImages.cjs');

const initialState = {
  tenderDocument: null,
  bidDocuments: [],
  activeDocumentTab: 'tender',
  step: 'documents',
  activeResultTab: 'analysis',
  activeCheckResultTab: 'rejection',
  invalidBidAndRejectionItems: { status: 'idle', content: '' },
  customCheckItems: '',
  checkOptions: { rejectionCheck: true, typoCheck: true, logicCheck: true },
  rejectionCheckResult: { status: 'idle', findings: [] },
  typoCheckResult: { status: 'idle', findings: [] },
  logicCheckResult: { status: 'idle', findings: [] },
  extractionTask: undefined,
  checkTask: undefined,
};

const taskFieldTypes = {
  extractionTask: 'rejection-items-extraction',
  checkTask: 'rejection-check-run',
};

const taskTypeFields = Object.fromEntries(Object.entries(taskFieldTypes).map(([field, type]) => [type, field]));

const resultFieldTypes = {
  rejectionCheckResult: 'rejection',
  typoCheckResult: 'typo',
  logicCheckResult: 'logic',
};

const resultTypeFields = Object.fromEntries(Object.entries(resultFieldTypes).map(([field, type]) => [type, field]));

const tenderDocumentId = 'tender';

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

function stableHash(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeStep(value) {
  return value === 'items' || value === 'results' ? value : 'documents';
}

function normalizeDocumentRole(value) {
  return value === 'bid' ? 'bid' : 'tender';
}

function normalizeDocumentTab(value) {
  const tab = String(value || '').trim();
  return tab || 'tender';
}

function normalizeResultTab(value) {
  return value === 'custom' ? 'custom' : 'analysis';
}

function normalizeCheckResultTab(value) {
  return ['rejection', 'typo', 'logic'].includes(value) ? value : 'rejection';
}

function normalizeCheckOptions(options) {
  return {
    rejectionCheck: true,
    typoCheck: options?.typoCheck !== false,
    logicCheck: options?.logicCheck !== false,
  };
}

function normalizeResolutionStatus(value) {
  return ['pending', 'ignored'].includes(value) ? value : 'pending';
}

function resolutionStatusLabel(value) {
  return normalizeResolutionStatus(value) === 'ignored' ? '已忽略' : '未处理';
}

function stripTripleQuoteWrapper(content) {
  const trimmed = String(content || '').trim();
  if (trimmed.startsWith("'''") && trimmed.endsWith("'''")) {
    return trimmed.slice(3, -3).trim();
  }
  return String(content || '');
}

function resultStatusLabel(value) {
  const status = normalizeStatus(value, ['idle', 'running', 'success', 'error'], 'idle');
  if (status === 'running') return '检查中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '检查失败';
  return '待检查';
}

function extractionStatusLabel(value) {
  const status = normalizeStatus(value, ['idle', 'running', 'success', 'error'], 'idle');
  if (status === 'running') return '解析中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '解析失败';
  return '待解析';
}

function severityLabel(value) {
  if (value === 'high') return '高风险';
  if (value === 'low') return '低风险';
  return '中风险';
}

function findingTypeLabel(value) {
  return value === 'invalidBid' ? '无效标' : '废标项';
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

function resolveReportAssetPath(app, value) {
  if (!app?.getPath) return null;
  const source = String(value || '').trim();
  if (!source) return null;
  if (path.isAbsolute(source)) return source;
  if (!/^yibiao-asset:\/\//i.test(source)) return null;

  try {
    const assetUrl = new URL(source);
    const assetRoots = {
      'imported-images': getImportedImagesDir(app),
    };
    const rootDir = assetRoots[assetUrl.hostname];
    if (!rootDir) return null;
    const relativePath = decodeURIComponent(assetUrl.pathname.replace(/^\/+/, ''));
    if (!relativePath) return null;
    const baseDir = path.resolve(rootDir);
    const resolvedPath = path.resolve(baseDir, relativePath);
    if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) return null;
    return resolvedPath;
  } catch {
    return null;
  }
}

function createDocxImageParagraph(markdownImage, context = {}) {
  const match = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(String(markdownImage || '').trim());
  if (!match) return null;
  const imagePath = resolveReportAssetPath(context.app, match[2]);
  if (!imagePath || !fs.existsSync(imagePath)) return null;

  try {
    const buffer = fs.readFileSync(imagePath);
    const size = imageSize(buffer);
    const width = Math.max(1, Number(size.width || 1));
    const height = Math.max(1, Number(size.height || 1));
    const maxWidth = 420;
    const scale = Math.min(1, maxWidth / width);
    return new Paragraph({
      spacing: { after: 120 },
      children: [
        new ImageRun({
          data: buffer,
          transformation: {
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          },
          type: 'png',
          altText: {
            title: match[1] || '证据裁剪图',
            description: match[1] || '证据裁剪图',
            name: match[1] || '证据裁剪图',
          },
        }),
      ],
    });
  } catch {
    return null;
  }
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

function markdownReportToDocxChildren(markdown, context = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const children = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || /^<a\s+id="[^"]+"\s*><\/a>$/i.test(trimmed)) continue;

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

    if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)) {
      const imageParagraph = createDocxImageParagraph(trimmed, context);
      if (imageParagraph) {
        children.push(imageParagraph);
        continue;
      }
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      if (/^!\[[^\]]*\]\([^)]+\)$/.test(bullet[1].trim())) {
        const imageParagraph = createDocxImageParagraph(bullet[1].trim(), context);
        if (imageParagraph) {
          children.push(imageParagraph);
          continue;
        }
      }
      children.push(createDocxParagraph(stripMarkdownInline(bullet[1]), { bullet: true }));
      continue;
    }

    children.push(createDocxParagraph(stripMarkdownInline(trimmed)));
  }
  return children.length ? children : [createDocxParagraph('暂无报告内容')];
}

async function buildRejectionCheckReportDocxBuffer(state, options = {}) {
  const markdown = options.markdown || (options.app
    ? await buildRejectionCheckReportMarkdownWithEvidenceCrops(state, options.app)
    : buildRejectionCheckReportMarkdown(state));
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: 21 },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
      },
    },
    sections: [{ children: markdownReportToDocxChildren(markdown, { app: options.app }) }],
  });
  return Packer.toBuffer(doc);
}

function markdownReportToPdfLines(markdown) {
  const output = [];
  const lines = String(markdown || '').split(/\r?\n/);
  let inEvidenceSnapshot = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || /^<a\s+id="[^"]+"\s*><\/a>$/i.test(trimmed) || isMarkdownTableDelimiter(trimmed)) {
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      inEvidenceSnapshot = heading[2].trim() === '证据截图视图';
      output.push({
        text: stripMarkdownInline(heading[2]),
        size: heading[1].length === 1 ? 17 : heading[1].length === 2 ? 14 : 12,
        gapBefore: heading[1].length === 1 ? 16 : 10,
        bold: true,
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
      if (inEvidenceSnapshot && (/^(?:▶\s*)?第\s*\d+\s*行\s*\|/.test(text) || text.startsWith('[页面截图]'))) {
        output.push({
          type: 'evidence-card-line',
          text,
          target: text.startsWith('▶') || text.startsWith('[页面截图] 裁剪状态：已提供裁剪框'),
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

function buildSimpleCjkPdf(textBlocks, options = {}) {
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
    const isEvidenceLine = block.type === 'evidence-card-line';
    const lineHeight = isEvidenceLine ? 20 : Math.max(14, size + 5);
    const wrappedLines = wrapPdfText(block.text, size >= 14 ? 48 : 72);
    y -= Number(block.gapBefore || 4);
    for (const line of wrappedLines) {
      if (y < bottomY) pushPage();
      current.push({
        text: line,
        x: isEvidenceLine ? marginX + 12 : marginX,
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
        if (line.type !== 'evidence-card-line') return [textCommand];
        const fill = line.target ? '0.90 0.94 1 rg' : '0.96 0.98 1 rg';
        const stroke = line.target ? '0.20 0.45 0.88 RG' : '0.72 0.78 0.88 RG';
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

  if (options.title) {
    objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  }

  return createPdfObjectStream(objects);
}

function buildRejectionCheckReportPdfBuffer(state, options = {}) {
  const markdown = options.markdown || buildRejectionCheckReportMarkdown(state);
  return buildSimpleCjkPdf(markdownReportToPdfLines(markdown), { title: '废标项检查报告' });
}

function documentLabel(bidDocuments = [], documentId = '') {
  const index = bidDocuments.findIndex((document) => document.id === documentId);
  if (index >= 0) return `投标文件${index + 1}（${bidDocuments[index].fileName}）`;
  return documentId || '投标文件';
}

function detailText(value) {
  return String(value ?? '').trim() || '-';
}

function safeAnchorId(value) {
  const raw = String(value || '').trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || stableHash(raw).slice(0, 12);
}

function compactDetail(value, maxLength = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function splitEvidenceCandidates(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const candidates = [text];
  text
    .split(/[\r\n。！？!?；;，,]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6)
    .forEach((item) => candidates.push(item));
  return [...new Set(candidates)].sort((left, right) => right.length - left.length);
}

function findNearestHeading(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const line = String(lines[index] || '').trim();
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (headingMatch) return headingMatch[1].trim();
    if (line && line.length <= 80 && /^(?:第[一二三四五六七八九十百千万零〇\d]+[章节部分]|[一二三四五六七八九十百千万零〇\d]+[、.．]|[(（][一二三四五六七八九十百千万零〇\d]+[)）])/.test(line)) {
      return line;
    }
  }
  return '';
}

function normalizePageScreenshotList(document) {
  const candidates = [
    document?.pageScreenshots,
    document?.page_screenshots,
    document?.pageImages,
    document?.page_images,
    document?.sourcePageImages,
    document?.source_page_images,
  ];
  const list = candidates.find((value) => Array.isArray(value));
  return Array.isArray(list) ? list : [];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function screenshotPageNumber(screenshot, fallbackIndex) {
  return numberOrNull(screenshot?.pageNumber ?? screenshot?.page_number ?? screenshot?.page ?? screenshot?.pageIndex ?? screenshot?.page_index)
    ?? fallbackIndex + 1;
}

function screenshotLineStart(screenshot) {
  return numberOrNull(screenshot?.lineStart ?? screenshot?.line_start ?? screenshot?.startLine ?? screenshot?.start_line);
}

function screenshotLineEnd(screenshot) {
  return numberOrNull(screenshot?.lineEnd ?? screenshot?.line_end ?? screenshot?.endLine ?? screenshot?.end_line);
}

function screenshotAssetLabel(screenshot) {
  return String(
    screenshot?.assetUrl
    || screenshot?.asset_url
    || screenshot?.imageUrl
    || screenshot?.image_url
    || screenshot?.previewUrl
    || screenshot?.preview_url
    || screenshot?.filePath
    || screenshot?.file_path
    || screenshot?.path
    || '',
  ).trim();
}

function normalizeCropBox(crop) {
  if (!crop || typeof crop !== 'object') return '';
  const left = crop.left ?? crop.x;
  const top = crop.top ?? crop.y;
  const width = crop.width ?? crop.w;
  const height = crop.height ?? crop.h;
  if ([left, top, width, height].some((value) => value === undefined || value === null || value === '')) return '';
  const normalized = {
    x: Number(left),
    y: Number(top),
    w: Number(width),
    h: Number(height),
  };
  return [normalized.x, normalized.y, normalized.w, normalized.h].every((value) => Number.isFinite(value) && value >= 0)
    && normalized.w > 0
    && normalized.h > 0
    ? normalized
    : '';
}

function formatCropBox(crop) {
  const normalized = normalizeCropBox(crop);
  if (!normalized) return '';
  return `x=${normalized.x}, y=${normalized.y}, w=${normalized.w}, h=${normalized.h}`;
}

function screenshotCropBox(screenshot) {
  return normalizeCropBox(screenshot?.crop || screenshot?.cropBox || screenshot?.crop_box || screenshot?.bbox || screenshot?.boundingBox || screenshot?.bounding_box);
}

function screenshotCropLabel(screenshot) {
  return formatCropBox(screenshotCropBox(screenshot));
}

function screenshotDimension(screenshot, key, fallback) {
  const value = screenshot?.[key]
    ?? screenshot?.[`page_${key}`]
    ?? screenshot?.[`page${key.slice(0, 1).toUpperCase()}${key.slice(1)}`]
    ?? screenshot?.dimensions?.[key]
    ?? screenshot?.size?.[key]
    ?? fallback;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createAutoEvidenceCropBox(screenshot, snapshot) {
  const lineNumber = Number(snapshot?.lineNumber || 0);
  const lineStart = screenshotLineStart(screenshot);
  const lineEnd = screenshotLineEnd(screenshot);
  if (!lineNumber || lineStart === null || lineEnd === null || lineNumber < lineStart || lineNumber > lineEnd) return '';

  const pageWidth = screenshotDimension(screenshot, 'width', 1000);
  const pageHeight = screenshotDimension(screenshot, 'height', 1414);
  const horizontalMargin = Math.max(40, Math.round(pageWidth * 0.08));
  const verticalMargin = Math.max(60, Math.round(pageHeight * 0.08));
  const usableHeight = Math.max(1, pageHeight - verticalMargin * 2);
  const totalLines = Math.max(1, lineEnd - lineStart + 1);
  const lineOffset = Math.max(0, Math.min(totalLines - 1, lineNumber - lineStart));
  const lineCenter = verticalMargin + ((lineOffset + 0.5) / totalLines) * usableHeight;
  const cropHeight = Math.max(120, Math.min(Math.round(pageHeight * 0.18), Math.round((usableHeight / totalLines) * 3)));
  const top = Math.max(0, Math.min(pageHeight - cropHeight, Math.round(lineCenter - cropHeight / 2)));
  return { x: horizontalMargin, y: top, w: Math.max(1, pageWidth - horizontalMargin * 2), h: cropHeight };
}

function createAutoEvidenceCropLabel(screenshot, snapshot) {
  return formatCropBox(createAutoEvidenceCropBox(screenshot, snapshot));
}

function createEvidenceCropKey(request) {
  return stableHash(JSON.stringify({
    asset: request.asset,
    cropBox: request.cropBox,
    pageWidth: request.pageWidth,
    pageHeight: request.pageHeight,
    pageNumber: request.pageNumber,
  }));
}

function createEvidenceCropRequest(document, snapshot, screenshot) {
  const cropBox = screenshot.cropBox || screenshot.autoCropBox;
  if (!screenshot.asset || !cropBox) return null;
  const request = {
    asset: screenshot.asset,
    cropBox,
    pageWidth: screenshot.pageWidth,
    pageHeight: screenshot.pageHeight,
    pageNumber: screenshot.pageNumber,
    documentId: document?.id || '',
    lineNumber: snapshot?.lineNumber || '',
  };
  return { ...request, key: createEvidenceCropKey(request) };
}

async function createEvidenceCropAsset(app, request) {
  if (!app?.getPath || !request?.asset || !request?.cropBox) return '';
  let canvasModule = null;
  try {
    canvasModule = require('@napi-rs/canvas');
  } catch {
    return '';
  }
  if (!canvasModule?.loadImage || !canvasModule?.createCanvas) return '';

  const sourcePath = resolveReportAssetPath(app, request.asset);
  if (!sourcePath || !fs.existsSync(sourcePath)) return '';

  try {
    const image = await canvasModule.loadImage(sourcePath);
    const pageWidth = Number(request.pageWidth || image.width || 1);
    const pageHeight = Number(request.pageHeight || image.height || 1);
    const scaleX = image.width / Math.max(1, pageWidth);
    const scaleY = image.height / Math.max(1, pageHeight);
    const sourceX = Math.max(0, Math.min(image.width - 1, Math.round(request.cropBox.x * scaleX)));
    const sourceY = Math.max(0, Math.min(image.height - 1, Math.round(request.cropBox.y * scaleY)));
    const sourceWidth = Math.max(1, Math.min(image.width - sourceX, Math.round(request.cropBox.w * scaleX)));
    const sourceHeight = Math.max(1, Math.min(image.height - sourceY, Math.round(request.cropBox.h * scaleY)));
    const outputCanvas = canvasModule.createCanvas(sourceWidth, sourceHeight);
    const context = outputCanvas.getContext('2d');
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    const outputBuffer = outputCanvas.toBuffer('image/png');
    const scope = 'rejection-check-evidence-crops';
    const fileName = `crop-${request.key.slice(0, 20)}.png`;
    const targetDir = path.join(getImportedImagesDir(app), scope);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, fileName), outputBuffer);
    return `yibiao-asset://imported-images/${encodeURIComponent(scope)}/${encodeURIComponent(fileName)}`;
  } catch {
    return '';
  }
}

async function buildRejectionCheckReportMarkdownWithEvidenceCrops(state, app) {
  if (!app?.getPath) return buildRejectionCheckReportMarkdown(state);
  const requests = new Map();
  buildRejectionCheckReportMarkdown(state, {
    collectEvidenceCropRequest: (request) => {
      if (request?.key) requests.set(request.key, request);
    },
  });
  if (!requests.size) return buildRejectionCheckReportMarkdown(state);

  const evidenceCropAssets = new Map();
  for (const request of requests.values()) {
    const assetUrl = await createEvidenceCropAsset(app, request);
    if (assetUrl) evidenceCropAssets.set(request.key, assetUrl);
  }
  return buildRejectionCheckReportMarkdown(state, { evidenceCropAssets });
}

function findEvidencePageScreenshot(document, snapshot) {
  const screenshots = normalizePageScreenshotList(document);
  if (!screenshots.length || !snapshot?.matched) return null;
  const lineNumber = Number(snapshot.lineNumber || 0);
  let fallback = null;
  for (let index = 0; index < screenshots.length; index += 1) {
    const screenshot = screenshots[index];
    const pageNumber = screenshotPageNumber(screenshot, index);
    const lineStart = screenshotLineStart(screenshot);
    const lineEnd = screenshotLineEnd(screenshot);
    const cropBox = screenshotCropBox(screenshot);
    const autoCropBox = createAutoEvidenceCropBox(screenshot, snapshot);
    const candidate = {
      pageNumber,
      lineStart,
      lineEnd,
      asset: screenshotAssetLabel(screenshot),
      crop: formatCropBox(cropBox),
      cropBox,
      autoCrop: formatCropBox(autoCropBox),
      autoCropBox,
      pageWidth: screenshotDimension(screenshot, 'width', null),
      pageHeight: screenshotDimension(screenshot, 'height', null),
      note: String(screenshot?.note || screenshot?.description || '').trim(),
    };
    if (!fallback) fallback = candidate;
    if (lineNumber && lineStart !== null && lineEnd !== null && lineNumber >= lineStart && lineNumber <= lineEnd) {
      return { ...candidate, matchedByLineRange: true };
    }
  }
  return fallback ? { ...fallback, matchedByLineRange: false } : null;
}

function buildPageScreenshotSnapshotLines(document, snapshot, context = {}) {
  const screenshot = findEvidencePageScreenshot(document, snapshot);
  if (!screenshot) return [];
  const cropStatus = screenshot.crop
    ? `已提供裁剪框：${screenshot.crop}`
    : screenshot.autoCrop
      ? `自动生成裁剪框：${screenshot.autoCrop}`
    : snapshot?.lineNumber
      ? `已定位到第 ${snapshot.lineNumber} 行，待接入页面图裁剪坐标。`
      : '已找到页面截图候选，待接入页面图裁剪坐标。';
  const lines = [
    `[页面截图] 页面：第 ${screenshot.pageNumber} 页${screenshot.matchedByLineRange ? '（按行号范围匹配）' : '（候选页）'}`,
    `[页面截图] 素材：${screenshot.asset || '未提供页面图片路径'}`,
    `[页面截图] 裁剪状态：${cropStatus}`,
    ...(screenshot.note ? [`[页面截图] 说明：${screenshot.note}`] : []),
  ];
  const cropRequest = createEvidenceCropRequest(document, snapshot, screenshot);
  if (cropRequest) {
    if (typeof context.collectEvidenceCropRequest === 'function') {
      context.collectEvidenceCropRequest(cropRequest);
    }
    const cropAssetUrl = context.evidenceCropAssets?.get(cropRequest.key) || '';
    if (cropAssetUrl) {
      lines.push(`[页面截图] 裁剪图：${cropAssetUrl}`);
      lines.push(`![证据裁剪图](${cropAssetUrl})`);
    }
  }
  return lines;
}

function createEvidenceContextSnapshot(bidDocuments = [], bidDocumentId = '', evidenceText = '') {
  const document = bidDocuments.find((item) => item.id === bidDocumentId);
  const content = String(document?.content || '');
  if (!document || !content.trim()) return null;

  const candidates = splitEvidenceCandidates(evidenceText);
  let matchIndex = -1;
  let matchedText = '';
  for (const candidate of candidates) {
    matchIndex = content.indexOf(candidate);
    if (matchIndex >= 0) {
      matchedText = candidate;
      break;
    }
  }
  if (matchIndex < 0) {
    return {
      matched: false,
      locationText: '未在投标文件正文中精确定位，请按原文证据人工检索。',
      snapshotLines: ['未生成文本截图视图：未在投标文件正文中精确定位。'],
    };
  }

  const before = content.slice(0, matchIndex);
  const lineIndex = before.split(/\r\n|\r|\n/).length - 1;
  const lines = content.split(/\r\n|\r|\n/);
  const contextStartLine = Math.max(0, lineIndex - 1);
  const contextEndLine = Math.min(lines.length - 1, lineIndex + 1);
  const snapshotStartLine = Math.max(0, lineIndex - 2);
  const snapshotEndLine = Math.min(lines.length - 1, lineIndex + 2);
  const context = lines.slice(contextStartLine, contextEndLine + 1)
    .map((line, offset) => {
      const currentLine = contextStartLine + offset + 1;
      return `${currentLine}: ${String(line || '').trim()}`;
    })
    .join(' / ');
  const heading = findNearestHeading(lines, lineIndex);
  const locationText = [
    heading ? `章节：${heading}` : '',
    `行号：第 ${lineIndex + 1} 行附近`,
    `匹配：${compactDetail(matchedText, 80)}`,
    `前后文：${compactDetail(context)}`,
  ].filter(Boolean).join('；');
  const snapshotLines = lines.slice(snapshotStartLine, snapshotEndLine + 1).map((line, offset) => {
    const currentLine = snapshotStartLine + offset + 1;
    const marker = currentLine === lineIndex + 1 ? '▶' : ' ';
    return `${marker} 第 ${currentLine} 行 | ${String(line || '').trim() || '（空行）'}`;
  });
  return {
    matched: true,
    locationText,
    snapshotLines,
    lineNumber: lineIndex + 1,
    heading,
  };
}

function findEvidenceContext(bidDocuments = [], bidDocumentId = '', evidenceText = '') {
  const snapshot = createEvidenceContextSnapshot(bidDocuments, bidDocumentId, evidenceText);
  return snapshot?.locationText || '';
}

function pushEvidenceDetailBlock(lines, title, details, anchorId, snapshotLines = [], pageSnapshotLines = []) {
  if (anchorId) lines.push(`<a id="${anchorId}"></a>`, '');
  lines.push(`### ${title}`, '');
  details.forEach(([label, value]) => {
    lines.push(`- ${label}：${detailText(value)}`);
  });
  if (snapshotLines.length || pageSnapshotLines.length) {
    lines.push('', '#### 证据截图视图', '');
    lines.push('以下为文本型截图视图，保留目标行、前后文和可用页面截图候选，便于在 Markdown、Word 和 PDF 中复核证据。', '');
    snapshotLines.forEach((line) => {
      lines.push(`- ${line}`);
    });
    pageSnapshotLines.forEach((line) => {
      lines.push(`- ${line}`);
    });
  }
  lines.push('');
}

function buildRejectionCheckReportMarkdown(state, context = {}) {
  const bidDocuments = Array.isArray(state.bidDocuments) ? state.bidDocuments : [];
  const extraction = state.invalidBidAndRejectionItems || {};
  const rejection = state.rejectionCheckResult || { status: 'idle', findings: [] };
  const typo = state.typoCheckResult || { status: 'idle', findings: [] };
  const logic = state.logicCheckResult || { status: 'idle', findings: [] };
  const rejectionFindings = Array.isArray(rejection.findings) ? rejection.findings : [];
  const typoFindings = Array.isArray(typo.findings) ? typo.findings : [];
  const logicFindings = Array.isArray(logic.findings) ? logic.findings : [];
  const visibleRejectionFindings = rejectionFindings.filter((item) => normalizeResolutionStatus(item.resolution_status) !== 'ignored');
  const visibleTypoFindings = typoFindings.filter((item) => normalizeResolutionStatus(item.resolution_status) !== 'ignored');
  const visibleLogicFindings = logicFindings.filter((item) => normalizeResolutionStatus(item.resolution_status) !== 'ignored');
  const ignoredCount = rejectionFindings.length + typoFindings.length + logicFindings.length
    - visibleRejectionFindings.length - visibleTypoFindings.length - visibleLogicFindings.length;
  const highRiskCount = visibleRejectionFindings.filter((item) => item.severity === 'high').length;
  const mediumRiskCount = visibleRejectionFindings.filter((item) => item.severity === 'medium').length;
  const lowRiskCount = visibleRejectionFindings.filter((item) => item.severity === 'low').length;
  const lines = [
    '# 废标项检查报告',
    '',
    `生成时间：${now()}`,
    '',
    '## 文件范围',
    '',
    `- 招标文件：${state.tenderDocument?.fileName || '未导入'}`,
    `- 投标文件：${bidDocuments.length} 份`,
    ...bidDocuments.map((document, index) => `  - ${index + 1}. ${document.fileName}`),
    '',
    '## 检查摘要',
    '',
    '| 检查项 | 状态 | 结果 |',
    '| --- | --- | --- |',
    `| 无效与废标项解析 | ${extractionStatusLabel(extraction.status)} | ${markdownCell(extraction.content ? `${String(extraction.content).trim().length} 字` : extraction.error || '暂无解析结果')} |`,
    `| 废标项检查 | ${resultStatusLabel(rejection.status)} | ${visibleRejectionFindings.length} 个未忽略风险项，高 ${highRiskCount} / 中 ${mediumRiskCount} / 低 ${lowRiskCount} |`,
    `| 错别字检查 | ${resultStatusLabel(typo.status)} | ${visibleTypoFindings.length} 个未忽略疑似错别字 |`,
    `| 逻辑谬误检查 | ${resultStatusLabel(logic.status)} | ${visibleLogicFindings.length} 个未忽略逻辑问题 |`,
    `| 人工处理 | - | 已忽略 ${ignoredCount} 个结果项 |`,
    '',
  ];

  if (state.customCheckItems?.trim()) {
    lines.push('## 自定义检查项', '', state.customCheckItems.trim(), '');
  }

  if (visibleRejectionFindings.length) {
    lines.push('## 废标项风险', '', '| 状态 | 投标文件 | 类型 | 级别 | 风险项 | 证据 | 建议 |', '| --- | --- | --- | --- | --- | --- | --- |');
    visibleRejectionFindings.forEach((item) => {
      lines.push(`| ${resolutionStatusLabel(item.resolution_status)} | ${markdownCell(documentLabel(bidDocuments, item.bidDocumentId))} | ${findingTypeLabel(item.type)} | ${severityLabel(item.severity)} | ${markdownCell(item.title)} | ${markdownCell(item.bidEvidence)} | ${markdownCell(item.suggestion)} |`);
    });
    lines.push('');
  }

  if (visibleTypoFindings.length) {
    lines.push('## 错别字风险', '', '| 状态 | 投标文件 | 错字 | 建议修正 | 原文证据 | 原因 |', '| --- | --- | --- | --- | --- | --- |');
    visibleTypoFindings.forEach((item) => {
      lines.push(`| ${resolutionStatusLabel(item.resolution_status)} | ${markdownCell(documentLabel(bidDocuments, item.bidDocumentId))} | ${markdownCell(item.wrongText)} | ${markdownCell(item.correctText)} | ${markdownCell(item.originalExcerpt)} | ${markdownCell(item.reason)} |`);
    });
    lines.push('');
  }

  if (visibleLogicFindings.length) {
    lines.push('## 逻辑谬误风险', '', '| 状态 | 投标文件 | 问题 | 位置 | 原文 | 建议 |', '| --- | --- | --- | --- | --- | --- |');
    visibleLogicFindings.forEach((item) => {
      lines.push(`| ${resolutionStatusLabel(item.resolution_status)} | ${markdownCell(documentLabel(bidDocuments, item.bidDocumentId))} | ${markdownCell(item.title)} | ${markdownCell(item.locationHint)} | ${markdownCell(item.originalText)} | ${markdownCell(item.suggestion)} |`);
    });
    lines.push('');
  }

  if (visibleRejectionFindings.length || visibleTypoFindings.length || visibleLogicFindings.length) {
    lines.push('## 证据定位明细', '');
    lines.push('本节用于人工复核和交付沟通，按投标文件、位置线索、原文证据、原因和建议展开。');
    lines.push('');

    const evidenceDetails = [
      ...visibleRejectionFindings.map((item, index) => {
        const titleText = item.title || '未命名风险';
        const snapshot = createEvidenceContextSnapshot(bidDocuments, item.bidDocumentId, item.bidEvidence);
        const document = bidDocuments.find((bidDocument) => bidDocument.id === item.bidDocumentId);
        const locationText = snapshot?.locationText || '';
        return {
          type: '废标项风险',
          anchorId: `evidence-rejection-${safeAnchorId(item.id || `risk-${index + 1}`)}`,
          document: documentLabel(bidDocuments, item.bidDocumentId),
          title: titleText,
          heading: `废标项风险 ${index + 1}：${titleText}`,
          location: locationText,
          snapshotLines: snapshot?.snapshotLines || [],
          pageSnapshotLines: buildPageScreenshotSnapshotLines(document, snapshot, context),
          details: [
            ['投标文件', documentLabel(bidDocuments, item.bidDocumentId)],
            ['类型', findingTypeLabel(item.type)],
            ['级别', severityLabel(item.severity)],
            ['检查依据', item.requirement],
            ['原文证据', item.bidEvidence],
            ['原文定位', locationText],
            ['风险原因', item.riskReason],
            ['处理建议', item.suggestion],
          ],
        };
      }),
      ...visibleTypoFindings.map((item, index) => {
        const titleText = item.wrongText || '未命名错字';
        const snapshot = createEvidenceContextSnapshot(bidDocuments, item.bidDocumentId, item.originalExcerpt || item.wrongText);
        const document = bidDocuments.find((bidDocument) => bidDocument.id === item.bidDocumentId);
        const locationText = snapshot?.locationText || '';
        return {
          type: '错别字',
          anchorId: `evidence-typo-${safeAnchorId(item.id || `typo-${index + 1}`)}`,
          document: documentLabel(bidDocuments, item.bidDocumentId),
          title: titleText,
          heading: `错别字 ${index + 1}：${titleText}`,
          location: locationText || item.locationHint,
          snapshotLines: snapshot?.snapshotLines || [],
          pageSnapshotLines: buildPageScreenshotSnapshotLines(document, snapshot, context),
          details: [
            ['投标文件', documentLabel(bidDocuments, item.bidDocumentId)],
            ['位置线索', item.locationHint],
            ['错字', item.wrongText],
            ['建议修正', item.correctText],
            ['原文证据', item.originalExcerpt],
            ['原文定位', locationText],
            ['判断原因', item.reason],
          ],
        };
      }),
      ...visibleLogicFindings.map((item, index) => {
        const titleText = item.title || '未命名问题';
        const snapshot = createEvidenceContextSnapshot(bidDocuments, item.bidDocumentId, item.originalText);
        const document = bidDocuments.find((bidDocument) => bidDocument.id === item.bidDocumentId);
        const locationText = snapshot?.locationText || '';
        return {
          type: '逻辑问题',
          anchorId: `evidence-logic-${safeAnchorId(item.id || `logic-${index + 1}`)}`,
          document: documentLabel(bidDocuments, item.bidDocumentId),
          title: titleText,
          heading: `逻辑问题 ${index + 1}：${titleText}`,
          location: locationText || item.locationHint,
          snapshotLines: snapshot?.snapshotLines || [],
          pageSnapshotLines: buildPageScreenshotSnapshotLines(document, snapshot, context),
          details: [
            ['投标文件', documentLabel(bidDocuments, item.bidDocumentId)],
            ['位置线索', item.locationHint],
            ['原文证据', item.originalText],
            ['原文定位', locationText],
            ['问题原因', item.fallacyReason],
            ['处理建议', item.suggestion],
          ],
        };
      }),
    ];

    lines.push('| 序号 | 类型 | 投标文件 | 标题 | 定位 |', '| --- | --- | --- | --- | --- |');
    evidenceDetails.forEach((item, index) => {
      lines.push(`| ${index + 1} | ${item.type} | ${markdownCell(item.document)} | [${markdownCell(item.title)}](#${item.anchorId}) | ${markdownCell(compactDetail(item.location, 120))} |`);
    });
    lines.push('');

    evidenceDetails.forEach((item) => {
      pushEvidenceDetailBlock(lines, item.heading, item.details, item.anchorId, item.snapshotLines, item.pageSnapshotLines);
    });
  }

  if (!visibleRejectionFindings.length && !visibleTypoFindings.length && !visibleLogicFindings.length) {
    lines.push('## 检查结果', '', '当前工作区暂无已保留的风险项、错别字或逻辑问题。', '');
  }

  lines.push('## 后续处理建议', '');
  lines.push('- 优先处理高风险废标项，确认是否需要补充响应、附件或澄清说明。');
  lines.push('- 对错别字和逻辑问题逐条回到投标文件原文修改，避免只在报告中标记。');
  lines.push('- 忽略、删除或处理页面中的结果后，请重新导出报告，确保交付版本与页面状态一致。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function createDocumentSignature(document) {
  if (!document) return '';
  const content = String(document.content || '').trim();
  const signatureId = document.role === 'bid' && document.id === 'bid-1' ? 'bid' : document.id || document.role;
  return [
    signatureId,
    document.source,
    document.fileName,
    content.length,
    content.slice(0, 800),
    content.slice(-800),
  ].join('\n---yibiao-rejection-signature---\n');
}

function createRejectionCheckInputSignature(bidDocuments, invalidBidAndRejectionItems, customCheckItems) {
  const documents = Array.isArray(bidDocuments) ? bidDocuments : [bidDocuments].filter(Boolean);
  const bidSignature = documents.map(createDocumentSignature).filter(Boolean).join('\n---yibiao-rejection-bid-document---\n');
  const analysis = String(invalidBidAndRejectionItems || '').trim();
  if (!bidSignature || !analysis) return '';
  const custom = String(customCheckItems || '').trim();
  return [
    bidSignature,
    analysis.length,
    analysis.slice(0, 800),
    analysis.slice(-800),
    custom.length,
    custom.slice(0, 800),
    custom.slice(-800),
  ].join('\n---yibiao-rejection-check-input---\n');
}

function getTechnicalPlanDiscardedBids(technicalPlan) {
  const task = technicalPlan?.bidAnalysisTasks?.discardedBids;
  return task?.status === 'success' && task.content?.trim() ? stripTripleQuoteWrapper(task.content) : '';
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
  };
}

function createRejectionCheckStore({ app, db, fileService, technicalPlanStore }) {
  const rejectionCheckDir = getRejectionCheckDir(app);

  function ensureMetaRow() {
    const existing = db.prepare('SELECT * FROM rejection_check_meta WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO rejection_check_meta (
        id, step, active_document_tab, active_result_tab, active_check_result_tab, custom_check_items, check_options_json, created_at, updated_at
      ) VALUES (
        1, 'documents', 'tender', 'analysis', 'rejection', '', @check_options_json, @timestamp, @timestamp
      )
    `).run({ check_options_json: JSON.stringify(initialState.checkOptions), timestamp });
    return db.prepare('SELECT * FROM rejection_check_meta WHERE id = 1').get();
  }

  function updateMeta(fields) {
    ensureMetaRow();
    const entries = Object.entries(fields || {}).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
    db.prepare(`UPDATE rejection_check_meta SET ${assignments}, updated_at = @updated_at WHERE id = 1`).run({
      ...Object.fromEntries(entries),
      updated_at: now(),
    });
  }

  function createBidDocumentId(fileName, markdown) {
    const hash = stableHash(`${String(fileName || '')}\n${String(markdown || '')}`).slice(0, 16);
    return `bid-${hash}`;
  }

  function getDocumentMarkdownRelativePath(role, documentId) {
    if (role === 'bid') {
      const safeDocumentId = String(documentId || 'bid').replace(/[^a-zA-Z0-9_-]/g, '_');
      return `rejection-check/bids/${safeDocumentId}.md`;
    }
    return 'rejection-check/tender.md';
  }

  function resolveMarkdownPath(relativeOrAbsolutePath, role, documentId) {
    const value = String(relativeOrAbsolutePath || '').trim();
    if (!value) return getRejectionCheckDocumentMarkdownPath(app, role, documentId);
    return path.isAbsolute(value) ? value : path.join(path.dirname(rejectionCheckDir), value);
  }

  function loadDocumentRow(roleOrDocumentId, documentId) {
    if (documentId) {
      return db.prepare('SELECT * FROM rejection_check_documents WHERE document_id = ? AND role = ?').get(String(documentId), normalizeDocumentRole(roleOrDocumentId));
    }
    const value = String(roleOrDocumentId || '').trim();
    if (value === 'tender') {
      return db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'tender' ORDER BY sort_order ASC LIMIT 1").get();
    }
    if (value === 'bid') {
      return db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC LIMIT 1").get();
    }
    return db.prepare('SELECT * FROM rejection_check_documents WHERE document_id = ?').get(value);
  }

  function readDocumentMarkdown(roleOrDocumentId, documentId) {
    const row = loadDocumentRow(roleOrDocumentId, documentId);
    if (!row) return '';
    const filePath = resolveMarkdownPath(row.markdown_path, row.role, row.document_id);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  }

  function writeDocumentMarkdown(role, documentId, markdown) {
    const documentRole = normalizeDocumentRole(role);
    const targetPath = getRejectionCheckDocumentMarkdownPath(app, documentRole, documentId);
    const tempPath = path.join(path.dirname(targetPath), `${documentRole}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp.md`);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(tempPath, `${String(markdown || '').trim()}\n`, 'utf-8');
    fs.renameSync(tempPath, targetPath);
    return targetPath;
  }

  function saveDocument(document, sortOrder = 0) {
    if (!document?.role) return;
    const role = normalizeDocumentRole(document.role);
    const markdown = String(document.content || '').trim();
    if (!markdown) return;
    const documentId = role === 'tender'
      ? tenderDocumentId
      : String(document.id || createBidDocumentId(document.fileName, markdown));
    writeDocumentMarkdown(role, documentId, markdown);
    const timestamp = now();
    db.prepare(`
      INSERT INTO rejection_check_documents (
        document_id, role, source, file_name, markdown_path, content_hash, content_chars, parser_label, page_screenshots_json, sort_order, imported_at, updated_at
      ) VALUES (
        @document_id, @role, @source, @file_name, @markdown_path, @content_hash, @content_chars, @parser_label, @page_screenshots_json, @sort_order, @imported_at, @updated_at
      ) ON CONFLICT(document_id) DO UPDATE SET
        role = excluded.role,
        source = excluded.source,
        file_name = excluded.file_name,
        markdown_path = excluded.markdown_path,
        content_hash = excluded.content_hash,
        content_chars = excluded.content_chars,
        parser_label = excluded.parser_label,
        page_screenshots_json = excluded.page_screenshots_json,
        sort_order = excluded.sort_order,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at
    `).run({
      document_id: documentId,
      role,
      source: document.source === 'technical-plan' ? 'technical-plan' : 'upload',
      file_name: String(document.fileName || (role === 'bid' ? '投标文件' : '招标文件')),
      markdown_path: getDocumentMarkdownRelativePath(role, documentId),
      content_hash: stableHash(markdown),
      content_chars: markdown.length,
      parser_label: document.parserLabel ? String(document.parserLabel) : null,
      page_screenshots_json: jsonOrNull(document.pageScreenshots || document.page_screenshots || document.pageImages || document.page_images || []),
      sort_order: role === 'bid' ? Number(sortOrder || 0) : 0,
      imported_at: document.importedAt || timestamp,
      updated_at: timestamp,
    });
    return documentId;
  }

  function documentFromRow(row) {
    if (!row) return null;
    return {
      id: row.document_id || row.role,
      role: normalizeDocumentRole(row.role),
      fileName: row.file_name,
      content: readDocumentMarkdown(row.document_id || row.role),
      source: row.source === 'technical-plan' ? 'technical-plan' : 'upload',
      parserLabel: row.parser_label || undefined,
      pageScreenshots: safeJsonParse(row.page_screenshots_json, []),
      importedAt: row.imported_at,
    };
  }

  function loadTenderDocument() {
    return documentFromRow(db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'tender' ORDER BY sort_order ASC LIMIT 1").get());
  }

  function loadBidDocuments() {
    return db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC, imported_at ASC").all().map(documentFromRow).filter(Boolean);
  }

  function resequenceBidDocuments() {
    const rows = db.prepare("SELECT document_id FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC, imported_at ASC").all();
    const update = db.prepare('UPDATE rejection_check_documents SET sort_order = ?, updated_at = ? WHERE document_id = ?');
    const timestamp = now();
    rows.forEach((row, index) => update.run(index, timestamp, row.document_id));
  }

  function removeMarkdownForRow(row) {
    if (!row) return;
    const targetPath = resolveMarkdownPath(row.markdown_path, row.role, row.document_id);
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
  }

  function clearDocument(role, documentId) {
    const documentRole = normalizeDocumentRole(role);
    if (documentRole === 'tender') {
      const rows = db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'tender'").all();
      rows.forEach(removeMarkdownForRow);
      db.prepare("DELETE FROM rejection_check_documents WHERE role = 'tender'").run();
      deleteImportedImageBatches(app, 'rejection-check-tender');
      clearExtractionAndCheckResults();
    } else {
      const rows = documentId
        ? db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'bid' AND document_id = ?").all(String(documentId))
        : db.prepare("SELECT * FROM rejection_check_documents WHERE role = 'bid'").all();
      rows.forEach(removeMarkdownForRow);
      if (documentId) {
        db.prepare("DELETE FROM rejection_check_documents WHERE role = 'bid' AND document_id = ?").run(String(documentId));
        deleteImportedImageBatches(app, `rejection-check-bid-${documentId}`);
        if (documentId === 'bid-1') deleteImportedImageBatchesForExactScope(app, 'rejection-check-bid');
      } else {
        db.prepare("DELETE FROM rejection_check_documents WHERE role = 'bid'").run();
        deleteImportedImageBatches(app, 'rejection-check-bid');
      }
      resequenceBidDocuments();
      clearCheckResults();
    }
  }

  function saveTask(type, task) {
    if (!task) {
      db.prepare('DELETE FROM rejection_check_tasks WHERE type = ?').run(type);
      return;
    }
    const timestamp = now();
    db.prepare(`
      INSERT INTO rejection_check_tasks (type, task_id, status, progress, logs_json, stats_json, error, started_at, updated_at)
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
      type,
      task_id: String(task.task_id || ''),
      status: String(task.status || 'running'),
      progress: Math.max(0, Math.min(100, Math.round(Number(task.progress || 0)))),
      logs_json: JSON.stringify(Array.isArray(task.logs) ? task.logs : []),
      stats_json: jsonOrNull(task.stats),
      error: task.error ? String(task.error) : null,
      started_at: task.started_at || timestamp,
      updated_at: task.updated_at || timestamp,
    });
  }

  function loadTasks() {
    const tasks = {};
    for (const row of db.prepare('SELECT * FROM rejection_check_tasks').all()) {
      const field = taskTypeFields[row.type];
      if (field) tasks[field] = taskFromRow(row);
    }
    return tasks;
  }

  function saveExtraction(extraction) {
    if (!extraction) {
      db.prepare('DELETE FROM rejection_check_extraction WHERE id = 1').run();
      return;
    }
    db.prepare(`
      INSERT INTO rejection_check_extraction (id, status, content, source, tender_signature, error, updated_at)
      VALUES (1, @status, @content, @source, @tender_signature, @error, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        content = excluded.content,
        source = excluded.source,
        tender_signature = excluded.tender_signature,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run({
      status: normalizeStatus(extraction.status, ['idle', 'running', 'success', 'error'], 'idle'),
      content: stripTripleQuoteWrapper(extraction.content || ''),
      source: extraction.source ? String(extraction.source) : null,
      tender_signature: extraction.tenderSignature ? String(extraction.tenderSignature) : null,
      error: extraction.error ? String(extraction.error) : null,
      updated_at: extraction.updatedAt || now(),
    });
  }

  function loadExtraction() {
    const row = db.prepare('SELECT * FROM rejection_check_extraction WHERE id = 1').get();
    if (!row) return { status: 'idle', content: '' };
    return {
      status: normalizeStatus(row.status, ['idle', 'running', 'success', 'error'], 'idle'),
      content: stripTripleQuoteWrapper(row.content || ''),
      source: row.source || undefined,
      tenderSignature: row.tender_signature || undefined,
      error: row.error || undefined,
      updatedAt: row.updated_at || undefined,
    };
  }

  function saveResult(resultType, result) {
    clearFindingRows(resultType);
    if (!result) {
      db.prepare('DELETE FROM rejection_check_results WHERE result_type = ?').run(resultType);
      return;
    }
    db.prepare(`
      INSERT INTO rejection_check_results (result_type, status, input_signature, active_finding_id, progress_message, error, updated_at)
      VALUES (@result_type, @status, @input_signature, @active_finding_id, @progress_message, @error, @updated_at)
      ON CONFLICT(result_type) DO UPDATE SET
        status = excluded.status,
        input_signature = excluded.input_signature,
        active_finding_id = excluded.active_finding_id,
        progress_message = excluded.progress_message,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run({
      result_type: resultType,
      status: normalizeStatus(result.status, ['idle', 'running', 'success', 'error'], 'idle'),
      input_signature: result.inputSignature ? String(result.inputSignature) : null,
      active_finding_id: result.activeFindingId ? String(result.activeFindingId) : null,
      progress_message: result.progressMessage ? String(result.progressMessage) : null,
      error: result.error ? String(result.error) : null,
      updated_at: result.updatedAt || now(),
    });
    saveFindingRows(resultType, result.findings || []);
  }

  function clearFindingRows(resultType) {
    if (resultType === 'rejection') db.prepare('DELETE FROM rejection_check_risk_findings').run();
    if (resultType === 'typo') db.prepare('DELETE FROM rejection_check_typo_findings').run();
    if (resultType === 'logic') db.prepare('DELETE FROM rejection_check_logic_findings').run();
  }

  function saveFindingRows(resultType, findings) {
    const timestamp = now();
    if (resultType === 'rejection') {
      const insert = db.prepare(`
        INSERT INTO rejection_check_risk_findings (
          finding_id, bid_document_id, type, severity, title, summary, requirement, bid_evidence, risk_reason, suggestion, resolution_status, resolved_at, sort_order, created_at, updated_at
        ) VALUES (
          @finding_id, @bid_document_id, @type, @severity, @title, @summary, @requirement, @bid_evidence, @risk_reason, @suggestion, @resolution_status, @resolved_at, @sort_order, @created_at, @updated_at
        )
      `);
      findings.forEach((item, index) => insert.run({
        finding_id: String(item.id || `rejection-finding-${index + 1}`),
        bid_document_id: item.bidDocumentId ? String(item.bidDocumentId) : null,
        type: item.type === 'invalidBid' ? 'invalidBid' : 'rejectionItem',
        severity: ['high', 'medium', 'low'].includes(item.severity) ? item.severity : 'medium',
        title: String(item.title || ''),
        summary: String(item.summary || item.title || ''),
        requirement: String(item.requirement || ''),
        bid_evidence: String(item.bidEvidence || ''),
        risk_reason: String(item.riskReason || ''),
        suggestion: String(item.suggestion || ''),
        resolution_status: normalizeResolutionStatus(item.resolution_status),
        resolved_at: item.resolved_at || null,
        sort_order: index,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    }
    if (resultType === 'typo') {
      const insert = db.prepare(`
        INSERT INTO rejection_check_typo_findings (
          finding_id, bid_document_id, wrong_text, correct_text, original_excerpt, reason, location_hint, resolution_status, resolved_at, sort_order, created_at, updated_at
        ) VALUES (
          @finding_id, @bid_document_id, @wrong_text, @correct_text, @original_excerpt, @reason, @location_hint, @resolution_status, @resolved_at, @sort_order, @created_at, @updated_at
        )
      `);
      findings.forEach((item, index) => insert.run({
        finding_id: String(item.id || `typo-finding-${index + 1}`),
        bid_document_id: item.bidDocumentId ? String(item.bidDocumentId) : null,
        wrong_text: String(item.wrongText || ''),
        correct_text: String(item.correctText || ''),
        original_excerpt: String(item.originalExcerpt || ''),
        reason: String(item.reason || ''),
        location_hint: item.locationHint ? String(item.locationHint) : null,
        resolution_status: normalizeResolutionStatus(item.resolution_status),
        resolved_at: item.resolved_at || null,
        sort_order: index,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    }
    if (resultType === 'logic') {
      const insert = db.prepare(`
        INSERT INTO rejection_check_logic_findings (
          finding_id, bid_document_id, title, original_text, location_hint, fallacy_reason, suggestion, resolution_status, resolved_at, sort_order, created_at, updated_at
        ) VALUES (
          @finding_id, @bid_document_id, @title, @original_text, @location_hint, @fallacy_reason, @suggestion, @resolution_status, @resolved_at, @sort_order, @created_at, @updated_at
        )
      `);
      findings.forEach((item, index) => insert.run({
        finding_id: String(item.id || `logic-finding-${index + 1}`),
        bid_document_id: item.bidDocumentId ? String(item.bidDocumentId) : null,
        title: String(item.title || ''),
        original_text: String(item.originalText || ''),
        location_hint: String(item.locationHint || ''),
        fallacy_reason: String(item.fallacyReason || ''),
        suggestion: String(item.suggestion || ''),
        resolution_status: normalizeResolutionStatus(item.resolution_status),
        resolved_at: item.resolved_at || null,
        sort_order: index,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    }
  }

  function loadResult(resultType) {
    const row = db.prepare('SELECT * FROM rejection_check_results WHERE result_type = ?').get(resultType);
    const base = {
      status: 'idle',
      findings: [],
    };
    if (!row) return base;
    return {
      status: normalizeStatus(row.status, ['idle', 'running', 'success', 'error'], 'idle'),
      findings: loadFindingRows(resultType),
      inputSignature: row.input_signature || undefined,
      activeFindingId: row.active_finding_id || undefined,
      progressMessage: row.progress_message || undefined,
      error: row.error || undefined,
      updatedAt: row.updated_at || undefined,
    };
  }

  function loadFindingRows(resultType) {
    const fallbackBidDocumentId = db.prepare("SELECT document_id FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC LIMIT 1").get()?.document_id || '';
    if (resultType === 'rejection') {
      return db.prepare('SELECT * FROM rejection_check_risk_findings ORDER BY sort_order ASC').all().map((item) => ({
        id: item.finding_id,
        bidDocumentId: item.bid_document_id || fallbackBidDocumentId,
        type: item.type,
        severity: item.severity,
        title: item.title,
        summary: item.summary,
        requirement: item.requirement,
        bidEvidence: item.bid_evidence,
        riskReason: item.risk_reason,
        suggestion: item.suggestion,
        resolution_status: normalizeResolutionStatus(item.resolution_status),
        resolved_at: item.resolved_at || undefined,
      }));
    }
    if (resultType === 'typo') {
      return db.prepare('SELECT * FROM rejection_check_typo_findings ORDER BY sort_order ASC').all().map((item) => ({
        id: item.finding_id,
        bidDocumentId: item.bid_document_id || fallbackBidDocumentId,
        wrongText: item.wrong_text,
        correctText: item.correct_text,
        originalExcerpt: item.original_excerpt,
        reason: item.reason,
        locationHint: item.location_hint || undefined,
        resolution_status: normalizeResolutionStatus(item.resolution_status),
        resolved_at: item.resolved_at || undefined,
      }));
    }
    return db.prepare('SELECT * FROM rejection_check_logic_findings ORDER BY sort_order ASC').all().map((item) => ({
      id: item.finding_id,
      bidDocumentId: item.bid_document_id || fallbackBidDocumentId,
      title: item.title,
      originalText: item.original_text,
      locationHint: item.location_hint,
      fallacyReason: item.fallacy_reason,
      suggestion: item.suggestion,
      resolution_status: normalizeResolutionStatus(item.resolution_status),
      resolved_at: item.resolved_at || undefined,
    }));
  }

  function clearCheckResults() {
    db.prepare('DELETE FROM rejection_check_results').run();
    db.prepare('DELETE FROM rejection_check_risk_findings').run();
    db.prepare('DELETE FROM rejection_check_typo_findings').run();
    db.prepare('DELETE FROM rejection_check_logic_findings').run();
    db.prepare("DELETE FROM rejection_check_tasks WHERE type = 'rejection-check-run'").run();
  }

  function clearExtractionAndCheckResults() {
    db.prepare('DELETE FROM rejection_check_extraction').run();
    db.prepare("DELETE FROM rejection_check_tasks WHERE type = 'rejection-items-extraction'").run();
    clearCheckResults();
  }

  const updateRejectionCheckTransaction = db.transaction((partial) => {
    ensureMetaRow();
    const metaUpdates = {};
    if (hasOwn(partial, 'step')) metaUpdates.step = normalizeStep(partial.step);
    if (hasOwn(partial, 'activeDocumentTab')) metaUpdates.active_document_tab = normalizeDocumentTab(partial.activeDocumentTab);
    if (hasOwn(partial, 'activeResultTab')) metaUpdates.active_result_tab = normalizeResultTab(partial.activeResultTab);
    if (hasOwn(partial, 'activeCheckResultTab')) metaUpdates.active_check_result_tab = normalizeCheckResultTab(partial.activeCheckResultTab);
    if (hasOwn(partial, 'customCheckItems')) metaUpdates.custom_check_items = String(partial.customCheckItems || '');
    if (hasOwn(partial, 'checkOptions')) metaUpdates.check_options_json = JSON.stringify(normalizeCheckOptions(partial.checkOptions));
    if (Object.keys(metaUpdates).length) updateMeta(metaUpdates);

    if (hasOwn(partial, 'tenderDocument')) {
      if (partial.tenderDocument) saveDocument(partial.tenderDocument);
      else clearDocument('tender');
    }
    if (hasOwn(partial, 'bidDocuments')) {
      clearDocument('bid');
      (Array.isArray(partial.bidDocuments) ? partial.bidDocuments : []).forEach((document, index) => saveDocument(document, index));
    }
    if (hasOwn(partial, 'invalidBidAndRejectionItems')) saveExtraction(partial.invalidBidAndRejectionItems);
    for (const [field, type] of Object.entries(resultFieldTypes)) {
      if (hasOwn(partial, field)) saveResult(type, partial[field]);
    }
    for (const [field, type] of Object.entries(taskFieldTypes)) {
      if (hasOwn(partial, field)) saveTask(type, partial[field]);
    }
  });

  function loadRejectionCheck() {
    const meta = ensureMetaRow();
    const tasks = loadTasks();
    const tenderDocument = loadTenderDocument();
    const bidDocuments = loadBidDocuments();
    const activeDocumentTab = normalizeDocumentTab(meta.active_document_tab);
    const validActiveDocumentTab = activeDocumentTab === 'tender' || bidDocuments.some((document) => document.id === activeDocumentTab)
      ? activeDocumentTab
      : tenderDocument
        ? 'tender'
        : bidDocuments[0]?.id || 'tender';
    return {
      ...initialState,
      tenderDocument,
      bidDocuments,
      activeDocumentTab: validActiveDocumentTab,
      step: normalizeStep(meta.step),
      activeResultTab: normalizeResultTab(meta.active_result_tab),
      activeCheckResultTab: normalizeCheckResultTab(meta.active_check_result_tab),
      invalidBidAndRejectionItems: loadExtraction(),
      customCheckItems: meta.custom_check_items || '',
      checkOptions: normalizeCheckOptions(safeJsonParse(meta.check_options_json, initialState.checkOptions)),
      rejectionCheckResult: loadResult('rejection'),
      typoCheckResult: loadResult('typo'),
      logicCheckResult: loadResult('logic'),
      ...tasks,
    };
  }

  function updateRejectionCheck(partial) {
    updateRejectionCheckTransaction(partial || {});
    return loadRejectionCheck();
  }

  function saveRejectionCheck(state) {
    return updateRejectionCheck(state || {});
  }

  async function importDocument(role) {
    if (!fileService?.importRejectionCheckDocument) {
      throw new Error('文件导入服务尚未初始化');
    }
    const documentRole = normalizeDocumentRole(role);
    const result = await fileService.importRejectionCheckDocument(documentRole);
    const importedDocuments = Array.isArray(result?.documents)
      ? result.documents
      : result?.file_content
        ? [result]
        : [];
    if (!result?.success || !importedDocuments.length) {
      return { success: false, message: result?.message || '未导入文件', state: loadRejectionCheck() };
    }
    let addedCount = 0;
    let skippedCount = 0;
    let firstAddedBidDocumentId = '';
    const transaction = db.transaction(() => {
      if (documentRole === 'tender') {
        const first = importedDocuments[0];
        const document = {
          id: tenderDocumentId,
          role: documentRole,
          fileName: first.file_name || '招标文件',
          content: first.file_content,
          source: 'upload',
          parserLabel: first.parser_label || undefined,
          pageScreenshots: Array.isArray(first.page_screenshots) ? first.page_screenshots : [],
          importedAt: now(),
        };
        saveDocument(document);
        clearExtractionAndCheckResults();
        updateMeta({ active_document_tab: 'tender' });
        addedCount = 1;
        return;
      }

      const existingRows = db.prepare("SELECT document_id, file_name, content_hash FROM rejection_check_documents WHERE role = 'bid'").all();
      const existingKeys = new Set(existingRows.map((row) => `${row.file_name}\u0000${row.content_hash}`));
      let sortOrder = existingRows.length;
      for (const item of importedDocuments) {
        const markdown = String(item.file_content || '').trim();
        if (!markdown) continue;
        const fileName = item.file_name || '投标文件';
        const contentHash = stableHash(markdown);
        const key = `${fileName}\u0000${contentHash}`;
        if (existingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }
        const documentId = createBidDocumentId(fileName, markdown);
        const savedDocumentId = saveDocument({
          id: documentId,
          role: 'bid',
          fileName,
          content: markdown,
          source: 'upload',
          parserLabel: item.parser_label || undefined,
          pageScreenshots: Array.isArray(item.page_screenshots) ? item.page_screenshots : [],
          importedAt: now(),
        }, sortOrder);
        existingKeys.add(key);
        if (!firstAddedBidDocumentId) firstAddedBidDocumentId = savedDocumentId;
        sortOrder += 1;
        addedCount += 1;
      }
      if (addedCount > 0) {
        clearCheckResults();
        updateMeta({ active_document_tab: firstAddedBidDocumentId || 'tender' });
      }
    });
    transaction();
    const failedCount = Array.isArray(result?.errors) ? result.errors.length : 0;
    const fallbackToLocal = importedDocuments.some((item) => item?.fallback_to_local) || String(result?.message || '').includes('自动使用本地解析');
    if (documentRole === 'bid' && addedCount === 0) {
      const messageParts = [];
      if (skippedCount > 0) messageParts.push(`已跳过 ${skippedCount} 份重复文件`);
      if (failedCount > 0) messageParts.push(`失败 ${failedCount} 份`);
      const message = messageParts.length ? messageParts.join('，') : result.message || '未导入文件';
      return { success: false, message, state: loadRejectionCheck() };
    }
    const bidMessageParts = [`已解析 ${addedCount} 份投标文件`];
    if (fallbackToLocal) bidMessageParts.push('当前格式已自动使用本地解析');
    if (skippedCount > 0) bidMessageParts.push(`跳过 ${skippedCount} 份重复文件`);
    if (failedCount > 0) bidMessageParts.push(`失败 ${failedCount} 份`);
    const message = documentRole === 'bid' ? bidMessageParts.join('，') : result.message || '文件解析完成';
    return { success: true, message, state: loadRejectionCheck() };
  }

  async function importTenderFromTechnicalPlan() {
    if (!technicalPlanStore?.readTenderMarkdown || !technicalPlanStore?.loadTechnicalPlan) {
      throw new Error('技术方案缓存接口尚未初始化');
    }
    const markdown = technicalPlanStore.readTenderMarkdown();
    if (!markdown.trim()) {
      return { success: false, message: '技术方案中暂无可读取的招标文件正文', state: loadRejectionCheck() };
    }
    const technicalPlan = technicalPlanStore.loadTechnicalPlan();
    const document = {
      id: tenderDocumentId,
      role: 'tender',
      fileName: technicalPlan?.tenderFile?.fileName || '技术方案招标文件',
      content: markdown,
      source: 'technical-plan',
      importedAt: now(),
    };
    const discardedBids = getTechnicalPlanDiscardedBids(technicalPlan);
    const tenderSignature = createDocumentSignature(document);
    const transaction = db.transaction(() => {
      saveDocument(document);
      clearExtractionAndCheckResults();
      if (discardedBids) {
        saveExtraction({
          status: 'success',
          content: discardedBids,
          source: 'technical-plan',
          tenderSignature,
          updatedAt: now(),
        });
      }
      updateMeta({ active_document_tab: 'tender' });
    });
    transaction();
    return { success: true, message: '已从技术方案读取招标文件', state: loadRejectionCheck() };
  }

  function removeDocument(role, documentId) {
    const transaction = db.transaction(() => {
      clearDocument(role, documentId);
      if (normalizeDocumentRole(role) === 'bid') {
        const nextBid = db.prepare("SELECT document_id FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC LIMIT 1").get();
        updateMeta({ active_document_tab: nextBid?.document_id || 'tender' });
      } else {
        updateMeta({ active_document_tab: 'tender' });
      }
    });
    transaction();
    return loadRejectionCheck();
  }

  function saveUiState(partial = {}) {
    const uiState = {};
    for (const field of ['step', 'activeDocumentTab', 'activeResultTab', 'activeCheckResultTab', 'customCheckItems', 'checkOptions']) {
      if (hasOwn(partial, field)) {
        uiState[field] = partial[field];
      }
    }
    return updateRejectionCheck(uiState);
  }

  function resolveFinding({ section, findingId, status } = {}) {
    const normalizedSection = ['rejection', 'typo', 'logic'].includes(section) ? section : '';
    const normalizedStatus = normalizeResolutionStatus(status);
    const normalizedFindingId = String(findingId || '').trim();
    if (!normalizedSection) {
      throw new Error('缺少要处理的检查结果类型');
    }
    if (!normalizedFindingId) {
      throw new Error('缺少要处理的检查结果编号');
    }

    const tableName = normalizedSection === 'rejection'
      ? 'rejection_check_risk_findings'
      : normalizedSection === 'typo'
        ? 'rejection_check_typo_findings'
        : 'rejection_check_logic_findings';
    const result = db.prepare(`
      UPDATE ${tableName}
      SET resolution_status = @status, resolved_at = @resolved_at, updated_at = @updated_at
      WHERE finding_id = @finding_id
    `).run({
      status: normalizedStatus,
      resolved_at: normalizedStatus === 'pending' ? null : now(),
      updated_at: now(),
      finding_id: normalizedFindingId,
    });
    if (!result.changes) {
      throw new Error('未找到要处理的检查结果');
    }
    return loadRejectionCheck();
  }

  function getFindingTableName(section) {
    const normalizedSection = ['rejection', 'typo', 'logic'].includes(section) ? section : '';
    if (!normalizedSection) {
      throw new Error('缺少要处理的检查结果类型');
    }
    return normalizedSection === 'rejection'
      ? 'rejection_check_risk_findings'
      : normalizedSection === 'typo'
        ? 'rejection_check_typo_findings'
        : 'rejection_check_logic_findings';
  }

  function normalizeFindingIds(findingIds) {
    const rawIds = Array.isArray(findingIds) ? findingIds : [];
    return [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }

  function batchHandleFindings({ section, findingIds, action, status } = {}) {
    const tableName = getFindingTableName(section);
    const ids = normalizeFindingIds(findingIds);
    const normalizedAction = action === 'delete' ? 'delete' : 'resolve';
    if (!ids.length) {
      throw new Error('缺少要批量处理的检查结果');
    }

    const transaction = db.transaction(() => {
      if (normalizedAction === 'delete') {
        const stmt = db.prepare(`DELETE FROM ${tableName} WHERE finding_id = ?`);
        ids.forEach((id) => stmt.run(id));
        return;
      }

      const normalizedStatus = normalizeResolutionStatus(status);
      const stmt = db.prepare(`
        UPDATE ${tableName}
        SET resolution_status = @status, resolved_at = @resolved_at, updated_at = @updated_at
        WHERE finding_id = @finding_id
      `);
      const timestamp = now();
      ids.forEach((id) => stmt.run({
        status: normalizedStatus,
        resolved_at: normalizedStatus === 'pending' ? null : timestamp,
        updated_at: timestamp,
        finding_id: id,
      }));
    });
    transaction();
    return loadRejectionCheck();
  }

  async function exportRejectionReport(options = {}) {
    const state = loadRejectionCheck();
    const markdown = await buildRejectionCheckReportMarkdownWithEvidenceCrops(state, app);
    const requestedFormat = String(options.format || options.fileFormat || options.file_format || '').toLowerCase();
    const format = ['docx', 'pdf'].includes(requestedFormat) ? requestedFormat : 'md';
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出废标项检查报告',
        defaultPath: `废标项检查报告-${new Date().toISOString().slice(0, 10)}.${format}`,
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
      const buffer = await buildRejectionCheckReportDocxBuffer(state, { app, markdown });
      fs.writeFileSync(filePath, buffer);
      return {
        success: true,
        message: '废标项检查 Word 报告已导出',
        filePath,
        format,
        bytes: buffer.length,
        markdownChars: markdown.length,
      };
    }
    if (format === 'pdf') {
      const buffer = buildRejectionCheckReportPdfBuffer(state, { markdown });
      fs.writeFileSync(filePath, buffer);
      return {
        success: true,
        message: '废标项检查 PDF 报告已导出',
        filePath,
        format,
        bytes: buffer.length,
        markdownChars: markdown.length,
      };
    }

    fs.writeFileSync(filePath, markdown, 'utf-8');
    return {
      success: true,
      message: '废标项检查报告已导出',
      filePath,
      format,
      markdownChars: markdown.length,
    };
  }

  function clearRejectionCheck() {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM rejection_check_tasks').run();
      db.prepare('DELETE FROM rejection_check_extraction').run();
      db.prepare('DELETE FROM rejection_check_results').run();
      db.prepare('DELETE FROM rejection_check_risk_findings').run();
      db.prepare('DELETE FROM rejection_check_typo_findings').run();
      db.prepare('DELETE FROM rejection_check_logic_findings').run();
      db.prepare('DELETE FROM rejection_check_documents').run();
      db.prepare('DELETE FROM rejection_check_meta').run();
      ensureMetaRow();
    });
    transaction();
    if (fs.existsSync(rejectionCheckDir)) {
      fs.rmSync(rejectionCheckDir, { recursive: true, force: true });
    }
    deleteImportedImageBatches(app, 'rejection-check');
    return { success: true, message: '废标项检查缓存已清空', state: loadRejectionCheck() };
  }

  fs.mkdirSync(rejectionCheckDir, { recursive: true });

  return {
    loadRejectionCheck,
    saveRejectionCheck,
    updateRejectionCheck,
    clearRejectionCheck,
    importDocument,
    importTenderFromTechnicalPlan,
    removeDocument,
    readDocumentMarkdown,
    createDocumentSignature,
    createRejectionCheckInputSignature,
    resolveFinding,
    batchHandleFindings,
    exportRejectionReport,
    saveUiState,
  };
}

module.exports = {
  createRejectionCheckStore,
  buildRejectionCheckReportMarkdown,
  buildRejectionCheckReportMarkdownWithEvidenceCrops,
  buildRejectionCheckReportDocxBuffer,
  buildRejectionCheckReportPdfBuffer,
  markdownReportToDocxChildren,
};
