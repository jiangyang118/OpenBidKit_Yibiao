const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  appName: '易标投标工具箱',
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getGpuHardwareAccelerationStatus: () => ipcRenderer.invoke('app:get-gpu-hardware-acceleration-status'),
  saveGpuHardwareAccelerationPreference: (enabled) => ipcRenderer.invoke('app:save-gpu-hardware-acceleration-preference', enabled),
  startGpuHardwareAccelerationTrial: () => ipcRenderer.invoke('app:start-gpu-hardware-acceleration-trial'),
  relaunchWithGpuHardwareAccelerationDisabled: () => ipcRenderer.invoke('app:relaunch-with-gpu-hardware-acceleration-disabled'),
  getLatestVersion: () => ipcRenderer.invoke('app:get-latest-version'),
  getUpdateDownloadUrl: () => ipcRenderer.invoke('app:get-update-download-url'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  startUpdate: () => ipcRenderer.invoke('app:start-update'),
  quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-progress', listener);
    return () => ipcRenderer.removeListener('app:update-progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-downloaded', listener);
    return () => ipcRenderer.removeListener('app:update-downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-error', listener);
    return () => ipcRenderer.removeListener('app:update-error', listener);
  },
  database: {
    getStatus: () => ipcRenderer.invoke('workspace-database:get-status'),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-database:status', listener);
      return () => ipcRenderer.removeListener('workspace-database:status', listener);
    },
  },
  projectWorkspace: {
    list: () => ipcRenderer.invoke('project-workspace:list'),
    create: (payload) => ipcRenderer.invoke('project-workspace:create', payload),
    setActive: (projectId) => ipcRenderer.invoke('project-workspace:set-active', projectId),
    archive: (projectId, archived) => ipcRenderer.invoke('project-workspace:archive', projectId, archived),
    delete: (projectId, options) => ipcRenderer.invoke('project-workspace:delete', projectId, options),
    duplicate: (projectId, payload) => ipcRenderer.invoke('project-workspace:duplicate', projectId, payload),
    exportPackage: (projectId, packageDir) => ipcRenderer.invoke('project-workspace:export-package', projectId, packageDir),
    importPackage: (packageDir, payload) => ipcRenderer.invoke('project-workspace:import-package', packageDir, payload),
    getWorkspacePath: (projectId) => ipcRenderer.invoke('project-workspace:get-workspace-path', projectId),
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    listModels: (config) => ipcRenderer.invoke('config:list-models', config),
    openConfigFolder: () => ipcRenderer.invoke('config:open-config-folder'),
  },
  ai: {
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    requestJson: (request) => ipcRenderer.invoke('ai:request-json', request),
    listJsonFailureSamples: () => ipcRenderer.invoke('ai:list-json-failure-samples'),
    listJsonReplayLogs: () => ipcRenderer.invoke('ai:list-json-replay-logs'),
    saveJsonFailureSample: (sample) => ipcRenderer.invoke('ai:save-json-failure-sample', sample),
    clearJsonFailureSamples: () => ipcRenderer.invoke('ai:clear-json-failure-samples'),
    testImageModel: (config) => ipcRenderer.invoke('ai:test-image-model', config),
  },
  agent: {
    run: (payload) => ipcRenderer.invoke('agent:run', payload),
    selfCheck: () => ipcRenderer.invoke('agent:self-check'),
    exportSelfCheckReport: (payload) => ipcRenderer.invoke('agent:export-self-check-report', payload),
    getStatus: () => ipcRenderer.invoke('agent:get-status'),
    restart: (reason) => ipcRenderer.invoke('agent:restart', reason),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('agent:status', listener);
      return () => ipcRenderer.removeListener('agent:status', listener);
    },
  },
  developerTokenStats: {
    openWindow: () => ipcRenderer.invoke('developer-token-stats:open-window'),
    get: () => ipcRenderer.invoke('developer-token-stats:get'),
    reset: () => ipcRenderer.invoke('developer-token-stats:reset'),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('developer-token-stats:changed', listener);
      return () => ipcRenderer.removeListener('developer-token-stats:changed', listener);
    },
  },
  file: {
    selectDuplicateCheckFiles: (options) => ipcRenderer.invoke('file:select-duplicate-check-files', options),
    parseDeveloperSample: (options) => ipcRenderer.invoke('file:parse-developer-sample', options),
    getDeveloperParserCapabilities: () => ipcRenderer.invoke('file:get-developer-parser-capabilities'),
  },
  knowledgeBase: {
    getMigrationStatus: () => ipcRenderer.invoke('knowledge-base:get-migration-status'),
    migrateLegacy: () => ipcRenderer.invoke('knowledge-base:migrate-legacy'),
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    getActiveTasks: () => ipcRenderer.invoke('knowledge-base:get-active-tasks'),
    createFolder: (name) => ipcRenderer.invoke('knowledge-base:create-folder', name),
    renameFolder: (folderId, name) => ipcRenderer.invoke('knowledge-base:rename-folder', folderId, name),
    reorderFolder: (draggedFolderId, targetFolderId, position) => ipcRenderer.invoke('knowledge-base:reorder-folder', draggedFolderId, targetFolderId, position),
    deleteFolder: (folderId) => ipcRenderer.invoke('knowledge-base:delete-folder', folderId),
    deleteDocument: (documentId) => ipcRenderer.invoke('knowledge-base:delete-document', documentId),
    moveDocument: (documentId, targetFolderId, targetDocumentId, position) => ipcRenderer.invoke('knowledge-base:move-document', documentId, targetFolderId, targetDocumentId, position),
    uploadDocuments: (folderId) => ipcRenderer.invoke('knowledge-base:upload-documents', folderId),
    retryDocument: (documentId) => ipcRenderer.invoke('knowledge-base:retry-document', documentId),
    startMatching: (documentId, batchSize) => ipcRenderer.invoke('knowledge-base:start-matching', documentId, batchSize),
    readMarkdown: (documentId) => ipcRenderer.invoke('knowledge-base:read-markdown', documentId),
    readItems: (documentId) => ipcRenderer.invoke('knowledge-base:read-items', documentId),
    readAnalysis: (documentId) => ipcRenderer.invoke('knowledge-base:read-analysis', documentId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('knowledge-base:event', listener);
      return () => ipcRenderer.removeListener('knowledge-base:event', listener);
    },
  },
  imageKnowledgeBase: {
    list: (query) => ipcRenderer.invoke('image-knowledge-base:list', query),
    uploadImages: () => ipcRenderer.invoke('image-knowledge-base:upload-images'),
    updateAsset: (id, patch) => ipcRenderer.invoke('image-knowledge-base:update-asset', id, patch),
    batchUpdateAssets: (payload) => ipcRenderer.invoke('image-knowledge-base:batch-update-assets', payload),
    renameTag: (oldTag, newTag) => ipcRenderer.invoke('image-knowledge-base:rename-tag', oldTag, newTag),
    deleteTag: (tag) => ipcRenderer.invoke('image-knowledge-base:delete-tag', tag),
    deleteAsset: (id) => ipcRenderer.invoke('image-knowledge-base:delete-asset', id),
    batchDeleteAssets: (ids) => ipcRenderer.invoke('image-knowledge-base:batch-delete-assets', ids),
    createMarkdownReference: (payload) => ipcRenderer.invoke('image-knowledge-base:create-markdown-reference', payload),
    listReferences: (imageId) => ipcRenderer.invoke('image-knowledge-base:list-references', imageId),
  },
  technicalPlan: {
    loadState: () => ipcRenderer.invoke('technical-plan:load-state'),
    importTenderDocument: () => ipcRenderer.invoke('technical-plan:import-tender-document'),
    importOriginalPlanDocument: () => ipcRenderer.invoke('technical-plan:import-original-plan-document'),
    checkBidSections: () => ipcRenderer.invoke('technical-plan:check-bid-sections'),
    selectBidSection: (selectedSection) => ipcRenderer.invoke('technical-plan:select-bid-section', selectedSection),
    readTenderMarkdown: () => ipcRenderer.invoke('technical-plan:read-tender-markdown'),
    readOriginalPlanMarkdown: () => ipcRenderer.invoke('technical-plan:read-original-plan-markdown'),
    updateStep: (step) => ipcRenderer.invoke('technical-plan:update-step', step),
    setWorkflowKind: (workflowKind) => ipcRenderer.invoke('technical-plan:set-workflow-kind', workflowKind),
    switchWorkflowKind: (workflowKind) => ipcRenderer.invoke('technical-plan:switch-workflow-kind', workflowKind),
    saveBidAnalysisConfig: (payload) => ipcRenderer.invoke('technical-plan:save-bid-analysis-config', payload),
    saveOutlineConfig: (payload) => ipcRenderer.invoke('technical-plan:save-outline-config', payload),
    saveOutline: (outlineData) => ipcRenderer.invoke('technical-plan:save-outline', outlineData),
    saveGlobalFacts: (globalFacts) => ipcRenderer.invoke('technical-plan:save-global-facts', globalFacts),
    saveContentGenerationOptions: (options) => ipcRenderer.invoke('technical-plan:save-content-generation-options', options),
    resolveConsistencyAuditItem: (payload) => ipcRenderer.invoke('technical-plan:resolve-consistency-audit-item', payload),
    handleOriginalCoverageUnassignedSegment: (payload) => ipcRenderer.invoke('technical-plan:handle-original-coverage-unassigned-segment', payload),
    saveChapterContent: (payload) => ipcRenderer.invoke('technical-plan:save-chapter-content', payload),
    clear: () => ipcRenderer.invoke('technical-plan:clear'),
  },
  duplicateCheck: {
    loadState: () => ipcRenderer.invoke('duplicate-check:load-state'),
    saveFiles: (payload) => ipcRenderer.invoke('duplicate-check:save-files', payload),
    saveUiState: (payload) => ipcRenderer.invoke('duplicate-check:save-ui-state', payload),
    updateState: (partial) => ipcRenderer.invoke('duplicate-check:update-state', partial),
    resolveItem: (payload) => ipcRenderer.invoke('duplicate-check:resolve-item', payload),
    batchHandleItems: (payload) => ipcRenderer.invoke('duplicate-check:batch-handle-items', payload),
    saveContentIgnoreRule: (payload) => ipcRenderer.invoke('duplicate-check:save-content-ignore-rule', payload),
    deleteContentIgnoreRule: (ruleId) => ipcRenderer.invoke('duplicate-check:delete-content-ignore-rule', ruleId),
    exportContentIgnoreRules: (payload) => ipcRenderer.invoke('duplicate-check:export-content-ignore-rules', payload),
    importContentIgnoreRules: (payload) => ipcRenderer.invoke('duplicate-check:import-content-ignore-rules', payload),
    exportReport: (payload) => ipcRenderer.invoke('duplicate-check:export-report', payload),
    clear: () => ipcRenderer.invoke('duplicate-check:clear'),
  },
  rejectionCheck: {
    loadState: () => ipcRenderer.invoke('rejection-check:load-state'),
    importDocument: (role) => ipcRenderer.invoke('rejection-check:import-document', role),
    importTenderFromTechnicalPlan: () => ipcRenderer.invoke('rejection-check:import-tender-from-technical-plan'),
    removeDocument: (role, documentId) => ipcRenderer.invoke('rejection-check:remove-document', role, documentId),
    saveUiState: (payload) => ipcRenderer.invoke('rejection-check:save-ui-state', payload),
    updateState: (partial) => ipcRenderer.invoke('rejection-check:update-state', partial),
    resolveFinding: (payload) => ipcRenderer.invoke('rejection-check:resolve-finding', payload),
    batchHandleFindings: (payload) => ipcRenderer.invoke('rejection-check:batch-handle-findings', payload),
    exportReport: (payload) => ipcRenderer.invoke('rejection-check:export-report', payload),
    clear: () => ipcRenderer.invoke('rejection-check:clear'),
  },
  aiEvaluation: {
    loadState: () => ipcRenderer.invoke('ai-evaluation:load-state'),
    generateFromTechnicalPlan: () => ipcRenderer.invoke('ai-evaluation:generate-from-technical-plan'),
    importBidDocument: () => ipcRenderer.invoke('ai-evaluation:import-bid-document'),
    updateItem: (id, patch) => ipcRenderer.invoke('ai-evaluation:update-item', id, patch),
    saveExpertScore: (payload) => ipcRenderer.invoke('ai-evaluation:save-expert-score', payload),
    exportReport: (options) => ipcRenderer.invoke('ai-evaluation:export-report', options),
    exportOfficePackage: (options) => ipcRenderer.invoke('ai-evaluation:export-office-package', options),
    clear: () => ipcRenderer.invoke('ai-evaluation:clear'),
  },
  businessBid: {
    loadState: () => ipcRenderer.invoke('business-bid:load-state'),
    importFromTechnicalPlan: () => ipcRenderer.invoke('business-bid:import-from-technical-plan'),
    importTenderDocument: () => ipcRenderer.invoke('business-bid:import-tender-document'),
    enhanceWithAi: () => ipcRenderer.invoke('business-bid:enhance-with-ai'),
    updateClause: (id, patch) => ipcRenderer.invoke('business-bid:update-clause', id, patch),
    importAttachments: (options) => ipcRenderer.invoke('business-bid:import-attachments', options),
    updateAttachment: (id, patch) => ipcRenderer.invoke('business-bid:update-attachment', id, patch),
    deleteAttachment: (id) => ipcRenderer.invoke('business-bid:delete-attachment', id),
    exportReport: (options) => ipcRenderer.invoke('business-bid:export-report', options),
    exportOfficePackage: (options) => ipcRenderer.invoke('business-bid:export-office-package', options),
    clear: () => ipcRenderer.invoke('business-bid:clear'),
  },
  bidOpportunity: {
    loadState: () => ipcRenderer.invoke('bid-opportunity:load-state'),
    saveOpportunity: (payload) => ipcRenderer.invoke('bid-opportunity:save-opportunity', payload),
    saveOpportunityWithAi: (payload) => ipcRenderer.invoke('bid-opportunity:save-opportunity-with-ai', payload),
    importDocument: () => ipcRenderer.invoke('bid-opportunity:import-document'),
    importUrl: (payload) => ipcRenderer.invoke('bid-opportunity:import-url', payload),
    updateFollowUp: (id, patch) => ipcRenderer.invoke('bid-opportunity:update-follow-up', id, patch),
    updateStatus: (id, status) => ipcRenderer.invoke('bid-opportunity:update-status', id, status),
    deleteOpportunity: (id) => ipcRenderer.invoke('bid-opportunity:delete-opportunity', id),
    exportReport: (options) => ipcRenderer.invoke('bid-opportunity:export-report', options),
    exportCalendar: (options) => ipcRenderer.invoke('bid-opportunity:export-calendar', options),
    clear: () => ipcRenderer.invoke('bid-opportunity:clear'),
  },
  tasks: {
    startBidSectionExtraction: (payload) => ipcRenderer.invoke('tasks:start-bid-section-extraction', payload),
    startBidAnalysis: (payload) => ipcRenderer.invoke('tasks:start-bid-analysis', payload),
    startOutlineGeneration: (payload) => ipcRenderer.invoke('tasks:start-outline-generation', payload),
    startGlobalFactsGeneration: (payload) => ipcRenderer.invoke('tasks:start-global-facts-generation', payload),
    startContentGeneration: (payload) => ipcRenderer.invoke('tasks:start-content-generation', payload),
    pauseContentGeneration: () => ipcRenderer.invoke('tasks:pause-content-generation'),
    startRejectionItemsExtraction: (payload) => ipcRenderer.invoke('tasks:start-rejection-items-extraction', payload),
    startRejectionCheck: (payload) => ipcRenderer.invoke('tasks:start-rejection-check', payload),
    startDuplicateAnalysis: (payload) => ipcRenderer.invoke('tasks:start-duplicate-analysis', payload),
    startBusinessBidAiExtraction: (payload) => ipcRenderer.invoke('tasks:start-business-bid-ai-extraction', payload),
    startAiEvaluationExtraction: (payload) => ipcRenderer.invoke('tasks:start-ai-evaluation-extraction', payload),
    startAiEvaluationBatchScoring: (payload) => ipcRenderer.invoke('tasks:start-ai-evaluation-batch-scoring', payload),
    getActiveTasks: () => ipcRenderer.invoke('tasks:get-active'),
    onTaskEvent: (callback) => {
      ipcRenderer.send('tasks:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:event', listener);
      return () => ipcRenderer.removeListener('tasks:event', listener);
    },
  },
  export: {
    previewWordExport: (payload) => ipcRenderer.invoke('export:preview-word', payload),
    exportWord: (payload) => ipcRenderer.invoke('export:word', payload),
    openFile: (filePath) => ipcRenderer.invoke('export:open-file', filePath),
    onWordExportProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('export:word-progress', listener);
      return () => ipcRenderer.removeListener('export:word-progress', listener);
    },
  },
  systemFonts: {
    list: () => ipcRenderer.invoke('system-fonts:list'),
  },
};

contextBridge.exposeInMainWorld('yibiao', bridge);

contextBridge.exposeInMainWorld('yibiaoClient', {
  appName: bridge.appName,
  platform: bridge.platform,
});
