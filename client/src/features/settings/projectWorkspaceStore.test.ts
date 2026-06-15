// @vitest-environment node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createProjectWorkspaceStore } = require('../../../electron/services/projectWorkspaceStore.cjs') as {
  createProjectWorkspaceStore: (context: { app: { getPath: (name: string) => string } }) => {
    listProjects: () => {
      active_project_id: string;
      registry_path: string;
      projects: Array<{ id: string; name: string; status: string; is_default: boolean; is_active: boolean; workspace_path: string }>;
    };
    createProject: (input: { name: string; description?: string; makeActive?: boolean }) => {
      success: boolean;
      project: { id: string; workspace_path: string; is_active: boolean };
      state: { active_project_id: string; projects: Array<{ id: string }> };
    };
    setActiveProject: (projectId: string) => { success: boolean; active_project_id: string; restart_required: boolean };
    archiveProject: (projectId: string, archived?: boolean) => { success: boolean; state: { active_project_id: string; projects: Array<{ id: string; status: string }> } };
    deleteProject: (projectId: string, options?: { deleteFiles?: boolean }) => { success: boolean; state: { projects: Array<{ id: string }> } };
    duplicateProject: (projectId: string, input?: { name?: string; makeActive?: boolean }) => {
      success: boolean;
      source_project_id: string;
      project: { id: string; workspace_path: string };
    };
    exportProjectPackage: (projectId: string, packageDir: string) => { success: boolean; package_dir: string; manifest_path: string };
    importProjectPackage: (packageDir: string, input?: { name?: string; makeActive?: boolean }) => {
      success: boolean;
      imported_from: string;
      project: { id: string; workspace_path: string };
    };
    getProjectWorkspacePath: (projectId?: string) => { project_id: string; workspace_path: string };
  };
};
const { getWorkspaceDatabasePath, getWorkspaceDir } = require('../../../electron/utils/paths.cjs') as {
  getWorkspaceDatabasePath: (app: { getPath: (name: string) => string; getYibiaoWorkspaceDir?: () => string }) => string;
  getWorkspaceDir: (app: { getPath: (name: string) => string; getYibiaoWorkspaceDir?: () => string }) => string;
};

const tempDirs: string[] = [];

function createStore() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-project-workspace-'));
  tempDirs.push(userDataDir);
  const app = {
    getPath(name: string) {
      if (name !== 'userData') throw new Error(`unexpected app path: ${name}`);
      return userDataDir;
    },
  };
  return { store: createProjectWorkspaceStore({ app }), userDataDir };
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('projectWorkspaceStore', () => {
  it('creates a registry with the legacy default workspace', () => {
    const { store, userDataDir } = createStore();

    const state = store.listProjects();
    const defaultProject = state.projects.find((project) => project.id === 'default');

    expect(state.active_project_id).toBe('default');
    expect(fs.existsSync(state.registry_path)).toBe(true);
    expect(defaultProject).toMatchObject({
      id: 'default',
      name: '默认项目',
      status: 'active',
      is_default: true,
      is_active: true,
      workspace_path: path.join(userDataDir, 'workspace'),
    });
  });

  it('creates, activates, archives, restores, and deletes a project without touching the default workspace', () => {
    const { store, userDataDir } = createStore();

    const created = store.createProject({ name: '医院智慧餐厅投标', makeActive: true });
    expect(created.success).toBe(true);
    expect(created.project.is_active).toBe(true);
    expect(created.project.workspace_path).toContain(path.join(userDataDir, 'projects'));
    expect(fs.existsSync(created.project.workspace_path)).toBe(true);

    const active = store.setActiveProject(created.project.id);
    expect(active).toMatchObject({ success: true, active_project_id: created.project.id, restart_required: true });

    const archived = store.archiveProject(created.project.id, true);
    expect(archived.state.active_project_id).toBe('default');
    expect(archived.state.projects.find((project) => project.id === created.project.id)?.status).toBe('archived');

    const restored = store.archiveProject(created.project.id, false);
    expect(restored.state.projects.find((project) => project.id === created.project.id)?.status).toBe('active');

    const deleted = store.deleteProject(created.project.id);
    expect(deleted.state.projects.some((project) => project.id === created.project.id)).toBe(false);
    expect(fs.existsSync(path.dirname(created.project.workspace_path))).toBe(false);
    expect(fs.existsSync(path.join(userDataDir, 'workspace'))).toBe(true);
  });

  it('duplicates, exports, and imports project workspace files', () => {
    const { store, userDataDir } = createStore();
    const defaultWorkspace = path.join(userDataDir, 'workspace');
    fs.mkdirSync(defaultWorkspace, { recursive: true });
    fs.writeFileSync(path.join(defaultWorkspace, 'proof.txt'), '默认项目资料', 'utf-8');

    const duplicated = store.duplicateProject('default', { name: '复制项目' });
    expect(duplicated.source_project_id).toBe('default');
    expect(fs.readFileSync(path.join(duplicated.project.workspace_path, 'proof.txt'), 'utf-8')).toBe('默认项目资料');

    const packageDir = path.join(userDataDir, 'packages', 'copy-package');
    const exported = store.exportProjectPackage(duplicated.project.id, packageDir);
    expect(exported.success).toBe(true);
    expect(fs.existsSync(exported.manifest_path)).toBe(true);
    expect(fs.readFileSync(path.join(packageDir, 'workspace', 'proof.txt'), 'utf-8')).toBe('默认项目资料');

    fs.writeFileSync(path.join(packageDir, 'workspace', 'imported.txt'), '导入包资料', 'utf-8');
    const imported = store.importProjectPackage(packageDir, { name: '导入项目', makeActive: true });
    expect(imported.success).toBe(true);
    expect(imported.imported_from).toBe(packageDir);
    expect(fs.readFileSync(path.join(imported.project.workspace_path, 'imported.txt'), 'utf-8')).toBe('导入包资料');
    expect(store.getProjectWorkspacePath(imported.project.id).workspace_path).toBe(imported.project.workspace_path);
    expect(store.listProjects().active_project_id).toBe(imported.project.id);
  });

  it('lets workspace path helpers resolve to the active project workspace via a scoped app', () => {
    const { store, userDataDir } = createStore();
    const created = store.createProject({ name: '多项目路径验证', makeActive: true });
    const active = store.getProjectWorkspacePath(created.project.id);
    const scopedApp = {
      getPath(name: string) {
        if (name !== 'userData') throw new Error(`unexpected app path: ${name}`);
        return userDataDir;
      },
      getYibiaoWorkspaceDir() {
        return active.workspace_path;
      },
    };

    expect(getWorkspaceDir(scopedApp)).toBe(active.workspace_path);
    expect(getWorkspaceDatabasePath(scopedApp)).toBe(path.join(active.workspace_path, 'yibiao.sqlite'));
    expect(store.getProjectWorkspacePath('default').workspace_path).toBe(path.join(userDataDir, 'workspace'));
  });

});
