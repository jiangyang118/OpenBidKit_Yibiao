const path = require('node:path');

const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'bmp']);
const SUPPORTED_IMAGE_EXTENSION_SET = new Set(SUPPORTED_IMAGE_EXTENSIONS);
const SUPPORTED_IMAGE_EXTENSIONS_WITH_DOT = Object.freeze(SUPPORTED_IMAGE_EXTENSIONS.map((extension) => `.${extension}`));
const SUPPORTED_IMAGE_EXTENSION_DOT_SET = new Set(SUPPORTED_IMAGE_EXTENSIONS_WITH_DOT);
const DOCUMENT_ASSET_EXTENSIONS = Object.freeze([
  'pdf',
  'doc',
  'docx',
  'wps',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'zip',
  'rar',
  '7z',
]);

function normalizeImageExtension(value) {
  const extension = String(value || '').trim().toLowerCase().replace(/^\./, '');
  return extension === 'jpeg' ? 'jpg' : extension;
}

function extensionWithDotForPath(filePath) {
  return path.extname(String(filePath || '').trim()).toLowerCase();
}

function imageRunTypeForPath(filePath) {
  const extension = String(path.extname(filePath).replace('.', '')).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSION_SET.has(extension)) {
    throw new Error(`不支持的附件图片格式：${filePath}`);
  }
  return normalizeImageExtension(extension);
}

function isSupportedImageExtensionWithDot(extension) {
  return SUPPORTED_IMAGE_EXTENSION_DOT_SET.has(String(extension || '').toLowerCase());
}

function supportedImageExtensionsText() {
  return SUPPORTED_IMAGE_EXTENSIONS_WITH_DOT.join(', ');
}

function assetSelectionFiltersForType(type) {
  return String(type || '').trim() === 'document'
    ? [
      { name: '原始文件或证明材料', extensions: DOCUMENT_ASSET_EXTENSIONS },
      { name: '所有文件', extensions: ['*'] },
    ]
    : [
      { name: '图片或扫描件', extensions: SUPPORTED_IMAGE_EXTENSIONS },
    ];
}

module.exports = {
  DOCUMENT_ASSET_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSION_SET,
  SUPPORTED_IMAGE_EXTENSIONS_WITH_DOT,
  SUPPORTED_IMAGE_EXTENSION_DOT_SET,
  assetSelectionFiltersForType,
  extensionWithDotForPath,
  imageRunTypeForPath,
  isSupportedImageExtensionWithDot,
  normalizeImageExtension,
  supportedImageExtensionsText,
};
