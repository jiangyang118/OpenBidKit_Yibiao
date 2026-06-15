const { ipcMain } = require('electron');

function registerAiEvaluationIpc({ aiEvaluationStore }) {
  ipcMain.handle('ai-evaluation:load-state', () => aiEvaluationStore.loadState());
  ipcMain.handle('ai-evaluation:generate-from-technical-plan', () => aiEvaluationStore.generateFromTechnicalPlan());
  ipcMain.handle('ai-evaluation:import-bid-document', () => aiEvaluationStore.importBidDocument());
  ipcMain.handle('ai-evaluation:update-item', (_event, id, patch) => aiEvaluationStore.updateItem(id, patch));
  ipcMain.handle('ai-evaluation:save-expert-score', (_event, payload) => aiEvaluationStore.saveExpertScore(payload));
  ipcMain.handle('ai-evaluation:export-report', (_event, options) => aiEvaluationStore.exportReport(options));
  ipcMain.handle('ai-evaluation:export-office-package', (_event, options) => aiEvaluationStore.exportOfficePackage(options));
  ipcMain.handle('ai-evaluation:clear', () => aiEvaluationStore.clear());
}

module.exports = {
  registerAiEvaluationIpc,
};
