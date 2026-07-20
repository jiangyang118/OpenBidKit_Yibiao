const fs = require('node:fs');
const path = require('node:path');

function assertProjectConfigEnvelope(projectConfig = {}) {
  if (!projectConfig || typeof projectConfig !== 'object' || Array.isArray(projectConfig)) {
    throw new Error('invalid_project_config:not_object');
  }
  if (Number(projectConfig.version || 0) !== 1) {
    throw new Error(`unsupported_project_config_version:${projectConfig.version ?? 'missing'}`);
  }
  if (!String(projectConfig.templateId || '').trim()) {
    throw new Error('invalid_project_config:missing_templateId');
  }
  if (!projectConfig.projectData || typeof projectConfig.projectData !== 'object' || Array.isArray(projectConfig.projectData)) {
    throw new Error('invalid_project_config:missing_projectData');
  }
  if (!String(projectConfig.projectData.templateId || '').trim()) {
    throw new Error('invalid_project_config:missing_projectData.templateId');
  }
  const templateId = String(projectConfig.templateId || '').trim();
  const projectTemplateId = String(projectConfig.projectData.templateId || '').trim();
  if (templateId && projectTemplateId && templateId !== projectTemplateId) {
    throw new Error(`invalid_project_config:templateId_mismatch:${templateId}:${projectTemplateId}`);
  }
  if (!Array.isArray(projectConfig.quoteItems)) {
    throw new Error('invalid_project_config:quoteItems_not_array');
  }
  if (!projectConfig.assetMap || typeof projectConfig.assetMap !== 'object' || Array.isArray(projectConfig.assetMap)) {
    throw new Error('invalid_project_config:assetMap_not_object');
  }
}

function readBidDocumentProjectConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const projectConfig = parsed?.bidDocument || parsed;
  assertProjectConfigEnvelope(projectConfig);
  return projectConfig;
}

function resolveProjectConfigAssetMap(assetMap = {}, configPath = '') {
  const configDir = path.dirname(path.resolve(configPath));
  return Object.fromEntries(Object.entries(assetMap || {}).map(([key, asset]) => {
    const filePath = String(asset?.filePath || '').trim();
    if (!filePath || path.isAbsolute(filePath)) {
      return [key, asset];
    }
    return [key, {
      ...asset,
      filePath: path.resolve(configDir, filePath),
    }];
  }));
}

module.exports = {
  assertProjectConfigEnvelope,
  readBidDocumentProjectConfig,
  resolveProjectConfigAssetMap,
};
