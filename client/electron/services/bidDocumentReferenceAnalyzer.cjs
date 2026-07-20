const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

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

function textFromXml(xml = '') {
  return decodeXmlEntities(
    [...String(xml).matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join(''),
  ).trim();
}

function parseRelationships(xml = '') {
  const relationships = new Map();
  for (const match of String(xml).matchAll(/<Relationship\b([^>]*?)\/>/g)) {
    const attrs = match[1] || '';
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1] || '';
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1] || '';
    const type = (attrs.match(/\bType="([^"]+)"/) || [])[1] || '';
    if (id) relationships.set(id, { id, target, type });
  }
  return relationships;
}

function parseStyleMap(stylesXml = '') {
  const styles = new Map();
  const styleXmls = String(stylesXml).match(/<w:style\b[\s\S]*?<\/w:style>/g) || [];
  for (const styleXml of styleXmls) {
    const id = (styleXml.match(/<w:style\b[^>]*\bw:styleId="([^"]+)"/) || [])[1] || '';
    if (!id) continue;
    const name = decodeXmlEntities((styleXml.match(/<w:name\b[^>]*\bw:val="([^"]+)"/) || [])[1] || '');
    const outlineLevelRaw = (styleXml.match(/<w:outlineLvl\b[^>]*\bw:val="([^"]+)"/) || [])[1];
    const outlineLevel = outlineLevelRaw == null ? null : Number(outlineLevelRaw);
    const isHeading = /^Heading[1-3]$/i.test(id) || /heading\s*[1-3]/i.test(name) || (Number.isInteger(outlineLevel) && outlineLevel >= 0 && outlineLevel <= 2);
    styles.set(id, { id, name, outlineLevel, isHeading });
  }
  return styles;
}

function paragraphStyleId(paragraphXml = '') {
  return (String(paragraphXml).match(/<w:pStyle\b[^>]*\bw:val="([^"]+)"/) || [])[1] || '';
}

function headingLevelForStyle(styleId = '', styleInfo = null) {
  const idMatch = String(styleId || '').match(/^Heading([1-3])$/i);
  if (idMatch) return Number(idMatch[1]);
  const nameMatch = String(styleInfo?.name || '').match(/heading\s*([1-3])/i);
  if (nameMatch) return Number(nameMatch[1]);
  if (Number.isInteger(styleInfo?.outlineLevel) && styleInfo.outlineLevel >= 0 && styleInfo.outlineLevel <= 2) {
    return styleInfo.outlineLevel + 1;
  }
  return null;
}

function tableRowsFromXml(tableXml = '') {
  const rowXmls = String(tableXml).match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  return rowXmls.map((rowXml) => {
    const cellXmls = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    return cellXmls.map((cellXml) => textFromXml(cellXml));
  });
}

function parseBodyBlocks(documentXml = '', styleMap = new Map(), relationshipMap = new Map()) {
  return [...String(documentXml).matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)].map((match, index) => {
    const xml = match[0];
    const type = match[1] === 'tbl' ? 'table' : 'paragraph';
    const styleId = type === 'paragraph' ? paragraphStyleId(xml) : '';
    const styleInfo = styleMap.get(styleId) || null;
    const imageRelationshipIds = [...xml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)].map((imageMatch) => imageMatch[1]);
    return {
      index,
      type,
      text: type === 'table' ? '' : textFromXml(xml),
      styleId,
      styleName: styleInfo?.name || '',
      headingLevel: type === 'paragraph' && styleInfo?.isHeading ? headingLevelForStyle(styleId, styleInfo) : null,
      hasPageBreak: /<w:br\b[^>]*\bw:type="page"/.test(xml),
      hasTocField: /TOC\s+/.test(decodeXmlEntities(xml)),
      imageRelationshipIds,
      imageTargets: imageRelationshipIds.map((id) => relationshipMap.get(id)?.target || '').filter(Boolean),
      tableRows: type === 'table' ? tableRowsFromXml(xml) : undefined,
      tableColumnCount: type === 'table' ? Math.max(0, ...tableRowsFromXml(xml).map((row) => row.length)) : undefined,
    };
  });
}

function parseLayout(documentXml = '') {
  const sectPr = (String(documentXml).match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/) || [])[0] || '';
  const pageSize = (sectPr.match(/<w:pgSz\b([^>]*)\/>/) || [])[1] || '';
  const pageMargin = (sectPr.match(/<w:pgMar\b([^>]*)\/>/) || [])[1] || '';
  const attr = (xml, name) => (xml.match(new RegExp(`\\bw:${name}="([^"]+)"`)) || [])[1] || '';
  return {
    hasSectionProperties: Boolean(sectPr),
    pageSize: {
      width: attr(pageSize, 'w'),
      height: attr(pageSize, 'h'),
      orientation: attr(pageSize, 'orient') || 'portrait',
    },
    margins: {
      top: attr(pageMargin, 'top'),
      right: attr(pageMargin, 'right'),
      bottom: attr(pageMargin, 'bottom'),
      left: attr(pageMargin, 'left'),
    },
  };
}

