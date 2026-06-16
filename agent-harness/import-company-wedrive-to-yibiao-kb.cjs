#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const userDataDir = process.env.YIBIAO_USER_DATA || path.join(os.homedir(), 'Library/Application Support/yibiao-client');
const importedAt = new Date().toISOString();
const outputDir = path.join(repoRoot, 'agent-harness/outputs/company-wedrive-yibiao-kb');
const dryRun = process.argv.includes('--dry-run');

const roots = [
  {
    id: 'digital-tech-center',
    name: '数字技术中心知识库',
    root: '/Users/jack/Library/Containers/com.tencent.WeWorkMac/Data/WeDrive/康比特/数字技术中心知识库',
  },
  {
    id: 'project-delivery',
    name: '项目交付管理共享空间',
    root: '/Users/jack/Library/Containers/com.tencent.WeWorkMac/Data/WeDrive/康比特/项目交付管理共享空间',
  },
];

const allowedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.md', '.markdown', '.txt', '.csv', '.tsv', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp',
]);

const textExtensions = new Set(['.md', '.markdown', '.txt', '.csv', '.tsv', '.html', '.htm']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const skippedDirNames = new Set([
  '.git', '.svn', 'node_modules', 'dist', 'build', 'release', 'releases',
  'bin', 'obj', 'packages', '.next', '.vite', 'target', '__pycache__',
]);

const maxInlineTextChars = 12000;
const rowsPerDocument = 320;

fs.mkdirSync(outputDir, { recursive: true });

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
  return `${prefix}-wedrive-${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 24)}`;
}

function safeName(value) {
  return String(value || '未命名')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .trim()
    .slice(0, 180) || '未命名';
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0B';
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function readSmallText(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return '';
    const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return text.slice(0, maxInlineTextChars);
  } catch {
    return '';
  }
}

function walk(root) {
  const output = [];
  if (!fs.existsSync(root.root)) return output;
  const stack = [root.root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirNames.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(ext)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      output.push(toRecord(root, full, stat, ext));
    }
  }
  output.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  return output;
}

function topFolder(relativePath) {
  const parts = normalizeSlash(relativePath).split('/').filter(Boolean);
  return parts[0] || '根目录';
}

function classify(root, filePath, ext) {
  const normalized = normalizeSlash(filePath);
  if (/证书|资质|软著|软件著作|专利|ISO|国产化|新技术|认证|申请材料/.test(normalized)) {
    return '企业资质和证书';
  }
  if (root.id === 'project-delivery') {
    return '项目交付和案例资料';
  }
  if (/投标|招标|标书|控标|报价|参数|采购/.test(normalized)) {
    return '招投标参考资料';
  }
  if (/产品|方案|需求|实施|交付|验收|培训|运维/.test(normalized)) {
    return '产品和交付资料';
  }
  if (imageExtensions.has(ext)) return '图片素材和图示';
  return '数字技术中心资料';
}

function toRecord(root, filePath, stat, ext) {
  const relativePath = path.relative(root.root, filePath);
  const category = classify(root, filePath, ext);
  return {
    root_id: root.id,
    root_name: root.name,
    root_path: root.root,
    path: filePath,
    relative_path: normalizeSlash(relativePath),
    top_folder: topFolder(relativePath),
    category,
    extension: ext || '[no_ext]',
    file_name: path.basename(filePath),
    size: stat.size,
    size_label: formatBytes(stat.size),
    mtime: stat.mtime.toISOString(),
    kind: imageExtensions.has(ext) ? 'image' : textExtensions.has(ext) ? 'text' : 'document',
  };
}

function groupRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const scope = record.root_id === 'project-delivery'
      ? `${record.root_name} / ${record.top_folder}`
      : `${record.root_name} / ${record.category}`;
    const key = `${record.root_id}::${scope}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        root_id: record.root_id,
        title: scope,
        records: [],
      });
    }
    groups.get(key).records.push(record);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function buildDocumentMarkdown(group, chunkRecords, partIndex, totalParts) {
  const totalSize = chunkRecords.reduce((sum, item) => sum + item.size, 0);
  const lines = [
    `# ${group.title}${totalParts > 1 ? `（第 ${partIndex + 1}/${totalParts} 批）` : ''}`,
    '',
    '- 导入目标：OpenBidKit 项目知识库',
    '- 原始来源：企业微信微盘本机同步目录',
    `- 索引范围：${group.title}`,
    `- 本批文件数：${chunkRecords.length}`,
    `- 本批文件体积：${formatBytes(totalSize)}`,
    `- 导入时间：${importedAt}`,
    '',
    '## 文件索引',
    '',
    '| 序号 | 分类 | 文件名 | 类型 | 大小 | 修改时间 | 微盘相对路径 | 本机绝对路径 |',
    '| ---: | --- | --- | --- | ---: | --- | --- | --- |',
  ];
  chunkRecords.forEach((record, index) => {
    lines.push([
      `| ${index + 1}`,
      markdownEscape(record.category),
      markdownEscape(record.file_name),
      markdownEscape(record.extension),
      markdownEscape(record.size_label),
      markdownEscape(record.mtime.slice(0, 19).replace('T', ' ')),
      `\`${markdownEscape(record.relative_path)}\``,
      `\`${markdownEscape(record.path)}\` |`,
    ].join(' | '));
  });

  const textRecords = chunkRecords.filter((record) => textExtensions.has(record.extension)).slice(0, 24);
  if (textRecords.length) {
    lines.push('', '## 轻文本预览', '');
    for (const record of textRecords) {
      const preview = readSmallText(record.path);
      if (!preview.trim()) continue;
      lines.push(
        `### ${record.file_name}`,
        '',
        `- 来源路径：\`${record.path}\``,
        '',
        '```text',
        preview,
        '```',
        '',
      );
    }
  }

  lines.push(
    '',
    '## 使用边界',
    '',
    '- 这里先统一登记企业微盘资料到项目知识库，原始二进制文件仍以企业微信微盘为权威来源。',
    '- PDF、Word、Excel、PPT、图片和扫描件本轮主要作为可检索来源索引；正式投标外发前需人工确认授权、版本、证书有效期和客户脱敏要求。',
    '- 后续接入 WeKnora 本地 RAG 时，可使用这些来源路径做二次全文解析和向量化。',
  );
  return `${lines.join('\n')}\n`;
}

function chunkBlocksIntoItems(fileName, blocks, sourceFile, maxChars = 4200) {
  const items = [];
  let buffer = [];
  let sourceBlockIds = [];
  let chars = 0;
  function flush() {
    const content = buffer.join('\n\n').trim();
    if (!content) return;
    const index = items.length + 1;
    const resume = content.replace(/\s+/g, ' ').slice(0, 500);
    items.push({
      id: `K${String(index).padStart(5, '0')}`,
      title: `${fileName} - 知识片段 ${String(index).padStart(3, '0')}`,
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
      id: 'K00001',
      title: `${fileName} - 文件索引`,
      summary: '企业微盘文件索引。',
      resume: '企业微盘文件索引。',
      content: `${fileName}\n\n原始来源：${sourceFile}`,
      source_file: sourceFile,
      source_block_ids: [],
    });
  }
  return items;
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
    message: '企业微盘索引导入中',
    item_count: 0,
    block_count: 0,
    filtered_block_count: 0,
    candidate_item_count: 0,
    discarded_block_count: 0,
    system_discarded_after_retry_count: 0,
    parser_label: 'company-wedrive-index-import',
    sort_order: sortOrder,
    created_at: importedAt,
    updated_at: importedAt,
  });

  store.updateMarkdownMetadata(documentId, finalMarkdown, 'company-wedrive-index-import');
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
  const finalItems = chunkBlocksIntoItems(document.file_name, keptBlocks, sourceLabel || fileName);
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
  store.saveCandidateItems(documentId, candidateItems, 'company-wedrive-index-import');
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
    message: `已导入企业微盘索引 ${finalItems.length} 条知识片段`,
    error: null,
    item_count: finalItems.length,
    candidate_item_count: candidateItems.length,
    block_count: keptBlocks.length,
    filtered_block_count: filteredBlocks.length,
    parser_label: 'company-wedrive-index-import',
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

