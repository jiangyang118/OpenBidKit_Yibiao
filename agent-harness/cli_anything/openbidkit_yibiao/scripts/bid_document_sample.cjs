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
  console.error('Usage: node bid_document_sample.cjs --output-dir <dir> [--template-id generic-response|smart-canteen-response]');
  process.exit(2);
}

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function attachSampleAssets(sample, outputDir) {
  const assetDir = path.join(outputDir, 'assets');
  ensureDir(assetDir);
  sample.assetMap = Object.fromEntries(Object.entries(sample.assetMap || {}).map(([key, asset]) => {
    const filePath = path.join(assetDir, `${key}.png`);
    fs.writeFileSync(filePath, onePixelPng);
    return [key, {
      ...asset,
      filePath,
      type: 'image',
      required: true,
    }];
  }));
  return sample;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const outputDir = String(options['output-dir'] || '').trim();
  const templateId = String(options['template-id'] || 'generic-response').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!outputDir) usage('Missing --output-dir.');

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { writeBidDocumentWordFile } = require(path.join(repoRoot, 'client/electron/services/bidDocumentWordBuilder.cjs'));

  const absoluteOutputDir = path.resolve(outputDir);
  ensureDir(absoluteOutputDir);
  let sample;
  try {
    sample = attachSampleAssets(createBidDocumentSample({ templateId }), absoluteOutputDir);
  } catch (error) {
    if (error?.code !== 'unknown_template_id') throw error;
    writeJson({
      ok: false,
      error: error.code,
      template_id: error.templateId || templateId,
      available_template_ids: error.availableTemplateIds || [],
      output_dir: absoluteOutputDir,
      message: error.message || String(error),
    });
    process.exitCode = 1;
    return;
  }
  const baseName = `${templateId}-sample`;
  const outputPath = path.join(absoluteOutputDir, `${baseName}.docx`);
  const logPath = path.join(absoluteOutputDir, `${baseName}.build-log.json`);
  const result = await writeBidDocumentWordFile(sample, outputPath);
  fs.writeFileSync(logPath, JSON.stringify(result.buildLog, null, 2), 'utf8');

  writeJson({
    ok: Boolean(result.success),
    template_id: templateId,
    output_dir: absoluteOutputDir,
    output: outputPath,
    log_path: logPath,
    bytes: result.bytes,
    build_log: {
      passed: Boolean(result.buildLog?.passed),
      errors: result.buildLog?.errors || [],
      templateCheck: result.buildLog?.templateCheck,
      quoteCheck: result.buildLog?.quoteCheck,
      paymentCheck: result.buildLog?.paymentCheck,
      titleCheck: result.buildLog?.titleCheck,
      identityCheck: result.buildLog?.identityCheck,
      forbiddenWordsCheck: result.buildLog?.forbiddenWordsCheck,
      assetCheck: result.buildLog?.assetCheck,
      sectionSelectionCheck: result.buildLog?.sectionSelectionCheck,
      sectionCheck: result.buildLog?.sectionCheck,
      docxOpenCheck: result.buildLog?.docxOpenCheck,
      docxContentCheck: result.buildLog?.docxContentCheck,
      docxSectionOrderCheck: result.buildLog?.docxSectionOrderCheck,
      docxTableCheck: result.buildLog?.docxTableCheck,
      docxQuoteIntegrityCheck: result.buildLog?.docxQuoteIntegrityCheck,
      docxLayoutCheck: result.buildLog?.docxLayoutCheck,
      docxTocCheck: result.buildLog?.docxTocCheck,
      docxStyleCheck: result.buildLog?.docxStyleCheck,
      docxTechnicalDensityCheck: result.buildLog?.docxTechnicalDensityCheck,
      docxPageBreakCheck: result.buildLog?.docxPageBreakCheck,
      imageInsertionCheck: result.buildLog?.imageInsertionCheck,
      docxAssetPlacementCheck: result.buildLog?.docxAssetPlacementCheck,
      docxForbiddenWordsCheck: result.buildLog?.docxForbiddenWordsCheck,
    },
  });

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
