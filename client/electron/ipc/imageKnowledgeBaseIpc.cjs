const { ipcMain } = require('electron');

function registerImageKnowledgeBaseIpc({ imageKnowledgeBaseStore }) {
  ipcMain.handle('image-knowledge-base:list', (_event, query) => imageKnowledgeBaseStore.list(query));
  ipcMain.handle('image-knowledge-base:upload-images', () => imageKnowledgeBaseStore.uploadImages());
  ipcMain.handle('image-knowledge-base:import-historical-archives', (_event, section) => imageKnowledgeBaseStore.importHistoricalArchives(section));
  ipcMain.handle('image-knowledge-base:update-asset', (_event, id, patch) => imageKnowledgeBaseStore.updateAsset(id, patch));
  ipcMain.handle('image-knowledge-base:batch-update-assets', (_event, payload) => imageKnowledgeBaseStore.batchUpdateAssets(payload));
  ipcMain.handle('image-knowledge-base:rename-tag', (_event, oldTag, newTag) => imageKnowledgeBaseStore.renameTag(oldTag, newTag));
  ipcMain.handle('image-knowledge-base:delete-tag', (_event, tag) => imageKnowledgeBaseStore.deleteTag(tag));
  ipcMain.handle('image-knowledge-base:delete-asset', (_event, id) => imageKnowledgeBaseStore.deleteAsset(id));
  ipcMain.handle('image-knowledge-base:batch-delete-assets', (_event, ids) => imageKnowledgeBaseStore.batchDeleteAssets(ids));
  ipcMain.handle('image-knowledge-base:create-markdown-reference', (_event, payload) => imageKnowledgeBaseStore.createMarkdownReference(payload));
  ipcMain.handle('image-knowledge-base:list-references', (_event, imageId) => imageKnowledgeBaseStore.listReferences(imageId));
}

module.exports = {
  registerImageKnowledgeBaseIpc,
};
