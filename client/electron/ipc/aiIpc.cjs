const { ipcMain } = require('electron');

function registerAiIpc({ aiService }) {
  ipcMain.handle('ai:chat', (_event, request) => aiService.chat(request));
  ipcMain.handle('ai:request-json', (_event, request) => aiService.requestJson(request));
  ipcMain.handle('ai:list-json-failure-samples', () => aiService.listJsonFailureSamples());
  ipcMain.handle('ai:list-json-replay-logs', () => aiService.listJsonReplayLogs());
  ipcMain.handle('ai:save-json-failure-sample', (_event, sample) => aiService.saveJsonFailureSample(sample));
  ipcMain.handle('ai:clear-json-failure-samples', () => aiService.clearJsonFailureSamples());
  ipcMain.handle('ai:test-image-model', (_event, config) => aiService.testImageModel(config));
}

module.exports = {
  registerAiIpc,
};
