const { ipcMain, shell } = require('electron');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerAiEvaluationIpc } = require('./aiEvaluationIpc.cjs');
const { registerBidMarketAnalysisIpc } = require('./bidMarketAnalysisIpc.cjs');
const { registerBidDocumentIpc } = require('./bidDocumentIpc.cjs');
const { registerBidOpportunityIpc } = require('./bidOpportunityIpc.cjs');
const { registerBusinessBidIpc } = require('./businessBidIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerImageKnowledgeBaseIpc } = require('./imageKnowledgeBaseIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerProjectWorkspaceIpc } = require('./projectWorkspaceIpc.cjs');
const { registerRejectionCheckIpc } = require('./rejectionCheckIpc.cjs');
const { registerTaskIpc } = require('./taskIpc.cjs');
const { registerTechnicalPlanIpc } = require('./technicalPlanIpc.cjs');
const { createAiService } = require('../services/aiService.cjs');
const { createAiEvaluationStore } = require('../services/aiEvaluationStore.cjs');
const { createBidDocumentStore } = require('../services/bidDocumentStore.cjs');
const { createBidMarketAnalysisStore } = require('../services/bidMarketAnalysisStore.cjs');
const { createBidOpportunityStore } = require('../services/bidOpportunityStore.cjs');
const { createBusinessBidStore } = require('../services/businessBidStore.cjs');
const { createConfigStore } = require('../services/configStore.cjs');
const { createDuplicateCheckService } = require('../services/duplicateCheckService.cjs');
const { createDuplicateCheckStore } = require('../services/duplicateCheckStore.cjs');
const { createExportService } = require('../services/exportService.cjs');
const { createFileService } = require('../services/fileService.cjs');
const { createImageKnowledgeBaseStore } = require('../services/imageKnowledgeBaseStore.cjs');
const { createKnowledgeBaseService } = require('../services/knowledgeBaseService.cjs');
const { createKnowledgeBaseStore } = require('../services/knowledgeBaseStore.cjs');
const { createProjectWorkspaceStore } = require('../services/projectWorkspaceStore.cjs');
const { createRejectionCheckStore } = require('../services/rejectionCheckStore.cjs');
const { createSqliteDatabase } = require('../services/sqliteDatabase.cjs');
const { createTaskService } = require('../services/taskService.cjs');
const { createTechnicalPlanStore } = require('../services/technicalPlanStore.cjs');

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const workspaceDatabaseChannels = [
  'technical-plan:load-state',
  'technical-plan:import-tender-document',
  'technical-plan:import-original-plan-document',
  'technical-plan:select-bid-section',
  'technical-plan:cancel-bid-section-selection',
  'technical-plan:read-tender-markdown',
  'technical-plan:read-original-plan-markdown',
  'technical-plan:update-step',
  'technical-plan:set-workflow-kind',
  'technical-plan:switch-workflow-kind',
  'technical-plan:save-bid-analysis-config',
  'technical-plan:save-outline-config',
  'technical-plan:save-outline',
  'technical-plan:save-global-facts',
  'technical-plan:save-content-generation-options',
  'technical-plan:resolve-consistency-audit-item',
  'technical-plan:handle-original-coverage-unassigned-segment',
  'technical-plan:save-chapter-content',
  'technical-plan:clear',
  'duplicate-check:load-state',
  'duplicate-check:save-files',
  'duplicate-check:save-ui-state',
  'duplicate-check:update-state',
  'duplicate-check:resolve-item',
  'duplicate-check:batch-handle-items',
  'duplicate-check:save-content-ignore-rule',
  'duplicate-check:delete-content-ignore-rule',
  'duplicate-check:export-content-ignore-rules',
  'duplicate-check:import-content-ignore-rules',
  'duplicate-check:export-report',
  'duplicate-check:clear',
  'rejection-check:load-state',
  'rejection-check:import-document',
  'rejection-check:import-tender-from-technical-plan',
  'rejection-check:remove-document',
  'rejection-check:save-ui-state',
  'rejection-check:update-state',
  'rejection-check:resolve-finding',
  'rejection-check:batch-handle-findings',
  'rejection-check:export-report',
  'rejection-check:clear',
  'ai-evaluation:load-state',
  'ai-evaluation:generate-from-technical-plan',
  'ai-evaluation:import-bid-document',
  'ai-evaluation:update-item',
  'ai-evaluation:save-expert-score',
  'ai-evaluation:export-report',
  'ai-evaluation:export-office-package',
  'ai-evaluation:export-committee-report',
  'ai-evaluation:clear',
  'business-bid:load-state',
  'business-bid:import-from-technical-plan',
  'business-bid:import-tender-document',
  'business-bid:enhance-with-ai',
  'business-bid:update-clause',
  'business-bid:import-attachments',
  'business-bid:update-attachment',
  'business-bid:delete-attachment',
  'business-bid:export-report',
  'business-bid:export-office-package',
  'business-bid:clear',
  'bid-document:load-state',
  'bid-document:save-state',
  'bid-document:validate',
  'bid-document:select-asset',
  'bid-document:analyze-reference',
  'bid-document:export-template-info',
  'bid-document:export-project-config',
  'bid-document:export-readiness-report',
  'bid-document:export-asset-collection-package',
  'bid-document:import-asset-collection-package',
  'bid-document:import-project-config',
  'bid-document:export-word',
  'bid-opportunity:load-state',
  'bid-opportunity:save-opportunity',
  'bid-opportunity:save-opportunity-with-ai',
  'bid-opportunity:import-document',
  'bid-opportunity:import-url',
  'bid-opportunity:update-follow-up',
  'bid-opportunity:add-follow-up-record',
  'bid-opportunity:update-follow-up-record',
  'bid-opportunity:delete-follow-up-record',
  'bid-opportunity:import-attachments',
  'bid-opportunity:update-attachment',
  'bid-opportunity:delete-attachment',
  'bid-opportunity:update-status',
  'bid-opportunity:delete-opportunity',
  'bid-opportunity:export-report',
  'bid-opportunity:export-calendar',
  'bid-opportunity:clear',
  'bid-market-analysis:load-state',
  'knowledge-base:get-migration-status',
  'knowledge-base:migrate-legacy',
  'knowledge-base:list',
  'knowledge-base:get-active-tasks',
  'knowledge-base:create-folder',
  'knowledge-base:rename-folder',
  'knowledge-base:reorder-folder',
  'knowledge-base:delete-folder',
  'knowledge-base:delete-document',
  'knowledge-base:move-document',
  'knowledge-base:upload-documents',
  'knowledge-base:retry-document',
  'knowledge-base:start-matching',
  'knowledge-base:read-markdown',
  'knowledge-base:read-items',
  'knowledge-base:read-analysis',
  'image-knowledge-base:list',
  'image-knowledge-base:upload-images',
  'image-knowledge-base:update-asset',
  'image-knowledge-base:batch-update-assets',
  'image-knowledge-base:rename-tag',
  'image-knowledge-base:delete-tag',
  'image-knowledge-base:delete-asset',
  'image-knowledge-base:batch-delete-assets',
  'image-knowledge-base:create-markdown-reference',
  'image-knowledge-base:list-references',
  'tasks:start-bid-analysis',
  'tasks:start-outline-generation',
  'tasks:start-global-facts-generation',
  'tasks:start-content-generation',
  'tasks:pause-content-generation',
  'tasks:start-rejection-items-extraction',
  'tasks:start-rejection-check',
  'tasks:start-duplicate-analysis',
  'tasks:start-business-bid-ai-extraction',
  'tasks:start-ai-evaluation-extraction',
  'tasks:start-ai-evaluation-batch-scoring',
  'tasks:get-active',
];

