const fs = require('node:fs');
const path = require('node:path');
const { dialog: electronDialog } = require('electron');
const {
  createBidDocumentSample,
  getBidDocumentProjectConfigSchema,
  getBidDocumentTemplateInfo,
  getBidDocumentTemplates,
} = require('./bidDocumentTemplates.cjs');
const { validateBidDocumentProject } = require('./bidDocumentValidation.cjs');
const { writeBidDocumentWordFile } = require('./bidDocumentWordBuilder.cjs');
const {
  analyzeBidReferenceDocument,
  compareBidReferenceAnalyses,
} = require('./bidDocumentReferenceAnalyzer.cjs');
const {
  applyDemoAssetPackageGuard,
  applyQuoteResolutionToProject,
  buildReadinessReportExcelBuffer,
  createReadinessReport,
  readAssetCollectionPackage,
  renderReadinessReportMarkdown,
  writeAssetCollectionPackage,
} = require('./bidDocumentReadinessReport.cjs');
const { assetSelectionFiltersForType } = require('./bidDocumentAssets.cjs');
const {
  readBidDocumentProjectConfig,
  resolveProjectConfigAssetMap,
} = require('./bidDocumentProjectConfig.cjs');

function mergeSample(payload = {}) {
  const sample = createBidDocumentSample({
    templateId: payload.template?.id || payload.projectData?.templateId || payload.templateId,
    template: payload.template,
    projectData: payload.projectData,
    quoteItems: payload.quoteItems,
    assetMap: payload.assetMap,
  });
  return {
    template: payload.template || sample.template,
    projectData: payload.projectData || sample.projectData,
    quoteItems: payload.quoteItems || sample.quoteItems,
    assetMap: payload.assetMap || sample.assetMap,
    assetPackage: payload.assetPackage || null,
  };
}

function nowIso() {
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

function defaultOutputPath(app, projectData) {
  const fileName = `${projectData.projectName || '完整标书'}-${Date.now()}.docx`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return path.join(app.getPath('documents'), fileName);
}

function defaultTemplateInfoOutputPath(app, templateId) {
  const fileName = `完整标书模板配置-${templateId || 'all'}-${Date.now()}.json`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return path.join(app.getPath('documents'), fileName);
}

function defaultProjectConfigOutputPath(app, projectData) {
  const fileName = `完整标书项目配置-${projectData.projectName || '未命名项目'}-${Date.now()}.json`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return path.join(app.getPath('documents'), fileName);
}

function defaultReadinessReportOutputPath(app, projectData) {
  const fileName = `完整标书准备度报告-${projectData.projectName || '未命名项目'}-${Date.now()}.md`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return path.join(app.getPath('documents'), fileName);
}

function defaultAssetCollectionOutputPath(app, projectData) {
  const fileName = `完整标书材料收集包-${projectData.projectName || '未命名项目'}-${Date.now()}`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return path.join(app.getPath('documents'), fileName);
}

function sanitizePathSegment(value, fallback = 'asset') {
  const normalized = String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return normalized || fallback;
}

function isRelativePath(filePath) {
  const text = String(filePath || '').trim();
  return Boolean(text && !path.isAbsolute(text));
}

function normalizePortablePath(filePath) {
  return `./${String(filePath).replace(/\\/g, '/')}`;
}

function createPortableAssetMap(assetMap = {}, configPath = '') {
  const configDir = path.dirname(path.resolve(configPath));
  const configBaseName = path.basename(configPath, path.extname(configPath)) || 'project-config';
  const assetDirName = `${configBaseName}.assets`;
  const assetDir = path.join(configDir, assetDirName);
  const copiedAssets = [];

  const nextAssetMap = Object.fromEntries(Object.entries(assetMap || {}).map(([key, asset]) => {
    const sourcePath = String(asset?.filePath || '').trim();
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return [key, asset];
    }

    fs.mkdirSync(assetDir, { recursive: true });
    const extension = path.extname(sourcePath) || '.bin';
    const targetName = `${sanitizePathSegment(key)}${extension}`;
    const targetPath = path.join(assetDir, targetName);
    if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    const relativePath = path.join(assetDirName, targetName);
    copiedAssets.push({
      key,
      title: asset.title || key,
      filePath: normalizePortablePath(relativePath),
    });
    return [key, {
      ...asset,
      filePath: normalizePortablePath(relativePath),
      originalFileName: path.basename(sourcePath),
    }];
  }));

  return {
    assetMap: nextAssetMap,
    assetPackage: {
      type: 'sidecar-directory',
      path: normalizePortablePath(assetDirName),
      copiedCount: copiedAssets.length,
      assets: copiedAssets,
    },
  };
}

