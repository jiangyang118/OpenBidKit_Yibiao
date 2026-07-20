const fs = require('node:fs');
const path = require('node:path');
const { createTemplateErrorBuildLog } = require('./bid_document_build_log_helper.cjs');

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
  console.error('Usage: node bid_document_validate_config.cjs --input <project-config.json> [--output-json <build-log.json>]');
  process.exit(2);
}

function writePayload(payload, outputJson = '') {
  if (outputJson) {
    const outputPath = path.resolve(outputJson);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const input = String(options.input || '').trim();
  const outputJson = String(options['output-json'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!input) usage('Missing --input.');

  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) usage(`Input JSON does not exist: ${inputPath}`);

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { validateBidDocumentProject } = require(path.join(repoRoot, 'client/electron/services/bidDocumentValidation.cjs'));
  const {
    readBidDocumentProjectConfig,
    resolveProjectConfigAssetMap,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentProjectConfig.cjs'));

  const config = readBidDocumentProjectConfig(inputPath);
  const templateId = config.templateId || config.projectData?.templateId;
  let project;
  try {
    project = createBidDocumentSample({
      templateId,
      projectData: config.projectData || {},
      quoteItems: config.quoteItems,
      assetMap: resolveProjectConfigAssetMap(config.assetMap || {}, inputPath),
    });
  } catch (error) {
    if (error?.code !== 'unknown_template_id') throw error;
    const payload = {
      ok: false,
      input: inputPath,
      output_json: outputJson ? path.resolve(outputJson) : '',
      error: error.code,
      template_id: error.templateId || templateId || '',
      available_template_ids: error.availableTemplateIds || [],
      build_log: createTemplateErrorBuildLog(error, templateId),
    };
    writePayload(payload, outputJson);
    process.exitCode = 1;
    return;
  }
  const buildLog = validateBidDocumentProject(project);
  const quoteTotal = (project.quoteItems || []).reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0);
  const payload = {
    ok: Boolean(buildLog.passed),
    input: inputPath,
    output_json: outputJson ? path.resolve(outputJson) : '',
    template_id: project.template?.id || templateId || '',
    project_name: project.projectData?.projectName || '',
    quote_total: quoteTotal,
    target_total: Number(project.projectData?.totalWithTax || 0),
    build_log: buildLog,
  };

  writePayload(payload, outputJson);
  if (!payload.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
