#!/usr/bin/env node

const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lookup: lookupMimeType } = require('mime-types');
const { createSqliteDatabase } = require('../client/electron/services/sqliteDatabase.cjs');
const { getImageKnowledgeBaseImagesDir, getKnowledgeBaseDir } = require('../client/electron/utils/paths.cjs');

const repoRoot = path.resolve(__dirname, '..');
const userDataDir = process.env.YIBIAO_USER_DATA || path.join(os.homedir(), 'Library/Application Support/yibiao-client');
const workspaceDir = process.env.YIBIAO_WORKSPACE_DIR || path.join(userDataDir, 'workspace');
const outputDir = path.join(repoRoot, 'agent-harness/outputs/company-wedrive-image-kb');
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const importLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
const importedAt = new Date().toISOString();
const certificateDocumentRowsPerIndex = 160;

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

const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const certificateDocumentExtensions = new Set(['.pdf', '.doc', '.docx', '.wps']);
const skippedDirNames = new Set([
  '.git', '.svn', 'node_modules', 'dist', 'build', 'release', 'releases',
  'bin', 'obj', 'packages', '.next', '.vite', 'target', '__pycache__',
]);

const certificatePattern = /证书|资质|软著|软件著作|著作权|认证证书|营业执照|授权书|许可证|ISO|CNAS|CMMI|国产化证书|麒麟.*证书|统信.*证书|信创.*证书|高新|商标|检测报告|信用等级|3A|AAA/i;
const certificateDocumentPattern = /证书|资质|软著|软件著作|著作权|专利|认证|营业执照|授权|许可证|ISO|CNAS|CMMI|国产化|麒麟|统信|信创|高新|商标|检测报告|信用等级|3A|AAA/i;
const productImagePattern = /⭐️标准产品|000宣传素材工具包|产品图片|设备图片|产品图|产品相关资料|康比特智慧餐厅产品相关资料|UI界面及设备图片|PC端和手机端截图|供应商材料|001产品端\/001 智慧营养健康餐厅|001产品端\/006 食品安全监控系统\/009 硬件设备资料库|002研发端\/005设备相关\/001团餐自研外观专利材料/i;
const projectScenePattern = /项目照片|现场照片|施工|培训|验收|会议|正式运行|试运行|安装现场|实施现场|交付现场/i;

fs.mkdirSync(outputDir, { recursive: true });

