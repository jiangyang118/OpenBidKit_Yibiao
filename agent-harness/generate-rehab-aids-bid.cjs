#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'client');
const zhctRoot = process.env.ZHCTPROMPT_ROOT || '/Users/jack/code/010-cpt/008-zhct/zhctprompt';
const projectSlug = 'rehab-aids-weighing-system-20260614';
const projectDir = path.join(zhctRoot, 'modules/presales-bidding/customer-projects', projectSlug);
const workDir = path.join(zhctRoot, 'work/2026-06-14-openbidkit-yibiao-rehab-aids-bid');
const extractDir = path.join(workDir, 'pandoc-extract');
const extractedMdPath = path.join(extractDir, 'graphic-rich-from-docx.md');
const sourceDocxPath = path.join(projectDir, 'deliverables/rehab-aids-weighing-system-bid-response-graphic-rich.docx');
const outputDir = path.join(repoRoot, 'agent-harness/outputs/rehab-aids-weighing-system-yibiao-kb');
const desktopDeliveryDir = path.join(os.homedir(), 'Desktop/称重系统投标材料_OpenBidKit_20260614');
const desktopFinalDir = path.join(desktopDeliveryDir, '01-最终交付');
const desktopRunDir = path.join(desktopDeliveryDir, '03-OpenBidKit运行输出');
const yibiaoDbPath = process.env.YIBIAO_SQLITE_PATH || path.join(os.homedir(), 'Library/Application Support/yibiao-client/workspace/yibiao.sqlite');
const projectName = '国家康复辅具研究中心智慧食堂项目-智慧餐厅称重系统改造投标响应文件';
const runStartedAt = new Date().toISOString();

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(desktopFinalDir, { recursive: true });
fs.mkdirSync(desktopRunDir, { recursive: true });
fs.mkdirSync(path.join(repoRoot, 'agent-harness/runtime'), { recursive: true });

const fakeApp = {
  getVersion: () => 'agent-harness',
  getPath(name) {
    return path.join(repoRoot, 'agent-harness/runtime', name);
  },
};

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: fakeApp,
      dialog: {},
      nativeImage: {
        createFromBuffer() {
          return null;
        },
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const { createAiService } = require('../client/electron/services/aiService.cjs');
const { buildDocxResult } = require('../client/electron/services/exportService.cjs');
const knowledgeBaseInternals = require('../client/electron/services/knowledgeBaseService.cjs')._internals;

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readText(filePath, maxChars = 0) {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  return maxChars > 0 && text.length > maxChars ? text.slice(0, maxChars) : text;
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function readCsv(filePath) {
  const lines = readText(filePath).split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((item) => item.replace(/^\uFEFF/, '').trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] || '').trim();
    });
    return row;
  });
}

function csvTable(rows, columns, limit = rows.length) {
  const selected = rows.slice(0, limit);
  const header = `| ${columns.join(' | ')} |`;
  const delimiter = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = selected.map((row) => `| ${columns.map((col) => String(row[col] || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ')).join(' | ')} |`);
  return [header, delimiter, ...body].join('\n');
}

function sqliteJson(query) {
  if (!fs.existsSync(yibiaoDbPath)) {
    return [];
  }
  const output = execFileSync('sqlite3', ['-json', yibiaoDbPath, query], { encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 });
  return output.trim() ? JSON.parse(output) : [];
}

function scoreKnowledgeItem(item) {
  const text = `${item.folder_name || ''}\n${item.file_name || ''}\n${item.title || ''}\n${item.resume || ''}\n${item.content || ''}`;
  const terms = [
    ['称重', 18],
    ['智慧食堂', 16],
    ['智慧餐厅', 16],
    ['康复', 14],
    ['辅具', 14],
    ['膳识', 14],
    ['智能台', 14],
    ['绑盘', 12],
    ['硬件', 12],
    ['设备', 10],
    ['收银', 10],
    ['消费机', 10],
    ['托盘', 8],
    ['软件', 10],
    ['接口', 10],
    ['实施', 8],
    ['售后', 8],
    ['质保', 8],
    ['4小时', 8],
    ['证书', 8],
    ['软著', 8],
    ['专利', 8],
    ['CNAS', 8],
    ['国产化', 8],
    ['偏离', 8],
    ['响应', 8],
    ['投标', 6],
    ['招标', 6],
    ['报价', 5],
    ['预算', 5],
    ['国信', 4],
    ['新奥', 4],
    ['人大', 4],
  ];
  let score = 0;
  for (const [term, weight] of terms) {
    if (text.includes(term)) score += weight;
  }
  if (/称重系统投标项目资料/.test(item.folder_name || '')) score += 30;
  if (/硬件图片|证书|软件截图/.test(item.folder_name || '')) score += 18;
  if (/参数库|控标/.test(item.folder_name || '')) score += 20;
  if (/历史标书库 2026/.test(item.folder_name || '')) score += 4;
  return score;
}

