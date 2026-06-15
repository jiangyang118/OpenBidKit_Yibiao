#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const zhctRoot = process.env.ZHCTPROMPT_ROOT || '/Users/jack/code/010-cpt/008-zhct/zhctprompt';
const userDataDir = process.env.YIBIAO_USER_DATA || path.join(os.homedir(), 'Library/Application Support/yibiao-client');
const desktopDeliveryDir = '/Users/jack/Desktop/称重系统投标材料_OpenBidKit_20260614';
const desktopRunDir = path.join(desktopDeliveryDir, '03-OpenBidKit运行输出');
const projectSlug = 'rehab-aids-weighing-system-20260614';
const projectDir = path.join(zhctRoot, 'modules/presales-bidding/customer-projects', projectSlug);
const historyDir = path.join(zhctRoot, 'work/2026-06-13-presales-bidding-history-ingest');
const manifestPath = path.join(historyDir, 'bidding-knowledge-manifest.csv');
const parameterLibraryDir = path.join(zhctRoot, 'standards-stack/product-strategy/smart-canteen/bid-parameter-library');
const importedAt = new Date().toISOString();

fs.mkdirSync(desktopRunDir, { recursive: true });

const fakeApp = {
  getVersion: () => 'agent-harness',
  getPath(name) {
    if (name === 'userData') return userDataDir;
    return path.join(userDataDir, name);
  },
  once() {},
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

const { createSqliteDatabase } = require('../client/electron/services/sqliteDatabase.cjs');
const { createKnowledgeBaseStore } = require('../client/electron/services/knowledgeBaseStore.cjs');
const knowledgeInternals = require('../client/electron/services/knowledgeBaseService.cjs')._internals;
const { getKnowledgeBaseDir } = require('../client/electron/utils/paths.cjs');

function stableId(prefix, value) {
  return `${prefix}-zhct-${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 24)}`;
}

function sha256File(filePath) {
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
}

function safeName(value) {
  return String(value || '未命名')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .trim()
    .slice(0, 180) || '未命名';
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
  if (!fs.existsSync(filePath)) return [];
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

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(full));
    } else if (entry.isFile()) {
      output.push(full);
    }
  }
  return output;
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0B';
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

function csvToMarkdown(filePath, maxChars = 240000) {
  const text = readText(filePath);
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars)}\n\n> 内容过长，已截断用于知识库预览；原始文件路径：${filePath}\n`;
  }
  return text;
}

function fileToMarkdownDocument(filePath, titlePrefix = '') {
  const ext = path.extname(filePath).toLowerCase();
  const title = `${titlePrefix}${path.basename(filePath)}`;
  const stat = fs.statSync(filePath);
  let body = '';
  if (['.md', '.markdown', '.txt'].includes(ext)) {
    body = readText(filePath);
  } else if (['.csv', '.tsv'].includes(ext)) {
    body = [
      `# ${title}`,
      '',
      `- 来源文件：\`${filePath}\``,
      `- 文件大小：${formatBytes(stat.size)}`,
      `- SHA256：\`${sha256File(filePath)}\``,
      '',
      '```csv',
      csvToMarkdown(filePath),
      '```',
    ].join('\n');
  } else if (['.html', '.htm'].includes(ext)) {
    body = [
      `# ${title}`,
      '',
      `- 来源文件：\`${filePath}\``,
      `- 文件大小：${formatBytes(stat.size)}`,
      '',
      readText(filePath).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240000),
    ].join('\n');
  } else {
    body = [
      `# ${title}`,
      '',
      `- 来源文件：\`${filePath}\``,
      `- 文件类型：${ext || 'unknown'}`,
      `- 文件大小：${formatBytes(stat.size)}`,
      `- SHA256：\`${sha256File(filePath)}\``,
      '',
      '该文件作为项目相关原始素材登记进易标知识库。若为图片、证书扫描件、Word/PDF 等二进制文件，正文生成时按素材路径引用，正式投标前需要人工确认外发授权和证书有效期。',
    ].join('\n');
  }
  if (!/^#\s+/m.test(body)) {
    body = `# ${title}\n\n${body}`;
  }
  return { title, markdown: body };
}