const fakeApp = {
  yibiaoWorkspaceDir: workspaceDir,
  getVersion: () => 'agent-harness',
  getPath(name) {
    if (name === 'userData') return userDataDir;
    return path.join(userDataDir, name);
  },
  once() {},
};

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function stableHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 24)}`;
}

function createAssetId(contentHash) {
  return `img-${String(contentHash || crypto.randomUUID()).slice(0, 20)}`;
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).trim();
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => normalizeText(tag)).filter(Boolean))].slice(0, 24);
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0B';
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

function safeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function getRelativePath(root, filePath) {
  return normalizeSlash(path.relative(root.root, filePath));
}

function getTopFolders(relativePath, count = 3) {
  return normalizeSlash(relativePath).split('/').filter(Boolean).slice(0, count);
}

function getProductFolder(record) {
  const text = normalizeSlash(`${record.relativePath}/${record.fileName}`);
  const productHints = [
    '营养结算系统',
    '智慧营养健康餐厅',
    'AI智慧营养超级食堂',
    '膳识智能台',
    '智能绑盘终端',
    '智能称重收银机',
    '台式双面收银机',
    '卧式消费机',
    '双屏式消费机',
    '称重结算称',
    '膳食营养分析指导一体机',
    '智慧营养大屏',
    '智能取餐柜',
    '留样',
    '晨检',
  ];
  const hint = productHints.find((item) => text.includes(item));
  if (hint) return hint;
  const parts = getTopFolders(record.relativePath, 4);
  return parts.length ? parts.join(' / ') : record.rootName;
}

function getCertificateFolder(record) {
  const text = normalizeSlash(`${record.relativePath}/${record.fileName}`);
  if (/软著|软件著作|著作权/.test(text)) return '软件著作权';
  if (/专利/.test(text)) return '专利证书';
  if (/ISO|CNAS|CMMI|认证|国产化|麒麟|统信|信创/i.test(text)) return '认证证书';
  if (/营业执照|许可证|信用等级|3A|AAA/.test(text)) return '企业主体资质';
  const parts = getTopFolders(record.relativePath, 3);
  return parts.length ? parts.join(' / ') : '企业资质证书';
}

function classify(record) {
  const text = normalizeSlash(`${record.rootName}/${record.relativePath}/${record.fileName}`);
  if (certificatePattern.test(text)) {
    return {
      category: '企业资质证书',
      folder: getCertificateFolder(record),
      scenario: '投标资信、企业资质、证书扫描件引用',
      tags: ['企业资质证书', '资质扫描管理', record.rootName, getCertificateFolder(record)],
    };
  }
  if (productImagePattern.test(text) && !projectScenePattern.test(text)) {
    return {
      category: '产品图片知识库',
      folder: getProductFolder(record),
      scenario: '产品介绍、技术方案配图、投标图文素材',
      tags: ['产品图片知识库', '图片素材图示', record.rootName, getProductFolder(record)],
    };
  }
  return null;
}

function walkRoot(root) {
  const records = [];
  const certificateDocuments = [];
  if (!fs.existsSync(root.root)) return { records, certificateDocuments };
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
      const relativePath = getRelativePath(root, full);
      const text = normalizeSlash(`${root.name}/${relativePath}/${entry.name}`);
      if (certificateDocumentExtensions.has(ext) && certificateDocumentPattern.test(text)) {
        certificateDocuments.push({
          rootName: root.name,
          path: full,
          relativePath,
          fileName: entry.name,
          extension: ext,
        });
      }
      if (!supportedExtensions.has(ext)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      const record = {
        rootId: root.id,
        rootName: root.name,
        rootPath: root.root,
        path: full,
        relativePath,
        fileName: entry.name,
        extension: ext,
        size: stat.size,
        sizeLabel: formatBytes(stat.size),
        mtime: stat.mtime.toISOString(),
      };
      const placement = classify(record);
      records.push({ ...record, placement });
    }
  }
  records.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  certificateDocuments.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  return { records, certificateDocuments };
}

function collectRecords() {
  const records = [];
  const certificateDocuments = [];
  for (const root of roots) {
    const result = walkRoot(root);
    records.push(...result.records);
    certificateDocuments.push(...result.certificateDocuments);
  }
  const candidates = records.filter((record) => record.placement);
  return {
    records,
    candidates: importLimit > 0 ? candidates.slice(0, importLimit) : candidates,
    allCandidateCount: candidates.length,
    certificateDocuments,
  };
}

function createThumbnailDataUrl(filePath) {
  const output = childProcess.execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  if (!width || !height) throw new Error('图片无法读取或格式不受支持');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-image-thumb-'));
  const thumbnailPath = path.join(tmpDir, `${crypto.randomUUID()}.png`);
  childProcess.execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '320', filePath, '--out', thumbnailPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const thumbnailBuffer = fs.readFileSync(thumbnailPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return {
    width,
    height,
    dataUrl: `data:image/png;base64,${thumbnailBuffer.toString('base64')}`,
  };
}

function insertTags(db, imageId, tags) {
  const timestamp = importedAt;
  const insertTag = db.prepare('INSERT OR IGNORE INTO image_knowledge_tags (tag, created_at) VALUES (@tag, @created_at)');
  const insertRelation = db.prepare('INSERT OR IGNORE INTO image_knowledge_asset_tags (image_id, tag) VALUES (@image_id, @tag)');
  for (const tag of tags) {
    insertTag.run({ tag, created_at: timestamp });
    insertRelation.run({ image_id: imageId, tag });
  }
}

function buildCertificateDocumentMarkdown(chunk, partIndex, totalParts) {
  const lines = [
    `# 企业资质证书非图片文件索引${totalParts > 1 ? `（第 ${partIndex + 1}/${totalParts} 批）` : ''}`,
    '',
    '- 导入目标：OpenBidKit 文档知识库 / 企业资质证书',
    '- 原始来源：企业微信微盘本机同步目录',
    '- 内容范围：证书、资质、软著、专利、授权、认证等非图片文件',
    `- 本批文件数：${chunk.length}`,
    `- 导入时间：${importedAt}`,
    '',
    '## 文件索引',
    '',
    '| 序号 | 来源库 | 文件名 | 类型 | 微盘相对路径 | 本机绝对路径 |',
    '| ---: | --- | --- | --- | --- | --- |',
  ];
  chunk.forEach((record, index) => {
    lines.push([
      `| ${index + 1}`,
      markdownEscape(record.rootName),
      markdownEscape(record.fileName),
      markdownEscape(record.extension),
      `\`${markdownEscape(record.relativePath)}\``,
      `\`${markdownEscape(record.path)}\` |`,
    ].join(' | '));
  });
  lines.push(
    '',
    '## 使用边界',
    '',
    '- 这里保存的是证书类非图片文件索引，原始 PDF/Word/WPS 文件仍以企业微盘本机同步目录为权威来源。',
    '- 正式投标外发前需人工确认授权、有效期、投标主体一致性和客户脱敏要求。',
  );
  return `${lines.join('\n')}\n`;
}