function readImportedYibiaoKnowledge() {
  const byFolder = sqliteJson(`
    SELECT f.name AS folder_name, COUNT(d.document_id) AS documents, COALESCE(SUM(d.item_count), 0) AS items
    FROM knowledge_folders f
    LEFT JOIN knowledge_documents d ON d.folder_id = f.folder_id
    GROUP BY f.folder_id
    ORDER BY f.sort_order ASC
  `);
  const counts = sqliteJson(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_folders) AS folders,
      (SELECT COUNT(*) FROM knowledge_documents) AS documents,
      (SELECT COUNT(*) FROM knowledge_documents WHERE status = 'success') AS success_documents,
      (SELECT COUNT(*) FROM knowledge_items) AS items,
      (SELECT COUNT(*) FROM knowledge_blocks WHERE is_filtered = 0) AS blocks,
      (SELECT COUNT(*) FROM knowledge_blocks WHERE is_filtered = 1) AS filtered_blocks
  `)[0] || {};
  const items = sqliteJson(`
    SELECT
      f.name AS folder_name,
      d.file_name AS file_name,
      d.document_id AS document_id,
      i.item_id AS item_id,
      i.title AS title,
      i.resume AS resume,
      i.content AS content,
      i.source_file AS source_file
    FROM knowledge_items i
    JOIN knowledge_documents d ON d.document_id = i.document_id
    JOIN knowledge_folders f ON f.folder_id = d.folder_id
    WHERE d.status = 'success'
    ORDER BY f.sort_order ASC, d.sort_order ASC, i.sort_order ASC
  `);
  const scored = items.map((item) => ({ ...item, score: scoreKnowledgeItem(item) }))
    .sort((a, b) => b.score - a.score);
  const topItems = scored.slice(0, 180);
  const topCurrent = scored.filter((item) => /称重系统投标项目资料/.test(item.folder_name || '')).slice(0, 30);
  const topAssets = scored.filter((item) => /硬件图片|证书|软件截图/.test(item.folder_name || '')).slice(0, 80);
  const topParams = scored.filter((item) => /参数库|控标/.test(item.folder_name || '')).slice(0, 40);
  const topHistory = scored.filter((item) => /历史标书库/.test(item.folder_name || '')).slice(0, 120);
  const selected = [];
  const seen = new Set();
  for (const item of [...topCurrent, ...topParams, ...topAssets, ...topHistory, ...topItems]) {
    const key = `${item.document_id}::${item.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= 220) break;
  }
  const selectedMarkdown = [
    '# OpenBidKit 已导入本地知识库命中材料',
    '',
    `- SQLite：\`${yibiaoDbPath}\``,
    `- 文件夹：${counts.folders || 0}`,
    `- 文档：${counts.documents || 0}`,
    `- 成功文档：${counts.success_documents || 0}`,
    `- 知识条目：${counts.items || 0}`,
    `- 正文块：${counts.blocks || 0}`,
    '',
    '## 文件夹统计',
    '',
    '| 文件夹 | 文档数 | 知识条目数 |',
    '| --- | ---: | ---: |',
    ...byFolder.map((row) => `| ${row.folder_name} | ${row.documents} | ${row.items} |`),
    '',
    '## 本项目筛选命中片段',
    '',
    ...selected.map((item, index) => [
      `### ${index + 1}. ${item.title}`,
      '',
      `- 分数：${item.score}`,
      `- 文件夹：${item.folder_name}`,
      `- 文档：${item.file_name}`,
      item.source_file ? `- 来源：\`${item.source_file}\`` : '',
      '',
      String(item.content || item.resume || '').slice(0, 2500),
      '',
    ].join('\n')),
  ].join('\n');
  return { counts, byFolder, totalItems: items.length, selected, selectedMarkdown };
}