function clearWorkspaceDatabaseIpc() {
  workspaceDatabaseChannels.forEach((channel) => ipcMain.removeHandler(channel));
  ipcMain.removeAllListeners('tasks:subscribe');
}

function registerPendingWorkspaceDatabaseIpc(getStatus) {
  clearWorkspaceDatabaseIpc();
  const throwPending = () => {
    const status = getStatus();
    const message = status?.message || '本地数据库正在检查或升级，请稍候';
    throw new Error(message);
  };
  workspaceDatabaseChannels.forEach((channel) => ipcMain.handle(channel, throwPending));
  ipcMain.on('tasks:subscribe', () => {});
}

function registerUnavailableWorkspaceDatabaseIpc(error) {
  const message = `工作区数据库初始化失败：${error?.message || String(error)}`;
  const throwUnavailable = () => {
    throw new Error(message);
  };

  console.error('[ipc] 工作区数据库初始化失败', error);
  clearWorkspaceDatabaseIpc();
  workspaceDatabaseChannels.forEach((channel) => ipcMain.handle(channel, throwUnavailable));
  ipcMain.on('tasks:subscribe', () => {});
}

function registerWorkspaceDatabaseStatusIpc({ mainWindow }) {
  let status = {
    phase: 'checking',
    ready: false,
    message: '正在准备本地数据库',
    updatedAt: new Date().toISOString(),
  };

  const updateStatus = (nextStatus) => {
    status = {
      ...status,
      ...nextStatus,
      ready: nextStatus?.phase === 'ready' ? true : Boolean(nextStatus?.ready),
      updatedAt: new Date().toISOString(),
    };
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('workspace-database:status', status);
    }
  };

  ipcMain.handle('workspace-database:get-status', () => status);

  return {
    getStatus: () => status,
    updateStatus,
  };
}

