const { ipcMain } = require('electron');

function registerFileIpc({ fileService }) {
  ipcMain.handle('file:select-duplicate-check-files', (_event, options) => fileService.selectDuplicateCheckFiles(options));
  ipcMain.handle('file:parse-developer-sample', (_event, options) => fileService.parseDeveloperSample(options));
  ipcMain.handle('file:get-developer-parser-capabilities', () => fileService.getDeveloperParserCapabilities());
}

module.exports = {
  registerFileIpc,
};