function chunkCertificateItems(fileName, chunk, maxRows = 50) {
  const items = [];
  for (let index = 0; index < chunk.length; index += maxRows) {
    const rows = chunk.slice(index, index + maxRows);
    const lines = [
      `# ${fileName} - 文件组 ${String(items.length + 1).padStart(2, '0')}`,
      '',
      ...rows.map((record, rowIndex) => [
        `${index + rowIndex + 1}. ${record.fileName}`,
        `   - 类型：${record.extension}`,
        `   - 来源库：${record.rootName}`,
        `   - 微盘相对路径：${record.relativePath}`,
        `   - 本机绝对路径：${record.path}`,
      ].join('\n')),
    ];
    const content = lines.join('\n');
    items.push({
      item_id: `K${String(items.length + 1).padStart(5, '0')}`,
      title: `${fileName} - 文件组 ${String(items.length + 1).padStart(2, '0')}`,
      resume: rows.map((record) => record.fileName).join('；').slice(0, 500),
      content,
      source_file: '企业微信微盘证书类文件',
      content_chars: content.length,
      sort_order: items.length,
    });
  }
  return items;
}

function importCertificateDocumentIndexes(db, certificateDocuments) {
  const folderId = 'folder-company-wedrive-enterprise-certificates';
  const folderName = '企业资质证书';
  const baseDir = getKnowledgeBaseDir(fakeApp);
  fs.mkdirSync(baseDir, { recursive: true });
  fs.rmSync(path.join(baseDir, 'folders', folderId), { recursive: true, force: true });
  db.prepare('DELETE FROM knowledge_folders WHERE folder_id = ?').run(folderId);
  db.prepare(`
    INSERT INTO knowledge_folders (folder_id, name, sort_order, created_at, updated_at)
    VALUES (@folder_id, @name, @sort_order, @created_at, @updated_at)
  `).run({
    folder_id: folderId,
    name: folderName,
    sort_order: -2,
    created_at: importedAt,
    updated_at: importedAt,
  });

  const sorted = [...certificateDocuments].sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  const chunks = [];
  for (let index = 0; index < sorted.length; index += certificateDocumentRowsPerIndex) {
    chunks.push(sorted.slice(index, index + certificateDocumentRowsPerIndex));
  }

  const insertDocument = db.prepare(`
    INSERT INTO knowledge_documents (
      document_id, folder_id, file_name, document_dir, source_path, markdown_path, markdown_hash, markdown_chars,
      source_extension, status, progress, message, error, item_count, block_count, filtered_block_count,
      candidate_item_count, discarded_block_count, system_discarded_after_retry_count, last_batch_size,
      parser_label, sort_order, created_at, updated_at
    ) VALUES (
      @document_id, @folder_id, @file_name, @document_dir, @source_path, @markdown_path, @markdown_hash, @markdown_chars,
      @source_extension, @status, @progress, @message, @error, @item_count, @block_count, @filtered_block_count,
      @candidate_item_count, @discarded_block_count, @system_discarded_after_retry_count, @last_batch_size,
      @parser_label, @sort_order, @created_at, @updated_at
    )
  `);
  const insertItem = db.prepare(`
    INSERT INTO knowledge_items (
      document_id, item_id, title, resume, content, source_file, content_chars, sort_order, created_at, updated_at
    ) VALUES (
      @document_id, @item_id, @title, @resume, @content, @source_file, @content_chars, @sort_order, @created_at, @updated_at
    )
  `);

  let itemCount = 0;
  chunks.forEach((chunk, partIndex) => {
    const totalParts = chunks.length;
    const documentId = stableId('doc-wedrive-certificate', `${folderId}:${partIndex}`);
    const fileName = `企业资质证书非图片文件索引 第${String(partIndex + 1).padStart(2, '0')}批.md`;
    const documentDir = path.join('folders', folderId, 'documents', documentId).replace(/\\/g, '/');
    const sourcePath = path.join(documentDir, 'source.md').replace(/\\/g, '/');
    const markdownPath = path.join(documentDir, 'content.md').replace(/\\/g, '/');
    const absoluteDir = path.join(baseDir, documentDir);
    fs.mkdirSync(absoluteDir, { recursive: true });
    const markdown = buildCertificateDocumentMarkdown(chunk, partIndex, totalParts);
    fs.writeFileSync(path.join(baseDir, sourcePath), markdown, 'utf-8');
    fs.writeFileSync(path.join(baseDir, markdownPath), markdown, 'utf-8');
    const items = chunkCertificateItems(fileName, chunk);
    insertDocument.run({
      document_id: documentId,
      folder_id: folderId,
      file_name: fileName,
      document_dir: documentDir,
      source_path: sourcePath,
      markdown_path: markdownPath,
      markdown_hash: crypto.createHash('sha256').update(markdown).digest('hex'),
      markdown_chars: markdown.length,
      source_extension: '.md',
      status: 'success',
      progress: 100,
      message: `已导入 ${chunk.length} 个企业资质证书非图片文件索引`,
      error: null,
      item_count: items.length,
      block_count: 0,
      filtered_block_count: 0,
      candidate_item_count: items.length,
      discarded_block_count: 0,
      system_discarded_after_retry_count: 0,
      last_batch_size: 0,
      parser_label: 'company-wedrive-certificate-index-import',
      sort_order: partIndex,
      created_at: importedAt,
      updated_at: importedAt,
    });
    for (const item of items) {
      insertItem.run({
        document_id: documentId,
        ...item,
        created_at: importedAt,
        updated_at: importedAt,
      });
    }
    itemCount += items.length;
  });

  return {
    folderId,
    folderName,
    documentCount: chunks.length,
    fileCount: sorted.length,
    itemCount,
  };
}

