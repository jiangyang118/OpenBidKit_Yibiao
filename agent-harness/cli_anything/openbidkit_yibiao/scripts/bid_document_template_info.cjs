const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    options[key.slice(2)] = argv[index + 1] || '';
    index += 1;
  }
  return options;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node bid_document_template_info.cjs [--template-id generic-response|smart-canteen-response] [--output-json <template-info.json>]');
  process.exit(2);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const templateId = String(options['template-id'] || '').trim();
  const outputJson = String(options['output-json'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');

  const { getBidDocumentTemplateInfo } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const payload = getBidDocumentTemplateInfo(templateId);
  if (outputJson) {
    const outputPath = path.resolve(outputJson);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (!payload.ok) process.exitCode = 1;
}

main();
