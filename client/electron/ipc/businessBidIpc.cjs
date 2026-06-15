const { ipcMain } = require('electron');

function registerBusinessBidIpc({ businessBidStore }) {
  ipcMain.handle('business-bid:load-state', () => businessBidStore.loadState());
  ipcMain.handle('business-bid:import-from-technical-plan', () => businessBidStore.importFromTechnicalPlan());
  ipcMain.handle('business-bid:import-tender-document', () => businessBidStore.importTenderDocument());
  ipcMain.handle('business-bid:enhance-with-ai', () => businessBidStore.enhanceWithAi());
  ipcMain.handle('business-bid:update-clause', (_event, id, patch) => businessBidStore.updateClause(id, patch));
  ipcMain.handle('business-bid:import-attachments', (_event, options) => businessBidStore.importAttachments(options));
  ipcMain.handle('business-bid:update-attachment', (_event, id, patch) => businessBidStore.updateAttachment(id, patch));
  ipcMain.handle('business-bid:delete-attachment', (_event, id) => businessBidStore.deleteAttachment(id));
  ipcMain.handle('business-bid:export-report', (_event, options) => businessBidStore.exportReport(options));
  ipcMain.handle('business-bid:export-office-package', (_event, options) => businessBidStore.exportOfficePackage(options));
  ipcMain.handle('business-bid:clear', () => businessBidStore.clear());
}

module.exports = {
  registerBusinessBidIpc,
};