function metadataMarkdownFromManifest(row) {
  const fileName = path.basename(row.zip_internal_path || row.extracted_path || '未命名文件');
  const kind = ['.png', '.jpg', '.jpeg', '.webp'].includes(String(row.extension || '').toLowerCase())
    ? '图片/照片素材'
    : '非文本或待人工抽取资料';
  return [
    `# ${fileName}`,
    '',
    `- 资料类型：${kind}`,
    `- 历史年份：${row.source_label || ''}`,
    `- 压缩包内路径：\`${row.zip_internal_path || ''}\``,
    `- 解压到微盘路径：\`${row.extracted_path || ''}\``,
    `- 原始压缩包：\`${row.source_zip || ''}\``,
    `- 扩展名：${row.extension || ''}`,
    `- 文件大小：${formatBytes(row.file_size)}`,
    `- 压缩后大小：${formatBytes(row.compressed_size)}`,
    `- 修改时间：${row.zip_mtime || ''}`,
    `- SHA256：\`${row.sha256 || ''}\``,
    `- 抽取状态：${row.knowledge_status || ''}`,
    `- 抽取方式：${row.extraction_method || ''}`,
    '',
    '该条目用于让易标知识库保留历史压缩包中的原始文件映射。若需要正文级引用，应优先使用已抽取 Markdown 的同名资料；若为图片/扫描件/CAD/压缩包/投标工具格式，正式投标前需人工查看原文件确认。',
  ].join('\n');
}

function chunkBlocksIntoItems(documentId, fileName, blocks, sourceFile, maxChars = 4200) {
  const items = [];
  let buffer = [];
  let sourceBlockIds = [];
  let chars = 0;

  function flush() {
    const content = buffer.join('\n\n').trim();
    if (!content) return;
    const index = items.length + 1;
    const title = `${fileName} - 知识片段 ${String(index).padStart(3, '0')}`;
    const resume = content.replace(/\s+/g, ' ').slice(0, 500);
    items.push({
      id: `item-${String(index).padStart(5, '0')}`,
      title,
      summary: resume,
      resume,
      content,
      source_file: sourceFile,
      source_block_ids: [...sourceBlockIds],
    });
    buffer = [];
    sourceBlockIds = [];
    chars = 0;
  }

  for (const block of blocks) {
    const text = String(block.content || '').trim();
    if (!text) continue;
    if (buffer.length && chars + text.length > maxChars) flush();
    buffer.push(text);
    sourceBlockIds.push(block.id);
    chars += text.length;
  }
  flush();

  if (!items.length) {
    items.push({
      id: 'item-00001',
      title: `${fileName} - 文件索引`,
      summary: '文件已登记，但未抽取出可分块正文。',
      resume: '文件已登记，但未抽取出可分块正文。',
      content: `${fileName}\n\n原始路径：${sourceFile}`,
      source_file: sourceFile,
      source_block_ids: [],
    });
  }
  return items.map((item, index) => ({
    ...item,
    id: `K${String(index + 1).padStart(5, '0')}`,
  }));
}

function markdownForHistoryRow(row) {
  if (row.markdown_path) {
    const full = path.join(zhctRoot, row.markdown_path);
    if (fs.existsSync(full)) {
      const sourceHeader = [
        `# ${path.basename(row.zip_internal_path || row.markdown_path)}`,
        '',
        `- 历史年份：${row.source_label || ''}`,
        `- 压缩包内路径：\`${row.zip_internal_path || ''}\``,
        `- 解压到微盘路径：\`${row.extracted_path || ''}\``,
        `- 原始压缩包：\`${row.source_zip || ''}\``,
        `- 扩展名：${row.extension || ''}`,
        `- SHA256：\`${row.sha256 || ''}\``,
        `- 抽取方式：${row.extraction_method || ''}`,
        '',
        '---',
        '',
      ].join('\n');
      return sourceHeader + readText(full);
    }
  }
  return metadataMarkdownFromManifest(row);
}