function importRecord(db, imagesDir, record) {
  const buffer = fs.readFileSync(record.path);
  const contentHash = stableHash(buffer);
  const existing = db.prepare('SELECT image_id FROM image_knowledge_assets WHERE content_hash = ?').get(contentHash);
  if (existing) {
    return { imported: false, skipped: true, reason: 'duplicate', imageId: existing.image_id };
  }
  const imageId = createAssetId(contentHash);
  const storedExt = record.extension === '.jpeg' ? '.jpg' : record.extension;
  const storedPath = path.join(imagesDir, `${imageId}${storedExt}`);
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(storedPath, buffer);
  const thumbnail = createThumbnailDataUrl(storedPath);
  const stat = fs.statSync(storedPath);
  const title = path.basename(record.fileName, record.extension);
  const tags = normalizeTags(record.placement.tags);
  db.prepare(`
    INSERT INTO image_knowledge_assets (
      image_id, file_name, title, category, folder, description, source, scenario, tags_json,
      original_path, stored_path, mime_type, size, width, height, content_hash,
      thumbnail_data_url, reference_count, created_at, updated_at
    ) VALUES (
      @image_id, @file_name, @title, @category, @folder, @description, @source, @scenario, @tags_json,
      @original_path, @stored_path, @mime_type, @size, @width, @height, @content_hash,
      @thumbnail_data_url, 0, @created_at, @updated_at
    )
  `).run({
    image_id: imageId,
    file_name: record.fileName,
    title,
    category: record.placement.category,
    folder: record.placement.folder,
    description: `从企业微盘“${record.rootName}”导入。相对路径：${record.relativePath}`,
    source: `企业微盘：${record.rootName}`,
    scenario: record.placement.scenario,
    tags_json: JSON.stringify(tags),
    original_path: record.path,
    stored_path: storedPath,
    mime_type: lookupMimeType(storedPath) || 'image/*',
    size: stat.size,
    width: thumbnail.width,
    height: thumbnail.height,
    content_hash: contentHash,
    thumbnail_data_url: thumbnail.dataUrl,
    created_at: importedAt,
    updated_at: importedAt,
  });
  insertTags(db, imageId, tags);
  return { imported: true, skipped: false, imageId };
}

