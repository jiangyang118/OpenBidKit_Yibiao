const { ipcMain } = require('electron');

async function applyProjectSwitch(result, onActiveProjectChanged) {
  if (result?.success && result.active_project_id && typeof onActiveProjectChanged === 'function') {
    await onActiveProjectChanged(result.active_project_id);
    return {
      ...result,
      restart_required: false,
      runtime_reloaded: true,
    };
  }
  if (result?.success && result.state?.active_project_id && typeof onActiveProjectChanged === 'function') {
    const activeProject = result.state.projects?.find((project) => project.is_active);
    if (activeProject) {
      await onActiveProjectChanged(activeProject.id);
      return {
        ...result,
        restart_required: false,
        runtime_reloaded: true,
      };
    }
  }
  return result;
}

function registerProjectWorkspaceIpc({ projectWorkspaceStore, onActiveProjectChanged }) {
  ipcMain.handle('project-workspace:list', () => projectWorkspaceStore.listProjects());
  ipcMain.handle('project-workspace:create', async (_event, payload) => {
    const result = projectWorkspaceStore.createProject(payload);
    return payload?.makeActive ? applyProjectSwitch(result, onActiveProjectChanged) : result;
  });
  ipcMain.handle('project-workspace:set-active', async (_event, projectId) => {
    const result = projectWorkspaceStore.setActiveProject(projectId);
    return applyProjectSwitch(result, onActiveProjectChanged);
  });
  ipcMain.handle('project-workspace:archive', (_event, projectId, archived) => projectWorkspaceStore.archiveProject(projectId, archived));
  ipcMain.handle('project-workspace:delete', (_event, projectId, options) => projectWorkspaceStore.deleteProject(projectId, options));
  ipcMain.handle('project-workspace:duplicate', async (_event, projectId, payload) => {
    const result = projectWorkspaceStore.duplicateProject(projectId, payload);
    return payload?.makeActive ? applyProjectSwitch(result, onActiveProjectChanged) : result;
  });
  ipcMain.handle('project-workspace:export-package', (_event, projectId, packageDir) => projectWorkspaceStore.exportProjectPackage(projectId, packageDir));
  ipcMain.handle('project-workspace:import-package', async (_event, packageDir, payload) => {
    const result = projectWorkspaceStore.importProjectPackage(packageDir, payload);
    return payload?.makeActive ? applyProjectSwitch(result, onActiveProjectChanged) : result;
  });
  ipcMain.handle('project-workspace:get-workspace-path', (_event, projectId) => projectWorkspaceStore.getProjectWorkspacePath(projectId));
}

module.exports = {
  registerProjectWorkspaceIpc,
};
