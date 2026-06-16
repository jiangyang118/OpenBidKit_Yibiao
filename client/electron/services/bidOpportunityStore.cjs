const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dialog } = require('electron');
const { getWorkspaceDir } = require('../utils/paths.cjs');

const defaultParsedFields = {
  projectName: '',
  buyer: '',
  budget: '',
  region: '',
  industry: '',
  registrationDeadline: '',
  bidDeadline: '',
  qualification: '',
  scoringSummary: '',
};

const statusValues = new Set(['pending', 'tracking', 'abandoned', 'submitted', 'won', 'lost']);
const followUpMethods = new Set(['phone', 'wechat', 'email', 'meeting', 'site', 'system', 'other']);
const attachmentKinds = new Set(['announcement', 'communication', 'qualification', 'other']);

const followUpMethodLabels = {
  phone: '电话',
  wechat: '微信',
  email: '邮件',
  meeting: '会议',
  site: '现场',
  system: '系统',
  other: '其他',
};

const attachmentKindLabels = {
  announcement: '公告附件',
  communication: '沟通附件',
  qualification: '资质附件',
  other: '其他附件',
};

function now() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createId(sourceText) {
  const hash = crypto.createHash('sha256').update(`${String(sourceText || '')}\n${Date.now()}`, 'utf8').digest('hex').slice(0, 16);
  return `opp-${hash}`;
}

function createFollowUpId(opportunityId, content) {
  const hash = crypto.createHash('sha256').update(`${String(opportunityId || '')}\n${String(content || '')}\n${Date.now()}`, 'utf8').digest('hex').slice(0, 16);
  return `opp-follow-${hash}`;
}

function createAttachmentId(opportunityId, filePath, index) {
  const hash = crypto.createHash('sha256').update(`${String(opportunityId || '')}\n${String(filePath || '')}\n${Date.now()}\n${index}`, 'utf8').digest('hex').slice(0, 16);
  return `opp-attachment-${hash}`;
}

function normalizeStatus(value) {
  return statusValues.has(value) ? value : 'pending';
}

function normalizeFollowUpMethod(value) {
  return followUpMethods.has(value) ? value : 'other';
}

function normalizeAttachmentKind(value) {
  return attachmentKinds.has(value) ? value : 'other';
}

function sanitizeFileName(value) {
  return String(value || 'attachment')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'attachment';
}

function getBidOpportunityWorkspaceRoot(options = {}) {
  if (options.workspaceRoot) return options.workspaceRoot;
  const app = options.app;
  if (app?.getPath) return getWorkspaceDir(app);
  throw new Error('投标机会附件工作区未初始化');
}

function toWorkspaceRelativePath(absolutePath, workspaceRoot) {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
}