function summarize(records, certificateDocuments) {
  const summary = {
    generatedAt: importedAt,
    dryRun,
    workspaceDir,
    scannedImages: records.length,
    matchedImages: records.filter((record) => record.placement).length,
    productImageCandidates: records.filter((record) => record.placement?.category === '产品图片知识库').length,
    certificateImageCandidates: records.filter((record) => record.placement?.category === '企业资质证书').length,
    otherImagesSkippedByRule: records.filter((record) => !record.placement).length,
    certificateNonImageDocuments: certificateDocuments.length,
    importLimit,
  };
  return summary;
}

function writeReports(records, candidates, certificateDocuments, summary) {
  const rows = [
    ['root_name', 'category', 'folder', 'extension', 'size', 'mtime', 'relative_path', 'absolute_path'],
    ...candidates.map((record) => [
      record.rootName,
      record.placement.category,
      record.placement.folder,
      record.extension,
      record.size,
      record.mtime,
      record.relativePath,
      record.path,
    ]),
  ];
  fs.writeFileSync(
    path.join(outputDir, 'company-wedrive-image-kb-candidates.csv'),
    rows.map((row) => row.map(safeCsvCell).join(',')).join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(outputDir, 'company-wedrive-image-kb-summary.json'),
    `${JSON.stringify({ ...summary, sampleCertificateDocuments: certificateDocuments.slice(0, 50) }, null, 2)}\n`,
    'utf-8',
  );
}

function main() {
  const collected = collectRecords();
  const summary = summarize(collected.records, collected.certificateDocuments);
  writeReports(collected.records, collected.candidates, collected.certificateDocuments, summary);
  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const database = createSqliteDatabase(fakeApp);
  const db = database.db;
  const imagesDir = getImageKnowledgeBaseImagesDir(fakeApp);
  const databasePath = database.path;
  const backupPath = `${databasePath}.backup-before-company-wedrive-image-import-${importedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(databasePath, backupPath);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${databasePath}${suffix}`)) {
      fs.copyFileSync(`${databasePath}${suffix}`, `${backupPath}${suffix}`);
    }
  }

  let imported = 0;
  let duplicateSkipped = 0;
  let failed = 0;
  const failedItems = [];
  const transaction = db.transaction((items) => {
    for (const record of items) {
      try {
        const result = importRecord(db, imagesDir, record);
        if (result.imported) imported += 1;
        if (result.reason === 'duplicate') duplicateSkipped += 1;
      } catch (error) {
        failed += 1;
        failedItems.push({
          path: record.path,
          category: record.placement.category,
          error: error.message || String(error),
        });
      }
    }
  });
  transaction(collected.candidates);

  const certificateDocumentIndex = importCertificateDocumentIndexes(db, collected.certificateDocuments);
  const byCategory = db.prepare(`
    SELECT category, folder, COUNT(*) AS count
    FROM image_knowledge_assets
    WHERE category IN ('产品图片知识库', '企业资质证书')
    GROUP BY category, folder
    ORDER BY category, folder
  `).all();

  const finalSummary = {
    ...summary,
    databasePath,
    backupPath,
    imagesDir,
    candidatesImportedThisRun: collected.candidates.length,
    imported,
    duplicateSkipped,
    failed,
    failedItems: failedItems.slice(0, 50),
    certificateDocumentIndex,
    byCategory,
  };
  fs.writeFileSync(path.join(outputDir, 'company-wedrive-image-kb-import-summary.json'), `${JSON.stringify(finalSummary, null, 2)}\n`, 'utf-8');
  database.close();
  console.log(JSON.stringify(finalSummary, null, 2));
}

main();