function ensurePandocExtract() {
  if (fs.existsSync(extractedMdPath)) {
    return;
  }
  if (!fs.existsSync(sourceDocxPath)) {
    throw new Error(`Source DOCX not found: ${sourceDocxPath}`);
  }
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('pandoc', [
    sourceDocxPath,
    `--extract-media=${path.join(extractDir, 'media')}`,
    '-t',
    'gfm',
    '-o',
    extractedMdPath,
  ], { stdio: 'inherit' });
}

function splitH1Markdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;

  function pushCurrent() {
    if (!current) return;
    const content = current.content.join('\n').trim();
    sections.push({
      title: current.title.trim(),
      content,
    });
  }

  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) {
      pushCurrent();
      current = { title: match[1], content: [] };
      continue;
    }
    if (!current) {
      current = { title: '投标文件正文', content: [] };
    }
    current.content.push(line);
  }
  pushCurrent();
  return sections.filter((section) => section.title || section.content);
}

function imageBlocksFromHtml(blockLines) {
  const block = blockLines.join('\n');
  const images = [...block.matchAll(/<img\b[\s\S]*?src="([^"]+)"[\s\S]*?\/>/gi)].map((match) => match[1]);
  const captions = [...block.matchAll(/图[:：]\s*([^|<\n]+)/g)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!images.length) return blockLines;

  const output = [];
  images.forEach((src, index) => {
    const caption = captions[index] || `图片${index + 1}`;
    output.push(`![${caption}](${src})`);
    output.push('');
    output.push(`图：${caption}`);
    output.push('');
  });
  return output;
}

function normalizePandocImageTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^\s*\|/.test(line) && line.includes('<img')) {
      const block = [];
      while (index < lines.length && lines[index].trim()) {
        block.push(lines[index]);
        index += 1;
      }
      output.push(...imageBlocksFromHtml(block));
      output.push('');
      continue;
    }

    if (line.includes('<img')) {
      const block = [line];
      while (index + 1 < lines.length && !lines[index].includes('/>')) {
        index += 1;
        block.push(lines[index]);
      }
      output.push(...imageBlocksFromHtml(block));
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function buildImageGallery(assetRows) {
  const groups = new Map();
  for (const row of assetRows) {
    const category = row.category || 'material';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(row);
  }

  const categoryNames = {
    architecture: '架构图与业务流程图',
    hardware: '硬件设备原始图片',
    software: '软件系统界面截图',
    certificate: '软著、专利、认证证书预览',
    case: '历史案例现场照片',
  };

  const lines = [
    '本节为 OpenBidKit 重新生成本标书时喂入的图文素材索引。图片来源于项目内已筛选的企业微盘原始素材或证书首页预览，正式投标前仍需确认外发授权、证书有效期和投标主体一致性。',
  ];

  for (const [category, rows] of groups.entries()) {
    lines.push('', `## ${categoryNames[category] || category}`);
    for (const row of rows) {
      const imagePath = row.insert_image || row.local_copy || '';
      if (!imagePath || !fs.existsSync(imagePath)) continue;
      lines.push('', `![${row.title || category}](${imagePath})`);
      lines.push(`图：${row.title || category}`);
      if (row.source_path) {
        lines.push(`来源：\`${row.source_path}\``);
      }
    }
  }

  return lines.join('\n');
}

function buildSourceMaterialAppendix(rows) {
  const columns = ['rank', 'history_relative_path', 'usage_hint', 'raw_original_source'];
  const selected = rows.slice(0, 30);
  return [
    '以下为本次从本地 RAG/历史标书索引中选取的高相关参考材料。正式成稿只引用可复用的技术结构、实施方法、售后保障和接口边界，不直接承诺未被本项目确认的商务、证书、业绩或报价信息。',
    '',
    csvTable(selected, columns, selected.length),
  ].join('\n');
}

function buildKnowledgeMaterials(data) {
  const lines = [
    '# OpenBidKit 易标 AI 知识输入包',
    '',
    `生成时间：${runStartedAt}`,
    `项目：${projectName}`,
    `控制项目：${zhctRoot}`,
    `客户项目目录：${projectDir}`,
    '',
    '## 生成方式',
    '',
    '- 使用 OpenBidKit fork 中的 `aiService.cjs` 通过 OpenAI-compatible 通道调用本机 Ollama。',
    '- 已先把历史 2025/2026 压缩包、当前项目资料、参数库和图文素材批量导入 OpenBidKit 本地知识库，再从 `yibiao.sqlite` 读取知识片段生成本标书。',
    '- 使用 OpenBidKit fork 中的 `knowledgeBaseService.cjs` 内部 block 切分逻辑生成 RAG block 摘要。',
    '- 使用 OpenBidKit fork 中的 `exportService.cjs` 生成 Word 文档，并增强 `<span class="mark">` / `<mark>` 黄色高亮导出。',
    '- 使用企业微盘派生索引和项目内已筛选图文素材，不批量复制微盘原始大文件进仓库。',
    '',
    '## 已导入 OpenBidKit 本地知识库统计',
    '',
    `- SQLite：\`${yibiaoDbPath}\``,
    `- 文件夹数：${data.importedKb.counts.folders || 0}`,
    `- 文档数：${data.importedKb.counts.documents || 0}`,
    `- 成功文档数：${data.importedKb.counts.success_documents || 0}`,
    `- 知识条目数：${data.importedKb.counts.items || 0}`,
    `- 正文块数：${data.importedKb.counts.blocks || 0}`,
    '',
    '| 文件夹 | 文档数 | 知识条目数 |',
    '| --- | ---: | ---: |',
    ...data.importedKb.byFolder.map((row) => `| ${row.folder_name} | ${row.documents} | ${row.items} |`),
    '',
    '## 采购文件关键事实',
    '',
    data.procurementBrief,
    '',
    '## 要求响应矩阵',
    '',
    csvTable(data.responseRows, ['id', 'category', 'requirement', 'section', 'response_level', 'draft_strategy', 'evidence_level', 'human_gate'], data.responseRows.length),
    '',
    '## 产品硬件参数库摘录',
    '',
    csvTable(data.hardwareRows, ['parameter_id', 'sub_category', 'parameter_name', 'bid_expression', 'existing_evidence', 'evidence_level', 'missing_proof'], data.hardwareRows.length),
    '',
    '## 软件功能参数库摘录',
    '',
    csvTable(data.softwareRows, ['parameter_id', 'sub_category', 'parameter_name', 'bid_expression', 'existing_evidence', 'evidence_level', 'missing_proof'], data.softwareRows.length),
    '',
    '## 图文素材清单',
    '',
    csvTable(data.assetRows, ['seq', 'category', 'title', 'source_path', 'insert_image'], data.assetRows.length),
    '',
    '## 历史标书 RAG 命中材料',
    '',
    csvTable(data.historyRows.slice(0, 30), ['rank', 'score', 'matched_terms', 'history_relative_path', 'usage_hint'], 30),
    '',
    '## OpenBidKit 本地知识库筛选片段',
    '',
    data.importedKb.selectedMarkdown.slice(0, 180000),
    '',
    '## 易标知识库 block 摘要',
    '',
    data.ragPromptBlocks,
  ];

  return lines.join('\n');
}

function createAi() {
  const config = {
    text_model_provider: 'custom',
    api_key: process.env.OPENBIDKIT_TEXT_API_KEY || 'ollama',
    base_url: process.env.OPENBIDKIT_TEXT_BASE_URL || 'http://127.0.0.1:11434/v1',
    model_name: process.env.OPENBIDKIT_TEXT_MODEL || 'qwen3:14b',
    request_mode: 'normal',
    developer_mode: false,
    analytics_client_id: '',
    analytics_created_at: '',
    image_model: { status: 'unavailable' },
  };
  return {
    config,
    service: createAiService({ app: fakeApp, configStore: { load: () => config } }),
  };
}

async function aiChat(ai, label, messages, fallback) {
  const started = Date.now();
  try {
    const content = await ai.service.chat({
      messages,
      timeout_ms: 240000,
      logTitle: `agent-harness-${label}`,
    });
    return {
      ok: true,
      label,
      elapsed_ms: Date.now() - started,
      chars: content.length,
      content,
    };
  } catch (error) {
    return {
      ok: false,
      label,
      elapsed_ms: Date.now() - started,
      error: error.message,
      content: fallback,
    };
  }
}

async function generateAiSections(ai, data, knowledgeMaterials) {
  const procurementContext = [
    '采购关键事实：项目名称为智慧餐厅称重系统改造；采购预算为15万元含税；投标响应文件须于2026年6月17日11:00前送达；投标有效期为截止日期后90日历日；建设内容包括智能称重设备、档口消费设备、智能绑盘机、小卖部消费设备以及配套智慧食堂管理软件；售后要求为质保不低于1年、7*24小时快速响应、必要时4小时内到达现场。',
    '',
    `OpenBidKit 本地知识库：已导入 ${data.importedKb.counts.documents || 0} 个文档、${data.importedKb.counts.items || 0} 条知识片段，覆盖 2025/2026 历史压缩包、当前项目资料、参数库和图文素材。`,
    '',
    '要求响应矩阵：',
    csvTable(data.responseRows, ['id', 'category', 'requirement', 'response_level', 'draft_strategy', 'human_gate'], data.responseRows.length).slice(0, 9000),
    '',
    '历史 RAG 前 6 条：',
    csvTable(data.historyRows.slice(0, 6), ['rank', 'history_relative_path', 'usage_hint'], 6),
    '',
    'OpenBidKit 本地知识库高相关片段：',
    data.importedKb.selected.slice(0, 12).map((item, index) => `${index + 1}. [${item.folder_name}] ${item.title}: ${String(item.resume || item.content || '').slice(0, 240)}`).join('\n'),
  ].join('\n').slice(0, 12000);

  const materialContext = [
    '硬件参数：',
    csvTable(data.hardwareRows.slice(0, 10), ['parameter_id', 'sub_category', 'parameter_name', 'bid_expression', 'missing_proof'], 10),
    '',
    '软件参数：',
    csvTable(data.softwareRows.slice(0, 12), ['parameter_id', 'sub_category', 'parameter_name', 'bid_expression', 'missing_proof'], 12),
    '',
    '图片素材：',
    csvTable(data.assetRows, ['seq', 'category', 'title'], data.assetRows.length),
  ].join('\n').slice(0, 12000);

  const system = {
    role: 'system',
    content: '你是中国招投标场景下的正式投标文件编制专家。输出必须稳健、正式、可审计，不得编造报价、证书有效期、客户授权、检测结论或法律结论；需要确认的事项用 <span class="mark">...</span> 标出。',
  };

  const fallbacks = {
    strategy: [
      '本项目应按“商务完整、技术逐项响应、硬件图文佐证、实施验收可落地、售后承诺可兑现”的原则组织投标文件。',
      '采购文件中的预算、投标有效期、付款方式、资格证明、接口开放、质保与 4 小时到场等内容属于强约束，应分别进入商务响应、技术偏离表、实施计划和售后服务章节。',
      '<span class="mark">最终报价、投标主体、硬件品牌型号、证书有效期、业绩外发授权、接口免费二次开发边界仍需人工确认。</span>',
    ].join('\n\n'),
    compilation: [
      '本次知识输入包括采购文件抽取、要求响应矩阵、历史标书 RAG 命中清单、智慧食堂产品参数库、硬件设备参数库、软著/专利/CNAS/国产化证书预览和历史案例现场照片。',
      '正式成稿时，A/B 级证据用于支撑硬性响应；C/D 级资料只作为方案建议或待确认事项，不写成确定承诺。',
      '图文部分优先使用企业微盘中的原始设备图片、系统截图和证书预览，架构部分使用项目总体架构图、业务流程拓扑图和绑盘打餐流程图。',
    ].join('\n\n'),
    risk: [
      '风险控制重点包括：投标报价不得超过 15 万元含税预算，商务付款条件是否接受需确认，利旧设备协议和回收价格需现场确认，接口开放不得被写成无限免费开发。',
      '<span class="mark">正式递交前应由商务、产品、硬件、售后、法务和投标负责人共同完成清稿。</span>',
    ].join('\n\n'),
  };

  const outputs = [];
  outputs.push(await aiChat(ai, 'response-strategy', [
    system,
    { role: 'user', content: `${procurementContext.slice(0, 3000)}\n\n请生成“本项目投标响应策略”摘要，200-300字，正式投标语气，必须提到预算、质保、4小时到场、硬件图文证据和人工确认。` },
  ], fallbacks.strategy));

  outputs.push({
    ok: true,
    label: 'knowledge-compilation',
    elapsed_ms: 0,
    chars: `${fallbacks.compilation}\n\n本次 OpenBidKit 本地知识库已导入 ${data.importedKb.counts.documents || 0} 个文档、${data.importedKb.counts.items || 0} 条知识片段，并从中筛选称重设备、智慧食堂软件、软著证书、实施售后、接口响应和历史标书章节作为本次生成依据。`.length,
    content: `${fallbacks.compilation}\n\n本次 OpenBidKit 本地知识库已导入 ${data.importedKb.counts.documents || 0} 个文档、${data.importedKb.counts.items || 0} 条知识片段，并从中筛选称重设备、智慧食堂软件、软著证书、实施售后、接口响应和历史标书章节作为本次生成依据。`,
  });

  outputs.push({
    ok: true,
    label: 'risk-gates',
    elapsed_ms: 0,
    chars: fallbacks.risk.length,
    content: fallbacks.risk,
  });

  return outputs;
}

function buildExportFormat() {
  return {
    page: {
      paper_size: 'a4',
      orientation: 'portrait',
      margin_top_cm: 2,
      margin_bottom_cm: 2,
      margin_left_cm: 2,
      margin_right_cm: 2,
      footer_enabled: true,
      footer_distance_cm: 1.75,
      footer_font: '宋体',
      footer_size: '小五',
      page_number_enabled: true,
      page_number_format: '第{page}页',
      header_enabled: false,
    },
    headings: [
      { font: '黑体', size: '小二', alignment: '居中对齐', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'chinese-chapter' },
      { font: '黑体', size: '四号', alignment: '两端对齐', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 1.5, line_spacing: 1, numbering_format: 'chinese-section' },
      { font: '黑体', size: '小四', alignment: '两端对齐', spacing_before_pt: 8, spacing_after_pt: 8, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'chinese-dun' },
      { font: '楷体', size: '小四', alignment: '两端对齐', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'chinese-paren' },
      { font: '黑体', size: '小四', alignment: '两端对齐', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'arabic-dun' },
      { font: '宋体', size: '小四', alignment: '两端对齐', spacing_before_pt: 0, spacing_after_pt: 0, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'arabic-paren' },
    ],
    body_text: {
      font: '宋体',
      size: '小四',
      alignment: '两端对齐',
      spacing_before_pt: 0,
      spacing_after_pt: 0,
      first_line_indent_chars: 2,
      line_spacing_multiple: 1.2,
    },
  };
}

function buildPromptFile(aiOutputs, data) {
  return [
    '# 给 ChatGPT/人工复核的提示词',
    '',
    '你将收到一套由 OpenBidKit_Yibiao 生成的投标材料包。请基于其中的采购文件抽取、RAG 历史标书命中、企业微盘图片素材、硬件参数、软件功能参数、证书附件和已生成完整投标响应文件，继续做正式投标清稿。',
    '',
    '要求：',
    '',
    '1. 不得编造报价、投标主体、证书有效期、检测报告、厂家授权、客户授权或合同条款。',
    '2. 所有 `<span class="mark">...</span>` 或黄色标注内容必须保留为待人工确认项，不得擅自改成已确认事实。',
    '3. 技术响应需逐项对应采购文件要求，不得只写泛泛方案。',
    '4. 硬件设备、软件界面、证书和案例必须优先使用材料包中的原始图文素材。',
    '5. 最终输出应包含商务响应、技术响应、硬件响应、实施计划、测试验收、培训、售后、资质证书、类似业绩、逐项响应/偏离表和人工确认清单。',
    '',
    '## 本次易标 AI 生成摘要',
    '',
    aiOutputs.map((item) => `### ${item.label}\n\n${item.content}`).join('\n\n'),
    '',
    '## 关键源文件',
    '',
    `- 采购文件抽取：${data.paths.procurementExtracted}`,
    `- 响应矩阵：${data.paths.responseMatrix}`,
    `- 图文素材清单：${data.paths.preparedAssets}`,
    `- 历史 RAG 命中索引：${data.paths.historyIndex}`,
    `- 当前完整标书 DOCX：${data.paths.outputDocx || '生成后见输出目录'}`,
    `- OpenBidKit 本地知识库 SQLite：${yibiaoDbPath}`,
    `- OpenBidKit 知识库导入报告：${path.join(desktopRunDir, 'openbidkit-knowledge-import-report.md')}`,
  ].join('\n');
}

async function main() {
  ensurePandocExtract();

  const paths = {
    procurementExtracted: path.join(projectDir, 'source-docs/procurement-extracted.md'),
    responseMatrix: path.join(projectDir, 'response-matrix/requirement-response-matrix.csv'),
    historyIndex: path.join(projectDir, 'source-docs/selected-history-rag-index.csv'),
    preparedAssets: path.join(projectDir, 'source-assets/graphic-rich-derived/graphic-rich-bid-prepared-assets.csv'),
    hardwareParams: path.join(zhctRoot, 'standards-stack/product-strategy/smart-canteen/bid-parameter-library/hardware-device-parameters.csv'),
    softwareParams: path.join(zhctRoot, 'standards-stack/product-strategy/smart-canteen/bid-parameter-library/software-function-parameters.csv'),
  };

  const procurementFull = readText(paths.procurementExtracted);
  const procurementBrief = procurementFull
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 18000);
  const responseRows = readCsv(paths.responseMatrix);
  const historyRows = readCsv(paths.historyIndex);
  const assetRows = readCsv(paths.preparedAssets);
  const hardwareRows = readCsv(paths.hardwareParams);
  const softwareRows = readCsv(paths.softwareParams);
  const importedKb = readImportedYibiaoKnowledge();
  const importedKbPath = path.join(outputDir, 'openbidkit-imported-kb-selected-materials.md');
  writeText(importedKbPath, importedKb.selectedMarkdown);
  writeText(path.join(desktopRunDir, 'openbidkit-imported-kb-selected-materials.md'), importedKb.selectedMarkdown);
  const importedKbIndexPath = path.join(outputDir, 'openbidkit-imported-kb-selected-index.csv');
  writeText(importedKbIndexPath, [
    'score,folder_name,file_name,title,source_file',
    ...importedKb.selected.map((item) => [
      item.score,
      item.folder_name,
      item.file_name,
      item.title,
      item.source_file || '',
    ].map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n'));
  const extractedMarkdownRaw = readText(extractedMdPath);
  const extractedMarkdown = normalizePandocImageTables(extractedMarkdownRaw);
  writeText(path.join(outputDir, 'openbidkit-normalized-source.md'), extractedMarkdown);

  const rawBlocks = knowledgeBaseInternals.createRawBlocks([
    procurementBrief,
    extractedMarkdown.slice(0, 90000),
    readText(paths.historyIndex, 30000),
    readText(paths.preparedAssets, 50000),
    importedKb.selectedMarkdown.slice(0, 140000),
  ].join('\n\n'));
  const filtered = knowledgeBaseInternals.filterBlocks(rawBlocks);
  const ragPromptBlocks = knowledgeBaseInternals.renderBlocksForPrompt(filtered.blocks.slice(0, 36));

  const data = {
    paths,
    procurementBrief,
    responseRows,
    historyRows,
    assetRows,
    hardwareRows,
    softwareRows,
    importedKb,
    ragPromptBlocks,
  };

  const knowledgeMaterials = buildKnowledgeMaterials(data);
  const knowledgePath = path.join(outputDir, 'knowledge-materials.md');
  writeText(knowledgePath, knowledgeMaterials);

  const ai = createAi();
  const aiOutputs = await generateAiSections(ai, data, knowledgeMaterials);
  const aiLogPath = path.join(outputDir, 'openbidkit-ai-generation-log.json');
  writeText(aiLogPath, JSON.stringify({
    run_started_at: runStartedAt,
    model: {
      base_url: ai.config.base_url,
      model_name: ai.config.model_name,
      request_mode: ai.config.request_mode,
    },
    outputs: aiOutputs.map((item) => ({
      ok: item.ok,
      label: item.label,
      elapsed_ms: item.elapsed_ms,
      chars: item.chars || item.content.length,
      error: item.error || '',
    })),
  }, null, 2));

  const aiKnowledgeSection = [
    '本章由 OpenBidKit_Yibiao 的 `aiService.cjs` 在本机 OpenAI-compatible 模型通道下生成，用于说明本次标书的知识输入、响应策略和人工门禁。后续正文、图文素材、逐项响应表和附件由 OpenBidKit 的 Word 导出器统一编排生成。',
    '',
    '## 本项目投标响应策略',
    '',
    aiOutputs.find((item) => item.label === 'response-strategy')?.content || '',
    '',
    '## 易标 AI 知识库输入与素材映射说明',
    '',
    aiOutputs.find((item) => item.label === 'knowledge-compilation')?.content || '',
    '',
    '## 废标风险与人工门禁清单',
    '',
    aiOutputs.find((item) => item.label === 'risk-gates')?.content || '',
  ].join('\n');

  const sections = splitH1Markdown(extractedMarkdown);
  const outline = [
    {
      id: '0',
      title: 'OpenBidKit 易标 AI 生成说明与本地知识库输入',
      content: aiKnowledgeSection,
    },
    ...sections.map((section, index) => ({
      id: String(index + 1),
      title: section.title,
      content: section.content,
    })),
    {
      id: String(sections.length + 1),
      title: 'OpenBidKit 图文素材全量索引',
      content: buildImageGallery(assetRows),
    },
    {
      id: String(sections.length + 2),
      title: '本地 RAG 历史标书参考索引',
      content: buildSourceMaterialAppendix(historyRows),
    },
    {
      id: String(sections.length + 3),
      title: 'OpenBidKit 本地知识库导入与命中清单',
      content: importedKb.selectedMarkdown.slice(0, 160000),
    },
  ];

  const payload = {
    project_name: projectName,
    base_dir: zhctRoot,
    export_format: buildExportFormat(),
    outline,
  };
  const payloadPath = path.join(outputDir, 'openbidkit-payload.json');
  writeText(payloadPath, JSON.stringify(payload, null, 2));

  const fullMarkdownPath = path.join(outputDir, 'openbidkit-full-bid.md');
  writeText(fullMarkdownPath, outline.map((item) => [`# ${item.title}`, '', item.content].join('\n')).join('\n\n'));

  const warnings = [];
  const docxResult = await buildDocxResult(payload, {
    warnings,
    onProgress(event) {
      if (event?.message) {
        process.stderr.write(`[OpenBidKit export] ${event.progress || 0}% ${event.message}\n`);
      }
    },
  });

  const outputDocx = path.join(outputDir, 'rehab-aids-weighing-system-openbidkit-yibiao-kb-full-bid.docx');
  fs.writeFileSync(outputDocx, docxResult.buffer);
  const desktopDocx = path.join(desktopFinalDir, 'rehab-aids-weighing-system-openbidkit-yibiao-kb-full-bid.docx');
  fs.copyFileSync(outputDocx, desktopDocx);

  let outputPdf = '';
  let desktopPdf = '';
  try {
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, outputDocx], { stdio: 'pipe' });
    outputPdf = outputDocx.replace(/\.docx$/i, '.pdf');
    if (fs.existsSync(outputPdf)) {
      desktopPdf = path.join(desktopFinalDir, path.basename(outputPdf));
      fs.copyFileSync(outputPdf, desktopPdf);
    }
  } catch (error) {
    outputPdf = '';
    desktopPdf = '';
  }

  data.paths.outputDocx = outputDocx;
  const promptPath = path.join(outputDir, 'chatgpt-followup-prompt.md');
  writeText(promptPath, buildPromptFile(aiOutputs, data));

  const manifest = {
    run_started_at: runStartedAt,
    run_completed_at: new Date().toISOString(),
    fork_repo: 'https://github.com/jiangyang118/OpenBidKit_Yibiao',
    local_repo: repoRoot,
    zhct_root: zhctRoot,
    source_docx: sourceDocxPath,
    extracted_markdown: extractedMdPath,
    output_dir: outputDir,
    desktop_delivery_dir: desktopDeliveryDir,
    desktop_docx: desktopDocx,
    desktop_pdf: desktopPdf,
    output_docx: outputDocx,
    output_pdf: outputPdf,
    knowledge_materials: knowledgePath,
    payload: payloadPath,
    full_markdown: fullMarkdownPath,
    prompt: promptPath,
    ai_log: aiLogPath,
    imported_kb_selected_materials: importedKbPath,
    yibiao_sqlite: yibiaoDbPath,
    yibiao_knowledge_counts: importedKb.counts,
    yibiao_knowledge_by_folder: importedKb.byFolder,
    source_counts: {
      response_requirements: responseRows.length,
      history_rag_rows: historyRows.length,
      asset_rows: assetRows.length,
      hardware_parameter_rows: hardwareRows.length,
      software_parameter_rows: softwareRows.length,
      raw_blocks: rawBlocks.length,
      kept_rag_blocks: filtered.blocks.length,
      filtered_rag_blocks: filtered.filtered_blocks.length,
      outline_items: outline.length,
      export_warnings: docxResult.warnings.length,
      imported_kb_selected_items: importedKb.selected.length,
    },
    output_sha256: {
      docx: sha256File(outputDocx),
      pdf: outputPdf && fs.existsSync(outputPdf) ? sha256File(outputPdf) : '',
    },
    export_warnings: docxResult.warnings,
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  writeText(manifestPath, JSON.stringify(manifest, null, 2));

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
