const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { dialog, nativeImage } = require('electron');
const { lookup: lookupMimeType } = require('mime-types');
const { getImageKnowledgeBaseImagesDir } = require('../utils/paths.cjs');

const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const supportedArchiveExtensions = new Set(['.zip']);
const historicalArchiveSections = new Set(['图片素材图示', '资质扫描管理']);

function now() {
  return new Date().toISOString();
}

function stableHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).trim();
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || '').split(/[，,\s]+/);
  return [...new Set(values.map((tag) => String(tag || '').trim()).filter(Boolean))].slice(0, 24);
}

function createAssetId(contentHash) {
  return `img-${String(contentHash || crypto.randomUUID()).slice(0, 20)}`;
}

function createThumbnailDataUrl(filePath) {
  const image = nativeImage.createFromPath(filePath);
  if (!image || image.isEmpty()) {
    throw new Error('图片无法读取或格式不受支持');
  }
  const size = image.getSize();
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(size.width || maxSide, size.height || maxSide));
  const thumbnail = scale < 1
    ? image.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    })
    : image;
  return {
    width: size.width || 0,
    height: size.height || 0,
    dataUrl: thumbnail.toDataURL(),
  };
}

function rowToAsset(row) {
  return {
    id: row.image_id,
    fileName: row.file_name,
    title: row.title || row.file_name,
    category: row.category || '',
    folder: row.folder || '',
    description: row.description || '',
    source: row.source || '',
    scenario: row.scenario || '',
    tags: safeJsonParse(row.tags_json, []),
    mimeType: row.mime_type || '',
    size: Number(row.size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    contentHash: row.content_hash || '',
    thumbnailDataUrl: row.thumbnail_data_url || '',
    referenceCount: Number(row.reference_count || 0),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function rowToReference(row) {
  return {
    id: row.reference_id,
    imageId: row.image_id,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at || '',
  };
}

function createAssetUrl(storedPath) {
  const fileName = path.basename(String(storedPath || ''));
  if (!fileName) return '';
  return `yibiao-asset://image-knowledge-base/${encodeURIComponent(fileName)}`;
}

function buildMarkdownReference(asset) {
  const title = normalizeText(asset.title, asset.file_name || '图片素材');
  const assetUrl = createAssetUrl(asset.stored_path);
  if (!assetUrl) {
    throw new Error('图片素材文件路径无效');
  }

  const description = normalizeText(asset.description || asset.scenario || asset.source);
  return [
    `![${title}](${assetUrl})`,
    description ? `*图：${title}，${description}*` : `*图：${title}*`,
  ].join('\n\n');
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

function createSearchTerms(values) {
  const domainTerms = [
    '资质', '证书', '荣誉', '授权', '案例', '现场', '照片', '机房', '部署', '拓扑',
    '网络', '设备', '服务器', '机柜', '电池', '监控', '平台', '架构', '流程',
    '施工', '运维', '数据', '安全', '团队', '产品', '系统', '方案', '示意',
    '平面', '结构',
  ];
  const terms = new Set();
  for (const value of values) {
    const text = normalizeSearchText(value);
    if (!text) continue;
    for (const part of text.split(/[\s,，。；;：:、/\\|()[\]{}<>《》“”"'!?！？\r\n]+/)) {
      const item = part.trim();
      if (item.length >= 2 && item.length <= 24 && !['示意图', '图片', '配图'].includes(item)) {
        terms.add(item);
      }
    }
    for (const term of domainTerms) {
      if (text.includes(term)) {
        terms.add(term);
      }
    }
  }
  return [...terms].slice(0, 48);
}

function scoreAutoReferenceAsset(row, payload = {}) {
  const tags = safeJsonParse(row.tags_json, []);
  const title = normalizeSearchText(row.title || row.file_name);
  const category = normalizeSearchText(row.category);
  const folder = normalizeSearchText(row.folder);
  const tagText = normalizeSearchText(tags.join(' '));
  const bodyText = normalizeSearchText([
    row.file_name,
    row.title,
    row.category,
    row.folder,
    row.description,
    row.source,
    row.scenario,
    tags.join(' '),
  ].join('\n'));
  const queryTitle = normalizeSearchText(payload.title);
  const queryPrompt = normalizeSearchText(payload.prompt);
  const terms = createSearchTerms([
    payload.title,
    payload.prompt,
    payload.content,
    ...(Array.isArray(payload.keywords) ? payload.keywords : []),
  ]);

  let score = 0;
  if (queryTitle && title && (queryTitle.includes(title) || title.includes(queryTitle))) {
    score += 12;
  }
  if (title && queryPrompt && queryPrompt.includes(title)) {
    score += 8;
  }
  for (const term of terms) {
    if (!term) continue;
    if (title === term) {
      score += 6;
    } else if (title.includes(term)) {
      score += 4;
    }
    if (category === term || folder === term || tagText.split(/\s+/).includes(term)) {
      score += 4;
    } else if (category.includes(term) || folder.includes(term) || tagText.includes(term)) {
      score += 3;
    }
    if (bodyText.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function createImageKnowledgeBaseStore({ app, db }) {
  const imagesDir = getImageKnowledgeBaseImagesDir(app);

  function list(query = {}) {
    const keyword = normalizeText(query.keyword).toLowerCase();
    const category = normalizeText(query.category);
    const folder = normalizeText(query.folder);
    const tag = normalizeText(query.tag);
    const rows = db.prepare('SELECT * FROM image_knowledge_assets ORDER BY updated_at DESC, created_at DESC').all();
    const assets = rows.map(rowToAsset).filter((asset) => {
      if (category && asset.category !== category) return false;
      if (folder && asset.folder !== folder) return false;
      if (tag && !asset.tags.includes(tag)) return false;
      if (!keyword) return true;
      return [
        asset.fileName,
        asset.title,
        asset.category,
        asset.folder,
        asset.description,
        asset.source,
        asset.scenario,
        asset.tags.join(' '),
      ].join('\n').toLowerCase().includes(keyword);
    });
    const allAssets = rows.map(rowToAsset);
    return {
      assets,
      categories: [...new Set(allAssets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      folders: [...new Set(allAssets.map((asset) => asset.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      tags: [...new Set(allAssets.flatMap((asset) => asset.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    };
  }

  function saveTags(imageId, tags) {
    db.prepare('DELETE FROM image_knowledge_asset_tags WHERE image_id = ?').run(imageId);
    const insertTag = db.prepare('INSERT OR IGNORE INTO image_knowledge_tags (tag, created_at) VALUES (@tag, @created_at)');
    const insertRelation = db.prepare('INSERT OR IGNORE INTO image_knowledge_asset_tags (image_id, tag) VALUES (@image_id, @tag)');
    const timestamp = now();
    for (const tag of tags) {
      insertTag.run({ tag, created_at: timestamp });
      insertRelation.run({ image_id: imageId, tag });
    }
  }

  function importImageBuffer(input) {
    const ext = path.extname(input.fileName).toLowerCase();
    if (!supportedExtensions.has(ext)) {
      return { imported: false, skipped: true };
    }
    const buffer = input.buffer;
    const contentHash = stableHash(buffer);
    const existing = db.prepare('SELECT image_id FROM image_knowledge_assets WHERE content_hash = ?').get(contentHash);
    if (existing) {
      return { imported: false, skipped: true };
    }
    const imageId = createAssetId(contentHash);
    const fileName = path.basename(input.fileName);
    const storedFileName = `${imageId}${ext === '.jpeg' ? '.jpg' : ext}`;
    const storedPath = path.join(imagesDir, storedFileName);
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(storedPath, buffer);
    const thumbnail = createThumbnailDataUrl(storedPath);
    const stat = fs.statSync(storedPath);
    const timestamp = now();
    const tags = normalizeTags(input.tags);
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
      file_name: fileName,
      title: normalizeText(input.title, path.basename(fileName, ext)),
      category: normalizeText(input.category, '未分类'),
      folder: normalizeText(input.folder),
      description: normalizeText(input.description),
      source: normalizeText(input.source),
      scenario: normalizeText(input.scenario),
      tags_json: JSON.stringify(tags),
      original_path: normalizeText(input.originalPath, fileName),
      stored_path: storedPath,
      mime_type: lookupMimeType(storedPath) || 'image/*',
      size: stat.size,
      width: thumbnail.width,
      height: thumbnail.height,
      content_hash: contentHash,
      thumbnail_data_url: thumbnail.dataUrl,
      created_at: timestamp,
      updated_at: timestamp,
    });
    return { imported: true, skipped: false };
  }

  function importOne(filePath) {
    return importImageBuffer({
      fileName: path.basename(filePath),
      originalPath: filePath,
      buffer: fs.readFileSync(filePath),
      category: '未分类',
      tags: [],
    });
  }

  async function uploadImages() {
    const result = await dialog.showOpenDialog({
      title: '选择图片素材',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图片素材', extensions: [...supportedExtensions].map((item) => item.slice(1)) },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) {
      return { ...list(), imported: 0, skipped: 0, message: '已取消选择' };
    }
    let imported = 0;
    let skipped = 0;
    for (const filePath of result.filePaths) {
      try {
        const item = importOne(filePath);
        if (item.imported) imported += 1;
        if (item.skipped) skipped += 1;
      } catch (error) {
        console.warn('[image-knowledge-base] 图片导入失败', { file: path.basename(filePath), message: error.message || String(error) });
        skipped += 1;
      }
    }
    return {
      ...list(),
      imported,
      skipped,
      message: imported ? `已导入 ${imported} 张图片${skipped ? `，跳过 ${skipped} 张` : ''}` : '未导入新图片',
    };
  }

  function deriveArchiveEntryMetadata(archivePath, entryName, section) {
    const archiveName = path.basename(archivePath);
    const archiveTitle = path.basename(archiveName, path.extname(archiveName));
    const normalizedEntryName = String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const entryDir = path.posix.dirname(normalizedEntryName);
    const folderParts = [archiveTitle];
    if (entryDir && entryDir !== '.') {
      folderParts.push(entryDir);
    }
    const entryTitle = path.basename(normalizedEntryName, path.extname(normalizedEntryName));
    return {
      fileName: path.basename(normalizedEntryName),
      title: entryTitle,
      originalPath: `${archivePath}::${normalizedEntryName}`,
      category: section,
      folder: folderParts.join(' / '),
      source: `历史压缩包：${archiveName}`,
      scenario: section,
      description: `从历史压缩包“${archiveName}”中的“${normalizedEntryName}”导入。`,
      tags: [section, archiveTitle, ...entryDir.split('/').filter((part) => part && part !== '.')],
    };
  }

  function importArchive(archivePath, section) {
    const ext = path.extname(archivePath).toLowerCase();
    if (!supportedArchiveExtensions.has(ext)) {
      return { imported: 0, skipped: 1 };
    }
    const zip = new AdmZip(archivePath);
    let imported = 0;
    let skipped = 0;
    for (const entry of zip.getEntries()) {
      const entryName = String(entry.entryName || '');
      const entryExt = path.extname(entryName).toLowerCase();
      if (entry.isDirectory || !supportedExtensions.has(entryExt)) {
        skipped += 1;
        continue;
      }
      try {
        const item = importImageBuffer({
          ...deriveArchiveEntryMetadata(archivePath, entryName, section),
          buffer: entry.getData(),
        });
        if (item.imported) imported += 1;
        if (item.skipped) skipped += 1;
      } catch (error) {
        console.warn('[image-knowledge-base] 历史压缩包图片导入失败', {
          archive: path.basename(archivePath),
          entry: entryName,
          message: error.message || String(error),
        });
        skipped += 1;
      }
    }
    return { imported, skipped };
  }

  async function importHistoricalArchives(sectionInput) {
    const section = normalizeText(sectionInput);
    if (!historicalArchiveSections.has(section)) {
      throw new Error('未知历史素材部分');
    }
    const result = await dialog.showOpenDialog({
      title: `选择${section}历史压缩包`,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '历史压缩包', extensions: [...supportedArchiveExtensions].map((item) => item.slice(1)) },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) {
      return { ...list(), imported: 0, skipped: 0, archives: 0, message: '已取消选择' };
    }
    let imported = 0;
    let skipped = 0;
    let archives = 0;
    for (const archivePath of result.filePaths) {
      try {
        const item = importArchive(archivePath, section);
        imported += item.imported;
        skipped += item.skipped;
        archives += 1;
      } catch (error) {
        console.warn('[image-knowledge-base] 历史压缩包导入失败', { archive: path.basename(archivePath), message: error.message || String(error) });
        skipped += 1;
      }
    }
    return {
      ...list(),
      imported,
      skipped,
      archives,
      message: imported ? `已导入 ${imported} 张${section}图片${skipped ? `，跳过 ${skipped} 项` : ''}` : `未导入新的${section}图片`,
    };
  }

  function updateAsset(id, patch) {
    const imageId = normalizeText(id);
    if (!imageId) throw new Error('图片 ID 不能为空');
    const existing = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
    if (!existing) throw new Error('图片素材不存在');
    const tags = patch?.tags === undefined ? safeJsonParse(existing.tags_json, []) : normalizeTags(patch.tags);
    db.prepare(`
      UPDATE image_knowledge_assets
      SET title = @title,
          category = @category,
          folder = @folder,
          description = @description,
          source = @source,
          scenario = @scenario,
          tags_json = @tags_json,
          updated_at = @updated_at
      WHERE image_id = @image_id
    `).run({
      image_id: imageId,
      title: patch?.title === undefined ? existing.title : normalizeText(patch.title, existing.file_name),
      category: patch?.category === undefined ? existing.category : normalizeText(patch.category, '未分类'),
      folder: patch?.folder === undefined ? existing.folder : normalizeText(patch.folder),
      description: patch?.description === undefined ? existing.description : normalizeText(patch.description),
      source: patch?.source === undefined ? existing.source : normalizeText(patch.source),
      scenario: patch?.scenario === undefined ? existing.scenario : normalizeText(patch.scenario),
      tags_json: JSON.stringify(tags),
      updated_at: now(),
    });
    saveTags(imageId, tags);
    return list();
  }

  function normalizeAssetIds(ids) {
    return [...new Set((Array.isArray(ids) ? ids : []).map((id) => normalizeText(id)).filter(Boolean))];
  }

  function getOutlineReferences(imageIdsInput = []) {
    const imageIds = normalizeAssetIds(imageIdsInput);
    if (!imageIds.length) return { items: [] };
    const seen = new Set();
    const items = [];
    for (const imageId of imageIds) {
      if (seen.has(imageId)) continue;
      seen.add(imageId);
      const row = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
      if (!row) continue;
      const tags = safeJsonParse(row.tags_json, []);
      const title = normalizeText(row.title || row.file_name, '图片素材');
      const resume = [
        row.category ? `分类：${row.category}` : '',
        row.folder ? `文件夹：${row.folder}` : '',
        row.description ? `说明：${row.description}` : '',
        row.scenario ? `适用场景：${row.scenario}` : '',
        row.source ? `来源：${row.source}` : '',
        tags.length ? `标签：${tags.join('、')}` : '',
      ].filter(Boolean).join('；');
      items.push({
        id: `image::${imageId}`,
        title: `图片素材：${title}`,
        resume: resume || `图片文件：${row.file_name || imageId}`,
      });
    }
    return { items };
  }

  function batchUpdateAssets(payload = {}) {
    const ids = normalizeAssetIds(payload.ids);
    if (!ids.length) throw new Error('请先选择图片素材');
    const patch = payload.patch || {};
    const timestamp = now();
    let affected = 0;
    const update = db.prepare(`
      UPDATE image_knowledge_assets
      SET category = @category,
          folder = @folder,
          tags_json = @tags_json,
          updated_at = @updated_at
      WHERE image_id = @image_id
    `);
    const transaction = db.transaction((items) => {
      for (const imageId of items) {
        const existing = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
        if (!existing) continue;
        const existingTags = safeJsonParse(existing.tags_json, []);
        const nextTags = patch.tags === undefined
          ? existingTags
          : normalizeTags(payload.appendTags ? [...existingTags, ...normalizeTags(patch.tags)] : patch.tags);
        update.run({
          image_id: imageId,
          category: patch.category === undefined ? existing.category : normalizeText(patch.category, '未分类'),
          folder: patch.folder === undefined ? existing.folder : normalizeText(patch.folder),
          tags_json: JSON.stringify(nextTags),
          updated_at: timestamp,
        });
        saveTags(imageId, nextTags);
        affected += 1;
      }
    });
    transaction(ids);
    return {
      ...list(),
      affected,
      message: affected ? `已批量更新 ${affected} 张图片` : '未找到可更新的图片素材',
    };
  }

  function updateAssetTagsOnly(imageId, tags, timestamp) {
    db.prepare(`
      UPDATE image_knowledge_assets
      SET tags_json = @tags_json,
          updated_at = @updated_at
      WHERE image_id = @image_id
    `).run({
      image_id: imageId,
      tags_json: JSON.stringify(tags),
      updated_at: timestamp,
    });
    saveTags(imageId, tags);
  }

  function renameTag(oldTagInput, newTagInput) {
    const oldTag = normalizeText(oldTagInput);
    const newTag = normalizeText(newTagInput);
    if (!oldTag) throw new Error('请选择要重命名的标签');
    if (!newTag) throw new Error('请填写新的标签名称');
    if (oldTag === newTag) {
      return { ...list(), affected: 0, message: '标签名称未变化' };
    }
    const timestamp = now();
    const rows = db.prepare('SELECT * FROM image_knowledge_assets ORDER BY updated_at DESC, created_at DESC').all();
    let affected = 0;
    const transaction = db.transaction((items) => {
      for (const row of items) {
        const tags = safeJsonParse(row.tags_json, []);
        if (!tags.includes(oldTag)) continue;
        const nextTags = normalizeTags(tags.map((tag) => tag === oldTag ? newTag : tag));
        updateAssetTagsOnly(row.image_id, nextTags, timestamp);
        affected += 1;
      }
      db.prepare('DELETE FROM image_knowledge_tags WHERE tag = ?').run(oldTag);
    });
    transaction(rows);
    return {
      ...list(),
      affected,
      message: affected ? `已将 ${affected} 张图片的标签“${oldTag}”重命名为“${newTag}”` : '未找到使用该标签的图片素材',
    };
  }

  function deleteTag(tagInput) {
    const tag = normalizeText(tagInput);
    if (!tag) throw new Error('请选择要删除的标签');
    const timestamp = now();
    const rows = db.prepare('SELECT * FROM image_knowledge_assets ORDER BY updated_at DESC, created_at DESC').all();
    let affected = 0;
    const transaction = db.transaction((items) => {
      for (const row of items) {
        const tags = safeJsonParse(row.tags_json, []);
        if (!tags.includes(tag)) continue;
        const nextTags = tags.filter((item) => item !== tag);
        updateAssetTagsOnly(row.image_id, nextTags, timestamp);
        affected += 1;
      }
      db.prepare('DELETE FROM image_knowledge_tags WHERE tag = ?').run(tag);
    });
    transaction(rows);
    return {
      ...list(),
      affected,
      message: affected ? `已从 ${affected} 张图片中删除标签“${tag}”` : '未找到使用该标签的图片素材',
    };
  }

  function deleteExistingAsset(existing) {
    if (existing.stored_path && fs.existsSync(existing.stored_path)) {
      fs.unlinkSync(existing.stored_path);
    }
    db.prepare('DELETE FROM image_knowledge_asset_tags WHERE image_id = ?').run(existing.image_id);
    db.prepare('DELETE FROM image_knowledge_references WHERE image_id = ?').run(existing.image_id);
    db.prepare('DELETE FROM image_knowledge_assets WHERE image_id = ?').run(existing.image_id);
  }

  function deleteAsset(id) {
    const imageId = normalizeText(id);
    if (!imageId) throw new Error('图片 ID 不能为空');
    const existing = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
    if (!existing) throw new Error('图片素材不存在');
    deleteExistingAsset(existing);
    return list();
  }

  function batchDeleteAssets(idsInput) {
    const ids = normalizeAssetIds(idsInput);
    if (!ids.length) throw new Error('请先选择图片素材');
    let affected = 0;
    const transaction = db.transaction((items) => {
      for (const imageId of items) {
        const existing = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
        if (!existing) continue;
        deleteExistingAsset(existing);
        affected += 1;
      }
    });
    transaction(ids);
    return {
      ...list(),
      affected,
      message: affected ? `已删除 ${affected} 张图片素材` : '未找到可删除的图片素材',
    };
  }

  function createMarkdownReferenceForAsset(existing, payload = {}) {
    const imageId = normalizeText(payload.imageId);
    const targetType = normalizeText(payload.targetType, 'technical-plan');
    const targetId = normalizeText(payload.targetId);
    if (!targetId) throw new Error('引用目标不能为空');

    const timestamp = now();
    const referenceId = `ref-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO image_knowledge_references (reference_id, image_id, target_type, target_id, created_at)
      VALUES (@reference_id, @image_id, @target_type, @target_id, @created_at)
    `).run({
      reference_id: referenceId,
      image_id: imageId,
      target_type: targetType,
      target_id: targetId,
      created_at: timestamp,
    });
    db.prepare(`
      UPDATE image_knowledge_assets
      SET reference_count = reference_count + 1,
          updated_at = @updated_at
      WHERE image_id = @image_id
    `).run({ image_id: imageId, updated_at: timestamp });

    return {
      reference: {
        id: referenceId,
        imageId,
        targetType,
        targetId,
        createdAt: timestamp,
      },
      markdown: buildMarkdownReference(existing),
      state: list(),
    };
  }

  function createMarkdownReference(payload = {}) {
    const imageId = normalizeText(payload.imageId);
    if (!imageId) throw new Error('图片 ID 不能为空');

    const existing = db.prepare('SELECT * FROM image_knowledge_assets WHERE image_id = ?').get(imageId);
    if (!existing) throw new Error('图片素材不存在');

    return createMarkdownReferenceForAsset(existing, payload);
  }

  function createAutoMarkdownReference(payload = {}) {
    const targetType = normalizeText(payload.targetType, 'technical-plan');
    const targetId = normalizeText(payload.targetId);
    if (!targetId) throw new Error('引用目标不能为空');

    const requestedIds = normalizeAssetIds(payload.imageIds || payload.image_ids || payload.assetIds || payload.asset_ids);
    const requestedIdSet = new Set(requestedIds);
    const rows = db.prepare('SELECT * FROM image_knowledge_assets ORDER BY updated_at DESC, created_at DESC').all()
      .filter((row) => !requestedIdSet.size || requestedIdSet.has(row.image_id));
    const minScore = Math.max(1, Math.round(Number(payload.minScore ?? payload.min_score) || 4));
    const candidates = rows
      .map((row) => ({ row, score: scoreAutoReferenceAsset(row, payload) }))
      .filter((item) => item.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const refDelta = Number(a.row.reference_count || 0) - Number(b.row.reference_count || 0);
        if (refDelta !== 0) return refDelta;
        return String(b.row.updated_at || b.row.created_at || '').localeCompare(String(a.row.updated_at || a.row.created_at || ''));
      });

    if (!candidates.length) {
      return { matched: false, markdown: '', asset: null, score: 0 };
    }

    const best = candidates[0];
    const result = createMarkdownReferenceForAsset(best.row, {
      ...payload,
      imageId: best.row.image_id,
      targetType,
      targetId,
    });
    return {
      ...result,
      matched: true,
      asset: rowToAsset(best.row),
      score: best.score,
    };
  }

  function listReferences(imageId) {
    const normalizedImageId = normalizeText(imageId);
    if (!normalizedImageId) throw new Error('图片 ID 不能为空');
    return db.prepare(`
      SELECT * FROM image_knowledge_references
      WHERE image_id = ?
      ORDER BY created_at DESC
    `).all(normalizedImageId).map(rowToReference);
  }

  return {
    list,
    uploadImages,
    importHistoricalArchives,
    updateAsset,
    batchUpdateAssets,
    renameTag,
    deleteTag,
    deleteAsset,
    batchDeleteAssets,
    createMarkdownReference,
    createAutoMarkdownReference,
    getOutlineReferences,
    listReferences,
  };
}

module.exports = {
  buildMarkdownReference,
  scoreAutoReferenceAsset,
  createImageKnowledgeBaseStore,
};
