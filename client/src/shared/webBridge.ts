import type { YibiaoBridge } from './types';

type EventCallback = (event: unknown) => void;

const eventSources = new Map<string, { source: EventSource; callbacks: Set<EventCallback> }>();

function getWebBasePath() {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return firstSegment === 'yibiao' ? '/yibiao' : '';
}

function webUrl(path: string) {
  return `${getWebBasePath()}${path}`;
}

async function invoke<TResult>(channel: string, ...args: unknown[]): Promise<TResult> {
  const response = await fetch(webUrl('/api/invoke'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Web API 调用失败：${channel}`);
  }
  return payload.result as TResult;
}

function subscribe(channel: string, callback: EventCallback) {
  let entry = eventSources.get(channel);
  if (!entry) {
    const source = new EventSource(webUrl('/api/events'));
    const callbacks = new Set<EventCallback>();
    source.addEventListener(channel, (event) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        payload = (event as MessageEvent).data;
      }
      for (const listener of callbacks) {
        listener(payload);
      }
    });
    entry = { source, callbacks };
    eventSources.set(channel, entry);
  }

  entry.callbacks.add(callback);
  return () => {
    const current = eventSources.get(channel);
    if (!current) return;
    current.callbacks.delete(callback);
    if (!current.callbacks.size) {
      current.source.close();
      eventSources.delete(channel);
    }
  };
}

function assetUrl(value: string) {
  const match = /^yibiao-asset:\/\/([^/]+)\/?(.*)$/i.exec(String(value || '').trim());
  if (!match) return value;
  return webUrl(`/api/assets/${encodeURIComponent(match[1])}/${match[2] || ''}`);
}

function installWebBridge() {
  if (window.yibiao) return;

  const bridge: YibiaoBridge = {
    appName: '易标投标工具箱',
    platform: 'web',
    getVersion: () => invoke('app:get-version'),
    getGpuHardwareAccelerationStatus: () => invoke('app:get-gpu-hardware-acceleration-status'),
    saveGpuHardwareAccelerationPreference: (enabled) => invoke('app:save-gpu-hardware-acceleration-preference', enabled),
    startGpuHardwareAccelerationTrial: () => invoke('app:start-gpu-hardware-acceleration-trial'),
    relaunchWithGpuHardwareAccelerationDisabled: () => invoke('app:relaunch-with-gpu-hardware-acceleration-disabled'),
    getLatestVersion: () => invoke('app:get-latest-version'),
    getUpdateDownloadUrl: () => invoke('app:get-update-download-url'),
    openExternal: (url) => invoke('app:open-external', url),
    checkUpdate: () => invoke('app:check-update'),
    startUpdate: () => invoke('app:start-update'),
    quitAndInstall: () => invoke('app:quit-and-install'),
    onUpdateProgress: (callback) => subscribe('app:update-progress', callback as EventCallback),
    onUpdateDownloaded: (callback) => subscribe('app:update-downloaded', callback as EventCallback),
    onUpdateError: (callback) => subscribe('app:update-error', callback as EventCallback),
    database: {
      getStatus: () => invoke('workspace-database:get-status'),
      onStatus: (callback) => subscribe('workspace-database:status', callback as EventCallback),
    },
    projectWorkspace: {
      list: () => invoke('project-workspace:list'),
      create: (payload) => invoke('project-workspace:create', payload),
      setActive: (projectId) => invoke('project-workspace:set-active', projectId),
      archive: (projectId, archived) => invoke('project-workspace:archive', projectId, archived),
      delete: (projectId, options) => invoke('project-workspace:delete', projectId, options),
      duplicate: (projectId, payload) => invoke('project-workspace:duplicate', projectId, payload),
      exportPackage: (projectId, packageDir) => invoke('project-workspace:export-package', projectId, packageDir),
      importPackage: (packageDir, payload) => invoke('project-workspace:import-package', packageDir, payload),
      getWorkspacePath: (projectId) => invoke('project-workspace:get-workspace-path', projectId),
    },
    config: {
      load: () => invoke('config:load'),
      save: (config) => invoke('config:save', config),
      listModels: (config) => invoke('config:list-models', config),
      openConfigFolder: () => invoke('config:open-config-folder'),
    },
    ai: {
      chat: (request) => invoke('ai:chat', request),
      requestJson: (request) => invoke('ai:request-json', request),
      listJsonFailureSamples: () => invoke('ai:list-json-failure-samples'),
      listJsonReplayLogs: () => invoke('ai:list-json-replay-logs'),
      saveJsonFailureSample: (sample) => invoke('ai:save-json-failure-sample', sample),
      savePromptDebugRecord: (record) => invoke('ai:save-prompt-debug-record', record),
      clearJsonFailureSamples: () => invoke('ai:clear-json-failure-samples'),
      testImageModel: (config) => invoke('ai:test-image-model', config),
    },
    file: {
      selectDuplicateCheckFiles: (options) => invoke('file:select-duplicate-check-files', options),
      parseDeveloperSample: (options) => invoke('file:parse-developer-sample', options),
      getDeveloperParserCapabilities: () => invoke('file:get-developer-parser-capabilities'),
    },
    knowledgeBase: {
      getMigrationStatus: () => invoke('knowledge-base:get-migration-status'),
      migrateLegacy: () => invoke('knowledge-base:migrate-legacy'),
      list: () => invoke('knowledge-base:list'),
      getActiveTasks: () => invoke('knowledge-base:get-active-tasks'),
      createFolder: (name) => invoke('knowledge-base:create-folder', name),
      renameFolder: (folderId, name) => invoke('knowledge-base:rename-folder', folderId, name),
      reorderFolder: (draggedFolderId, targetFolderId, position) => invoke('knowledge-base:reorder-folder', draggedFolderId, targetFolderId, position),
      deleteFolder: (folderId) => invoke('knowledge-base:delete-folder', folderId),
      deleteDocument: (documentId) => invoke('knowledge-base:delete-document', documentId),
      moveDocument: (documentId, targetFolderId, targetDocumentId, position) => invoke('knowledge-base:move-document', documentId, targetFolderId, targetDocumentId, position),
      uploadDocuments: (folderId) => invoke('knowledge-base:upload-documents', folderId),
      importCategorizedArchives: () => invoke('knowledge-base:import-categorized-archives'),
      retryDocument: (documentId) => invoke('knowledge-base:retry-document', documentId),
      startMatching: (documentId, batchSize) => invoke('knowledge-base:start-matching', documentId, batchSize),
      readMarkdown: (documentId) => invoke('knowledge-base:read-markdown', documentId),
      readItems: (documentId) => invoke('knowledge-base:read-items', documentId),
      readAnalysis: (documentId) => invoke('knowledge-base:read-analysis', documentId),
      onEvent: (callback) => subscribe('knowledge-base:event', callback as EventCallback),
    },
    imageKnowledgeBase: {
      list: (query) => invoke('image-knowledge-base:list', query),
      uploadImages: () => invoke('image-knowledge-base:upload-images'),
      importHistoricalArchives: (section) => invoke('image-knowledge-base:import-historical-archives', section),
      importCategorizedArchives: () => invoke('image-knowledge-base:import-categorized-archives'),
      updateAsset: (id, patch) => invoke('image-knowledge-base:update-asset', id, patch),
      batchUpdateAssets: (payload) => invoke('image-knowledge-base:batch-update-assets', payload),
      renameTag: (oldTag, newTag) => invoke('image-knowledge-base:rename-tag', oldTag, newTag),
      deleteTag: (tag) => invoke('image-knowledge-base:delete-tag', tag),
      deleteAsset: (id) => invoke('image-knowledge-base:delete-asset', id),
      batchDeleteAssets: (ids) => invoke('image-knowledge-base:batch-delete-assets', ids),
      createMarkdownReference: (payload) => invoke('image-knowledge-base:create-markdown-reference', payload),
      listReferences: (imageId) => invoke('image-knowledge-base:list-references', imageId),
    },
    technicalPlan: {
      loadState: () => invoke('technical-plan:load-state'),
      importTenderDocument: () => invoke('technical-plan:import-tender-document'),
      importOriginalPlanDocument: () => invoke('technical-plan:import-original-plan-document'),
      selectBidSection: (selectedSection) => invoke('technical-plan:select-bid-section', selectedSection),
      cancelBidSectionSelection: () => invoke('technical-plan:cancel-bid-section-selection'),
      readTenderMarkdown: () => invoke('technical-plan:read-tender-markdown'),
      readOriginalPlanMarkdown: () => invoke('technical-plan:read-original-plan-markdown'),
      updateStep: (step) => invoke('technical-plan:update-step', step),
      setWorkflowKind: (workflowKind) => invoke('technical-plan:set-workflow-kind', workflowKind),
      switchWorkflowKind: (workflowKind) => invoke('technical-plan:switch-workflow-kind', workflowKind),
      saveBidAnalysisConfig: (payload) => invoke('technical-plan:save-bid-analysis-config', payload),
      saveOutlineConfig: (payload) => invoke('technical-plan:save-outline-config', payload),
      saveOutline: (payload) => invoke('technical-plan:save-outline', payload),
      saveGlobalFacts: (globalFacts) => invoke('technical-plan:save-global-facts', globalFacts),
      saveContentGenerationOptions: (options) => invoke('technical-plan:save-content-generation-options', options),
      resolveConsistencyAuditItem: (payload) => invoke('technical-plan:resolve-consistency-audit-item', payload),
      handleOriginalCoverageUnassignedSegment: (payload) => invoke('technical-plan:handle-original-coverage-unassigned-segment', payload),
      saveChapterContent: (payload) => invoke('technical-plan:save-chapter-content', payload),
      clear: () => invoke('technical-plan:clear'),
    },
    duplicateCheck: {
      loadState: () => invoke('duplicate-check:load-state'),
      saveFiles: (payload) => invoke('duplicate-check:save-files', payload),
      saveUiState: (payload) => invoke('duplicate-check:save-ui-state', payload),
      updateState: (partial) => invoke('duplicate-check:update-state', partial),
      resolveItem: (payload) => invoke('duplicate-check:resolve-item', payload),
      batchHandleItems: (payload) => invoke('duplicate-check:batch-handle-items', payload),
      saveContentIgnoreRule: (payload) => invoke('duplicate-check:save-content-ignore-rule', payload),
      deleteContentIgnoreRule: (ruleId) => invoke('duplicate-check:delete-content-ignore-rule', ruleId),
      exportContentIgnoreRules: (payload) => invoke('duplicate-check:export-content-ignore-rules', payload),
      importContentIgnoreRules: (payload) => invoke('duplicate-check:import-content-ignore-rules', payload),
      exportReport: (payload) => invoke('duplicate-check:export-report', payload),
      clear: () => invoke('duplicate-check:clear'),
    },
    rejectionCheck: {
      loadState: () => invoke('rejection-check:load-state'),
      importDocument: (role) => invoke('rejection-check:import-document', role),
      importTenderFromTechnicalPlan: () => invoke('rejection-check:import-tender-from-technical-plan'),
      removeDocument: (role, documentId) => invoke('rejection-check:remove-document', role, documentId),
      saveUiState: (payload) => invoke('rejection-check:save-ui-state', payload),
      updateState: (partial) => invoke('rejection-check:update-state', partial),
      resolveFinding: (payload) => invoke('rejection-check:resolve-finding', payload),
      batchHandleFindings: (payload) => invoke('rejection-check:batch-handle-findings', payload),
      exportReport: (payload) => invoke('rejection-check:export-report', payload),
      clear: () => invoke('rejection-check:clear'),
    },
    aiEvaluation: {
      loadState: () => invoke('ai-evaluation:load-state'),
      generateFromTechnicalPlan: () => invoke('ai-evaluation:generate-from-technical-plan'),
      importBidDocument: () => invoke('ai-evaluation:import-bid-document'),
      updateItem: (id, patch) => invoke('ai-evaluation:update-item', id, patch),
      saveExpertScore: (payload) => invoke('ai-evaluation:save-expert-score', payload),
      exportReport: (options) => invoke('ai-evaluation:export-report', options),
      exportOfficePackage: (options) => invoke('ai-evaluation:export-office-package', options),
      exportCommitteeReport: (options) => invoke('ai-evaluation:export-committee-report', options),
      clear: () => invoke('ai-evaluation:clear'),
    },
    businessBid: {
      loadState: () => invoke('business-bid:load-state'),
      importFromTechnicalPlan: () => invoke('business-bid:import-from-technical-plan'),
      importTenderDocument: () => invoke('business-bid:import-tender-document'),
      enhanceWithAi: () => invoke('business-bid:enhance-with-ai'),
      updateClause: (id, patch) => invoke('business-bid:update-clause', id, patch),
      importAttachments: (options) => invoke('business-bid:import-attachments', options),
      updateAttachment: (id, patch) => invoke('business-bid:update-attachment', id, patch),
      deleteAttachment: (id) => invoke('business-bid:delete-attachment', id),
      exportReport: (options) => invoke('business-bid:export-report', options),
      exportOfficePackage: (options) => invoke('business-bid:export-office-package', options),
      clear: () => invoke('business-bid:clear'),
    },
    bidDocument: {
      loadState: () => invoke('bid-document:load-state'),
      saveState: (payload) => invoke('bid-document:save-state', payload),
      validate: (payload) => invoke('bid-document:validate', payload),
      selectAsset: (options) => invoke('bid-document:select-asset', options),
      analyzeReference: (options) => invoke('bid-document:analyze-reference', options),
      exportTemplateInfo: (options) => invoke('bid-document:export-template-info', options),
      exportProjectConfig: (options) => invoke('bid-document:export-project-config', options),
      exportReadinessReport: (options) => invoke('bid-document:export-readiness-report', options),
      exportAssetCollectionPackage: (options) => invoke('bid-document:export-asset-collection-package', options),
      importAssetCollectionPackage: (options) => invoke('bid-document:import-asset-collection-package', options),
      importProjectConfig: (options) => invoke('bid-document:import-project-config', options),
      exportWord: (options) => invoke('bid-document:export-word', options),
    },
    bidOpportunity: {
      loadState: () => invoke('bid-opportunity:load-state'),
      saveOpportunity: (payload) => invoke('bid-opportunity:save-opportunity', payload),
      saveOpportunityWithAi: (payload) => invoke('bid-opportunity:save-opportunity-with-ai', payload),
      importDocument: () => invoke('bid-opportunity:import-document'),
      importUrl: (payload) => invoke('bid-opportunity:import-url', payload),
      updateFollowUp: (id, patch) => invoke('bid-opportunity:update-follow-up', id, patch),
      addFollowUpRecord: (id, payload) => invoke('bid-opportunity:add-follow-up-record', id, payload),
      updateFollowUpRecord: (id, patch) => invoke('bid-opportunity:update-follow-up-record', id, patch),
      deleteFollowUpRecord: (id) => invoke('bid-opportunity:delete-follow-up-record', id),
      importAttachments: (id, options) => invoke('bid-opportunity:import-attachments', id, options),
      updateAttachment: (id, patch) => invoke('bid-opportunity:update-attachment', id, patch),
      deleteAttachment: (id) => invoke('bid-opportunity:delete-attachment', id),
      updateStatus: (id, status) => invoke('bid-opportunity:update-status', id, status),
      deleteOpportunity: (id) => invoke('bid-opportunity:delete-opportunity', id),
      exportReport: (options) => invoke('bid-opportunity:export-report', options),
      exportCalendar: (options) => invoke('bid-opportunity:export-calendar', options),
      clear: () => invoke('bid-opportunity:clear'),
    },
    bidMarketAnalysis: {
      loadState: () => invoke('bid-market-analysis:load-state'),
    },
    tasks: {
      startBidAnalysis: (payload) => invoke('tasks:start-bid-analysis', payload),
      startOutlineGeneration: (payload) => invoke('tasks:start-outline-generation', payload),
      startGlobalFactsGeneration: (payload) => invoke('tasks:start-global-facts-generation', payload),
      startContentGeneration: (payload) => invoke('tasks:start-content-generation', payload),
      pauseContentGeneration: () => invoke('tasks:pause-content-generation'),
      startRejectionItemsExtraction: (payload) => invoke('tasks:start-rejection-items-extraction', payload),
      startRejectionCheck: (payload) => invoke('tasks:start-rejection-check', payload),
      startDuplicateAnalysis: (payload) => invoke('tasks:start-duplicate-analysis', payload),
      startBusinessBidAiExtraction: (payload) => invoke('tasks:start-business-bid-ai-extraction', payload),
      startAiEvaluationExtraction: (payload) => invoke('tasks:start-ai-evaluation-extraction', payload),
      startAiEvaluationBatchScoring: (payload) => invoke('tasks:start-ai-evaluation-batch-scoring', payload),
      getActiveTasks: () => invoke('tasks:get-active'),
      onTaskEvent: (callback) => subscribe('tasks:event', callback as EventCallback),
    },
    export: {
      previewWordExport: (payload) => invoke('export:preview-word', payload),
      exportWord: (payload) => invoke('export:word', payload),
      onWordExportProgress: (callback) => subscribe('export:word-progress', callback as EventCallback),
    },
  };

  window.yibiao = bridge;
  window.yibiaoClient = { appName: bridge.appName, platform: bridge.platform };
  window.yibiaoWeb = { assetUrl };
}

installWebBridge();
