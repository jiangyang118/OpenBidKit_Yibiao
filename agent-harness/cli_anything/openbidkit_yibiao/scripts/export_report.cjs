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
  console.error('Usage: node export_report.cjs --kind duplicate|rejection --state-json <path> --output <path> [--format md|docx|pdf]');
  process.exit(2);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const kind = String(options.kind || '').trim();
  const format = String(options.format || 'md').trim().toLowerCase();
  const statePath = String(options['state-json'] || '').trim();
  const outputPath = String(options.output || '').trim();
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();

  if (!['duplicate', 'rejection'].includes(kind)) usage('Invalid --kind.');
  if (!['md', 'docx', 'pdf'].includes(format)) usage('Invalid --format.');
  if (!statePath) usage('Missing --state-json.');
  if (!outputPath) usage('Missing --output.');
  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');

  const absoluteStatePath = path.resolve(statePath);
  const absoluteOutputPath = path.resolve(outputPath);
  const state = JSON.parse(fs.readFileSync(absoluteStatePath, 'utf-8'));
  const servicePath = kind === 'duplicate'
    ? path.join(repoRoot, 'client/electron/services/duplicateCheckStore.cjs')
    : path.join(repoRoot, 'client/electron/services/rejectionCheckStore.cjs');
  const service = require(servicePath);
  const buildMarkdown = kind === 'duplicate'
    ? service.buildDuplicateCheckReportMarkdown
    : service.buildRejectionCheckReportMarkdown;
  const buildDocxBuffer = kind === 'duplicate'
    ? service.buildDuplicateCheckReportDocxBuffer
    : service.buildRejectionCheckReportDocxBuffer;
  const buildPdfBuffer = kind === 'duplicate'
    ? service.buildDuplicateCheckReportPdfBuffer
    : service.buildRejectionCheckReportPdfBuffer;

  if (typeof buildMarkdown !== 'function') {
    throw new Error(`Markdown report builder is not exported by ${servicePath}`);
  }
  if (format === 'docx' && typeof buildDocxBuffer !== 'function') {
    throw new Error(`Word report builder is not exported by ${servicePath}`);
  }
  if (format === 'pdf' && typeof buildPdfBuffer !== 'function') {
    throw new Error(`PDF report builder is not exported by ${servicePath}`);
  }

  const markdown = buildMarkdown(state);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });

  let bytes = Buffer.byteLength(markdown, 'utf-8');
  if (format === 'docx') {
    const buffer = await buildDocxBuffer(state);
    bytes = buffer.length;
    fs.writeFileSync(absoluteOutputPath, buffer);
  } else if (format === 'pdf') {
    const buffer = buildPdfBuffer(state);
    bytes = buffer.length;
    fs.writeFileSync(absoluteOutputPath, buffer);
  } else {
    fs.writeFileSync(absoluteOutputPath, markdown, 'utf-8');
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    kind,
    format,
    state_json: absoluteStatePath,
    output: absoluteOutputPath,
    markdown_chars: markdown.length,
    bytes,
  })}\n`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
