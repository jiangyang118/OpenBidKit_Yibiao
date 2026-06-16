const { ipcMain } = require('electron');

function registerBidMarketAnalysisIpc({ bidMarketAnalysisStore }) {
  ipcMain.handle('bid-market-analysis:load-state', () => bidMarketAnalysisStore.loadState());
}

module.exports = { registerBidMarketAnalysisIpc };
