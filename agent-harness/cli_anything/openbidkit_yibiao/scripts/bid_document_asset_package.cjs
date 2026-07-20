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
  console.error('Usage: node bid_document_asset_package.cjs --input <project-config.json> --output-dir <collection-dir>');
  process.exit(2);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const input = String(options.input || '').trim();
  const outputDir = String(options['output-dir'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!input) usage('Missing --input.');
  if (!outputDir) usage('Missing --output-dir.');

  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) usage(`Input JSON does not exist: ${inputPath}`);

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { validateBidDocumentProject } = require(path.join(repoRoot, 'client/electron/services/bidDocumentValidation.cjs'));
  const {
    readBidDocumentProjectConfig,
    resolveProjectConfigAssetMap,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentProjectConfig.cjs'));
  const {
    applyDemoAssetPackageGuard,
    buildAssetInventory,
    createReadinessReport,
    writeAssetCollectionPackage,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReadinessReport.cjs'));

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
    process.stdout.write(`${JSON.stringify({
      ok: false,
      input: inputPath,
      output_dir: path.resolve(outputDir),
      error: error.code,
      template_id: error.templateId || templateId || '',
      available_template_ids: error.availableTemplateIds || [],
      readiness_ready: false,
      build_log: createTemplateErrorBuildLog(error, templateId),
    })}\n`);
    process.exitCode = 1;
    return;
  }
  const buildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(project), config.assetPackage || null);
  const readinessReport = createReadinessReport({
    ...project,
    assetPackage: config.assetPackage || null,
  }, buildLog);
  const assetInventory = buildAssetInventory(project.assetMap || {}, project.template?.sections || [], config.assetPackage || null, {
    projectData: project.projectData || {},
    template: project.template || {},
  });
  const packageResult = writeAssetCollectionPackage({
    outputDir,
    projectData: project.projectData || {},
    template: project.template || {},
    assetInventory,
    readinessReport,
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    input: inputPath,
    output_dir: packageResult.outputDir,
    assets_dir: packageResult.assetsDir,
    manifest_path: packageResult.manifestPath,
    manifest_schema_path: packageResult.manifestSchemaPath,
    markdown_path: packageResult.markdownPath,
    quote_resolution_path: packageResult.quoteResolutionPath,
    quote_resolution_schema_path: packageResult.quoteResolutionSchemaPath,
    asset_count: packageResult.manifest.assetCount,
    demo_only_asset_count: packageResult.manifest.demoOnlyAssetCount,
    replacement_required_asset_count: packageResult.manifest.replacementRequiredAssetCount,
    missing_required_asset_count: packageResult.manifest.missingRequiredAssetCount,
    readiness_ready: packageResult.manifest.readinessReady,
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