function registerWorkspaceDatabaseServices({ app, configStore, aiService, fileService, updateStatus }) {
  const sqliteDatabase = createSqliteDatabase(app, { onStatus: updateStatus });
  const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
  const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
  const imageKnowledgeBaseStore = createImageKnowledgeBaseStore({ app, db: sqliteDatabase.db });
  const technicalPlanStore = createTechnicalPlanStore({ app, db: sqliteDatabase.db, fileService });
  const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
  const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore });
  const aiEvaluationStore = createAiEvaluationStore({ app, db: sqliteDatabase.db, technicalPlanStore, fileService, aiService });
  const businessBidStore = createBusinessBidStore({ db: sqliteDatabase.db, technicalPlanStore, fileService, aiService, app });
  const bidDocumentStore = createBidDocumentStore({ app, db: sqliteDatabase.db });
  const bidOpportunityStore = createBidOpportunityStore({ db: sqliteDatabase.db, fileService, aiService, app });
  const bidMarketAnalysisStore = createBidMarketAnalysisStore({ db: sqliteDatabase.db });
  const duplicateCheckService = createDuplicateCheckService({ app, configStore, workspaceStore: duplicateCheckStore });
  const taskService = createTaskService({ aiService, technicalPlanStore, rejectionCheckStore, duplicateCheckStore, knowledgeBaseService, imageKnowledgeBaseStore, duplicateCheckService, businessBidStore, aiEvaluationStore });

  clearWorkspaceDatabaseIpc();
  registerKnowledgeBaseIpc({ knowledgeBaseService });
  registerImageKnowledgeBaseIpc({ imageKnowledgeBaseStore });
  registerTechnicalPlanIpc({ technicalPlanStore });
  registerDuplicateCheckIpc({ duplicateCheckStore });
  registerRejectionCheckIpc({ rejectionCheckStore });
  registerAiEvaluationIpc({ aiEvaluationStore });
  registerBusinessBidIpc({ businessBidStore });
  registerBidDocumentIpc({ bidDocumentStore });
  registerBidOpportunityIpc({ bidOpportunityStore });
  registerBidMarketAnalysisIpc({ bidMarketAnalysisStore });
  registerTaskIpc({ taskService });
  updateStatus({ phase: 'ready', ready: true, message: '本地数据库已就绪' });
  return { sqliteDatabase };
}

