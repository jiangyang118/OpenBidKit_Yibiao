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
const { getAiEvaluationBidDocumentMarkdownPath, getAiEvaluationDir } = require('../utils/paths.cjs');

const categoryLabels = {
  qualification: '资格项',
  business: '商务项',
  technical: '技术项',
  price: '报价项',
  objective: '客观分',
  subjective: '主观分',
  other: '其他评分项',
};

const categoryKeywords = [
  { category: 'qualification', keywords: ['资格', '资质', '证书', '业绩', '人员要求', '供应商资格'] },
  { category: 'business', keywords: ['商务', '合同', '付款', '服务期', '工期', '承诺', '售后'] },
  { category: 'technical', keywords: ['技术', '方案', '实施', '运维', '功能', '架构', '服务方案'] },
  { category: 'price', keywords: ['报价', '价格', '投标报价', '评标价', '下浮率'] },
  { category: 'objective', keywords: ['客观分', '证书', '业绩', '资信', '加分'] },
  { category: 'subjective', keywords: ['主观分', '专家', '综合评价', '方案评分'] },
];

const riskLevels = new Set(['low', 'medium', 'high']);

function now() {
  return new Date().toISOString();
}

function stableHash(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
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
    .split(/\r?\n+/)
    .map(normalizeParagraph)
    .filter((line) => line.length >= 8 && line.length <= 500);
}

function splitEvidenceParagraphs(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const entries = [];
  let sectionTitle = '正文';

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] || '';
    const heading = rawLine.match(/^\s*#{1,6}\s*(.+?)\s*$/);
    if (heading) {
      sectionTitle = normalizeParagraph(heading[1]) || '正文';
      continue;
    }

    const paragraph = normalizeParagraph(rawLine);
    if (paragraph.length >= 8 && paragraph.length <= 500) {
      entries.push({
        paragraph,
        sectionTitle,
        lineNumber: index + 1,
      });
    }
  }

  return entries;
}

function normalizeCategory(value) {
  return categoryLabels[value] ? value : 'other';
}

function normalizeRiskLevel(value) {
  return riskLevels.has(value) ? value : 'medium';
}

function inferCategory(text) {
  for (const item of categoryKeywords) {
    if (item.keywords.some((keyword) => text.includes(keyword))) return item.category;
  }
  return 'other';
}

function inferMaxScore(text, category) {
  const scoreMatches = [...String(text || '').matchAll(/([0-9]+(?:\.[0-9]+)?)\s*分/g)].map((match) => Number(match[1]));
  const usable = scoreMatches.filter((value) => Number.isFinite(value) && value > 0 && value <= 100);
  if (usable.length) return Math.max(...usable);
  if (category === 'technical') return 20;
  if (category === 'price') return 15;
  if (category === 'business') return 10;
  if (category === 'qualification' || category === 'objective') return 8;
  return 5;
}

function inferRiskLevel(text, category) {
  if (/(废标|无效|否决|不通过|不得分|0分|必须提供|缺少|未提供)/.test(text)) return 'high';
  if (category === 'qualification' || category === 'price' || /(扣分|酌情|横向比较|专家)/.test(text)) return 'medium';
  return 'low';
}

function inferAutoScore(maxScore, riskLevel, text) {
  const ratio = riskLevel === 'high' ? 0.62 : riskLevel === 'medium' ? 0.78 : 0.9;
  const penalty = /(未提供|不得分|0分|否决|无效)/.test(text) ? 0.2 : 0;
  const score = maxScore * Math.max(0.35, ratio - penalty);
  return Math.max(0, Math.min(maxScore, Math.round(score * 10) / 10));
}

function buildTitle(text, category, index) {
  const cleaned = text.replace(/[：:]\s*$/, '').slice(0, 52);
  if (cleaned.length >= 10) return cleaned;
  return `${categoryLabels[category]} ${index + 1}`;
}

function createItemId(category, text, index) {
  const hash = stableHash(`${category}\n${text}`).slice(0, 16);
  return `eval-${String(index + 1).padStart(3, '0')}-${hash}`;
}

function createBidDocumentId(fileName, content) {
  const hash = stableHash(`${fileName}\n${content}`).slice(0, 16);
  return `bid-${hash}`;
}

function createAuditOpinionId(type, targetId, title) {
  const hash = stableHash(`${type}\n${targetId}\n${title}`).slice(0, 16);
  return `audit-${hash}`;
}

function createExpertScoreId(itemId, expertName) {
  const hash = stableHash(`${itemId}\n${expertName}`).slice(0, 16);
  return `expert-${hash}`;
}

function createReportId(markdown) {
  const hash = stableHash(`${Date.now()}\n${markdown}`).slice(0, 16);
  return `report-${hash}`;
}

function createFallbackItems(markdown) {
  const text = String(markdown || '');
  const fallbackDefinitions = [
    {
      category: 'qualification',
      title: '资格条件符合性',
      requirementText: '检查投标人资格、资质、业绩、人员和证明材料是否满足招标文件要求。',
      maxScore: 20,
      riskLevel: /资格|资质|业绩/.test(text) ? 'medium' : 'high',
    },
    {
      category: 'technical',
      title: '技术方案响应完整性',
      requirementText: '检查技术方案是否覆盖项目需求、实施路径、运维服务、质量保障和风险控制。',
      maxScore: 40,
      riskLevel: /技术|方案|实施|运维/.test(text) ? 'medium' : 'high',
    },
    {
      category: 'business',
      title: '商务与合同条款响应',
      requirementText: '检查付款、合同、服务期、交付期、售后、承诺和偏离情况。',
      maxScore: 20,
      riskLevel: /商务|合同|付款|服务期|工期/.test(text) ? 'medium' : 'high',
    },
    {
      category: 'price',
      title: '报价响应与价格合理性',
      requirementText: '检查报价是否满足限价、分项报价、价格有效期和评标价规则。',
      maxScore: 20,
      riskLevel: /报价|价格|最高限价|控制价/.test(text) ? 'medium' : 'high',
    },
  ];

  return fallbackDefinitions.map((item, index) => {
    const autoScore = inferAutoScore(item.maxScore, item.riskLevel, item.requirementText);
    return {
      id: createItemId(item.category, item.requirementText, index),
      category: item.category,
      label: categoryLabels[item.category],
      title: item.title,
      requirementText: item.requirementText,
      maxScore: item.maxScore,
      autoScore,
      manualScore: null,
      finalScore: autoScore,
      evidence: '第一阶段使用规则自评，请结合投标文件正文人工补充证据。',
      deductionReason: item.riskLevel === 'high' ? '招标文件中缺少可直接匹配的评分细则，需要人工复核。' : '需人工确认投标文件响应证据。',
      riskLevel: item.riskLevel,
      confirmed: false,
      sortOrder: index,
      updatedAt: now(),
    };
  });
}

function collectEvidenceKeywords(item) {
  const category = normalizeCategory(item.category);
  const categoryKeywordItem = categoryKeywords.find((entry) => entry.category === category);
  const stopWords = new Set(['评分', '评审', '评标', '得分', '分值', '满分', '要求', '提供', '进行', '是否', '根据', '投标', '文件', '方案']);
  const text = `${item.title || ''}\n${item.requirementText || ''}`;
  const words = String(text).match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  return [...new Set([
    ...(categoryKeywordItem?.keywords || []),
    ...words.filter((word) => !stopWords.has(word) && !/^\d+$/.test(word)),
  ])].slice(0, 18);
}

function findBestEvidenceParagraph(item, bidParagraphs) {
  const keywords = collectEvidenceKeywords(item);
  let best = null;
  for (const entry of bidParagraphs) {
    const paragraph = typeof entry === 'string' ? entry : entry?.paragraph;
    if (!paragraph) continue;
    const matched = keywords.filter((keyword) => paragraph.includes(keyword));
    const score = matched.length;
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && paragraph.length > best.paragraph.length)) {
      best = {
        ...(typeof entry === 'string' ? {} : entry),
        paragraph,
        score,
        matched,
      };
    }
  }
  return best;
}