function analyzeBidReferenceDocument(filePath) {
  const absolutePath = path.resolve(String(filePath || ''));
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return { ok: false, error: 'reference_docx_not_found', filePath: absolutePath };
  }
  const zip = new AdmZip(absolutePath);
  const entries = zip.getEntries().map((entry) => entry.entryName);
  const entrySet = new Set(entries);
  const documentXml = zip.readAsText('word/document.xml');
  const relsXml = entrySet.has('word/_rels/document.xml.rels') ? zip.readAsText('word/_rels/document.xml.rels') : '';
  const stylesXml = entrySet.has('word/styles.xml') ? zip.readAsText('word/styles.xml') : '';
  const relationshipMap = parseRelationships(relsXml);
  const styleMap = parseStyleMap(stylesXml);
  const blocks = parseBodyBlocks(documentXml, styleMap, relationshipMap);
  const headings = blocks
    .filter((block) => block.type === 'paragraph' && block.headingLevel && block.text)
    .map((block) => ({
      blockIndex: block.index,
      level: block.headingLevel,
      styleId: block.styleId,
      styleName: block.styleName,
      text: block.text,
    }));
  const tables = blocks
    .filter((block) => block.type === 'table')
    .map((block) => ({
      blockIndex: block.index,
      rowCount: block.tableRows.length,
      columnCount: block.tableColumnCount,
      firstRow: block.tableRows[0] || [],
      textPreview: block.tableRows.flat().filter(Boolean).slice(0, 12),
    }));
  const images = blocks
    .flatMap((block) => block.imageRelationshipIds.map((relationshipId, order) => ({
      blockIndex: block.index,
      paragraphText: block.text,
      relationshipId,
      target: block.imageTargets[order] || '',
    })));
  const mediaEntries = entries.filter((entry) => entry.startsWith('word/media/'));
  const footerEntries = entries.filter((entry) => /^word\/footer\d+\.xml$/.test(entry));
  const footerXml = footerEntries.map((entry) => zip.readAsText(entry)).join('\n');
  const footerText = footerEntries.map((entry) => textFromXml(zip.readAsText(entry))).join('\n');
  const pageBreakIndexes = blocks.filter((block) => block.hasPageBreak).map((block) => block.index);
  const tocBlocks = blocks.filter((block) => block.hasTocField).map((block) => ({ blockIndex: block.index, text: block.text }));

  return {
    ok: true,
    filePath: absolutePath,
    entryCount: entries.length,
    hasDocumentXml: entrySet.has('word/document.xml'),
    hasStylesXml: entrySet.has('word/styles.xml'),
    hasRelationshipsXml: entrySet.has('word/_rels/document.xml.rels'),
    layout: parseLayout(documentXml),
    summary: {
      blockCount: blocks.length,
      headingCount: headings.length,
      tableCount: tables.length,
      imageReferenceCount: images.length,
      mediaCount: mediaEntries.length,
      pageBreakCount: pageBreakIndexes.length,
      tocFieldCount: tocBlocks.length,
      footerCount: footerEntries.length,
      hasPageNumberFooter: /PAGE/.test(decodeXmlEntities(footerXml)),
      footerText,
    },
    headings,
    tables,
    images,
    mediaEntries,
    pageBreakIndexes,
    tocBlocks,
    footerEntries,
  };
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function countValues(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function missingByCount(referenceValues = [], candidateValues = []) {
  const candidateCounts = countValues(candidateValues);
  const missing = [];
  for (const value of referenceValues) {
    const count = candidateCounts.get(value) || 0;
    if (count > 0) {
      candidateCounts.set(value, count - 1);
    } else {
      missing.push(value);
    }
  }
  return missing;
}

function extraByCount(referenceValues = [], candidateValues = []) {
  return missingByCount(candidateValues, referenceValues);
}

function headingSignature(heading = {}) {
  return `${Number(heading.level || 0)}:${normalizeText(heading.text)}`;
}

function tableSignature(table = {}) {
  return (Array.isArray(table.firstRow) ? table.firstRow : [])
    .map((cell) => normalizeText(cell))
    .filter(Boolean)
    .join('|');
}

function compareHeadingOrder(referenceHeadings = [], candidateHeadings = []) {
  const candidateSignatures = candidateHeadings.map(headingSignature);
  let lastIndex = -1;
  const outOfOrder = [];
  for (const heading of referenceHeadings) {
    const signature = headingSignature(heading);
    const index = candidateSignatures.findIndex((candidateSignature, candidateIndex) => (
      candidateIndex > lastIndex && candidateSignature === signature
    ));
    if (index === -1) continue;
    if (index < lastIndex) outOfOrder.push(signature);
    lastIndex = index;
  }
  return outOfOrder;
}

function compareLayout(referenceLayout = {}, candidateLayout = {}) {
  const diffs = [];
  const fields = [
    ['pageSize.width', referenceLayout.pageSize?.width, candidateLayout.pageSize?.width],
    ['pageSize.height', referenceLayout.pageSize?.height, candidateLayout.pageSize?.height],
    ['pageSize.orientation', referenceLayout.pageSize?.orientation, candidateLayout.pageSize?.orientation],
    ['margins.top', referenceLayout.margins?.top, candidateLayout.margins?.top],
    ['margins.right', referenceLayout.margins?.right, candidateLayout.margins?.right],
    ['margins.bottom', referenceLayout.margins?.bottom, candidateLayout.margins?.bottom],
    ['margins.left', referenceLayout.margins?.left, candidateLayout.margins?.left],
  ];
  for (const [field, referenceValue, candidateValue] of fields) {
    if (String(referenceValue || '') !== String(candidateValue || '')) {
      diffs.push({ field, referenceValue: referenceValue || '', candidateValue: candidateValue || '' });
    }
  }
  return diffs;
}

function compareBidReferenceAnalyses(referenceAnalysis = {}, candidateAnalysis = {}) {
  const errors = [];
  if (!referenceAnalysis?.ok) errors.push('reference analysis is not ok');
  if (!candidateAnalysis?.ok) errors.push('candidate analysis is not ok');
  if (errors.length) {
    return {
      passed: false,
      errors,
      details: {
        referenceOk: Boolean(referenceAnalysis?.ok),
        candidateOk: Boolean(candidateAnalysis?.ok),
      },
    };
  }

  const referenceHeadingSignatures = (referenceAnalysis.headings || []).map(headingSignature);
  const candidateHeadingSignatures = (candidateAnalysis.headings || []).map(headingSignature);
  const missingHeadings = missingByCount(referenceHeadingSignatures, candidateHeadingSignatures);
  const extraHeadings = extraByCount(referenceHeadingSignatures, candidateHeadingSignatures);
  const outOfOrderHeadings = compareHeadingOrder(referenceAnalysis.headings || [], candidateAnalysis.headings || []);

  const referenceTableSignatures = (referenceAnalysis.tables || []).map(tableSignature).filter(Boolean);
  const candidateTableSignatures = (candidateAnalysis.tables || []).map(tableSignature).filter(Boolean);
  const missingTableHeaders = missingByCount(referenceTableSignatures, candidateTableSignatures);
  const extraTableHeaders = extraByCount(referenceTableSignatures, candidateTableSignatures);
  const layoutDiffs = compareLayout(referenceAnalysis.layout || {}, candidateAnalysis.layout || {});
  const summaryDiffs = [];

  const referenceSummary = referenceAnalysis.summary || {};
  const candidateSummary = candidateAnalysis.summary || {};
  [
    ['tocFieldCount', referenceSummary.tocFieldCount || 0, candidateSummary.tocFieldCount || 0],
    ['pageBreakCount', referenceSummary.pageBreakCount || 0, candidateSummary.pageBreakCount || 0],
    ['imageReferenceCount', referenceSummary.imageReferenceCount || 0, candidateSummary.imageReferenceCount || 0],
    ['footerCount', referenceSummary.footerCount || 0, candidateSummary.footerCount || 0],
  ].forEach(([field, referenceCount, candidateCount]) => {
    if (Number(candidateCount) < Number(referenceCount)) {
      summaryDiffs.push({ field, referenceCount, candidateCount });
    }
  });
  if (referenceSummary.hasPageNumberFooter && !candidateSummary.hasPageNumberFooter) {
    summaryDiffs.push({ field: 'hasPageNumberFooter', referenceValue: true, candidateValue: false });
  }

  if (missingHeadings.length) errors.push(`missing headings: ${missingHeadings.join(', ')}`);
  if (extraHeadings.length) errors.push(`extra headings: ${extraHeadings.join(', ')}`);
  if (outOfOrderHeadings.length) errors.push(`out-of-order headings: ${outOfOrderHeadings.join(', ')}`);
  if (missingTableHeaders.length) errors.push(`missing table headers: ${missingTableHeaders.join(', ')}`);
  if (layoutDiffs.length) errors.push(`layout differs: ${layoutDiffs.map((diff) => diff.field).join(', ')}`);
  if (summaryDiffs.length) errors.push(`summary counts below reference: ${summaryDiffs.map((diff) => diff.field).join(', ')}`);

  return {
    passed: errors.length === 0,
    errors,
    details: {
      missingHeadings,
      extraHeadings,
      outOfOrderHeadings,
      missingTableHeaders,
      extraTableHeaders,
      layoutDiffs,
      summaryDiffs,
      referenceSummary,
      candidateSummary,
    },
  };
}

module.exports = {
  analyzeBidReferenceDocument,
  compareBidReferenceAnalyses,
  decodeXmlEntities,
  parseStyleMap,
};