function toProjectConfig(input, options = {}) {
  return {
    version: 1,
    exportedAt: nowIso(),
    templateId: input.template.id,
    projectData: input.projectData,
    quoteItems: input.quoteItems,
    assetMap: options.assetMap || input.assetMap,
    assetPackage: options.assetPackage,
  };
}

function projectConfigSchemaPathFor(configPath) {
  const extension = path.extname(configPath) || '.json';
  return path.join(path.dirname(configPath), `${path.basename(configPath, extension)}.schema.json`);
}

function readProjectConfig(filePath) {
  return readBidDocumentProjectConfig(filePath);
}

function templateErrorResult(error, fallbackMessage) {
  if (error?.code !== 'unknown_template_id') throw error;
  return {
    success: false,
    message: fallbackMessage || `完整标书模板不存在：${error.templateId}`,
    error: error.code,
    templateId: error.templateId,
    availableTemplateIds: error.availableTemplateIds || [],
  };
}

const BID_DOCUMENT_BUILD_LOG_CHECK_KEYS = [
  'templateCheck',
  'quoteCheck',
  'paymentCheck',
  'titleCheck',
  'identityCheck',
  'forbiddenWordsCheck',
  'assetCheck',
  'sectionSelectionCheck',
  'sectionCheck',
  'docxOpenCheck',
  'docxContentCheck',
  'docxSectionOrderCheck',
  'docxTableCheck',
  'docxQuoteIntegrityCheck',
  'docxLayoutCheck',
  'docxTocCheck',
  'docxStyleCheck',
  'docxTechnicalDensityCheck',
  'docxPageBreakCheck',
  'imageInsertionCheck',
  'docxAssetPlacementCheck',
  'docxForbiddenWordsCheck',
];

function notRunValidationResult() {
  return { passed: false, errors: ['not_run'], details: {} };
}

function failedValidationResult(errors, details = {}) {
  return { passed: false, errors: Array.isArray(errors) ? errors : [String(errors)], details };
}

function createTemplateErrorBuildLog(error, fallbackMessage) {
  const result = templateErrorResult(error, fallbackMessage);
  const log = Object.fromEntries(BID_DOCUMENT_BUILD_LOG_CHECK_KEYS.map((key) => [key, notRunValidationResult()]));
  const message = result.message || `完整标书模板不存在：${result.templateId || 'unknown'}`;
  return {
    ...log,
    templateCheck: failedValidationResult(message, {
      error: result.error,
      templateId: result.templateId,
      availableTemplateIds: result.availableTemplateIds,
    }),
    passed: false,
    errors: [message],
  };
}

function createFailedCheckBuildLog(checkKey, message, details = {}) {
  const log = Object.fromEntries(BID_DOCUMENT_BUILD_LOG_CHECK_KEYS.map((key) => [key, notRunValidationResult()]));
  return {
    ...log,
    [checkKey]: failedValidationResult(message, details),
    passed: false,
    errors: [message],
  };
}

function templateErrorResultWithBuildLog(error, fallbackMessage) {
  const result = templateErrorResult(error, fallbackMessage);
  return {
    ...result,
    buildLog: createTemplateErrorBuildLog(error, result.message),
  };
}

