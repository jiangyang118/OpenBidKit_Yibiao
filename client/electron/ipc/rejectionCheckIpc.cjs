const { ipcMain } = require('electron');

function registerRejectionCheckIpc({ rejectionCheckStore }) {
  ipcMain.handle('rejection-check:load-state', () => rejectionCheckStore.loadRejectionCheck());
  ipcMain.handle('rejection-check:import-document', (_event, role) => rejectionCheckStore.importDocument(role));
  ipcMain.handle('rejection-check:import-tender-from-technical-plan', () => rejectionCheckStore.importTenderFromTechnicalPlan());
  ipcMain.handle('rejection-check:remove-document', (_event, role, documentId) => rejectionCheckStore.removeDocument(role, documentId));
  ipcMain.handle('rejection-check:save-ui-state', (_event, payload) => rejectionCheckStore.saveUiState(payload));
  ipcMain.handle('rejection-check:update-state', (_event, partial) => rejectionCheckStore.updateRejectionCheck(partial));
  ipcMain.handle('rejection-check:resolve-finding', (_event, payload) => rejectionCheckStore.resolveFinding(payload));
  ipcMain.handle('rejection-check:batch-handle-findings', (_event, payload) => rejectionCheckStore.batchHandleFindings(payload));
  ipcMain.handle('rejection-check:export-report', (_event, payload) => rejectionCheckStore.exportRejectionReport(payload));
  ipcMain.handle('rejection-check:clear', () => rejectionCheckStore.clearRejectionCheck());
}

module.exports = {
  registerRejectionCheckIpc,
};