function createProjectScopedApp(app, activeProject) {
  const workspaceDir = activeProject?.workspace_path || '';
  return new Proxy(app, {
    get(target, prop) {
      if (prop === 'getYibiaoWorkspaceDir') {
        return () => workspaceDir;
      }
      if (prop === 'yibiaoWorkspaceDir') {
        return workspaceDir;
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createMutableServiceProxy(getService, serviceName) {
  return new Proxy({}, {
    get(_target, prop) {
      const service = getService();
      const value = service?.[prop];
      if (typeof value === 'function') return value.bind(service);
      if (value !== undefined) return value;
      throw new Error(`${serviceName} 尚未初始化`);
    },
  });
}

function registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, quitAndInstall, getLatestVersion, getUpdateDownloadUrl, gpuStartupState = {}, gpuTrialArg = '--yibiao-trial-hardware-acceleration', forceDisableGpuArgs = [], nativeTheme }) {
  const configStore = createConfigStore(app);
  const projectWorkspaceStore = createProjectWorkspaceStore({ app });
  let activeProject = projectWorkspaceStore.getActiveProject();
  let projectApp = createProjectScopedApp(app, activeProject);
  let aiService = createAiService({ app: projectApp, configStore });
  let fileService = createFileService({ app: projectApp, configStore });
  let workspaceDatabase = null;
  const exportService = createExportService({ configStore });
  const databaseStatus = registerWorkspaceDatabaseStatusIpc({ mainWindow });
  let workspaceDatabaseStarted = false;
  let workspaceDatabaseGeneration = 0;
  let gpuTrialRelaunchStarted = false;
  const aiServiceProxy = createMutableServiceProxy(() => aiService, 'AI 服务');
  const fileServiceProxy = createMutableServiceProxy(() => fileService, '文件服务');

  const saveGpuHardwareAccelerationPreference = (enabled) => {
    const nextEnabled = Boolean(enabled);
    const currentConfig = configStore.load();
    const result = configStore.save({
      ...currentConfig,
      gpu_hardware_acceleration_enabled: nextEnabled,
      gpu_hardware_acceleration_configured: true,
    });
    return {
      ...result,
      enabled: nextEnabled,
      configured: true,
      restartRequired: nextEnabled !== Boolean(gpuStartupState.hardwareAccelerationEnabled),
    };
  };

  const buildGpuTrialRelaunchArgs = () => {
    const excludedArgs = new Set([gpuTrialArg, ...forceDisableGpuArgs]);
    return process.argv
      .slice(1)
      .filter((arg) => !excludedArgs.has(String(arg).split('=')[0]))
      .concat(gpuTrialArg);
  };

  const buildGpuDisabledRelaunchArgs = () => {
    const excludedArgs = new Set([gpuTrialArg, ...forceDisableGpuArgs]);
    return process.argv
      .slice(1)
      .filter((arg) => !excludedArgs.has(String(arg).split('=')[0]))
      .concat('--disable-gpu');
  };

  registerConfigIpc({ configStore, aiService: aiServiceProxy, nativeTheme });
  registerAiIpc({ aiService: aiServiceProxy });
  registerFileIpc({ fileService: fileServiceProxy });
  registerExportIpc({ exportService });
  const rebuildProjectServices = (nextActiveProject) => {
    activeProject = nextActiveProject || projectWorkspaceStore.getActiveProject();
    projectApp = createProjectScopedApp(app, activeProject);
    aiService = createAiService({ app: projectApp, configStore });
    fileService = createFileService({ app: projectApp, configStore });
  };

  const initializeWorkspaceDatabase = (reason = 'startup') => {
    const generation = workspaceDatabaseGeneration + 1;
    workspaceDatabaseGeneration = generation;
    registerPendingWorkspaceDatabaseIpc(databaseStatus.getStatus);
    databaseStatus.updateStatus({
      phase: 'checking',
      ready: false,
      message: reason === 'project-switch'
        ? `正在切换项目工作区：${activeProject.project?.name || '默认项目'}`
        : `正在检查本地数据库：${activeProject.project?.name || '默认项目'}`,
      activeProjectId: activeProject.project?.id,
      workspacePath: activeProject.workspace_path,
    });
    setTimeout(() => {
      if (generation !== workspaceDatabaseGeneration) return;
      try {
        if (workspaceDatabase?.close) {
          workspaceDatabase.close();
          workspaceDatabase = null;
        }
        const result = registerWorkspaceDatabaseServices({ app: projectApp, configStore, aiService, fileService, updateStatus: databaseStatus.updateStatus });
        workspaceDatabase = result.sqliteDatabase;
      } catch (error) {
        databaseStatus.updateStatus({
          phase: 'error',
          ready: false,
          message: `本地数据库初始化失败：${error?.message || String(error)}`,
        });
        registerUnavailableWorkspaceDatabaseIpc(error);
      }
    }, 120);
  };

  const switchActiveProjectRuntime = async (projectId) => {
    const state = projectWorkspaceStore.listProjects();
    const project = state.projects.find((item) => item.id === projectId && item.status === 'active');
    if (!project) throw new Error('项目不存在或已归档');
    rebuildProjectServices({ project, workspace_path: project.workspace_path });
    initializeWorkspaceDatabase('project-switch');
    return { success: true };
  };

  registerProjectWorkspaceIpc({ projectWorkspaceStore, onActiveProjectChanged: switchActiveProjectRuntime });
  registerPendingWorkspaceDatabaseIpc(databaseStatus.getStatus);

  const startWorkspaceDatabase = () => {
    if (workspaceDatabaseStarted) return;
    workspaceDatabaseStarted = true;
    initializeWorkspaceDatabase('startup');
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', startWorkspaceDatabase);
  } else {
    startWorkspaceDatabase();
  }

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:get-gpu-hardware-acceleration-status', () => {
    const config = configStore.load();
    return {
      configured: Boolean(config.gpu_hardware_acceleration_configured),
      enabled: Boolean(config.gpu_hardware_acceleration_enabled),
      currentEnabled: Boolean(gpuStartupState.hardwareAccelerationEnabled),
      trial: Boolean(gpuStartupState.trial),
      forcedDisabled: Boolean(gpuStartupState.forcedDisabled),
    };
  });

  ipcMain.handle('app:save-gpu-hardware-acceleration-preference', (_event, enabled) => saveGpuHardwareAccelerationPreference(enabled));

  ipcMain.handle('app:start-gpu-hardware-acceleration-trial', () => {
    if (gpuTrialRelaunchStarted) {
      return { success: true };
    }

    gpuTrialRelaunchStarted = true;
    const args = buildGpuTrialRelaunchArgs();
    setTimeout(() => {
      app.relaunch({ args });
      app.exit(0);
    }, 50);
    return { success: true };
  });

  ipcMain.handle('app:relaunch-with-gpu-hardware-acceleration-disabled', () => {
    saveGpuHardwareAccelerationPreference(false);
    if (gpuTrialRelaunchStarted) {
      return { success: true };
    }

    gpuTrialRelaunchStarted = true;
    const args = buildGpuDisabledRelaunchArgs();
    setTimeout(() => {
      app.relaunch({ args });
      app.exit(0);
    }, 50);
    return { success: true };
  });

  ipcMain.handle('app:open-external', async (_event, url) => {
    const externalUrl = normalizeExternalUrl(url);
    if (!externalUrl) {
      return { success: false, message: '不支持的外部链接' };
    }
    try {
      await shell.openExternal(externalUrl);
      return { success: true };
    } catch (error) {
      const preview = externalUrl.length > 300 ? `${externalUrl.slice(0, 300)}...` : externalUrl;
      console.warn('[app] 打开外部链接失败', { url: preview, message: error.message || String(error) });
      return { success: false, message: '外部链接打开失败' };
    }
  });

  ipcMain.handle('app:get-latest-version', () => getLatestVersion({ configStore }));
  ipcMain.handle('app:get-update-download-url', () => getUpdateDownloadUrl({ configStore }));
  ipcMain.handle('app:quit-and-install', () => {
    quitAndInstall();
  });

  ipcMain.handle('app:check-update', (event) => {
    const webContents = event.sender;
    return checkAndDownloadUpdate({
      app,
      mainWindow,
      configStore,
      onProgress: (percent) => {
        webContents.send('app:update-progress', { percent });
      },
      onDownloaded: (version) => {
        webContents.send('app:update-downloaded', { version });
      },
      onError: (message) => {
        webContents.send('app:update-error', { message });
      },
    });
  });

  ipcMain.handle('app:start-update', (event) => {
    const webContents = event.sender;
    return triggerUpdateDownload({
      app,
      mainWindow,
      configStore,
      onProgress: (percent) => {
        webContents.send('app:update-progress', { percent });
      },
      onDownloaded: (version) => {
        webContents.send('app:update-downloaded', { version });
      },
      onError: (message) => {
        webContents.send('app:update-error', { message });
      },
    });
  });
}

module.exports = {
  registerIpcHandlers,
};
