const { ipcMain, shell } = require('electron');
const { registerAgentIpc } = require('./agentIpc.cjs');
const { registerAiIpc } = require('./aiIpc.cjs');
const { registerAiEvaluationIpc } = require('./aiEvaluationIpc.cjs');
const { registerBidOpportunityIpc } = require('./bidOpportunityIpc.cjs');
const { registerBusinessBidIpc } = require('./businessBidIpc.cjs');
const { registerConfigIpc } = require('./configIpc.cjs');
const { registerDeveloperIpc } = require('./developerIpc.cjs');
const { registerDuplicateCheckIpc } = require('./duplicateCheckIpc.cjs');
const { registerExportIpc } = require('./exportIpc.cjs');
const { registerFileIpc } = require('./fileIpc.cjs');
const { registerImageKnowledgeBaseIpc } = require('./imageKnowledgeBaseIpc.cjs');
const { registerKnowledgeBaseIpc } = require('./knowledgeBaseIpc.cjs');
const { registerProjectWorkspaceIpc } = require('./projectWorkspaceIpc.cjs');
const { registerRejectionCheckIpc } = require('./rejectionCheckIpc.cjs');
const { registerTaskIpc } = require('./taskIpc.cjs');
const { registerTechnicalPlanIpc } = require('./technicalPlanIpc.cjs');
const { registerTemplateIpc } = require('./templateIpc.cjs');
const { registerSystemFontIpc } = require('./systemFontIpc.cjs');
const { createAgentService } = require('../services/agentService.cjs');
const { createAiService } = require('../services/aiService.cjs');
const { createAiEvaluationStore } = require('../services/aiEvaluationStore.cjs');
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
const { createSystemFontService } = require('../services/systemFontService.cjs');
const { createTaskService } = require('../services/taskService.cjs');
const { createTechnicalPlanStore } = require('../services/technicalPlanStore.cjs');
const { createTemplateStore } = require('../services/templateStore.cjs');

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
  'technical-plan:check-bid-sections',
  'technical-plan:select-bid-section',
  'technical-plan:read-tender-markdown',
  'technical-plan:read-original-plan-markdown',
  'technical-plan:update-step',
  'technical-plan:set-workflow-kind',
  'technical-plan:save-outline-config',
  'technical-plan:save-outline',
  'technical-plan:save-global-facts',
  'technical-plan:save-content-generation-options',
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
  'rejection-check:clear',
  'ai-evaluation:load-state',
  'ai-evaluation:generate-from-technical-plan',
  'ai-evaluation:import-bid-document',
  'ai-evaluation:update-item',
  'ai-evaluation:export-report',
  'ai-evaluation:export-office-package',
  'ai-evaluation:clear',
  'business-bid:load-state',
  'business-bid:import-from-technical-plan',
  'business-bid:import-tender-document',
  'business-bid:update-clause',
  'business-bid:import-attachments',
  'business-bid:update-attachment',
  'business-bid:delete-attachment',
  'business-bid:export-report',
  'business-bid:export-office-package',
  'business-bid:clear',
  'bid-opportunity:load-state',
  'bid-opportunity:save-opportunity',
  'bid-opportunity:import-document',
  'bid-opportunity:import-url',
  'bid-opportunity:update-follow-up',
  'bid-opportunity:update-status',
  'bid-opportunity:delete-opportunity',
  'bid-opportunity:export-report',
  'bid-opportunity:export-calendar',
  'bid-opportunity:clear',
  'knowledge-base:get-migration-status',
  'knowledge-base:migrate-legacy',
  'knowledge-base:list',
  'knowledge-base:create-folder',
  'knowledge-base:rename-folder',
  'knowledge-base:delete-folder',
  'knowledge-base:delete-document',
  'knowledge-base:upload-documents',
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
  'templates:list',
  'templates:get',
  'templates:create',
  'templates:update',
  'templates:delete',
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