function writeManifest(records) {
  const manifestPath = path.join(outputDir, 'company-wedrive-yibiao-kb-manifest.csv');
  const header = ['root_name', 'category', 'kind', 'extension', 'size', 'mtime', 'relative_path', 'path'];
  const lines = [
    header.join(','),
    ...records.map((record) => header.map((key) => {
      const value = String(record[key] ?? '').replace(/"/g, '""');
      return `"${value}"`;
    }).join(',')),
  ];
  fs.writeFileSync(manifestPath, `${lines.join('\n')}\n`, 'utf-8');
  return manifestPath;
}

function main() {
  const records = roots.flatMap(walk);
  const manifestPath = writeManifest(records);
  const extCounts = {};
  const categoryCounts = {};
  const rootCounts = {};
  for (const record of records) {
    extCounts[record.extension] = (extCounts[record.extension] || 0) + 1;
    categoryCounts[record.category] = (categoryCounts[record.category] || 0) + 1;
    rootCounts[record.root_name] = (rootCounts[record.root_name] || 0) + 1;
  }

  const groups = groupRecords(records);
  const plan = [];
  for (const group of groups) {
    const totalParts = Math.max(1, Math.ceil(group.records.length / rowsPerDocument));
    for (let partIndex = 0; partIndex < totalParts; partIndex += 1) {
      const chunkRecords = group.records.slice(partIndex * rowsPerDocument, (partIndex + 1) * rowsPerDocument);
      const title = `${group.title}${totalParts > 1 ? ` 第${String(partIndex + 1).padStart(2, '0')}批` : ''}`;
      plan.push({
        group,
        chunkRecords,
        partIndex,
        totalParts,
        title,
        documentId: stableId('doc', `company-wedrive:${group.key}:${partIndex}`),
      });
    }
  }

  const summary = {
    dryRun,
    importedAt,
    roots,
    records: records.length,
    totalBytes: records.reduce((sum, item) => sum + item.size, 0),
    totalBytesLabel: formatBytes(records.reduce((sum, item) => sum + item.size, 0)),
    documentsPlanned: plan.length,
    rowsPerDocument,
    extCounts,
    categoryCounts,
    rootCounts,
    manifestPath,
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const sqliteDatabase = createSqliteDatabase(fakeApp);
  const db = sqliteDatabase.db;
  const store = createKnowledgeBaseStore({ app: fakeApp, db });
  const baseDir = getKnowledgeBaseDir(fakeApp);
  const folder = {
    id: 'folder-company-wedrive-unified',
    name: '企业微盘统一资料索引',
    sort_order: 900,
  };
  ensureFolder(db, folder);

  const imported = [];
  db.transaction(() => {
    plan.forEach((entry, index) => {
      const markdown = buildDocumentMarkdown(entry.group, entry.chunkRecords, entry.partIndex, entry.totalParts);
      imported.push(importMarkdownDocument({
        store,
        baseDir,
        folderId: folder.id,
        documentId: entry.documentId,
        fileName: `${entry.title}.md`,
        markdown,
        sourceLabel: entry.group.title,
        sortOrder: index,
      }));
    });
  })();

  summary.documentsImported = imported.length;
  summary.itemsImported = imported.reduce((sum, item) => sum + item.item_count, 0);
  summary.blocksImported = imported.reduce((sum, item) => sum + item.block_count, 0);
  summary.folderId = folder.id;
  summary.folderName = folder.name;

  const summaryPath = path.join(outputDir, 'company-wedrive-yibiao-kb-import-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
  sqliteDatabase.close();
}

main();
