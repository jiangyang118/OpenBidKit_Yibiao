const { ipcMain } = require('electron');

function registerBidDocumentIpc({ bidDocumentStore }) {
  ipcMain.handle('bid-document:load-state', () => bidDocumentStore.loadState());
  ipcMain.handle('bid-document:save-state', (_event, payload) => bidDocumentStore.saveState(payload));
  ipcMain.handle('bid-document:validate', (_event, payload) => bidDocumentStore.validate(payload));
  ipcMain.handle('bid-document:select-asset', (_event, options) => bidDocumentStore.selectAsset(options));
  ipcMain.handle('bid-document:analyze-reference', (_event, options) => bidDocumentStore.analyzeReference(options));
  ipcMain.handle('bid-document:export-template-info', (_event, options) => bidDocumentStore.exportTemplateInfo(options));
  ipcMain.handle('bid-document:export-project-config', (_event, options) => bidDocumentStore.exportProjectConfig(options));
  ipcMain.handle('bid-document:export-readiness-report', (_event, options) => bidDocumentStore.exportReadinessReport(options));
  ipcMain.handle('bid-document:export-asset-collection-package', (_event, options) => bidDocumentStore.exportAssetCollectionPackage(options));
  ipcMain.handle('bid-document:import-asset-collection-package', (_event, options) => bidDocumentStore.importAssetCollectionPackage(options));
  ipcMain.handle('bid-document:import-project-config', (_event, options) => bidDocumentStore.importProjectConfig(options));
  ipcMain.handle('bid-document:export-word', (_event, options) => bidDocumentStore.exportWord(options));
}

module.exports = {
  registerBidDocumentIpc,
};
