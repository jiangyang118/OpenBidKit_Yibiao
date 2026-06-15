const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    if (key === '--list') {
      options.list = true;
      continue;
    }
    options[key.slice(2)] = argv[index + 1] || '';
    index += 1;
  }
  return options;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node task_plan.cjs --list | --type <task-type> [--payload-json <path>]');
  process.exit(2);
}

function readPayload(payloadPath) {
  if (!payloadPath) return {};
  const absolutePath = path.resolve(payloadPath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');

  const taskServicePath = path.join(repoRoot, 'client/electron/services/taskService.cjs');
  const taskService = require(taskServicePath);
  if (options.list) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      tasks: taskService.listTaskDefinitions(),
    })}\n`);
    return;
  }

  const type = String(options.type || '').trim();
  if (!type) usage('Missing --type.');
  const payload = readPayload(String(options['payload-json'] || '').trim());
  const plan = taskService.createHeadlessTaskStartPlan(type, payload);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
  if (!plan.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
