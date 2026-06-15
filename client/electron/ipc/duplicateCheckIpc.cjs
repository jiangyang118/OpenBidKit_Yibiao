const { ipcMain } = require('electron');

function registerDuplicateCheckIpc({ duplicateCheckStore }) {
  ipcMain.handle('duplicate-check:load-state', () => duplicateCheckStore.loadDuplicateCheck());
  ipcMain.handle('duplicate-check:save-files', (_event, payload) => duplicateCheckStore.saveFiles(payload));
  ipcMain.handle('duplicate-check:save-ui-state', (_event, payload) => duplicateCheckStore.saveUiState(payload));
  ipcMain.handle('duplicate-check:update-state', (_event, partial) => duplicateCheckStore.updateDuplicateCheck(partial));
  ipcMain.handle('duplicate-check:resolve-item', (_event, payload) => duplicateCheckStore.resolveDuplicateItem(payload));
  ipcMain.handle('duplicate-check:batch-handle-items', (_event, payload) => duplicateCheckStore.batchHandleDuplicateItems(payload));
  ipcMain.handle('duplicate-check:save-content-ignore-rule', (_event, payload) => duplicateCheckStore.saveContentIgnoreRule(payload));
  ipcMain.handle('duplicate-check:delete-content-ignore-rule', (_event, ruleId) => duplicateCheckStore.deleteContentIgnoreRule(ruleId));
  ipcMain.handle('duplicate-check:export-content-ignore-rules', (_event, payload) => duplicateCheckStore.exportContentIgnoreRules(payload));
  ipcMain.handle('duplicate-check:import-content-ignore-rules', (_event, payload) => duplicateCheckStore.importContentIgnoreRules(payload));
  ipcMain.handle('duplicate-check:export-report', (_event, payload) => duplicateCheckStore.exportDuplicateReport(payload));
  ipcMain.handle('duplicate-check:clear', () => duplicateCheckStore.clearDuplicateCheck());
}

module.exports = {
  registerDuplicateCheckIpc,
};