function resolveWorkspacePath(relativePath, workspaceRoot) {
  return path.join(workspaceRoot, String(relativePath || '').replace(/\//g, path.sep));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[，。；;]+$/, '');
  }
  return '';
}

function guessTitle(text, fallback = '未命名投标机会') {
  const explicit = firstMatch(text, [
    /(?:项目名称|采购项目名称|招标项目名称)\s*[:：]\s*([^\n\r]+)/i,
    /(?:工程名称)\s*[:：]\s*([^\n\r]+)/i,
  ]);
  if (explicit) return explicit.slice(0, 80);
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return (firstLine || fallback).slice(0, 80);
}

function parseFields(sourceText, title) {
  const text = String(sourceText || '');
  const normalized = text.replace(/\r/g, '\n');
  const projectName = guessTitle(normalized, title);
  const buyer = firstMatch(normalized, [
    /(?:采购人|招标人|建设单位)\s*[:：]\s*([^\n\r]+)/i,
    /(?:采购单位)\s*[:：]\s*([^\n\r]+)/i,
  ]);
  const budget = firstMatch(normalized, [
    /(?:预算金额|预算价|最高限价|控制价|项目预算)\s*[:：]?\s*([^\n\r，。；;]+)/i,
    /([0-9]+(?:\.[0-9]+)?\s*(?:万元|万|元))/i,
  ]);
  const region = firstMatch(normalized, [
    /(?:项目地点|建设地点|服务地点|实施地点|区域)\s*[:：]\s*([^\n\r]+)/i,
    /(北京|上海|天津|重庆|广东|广西|江苏|浙江|山东|福建|安徽|江西|河南|河北|湖北|湖南|四川|贵州|云南|陕西|山西|辽宁|吉林|黑龙江|内蒙古|新疆|西藏|甘肃|青海|宁夏|海南)[省市自治区]*/i,
  ]);
  const industry = firstMatch(normalized, [
    /(?:行业|采购品目|项目类型)\s*[:：]\s*([^\n\r]+)/i,
    /(市政|水利|交通|医疗|教育|信息化|智慧|运维|后勤|园区|管网|安防|软件|系统集成)/i,
  ]);
  const registrationDeadline = firstMatch(normalized, [
    /(?:报名截止|获取招标文件截止|获取采购文件截止)\s*[:：]?\s*([^\n\r，。；;]+)/i,
  ]);
  const bidDeadline = firstMatch(normalized, [
    /(?:投标截止|响应文件提交截止|开标时间|递交截止)\s*[:：]?\s*([^\n\r，。；;]+)/i,
  ]);
  const qualification = firstMatch(normalized, [
    /(?:资格要求|投标人资格要求|供应商资格要求)\s*[:：]\s*([\s\S]{0,260})/i,
  ]).replace(/\s+/g, ' ').slice(0, 220);
  const scoringSummary = firstMatch(normalized, [
    /(?:评分办法|评标办法|评审标准)\s*[:：]\s*([\s\S]{0,220})/i,
  ]).replace(/\s+/g, ' ').slice(0, 180);

  return {
    projectName,
    buyer,
    budget,
    region,
    industry,
    registrationDeadline,
    bidDeadline,
    qualification,
    scoringSummary,
  };
}

function extractBudgetNumber(value) {
  const match = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return /万元|万/.test(value) ? amount : amount / 10000;
}

function scoreOpportunity(fields, sourceText, knowledgeMatches = []) {
  const text = String(sourceText || '');
  const budget = extractBudgetNumber(fields.budget);
  const hasQualification = fields.qualification || /资格|资质|业绩|证书/.test(text);
  const urgent = /今日|当天|1天|2天|三日内|3日内/.test(text);
  const hasDeadline = Boolean(fields.bidDeadline || fields.registrationDeadline);
  const hasRegion = Boolean(fields.region);
  const deliveryKeywords = /(可行|成熟|类似业绩|运维|服务|实施|交付|本地化|驻场)/;
  const highCompetition = /公开招标|全国|最低价|低价|价格分\s*[3-9][0-9]|综合评分|多家|入围/.test(text);
  const limitedCompetition = /邀请|单一来源|竞争性磋商|竞争性谈判|定向|框架协议|供应商库/.test(text);
  const pricePressure = /最低价|低价|下浮|让利|报价.*?占比|价格分\s*[3-9][0-9]/.test(text);
  const profitSignals = /运维|服务期|年度|三年|五年|续签|驻场|维保|长期/.test(text);
  const tightSchedule = urgent || /工期紧|限期|立即|加急|短时间|[1-9]\s*日内完成/.test(text);
  const feasibleSchedule = /分阶段|里程碑|服务期|实施周期|合同签订后\s*[3-9][0-9]\s*日/.test(text);
  const topKnowledgeScore = Math.max(0, ...knowledgeMatches.map((item) => Number(item?.score || 0)));
  const historicalWinSignals = /中标|合同|验收|案例|业绩|成功实施|类似项目/.test(
    `${fields.qualification || ''}\n${knowledgeMatches.map((item) => `${item.title || ''}\n${item.resume || ''}`).join('\n')}`,
  );

  const breakdown = {
    qualification: hasQualification ? 24 : 12,
    budget: budget >= 1000 ? 22 : budget >= 300 ? 18 : budget > 0 ? 14 : 10,
    timing: urgent ? 8 : hasDeadline ? 16 : 12,
    region: hasRegion ? 14 : 8,
    delivery: deliveryKeywords.test(text) ? 18 : 12,
    competition: limitedCompetition ? 10 : highCompetition ? 5 : 8,
    profit: budget >= 1000 && !pricePressure ? 10 : budget >= 300 && !pricePressure ? 8 : budget > 0 ? 5 : 3,
    schedule: tightSchedule ? 4 : feasibleSchedule ? 9 : hasDeadline ? 7 : 5,
    historicalSimilarity: topKnowledgeScore >= 70 ? 10 : topKnowledgeScore >= 45 ? 8 : topKnowledgeScore > 0 ? 6 : historicalWinSignals ? 4 : 2,
  };
  if (profitSignals && breakdown.profit < 10 && !pricePressure) {
    breakdown.profit += 1;
  }
  const baseScore = breakdown.qualification + breakdown.budget + breakdown.timing + breakdown.region + breakdown.delivery;
  const advancedScore = breakdown.competition + breakdown.profit + breakdown.schedule + breakdown.historicalSimilarity;
  const score = Math.max(0, Math.min(100, Math.round(baseScore * 0.78 + advancedScore * 0.55)));
  const risks = [];
  if (!fields.qualification) risks.push({ level: 'medium', text: '公告中未识别到明确资格要求，需要人工补录后再判断。' });
  if (!fields.bidDeadline) risks.push({ level: 'medium', text: '未识别到投标截止或开标时间，存在节奏误判风险。' });
  if (urgent) risks.push({ level: 'high', text: '截止时间疑似较近，需要确认是否有足够编制和盖章时间。' });
  if (!fields.budget) risks.push({ level: 'low', text: '未识别到预算或最高限价，投入产出比暂不明确。' });
  if (highCompetition) risks.push({ level: 'medium', text: '公告疑似公开竞争或价格权重较高，需要评估竞争强度和报价空间。' });
  if (pricePressure) risks.push({ level: 'medium', text: '公告存在低价或价格分压力，需复核利润空间。' });
  if (tightSchedule) risks.push({ level: 'high', text: '工期或投标准备节奏偏紧，需要确认交付资源和排产能力。' });
  if (!topKnowledgeScore && /业绩|案例|中标|类似项目/.test(`${fields.qualification || ''}\n${text}`)) {
    risks.push({ level: 'medium', text: '未匹配到历史中标或类似项目证据，历史相似度偏低。' });
  }

  const recommendation = score >= 80 ? '建议重点跟进' : score >= 65 ? '建议评估后跟进' : '建议谨慎投入';
  return { score, breakdown, risks, recommendation };
}

function normalizeAiParsedFields(payload, fallbackFields = defaultParsedFields) {
  const source = Array.isArray(payload?.opportunities) ? payload.opportunities[0] : payload;
  const fields = source?.parsedFields || source?.parsed_fields || source || {};
  return {
    projectName: String(fields.projectName || fields.project_name || fallbackFields.projectName || '').trim().slice(0, 120),
    buyer: String(fields.buyer || fields.purchaser || fields.tenderer || fallbackFields.buyer || '').trim().slice(0, 120),
    budget: String(fields.budget || fields.maxPrice || fields.max_price || fallbackFields.budget || '').trim().slice(0, 120),
    region: String(fields.region || fields.location || fallbackFields.region || '').trim().slice(0, 120),
    industry: String(fields.industry || fields.category || fallbackFields.industry || '').trim().slice(0, 120),
    registrationDeadline: String(fields.registrationDeadline || fields.registration_deadline || fallbackFields.registrationDeadline || '').trim().slice(0, 120),
    bidDeadline: String(fields.bidDeadline || fields.bid_deadline || fields.openingTime || fields.opening_time || fallbackFields.bidDeadline || '').trim().slice(0, 120),
    qualification: String(fields.qualification || fields.qualificationRequirement || fields.qualification_requirement || fallbackFields.qualification || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    scoringSummary: String(fields.scoringSummary || fields.scoring_summary || fields.evaluationMethod || fields.evaluation_method || fallbackFields.scoringSummary || '').replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}

function extractOpportunityKeywords(fields = {}, sourceText = '') {
  const stopWords = new Set(['项目', '采购', '招标', '投标', '公告', '要求', '服务', '建设', '提供', '进行', '相关', '平台']);
  const text = [
    fields.projectName,
    fields.buyer,
    fields.region,
    fields.industry,
    fields.qualification,
    fields.scoringSummary,
    sourceText,
  ].filter(Boolean).join('\n');
  const words = String(text).match(/[\u4e00-\u9fa5A-Za-z0-9]{2,16}/g) || [];
  const priority = ['业绩', '资质', '证书', '运维', '信息化', '智慧', '系统集成', '软件', '平台', '医疗', '教育', '园区', '后勤', '本地化'];
  return [...new Set([
    ...priority.filter((word) => text.includes(word)),
    ...words.filter((word) => !stopWords.has(word) && !/^\d+$/.test(word)),
  ])].slice(0, 24);
}

function scoreKnowledgeMatch(candidate, keywords) {
  const haystack = `${candidate.title || ''}\n${candidate.resume || ''}\n${candidate.content || ''}\n${candidate.source_file || ''}`;
  const matchedKeywords = keywords.filter((keyword) => haystack.includes(keyword));
  if (!matchedKeywords.length) return null;
  const baseScore = matchedKeywords.reduce((sum, keyword) => sum + Math.min(12, keyword.length + 4), 0);
  return {
    itemId: candidate.item_id,
    title: String(candidate.title || '未命名知识条目').slice(0, 120),
    resume: String(candidate.resume || candidate.content || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    sourceFile: String(candidate.source_file || '').slice(0, 160),
    score: Math.min(100, baseScore),
    matchedKeywords: matchedKeywords.slice(0, 8),
  };
}

function validateAiParsedFields(fields) {
  if (!fields || typeof fields !== 'object') throw new Error('AI 未返回有效公告字段');
  const values = Object.values(fields).filter((value) => String(value || '').trim());
  if (!values.length) throw new Error('AI 未识别出可用公告字段');
}

function buildBidOpportunityParseMessages(sourceText, fallbackFields) {
  return [
    {
      role: 'system',
      content: [
        '你是投标机会公告解析助手，只输出 JSON。',
        '从公告中抽取结构化字段，不要编造公告中没有的信息。',
        '字段必须使用：projectName,buyer,budget,region,industry,registrationDeadline,bidDeadline,qualification,scoringSummary。',
        '无法识别的字段返回空字符串。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请解析以下招标/采购公告，输出 JSON 对象：',
        JSON.stringify({
          expected_schema: {
            projectName: '项目名称',
            buyer: '采购人/招标人',
            budget: '预算金额/最高限价',
            region: '项目地区/实施地点',
            industry: '行业/采购品目',
            registrationDeadline: '报名或获取文件截止时间',
            bidDeadline: '投标截止/开标时间',
            qualification: '资格要求摘要',
            scoringSummary: '评分办法/评审标准摘要',
          },
          fallback_rule_fields: fallbackFields,
          notice_text: String(sourceText || '').slice(0, 18000),
        }, null, 2),
      ].join('\n'),
    },
  ];
}

function htmlToReadableText(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchUrlText(url) {
  const normalizedUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new Error('请输入 http 或 https 开头的公告 URL');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'OpenBidKit-Yibiao/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`公告 URL 读取失败：HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const text = /html/i.test(contentType) || /<html|<body|<p[\s>]/i.test(rawText)
      ? htmlToReadableText(rawText)
      : rawText.trim();
    if (!text) {
      throw new Error('公告 URL 未读取到有效文本');
    }
    return `公告来源URL：${normalizedUrl}\n\n${text}`;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('公告 URL 读取超时，请检查网络或改为粘贴公告原文');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function rowToOpportunity(row) {
  return {
    id: row.opportunity_id,
    title: row.title,
    sourceText: row.source_text,
    status: normalizeStatus(row.status),
    parsedFields: { ...defaultParsedFields, ...safeJsonParse(row.parsed_fields_json, {}) },
    score: Number(row.score || 0),
    scoreBreakdown: safeJsonParse(row.score_breakdown_json, {}),
    risks: safeJsonParse(row.risks_json, []),
    knowledgeMatches: safeJsonParse(row.knowledge_matches_json, []),
    recommendation: row.recommendation || '',
    owner: row.owner || '',
    nextAction: row.next_action || '',
    reminderAt: row.reminder_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    followUps: [],
    attachments: [],
  };
}

function rowToFollowUp(row) {
  return {
    id: row.record_id,
    opportunityId: row.opportunity_id,
    occurredAt: row.occurred_at || '',
    method: normalizeFollowUpMethod(row.method),
    owner: row.owner || '',
    contactPerson: row.contact_person || '',
    content: row.content || '',
    nextAction: row.next_action || '',
    nextFollowUpAt: row.next_follow_up_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function rowToAttachment(row) {
  return {
    id: row.attachment_id,
    opportunityId: row.opportunity_id,
    kind: normalizeAttachmentKind(row.kind),
    fileName: row.file_name || '',
    storedPath: row.stored_path || '',
    originalPath: row.original_path || '',
    fileSize: Number(row.file_size || 0),
    note: row.note || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim() || '-';
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim();
}

function toIcsDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hour = '09', minute = '00', second = '00'] = match;
    return `${year}${month}${day}T${hour}${minute}${second}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
    'T',
    pad(parsed.getHours()),
    pad(parsed.getMinutes()),
    pad(parsed.getSeconds()),
  ].join('');
}

function addMinutesToIcsDateTime(value, minutes) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (number) => String(number).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function toUtcIcsDateTime(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatOpportunityRow(opportunity, index) {
  return [
    index + 1,
    opportunity.title,
    opportunity.status,
    opportunity.score,
    opportunity.recommendation,
    opportunity.parsedFields?.buyer,
    opportunity.parsedFields?.budget,
    opportunity.parsedFields?.region,
    opportunity.parsedFields?.bidDeadline,
    opportunity.owner,
    opportunity.nextAction,
    opportunity.reminderAt,
  ].map(escapeMarkdownTableCell);
}

function buildOpportunityTable(opportunities) {
  if (!opportunities.length) {
    return '暂无投标机会。';
  }
  const rows = opportunities.map((opportunity, index) => `| ${formatOpportunityRow(opportunity, index).join(' | ')} |`);
  return [
    '| 序号 | 项目名称 | 状态 | 评分 | 建议 | 采购人 | 预算/限价 | 区域 | 投标截止 | 负责人 | 下一步动作 | 提醒时间 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildScoreBreakdownList(opportunity) {
  const breakdown = opportunity.scoreBreakdown || {};
  const items = [
    ['资格匹配', breakdown.qualification],
    ['预算规模', breakdown.budget],
    ['时间节奏', breakdown.timing],
    ['区域匹配', breakdown.region],
    ['交付可行性', breakdown.delivery],
    ['竞争强度', breakdown.competition],
    ['利润空间', breakdown.profit],
    ['工期可控性', breakdown.schedule],
    ['历史中标相似度', breakdown.historicalSimilarity],
  ];
  return items.map(([label, value]) => `- ${label}：${Number(value || 0)}`).join('\n');
}

function buildKnowledgeMatchList(opportunity) {
  const matches = Array.isArray(opportunity.knowledgeMatches) ? opportunity.knowledgeMatches : [];
  if (!matches.length) return '- 暂无匹配到企业知识库或历史项目资料。';
  return matches.map((item) => [
    `- ${item.title || '未命名知识条目'}（匹配分 ${Number(item.score || 0)}）`,
    item.sourceFile ? `  - 来源：${item.sourceFile}` : '',
    item.matchedKeywords?.length ? `  - 命中关键词：${item.matchedKeywords.join('、')}` : '',
    item.resume ? `  - 摘要：${item.resume}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}

function buildFollowUpList(opportunity) {
  const records = Array.isArray(opportunity.followUps) ? opportunity.followUps : [];
  if (!records.length) return '- 暂无多轮跟进记录。';
  return records.map((record, index) => [
    `- ${index + 1}. ${record.occurredAt || '未记录时间'} ${followUpMethodLabels[record.method] || '其他'}${record.owner ? `｜${record.owner}` : ''}${record.contactPerson ? `｜${record.contactPerson}` : ''}`,
    record.content ? `  - 沟通记录：${record.content}` : '',
    record.nextAction ? `  - 下一步：${record.nextAction}` : '',
    record.nextFollowUpAt ? `  - 下次跟进：${record.nextFollowUpAt}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}

function buildAttachmentList(opportunity) {
  const attachments = Array.isArray(opportunity.attachments) ? opportunity.attachments : [];
  if (!attachments.length) return '- 暂无公告或沟通附件。';
  return attachments.map((attachment, index) => [
    `- ${index + 1}. ${attachment.fileName || '未命名附件'}（${attachmentKindLabels[attachment.kind] || '其他附件'}）`,
    attachment.note ? `  - 说明：${attachment.note}` : '',
    attachment.originalPath ? `  - 原始路径：${attachment.originalPath}` : '',
    attachment.storedPath ? `  - 工作区路径：${attachment.storedPath}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}

function buildBidOpportunityReportMarkdown(state) {
  const opportunities = Array.isArray(state?.opportunities) ? state.opportunities : [];
  const trackingCount = opportunities.filter((item) => item.status === 'tracking').length;
  const highScoreCount = opportunities.filter((item) => Number(item.score || 0) >= 80).length;
  const averageScore = opportunities.length
    ? Math.round(opportunities.reduce((sum, item) => sum + Number(item.score || 0), 0) / opportunities.length)
    : 0;
  const topOpportunities = [...opportunities]
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 5);

  const detailSections = topOpportunities.map((opportunity, index) => [
    `### ${index + 1}. ${opportunity.title}`,
    '',
    `- 状态：${opportunity.status}`,
    `- 评分：${opportunity.score}`,
    `- 建议：${opportunity.recommendation || '待评估'}`,
    `- 采购人：${opportunity.parsedFields?.buyer || '未识别'}`,
    `- 预算/限价：${opportunity.parsedFields?.budget || '未识别'}`,
    `- 区域：${opportunity.parsedFields?.region || '未识别'}`,
    `- 投标截止：${opportunity.parsedFields?.bidDeadline || '未识别'}`,
    `- 负责人：${opportunity.owner || '未指定'}`,
    `- 下一步动作：${opportunity.nextAction || '未填写'}`,
    `- 提醒时间：${opportunity.reminderAt || '未设置'}`,
    '',
    '#### 评分拆解',
    '',
    buildScoreBreakdownList(opportunity),
    '',
    '#### 知识库/历史项目匹配',
    '',
    buildKnowledgeMatchList(opportunity),
    '',
    '#### 跟进记录',
    '',
    buildFollowUpList(opportunity),
    '',
    '#### 公告/沟通附件',
    '',
    buildAttachmentList(opportunity),
    '',
    '#### 风险提示',
    '',
    opportunity.risks?.length
      ? opportunity.risks.map((risk) => `- [${risk.level}] ${risk.text}`).join('\n')
      : '- 暂无明显风险。',
    '',
  ].join('\n')).join('\n');

  return [
    '# 投标机会建议报告',
    '',
    '## 汇总',
    '',
    `- 机会总数：${opportunities.length}`,
    `- 跟进中：${trackingCount}`,
    `- 重点机会：${highScoreCount}`,
    `- 平均评分：${averageScore}`,
    `- 生成时间：${now()}`,
    '',
    '## 机会看板',
    '',
    buildOpportunityTable(opportunities),
    '',
    '## 重点机会详情',
    '',
    detailSections || '暂无重点机会。',
    '',
    '## 投前处理建议',
    '',
    highScoreCount > 0 ? '- 优先安排高评分机会的资质、业绩和技术方案匹配核对。' : '- 暂无高评分机会，建议继续补充线索或人工复核评分条件。',
    trackingCount > 0 ? '- 跟进中机会需要明确负责人、下一步动作和投标截止提醒。' : '- 暂无跟进中机会，可先筛选评分较高的线索进入跟进。',
    opportunities.some((item) => !item.owner || !item.nextAction || !item.reminderAt)
      ? '- 部分机会尚未补齐负责人、下一步动作或提醒时间，建议在周会前完成跟进分派。'
      : '- 所有机会均已补齐负责人、下一步动作和提醒时间。',
    '',
  ].join('\n');
}

function buildBidOpportunityCalendarIcs(state) {
  const opportunities = (Array.isArray(state?.opportunities) ? state.opportunities : [])
    .filter((opportunity) => toIcsDateTime(opportunity.reminderAt));
  const timestamp = toUtcIcsDateTime();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenBidKit Yibiao//Bid Opportunity Reminders//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:易标投标机会提醒',
  ];

  for (const opportunity of opportunities) {
    const start = toIcsDateTime(opportunity.reminderAt);
    const end = addMinutesToIcsDateTime(start, 30);
    const summary = `投标机会跟进：${opportunity.title || '未命名机会'}`;
    const description = [
      `项目名称：${opportunity.parsedFields?.projectName || opportunity.title || '未识别'}`,
      `负责人：${opportunity.owner || '未指定'}`,
      `下一步动作：${opportunity.nextAction || '未填写'}`,
      `投标截止：${opportunity.parsedFields?.bidDeadline || '未识别'}`,
      `建议：${opportunity.recommendation || '待评估'}`,
    ].join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(opportunity.id || crypto.randomUUID())}@openbidkit-yibiao`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `STATUS:${opportunity.status === 'abandoned' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return {
    content: `${lines.join('\r\n')}\r\n`,
    eventCount: opportunities.length,
  };
}

function createBidOpportunityStore({ db, fileService, aiService, app, workspaceRoot }) {
  const workspaceOptions = { app, workspaceRoot };

  function loadState() {
    const rows = db.prepare('SELECT * FROM bid_opportunity_opportunities ORDER BY updated_at DESC, created_at DESC').all();
    const opportunities = rows.map(rowToOpportunity);
    const byId = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
    let followUps = [];
    let attachments = [];
    try {
      followUps = db.prepare('SELECT * FROM bid_opportunity_follow_ups ORDER BY occurred_at DESC, created_at DESC').all().map(rowToFollowUp);
    } catch {
      followUps = [];
    }
    try {
      attachments = db.prepare('SELECT * FROM bid_opportunity_attachments ORDER BY updated_at DESC, created_at DESC').all().map(rowToAttachment);
    } catch {
      attachments = [];
    }
    for (const record of followUps) {
      const opportunity = byId.get(record.opportunityId);
      if (opportunity) opportunity.followUps.push(record);
    }
    for (const attachment of attachments) {
      const opportunity = byId.get(attachment.opportunityId);
      if (opportunity) opportunity.attachments.push(attachment);
    }
    return {
      opportunities,
      activeOpportunityId: opportunities[0]?.id || null,
    };
  }

  function getOpportunityRow(opportunityId) {
    return db.prepare('SELECT * FROM bid_opportunity_opportunities WHERE opportunity_id = ?').get(opportunityId);
  }

  function updateOpportunityFollowUpSummary(opportunityId, patch = {}) {
    const current = getOpportunityRow(opportunityId);
    if (!current) throw new Error('投标机会不存在');
    const nextStatus = normalizeStatus(patch.status === undefined ? current.status : patch.status);
    db.prepare(`
      UPDATE bid_opportunity_opportunities
      SET status = @status,
          owner = @owner,
          next_action = @next_action,
          reminder_at = @reminder_at,
          updated_at = @updated_at
      WHERE opportunity_id = @opportunity_id
    `).run({
      opportunity_id: opportunityId,
      status: nextStatus,
      owner: String(patch.owner ?? current.owner ?? '').trim().slice(0, 80),
      next_action: String(patch.nextAction ?? patch.next_action ?? current.next_action ?? '').trim().slice(0, 240),
      reminder_at: String(patch.reminderAt ?? patch.reminder_at ?? current.reminder_at ?? '').trim().slice(0, 80),
      updated_at: now(),
    });
  }

  function matchKnowledgeItems(parsedFields, sourceText) {
    let candidates = [];
    try {
      candidates = db.prepare(`
        SELECT item_id, title, resume, content, source_file
        FROM knowledge_items
        ORDER BY updated_at DESC
        LIMIT 300
      `).all();
    } catch {
      candidates = [];
    }
    if (!Array.isArray(candidates) || !candidates.length) return [];
    const keywords = extractOpportunityKeywords(parsedFields, sourceText);
    if (!keywords.length) return [];
    return candidates
      .map((candidate) => scoreKnowledgeMatch(candidate, keywords))
      .filter(Boolean)
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
      .slice(0, 5);
  }

  function saveOpportunityWithFields(input, parsedFields, extraRisks = []) {
    const sourceText = String(input?.sourceText || '').trim();
    if (!sourceText) {
      throw new Error('公告内容不能为空');
    }
    const timestamp = now();
    const title = String(input?.title || '').trim() || guessTitle(sourceText);
    const knowledgeMatches = matchKnowledgeItems(parsedFields, sourceText);
    const scoreResult = scoreOpportunity(parsedFields, sourceText, knowledgeMatches);
    const id = createId(sourceText);
    const risks = [
      ...scoreResult.risks,
      ...(!knowledgeMatches.length && /业绩|资质|案例|证书/.test(`${parsedFields.qualification || ''}\n${sourceText}`)
        ? [{ level: 'medium', text: '未在企业知识库或历史项目资料中匹配到可复用的资质/业绩证据，请人工补充。' }]
        : []),
      ...(Array.isArray(extraRisks) ? extraRisks : []),
    ];
    db.prepare(`
      INSERT INTO bid_opportunity_opportunities (
        opportunity_id, title, source_text, status, parsed_fields_json, score, score_breakdown_json, risks_json, knowledge_matches_json, recommendation,
        owner, next_action, reminder_at, created_at, updated_at
      ) VALUES (
        @opportunity_id, @title, @source_text, @status, @parsed_fields_json, @score, @score_breakdown_json, @risks_json, @knowledge_matches_json, @recommendation,
        @owner, @next_action, @reminder_at, @created_at, @updated_at
      )
    `).run({
      opportunity_id: id,
      title: parsedFields.projectName || title,
      source_text: sourceText,
      status: normalizeStatus(input?.status),
      parsed_fields_json: JSON.stringify(parsedFields),
      score: scoreResult.score,
      score_breakdown_json: JSON.stringify(scoreResult.breakdown),
      risks_json: JSON.stringify(risks),
      knowledge_matches_json: JSON.stringify(knowledgeMatches),
      recommendation: scoreResult.recommendation,
      owner: String(input?.owner || '').trim(),
      next_action: String(input?.nextAction || input?.next_action || '').trim(),
      reminder_at: String(input?.reminderAt || input?.reminder_at || '').trim(),
      created_at: timestamp,
      updated_at: timestamp,
    });
    return loadState();
  }

  function saveOpportunity(input) {
    const sourceText = String(input?.sourceText || '').trim();
    if (!sourceText) {
      throw new Error('公告内容不能为空');
    }
    const title = String(input?.title || '').trim() || guessTitle(sourceText);
    const parsedFields = parseFields(sourceText, title);
    return saveOpportunityWithFields(input, parsedFields);
  }

  async function saveOpportunityWithAi(input = {}) {
    const sourceText = String(input?.sourceText || '').trim();
    if (!sourceText) throw new Error('公告内容不能为空');
    const title = String(input?.title || '').trim() || guessTitle(sourceText);
    const fallbackFields = parseFields(sourceText, title);
    const collectJson = aiService?.collectJsonResponse || aiService?.requestJson;
    if (!collectJson) {
      return saveOpportunityWithFields(input, fallbackFields, [
        { level: 'low', text: '当前未配置 AI 服务，已使用规则解析公告字段。' },
      ]);
    }
    try {
      const parsedFields = await collectJson.call(aiService, {
        schemaName: 'BidOpportunityAnnouncementParsing',
        progressLabel: '投标机会 AI 解析',
        failureMessage: '投标机会 AI 解析失败，已回退规则解析',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: buildBidOpportunityParseMessages(sourceText, fallbackFields),
        normalizer: (payload) => normalizeAiParsedFields(payload, fallbackFields),
        validator: validateAiParsedFields,
      });
      return saveOpportunityWithFields(input, { ...fallbackFields, ...parsedFields });
    } catch {
      return saveOpportunityWithFields(input, fallbackFields, [
        { level: 'medium', text: 'AI 结构化解析失败，已使用规则解析结果，请人工复核字段。' },
      ]);
    }
  }

  function updateFollowUp(id, patch = {}) {
    const opportunityId = String(id || '').trim();
    if (!opportunityId) throw new Error('机会 ID 不能为空');
    const current = getOpportunityRow(opportunityId);
    if (!current) throw new Error('投标机会不存在');
    updateOpportunityFollowUpSummary(opportunityId, patch);
    return loadState();
  }

  function addFollowUpRecord(id, payload = {}) {
    const opportunityId = String(id || '').trim();
    if (!opportunityId) throw new Error('机会 ID 不能为空');
    const current = getOpportunityRow(opportunityId);
    if (!current) throw new Error('投标机会不存在');
    const content = String(payload.content || '').trim();
    const nextAction = String(payload.nextAction ?? payload.next_action ?? '').trim();
    if (!content && !nextAction) throw new Error('请填写本次沟通记录或下一步动作');
    const timestamp = now();
    const occurredAt = String(payload.occurredAt ?? payload.occurred_at ?? timestamp).trim() || timestamp;
    const nextFollowUpAt = String(payload.nextFollowUpAt ?? payload.next_follow_up_at ?? '').trim().slice(0, 80);
    const owner = String(payload.owner ?? current.owner ?? '').trim().slice(0, 80);
    const recordId = createFollowUpId(opportunityId, `${content}\n${nextAction}`);
    db.prepare(`
      INSERT INTO bid_opportunity_follow_ups (
        record_id, opportunity_id, occurred_at, method, owner, contact_person, content, next_action, next_follow_up_at, created_at, updated_at
      ) VALUES (
        @record_id, @opportunity_id, @occurred_at, @method, @owner, @contact_person, @content, @next_action, @next_follow_up_at, @created_at, @updated_at
      )
    `).run({
      record_id: recordId,
      opportunity_id: opportunityId,
      occurred_at: occurredAt,
      method: normalizeFollowUpMethod(payload.method),
      owner,
      contact_person: String(payload.contactPerson ?? payload.contact_person ?? '').trim().slice(0, 120),
      content: content.slice(0, 2000),
      next_action: nextAction.slice(0, 240),
      next_follow_up_at: nextFollowUpAt,
      created_at: timestamp,
      updated_at: timestamp,
    });
    updateOpportunityFollowUpSummary(opportunityId, {
      owner,
      nextAction: nextAction || current.next_action,
      reminderAt: nextFollowUpAt || current.reminder_at,
      status: ['pending', 'tracking'].includes(current.status) ? 'tracking' : current.status,
    });
    return loadState();
  }

  function updateFollowUpRecord(recordId, patch = {}) {
    const id = String(recordId || '').trim();
    if (!id) throw new Error('跟进记录 ID 不能为空');
    const existing = db.prepare('SELECT * FROM bid_opportunity_follow_ups WHERE record_id = ?').get(id);
    if (!existing) throw new Error('跟进记录不存在');
    db.prepare(`
      UPDATE bid_opportunity_follow_ups
      SET occurred_at = @occurred_at,
          method = @method,
          owner = @owner,
          contact_person = @contact_person,
          content = @content,
          next_action = @next_action,
          next_follow_up_at = @next_follow_up_at,
          updated_at = @updated_at
      WHERE record_id = @record_id
    `).run({
      record_id: id,
      occurred_at: String(patch.occurredAt ?? patch.occurred_at ?? existing.occurred_at ?? '').trim().slice(0, 80),
      method: normalizeFollowUpMethod(patch.method === undefined ? existing.method : patch.method),
      owner: String(patch.owner ?? existing.owner ?? '').trim().slice(0, 80),
      contact_person: String(patch.contactPerson ?? patch.contact_person ?? existing.contact_person ?? '').trim().slice(0, 120),
      content: String(patch.content ?? existing.content ?? '').trim().slice(0, 2000),
      next_action: String(patch.nextAction ?? patch.next_action ?? existing.next_action ?? '').trim().slice(0, 240),
      next_follow_up_at: String(patch.nextFollowUpAt ?? patch.next_follow_up_at ?? existing.next_follow_up_at ?? '').trim().slice(0, 80),
      updated_at: now(),
    });
    return loadState();
  }

  function deleteFollowUpRecord(recordId) {
    const id = String(recordId || '').trim();
    if (!id) throw new Error('跟进记录 ID 不能为空');
    db.prepare('DELETE FROM bid_opportunity_follow_ups WHERE record_id = ?').run(id);
    return loadState();
  }

  async function importAttachments(id, options = {}) {
    const opportunityId = String(id || '').trim();
    if (!opportunityId) throw new Error('机会 ID 不能为空');
    const current = getOpportunityRow(opportunityId);
    if (!current) throw new Error('投标机会不存在');
    const kind = normalizeAttachmentKind(options.kind || 'announcement');
    let filePaths = Array.isArray(options.filePaths) ? options.filePaths.filter(Boolean) : [];
    if (!filePaths.length) {
      const result = await dialog.showOpenDialog({
        title: kind === 'communication' ? '选择沟通附件' : '选择公告附件',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '公告/沟通附件', extensions: ['doc', 'docx', 'pdf', 'xls', 'xlsx', 'wps', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths.length) {
        return { success: false, message: '已取消导入附件', state: loadState() };
      }
      filePaths = result.filePaths;
    }

    const workspace = getBidOpportunityWorkspaceRoot(workspaceOptions);
    const attachmentDir = path.join(workspace, 'bid-opportunity', 'attachments', opportunityId);
    fs.mkdirSync(attachmentDir, { recursive: true });
    const timestamp = now();
    const imported = [];
    const insert = db.prepare(`
      INSERT INTO bid_opportunity_attachments (
        attachment_id, opportunity_id, kind, file_name, stored_path, original_path, file_size, note, created_at, updated_at
      ) VALUES (
        @attachment_id, @opportunity_id, @kind, @file_name, @stored_path, @original_path, @file_size, @note, @created_at, @updated_at
      )
    `);
    for (const [index, filePath] of filePaths.entries()) {
      const absolutePath = String(filePath || '').trim();
      if (!absolutePath || !fs.existsSync(absolutePath)) continue;
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) continue;
      const fileName = sanitizeFileName(path.basename(absolutePath));
      const attachmentId = createAttachmentId(opportunityId, absolutePath, index);
      const storedAbsolutePath = path.join(attachmentDir, `${attachmentId}-${fileName}`);
      fs.copyFileSync(absolutePath, storedAbsolutePath);
      insert.run({
        attachment_id: attachmentId,
        opportunity_id: opportunityId,
        kind,
        file_name: fileName,
        stored_path: toWorkspaceRelativePath(storedAbsolutePath, workspace),
        original_path: absolutePath,
        file_size: stats.size,
        note: String(options.note || '').trim().slice(0, 500),
        created_at: timestamp,
        updated_at: timestamp,
      });
      imported.push(fileName);
    }
    updateOpportunityFollowUpSummary(opportunityId, {});
    return {
      success: imported.length > 0,
      message: imported.length ? `已导入 ${imported.length} 个投标机会附件` : '未导入有效附件',
      state: loadState(),
    };
  }

  function updateAttachment(id, patch = {}) {
    const attachmentId = String(id || '').trim();
    if (!attachmentId) throw new Error('附件 ID 不能为空');
    const existing = db.prepare('SELECT * FROM bid_opportunity_attachments WHERE attachment_id = ?').get(attachmentId);
    if (!existing) throw new Error('附件不存在');
    db.prepare(`
      UPDATE bid_opportunity_attachments
      SET kind = @kind,
          note = @note,
          updated_at = @updated_at
      WHERE attachment_id = @attachment_id
    `).run({
      attachment_id: attachmentId,
      kind: normalizeAttachmentKind(patch.kind === undefined ? existing.kind : patch.kind),
      note: patch.note === undefined ? existing.note : String(patch.note || '').trim().slice(0, 500),
      updated_at: now(),
    });
    updateOpportunityFollowUpSummary(existing.opportunity_id, {});
    return loadState();
  }

  function deleteAttachment(id) {
    const attachmentId = String(id || '').trim();
    if (!attachmentId) throw new Error('附件 ID 不能为空');
    const existing = db.prepare('SELECT * FROM bid_opportunity_attachments WHERE attachment_id = ?').get(attachmentId);
    if (!existing) return loadState();
    db.prepare('DELETE FROM bid_opportunity_attachments WHERE attachment_id = ?').run(attachmentId);
    try {
      const workspace = getBidOpportunityWorkspaceRoot(workspaceOptions);
      const storedPath = resolveWorkspacePath(existing.stored_path, workspace);
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    } catch {
      // 附件文件清理失败不阻塞记录删除。
    }
    updateOpportunityFollowUpSummary(existing.opportunity_id, {});
    return loadState();
  }

  async function importOpportunityDocument() {
    const importer = fileService?.importTechnicalPlanDocument || fileService?.importDocument;
    if (!importer) {
      throw new Error('文件导入服务尚未初始化');
    }
    const result = fileService?.importTechnicalPlanDocument
      ? await fileService.importTechnicalPlanDocument('投标机会公告文件')
      : await fileService.importDocument();
    if (!result?.success || !result.file_content) {
      return {
        success: false,
        message: result?.message || '未导入公告文件',
        state: loadState(),
      };
    }
    const state = saveOpportunity({
      title: result.file_name || '公告文件',
      sourceText: String(result.file_content || '').trim(),
    });
    return { success: true, message: '公告文件已导入并生成投标机会', state };
  }

  async function importOpportunityUrl(input = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const sourceText = await fetchUrlText(url);
    const state = saveOpportunity({
      title: String(url || '').trim(),
      sourceText,
    });
    return { success: true, message: '公告 URL 已读取并生成投标机会', state };
  }

  function updateStatus(id, status) {
    const opportunityId = String(id || '').trim();
    if (!opportunityId) throw new Error('机会 ID 不能为空');
    const result = db.prepare('UPDATE bid_opportunity_opportunities SET status = @status, updated_at = @updated_at WHERE opportunity_id = @opportunity_id').run({
      opportunity_id: opportunityId,
      status: normalizeStatus(status),
      updated_at: now(),
    });
    if (!result.changes) throw new Error('投标机会不存在');
    return loadState();
  }

  function deleteOpportunity(id) {
    const opportunityId = String(id || '').trim();
    if (!opportunityId) throw new Error('机会 ID 不能为空');
    let attachments = [];
    try {
      attachments = db.prepare('SELECT * FROM bid_opportunity_attachments WHERE opportunity_id = ?').all(opportunityId);
    } catch {
      attachments = [];
    }
    db.prepare('DELETE FROM bid_opportunity_opportunities WHERE opportunity_id = ?').run(opportunityId);
    try {
      const workspace = getBidOpportunityWorkspaceRoot(workspaceOptions);
      for (const attachment of attachments) {
        const storedPath = resolveWorkspacePath(attachment.stored_path, workspace);
        if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
      }
      fs.rmSync(path.join(workspace, 'bid-opportunity', 'attachments', opportunityId), { recursive: true, force: true });
    } catch {
      // 数据删除已完成，附件文件清理失败不影响用户继续整理机会。
    }
    return loadState();
  }

  function clear() {
    try {
      db.prepare('DELETE FROM bid_opportunity_follow_ups').run();
      db.prepare('DELETE FROM bid_opportunity_attachments').run();
    } catch {
      // 兼容旧库或测试替身只包含主表的情况。
    }
    db.prepare('DELETE FROM bid_opportunity_opportunities').run();
    try {
      const workspace = getBidOpportunityWorkspaceRoot(workspaceOptions);
      fs.rmSync(path.join(workspace, 'bid-opportunity', 'attachments'), { recursive: true, force: true });
    } catch {
      // 清空业务数据已完成，附件目录清理失败不影响工作台恢复。
    }
    return loadState();
  }

  async function exportReport(options = {}) {
    const state = loadState();
    const markdown = buildBidOpportunityReportMarkdown(state);
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出投标机会建议报告',
        defaultPath: `投标机会建议报告-${new Date().toISOString().slice(0, 10)}.md`,
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
      message: '投标机会建议报告已导出',
      filePath,
      markdownChars: markdown.length,
    };
  }

  async function exportCalendar(options = {}) {
    const state = loadState();
    const calendar = buildBidOpportunityCalendarIcs(state);
    if (!calendar.eventCount) {
      return { success: false, message: '暂无可导出的提醒时间，请先为投标机会设置提醒时间', eventCount: 0 };
    }
    const requestedPath = String(options.filePath || options.file_path || '').trim();
    let filePath = requestedPath;
    if (!filePath) {
      const result = await dialog.showSaveDialog({
        title: '导出投标机会提醒日历',
        defaultPath: `投标机会提醒-${new Date().toISOString().slice(0, 10)}.ics`,
        filters: [
          { name: 'iCalendar', extensions: ['ics'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, message: '已取消导出', eventCount: 0 };
      }
      filePath = result.filePath;
    }
    fs.writeFileSync(filePath, calendar.content, 'utf-8');
    return {
      success: true,
      message: '投标机会提醒日历已导出',
      filePath,
      calendarChars: calendar.content.length,
      eventCount: calendar.eventCount,
    };
  }

  return {
    loadState,
    saveOpportunity,
    saveOpportunityWithAi,
    importOpportunityDocument,
    importOpportunityUrl,
    updateFollowUp,
    addFollowUpRecord,
    updateFollowUpRecord,
    deleteFollowUpRecord,
    importAttachments,
    updateAttachment,
    deleteAttachment,
    updateStatus,
    deleteOpportunity,
    exportReport,
    exportCalendar,
    clear,
  };
}

module.exports = {
  createBidOpportunityStore,
  buildBidOpportunityReportMarkdown,
  buildBidOpportunityCalendarIcs,
  htmlToReadableText,
  normalizeAiParsedFields,
};
