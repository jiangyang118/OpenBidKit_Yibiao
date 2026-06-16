const path = require('node:path');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    if (key === '--make-active') {
      options.makeActive = true;
      continue;
    }
    options[key.slice(2)] = argv[index + 1] || '';
    index += 1;
  }
  return options;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node project_workspace.cjs --user-data <path> --action <list|create|set-active|archive|restore|duplicate|export-package|import-package|get-workspace-path> [options]');
  process.exit(2);
}

function createHeadlessApp(userDataPath) {
  const userData = path.resolve(userDataPath);
  return {
    getPath(name) {
      if (name === 'userData') return userData;
      throw new Error(`Unsupported app path: ${name}`);
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  const userData = String(options['user-data'] || '').trim();
  if (!userData) usage('Missing --user-data.');
  const action = String(options.action || '').trim();
  if (!action) usage('Missing --action.');

  const { createProjectWorkspaceStore } = require(path.join(repoRoot, 'client/electron/services/projectWorkspaceStore.cjs'));
  const store = createProjectWorkspaceStore({ app: createHeadlessApp(userData) });
  let result;

  if (action === 'list') {
    result = store.listProjects();
  } else if (action === 'create') {
    if (!options.name) usage('Missing --name.');
    result = store.createProject({
      name: options.name,
      description: options.description || '',
      makeActive: Boolean(options.makeActive),
    });
  } else if (action === 'set-active') {
    if (!options['project-id']) usage('Missing --project-id.');
    result = store.setActiveProject(options['project-id']);
  } else if (action === 'archive' || action === 'restore') {
    if (!options['project-id']) usage('Missing --project-id.');
    result = store.archiveProject(options['project-id'], action === 'archive');
  } else if (action === 'duplicate') {
    if (!options['project-id']) usage('Missing --project-id.');
    result = store.duplicateProject(options['project-id'], {
      name: options.name || '',
      description: options.description || '',
      makeActive: Boolean(options.makeActive),
    });
  } else if (action === 'export-package') {
    if (!options['project-id']) usage('Missing --project-id.');
    if (!options['package-dir']) usage('Missing --package-dir.');
    result = store.exportProjectPackage(options['project-id'], options['package-dir']);
  } else if (action === 'import-package') {
    if (!options['package-dir']) usage('Missing --package-dir.');
    result = store.importProjectPackage(options['package-dir'], {
      name: options.name || '',
      description: options.description || '',
      makeActive: Boolean(options.makeActive),
    });
  } else if (action === 'get-workspace-path') {
    result = store.getProjectWorkspacePath(options['project-id'] || 'default');
  } else {
    usage(`Unsupported action: ${action}`);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, action, user_data: path.resolve(userData), result })}\n`);
}

try {
  main();
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    stack: error?.stack || '',
  })}\n`);
  process.exit(1);
}