function scoreItemWithBidEvidence(item, evidenceMatch) {
  const maxScore = Number(item.maxScore || 0);
  const hasEvidence = Boolean(evidenceMatch?.paragraph);
  const locationHint = hasEvidence
    ? `${evidenceMatch.sectionTitle || '正文'} / 第 ${evidenceMatch.lineNumber || '-'} 行`
    : '';
  const riskLevel = hasEvidence
    ? (evidenceMatch.score >= 3 ? 'low' : 'medium')
    : 'high';
  const ratio = riskLevel === 'low' ? 0.9 : riskLevel === 'medium' ? 0.78 : 0.55;
  const autoScore = Math.max(0, Math.min(maxScore, Math.round(maxScore * ratio * 10) / 10));
  const manualScore = item.manualScore === null || item.manualScore === undefined ? null : Number(item.manualScore);
  return {
    ...item,
    autoScore,
    finalScore: manualScore === null ? autoScore : manualScore,
    evidence: hasEvidence
      ? `${locationHint}：${evidenceMatch.paragraph.slice(0, 320)}`
      : `未在投标文件中定位到“${item.title}”的明确响应证据。`,
    deductionReason: hasEvidence
      ? `已在${locationHint}匹配投标文件证据关键词：${evidenceMatch.matched.slice(0, 6).join('、')}。请人工复核证据是否充分。`
      : '投标文件中未定位到直接响应内容，建议补充对应章节、证明材料或承诺。',
    riskLevel,
    confirmed: false,
    updatedAt: now(),
  };
}

function evaluateItemsAgainstBidDocument(items, bidMarkdown) {
  const bidParagraphs = splitEvidenceParagraphs(bidMarkdown);
  return items.map((item) => scoreItemWithBidEvidence(item, findBestEvidenceParagraph(item, bidParagraphs)));
}

function extractEvaluationItems(markdown) {
  const paragraphs = splitParagraphs(markdown);
  const seen = new Set();
  const items = [];

  for (const paragraph of paragraphs) {
    const category = inferCategory(paragraph);
    const isScoringLine = /(评分|评审|评标|得分|分值|满分|客观分|主观分|报价分|技术分|商务分|资格审查|符合性)/.test(paragraph);
    if (!isScoringLine && category === 'other') continue;
    if (!isScoringLine && !/(资格|技术|商务|报价|资信|业绩|证书|合同)/.test(paragraph)) continue;
    const signature = stableHash(paragraph).slice(0, 20);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const maxScore = inferMaxScore(paragraph, category);
    const riskLevel = inferRiskLevel(paragraph, category);
    const autoScore = inferAutoScore(maxScore, riskLevel, paragraph);
    items.push({
      id: createItemId(category, paragraph, items.length),
      category,
      label: categoryLabels[category],
      title: buildTitle(paragraph, category, items.length),
      requirementText: paragraph,
      maxScore,
      autoScore,
      manualScore: null,
      finalScore: autoScore,
      evidence: paragraph.slice(0, 260),
      deductionReason: riskLevel === 'high' ? '存在否决、缺项或强制性表述，需要人工核验证据。' : '第一阶段规则自评，建议补充投标文件对应章节证据。',
      riskLevel,
      confirmed: false,
      sortOrder: items.length,
      updatedAt: now(),
    });
    if (items.length >= 80) break;
  }

  return items.length ? items : createFallbackItems(markdown);
}

function buildAiEvaluationExtractionMessages(markdown, ruleItems = []) {
  const rulePreview = ruleItems.slice(0, 40).map((item, index) => ({
    index: index + 1,
    category: item.category,
    title: item.title,
    requirementText: item.requirementText,
    maxScore: item.maxScore,
    riskLevel: item.riskLevel,
  }));
  return [
    {
      role: 'system',
      content: [
        '你是招投标评标办法结构化专家，负责从招标文件或评分办法中抽取 AI 评标评分表。',
        '只返回 JSON，不要输出 Markdown、解释或前后缀。',
        '字段枚举：category 只能是 qualification、business、technical、price、objective、subjective、other；riskLevel 只能是 low、medium、high。',
        '每个 item 必须保留评分项名称、评分要求原文、满分、证据摘录建议、扣分/复核意见和风险等级。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于下面招标文件 Markdown 抽取结构化评分表。',
        '',
        '输出 JSON 格式：',
        '{"items":[{"category":"technical","title":"评分项名称","requirementText":"评分要求原文","maxScore":10,"autoScore":8,"evidence":"证据摘录或证据要求","deductionReason":"扣分原因或复核意见","riskLevel":"medium"}]}',
        '',
        '规则提取初稿可作为参考，但你需要补充遗漏、合并重复，并修正分类、分值和风险：',
        JSON.stringify(rulePreview, null, 2),
        '',
        '招标文件 Markdown：',
        String(markdown || '').slice(0, 90000),
      ].join('\n'),
    },
  ];
}

function normalizeAiEvaluationItems(payload) {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const requirementText = normalizeParagraph(row?.requirementText || row?.requirement_text || row?.requirement || row?.text);
    const title = normalizeParagraph(row?.title || row?.name || row?.label) || buildTitle(requirementText, normalizeCategory(row?.category), items.length);
    if (!requirementText && !title) continue;
    const category = normalizeCategory(row?.category);
    const signature = stableHash(`${category}\n${title}\n${requirementText}`).slice(0, 20);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const maxScore = Math.max(0, Math.min(100, Number(row?.maxScore ?? row?.max_score ?? row?.score ?? inferMaxScore(requirementText, category)) || 0));
    const riskLevel = normalizeRiskLevel(row?.riskLevel || row?.risk_level);
    const rawAutoScore = Number(row?.autoScore ?? row?.auto_score);
    const autoScore = Number.isFinite(rawAutoScore)
      ? Math.max(0, Math.min(maxScore, Math.round(rawAutoScore * 10) / 10))
      : inferAutoScore(maxScore, riskLevel, requirementText);
    items.push({
      id: createItemId(category, `${title}\n${requirementText}`, items.length),
      category,
      label: categoryLabels[category],
      title: title.slice(0, 80),
      requirementText: requirementText || title,
      maxScore,
      autoScore,
      manualScore: null,
      finalScore: autoScore,
      evidence: normalizeParagraph(row?.evidence || row?.evidenceText || row?.evidence_text) || 'AI 已抽取评分项，请导入投标文件后匹配响应证据。',
      deductionReason: normalizeParagraph(row?.deductionReason || row?.deduction_reason || row?.reviewOpinion || row?.reason) || '需人工复核评分依据、客观分证明材料和专家打分合理性。',
      riskLevel,
      confirmed: false,
      sortOrder: items.length,
      updatedAt: now(),
    });
    if (items.length >= 100) break;
  }
  return items;
}

function validateAiEvaluationItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('AI 未返回可用评分项');
  }
}

