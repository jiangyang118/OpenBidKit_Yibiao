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
  console.error('Usage: node export_report.cjs --kind duplicate|rejection|business-bid|ai-evaluation|bid-opportunity --state-json <path> --output <path> [--format md|docx|pdf|xlsx]');
  process.exit(2);
}

const reportDefinitions = {
  duplicate: {
    service: 'client/electron/services/duplicateCheckStore.cjs',
    formats: ['md', 'docx', 'pdf'],
    builders: {
      md: 'buildDuplicateCheckReportMarkdown',
      docx: 'buildDuplicateCheckReportDocxBuffer',
      pdf: 'buildDuplicateCheckReportPdfBuffer',
    },
  },
  rejection: {
    service: 'client/electron/services/rejectionCheckStore.cjs',
    formats: ['md', 'docx', 'pdf'],
    builders: {
      md: 'buildRejectionCheckReportMarkdown',
      docx: 'buildRejectionCheckReportDocxBuffer',
      pdf: 'buildRejectionCheckReportPdfBuffer',
    },
  },
  'business-bid': {
    service: 'client/electron/services/businessBidStore.cjs',
    formats: ['md', 'docx', 'xlsx'],
    builders: {
      md: 'buildBusinessBidReportMarkdown',
      docx: 'buildBusinessBidWordBuffer',
      xlsx: 'buildBusinessBidExcelBuffer',
    },
  },
  'ai-evaluation': {
    service: 'client/electron/services/aiEvaluationStore.cjs',
    formats: ['md', 'docx', 'xlsx'],
    builders: {
      md: 'buildAiEvaluationReportMarkdown',
      docx: 'buildAiEvaluationWordBuffer',
      xlsx: 'buildAiEvaluationExcelBuffer',
    },
  },
  'bid-opportunity': {
    service: 'client/electron/services/bidOpportunityStore.cjs',
    formats: ['md'],
    builders: {
      md: 'buildBidOpportunityReportMarkdown',
    },
  },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const kind = String(options.kind || '').trim();
  const format = String(options.format || 'md').trim().toLowerCase();
  const statePath = String(options['state-json'] || '').trim();
  const outputPath = String(options.output || '').trim();
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();

  const definition = reportDefinitions[kind];
  if (!definition) usage('Invalid --kind.');
  if (!definition.formats.includes(format)) usage(`Invalid --format for ${kind}. Supported formats: ${definition.formats.join(', ')}.`);
  if (!statePath) usage('Missing --state-json.');
  if (!outputPath) usage('Missing --output.');
  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');

  const absoluteStatePath = path.resolve(statePath);
  const absoluteOutputPath = path.resolve(outputPath);
  const state = JSON.parse(fs.readFileSync(absoluteStatePath, 'utf-8'));
  const servicePath = path.join(repoRoot, definition.service);
  const service = require(servicePath);
  const buildMarkdown = service[definition.builders.md];
  const buildOutput = service[definition.builders[format]];

  if (typeof buildMarkdown !== 'function') {
    throw new Error(`Markdown report builder is not exported by ${servicePath}`);
  }
  if (typeof buildOutput !== 'function') {
    throw new Error(`${format} report builder is not exported by ${servicePath}`);
  }

  const markdown = buildMarkdown(state);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });

  let bytes = Buffer.byteLength(markdown, 'utf-8');
  if (format !== 'md') {
    const buffer = await buildOutput(state);
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
