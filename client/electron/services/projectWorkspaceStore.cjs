const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  getProjectRegistryPath,
  getProjectsDir,
  getProjectWorkspaceDir,
  getWorkspaceDir,
  normalizeProjectIdForPath,
} = require('../utils/paths.cjs');

const registryVersion = 1;
const defaultProjectId = 'default';

function now() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function normalizeProjectName(value, fallback = '未命名项目') {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name || fallback;
}

function createProjectId(name) {
  const ascii = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return normalizeProjectIdForPath(`${ascii || 'project'}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`);
}

function defaultProject(timestamp = now()) {
  return {
    id: defaultProjectId,
    name: '默认项目',
    description: '兼容旧版单例工作区 userData/workspace。',
    status: 'active',
    source: 'legacy-workspace',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function normalizeRegistry(raw) {
  const timestamp = now();
  const projectsById = new Map();
  const inputProjects = Array.isArray(raw?.projects) ? raw.projects : [];
  for (const item of inputProjects) {
    const id = normalizeProjectIdForPath(item?.id);
    if (!id || projectsById.has(id)) continue;
    projectsById.set(id, {
      id,
      name: normalizeProjectName(item?.name, id === defaultProjectId ? '默认项目' : '未命名项目'),
      description: String(item?.description || ''),
      status: item?.status === 'archived' ? 'archived' : 'active',
      source: String(item?.source || 'local'),
      created_at: item?.created_at || timestamp,
      updated_at: item?.updated_at || timestamp,
      archived_at: item?.archived_at || null,
    });
  }
  if (!projectsById.has(defaultProjectId)) {
    projectsById.set(defaultProjectId, defaultProject(timestamp));
  }
  const projects = [...projectsById.values()].sort((left, right) => {
    if (left.id === defaultProjectId) return -1;
    if (right.id === defaultProjectId) return 1;
    return String(left.created_at).localeCompare(String(right.created_at));
  });
  const activeProjectId = projects.some((item) => item.id === raw?.active_project_id && item.status === 'active')
    ? raw.active_project_id
    : defaultProjectId;
  return {
    version: registryVersion,
    active_project_id: activeProjectId,
    projects,
    updated_at: raw?.updated_at || timestamp,
  };
}

function copyDirectoryIfExists(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function createProjectWorkspaceStore({ app }) {
  const registryPath = getProjectRegistryPath(app);
  const projectsDir = getProjectsDir(app);

  function persist(registry) {
    const normalized = normalizeRegistry({ ...registry, updated_at: now() });
    writeJson(registryPath, normalized);
    return normalized;
  }

  function loadRegistry() {
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.mkdirSync(getWorkspaceDir(app), { recursive: true });
    const registry = normalizeRegistry(readJson(registryPath, null));
    writeJson(registryPath, registry);
    return registry;
  }

  function enrichProject(project) {
    return {
      ...project,
      is_default: project.id === defaultProjectId,
      is_active: project.id === loadRegistry().active_project_id,
      workspace_path: getProjectWorkspaceDir(app, project.id),
    };
  }

  function listProjects() {
    const registry = loadRegistry();
    return {
      version: registry.version,
      active_project_id: registry.active_project_id,
      registry_path: registryPath,
      projects_dir: projectsDir,
      projects: registry.projects.map((project) => ({
        ...project,
        is_default: project.id === defaultProjectId,
        is_active: project.id === registry.active_project_id,
        workspace_path: getProjectWorkspaceDir(app, project.id),
      })),
    };
  }

  function findProject(registry, projectId) {
    const id = normalizeProjectIdForPath(projectId);
    return registry.projects.find((project) => project.id === id) || null;
  }

  function createProject(input = {}) {
    const registry = loadRegistry();
    const timestamp = now();
    const name = normalizeProjectName(input.name);
    let id = input.id ? normalizeProjectIdForPath(input.id) : createProjectId(name);
    if (registry.projects.some((project) => project.id === id)) {
      id = createProjectId(name);
    }
    const project = {
      id,
      name,
      description: String(input.description || ''),
      status: 'active',
      source: 'local',
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    };
    fs.mkdirSync(getProjectWorkspaceDir(app, id), { recursive: true });
    const next = persist({
      ...registry,
      active_project_id: input.makeActive ? id : registry.active_project_id,
      projects: [...registry.projects, project],
    });
    return { success: true, project: enrichProject(findProject(next, id)), state: listProjects() };
  }

  function setActiveProject(projectId) {
    const registry = loadRegistry();
    const project = findProject(registry, projectId);
    if (!project) throw new Error('项目不存在');
    if (project.status === 'archived') throw new Error('归档项目不能设为当前项目');
    persist({ ...registry, active_project_id: project.id });
    return { success: true, active_project_id: project.id, restart_required: true, state: listProjects() };
  }

  function archiveProject(projectId, archived = true) {
    const registry = loadRegistry();
    const id = normalizeProjectIdForPath(projectId);
    if (id === defaultProjectId && archived) throw new Error('默认项目不能归档');
    const project = findProject(registry, id);
    if (!project) throw new Error('项目不存在');
    const timestamp = now();
    const projects = registry.projects.map((item) => item.id === id
      ? {
          ...item,
          status: archived ? 'archived' : 'active',
          archived_at: archived ? timestamp : null,
          updated_at: timestamp,
        }
      : item);
    const nextActive = archived && registry.active_project_id === id ? defaultProjectId : registry.active_project_id;
    persist({ ...registry, active_project_id: nextActive, projects });
    return { success: true, state: listProjects() };
  }

  function deleteProject(projectId, options = {}) {
    const registry = loadRegistry();
    const id = normalizeProjectIdForPath(projectId);
    if (id === defaultProjectId) throw new Error('默认项目不能删除');
    if (!findProject(registry, id)) throw new Error('项目不存在');
    const projects = registry.projects.filter((project) => project.id !== id);
    const nextActive = registry.active_project_id === id ? defaultProjectId : registry.active_project_id;
    persist({ ...registry, active_project_id: nextActive, projects });
    if (options.deleteFiles !== false) {
      fs.rmSync(path.dirname(getProjectWorkspaceDir(app, id)), { recursive: true, force: true });
    }
    return { success: true, state: listProjects() };
  }

  function duplicateProject(projectId, input = {}) {
    const registry = loadRegistry();
    const source = findProject(registry, projectId);
    if (!source) throw new Error('项目不存在');
    const name = normalizeProjectName(input.name, `${source.name} 副本`);
    const created = createProject({ name, description: input.description || source.description, makeActive: Boolean(input.makeActive) });
    copyDirectoryIfExists(getProjectWorkspaceDir(app, source.id), created.project.workspace_path);
    return { ...created, source_project_id: source.id };
  }

  function exportProjectPackage(projectId, packageDir) {
    const registry = loadRegistry();
    const project = findProject(registry, projectId);
    if (!project) throw new Error('项目不存在');
    const targetDir = path.resolve(String(packageDir || ''));
    if (!targetDir) throw new Error('缺少项目包输出目录');
    fs.mkdirSync(targetDir, { recursive: true });
    writeJson(path.join(targetDir, 'project.json'), {
      version: registryVersion,
      exported_at: now(),
      project,
    });
    copyDirectoryIfExists(getProjectWorkspaceDir(app, project.id), path.join(targetDir, 'workspace'));
    return { success: true, package_dir: targetDir, manifest_path: path.join(targetDir, 'project.json') };
  }

  function importProjectPackage(packageDir, input = {}) {
    const sourceDir = path.resolve(String(packageDir || ''));
    const manifest = readJson(path.join(sourceDir, 'project.json'), null);
    if (!manifest?.project) throw new Error('项目包缺少 project.json');
    const created = createProject({
      name: input.name || `${normalizeProjectName(manifest.project.name)} 导入`,
      description: input.description || manifest.project.description || '',
      makeActive: Boolean(input.makeActive),
    });
    copyDirectoryIfExists(path.join(sourceDir, 'workspace'), created.project.workspace_path);
    return { ...created, imported_from: sourceDir };
  }

  function getProjectWorkspacePath(projectId = defaultProjectId) {
    const registry = loadRegistry();
    const project = findProject(registry, projectId);
    if (!project) throw new Error('项目不存在');
    return { project_id: project.id, workspace_path: getProjectWorkspaceDir(app, project.id) };
  }

  function getActiveProject() {
    const state = listProjects();
    const project = state.projects.find((item) => item.id === state.active_project_id) || state.projects.find((item) => item.id === defaultProjectId);
    return {
      project,
      workspace_path: project?.workspace_path || getProjectWorkspaceDir(app, defaultProjectId),
    };
  }

  return {
    listProjects,
    createProject,
    setActiveProject,
    archiveProject,
    deleteProject,
    duplicateProject,
    exportProjectPackage,
    importProjectPackage,
    getActiveProject,
    getProjectWorkspacePath,
    getRegistryPath: () => registryPath,
  };
}

module.exports = {
  createProjectWorkspaceStore,
  defaultProjectId,
};