function registerWorkspaceDatabaseServices({ app, configStore, aiService, agentService, fileService, updateStatus }) {
  const sqliteDatabase = createSqliteDatabase(app, { onStatus: updateStatus });
  const knowledgeBaseStore = createKnowledgeBaseStore({ app, db: sqliteDatabase.db });
  const knowledgeBaseService = createKnowledgeBaseService({ app, aiService, configStore, knowledgeBaseStore });
  const imageKnowledgeBaseStore = createImageKnowledgeBaseStore({ app, db: sqliteDatabase.db });
  const technicalPlanStore = createTechnicalPlanStore({ app, db: sqliteDatabase.db, fileService });
  const duplicateCheckStore = createDuplicateCheckStore({ app, db: sqliteDatabase.db });
  const rejectionCheckStore = createRejectionCheckStore({ app, db: sqliteDatabase.db, fileService, technicalPlanStore });
  const aiEvaluationStore = createAiEvaluationStore({ app, db: sqliteDatabase.db, technicalPlanStore, fileService, aiService });
  const businessBidStore = createBusinessBidStore({ db: sqliteDatabase.db, technicalPlanStore, fileService, aiService, app });
  const bidOpportunityStore = createBidOpportunityStore({ db: sqliteDatabase.db, fileService, aiService });
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
  registerBidOpportunityIpc({ bidOpportunityStore });
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

function registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, quitAndInstall, getLatestVersion, getUpdateDownloadUrl, gpuStartupState = {}, gpuTrialArg = '--yibiao-trial-hardware-acceleration', forceDisableGpuArgs = [] }) {
  const configStore = createConfigStore(app);
  const projectWorkspaceStore = createProjectWorkspaceStore({ app });
  const activeProject = projectWorkspaceStore.getActiveProject();
  const projectApp = createProjectScopedApp(app, activeProject);
  const aiService = createAiService({ app: projectApp, configStore });
  const fileService = createFileService({ app: projectApp, configStore });
  const exportService = createExportService({ configStore });
  const systemFontService = createSystemFontService();
  const databaseStatus = registerWorkspaceDatabaseStatusIpc({ mainWindow });
  let workspaceDatabaseStarted = false;
  let gpuTrialRelaunchStarted = false;

  const closeServices = async () => {
    await agentService.close?.();
  };

  const closeServicesBeforeExit = async () => {
    try {
      await closeServices();
    } catch (error) {
      console.warn('[ipc] 关闭后台服务失败', error?.message || String(error));
    }
  };

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

  const openDeveloperTokenStatsWindowOnStartup = () => {
    try {
      const config = configStore.load();
      if (config.developer_mode && config.developer_token_stats_auto_open) {
        openDeveloperTokenStatsWindow?.();
      }
    } catch (error) {
      console.warn('[developer] 自动打开 Token 统计小窗失败', error?.message || String(error));
    }
  };

  registerConfigIpc({
    configStore,
    aiService,
    onConfigChanged(nextConfig, previousConfig) {
      agentService.handleConfigChanged?.(nextConfig, previousConfig);
    },
    onDeveloperModeChange(developerMode) {
      if (!developerMode) {
        closeDeveloperTokenStatsWindow?.();
      }
    },
  });
  registerDeveloperIpc({ configStore, aiService, openDeveloperTokenStatsWindow });
  registerAiIpc({ aiService });
  registerAgentIpc({ agentService, mainWindow });
  registerFileIpc({ fileService });
  registerExportIpc({ exportService });
  registerProjectWorkspaceIpc({ projectWorkspaceStore });
  registerPendingWorkspaceDatabaseIpc(databaseStatus.getStatus);

  setTimeout(() => {
    void agentService.warmup?.().catch((error) => {
      console.warn('[agent] warmup failed', error?.message || String(error));
    });
  }, 500);

  const startWorkspaceDatabase = () => {
    if (workspaceDatabaseStarted) return;
    workspaceDatabaseStarted = true;
    databaseStatus.updateStatus({
      phase: 'checking',
      ready: false,
      message: `正在检查本地数据库：${activeProject.project?.name || '默认项目'}`,
      activeProjectId: activeProject.project?.id,
      workspacePath: activeProject.workspace_path,
    });
    setTimeout(() => {
      try {
        registerWorkspaceDatabaseServices({ app: projectApp, configStore, aiService, fileService, updateStatus: databaseStatus.updateStatus });
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

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      startWorkspaceDatabase();
      openDeveloperTokenStatsWindowOnStartup();
    });
  } else {
    startWorkspaceDatabase();
    openDeveloperTokenStatsWindowOnStartup();
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

  ipcMain.handle('app:start-gpu-hardware-acceleration-trial', async () => {
    if (gpuTrialRelaunchStarted) {
      return { success: true };
    }

    gpuTrialRelaunchStarted = true;
    const args = buildGpuTrialRelaunchArgs();
    await closeServicesBeforeExit();
    app.relaunch({ args });
    app.exit(0);
    return { success: true };
  });

  ipcMain.handle('app:relaunch-with-gpu-hardware-acceleration-disabled', async () => {
    saveGpuHardwareAccelerationPreference(false);
    if (gpuTrialRelaunchStarted) {
      return { success: true };
    }

    gpuTrialRelaunchStarted = true;
    const args = buildGpuDisabledRelaunchArgs();
    await closeServicesBeforeExit();
    app.relaunch({ args });
    app.exit(0);
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
  ipcMain.handle('app:quit-and-install', async () => {
    await closeServicesBeforeExit();
    return quitAndInstall({ app });
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

  return {
    closeServices,
  };
}

module.exports = {
  registerIpcHandlers,
};
