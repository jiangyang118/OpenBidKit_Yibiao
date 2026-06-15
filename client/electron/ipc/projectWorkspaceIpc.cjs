const { ipcMain } = require('electron');

function registerProjectWorkspaceIpc({ projectWorkspaceStore }) {
  ipcMain.handle('project-workspace:list', () => projectWorkspaceStore.listProjects());
  ipcMain.handle('project-workspace:create', (_event, payload) => projectWorkspaceStore.createProject(payload));
  ipcMain.handle('project-workspace:set-active', (_event, projectId) => projectWorkspaceStore.setActiveProject(projectId));
  ipcMain.handle('project-workspace:archive', (_event, projectId, archived) => projectWorkspaceStore.archiveProject(projectId, archived));
  ipcMain.handle('project-workspace:delete', (_event, projectId, options) => projectWorkspaceStore.deleteProject(projectId, options));
  ipcMain.handle('project-workspace:duplicate', (_event, projectId, payload) => projectWorkspaceStore.duplicateProject(projectId, payload));
  ipcMain.handle('project-workspace:export-package', (_event, projectId, packageDir) => projectWorkspaceStore.exportProjectPackage(projectId, packageDir));
  ipcMain.handle('project-workspace:import-package', (_event, packageDir, payload) => projectWorkspaceStore.importProjectPackage(packageDir, payload));
  ipcMain.handle('project-workspace:get-workspace-path', (_event, projectId) => projectWorkspaceStore.getProjectWorkspacePath(projectId));
}

module.exports = {
  registerProjectWorkspaceIpc,
};
