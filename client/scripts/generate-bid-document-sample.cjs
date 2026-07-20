const fs = require('node:fs');
const path = require('node:path');
const { createBidDocumentSample } = require('../electron/services/bidDocumentTemplates.cjs');
const { writeBidDocumentWordFile } = require('../electron/services/bidDocumentWordBuilder.cjs');

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createAsset(outputDir, key, title, sectionId) {
  const assetDir = path.join(outputDir, 'assets');
  ensureDir(assetDir);
  const filePath = path.join(assetDir, `${key}.png`);
  fs.writeFileSync(filePath, onePixelPng);
  return {
    key,
    title,
    filePath,
    type: 'image',
    required: true,
    sectionId,
  };
}

function createGenericSample(outputDir) {
  const sample = createBidDocumentSample({ templateId: 'generic-response' });
  sample.assetMap = Object.fromEntries(Object.entries(sample.assetMap).map(([key, asset]) => [
    key,
    {
      ...asset,
      ...createAsset(outputDir, key, asset.title, asset.sectionId),
    },
  ]));
  return sample;
}

async function main() {
  const outputDir = path.resolve(__dirname, '../../output/bid-document-samples');
  ensureDir(outputDir);
  const sample = createGenericSample(outputDir);
  const outputPath = path.join(outputDir, 'generic-response-sample.docx');
  const result = await writeBidDocumentWordFile(sample, outputPath);
  const logPath = path.join(outputDir, 'generic-response-sample.build-log.json');
  fs.writeFileSync(logPath, JSON.stringify(result.buildLog, null, 2), 'utf8');

  if (!result.success) {
    console.error(JSON.stringify({ success: false, outputPath, logPath, errors: result.buildLog.errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    success: true,
    outputPath,
    logPath,
    bytes: result.bytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
