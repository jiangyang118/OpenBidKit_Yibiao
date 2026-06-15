const { ipcMain } = require('electron');

function registerBidOpportunityIpc({ bidOpportunityStore }) {
  ipcMain.handle('bid-opportunity:load-state', () => bidOpportunityStore.loadState());
  ipcMain.handle('bid-opportunity:save-opportunity', (_event, payload) => bidOpportunityStore.saveOpportunity(payload));
  ipcMain.handle('bid-opportunity:save-opportunity-with-ai', (_event, payload) => bidOpportunityStore.saveOpportunityWithAi(payload));
  ipcMain.handle('bid-opportunity:import-document', () => bidOpportunityStore.importOpportunityDocument());
  ipcMain.handle('bid-opportunity:import-url', (_event, payload) => bidOpportunityStore.importOpportunityUrl(payload));
  ipcMain.handle('bid-opportunity:update-follow-up', (_event, id, patch) => bidOpportunityStore.updateFollowUp(id, patch));
  ipcMain.handle('bid-opportunity:update-status', (_event, id, status) => bidOpportunityStore.updateStatus(id, status));
  ipcMain.handle('bid-opportunity:delete-opportunity', (_event, id) => bidOpportunityStore.deleteOpportunity(id));
  ipcMain.handle('bid-opportunity:export-report', (_event, options) => bidOpportunityStore.exportReport(options));
  ipcMain.handle('bid-opportunity:export-calendar', (_event, options) => bidOpportunityStore.exportCalendar(options));
  ipcMain.handle('bid-opportunity:clear', () => bidOpportunityStore.clear());
}

module.exports = {
  registerBidOpportunityIpc,
};