function rowToItem(row) {
  const maxScore = Number(row.max_score || 0);
  const autoScore = Number(row.auto_score || 0);
  const manualScore = row.manual_score === null || row.manual_score === undefined ? null : Number(row.manual_score);
  const finalScore = manualScore === null ? Number(row.final_score || autoScore) : manualScore;
  return {
    id: row.item_id,
    category: normalizeCategory(row.category),
    label: row.label || categoryLabels[normalizeCategory(row.category)],
    title: row.title || '',
    requirementText: row.requirement_text || '',
    maxScore,
    autoScore,
    manualScore,
    finalScore: Math.max(0, Math.min(maxScore || finalScore, finalScore)),
    evidence: row.evidence || '',
    deductionReason: row.deduction_reason || '',
    riskLevel: normalizeRiskLevel(row.risk_level),
    confirmed: Number(row.confirmed || 0) === 1,
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at || '',
  };
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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

function rowToBidDocument(row) {
  if (!row) return null;
  return {
    id: row.document_id,
    fileName: row.file_name || '投标文件',
    contentHash: row.content_hash || '',
    contentChars: Number(row.content_chars || 0),
    parserLabel: row.parser_label || undefined,
    importedAt: row.imported_at || row.updated_at || '',
    sortOrder: Number(row.sort_order || 0),
  };
}

function rowToBidScore(row) {
  return {
    documentId: row.document_id,
    itemId: row.item_id,
    autoScore: Number(row.auto_score || 0),
    finalScore: Number(row.final_score || 0),
    evidence: row.evidence || '',
    deductionReason: row.deduction_reason || '',
    riskLevel: normalizeRiskLevel(row.risk_level),
    updatedAt: row.updated_at || '',
  };
}

function rowToAuditOpinion(row) {
  if (!row) return null;
  return {
    id: row.opinion_id,
    type: row.opinion_type || 'review',
    severity: normalizeRiskLevel(row.severity),
    title: row.title || '',
    targetType: row.target_type || '',
    targetId: row.target_id || '',
    evidence: row.evidence || '',
    recommendation: row.recommendation || '',
    status: row.status || 'open',
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function rowToExpertScore(row) {
  if (!row) return null;
  return {
    id: row.score_id,
    itemId: row.item_id,
    expertName: row.expert_name || '',
    score: Number(row.expert_score || 0),
    opinion: row.opinion || '',
    createdAt: row.created_at || row.updated_at || '',
    updatedAt: row.updated_at || row.created_at || '',
  };
}

function rowToReportSnapshot(row) {
  if (!row) return null;
  return {
    id: row.report_id,
    type: row.report_type || 'self-evaluation',
    title: row.title || 'AI 评标自评报告',
    markdownChars: String(row.markdown || '').length,
    summary: safeJsonParse(row.summary_json, {}),
    generatedAt: row.generated_at || '',
    exportedPath: row.exported_path || undefined,
    exportedAt: row.exported_at || undefined,
  };
}

function summarizeExpertReview(expertScores = [], items = []) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const expertNames = new Set();
  const grouped = new Map();
  for (const score of expertScores) {
    if (score.expertName) expertNames.add(score.expertName);
    if (!grouped.has(score.itemId)) grouped.set(score.itemId, []);
    grouped.get(score.itemId).push(score);
  }

  let conflictCount = 0;
  let maxDeviation = 0;
  for (const [itemId, scores] of grouped.entries()) {
    const item = itemById.get(itemId);
    const scoreValues = scores.map((score) => Number(score.score || 0));
    const maxScore = Math.max(Number(item?.maxScore || 0), ...scoreValues, 1);
    const threshold = Math.max(3, maxScore * 0.1);
    const maxScoreValue = Math.max(...scoreValues);
    const minScoreValue = Math.min(...scoreValues);
    const average = scoreValues.reduce((sum, value) => sum + value, 0) / Math.max(scoreValues.length, 1);
    const autoDeviation = Math.abs(average - Number(item?.finalScore || 0));
    const expertDeviation = scores.length >= 2 ? maxScoreValue - minScoreValue : 0;
    const deviation = Math.max(autoDeviation, expertDeviation);
    if (deviation >= threshold) conflictCount += 1;
    maxDeviation = Math.max(maxDeviation, deviation);
  }

  return {
    expertCount: expertNames.size,
    scoreCount: expertScores.length,
    conflictCount,
    maxDeviation: Math.round(maxDeviation * 10) / 10,
    conclusion: !expertScores.length
      ? '尚未录入专家打分。'
      : conflictCount > 0
        ? '存在专家打分偏差，建议组织交叉复核。'
        : '专家打分暂未发现明显偏差。',
  };
}

function summarize(items) {
  const totalMaxScore = Math.round(items.reduce((sum, item) => sum + Number(item.maxScore || 0), 0) * 10) / 10;
  const totalFinalScore = Math.round(items.reduce((sum, item) => sum + Number(item.finalScore || 0), 0) * 10) / 10;
  const highRiskCount = items.filter((item) => item.riskLevel === 'high').length;
  const confirmedCount = items.filter((item) => item.confirmed).length;
  const ratio = totalMaxScore > 0 ? totalFinalScore / totalMaxScore : 0;
  const conclusion = !items.length
    ? '请先生成评分表'
    : ratio >= 0.85 && highRiskCount === 0
      ? '自评结果较稳，建议补齐证据后进入正式评审。'
      : ratio >= 0.7
        ? '自评存在中等风险，建议优先处理扣分项和未确认项。'
        : '自评分偏低或高风险项较多，建议暂缓提交并集中整改。';
  return {
    totalMaxScore,
    totalFinalScore,
    confirmedCount,
    highRiskCount,
    itemCount: items.length,
    conclusion,
  };
}

function summarizeBidScoreItems(items, fileName = '') {
  const base = summarize(items);
  return {
    ...base,
    fileName,
  };
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim() || '-';
}

function formatScore(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(Math.round(number * 10) / 10) : '0';
}

function formatEvaluationRow(item, index) {
  return [
    index + 1,
    item.label || categoryLabels[normalizeCategory(item.category)],
    item.title,
    item.maxScore,
    item.autoScore,
    item.manualScore === null || item.manualScore === undefined ? '未调整' : item.manualScore,
    item.finalScore,
    item.riskLevel,
    item.confirmed ? '已复核' : '待复核',
    item.evidence,
    item.deductionReason,
  ].map(escapeMarkdownTableCell);
}

function buildEvaluationTable(items) {
  if (!items.length) {
    return '暂无评分项。';
  }
  const rows = items.map((item, index) => `| ${formatEvaluationRow(item, index).join(' | ')} |`);
  return [
    '| 序号 | 分类 | 评分项 | 满分 | 规则自评 | 人工分 | 最终分 | 风险 | 复核状态 | 证据摘录 | 扣分原因/复核意见 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildBidScoreSummaryTable(summaries = []) {
  if (!summaries.length) {
    return '暂无投标文件评分结果。';
  }
  const rows = summaries.map((item, index) => `| ${[
    index + 1,
    item.fileName,
    item.itemCount,
    `${formatScore(item.totalFinalScore)} / ${formatScore(item.totalMaxScore)}`,
    item.highRiskCount,
    item.conclusion,
  ].map(escapeMarkdownTableCell).join(' | ')} |`);
  return [
    '| 序号 | 投标文件 | 评分项 | 自评总分 | 高风险 | 结论 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildAuditOpinions(state) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const summaries = Array.isArray(state?.bidScoreSummaries) ? state.bidScoreSummaries : [];
  const documents = Array.isArray(state?.bidDocuments) ? state.bidDocuments : [];
  const expertScores = Array.isArray(state?.expertScores) ? state.expertScores : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const expertScoresByItem = new Map();
  for (const score of expertScores) {
    if (!expertScoresByItem.has(score.itemId)) expertScoresByItem.set(score.itemId, []);
    expertScoresByItem.get(score.itemId).push(score);
  }
  const opinions = [];

  for (const item of items) {
    if (item.riskLevel === 'high') {
      opinions.push({
        type: 'risk',
        severity: 'high',
        title: `高风险评分项：${item.title}`,
        targetType: 'item',
        targetId: item.id,
        evidence: item.evidence || item.requirementText,
        recommendation: item.deductionReason || '提交前补充证据并复核扣分原因。',
      });
    }
    if (!item.confirmed) {
      opinions.push({
        type: 'review',
        severity: item.riskLevel === 'high' ? 'high' : 'medium',
        title: `待人工复核：${item.title}`,
        targetType: 'item',
        targetId: item.id,
        evidence: item.evidence || item.requirementText,
        recommendation: '请由评标负责人确认证据、分值和扣分原因后再形成正式结论。',
      });
    }
    if ((item.category === 'objective' || item.category === 'price') && item.riskLevel !== 'low') {
      opinions.push({
        type: item.category === 'price' ? 'price-check' : 'objective-check',
        severity: item.riskLevel === 'high' ? 'high' : 'medium',
        title: `${item.label}核验：${item.title}`,
        targetType: 'item',
        targetId: item.id,
        evidence: item.evidence || item.requirementText,
        recommendation: item.category === 'price'
          ? '核验报价表、分项报价、限价和评标价计算口径，避免报价性废标或价格分误判。'
          : '核验证书、业绩、人员、合同或验收证明等客观材料，确保评分证据可追溯。',
      });
    }
  }

  for (const [itemId, scores] of expertScoresByItem.entries()) {
    const item = itemById.get(itemId);
    if (!item || !scores.length) continue;
    const scoreValues = scores.map((score) => Number(score.score || 0));
    const maxScoreValue = Math.max(...scoreValues);
    const minScoreValue = Math.min(...scoreValues);
    const average = scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length;
    const threshold = Math.max(3, Number(item.maxScore || 0) * 0.1);
    if (scores.length >= 2 && maxScoreValue - minScoreValue >= threshold) {
      opinions.push({
        type: 'expert-cross-review',
        severity: 'high',
        title: `专家打分分差需复核：${item.title}`,
        targetType: 'expert-score',
        targetId: item.id,
        evidence: `专家最高 ${formatScore(maxScoreValue)} 分，最低 ${formatScore(minScoreValue)} 分，分差 ${formatScore(maxScoreValue - minScoreValue)} 分。`,
        recommendation: '组织专家复核同一评分项的评分口径，必要时记录复议结论并调整最终分。',
      });
    }
    const selfDeviation = Math.abs(average - Number(item.finalScore || 0));
    if (selfDeviation >= threshold) {
      opinions.push({
        type: 'expert-score-deviation',
        severity: selfDeviation >= threshold * 1.5 ? 'high' : 'medium',
        title: `专家均分与当前分偏差：${item.title}`,
        targetType: 'expert-score',
        targetId: item.id,
        evidence: `当前最终分 ${formatScore(item.finalScore)} 分，专家均分 ${formatScore(average)} 分，偏差 ${formatScore(selfDeviation)} 分。`,
        recommendation: '对比专家意见、投标文件证据和扣分原因，确认是否需要调整人工分或补充复核说明。',
      });
    }
  }

  for (const summary of summaries) {
    if (Number(summary.highRiskCount || 0) > 0) {
      opinions.push({
        type: 'document-risk',
        severity: 'high',
        title: `投标文件存在高风险项：${summary.fileName}`,
        targetType: 'bid-document',
        targetId: summary.documentId,
        evidence: `自评总分 ${formatScore(summary.totalFinalScore)} / ${formatScore(summary.totalMaxScore)}，高风险 ${summary.highRiskCount} 项。`,
        recommendation: '优先复核该投标文件的高风险评分项，补齐证据后再横向比较。',
      });
    }
  }

  if (summaries.length >= 2) {
    const scores = summaries.map((summary) => Number(summary.totalFinalScore || 0));
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const referenceMax = Math.max(...summaries.map((summary) => Number(summary.totalMaxScore || 0)), 1);
    if (maxScore - minScore >= Math.max(5, referenceMax * 0.1)) {
      opinions.push({
        type: 'cross-review',
        severity: 'medium',
        title: '多投标文件横向分差需交叉复核',
        targetType: 'bid-document-set',
        targetId: 'all',
        evidence: `最高自评 ${formatScore(maxScore)}，最低自评 ${formatScore(minScore)}，分差 ${formatScore(maxScore - minScore)}。`,
        recommendation: '安排专家交叉审核分差较大的评分项，确认同一评分规则在不同投标文件上的适用口径一致。',
      });
    }
  }

  if (items.length && !documents.length) {
    opinions.push({
      type: 'evidence',
      severity: 'medium',
      title: '尚未导入投标文件，评分证据不足',
      targetType: 'workspace',
      targetId: 'ai-evaluation',
      evidence: '当前仅有评分项或评分办法，缺少投标文件正文证据。',
      recommendation: '导入至少一份投标文件后再生成正式自评报告。',
    });
  }

  const seen = new Set();
  return opinions.filter((opinion) => {
    const signature = `${opinion.type}:${opinion.targetType}:${opinion.targetId}:${opinion.title}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0, 40).map((opinion, index) => ({
    id: createAuditOpinionId(opinion.type, opinion.targetId, opinion.title),
    status: 'open',
    sortOrder: index,
    updatedAt: now(),
    ...opinion,
  }));
}

function buildAuditOpinionTable(opinions = []) {
  if (!opinions.length) {
    return '暂无审计意见。';
  }
  const rows = opinions.map((item, index) => `| ${[
    index + 1,
    item.severity,
    item.type,
    item.title,
    item.evidence,
    item.recommendation,
    item.status === 'closed' ? '已关闭' : '待处理',
  ].map(escapeMarkdownTableCell).join(' | ')} |`);
  return [
    '| 序号 | 风险 | 类型 | 审计意见 | 证据 | 建议 | 状态 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildExpertScoreTable(expertScores = [], items = []) {
  if (!expertScores.length) {
    return '暂无专家打分记录。';
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rows = expertScores.map((score, index) => {
    const item = itemById.get(score.itemId);
    return `| ${[
      index + 1,
      item?.title || score.itemId,
      score.expertName,
      formatScore(score.score),
      item ? `${formatScore(item.finalScore)} / ${formatScore(item.maxScore)}` : '-',
      score.opinion,
      score.updatedAt,
    ].map(escapeMarkdownTableCell).join(' | ')} |`;
  });
  return [
    '| 序号 | 评分项 | 专家 | 专家分 | 当前最终分/满分 | 专家意见 | 更新时间 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildAiEvaluationReportMarkdown(state) {
  const source = state?.source;
  const items = Array.isArray(state?.items) ? state.items : [];
  const summary = state?.summary || summarize(items);
  const bidDocuments = Array.isArray(state?.bidDocuments) ? state.bidDocuments : [];
  const bidScoreSummaries = Array.isArray(state?.bidScoreSummaries) ? state.bidScoreSummaries : [];
  const expertScores = Array.isArray(state?.expertScores) ? state.expertScores : [];
  const expertReviewSummary = state?.expertReviewSummary || summarizeExpertReview(expertScores, items);
  const auditOpinions = Array.isArray(state?.auditOpinions) ? state.auditOpinions : buildAuditOpinions(state);
  const highRiskItems = items.filter((item) => item.riskLevel === 'high');
  const pendingItems = items.filter((item) => !item.confirmed);

  return [
    '# AI 评标自评报告',
    '',
    '## 基本信息',
    '',
    `- 来源文件：${source?.fileName || '未记录'}`,
    `- 来源类型：${source?.type || '未记录'}`,
    `- 生成时间：${source?.generatedAt || '未记录'}`,
    `- 评分项数量：${summary.itemCount || items.length}`,
    `- 自评总分：${formatScore(summary.totalFinalScore)} / ${formatScore(summary.totalMaxScore)}`,
    `- 已复核：${summary.confirmedCount || 0}`,
    `- 高风险：${summary.highRiskCount || highRiskItems.length}`,
    `- 已导入投标文件：${bidDocuments.length}`,
    `- 专家人数：${expertReviewSummary.expertCount || 0}`,
    `- 专家打分记录：${expertReviewSummary.scoreCount || 0}`,
    `- 专家打分冲突：${expertReviewSummary.conflictCount || 0}`,
    `- 结论：${summary.conclusion || '待评估'}`,
    '',
    '## 投标文件评分汇总',
    '',
    buildBidScoreSummaryTable(bidScoreSummaries),
    '',
    '## 专家打分交叉审核',
    '',
    buildExpertScoreTable(expertScores, items),
    '',
    '## 审计意见',
    '',
    buildAuditOpinionTable(auditOpinions),
    '',
    '## 评分明细',
    '',
    buildEvaluationTable(items),
    '',
    '## 高风险项',
    '',
    buildEvaluationTable(highRiskItems),
    '',
    '## 待复核项',
    '',
    buildEvaluationTable(pendingItems),
    '',
    '## 处理建议',
    '',
    highRiskItems.length > 0 ? '- 存在高风险评分项，提交前需要补充证据并复核扣分原因。' : '- 暂未发现高风险评分项。',
    pendingItems.length > 0 ? '- 仍有待复核评分项，建议完成证据确认后再形成最终评标结论。' : '- 所有评分项均已复核。',
    '',
  ].join('\n');
}

const evaluationTableHeaders = ['序号', '分类', '评分项', '满分', '规则自评', '人工分', '最终分', '风险', '复核状态', '证据摘录', '扣分原因/复核意见'];
const bidSummaryTableHeaders = ['序号', '投标文件', '评分项', '自评总分', '高风险', '结论'];
const expertScoreTableHeaders = ['序号', '评分项', '专家', '专家分', '当前最终分/满分', '专家意见', '更新时间'];
const auditOpinionTableHeaders = ['序号', '风险', '类型', '审计意见', '证据', '建议', '状态'];

function getAiEvaluationWorkbookTables(state) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const summary = state?.summary || summarize(items);
  const bidDocuments = Array.isArray(state?.bidDocuments) ? state.bidDocuments : [];
  const bidScoreSummaries = Array.isArray(state?.bidScoreSummaries) ? state.bidScoreSummaries : [];
  const expertScores = Array.isArray(state?.expertScores) ? state.expertScores : [];
  const expertReviewSummary = state?.expertReviewSummary || summarizeExpertReview(expertScores, items);
  const auditOpinions = Array.isArray(state?.auditOpinions) ? state.auditOpinions : buildAuditOpinions(state);
  const highRiskItems = items.filter((item) => item.riskLevel === 'high');
  const pendingItems = items.filter((item) => !item.confirmed);
  const itemById = new Map(items.map((item) => [item.id, item]));
  return [
    {
      title: '报告摘要',
      headers: ['指标', '值'],
      rows: [
        ['来源文件', state?.source?.fileName || '未记录'],
        ['来源类型', state?.source?.type || '未记录'],
        ['生成时间', state?.source?.generatedAt || '未记录'],
        ['评分项数量', summary.itemCount || items.length],
        ['自评总分', `${formatScore(summary.totalFinalScore)} / ${formatScore(summary.totalMaxScore)}`],
        ['已复核', summary.confirmedCount || 0],
        ['高风险', summary.highRiskCount || highRiskItems.length],
        ['已导入投标文件', bidDocuments.length],
        ['专家人数', expertReviewSummary.expertCount || 0],
        ['专家打分记录', expertReviewSummary.scoreCount || 0],
        ['专家打分冲突', expertReviewSummary.conflictCount || 0],
        ['专家最大偏差', expertReviewSummary.maxDeviation || 0],
        ['审计意见', auditOpinions.length],
        ['结论', summary.conclusion || '待评估'],
      ],
    },
    {
      title: '投标文件评分汇总',
      headers: bidSummaryTableHeaders,
      rows: bidScoreSummaries.map((item, index) => [
        index + 1,
        item.fileName,
        item.itemCount,
        `${formatScore(item.totalFinalScore)} / ${formatScore(item.totalMaxScore)}`,
        item.highRiskCount,
        item.conclusion,
      ]),
    },
    {
      title: '专家打分交叉审核',
      headers: expertScoreTableHeaders,
      rows: expertScores.map((score, index) => {
        const item = itemById.get(score.itemId);
        return [
          index + 1,
          item?.title || score.itemId,
          score.expertName,
          formatScore(score.score),
          item ? `${formatScore(item.finalScore)} / ${formatScore(item.maxScore)}` : '-',
          score.opinion,
          score.updatedAt,
        ];
      }),
    },
    {
      title: '审计意见',
      headers: auditOpinionTableHeaders,
      rows: auditOpinions.map((item, index) => [
        index + 1,
        item.severity,
        item.type,
        item.title,
        item.evidence,
        item.recommendation,
        item.status === 'closed' ? '已关闭' : '待处理',
      ]),
    },
    {
      title: '评分明细',
      headers: evaluationTableHeaders,
      rows: items.map((item, index) => formatEvaluationRow(item, index)),
    },
    {
      title: '高风险项',
      headers: evaluationTableHeaders,
      rows: highRiskItems.map((item, index) => formatEvaluationRow(item, index)),
    },
    {
      title: '待复核项',
      headers: evaluationTableHeaders,
      rows: pendingItems.map((item, index) => formatEvaluationRow(item, index)),
    },
  ];
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

function createDocxTable(headers, rows) {
  const tableRows = [
    new TableRow({ children: headers.map((header) => createDocxTableCell(header, { header: true })) }),
    ...(rows.length ? rows : [headers.map(() => '暂无记录')]).map((row) => new TableRow({
      children: row.map((value) => createDocxTableCell(value)),
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
    rows: tableRows,
  });
}

async function buildAiEvaluationWordBuffer(state) {
  const source = state?.source || {};
  const items = Array.isArray(state?.items) ? state.items : [];
  const summary = state?.summary || summarize(items);
  const auditOpinions = Array.isArray(state?.auditOpinions) ? state.auditOpinions : buildAuditOpinions(state);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'AI 评标正式报告', font: '宋体', size: 32, bold: true })],
    }),
    createDocxParagraph(`来源文件：${source.fileName || '未记录'}`),
    createDocxParagraph(`来源类型：${source.type || '未记录'}`),
    createDocxParagraph(`生成时间：${source.generatedAt || '未记录'}`),
    createDocxParagraph(`评分项数量：${summary.itemCount || items.length}；自评总分：${formatScore(summary.totalFinalScore)} / ${formatScore(summary.totalMaxScore)}；高风险：${summary.highRiskCount || 0}；审计意见：${auditOpinions.length}`),
    createDocxParagraph(`结论：${summary.conclusion || '待评估'}`),
  ];
  for (const table of getAiEvaluationWorkbookTables({ ...state, auditOpinions })) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: table.title, font: '宋体', size: 26, bold: true })] }));
    children.push(createDocxTable(table.headers, table.rows));
  }
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '处理建议', font: '宋体', size: 26, bold: true })] }));
  children.push(createDocxParagraph(Number(summary.highRiskCount || 0) > 0 ? '存在高风险评分项，提交前需要补充证据并复核扣分原因。' : '暂未发现高风险评分项。'));
  children.push(createDocxParagraph(auditOpinions.length > 0 ? '请逐条处理审计意见后再形成最终评标结论。' : '当前未生成额外审计意见。'));

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

function buildAiEvaluationExcelBuffer(state) {
  const zip = new AdmZip();
  const tables = getAiEvaluationWorkbookTables(state);
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
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(worksheetXml([table.headers, ...table.rows]), 'utf-8'));
  });
  return zip.toBuffer();
}

function createAiEvaluationStore({ app, db, technicalPlanStore, fileService, aiService }) {
  function ensureMetaRow() {
    const existing = db.prepare('SELECT * FROM ai_evaluation_meta WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO ai_evaluation_meta (id, source_type, source_file_name, source_hash, generated_at, updated_at)
      VALUES (1, '', '', '', NULL, @updated_at)
    `).run({ updated_at: timestamp });
    return db.prepare('SELECT * FROM ai_evaluation_meta WHERE id = 1').get();
  }

  function loadState() {
    const meta = ensureMetaRow();
    const items = db.prepare('SELECT * FROM ai_evaluation_items ORDER BY sort_order ASC, item_id ASC').all().map(rowToItem);
    const aiExtractionTask = rowToTask(db.prepare('SELECT * FROM ai_evaluation_tasks WHERE type = ?').get('ai-evaluation-extraction'));
    const batchScoringTask = rowToTask(db.prepare('SELECT * FROM ai_evaluation_tasks WHERE type = ?').get('ai-evaluation-batch-scoring'));
    const bidDocuments = db.prepare('SELECT * FROM ai_evaluation_bid_documents ORDER BY sort_order ASC, imported_at ASC').all().map(rowToBidDocument).filter(Boolean);
    const bidScoreRows = db.prepare('SELECT * FROM ai_evaluation_bid_scores ORDER BY document_id ASC, item_id ASC').all().map(rowToBidScore);
    const auditOpinions = db.prepare('SELECT * FROM ai_evaluation_audit_opinions ORDER BY sort_order ASC, updated_at DESC').all().map(rowToAuditOpinion).filter(Boolean);
    const expertScores = db.prepare('SELECT * FROM ai_evaluation_expert_scores ORDER BY item_id ASC, expert_name ASC, updated_at DESC').all().map(rowToExpertScore).filter(Boolean);
    const latestReport = rowToReportSnapshot(db.prepare("SELECT * FROM ai_evaluation_reports WHERE report_type = 'self-evaluation' ORDER BY generated_at DESC LIMIT 1").get());
    const itemById = new Map(items.map((item) => [item.id, item]));
    const documentById = new Map(bidDocuments.map((document) => [document.id, document]));
    const groupedScores = new Map();
    for (const score of bidScoreRows) {
      if (!groupedScores.has(score.documentId)) groupedScores.set(score.documentId, []);
      groupedScores.get(score.documentId).push(score);
    }
    const bidScoreSummaries = [...groupedScores.entries()].map(([documentId, scores]) => {
      const document = documentById.get(documentId);
      const scoreItems = scores.map((score) => {
        const base = itemById.get(score.itemId) || {};
        return {
          ...base,
          id: score.itemId,
          maxScore: Number(base.maxScore || 0),
          autoScore: score.autoScore,
          manualScore: base.manualScore ?? null,
          finalScore: score.finalScore,
          evidence: score.evidence,
          deductionReason: score.deductionReason,
          riskLevel: score.riskLevel,
          confirmed: Boolean(base.confirmed),
        };
      });
      return {
        documentId,
        fileName: document?.fileName || documentId,
        ...summarizeBidScoreItems(scoreItems, document?.fileName || documentId),
      };
    }).sort((left, right) => {
      const leftOrder = documentById.get(left.documentId)?.sortOrder ?? 0;
      const rightOrder = documentById.get(right.documentId)?.sortOrder ?? 0;
      return leftOrder - rightOrder;
    });
    const source = meta.source_hash ? {
      type: meta.source_type || 'technical-plan',
      fileName: meta.source_file_name || '技术方案招标文件',
      contentHash: meta.source_hash,
      generatedAt: meta.generated_at || meta.updated_at,
    } : null;
    return {
      source,
      items,
      summary: summarize(items),
      aiExtractionTask,
      batchScoringTask,
      bidDocuments,
      bidScoreSummaries,
      expertScores,
      expertReviewSummary: summarizeExpertReview(expertScores, items),
      auditOpinions,
      latestReport,
    };
  }

  function replaceAuditOpinions(opinions) {
    const insert = db.prepare(`
      INSERT INTO ai_evaluation_audit_opinions (
        opinion_id, opinion_type, severity, title, target_type, target_id, evidence,
        recommendation, status, sort_order, created_at, updated_at
      ) VALUES (
        @opinion_id, @opinion_type, @severity, @title, @target_type, @target_id, @evidence,
        @recommendation, @status, @sort_order, @created_at, @updated_at
      )
    `);
    const timestamp = now();
    const transaction = db.transaction((rows) => {
      db.prepare('DELETE FROM ai_evaluation_audit_opinions').run();
      for (const opinion of rows) {
        insert.run({
          opinion_id: opinion.id,
          opinion_type: String(opinion.type || 'review'),
          severity: normalizeRiskLevel(opinion.severity),
          title: String(opinion.title || ''),
          target_type: String(opinion.targetType || ''),
          target_id: String(opinion.targetId || ''),
          evidence: String(opinion.evidence || ''),
          recommendation: String(opinion.recommendation || ''),
          status: String(opinion.status || 'open'),
          sort_order: Number(opinion.sortOrder || 0),
          created_at: timestamp,
          updated_at: opinion.updatedAt || timestamp,
        });
      }
    });
    transaction(Array.isArray(opinions) ? opinions : []);
  }

  function refreshAuditOpinions() {
    const state = loadState();
    replaceAuditOpinions(buildAuditOpinions(state));
    return loadState();
  }

  function saveReportSnapshot({ state, markdown, filePath }) {
    const timestamp = now();
    const reportId = createReportId(markdown);
    db.prepare(`
      INSERT INTO ai_evaluation_reports (
        report_id, report_type, title, markdown, summary_json, generated_at, exported_path, exported_at
      ) VALUES (
        @report_id, @report_type, @title, @markdown, @summary_json, @generated_at, @exported_path, @exported_at
      )
    `).run({
      report_id: reportId,
      report_type: 'self-evaluation',
      title: 'AI 评标自评报告',
      markdown: String(markdown || ''),
      summary_json: JSON.stringify({
        summary: state?.summary || null,
        bidDocumentCount: Array.isArray(state?.bidDocuments) ? state.bidDocuments.length : 0,
        expertScoreCount: Array.isArray(state?.expertScores) ? state.expertScores.length : 0,
        expertConflictCount: state?.expertReviewSummary?.conflictCount || 0,
        auditOpinionCount: Array.isArray(state?.auditOpinions) ? state.auditOpinions.length : 0,
      }),
      generated_at: timestamp,
      exported_path: filePath || null,
      exported_at: filePath ? timestamp : null,
    });
    return reportId;
  }

  function saveTask(task) {
    if (!task?.type) return;
    db.prepare(`
      INSERT INTO ai_evaluation_tasks (type, task_id, status, progress, logs_json, stats_json, error, started_at, updated_at)
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

  function updateAiEvaluation(partial = {}) {
    if (Object.prototype.hasOwnProperty.call(partial, 'aiExtractionTask')) {
      saveTask(partial.aiExtractionTask);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'batchScoringTask')) {
      saveTask(partial.batchScoringTask);
    }
    return loadState();
  }

  function replaceItems(items) {
    const insert = db.prepare(`
      INSERT INTO ai_evaluation_items (
        item_id, category, label, title, requirement_text, max_score, auto_score, manual_score, final_score,
        evidence, deduction_reason, risk_level, confirmed, sort_order, created_at, updated_at
      ) VALUES (
        @item_id, @category, @label, @title, @requirement_text, @max_score, @auto_score, @manual_score, @final_score,
        @evidence, @deduction_reason, @risk_level, @confirmed, @sort_order, @created_at, @updated_at
      )
    `);
    const transaction = db.transaction((nextItems) => {
      db.prepare('DELETE FROM ai_evaluation_items').run();
      const timestamp = now();
      for (const item of nextItems) {
        insert.run({
          item_id: item.id,
          category: normalizeCategory(item.category),
          label: item.label,
          title: item.title,
          requirement_text: item.requirementText,
          max_score: Number(item.maxScore || 0),
          auto_score: Number(item.autoScore || 0),
          manual_score: item.manualScore === null || item.manualScore === undefined ? null : Number(item.manualScore),
          final_score: Number(item.finalScore || 0),
          evidence: item.evidence,
          deduction_reason: item.deductionReason,
          risk_level: normalizeRiskLevel(item.riskLevel),
          confirmed: item.confirmed ? 1 : 0,
          sort_order: Number(item.sortOrder || 0),
          created_at: timestamp,
          updated_at: item.updatedAt || timestamp,
        });
      }
    });
    transaction(items);
  }

  function getBidDocumentMarkdownRelativePath(documentId) {
    return path.join('ai-evaluation', 'bid-documents', `${String(documentId || 'bid').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`).replace(/\\/g, '/');
  }

  function resolveBidDocumentMarkdownPath(markdownPath, documentId) {
    const value = String(markdownPath || '').trim();
    if (value) {
      if (path.isAbsolute(value)) return value;
      return path.join(path.dirname(getAiEvaluationDir(app)), value);
    }
    return getAiEvaluationBidDocumentMarkdownPath(app, documentId);
  }

  function writeBidDocumentMarkdown(documentId, markdown) {
    if (!app?.getPath) return '';
    const targetPath = getAiEvaluationBidDocumentMarkdownPath(app, documentId);
    const tempPath = path.join(path.dirname(targetPath), `bid-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp.md`);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(tempPath, `${String(markdown || '').trim()}\n`, 'utf-8');
    fs.renameSync(tempPath, targetPath);
    return targetPath;
  }

  function readBidDocumentMarkdown(documentId) {
    const row = db.prepare('SELECT * FROM ai_evaluation_bid_documents WHERE document_id = ?').get(String(documentId || ''));
    if (!row) return '';
    const filePath = resolveBidDocumentMarkdownPath(row.markdown_path, row.document_id);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  }

  function saveBidDocument({ fileName, markdown, parserLabel }) {
    const content = String(markdown || '').trim();
    if (!content) return '';
    const documentId = createBidDocumentId(fileName, content);
    if (app?.getPath) {
      writeBidDocumentMarkdown(documentId, content);
    }
    const currentMax = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM ai_evaluation_bid_documents').get();
    const existing = db.prepare('SELECT sort_order FROM ai_evaluation_bid_documents WHERE document_id = ?').get(documentId);
    const timestamp = now();
    db.prepare(`
      INSERT INTO ai_evaluation_bid_documents (
        document_id, file_name, markdown_path, content_hash, content_chars, parser_label, sort_order, imported_at, updated_at
      ) VALUES (
        @document_id, @file_name, @markdown_path, @content_hash, @content_chars, @parser_label, @sort_order, @imported_at, @updated_at
      ) ON CONFLICT(document_id) DO UPDATE SET
        file_name = excluded.file_name,
        markdown_path = excluded.markdown_path,
        content_hash = excluded.content_hash,
        content_chars = excluded.content_chars,
        parser_label = excluded.parser_label,
        sort_order = excluded.sort_order,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at
    `).run({
      document_id: documentId,
      file_name: String(fileName || 'AI 评标投标文件'),
      markdown_path: getBidDocumentMarkdownRelativePath(documentId),
      content_hash: stableHash(content),
      content_chars: content.length,
      parser_label: parserLabel ? String(parserLabel) : null,
      sort_order: existing ? Number(existing.sort_order || 0) : Number(currentMax?.max_sort_order || -1) + 1,
      imported_at: timestamp,
      updated_at: timestamp,
    });
    return documentId;
  }

  function saveBidScores(documentId, items) {
    if (!documentId) return;
    const insert = db.prepare(`
      INSERT INTO ai_evaluation_bid_scores (
        document_id, item_id, auto_score, final_score, evidence, deduction_reason, risk_level, created_at, updated_at
      ) VALUES (
        @document_id, @item_id, @auto_score, @final_score, @evidence, @deduction_reason, @risk_level, @created_at, @updated_at
      ) ON CONFLICT(document_id, item_id) DO UPDATE SET
        auto_score = excluded.auto_score,
        final_score = excluded.final_score,
        evidence = excluded.evidence,
        deduction_reason = excluded.deduction_reason,
        risk_level = excluded.risk_level,
        updated_at = excluded.updated_at
    `);
    const timestamp = now();
    const transaction = db.transaction((rows) => {
      db.prepare('DELETE FROM ai_evaluation_bid_scores WHERE document_id = ?').run(documentId);
      for (const item of rows) {
        insert.run({
          document_id: documentId,
          item_id: item.id,
          auto_score: Number(item.autoScore || 0),
          final_score: Number(item.finalScore || 0),
          evidence: item.evidence || '',
          deduction_reason: item.deductionReason || '',
          risk_level: normalizeRiskLevel(item.riskLevel),
          created_at: timestamp,
          updated_at: timestamp,
        });
      }
    });
    transaction(Array.isArray(items) ? items : []);
  }

  function generateFromTechnicalPlan() {
    ensureMetaRow();
    if (!technicalPlanStore?.readTenderMarkdown || !technicalPlanStore?.loadTechnicalPlan) {
      throw new Error('技术方案工作区尚未初始化');
    }
    const technicalPlan = technicalPlanStore.loadTechnicalPlan();
    const markdown = technicalPlanStore.readTenderMarkdown();
    if (!markdown.trim()) {
      throw new Error('请先在技术方案中导入招标文件，再生成 AI 评标评分表');
    }
    const items = extractEvaluationItems(markdown);
    const timestamp = now();
    const sourceHash = stableHash(markdown);
    db.prepare(`
      UPDATE ai_evaluation_meta
      SET source_type = 'technical-plan', source_file_name = @source_file_name, source_hash = @source_hash,
          generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({
      source_file_name: technicalPlan.tenderFile?.fileName || '技术方案招标文件',
      source_hash: sourceHash,
      generated_at: timestamp,
      updated_at: timestamp,
    });
    replaceItems(items);
    return refreshAuditOpinions();
  }

  async function enhanceWithAi(options = {}) {
    ensureMetaRow();
    if (!aiService?.requestJson && !aiService?.collectJsonResponse) {
      throw new Error('AI 服务尚未初始化，无法执行 AI 评标结构化抽取');
    }
    if (!technicalPlanStore?.readTenderMarkdown || !technicalPlanStore?.loadTechnicalPlan) {
      throw new Error('技术方案工作区尚未初始化');
    }
    const technicalPlan = technicalPlanStore.loadTechnicalPlan();
    const markdown = technicalPlanStore.readTenderMarkdown();
    if (!String(markdown || '').trim()) {
      throw new Error('请先在技术方案中导入招标文件，再执行 AI 评标结构化抽取');
    }

    const ruleItems = extractEvaluationItems(markdown);
    const collectJson = aiService.collectJsonResponse || aiService.requestJson;
    const aiItems = await collectJson.call(aiService, {
      schemaName: 'AiEvaluationItemExtraction',
      progressLabel: 'AI 评标结构化抽取',
      progressCallback: options.progressCallback,
      failureMessage: 'AI 评标结构化抽取失败，请检查模型配置后重试',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: buildAiEvaluationExtractionMessages(markdown, ruleItems),
      normalizer: normalizeAiEvaluationItems,
      validator: validateAiEvaluationItems,
    });

    const timestamp = now();
    db.prepare(`
      UPDATE ai_evaluation_meta
      SET source_type = 'technical-plan', source_file_name = @source_file_name, source_hash = @source_hash,
          generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({
      source_file_name: technicalPlan.tenderFile?.fileName || '技术方案招标文件',
      source_hash: stableHash(markdown),
      generated_at: timestamp,
      updated_at: timestamp,
    });
    replaceItems(aiItems);
    return {
      success: true,
      message: `AI 已重新抽取 ${aiItems.length} 个评分项`,
      state: refreshAuditOpinions(),
    };
  }

  async function importBidDocument() {
    ensureMetaRow();
    const currentState = loadState();
    if (!currentState.items.length) {
      throw new Error('请先生成评分表，再导入投标文件进行自评证据匹配');
    }
    const importer = fileService?.importTechnicalPlanDocument || fileService?.importDocument;
    if (!importer) {
      throw new Error('文件导入服务尚未初始化');
    }

    const result = fileService?.importTechnicalPlanDocument
      ? await fileService.importTechnicalPlanDocument('AI 评标投标文件')
      : await fileService.importDocument();
    if (!result?.success || !result.file_content) {
      return {
        success: false,
        message: result?.message || '未导入 AI 评标投标文件',
        state: currentState,
      };
    }

    const markdown = String(result.file_content || '').trim();
    const evaluatedItems = evaluateItemsAgainstBidDocument(currentState.items, markdown);
    const documentId = saveBidDocument({
      fileName: result.file_name || 'AI 评标投标文件',
      markdown,
      parserLabel: result.parser_label || undefined,
    });
    saveBidScores(documentId, evaluatedItems);
    const timestamp = now();
    db.prepare(`
      UPDATE ai_evaluation_meta
      SET source_type = 'bid-document', source_file_name = @source_file_name, source_hash = @source_hash,
          generated_at = @generated_at, updated_at = @updated_at
      WHERE id = 1
    `).run({
      source_file_name: result.file_name || 'AI 评标投标文件',
      source_hash: stableHash(markdown),
      generated_at: timestamp,
      updated_at: timestamp,
    });
    replaceItems(evaluatedItems);
    const nextState = refreshAuditOpinions();
    return {
      success: true,
      message: `投标文件已导入，已保存 ${nextState.bidDocuments.length} 份投标文件评分结果`,
      state: nextState,
    };
  }

  async function scoreImportedBidDocuments(options = {}) {
    ensureMetaRow();
    const currentState = loadState();
    const baseItems = currentState.items;
    const bidDocuments = currentState.bidDocuments || [];
    if (!baseItems.length) {
      throw new Error('请先生成评分表，再批量评分投标文件');
    }
    if (!bidDocuments.length) {
      throw new Error('请先导入投标文件，再执行批量评分');
    }

    let scoredCount = 0;
    let skippedCount = 0;
    let lastEvaluatedItems = null;
    const progressCallback = typeof options.progressCallback === 'function' ? options.progressCallback : null;
    for (const document of bidDocuments) {
      const markdown = readBidDocumentMarkdown(document.id);
      if (!String(markdown || '').trim()) {
        skippedCount += 1;
        progressCallback?.(`跳过 ${document.fileName}：未找到已保存的投标文件 Markdown。`, { scoredCount, skippedCount, documentCount: bidDocuments.length });
        continue;
      }
      const evaluatedItems = evaluateItemsAgainstBidDocument(baseItems, markdown);
      saveBidScores(document.id, evaluatedItems);
      lastEvaluatedItems = evaluatedItems;
      scoredCount += 1;
      progressCallback?.(`已完成 ${document.fileName} 评分。`, { scoredCount, skippedCount, documentCount: bidDocuments.length });
    }

    if (!scoredCount) {
      throw new Error('未找到可评分的投标文件 Markdown，请重新导入投标文件');
    }

    if (lastEvaluatedItems) {
      replaceItems(lastEvaluatedItems);
    }
    const nextState = refreshAuditOpinions();
    return {
      success: true,
      message: `已批量评分 ${scoredCount} 份投标文件${skippedCount ? `，跳过 ${skippedCount} 份` : ''}`,
      state: nextState,
      stats: {
        document_count: bidDocuments.length,
        scored_count: scoredCount,
        skipped_count: skippedCount,
      },
    };
  }

  function updateItem(id, patch) {
    const itemId = String(id || '').trim();
    if (!itemId) throw new Error('评分项 ID 不能为空');
    const existing = db.prepare('SELECT * FROM ai_evaluation_items WHERE item_id = ?').get(itemId);
    if (!existing) throw new Error('评分项不存在');
    const maxScore = Number(existing.max_score || 0);
    const rawManualScore = patch?.manualScore === undefined ? existing.manual_score : patch.manualScore;
    const manualScore = rawManualScore === null || rawManualScore === undefined || rawManualScore === ''
      ? null
      : Math.max(0, Math.min(maxScore, Number(rawManualScore) || 0));
    const finalScore = manualScore === null ? Number(existing.auto_score || 0) : manualScore;
    db.prepare(`
      UPDATE ai_evaluation_items
      SET manual_score = @manual_score,
          final_score = @final_score,
          evidence = @evidence,
          deduction_reason = @deduction_reason,
          risk_level = @risk_level,
          confirmed = @confirmed,
          updated_at = @updated_at
      WHERE item_id = @item_id
    `).run({
      item_id: itemId,
      manual_score: manualScore,
      final_score: Math.max(0, Math.min(maxScore, finalScore)),
      evidence: patch?.evidence === undefined ? existing.evidence : String(patch.evidence || ''),
      deduction_reason: patch?.deductionReason === undefined ? existing.deduction_reason : String(patch.deductionReason || ''),
      risk_level: normalizeRiskLevel(patch?.riskLevel === undefined ? existing.risk_level : patch.riskLevel),
      confirmed: patch?.confirmed === undefined ? Number(existing.confirmed || 0) : (patch.confirmed ? 1 : 0),
      updated_at: now(),
    });
    return refreshAuditOpinions();
  }

  function saveExpertScore(payload = {}) {
    const itemId = String(payload.itemId || payload.item_id || '').trim();
    if (!itemId) throw new Error('评分项 ID 不能为空');
    const existingItem = db.prepare('SELECT * FROM ai_evaluation_items WHERE item_id = ?').get(itemId);
    if (!existingItem) throw new Error('评分项不存在');
    const expertName = String(payload.expertName || payload.expert_name || '').trim();
    if (!expertName) throw new Error('专家姓名不能为空');
    const maxScore = Number(existingItem.max_score || 0);
    const rawScore = Number(payload.score ?? payload.expertScore ?? payload.expert_score);
    if (!Number.isFinite(rawScore)) throw new Error('专家分必须是有效数字');
    const expertScore = Math.max(0, Math.min(maxScore || rawScore, Math.round(rawScore * 10) / 10));
    const scoreId = String(payload.id || payload.scoreId || payload.score_id || createExpertScoreId(itemId, expertName));
    const existingScore = db.prepare('SELECT * FROM ai_evaluation_expert_scores WHERE score_id = ?').get(scoreId);
    const timestamp = now();
    db.prepare(`
      INSERT INTO ai_evaluation_expert_scores (
        score_id, item_id, expert_name, expert_score, opinion, created_at, updated_at
      ) VALUES (
        @score_id, @item_id, @expert_name, @expert_score, @opinion, @created_at, @updated_at
      ) ON CONFLICT(score_id) DO UPDATE SET
        item_id = excluded.item_id,
        expert_name = excluded.expert_name,
        expert_score = excluded.expert_score,
        opinion = excluded.opinion,
        updated_at = excluded.updated_at
    `).run({
      score_id: scoreId,
      item_id: itemId,
      expert_name: expertName,
      expert_score: expertScore,
      opinion: String(payload.opinion || ''),
      created_at: existingScore?.created_at || timestamp,
      updated_at: timestamp,
    });
    return refreshAuditOpinions();
  }

  function clear() {
    const timestamp = now();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM ai_evaluation_items').run();
      db.prepare('DELETE FROM ai_evaluation_audit_opinions').run();
      db.prepare('DELETE FROM ai_evaluation_expert_scores').run();
      db.prepare('DELETE FROM ai_evaluation_reports').run();
      db.prepare('DELETE FROM ai_evaluation_bid_scores').run();
      db.prepare('DELETE FROM ai_evaluation_bid_documents').run();
      db.prepare(`
        UPDATE ai_evaluation_meta
        SET source_type = '', source_file_name = '', source_hash = '', generated_at = NULL, updated_at = @updated_at
        WHERE id = 1
      `).run({ updated_at: timestamp });
    });
    transaction();
    if (app?.getPath) {
      fs.rmSync(getAiEvaluationDir(app), { recursive: true, force: true });
    }
    return loadState();
  }

  async function exportReport(options = {}) {
    const state = refreshAuditOpinions();
    const markdown = buildAiEvaluationReportMarkdown(state);
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出 AI 评标自评报告',
        defaultPath: `AI评标自评报告-${new Date().toISOString().slice(0, 10)}.md`,
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
    const reportId = saveReportSnapshot({ state, markdown, filePath });
    return {
      success: true,
      message: 'AI 评标自评报告已导出',
      reportId,
      filePath,
      markdownChars: markdown.length,
    };
  }

  async function exportOfficePackage(options = {}) {
    const format = String(options.format || '').toLowerCase() === 'xlsx' ? 'xlsx' : 'docx';
    const state = refreshAuditOpinions();
    const markdown = buildAiEvaluationReportMarkdown(state);
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: format === 'xlsx' ? '导出 AI 评标 Excel 报告' : '导出 AI 评标 Word 报告',
        defaultPath: `AI评标正式报告-${new Date().toISOString().slice(0, 10)}.${format}`,
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
      ? buildAiEvaluationExcelBuffer(state)
      : await buildAiEvaluationWordBuffer(state);
    fs.writeFileSync(filePath, buffer);
    const reportId = saveReportSnapshot({ state, markdown, filePath });
    return {
      success: true,
      message: format === 'xlsx' ? 'AI 评标 Excel 报告已导出' : 'AI 评标 Word 报告已导出',
      reportId,
      filePath,
      bytes: buffer.length,
      format,
    };
  }

  return {
    loadState,
    updateAiEvaluation,
    generateFromTechnicalPlan,
    enhanceWithAi,
    importBidDocument,
    scoreImportedBidDocuments,
    updateItem,
    saveExpertScore,
    exportReport,
    exportOfficePackage,
    clear,
  };
}

module.exports = {
  createAiEvaluationStore,
  buildAiEvaluationExcelBuffer,
  buildAiEvaluationReportMarkdown,
  buildAiEvaluationWordBuffer,
  evaluateItemsAgainstBidDocument,
  normalizeAiEvaluationItems,
  summarizeExpertReview,
};