function imageAssetMarkdown(filePath) {
  const stat = fs.statSync(filePath);
  const rel = path.relative(projectDir, filePath);
  const ext = path.extname(filePath).toLowerCase();
  const category = /hardware|智能台|称|收银机|托盘|绑盘|消费机|终端/.test(filePath)
    ? '硬件设备'
    : /certificate|证书|软著|专利|认证/.test(filePath)
      ? '证书/软著/专利'
      : /architecture|流程|拓扑|架构/.test(filePath)
        ? '架构/流程图'
        : /software|PC|移动端|订单|人员|菜品|报表/.test(filePath)
          ? '软件界面'
          : /case|工作照片|运行/.test(filePath)
            ? '案例照片'
            : '项目素材';
  return [
    `# ${path.basename(filePath)}`,
    '',
    `- 素材类别：${category}`,
    `- 项目相对路径：\`${rel}\``,
    `- 本机绝对路径：\`${filePath}\``,
    `- 文件类型：${ext}`,
    `- 文件大小：${formatBytes(stat.size)}`,
    `- SHA256：\`${sha256File(filePath)}\``,
    '',
    `![${path.basename(filePath)}](${filePath})`,
    '',
    '该素材已导入易标知识库索引，生成投标文件时可作为图文并茂章节的图片来源。正式递交前需人工确认是否允许外发、是否与投标主体/产品型号/证书有效期一致。',
  ].join('\n');
}

function ensureFolder(db, folder) {
  db.prepare(`
    INSERT INTO knowledge_folders (folder_id, name, sort_order, created_at, updated_at)
    VALUES (@folder_id, @name, @sort_order, @created_at, @updated_at)
    ON CONFLICT(folder_id) DO UPDATE SET
      name = excluded.name,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `).run({
    folder_id: folder.id,
    name: folder.name,
    sort_order: folder.sort_order,
    created_at: importedAt,
    updated_at: importedAt,
  });
}