async function selectDocxFile(dialog, title) {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openFile'],
    filters: [
      { name: 'Word 文档', extensions: ['docx'] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  return result.filePaths[0];
}

function createBidDocumentStore({ app, db, dialog = electronDialog }) {
  let lastBuildLog = null;

  function toState(parts, buildLog = lastBuildLog) {
    return {
      templates: getBidDocumentTemplates(),
      ...parts,
      lastBuildLog: buildLog,
    };
  }

  function persistState(parts, buildLog = lastBuildLog) {
    if (!db) return;
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO bid_document_state (
        id,
        template_id,
        project_data_json,
        quote_items_json,
        asset_map_json,
        asset_package_json,
        last_build_log_json,
        created_at,
        updated_at
      ) VALUES (
        1,
        @templateId,
        @projectDataJson,
        @quoteItemsJson,
        @assetMapJson,
        @assetPackageJson,
        @lastBuildLogJson,
        @timestamp,
        @timestamp
      )
      ON CONFLICT(id) DO UPDATE SET
        template_id = excluded.template_id,
        project_data_json = excluded.project_data_json,
        quote_items_json = excluded.quote_items_json,
        asset_map_json = excluded.asset_map_json,
        asset_package_json = excluded.asset_package_json,
        last_build_log_json = excluded.last_build_log_json,
        updated_at = excluded.updated_at
    `).run({
      templateId: parts.template.id,
      projectDataJson: JSON.stringify(parts.projectData),
      quoteItemsJson: JSON.stringify(parts.quoteItems),
      assetMapJson: JSON.stringify(parts.assetMap),
      assetPackageJson: parts.assetPackage ? JSON.stringify(parts.assetPackage) : null,
      lastBuildLogJson: buildLog ? JSON.stringify(buildLog) : null,
      timestamp,
    });
  }

  function loadPersistedParts() {
    if (!db) return null;
    const row = db.prepare('SELECT * FROM bid_document_state WHERE id = 1').get();
    if (!row) return null;
    lastBuildLog = safeJsonParse(row.last_build_log_json, null);
    try {
      return mergeSample({
        templateId: row.template_id,
        projectData: safeJsonParse(row.project_data_json, undefined),
        quoteItems: safeJsonParse(row.quote_items_json, undefined),
        assetMap: safeJsonParse(row.asset_map_json, undefined),
        assetPackage: safeJsonParse(row.asset_package_json, null),
      });
    } catch (error) {
      if (error?.code !== 'unknown_template_id') throw error;
      lastBuildLog = createTemplateErrorBuildLog(error, `已保存的完整标书模板不存在：${error.templateId}`);
      return null;
    }
  }

  function loadOrCreateParts() {
    const persisted = loadPersistedParts();
    if (persisted) return persisted;
    const sample = mergeSample();
    persistState(sample, lastBuildLog);
    return sample;
  }

  return {
    loadState() {
      return toState(loadOrCreateParts());
    },

    saveState(payload = {}) {
      let input;
      try {
        input = mergeSample(payload);
      } catch (error) {
        if (error?.code !== 'unknown_template_id') throw error;
        throw new Error(`完整标书保存失败：模板不存在（${error.templateId}）。`);
      }
      persistState(input, lastBuildLog);
      return toState(input);
    },

    validate(payload = {}) {
      let input;
      try {
        input = mergeSample(payload);
      } catch (error) {
        const buildLog = createTemplateErrorBuildLog(error, '完整标书校验失败：模板不存在。');
        return {
          success: false,
          buildLog,
        };
      }
      lastBuildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(input), input.assetPackage);
      persistState(input, lastBuildLog);
      return { success: lastBuildLog.passed, buildLog: lastBuildLog };
    },

    async selectAsset(options = {}) {
      const result = await dialog.showOpenDialog({
        title: options.title ? `选择${options.title}` : '选择标书附件',
        properties: ['openFile'],
        filters: assetSelectionFiltersForType(options.type),
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { success: false, canceled: true, message: '已取消选择' };
      }
      return {
        success: true,
        message: '已选择附件',
        filePath: result.filePaths[0],
      };
    },

    async analyzeReference(options = {}) {
      const referencePath = options.referencePath || await selectDocxFile(dialog, '选择参考响应文件');
      if (!referencePath) {
        return { success: false, canceled: true, message: '已取消选择参考响应文件' };
      }
      const candidatePath = options.candidatePath || await selectDocxFile(dialog, '选择候选生成文件');
      if (!candidatePath) {
        return { success: false, canceled: true, message: '已取消选择候选生成文件', referencePath };
      }
      const analysis = analyzeBidReferenceDocument(referencePath);
      const candidateAnalysis = analyzeBidReferenceDocument(candidatePath);
      const alignment = compareBidReferenceAnalyses(analysis, candidateAnalysis);
      return {
        success: Boolean(analysis.ok && candidateAnalysis.ok && alignment.passed),
        message: alignment.passed ? '参考响应文件结构对齐通过。' : '参考响应文件结构对齐未通过，请查看差异。',
        referencePath,
        candidatePath,
        analysis,
        candidateAnalysis,
        alignment,
      };
    },

    async exportTemplateInfo(options = {}) {
      const templateId = String(options.templateId || '').trim();
      const templateInfo = getBidDocumentTemplateInfo(templateId);
      if (!templateInfo.ok) {
        return {
          success: false,
          message: '模板配置导出失败：模板不存在。',
          templateInfo,
        };
      }

      let filePath = options.filePath;
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: '导出完整标书模板配置 JSON',
          defaultPath: defaultTemplateInfoOutputPath(app, templateId || 'all'),
          filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true, message: '已取消导出模板配置', templateInfo };
        }
        filePath = result.filePath;
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(templateInfo, null, 2), 'utf8');
      return {
        success: true,
        message: '完整标书模板配置 JSON 已导出。',
        filePath,
        templateInfo,
      };
    },

    async exportProjectConfig(options = {}) {
      let input;
      try {
        input = mergeSample(options);
      } catch (error) {
        return templateErrorResult(error, '项目配置导出失败：模板不存在。');
      }
      let filePath = options.filePath;
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: '导出完整标书项目配置 JSON',
          defaultPath: defaultProjectConfigOutputPath(app, input.projectData),
          filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true, message: '已取消导出项目配置' };
        }
        filePath = result.filePath;
      }

      const portableAssets = createPortableAssetMap(input.assetMap, filePath);
      const projectConfig = toProjectConfig(input, portableAssets);
      if (input.assetPackage?.demoOnly) {
        projectConfig.assetPackage = {
          ...(projectConfig.assetPackage || {}),
          demoOnly: true,
          sourceAssetPackage: input.assetPackage,
        };
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(projectConfig, null, 2), 'utf8');
      const schemaPath = projectConfigSchemaPathFor(filePath);
      fs.writeFileSync(schemaPath, JSON.stringify(getBidDocumentProjectConfigSchema(projectConfig.templateId), null, 2), 'utf8');
      return {
        success: true,
        message: portableAssets.assetPackage.copiedCount
          ? `完整标书项目配置 JSON 已导出，并复制 ${portableAssets.assetPackage.copiedCount} 个附件。`
          : '完整标书项目配置 JSON 已导出。',
        filePath,
        schemaPath,
        projectConfig,
        assetPackage: portableAssets.assetPackage,
      };
    },

    async exportReadinessReport(options = {}) {
      let input;
      try {
        input = mergeSample(options);
      } catch (error) {
        return templateErrorResultWithBuildLog(error, '准备度报告导出失败：模板不存在。');
      }

      lastBuildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(input), input.assetPackage);
      persistState(input, lastBuildLog);
      const readinessReport = createReadinessReport(input, lastBuildLog);

      let markdownPath = options.markdownPath || options.filePath;
      if (!markdownPath) {
        const result = await dialog.showSaveDialog({
          title: '导出完整标书准备度报告',
          defaultPath: defaultReadinessReportOutputPath(app, input.projectData),
          filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
        });
        if (result.canceled || !result.filePath) {
          return {
            success: false,
            canceled: true,
            message: '已取消导出准备度报告',
            readinessReady: readinessReport.ready,
            readinessReport,
            buildLog: lastBuildLog,
          };
        }
        markdownPath = result.filePath;
      }

      const basePath = markdownPath.replace(/\.[^/.]+$/, '');
      const jsonPath = options.jsonPath || `${basePath}.json`;
      const xlsxPath = options.xlsxPath || `${basePath}.xlsx`;
      fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
      fs.writeFileSync(markdownPath, renderReadinessReportMarkdown(readinessReport), 'utf8');
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify({ readinessReport }, null, 2), 'utf8');
      fs.mkdirSync(path.dirname(xlsxPath), { recursive: true });
      fs.writeFileSync(xlsxPath, buildReadinessReportExcelBuffer(readinessReport));
      return {
        success: true,
        readinessReady: readinessReport.ready,
        message: readinessReport.ready
          ? '完整标书准备度报告已导出，当前配置可正式构建。'
          : '完整标书准备度报告已导出，仍存在正式构建阻断项。',
        markdownPath,
        jsonPath,
        xlsxPath,
        readinessReport,
        buildLog: lastBuildLog,
      };
    },

    async exportAssetCollectionPackage(options = {}) {
      let input;
      try {
        input = mergeSample(options);
      } catch (error) {
        return templateErrorResultWithBuildLog(error, '材料收集包导出失败：模板不存在。');
      }

      lastBuildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(input), input.assetPackage);
      persistState(input, lastBuildLog);
      const readinessReport = createReadinessReport(input, lastBuildLog);

      let outputDir = options.outputDir || options.directoryPath;
      if (!outputDir) {
        const result = await dialog.showOpenDialog({
          title: '导出完整标书材料收集包',
          defaultPath: defaultAssetCollectionOutputPath(app, input.projectData),
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths?.[0]) {
          return {
            success: false,
            canceled: true,
            message: '已取消导出材料收集包',
            readinessReady: readinessReport.ready,
            readinessReport,
            buildLog: lastBuildLog,
          };
        }
        outputDir = result.filePaths[0];
      }

      const packageResult = writeAssetCollectionPackage({
        outputDir,
        projectData: input.projectData,
        template: input.template,
        assetInventory: readinessReport.assetInventory || [],
        readinessReport,
      });

      return {
        success: true,
        readinessReady: readinessReport.ready,
        message: readinessReport.ready
          ? '完整标书材料收集包已导出，当前配置可正式构建。'
          : '完整标书材料收集包已导出，仍需按清单补齐或替换材料。',
        outputDir: packageResult.outputDir,
        markdownPath: packageResult.markdownPath,
        manifestPath: packageResult.manifestPath,
        manifestSchemaPath: packageResult.manifestSchemaPath,
        quoteResolutionPath: packageResult.quoteResolutionPath,
        quoteResolutionSchemaPath: packageResult.quoteResolutionSchemaPath,
        assetsDir: packageResult.assetsDir,
        assetCount: packageResult.manifest.assetCount,
        demoOnlyAssetCount: packageResult.manifest.demoOnlyAssetCount,
        replacementRequiredAssetCount: packageResult.manifest.replacementRequiredAssetCount,
        missingRequiredAssetCount: packageResult.manifest.missingRequiredAssetCount,
        readinessReport,
        buildLog: lastBuildLog,
      };
    },

    async importAssetCollectionPackage(options = {}) {
      let input;
      try {
        input = mergeSample(options);
      } catch (error) {
        return templateErrorResultWithBuildLog(error, '材料收集包导入失败：模板不存在。');
      }

      let packageDir = options.packageDir || options.directoryPath || options.inputDir;
      if (!packageDir) {
        const result = await dialog.showOpenDialog({
          title: '导入完整标书材料收集包',
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths?.[0]) {
          return { success: false, canceled: true, message: '已取消导入材料收集包' };
        }
        packageDir = result.filePaths[0];
      }

      let packageResult;
      try {
        packageResult = readAssetCollectionPackage(packageDir);
      } catch (error) {
        return {
          success: false,
          message: `材料收集包导入失败：${error instanceof Error ? error.message : String(error)}`,
          packageDir,
        };
      }

      const manifestTemplateId = packageResult.manifest.templateId || '';
      if (manifestTemplateId && manifestTemplateId !== input.template.id) {
        const mismatchError = `asset_package_template_mismatch:${manifestTemplateId}:${input.template.id}`;
        lastBuildLog = createFailedCheckBuildLog('templateCheck', mismatchError, {
          error: 'asset_package_template_mismatch',
          manifestTemplateId,
          currentTemplateId: input.template.id,
          manifestPath: packageResult.manifestPath,
        });
        return {
          success: false,
          message: `材料收集包模板不匹配：${manifestTemplateId} 与当前模板 ${input.template.id} 不一致。`,
          packageDir,
          manifestPath: packageResult.manifestPath,
          manifestSchemaPath: packageResult.manifestSchemaPath,
          buildLog: lastBuildLog,
        };
      }

      const nextAssetMap = { ...(input.assetMap || {}) };
      for (const asset of packageResult.assets) {
        if (!nextAssetMap[asset.key]) continue;
        nextAssetMap[asset.key] = {
          ...nextAssetMap[asset.key],
          filePath: asset.resolvedPath || '',
        };
      }
      const quoteResolutionResult = applyQuoteResolutionToProject(input.projectData, input.quoteItems, packageResult.quoteResolution);
      input = {
        ...input,
        projectData: quoteResolutionResult.projectData,
        quoteItems: quoteResolutionResult.quoteItems,
        assetMap: nextAssetMap,
        assetPackage: {
          type: 'material-collection-package',
          path: packageResult.rootDir,
          importedAt: nowIso(),
          assetCount: packageResult.assets.length,
          appliedCount: packageResult.appliedCount,
          missingCount: packageResult.missingCount,
          missingRequiredCount: packageResult.missingRequiredCount,
          quoteResolutionApplied: quoteResolutionResult.applied,
          quoteResolutionAction: quoteResolutionResult.selectedAction,
          quoteResolutionErrors: quoteResolutionResult.errors,
          demoOnly: false,
        },
      };

      lastBuildLog = validateBidDocumentProject(input);
      if (quoteResolutionResult.errors.length > 0) {
        lastBuildLog = {
          ...lastBuildLog,
          passed: false,
          quoteResolutionCheck: {
            passed: false,
            errors: quoteResolutionResult.errors,
            details: {
              selectedAction: quoteResolutionResult.selectedAction,
              quoteResolutionPath: packageResult.quoteResolution.path,
            },
          },
          errors: [...(lastBuildLog.errors || []), ...quoteResolutionResult.errors],
        };
      }
      persistState(input, lastBuildLog);
      return {
        success: true,
        validationPassed: lastBuildLog.passed,
        message: lastBuildLog.passed
          ? `材料收集包已导入，已回填 ${packageResult.appliedCount} 项附件，校验通过。`
          : `材料收集包已导入，已回填 ${packageResult.appliedCount} 项附件，仍有 ${packageResult.missingRequiredCount} 项必填材料缺失或其他校验问题。`,
        packageDir: packageResult.rootDir,
        manifestPath: packageResult.manifestPath,
        manifestSchemaPath: packageResult.manifestSchemaPath,
        quoteResolutionPath: packageResult.quoteResolution.path,
        quoteResolutionApplied: quoteResolutionResult.applied,
        quoteResolutionAction: quoteResolutionResult.selectedAction,
        quoteResolutionErrors: quoteResolutionResult.errors,
        appliedCount: packageResult.appliedCount,
        missingCount: packageResult.missingCount,
        missingRequiredCount: packageResult.missingRequiredCount,
        state: toState(input, lastBuildLog),
        buildLog: lastBuildLog,
      };
    },

    async importProjectConfig(options = {}) {
      let filePath = options.filePath;
      if (!filePath) {
        const result = await dialog.showOpenDialog({
          title: '导入完整标书项目配置 JSON',
          properties: ['openFile'],
          filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePaths?.[0]) {
          return { success: false, canceled: true, message: '已取消导入项目配置' };
        }
        filePath = result.filePaths[0];
      }

      let projectConfig;
      try {
        projectConfig = readProjectConfig(filePath);
      } catch (error) {
        return {
          success: false,
          message: `项目配置导入失败：${error instanceof Error ? error.message : String(error)}`,
          filePath,
        };
      }

      let input;
      try {
        input = mergeSample({
          templateId: projectConfig.templateId || projectConfig.projectData?.templateId,
          projectData: projectConfig.projectData,
          quoteItems: projectConfig.quoteItems,
          assetMap: resolveProjectConfigAssetMap(projectConfig.assetMap, filePath),
          assetPackage: projectConfig.assetPackage || null,
        });
      } catch (error) {
        return {
          ...templateErrorResultWithBuildLog(error, '项目配置导入失败：模板不存在。'),
          filePath,
        };
      }
      lastBuildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(input), input.assetPackage);
      persistState(input, lastBuildLog);
      return {
        success: true,
        validationPassed: lastBuildLog.passed,
        message: lastBuildLog.passed
          ? '完整标书项目配置 JSON 已导入，校验通过。'
          : '完整标书项目配置 JSON 已导入，校验未通过，请查看构建日志。',
        filePath,
        state: toState(input, lastBuildLog),
        buildLog: lastBuildLog,
      };
    },

    async exportWord(options = {}) {
      let input;
      try {
        input = mergeSample(options);
      } catch (error) {
        const result = templateErrorResult(error, '完整标书导出失败：模板不存在。');
        return {
          ...result,
          buildLog: createTemplateErrorBuildLog(error, result.message),
        };
      }
      const preflight = validateBidDocumentProject(input);
      if (!preflight.passed) {
        lastBuildLog = preflight;
        persistState(input, lastBuildLog);
        return {
          success: false,
          message: '完整标书校验未通过，未生成 Word。',
          buildLog: preflight,
        };
      }
      if (input.assetPackage?.demoOnly) {
        lastBuildLog = applyDemoAssetPackageGuard(preflight, input.assetPackage);
        persistState(input, lastBuildLog);
        return {
          success: false,
          message: '当前项目配置使用演示附件包，未生成 Word。',
          buildLog: lastBuildLog,
        };
      }

      let filePath = options.filePath;
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: '导出完整标书 Word',
          defaultPath: defaultOutputPath(app, input.projectData),
          filters: [{ name: 'Word 文档', extensions: ['docx'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true, message: '已取消导出', buildLog: preflight };
        }
        filePath = result.filePath;
      }

      const result = await writeBidDocumentWordFile(input, filePath);
      lastBuildLog = result.buildLog;
      persistState(input, lastBuildLog);
      return {
        success: result.success,
        message: result.success ? '完整标书 Word 已生成。' : '完整标书后校验未通过，未保留 Word 文件。',
        filePath: result.success ? result.filePath : undefined,
        bytes: result.bytes,
        buildLog: result.buildLog,
      };
    },
  };
}

module.exports = {
  createBidDocumentStore,
};