function importMarkdownDocument({ store, baseDir, folderId, documentId, fileName, markdown, sourceLabel, sortOrder }) {
  const documentDir = path.join('folders', folderId, 'documents', documentId).replace(/\\/g, '/');
  const absoluteDir = path.join(baseDir, documentDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  const sourcePath = path.join(documentDir, 'source.md').replace(/\\/g, '/');
  const markdownPath = path.join(documentDir, 'content.md').replace(/\\/g, '/');
  const absoluteMarkdownPath = path.join(baseDir, markdownPath);
  const finalMarkdown = String(markdown || '').trim() ? `${String(markdown).trim()}\n` : `# ${fileName}\n\n空白资料，仅保留来源索引。\n`;
  fs.writeFileSync(path.join(baseDir, sourcePath), finalMarkdown, 'utf-8');
  fs.writeFileSync(absoluteMarkdownPath, finalMarkdown, 'utf-8');

  const document = store.createDocument({
    id: documentId,
    folder_id: folderId,
    file_name: safeName(fileName),
    document_dir: documentDir,
    source_path: sourcePath,
    markdown_path: markdownPath,
    source_extension: '.md',
    status: 'saving',
    progress: 0,
    message: '批量导入中',
    item_count: 0,
    block_count: 0,
    filtered_block_count: 0,
    candidate_item_count: 0,
    discarded_block_count: 0,
    system_discarded_after_retry_count: 0,
    parser_label: 'zhct-bulk-import',
    sort_order: sortOrder,
    created_at: importedAt,
    updated_at: importedAt,
  });

  store.updateMarkdownMetadata(documentId, finalMarkdown, 'zhct-bulk-import');
  const rawBlocks = knowledgeInternals.createRawBlocks(finalMarkdown);
  const semanticBlocks = knowledgeInternals.mergeSemanticBlocks(rawBlocks);
  const filtered = knowledgeInternals.filterBlocks(semanticBlocks);
  const keptBlocks = filtered.blocks.length ? filtered.blocks : [{
    id: 'R000001',
    type: 'paragraph',
    heading_path: [],
    content: finalMarkdown.slice(0, 8000),
  }];
  const filteredBlocks = filtered.filtered_blocks || [];
  store.saveBlocks(documentId, keptBlocks, filteredBlocks);
  const finalItems = chunkBlocksIntoItems(documentId, document.file_name, keptBlocks, sourceLabel || fileName);
  const candidateItems = finalItems.map(({ id, title, resume }) => ({ id, title, summary: resume }));
  const matchedBlockIds = new Set(finalItems.flatMap((item) => item.source_block_ids || []));
  const report = {
    total_blocks: keptBlocks.length + filteredBlocks.length,
    filtered_blocks_count: filteredBlocks.length,
    candidate_items_count: candidateItems.length,
    final_items_count: finalItems.length,
    matched_blocks_count: matchedBlockIds.size,
    discarded_blocks_count: 0,
    system_discarded_after_retry_count: 0,
    new_items_from_recovery_count: 0,
    recovery_attempt_count: 0,
    batch_size: 50,
    coverage_rate: keptBlocks.length ? Number((matchedBlockIds.size / keptBlocks.length).toFixed(4)) : 0,
    matched_rate: 1,
    created_at: importedAt,
  };
  store.saveCandidateItems(documentId, candidateItems, 'zhct-bulk-import');
  store.saveMatchResult(documentId, {
    candidateItems,
    finalItems,
    matchResult: { discarded: [], system_discarded_after_retry: [] },
    report,
  });
  for (const [stepKey, result] of [
    ['copy_source', { source_path: sourcePath }],
    ['convert_markdown', { markdown_chars: finalMarkdown.length }],
    ['build_blocks', { block_count: keptBlocks.length, filtered_block_count: filteredBlocks.length }],
    ['extract_first_items', { items: candidateItems }],
    ['extract_supplement_items', { items: [] }],
    ['merge_candidates', { candidate_item_count: candidateItems.length }],
    ['match_batches', { batch_size: 50, batch_count: 1 }],
    ['recover_missing', { items: finalItems, matches: [], discarded: [], system_discarded: [], recovery_attempts: [] }],
    ['save_result', { item_count: finalItems.length }],
  ]) {
    store.saveDocumentStep(documentId, stepKey, { status: 'success', result });
  }
  store.updateDocument(documentId, {
    status: 'success',
    progress: 100,
    message: `已批量导入 ${finalItems.length} 条知识片段`,
    error: null,
    item_count: finalItems.length,
    candidate_item_count: candidateItems.length,
    block_count: keptBlocks.length,
    filtered_block_count: filteredBlocks.length,
    parser_label: 'zhct-bulk-import',
  });
  return {
    document_id: documentId,
    folder_id: folderId,
    file_name: document.file_name,
    markdown_chars: finalMarkdown.length,
    block_count: keptBlocks.length,
    filtered_block_count: filteredBlocks.length,
    item_count: finalItems.length,
  };
}

function buildImportPlan() {
  const plan = [];
  const historyRows = readCsv(manifestPath);
  let order2025 = 0;
  let order2026 = 0;
  for (const row of historyRows) {
    const year = row.source_label === '2025' ? '2025' : '2026';
    const folderId = year === '2025' ? 'folder-zhct-history-2025' : 'folder-zhct-history-2026';
    const key = `history:${row.source_label}:${row.zip_internal_path}:${row.sha256}`;
    plan.push({
      folderId,
      documentId: stableId('doc', key),
      fileName: `${year}-${path.basename(row.zip_internal_path || row.extracted_path || '未命名资料')}.md`,
      markdown: markdownForHistoryRow(row),
      sourceLabel: row.extracted_path || row.zip_internal_path || key,
      sortOrder: year === '2025' ? order2025++ : order2026++,
      category: `history-${year}`,
    });
  }

  const projectFiles = [
    path.join(projectDir, 'README.md'),
    path.join(projectDir, 'source-docs/procurement-extracted.md'),
    path.join(projectDir, 'source-docs/project-internal-material-index.csv'),
    path.join(projectDir, 'source-docs/selected-history-rag-index.csv'),
    path.join(projectDir, 'response-matrix/requirement-response-matrix.csv'),
    path.join(projectDir, 'response-matrix/evidence-gap-list.csv'),
    path.join(projectDir, 'source-assets/graphic-rich-derived/graphic-rich-bid-prepared-assets.csv'),
    path.join(projectDir, 'source-assets/graphic-rich-selected/graphic-rich-bid-selected-assets.csv'),
  ].filter((file) => fs.existsSync(file));
  projectFiles.forEach((filePath, index) => {
    const { title, markdown } = fileToMarkdownDocument(filePath);
    plan.push({
      folderId: 'folder-zhct-rehab-aids-project',
      documentId: stableId('doc', `project:${filePath}`),
      fileName: `${title}.md`,
      markdown,
      sourceLabel: filePath,
      sortOrder: index,
      category: 'current-project',
    });
  });

  const parameterFiles = walkFiles(parameterLibraryDir)
    .filter((file) => ['.md', '.csv', '.html', '.htm'].includes(path.extname(file).toLowerCase()))
    .sort();
  parameterFiles.forEach((filePath, index) => {
    const { title, markdown } = fileToMarkdownDocument(filePath, '参数库-');
    plan.push({
      folderId: 'folder-zhct-parameter-library',
      documentId: stableId('doc', `parameter:${filePath}`),
      fileName: `${title}.md`,
      markdown,
      sourceLabel: filePath,
      sortOrder: index,
      category: 'parameter-library',
    });
  });

  const assetFiles = walkFiles(path.join(projectDir, 'source-assets'))
    .filter((file) => ['.png', '.jpg', '.jpeg', '.webp', '.pdf'].includes(path.extname(file).toLowerCase()))
    .sort();
  assetFiles.forEach((filePath, index) => {
    const markdown = imageAssetMarkdown(filePath);
    plan.push({
      folderId: 'folder-zhct-rehab-aids-assets',
      documentId: stableId('doc', `asset:${filePath}`),
      fileName: `${path.basename(filePath)}.md`,
      markdown,
      sourceLabel: filePath,
      sortOrder: index,
      category: 'asset',
    });
  });

  const zipOverview = ['2025', '2026'].map((year) => {
    const rows = historyRows.filter((row) => row.source_label === year);
    const extracted = rows.filter((row) => row.knowledge_status === 'extracted').length;
    const metadataOnly = rows.filter((row) => row.knowledge_status === 'metadata_only').length;
    const failed = rows.filter((row) => row.knowledge_status === 'empty_or_failed').length;
    const totalSize = rows.reduce((sum, row) => sum + Number(row.file_size || 0), 0);
    return {
      folderId: year === '2025' ? 'folder-zhct-history-2025' : 'folder-zhct-history-2026',
      documentId: stableId('doc', `zip-overview:${year}`),
      fileName: `${year}-历史压缩包全量导入说明.md`,
      markdown: [
        `# ${year} 历史标书压缩包全量导入说明`,
        '',
        `- 文件总数：${rows.length}`,
        `- 已抽取正文：${extracted}`,
        `- 仅保留元数据/素材索引：${metadataOnly}`,
        `- 空白或抽取失败：${failed}`,
        `- 原始文件总大小：${formatBytes(totalSize)}`,
        '',
        '本文件用于说明该年份历史压缩包已经以“正文知识 + 原始文件索引”的方式导入易标知识库。图片、CAD、投标工具格式和无法抽取正文的扫描件不会伪造成正文，但保留源路径、SHA256、文件大小和压缩包内路径，供后续人工回查。',
      ].join('\n'),
      sourceLabel: `${year} zip overview`,
      sortOrder: year === '2025' ? 100000 : 100000,
      category: `history-${year}`,
    };
  });
  plan.push(...zipOverview);

  return plan;
}

function main() {
  const { db, path: databasePath, close } = createSqliteDatabase(fakeApp);
  const store = createKnowledgeBaseStore({ app: fakeApp, db });
  const baseDir = getKnowledgeBaseDir(fakeApp);
  fs.mkdirSync(baseDir, { recursive: true });

  const folders = [
    { id: 'folder-zhct-rehab-aids-project', name: '称重系统投标项目资料 20260614', sort_order: 0 },
    { id: 'folder-zhct-rehab-aids-assets', name: '称重系统硬件图片/证书/软件截图素材', sort_order: 1 },
    { id: 'folder-zhct-parameter-library', name: '智慧食堂投标参数库与控标资料', sort_order: 2 },
    { id: 'folder-zhct-history-2026', name: '历史标书库 2026 压缩包全量导入', sort_order: 3 },
    { id: 'folder-zhct-history-2025', name: '历史标书库 2025 压缩包全量导入', sort_order: 4 },
  ];
  folders.forEach((folder) => ensureFolder(db, folder));

  const plan = buildImportPlan();
  const imported = [];
  const errors = [];
  plan.forEach((entry, index) => {
    try {
      imported.push(importMarkdownDocument({
        store,
        baseDir,
        folderId: entry.folderId,
        documentId: entry.documentId,
        fileName: entry.fileName,
        markdown: entry.markdown,
        sourceLabel: entry.sourceLabel,
        sortOrder: entry.sortOrder ?? index,
      }));
      if ((index + 1) % 50 === 0) {
        console.log(`imported ${index + 1}/${plan.length}`);
      }
    } catch (error) {
      errors.push({
        document_id: entry.documentId,
        file_name: entry.fileName,
        message: error.message || String(error),
      });
    }
  });

  const counts = {
    folders: db.prepare('SELECT COUNT(*) AS value FROM knowledge_folders').get().value,
    documents: db.prepare('SELECT COUNT(*) AS value FROM knowledge_documents').get().value,
    success_documents: db.prepare("SELECT COUNT(*) AS value FROM knowledge_documents WHERE status = 'success'").get().value,
    items: db.prepare('SELECT COUNT(*) AS value FROM knowledge_items').get().value,
    blocks: db.prepare('SELECT COUNT(*) AS value FROM knowledge_blocks WHERE is_filtered = 0').get().value,
    filtered_blocks: db.prepare('SELECT COUNT(*) AS value FROM knowledge_blocks WHERE is_filtered = 1').get().value,
  };
  const byFolder = db.prepare(`
    SELECT f.name, COUNT(d.document_id) AS documents, COALESCE(SUM(d.item_count), 0) AS items
    FROM knowledge_folders f
    LEFT JOIN knowledge_documents d ON d.folder_id = f.folder_id
    GROUP BY f.folder_id
    ORDER BY f.sort_order ASC
  `).all();

  const report = {
    imported_at: importedAt,
    database_path: databasePath,
    knowledge_base_dir: baseDir,
    planned_documents: plan.length,
    imported_documents: imported.length,
    errors,
    counts,
    by_folder: byFolder,
    source_counts: plan.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] || 0) + 1;
      return acc;
    }, {}),
  };
  const reportJsonPath = path.join(desktopRunDir, 'openbidkit-knowledge-import-report.json');
  const reportMdPath = path.join(desktopRunDir, 'openbidkit-knowledge-import-report.md');
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(reportMdPath, [
    '# OpenBidKit 知识库批量导入报告',
    '',
    `- 导入时间：${importedAt}`,
    `- SQLite：\`${databasePath}\``,
    `- 知识库目录：\`${baseDir}\``,
    `- 计划导入文档：${plan.length}`,
    `- 成功导入文档：${imported.length}`,
    `- 错误数：${errors.length}`,
    `- 当前知识库文档总数：${counts.documents}`,
    `- 当前知识条目总数：${counts.items}`,
    `- 当前有效正文块：${counts.blocks}`,
    `- 当前筛除块：${counts.filtered_blocks}`,
    '',
    '## 按文件夹统计',
    '',
    '| 文件夹 | 文档数 | 知识条目数 |',
    '| --- | ---: | ---: |',
    ...byFolder.map((row) => `| ${row.name} | ${row.documents} | ${row.items} |`),
    '',
    '## 导入范围',
    '',
    '- 2025.zip 和 2026.zip 历史压缩包：已抽取正文的文件导入全文；图片、CAD、投标工具格式、抽取失败文件导入元数据和源路径。',
    '- 当前称重系统采购文件、响应矩阵、项目资料索引、图文素材索引：导入为项目知识。',
    '- 智慧食堂投标参数库：硬件参数、软件功能、企业资质、控标参数、差异化评分模型等导入为知识。',
    '- 硬件设备图片、软件截图、证书/软著/专利、案例照片：导入素材索引并保留绝对路径，用于 Word/PDF 图文生成。',
    '',
    errors.length ? '## 错误\n\n```json\n' + JSON.stringify(errors, null, 2) + '\n```' : '## 错误\n\n无。',
    '',
  ].join('\n'), 'utf-8');

  close();
  console.log(JSON.stringify(report, null, 2));
}

main();
