const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { dialog } = require('electron');
const AdmZip = require('adm-zip');
const { formatDocumentParseError, isLibreOfficeMissingError, normalizeDocumentParseError } = require('./documentParseErrors.cjs');
const { compactLogError, createDeveloperLogger, textMetrics } = require('../utils/developerLog.cjs');
const { getImportedImagesDir } = require('../utils/paths.cjs');

const parserLabels = {
  local: '本地解析',
  'local-ocr': '本地 OCR 解析',
  'mineru-accurate-api': 'MinerU 精准解析 API',
  'mineru-agent-api': 'MinerU-Agent 轻量解析 API',
};
const parserProviders = new Set(Object.keys(parserLabels));

const localSupportedExtensions = new Set(['.txt', '.md', '.markdown', '.docx', '.pdf', '.doc', '.wps']);
const localOcrSupportedExtensions = new Set(['.pdf', '.ofd', '.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tif', '.tiff']);
const mineruAgentSupportedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp', '.xls', '.xlsx',
]);
const mineruAccurateSupportedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp', '.html',
]);
const duplicateCheckSupportedExtensions = new Set(['.doc', '.docx', '.wps', '.pdf', '.md', '.markdown']);
const parserSandboxSampleExtensions = ['.pdf', '.docx', '.doc', '.wps', '.ofd', '.jpeg', '.png'];
const remoteImageTimeoutMs = 10000;
const paddleOcrWrapperPath = path.join(os.homedir(), '.codex', 'skills', 'paddleocr-local', 'scripts', 'ocr_local.py');
const markdownImagePattern = /!\[(?<alt>[^\]]*)\]\((?<target><[^>]+>|[^)\s]+)(?<title>\s+"[^"]*")?\)/gi;
const htmlImageSrcPattern = /(<img\b[^>]*?\bsrc=["'])(?<src>[^"']+)(["'][^>]*>)/gi;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupportedExtensions(provider) {
  if (provider === 'local-ocr') {
    return localOcrSupportedExtensions;
  }
  if (provider === 'mineru-agent-api') {
    return mineruAgentSupportedExtensions;
  }
  if (provider === 'mineru-accurate-api') {
    return mineruAccurateSupportedExtensions;
  }
  return localSupportedExtensions;
}

function getSelectableExtensions(provider) {
  if (provider === 'local') {
    return localSupportedExtensions;
  }
  return new Set([...getSupportedExtensions(provider), ...localSupportedExtensions]);
}

function createParserCapability(extension) {
  const ext = String(extension || '').trim().toLowerCase().replace(/^\./, '.');
  const localSupported = localSupportedExtensions.has(ext);
  const localOcrSupported = localOcrSupportedExtensions.has(ext);
  const mineruAccurateSupported = mineruAccurateSupportedExtensions.has(ext);
  const mineruAgentSupported = mineruAgentSupportedExtensions.has(ext);
  const imageLike = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.jp2'].includes(ext);
  let recommendedProvider = '';
  let status = 'unsupported';
  let note = '当前未接入该格式解析，请先转换为 PDF 或 DOCX 后再导入。';

  if (localSupported) {
    recommendedProvider = 'local';
    status = 'local';
    note = '本地解析可处理该格式；Windows 中文路径和中文文件名按默认场景支持。';
  }

  if (ext === '.pdf') {
    recommendedProvider = 'local';
    status = 'mixed';
    note = '文本型 PDF 可先走本地解析；扫描件 PDF 可使用本地 OCR，复杂版面再尝试 MinerU。';
  } else if (['.doc', '.wps'].includes(ext)) {
    note = '本地解析依赖系统文档转换能力；Windows 中文路径需要保留，解析失败时建议另存为标准 DOCX。';
  } else if (imageLike && localOcrSupported) {
    recommendedProvider = 'local-ocr';
    status = 'local-ocr';
    note = '图片/扫描件可走本地 OCR；优先使用本机 PaddleOCR，共享运行时不可用时回退到 tesseract，复杂表格版面可再尝试 MinerU。';
  } else if (ext === '.ofd') {
    recommendedProvider = 'local-ocr';
    status = 'local-ocr';
    note = 'OFD 可走本地 OCR 兜底：优先通过本机 OFD 转 PDF 工具或 LibreOffice 转为页面 PDF，再按页面截图调用 PaddleOCR；转换工具不可用时请先另存为 PDF。';
  } else if (!localSupported && (mineruAccurateSupported || mineruAgentSupported)) {
    recommendedProvider = mineruAccurateSupported ? 'mineru-accurate-api' : 'mineru-agent-api';
    status = 'remote';
    note = '该格式需要远程解析；导入前请确认网络和 MinerU Token。';
  }

  return {
    extension: ext,
    local_supported: localSupported,
    local_ocr_supported: localOcrSupported,
    mineru_accurate_supported: mineruAccurateSupported,
    mineru_agent_supported: mineruAgentSupported,
    recommended_provider: recommendedProvider,
    status,
    note,
  };
}

function createDeveloperParserCapabilityReport() {
  return {
    providers: Object.entries(parserLabels).map(([provider, label]) => ({
      provider,
      label,
      supported_extensions: [...getSupportedExtensions(provider)].sort(),
      selectable_extensions: [...getSelectableExtensions(provider)].sort(),
    })),
    samples: parserSandboxSampleExtensions.map(createParserCapability),
    chinese_path_smoke: {
      required: true,
      note: '解析回归样本应至少包含一个中文目录和中文文件名，用于验证 Windows 中文路径、WPS/Word/LibreOffice 转换链路不丢路径。',
      example: 'C:\\投标项目\\样本文档\\技术方案样例.docx',
    },
    scanned_document_policy: '扫描件 PDF、JPEG、PNG 可先走本地 OCR；本地 OCR 默认优先使用 PaddleOCR，复杂表格、版面还原或本地 OCR 失败时再使用 MinerU。',
  };
}

function resolveFileParser(config, filePath) {
  const requestedProvider = config.file_parser?.provider || 'local';
  const ext = path.extname(filePath).toLowerCase();
  const requestedSupported = getSupportedExtensions(requestedProvider).has(ext);
  if (requestedSupported) {
    return { provider: requestedProvider, requestedProvider, ext, supported: true, fallbackToLocal: false };
  }

  if (requestedProvider !== 'local' && localSupportedExtensions.has(ext)) {
    return { provider: 'local', requestedProvider, ext, supported: true, fallbackToLocal: true };
  }

  return { provider: requestedProvider, requestedProvider, ext, supported: false, fallbackToLocal: false };
}

async function summarizeFileForLog(filePath) {
  const summary = {
    file_name: path.basename(filePath || ''),
    extension: path.extname(filePath || '').toLowerCase(),
  };
  try {
    const stats = await fs.stat(filePath);
    summary.size = stats.size;
    summary.modified_at = stats.mtime.toISOString();
  } catch {
    summary.size = null;
    summary.modified_at = '';
  }
  return summary;
}

function summarizeParserForLog(parser, options = {}) {
  return {
    provider: parser.provider,
    requested_provider: parser.requestedProvider,
    extension: parser.ext,
    supported: parser.supported,
    fallback_to_local: parser.fallbackToLocal,
    preserve_images: options.preserveImages === true,
    asset_scope: String(options.assetScope || 'documents'),
  };
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
      timeout: options.timeout || 120000,
      cwd: options.cwd,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function parseLocalDocument(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf-8');
  }

  const { convertPathToMarkdown } = await import('./doc2markdown/convert.mjs');
  return convertPathToMarkdown(filePath, {
    includeImages: options.preserveImages,
    imageResolver: options.imageResolver,
  });
}

function isLocalOcrImageExtension(ext) {
  return ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tif', '.tiff'].includes(String(ext || '').toLowerCase());
}

function formatLocalOcrCommandError(error, toolName) {
  const stderr = String(error?.stderr || '').trim();
  const detail = stderr || error?.message || '未知错误';
  if (error?.code === 'ENOENT') {
    return `本地 OCR 需要安装 ${toolName}。请先安装后重试。`;
  }
  return `${toolName} 执行失败：${detail}`;
}

function parsePaddleOcrPayload(rawOutput) {
  if (rawOutput && typeof rawOutput === 'object' && !Buffer.isBuffer(rawOutput)) {
    return rawOutput;
  }
  const output = String(rawOutput || '').trim();
  if (!output) {
    throw new Error('PaddleOCR 未返回解析结果');
  }
  try {
    return JSON.parse(output);
  } catch {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(output.slice(start, end + 1));
    }
    throw new Error(`PaddleOCR 返回了无法解析的 JSON：${output.slice(0, 200)}`);
  }
}

function extractPaddleOcrText(payload) {
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const pageText = pages
    .map((page) => String(page?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return pageText || String(payload?.full_text || '').trim();
}

async function defaultPaddleOcrRunner(imagePath, options = {}) {
  const wrapperPath = options.paddleOcrWrapperPath || paddleOcrWrapperPath;
  const { stdout } = await execFilePromise(wrapperPath, [
    imagePath,
    '--format',
    'json',
    '--lang',
    options.localOcrLang || 'ch',
  ], {
    timeout: options.paddleOcrTimeoutMs || 300000,
    maxBuffer: 80 * 1024 * 1024,
  });
  return stdout;
}

async function runPaddleOcrImage(imagePath, options = {}) {
  const runner = options.paddleOcrRunner || defaultPaddleOcrRunner;
  try {
    const rawOutput = await runner(imagePath, options);
    const payload = parsePaddleOcrPayload(rawOutput);
    return {
      engine: String(payload?.engine || 'PaddleOCR'),
      text: extractPaddleOcrText(payload),
    };
  } catch (error) {
    throw new Error(formatLocalOcrCommandError(error, 'PaddleOCR'));
  }
}

async function runTesseractOcr(imagePath) {
  try {
    const { stdout } = await execFilePromise('tesseract', [
      imagePath,
      'stdout',
      '-l',
      'chi_sim+eng',
      '--psm',
      '6',
    ], { timeout: 180000 });
    return String(stdout || '').trim();
  } catch (error) {
    throw new Error(formatLocalOcrCommandError(error, 'tesseract'));
  }
}

async function runPreferredLocalOcr(imagePath, options = {}) {
  const engine = options.localOcrEngine || 'auto';
  let paddleError = null;

  if (engine !== 'tesseract') {
    try {
      return await runPaddleOcrImage(imagePath, options);
    } catch (error) {
      paddleError = error;
    }
  }

  try {
    return {
      engine: 'Tesseract',
      text: await runTesseractOcr(imagePath),
    };
  } catch (error) {
    if (paddleError) {
      throw new Error(`本地 OCR 执行失败：${paddleError.message}；Tesseract 兜底也失败：${error.message}`);
    }
    throw error;
  }
}

async function createOcrImageMarkdown(assets, imagePath, pageNumber) {
  if (!assets) return '';
  const buffer = await fs.readFile(imagePath);
  const assetUrl = await saveImportedImage(assets, buffer, imagePath, '');
  return assetUrl ? `![第${pageNumber}页 本地OCR页面截图](${assetUrl})` : '';
}

async function parseLocalOcrImage(imagePath, options = {}, pageNumber = 1) {
  const ocrResult = await runPreferredLocalOcr(imagePath, options);
  const imageMarkdown = options.preserveImages
    ? await createOcrImageMarkdown(options.assets, imagePath, pageNumber)
    : '';
  return [
    `## 第 ${pageNumber} 页 OCR 文本`,
    `- OCR 引擎：${ocrResult.engine}`,
    ocrResult.text || '（本页未识别到文字）',
    imageMarkdown,
  ].filter(Boolean).join('\n\n');
}

async function parseLocalOcrPdf(filePath, options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-local-ocr-'));
  try {
    const prefix = path.join(tempDir, 'page');
    try {
      await execFilePromise('pdftoppm', ['-png', '-r', '200', filePath, prefix], { timeout: 180000 });
    } catch (error) {
      throw new Error(formatLocalOcrCommandError(error, 'pdftoppm'));
    }

    const entries = (await fs.readdir(tempDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => {
        const left = Number((/^page-(\d+)\.png$/i.exec(a) || [])[1] || 0);
        const right = Number((/^page-(\d+)\.png$/i.exec(b) || [])[1] || 0);
        return left - right;
      });
    if (!entries.length) {
      throw new Error('pdftoppm 未生成页面图片，本地 OCR 无法继续');
    }

    const sections = [];
    for (const entry of entries) {
      const pageMatch = /^page-(\d+)\.png$/i.exec(entry);
      const pageNumber = Number(pageMatch?.[1] || sections.length + 1);
      sections.push(await parseLocalOcrImage(path.join(tempDir, entry), options, pageNumber));
    }
    return sections.join('\n\n');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findGeneratedPdf(outputDir, inputPath) {
  const baseName = path.basename(inputPath, path.extname(inputPath)).toLowerCase();
  const entries = await fs.readdir(outputDir).catch(() => []);
  const pdfEntries = entries.filter((name) => path.extname(name).toLowerCase() === '.pdf');
  const exact = pdfEntries.find((name) => path.basename(name, '.pdf').toLowerCase() === baseName);
  const candidate = exact || pdfEntries[0];
  return candidate ? path.join(outputDir, candidate) : '';
}

async function convertOFDToPdfWithCommand(filePath, outputPdfPath, tempDir, command, argsFactory) {
  try {
    await execFilePromise(command, argsFactory(), {
      timeout: 180000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: tempDir,
    });
    const generated = await findGeneratedPdf(tempDir, filePath);
    const sourcePdf = generated || outputPdfPath;
    await fs.access(sourcePdf);
    if (sourcePdf !== outputPdfPath) {
      await fs.copyFile(sourcePdf, outputPdfPath);
    }
    return outputPdfPath;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    return '';
  }
}

async function defaultOFDToPdfConverter(filePath, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yibiao-ofd-ocr-'));
  try {
    const outputPdfPath = path.join(tempDir, `${path.basename(filePath, path.extname(filePath)) || 'ofd'}.pdf`);
    const attempts = [
      ['ofd2pdf', () => [filePath, outputPdfPath]],
      ['ofdconv', () => [filePath, outputPdfPath]],
      ['soffice', () => ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, filePath]],
      ['libreoffice', () => ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, filePath]],
    ];

    for (const [command, argsFactory] of attempts) {
      const pdfPath = await convertOFDToPdfWithCommand(filePath, outputPdfPath, tempDir, command, argsFactory);
      if (pdfPath) {
        return await callback(pdfPath);
      }
    }

    throw new Error('本地 OCR 解析 OFD 需要安装 OFD 转 PDF 工具（如 ofd2pdf/ofdconv），或安装支持 OFD 转 PDF 的 LibreOffice/WPS；也可以先手动另存为 PDF 后导入。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function parseLocalOcrOFD(filePath, options = {}) {
  const converter = options.ofdToPdfConverter || defaultOFDToPdfConverter;
  return converter(filePath, (pdfPath) => parseLocalOcrPdf(pdfPath, options));
}

async function parseLocalOcrDocument(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (isLocalOcrImageExtension(ext)) {
    return parseLocalOcrImage(filePath, options, 1);
  }
  if (ext === '.pdf') {
    return parseLocalOcrPdf(filePath, options);
  }
  if (ext === '.ofd') {
    return parseLocalOcrOFD(filePath, options);
  }
  throw new Error('本地 OCR 当前仅支持 PDF、OFD 和常见图片格式');
}

function formatImportError(error, filePath) {
  const normalized = normalizeDocumentParseError(error, filePath);
  if (isLibreOfficeMissingError(normalized)) {
    return normalized.message;
  }

  const rawMessage = formatDocumentParseError(normalized, filePath);
  if (/Can't find end of central directory|is this a zip file/i.test(rawMessage)) {
    return '文件解析失败：该文件不是有效的 DOCX 文档，请用 Word/WPS 另存为标准 DOCX 后重试';
  }
  return `文件解析失败：${rawMessage || '未知错误'}`;
}

async function parseWithMineruAgent(filePath, options = {}) {
  const fileName = path.basename(filePath);
  const createResponse = await fetch('https://mineru.net/api/v1/agent/parse/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: fileName,
      language: 'ch',
      enable_table: true,
      is_ocr: true,
      enable_formula: true,
    }),
  });
  const createResult = await createResponse.json();
  if (!createResponse.ok || createResult.code !== 0) {
    throw new Error(`申请 MinerU-Agent 上传链接失败：HTTP ${createResponse.status}，${JSON.stringify(createResult)}`);
  }

  const taskId = createResult.data?.task_id;
  const fileUrl = createResult.data?.file_url;
  if (!taskId || !fileUrl) {
    throw new Error(`MinerU-Agent 响应缺少 task_id/file_url：${JSON.stringify(createResult)}`);
  }

  await uploadFile(fileUrl, filePath);
  const finalResult = await pollMineruAgent(taskId, fileName);
  const markdownUrl = finalResult.data.markdown_url;
  if (!markdownUrl) {
    throw new Error('MinerU-Agent 解析完成但未返回 markdown_url');
  }
  return downloadText(markdownUrl, '下载 MinerU-Agent Markdown 失败').then((markdown) => (
    options.preserveImages
      ? rewriteMarkdownImages(markdown, options.assets, { baseUrl: markdownUrl })
      : stripMarkdownImages(markdown)
  ));
}

async function pollMineruAgent(taskId, fileName) {
  const startedAt = Date.now();
  const timeoutMs = 300000;
  const intervalMs = 3000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`https://mineru.net/api/v1/agent/parse/${taskId}`);
    const result = await response.json();
    if (!response.ok || result.code !== 0) {
      throw new Error(`查询 MinerU-Agent 任务失败：HTTP ${response.status}，${JSON.stringify(result)}`);
    }

    const data = result.data || {};
    if (data.state === 'done') {
      return { raw: result, data };
    }
    if (data.state === 'failed') {
      throw new Error(`MinerU-Agent 解析失败：${data.err_msg || '未知错误'}${data.err_code ? ` (${data.err_code})` : ''}`);
    }
    console.log(`WAIT ${fileName}: ${data.state || 'unknown'}`);
    await sleep(intervalMs);
  }

  throw new Error(`MinerU-Agent 轮询超时，请稍后重试，task_id: ${taskId}`);
}

async function parseWithMineruAccurate(filePath, token, options = {}) {
  if (!token) {
    throw new Error('请先在设置中填写 MinerU Token');
  }

  const fileName = path.basename(filePath);
  const createResponse = await fetch('https://mineru.net/api/v4/file-urls/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ name: fileName, data_id: makeDataId(fileName), is_ocr: true }],
      model_version: 'vlm',
      language: 'ch',
      enable_table: true,
      enable_formula: true,
    }),
  });
  const createResult = await createResponse.json();
  if (!createResponse.ok || createResult.code !== 0) {
    throw new Error(`申请 MinerU 精准解析上传链接失败：HTTP ${createResponse.status}，${JSON.stringify(createResult)}`);
  }

  const batchId = createResult.data?.batch_id;
  const fileUrl = createResult.data?.file_urls?.[0];
  if (!batchId || !fileUrl) {
    throw new Error(`MinerU 精准解析响应缺少 batch_id/file_url：${JSON.stringify(createResult)}`);
  }

  await uploadFile(fileUrl, filePath);
  const finalResult = await pollMineruAccurate(token, batchId, fileName);
  const fullZipUrl = finalResult.item.full_zip_url;
  if (!fullZipUrl) {
    throw new Error('MinerU 精准解析完成但未返回 full_zip_url');
  }
  const zipBuffer = await downloadBuffer(fullZipUrl);
  return extractMarkdownFromZip(zipBuffer, options);
}

async function pollMineruAccurate(token, batchId, fileName) {
  const startedAt = Date.now();
  const timeoutMs = 600000;
  const intervalMs = 5000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`https://mineru.net/api/v4/extract-results/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
    });
    const result = await response.json();
    if (!response.ok || result.code !== 0) {
      throw new Error(`查询 MinerU 精准解析任务失败：HTTP ${response.status}，${JSON.stringify(result)}`);
    }

    const items = result.data?.extract_result || [];
    const item = items.find((candidate) => candidate.file_name === fileName) || items[0];
    if (item?.state === 'done') {
      return { raw: result, item };
    }
    if (item?.state === 'failed') {
      throw new Error(`MinerU 精准解析失败：${item.err_msg || '未知错误'}`);
    }
    console.log(`WAIT ${fileName}: ${item?.state || 'unknown'}`);
    await sleep(intervalMs);
  }

  throw new Error(`MinerU 精准解析轮询超时，请稍后重试，batch_id: ${batchId}`);
}

async function uploadFile(fileUrl, filePath) {
  const buffer = await fs.readFile(filePath);
  const response = await fetch(fileUrl, { method: 'PUT', body: buffer });
  if (!response.ok) {
    throw new Error(`文件上传失败：HTTP ${response.status}，${await response.text()}`);
  }
}

async function downloadText(url, fallbackMessage) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${fallbackMessage}：HTTP ${response.status}`);
  }
  return response.text();
}

async function downloadBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 MinerU 精准解析结果失败：HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function extractMarkdownFromZip(zipBuffer, options = {}) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const fullMd = entries.find((entry) => /(^|[/\\])full\.md$/i.test(entry.entryName));
  const anyMd = entries.find((entry) => entry.entryName.toLowerCase().endsWith('.md'));
  const target = fullMd || anyMd;
  if (!target) {
    throw new Error('MinerU 精准解析结果 zip 中未找到 Markdown 文件');
  }
  const markdown = target.getData().toString('utf8');
  if (!options.preserveImages) {
    return stripMarkdownImages(markdown);
  }
  return rewriteMarkdownImages(markdown, options.assets, {
    zipEntries: entries,
    markdownEntryName: target.entryName,
  });
}

function makeDataId(fileName) {
  return fileName.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 96) || 'document';
}

async function createLocalFileSelection(filePath) {
  const stats = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return {
    id: crypto.createHash('sha1').update(filePath).digest('hex'),
    file_name: path.basename(filePath),
    file_path: filePath,
    extension,
    size: stats.size,
    modified_at: stats.mtime.toISOString(),
  };
}

function stripMarkdownImages(text) {
  return String(text || '')
    .replace(markdownImagePattern, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n');
}

function extractPageNumberFromText(value) {
  const text = String(value || '');
  const patterns = [
    /第\s*(\d{1,4})\s*页/i,
    /\bpage[_\-\s]*(\d{1,4})\b/i,
    /\bp[_\-\s]*(\d{1,4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const pageNumber = Number(match[1]);
      if (Number.isFinite(pageNumber) && pageNumber > 0) return pageNumber;
    }
  }
  return null;
}

function extractPageScreenshotCandidates(markdown, options = {}) {
  const text = String(markdown || '');
  if (!text.trim()) return [];
  const lines = text.split(/\r\n|\r|\n/);
  const imageRefs = [];
  const pushCandidate = (lineIndex, url, description = '') => {
    const assetUrl = String(url || '').trim();
    if (!assetUrl) return;
    const previousText = lines.slice(Math.max(0, lineIndex - 2), lineIndex)
      .map((line) => line.replace(markdownImagePattern, '').replace(/<img\b[^>]*>/gi, '').trim())
      .filter(Boolean)
      .slice(-1)[0] || '';
    imageRefs.push({
      lineNumber: lineIndex + 1,
      assetUrl,
      description,
      previousText,
    });
  };

  lines.forEach((line, lineIndex) => {
    for (const match of String(line || '').matchAll(new RegExp(markdownImagePattern.source, markdownImagePattern.flags))) {
      pushCandidate(lineIndex, match.groups?.target, match.groups?.alt);
    }
    for (const match of String(line || '').matchAll(new RegExp(htmlImageSrcPattern.source, htmlImageSrcPattern.flags))) {
      pushCandidate(lineIndex, match.groups?.src, '');
    }
  });

  return imageRefs.map((item, index) => {
    const previous = imageRefs[index - 1];
    const next = imageRefs[index + 1];
    const lineStart = previous ? previous.lineNumber + 1 : 1;
    const lineEnd = next ? Math.max(lineStart, next.lineNumber - 1) : Math.max(lineStart, lines.length);
    const recoveredPageNumber = options.recoverPageNumber === false
      ? null
      : extractPageNumberFromText(`${item.description} ${item.assetUrl}`);
    const pageNumber = recoveredPageNumber || index + 1;
    return {
      pageNumber,
      lineStart,
      lineEnd,
      imageLine: item.lineNumber,
      assetUrl: item.assetUrl,
      ...(options.sourceType ? { sourceType: options.sourceType } : {}),
      note: [
        options.notePrefix || '',
        item.description ? `图片说明：${item.description}` : '',
        item.previousText ? `前文：${item.previousText.slice(0, 120)}` : '',
        `自动行号范围：第 ${lineStart}-${lineEnd} 行`,
      ].filter(Boolean).join('；') || '由文档解析图片引用生成的页面截图候选。',
    };
  });
}

function createPageLineRange(pageIndex, pageCount, lineCount) {
  const totalPages = Math.max(1, Number(pageCount || 1));
  const totalLines = Math.max(1, Number(lineCount || 1));
  const index = Math.max(0, Number(pageIndex || 0));
  const lineStart = Math.floor((index / totalPages) * totalLines) + 1;
  const lineEnd = index >= totalPages - 1
    ? totalLines
    : Math.max(lineStart, Math.floor(((index + 1) / totalPages) * totalLines));
  return { lineStart, lineEnd };
}

async function renderPdfPageScreenshotCandidates(app, filePath, options = {}) {
  if (!app?.getPath || path.extname(filePath || '').toLowerCase() !== '.pdf') return [];
  let canvas;
  try {
    canvas = require('@napi-rs/canvas');
  } catch {
    return [];
  }
  if (!canvas?.createCanvas) return [];

  const assets = createAssetContext(app, options.assetScope || 'rejection-check-page-screenshots');
  if (!assets) return [];

  let document;
  try {
    const pdfParseEntryPath = require.resolve('pdf-parse');
    const pdfParseRoot = path.resolve(path.dirname(pdfParseEntryPath), '..', '..', '..');
    const pdfJsPath = path.join(pdfParseRoot, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
    const { getDocument } = await import(pathToFileURL(pdfJsPath).href);
    const buffer = await fs.readFile(filePath);
    const loadingTask = getDocument({ data: new Uint8Array(buffer), disableWorker: true });
    document = await loadingTask.promise;
    const pageCount = Number(document.numPages || 0);
    if (!pageCount) return [];
    const maxPages = Math.max(1, Number(options.maxPages || 80));
    const renderedPages = Math.min(pageCount, maxPages);
    const lineCount = Number(options.lineCount || 0);
    const candidates = [];

    for (let index = 0; index < renderedPages; index += 1) {
      const pageNumber = index + 1;
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: Number(options.scale || 1) || 1 });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const pageCanvas = canvas.createCanvas(width, height);
      const context = pageCanvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const png = typeof pageCanvas.toBuffer === 'function'
        ? pageCanvas.toBuffer('image/png')
        : Buffer.from(await pageCanvas.encode('png'));
      const assetUrl = await saveImportedImage(assets, png, `pdf-page-${pageNumber}.png`, 'image/png');
      const { lineStart, lineEnd } = createPageLineRange(index, pageCount, lineCount);
      candidates.push({
        pageNumber,
        lineStart,
        lineEnd,
        assetUrl,
        width,
        height,
        note: [
          `PDF 第 ${pageNumber} 页像素级截图`,
          `自动行号范围：第 ${lineStart}-${lineEnd} 行`,
          pageCount > renderedPages ? `仅生成前 ${renderedPages}/${pageCount} 页截图候选` : '',
        ].filter(Boolean).join('；'),
      });
    }
    return candidates;
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  } finally {
    if (document) {
      try {
        await document.destroy();
      } catch {
        // Ignore PDF cleanup errors; rendering screenshots is best-effort.
      }
    }
  }
}

async function renderOfficePageScreenshotCandidates(app, filePath, options = {}) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (!['.docx', '.doc', '.wps'].includes(ext)) return [];
  const convertToPdf = options.convertToPdf || (async (inputPath, callback) => {
    const { withWordPdfFile } = await import('./doc2markdown/convert.mjs');
    return withWordPdfFile(inputPath, callback);
  });

  try {
    return await convertToPdf(filePath, async (pdfPath) => {
      const candidates = await renderPdfPageScreenshotCandidates(app, pdfPath, {
        ...options,
        assetScope: options.assetScope || 'rejection-check-office-page-screenshots',
      });
      return candidates.map((candidate) => ({
        ...candidate,
        sourceType: 'office-rendered-pdf',
        note: [
          `由 ${ext.slice(1).toUpperCase()} 转 PDF 后生成的页面截图`,
          candidate.note || '',
        ].filter(Boolean).join('；'),
      }));
    });
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  }
}

async function renderDocumentPageScreenshotCandidates(app, filePath, options = {}) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.pdf') {
    return renderPdfPageScreenshotCandidates(app, filePath, options);
  }
  if (['.docx', '.doc', '.wps'].includes(ext)) {
    return renderOfficePageScreenshotCandidates(app, filePath, options);
  }
  return [];
}

function countMarkdownImages(text) {
  return countRegex(text, markdownImagePattern) + countRegex(text, htmlImageSrcPattern);
}

function countRegex(text, pattern) {
  return [...String(text || '').matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

function createAssetContext(app, scope = 'documents') {
  if (!app?.getPath) return null;
  const safeScope = String(scope || 'documents').replace(/[^A-Za-z0-9._-]+/g, '_') || 'documents';
  const batchId = `${safeScope}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    baseDir: path.join(getImportedImagesDir(app), batchId),
    urlPrefix: `yibiao-asset://imported-images/${encodeURIComponent(batchId)}`,
    index: 0,
  };
}

async function deleteImportedImageAssets(assets) {
  if (!assets?.baseDir) return;
  await fs.rm(assets.baseDir, { recursive: true, force: true });
}

function imageExtensionFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('bmp')) return '.bmp';
  if (normalized.includes('webp')) return '.webp';
  return '';
}

function imageExtensionFromPath(value) {
  const ext = path.extname(String(value || '').split(/[?#]/)[0]).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '';
}

async function saveImportedImage(assets, buffer, sourceName, mime) {
  if (!assets || !buffer?.length) return null;
  const ext = imageExtensionFromMime(mime) || imageExtensionFromPath(sourceName) || '.png';
  assets.index += 1;
  const fileName = `image-${String(assets.index).padStart(4, '0')}${ext}`;
  await fs.mkdir(assets.baseDir, { recursive: true });
  await fs.writeFile(path.join(assets.baseDir, fileName), buffer);
  return `${assets.urlPrefix}/${encodeURIComponent(fileName)}`;
}

function createImageResolver(assets) {
  if (!assets) return null;
  return ({ buffer, mime, sourceName }) => saveImportedImage(assets, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), sourceName, mime);
}

function cleanMarkdownImageTarget(target) {
  const value = String(target || '').trim();
  return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value;
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value || ''));
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function loadRemoteImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteImageTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/^image\//i.test(contentType)) return null;
    return { buffer: Buffer.from(await response.arrayBuffer()), mime: contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function findZipEntryImage(zipEntries, imagePath, markdownEntryName) {
  let decodedPath = imagePath;
  try {
    decodedPath = decodeURIComponent(imagePath);
  } catch {
    decodedPath = imagePath;
  }
  const normalized = decodedPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const markdownDir = path.posix.dirname(String(markdownEntryName || '').replace(/\\/g, '/'));
  const candidates = [
    normalized,
    path.posix.normalize(path.posix.join(markdownDir === '.' ? '' : markdownDir, normalized)),
  ].map((item) => item.replace(/^\/+/, '').toLowerCase());
  const direct = zipEntries.find((entry) => candidates.includes(entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()));
  if (direct) return direct;
  const basename = path.posix.basename(normalized).toLowerCase();
  return zipEntries.find((entry) => path.posix.basename(entry.entryName.replace(/\\/g, '/')).toLowerCase() === basename);
}

function isPathInsideDirectory(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveImageToAssetUrl(source, assets, context = {}) {
  const value = cleanMarkdownImageTarget(source);
  if (!value) return null;
  if (/^yibiao-asset:\/\//i.test(value)) return value;

  const data = parseDataUrl(value);
  if (data) {
    return saveImportedImage(assets, data.buffer, 'data-image', data.mime);
  }

  if (/^https?:\/\//i.test(value) || context.baseUrl) {
    try {
      const url = /^https?:\/\//i.test(value) ? value : new URL(value, context.baseUrl).toString();
      const loaded = await loadRemoteImage(url);
      if (loaded) {
        return saveImportedImage(assets, loaded.buffer, url, loaded.mime);
      }
    } catch {
      return null;
    }
  }

  if (context.zipEntries) {
    const entry = findZipEntryImage(context.zipEntries, value, context.markdownEntryName);
    if (entry && !entry.isDirectory) {
      return saveImportedImage(assets, entry.getData(), entry.entryName, '');
    }
  }

  if (context.localBaseDir && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      let decodedValue = value;
      try {
        decodedValue = decodeURIComponent(value);
      } catch {
        decodedValue = value;
      }
      if (path.isAbsolute(decodedValue)) {
        return null;
      }
      const baseDir = path.resolve(context.localBaseDir);
      const localPath = path.resolve(baseDir, decodedValue);
      if (!isPathInsideDirectory(baseDir, localPath)) {
        return null;
      }
      const buffer = await fs.readFile(localPath);
      return saveImportedImage(assets, buffer, localPath, '');
    } catch {
      return null;
    }
  }

  return null;
}

async function rewriteMarkdownImages(markdown, assets, context = {}) {
  let result = await replaceMatchesAsync(String(markdown || ''), markdownImagePattern, async (match) => {
    const nextUrl = await resolveImageToAssetUrl(match.groups?.target || '', assets, context);
    const alt = match.groups?.alt || '';
    const title = match.groups?.title || '';
    return nextUrl ? `![${alt}](${nextUrl}${title})` : '';
  });

  result = await replaceMatchesAsync(result, htmlImageSrcPattern, async (match) => {
    const nextUrl = await resolveImageToAssetUrl(match.groups?.src || '', assets, context);
    return nextUrl ? `${match[1]}${nextUrl}${match[3]}` : '';
  });
  return result;
}

async function replaceMatchesAsync(text, pattern, createReplacement) {
  const matches = [...String(text || '').matchAll(pattern)];
  if (!matches.length) return text;

  const parts = [];
  let lastIndex = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    parts.push(text.slice(lastIndex, index));
    parts.push(await createReplacement(match));
    lastIndex = index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts.join('');
}

async function parseDocumentWithConfig(app, filePath, config, options = {}) {
  const startedAt = Date.now();
  const parser = resolveFileParser(config, filePath);
  const developerLogger = createDeveloperLogger({
    app,
    config,
    moduleName: 'file-parser',
    name: path.basename(filePath || 'document'),
    meta: summarizeParserForLog(parser, options),
  });
  developerLogger.write('file.parse.started', {
    file: await summarizeFileForLog(filePath),
    parser: summarizeParserForLog(parser, options),
  });
  if (!parser.supported) {
    const error = new Error(`当前${parserLabels[parser.requestedProvider] || '解析方式'}不支持该文件格式`);
    developerLogger.write('file.parse.error', {
      duration_ms: Date.now() - startedAt,
      parser: summarizeParserForLog(parser, options),
      error: compactLogError(error),
    });
    throw error;
  }
  const provider = parser.provider;
  const preserveImages = options.preserveImages === true;
  const assets = preserveImages ? createAssetContext(app, options.assetScope || 'documents') : null;
  const parseOptions = {
    preserveImages,
    assets,
    imageResolver: createImageResolver(assets),
    localOcrEngine: options.localOcrEngine,
    localOcrLang: options.localOcrLang,
    paddleOcrRunner: options.paddleOcrRunner,
    paddleOcrTimeoutMs: options.paddleOcrTimeoutMs,
    paddleOcrWrapperPath: options.paddleOcrWrapperPath,
    ofdToPdfConverter: options.ofdToPdfConverter,
  };
  let markdown = '';
  try {
    if (provider === 'local-ocr') {
      markdown = await parseLocalOcrDocument(filePath, parseOptions);
    } else if (provider === 'mineru-agent-api') {
      markdown = await parseWithMineruAgent(filePath, parseOptions);
    } else if (provider === 'mineru-accurate-api') {
      markdown = await parseWithMineruAccurate(filePath, config.file_parser?.mineru_token || '', parseOptions);
    } else {
      markdown = await parseLocalDocument(filePath, parseOptions);
      markdown = preserveImages ? await rewriteMarkdownImages(markdown, assets, { localBaseDir: path.dirname(filePath) }) : stripMarkdownImages(markdown);
    }
  } catch (error) {
    await deleteImportedImageAssets(assets).catch(() => undefined);
    developerLogger.write('file.parse.error', {
      duration_ms: Date.now() - startedAt,
      parser: summarizeParserForLog(parser, options),
      asset_count: assets?.index || 0,
      error: compactLogError(error),
    });
    throw normalizeDocumentParseError(error, filePath);
  }
  const result = preserveImages ? markdown : stripMarkdownImages(markdown);
  developerLogger.write('file.parse.completed', {
    duration_ms: Date.now() - startedAt,
    parser: summarizeParserForLog(parser, options),
    asset_count: assets?.index || 0,
    markdown_metrics: textMetrics(result),
  });
  return result;
}

function createFileService({ app, configStore } = {}) {
  async function importTechnicalPlanDocument(documentLabel = '招标文件') {
    const label = String(documentLabel || '招标文件').trim() || '招标文件';
    const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
    const provider = config.file_parser?.provider || 'local';
    const supportedExtensions = getSelectableExtensions(provider);
    const result = await dialog.showOpenDialog({
      title: `选择${label}`,
      properties: ['openFile'],
      filters: [
        { name: parserLabels[provider] || label, extensions: [...supportedExtensions].map((item) => item.slice(1)) },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择' };
    }

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const parser = resolveFileParser(config, filePath);

    if (!supportedExtensions.has(ext)) {
      return { success: false, message: `当前${parserLabels[provider] || '解析方式'}不支持该文件格式` };
    }

    let fileContent = '';
    try {
      fileContent = (await parseDocumentWithConfig(app, filePath, config, { assetScope: 'technical-plan', preserveImages: false })).trim();
    } catch (error) {
      return {
        success: false,
        message: formatImportError(error, filePath),
        file_name: path.basename(filePath),
        parser_provider: parser.provider,
        parser_label: parserLabels[parser.provider] || '本地解析',
      };
    }

    if (!fileContent) {
      return { success: false, message: '未提取到有效 Markdown 内容，请检查文件内容' };
    }

    return {
      success: true,
      message: parser.fallbackToLocal ? '文件解析完成，当前格式已自动使用本地解析' : '文件解析完成',
      file_content: fileContent,
      file_name: path.basename(filePath),
      parser_provider: parser.provider,
      parser_label: parserLabels[parser.provider] || '本地解析',
    };
  }

  return {
    async importDocument() {
      return importTechnicalPlanDocument('招标文件');
    },

    importTechnicalPlanDocument,

    getDeveloperParserCapabilities() {
      return createDeveloperParserCapabilityReport();
    },

    async parseDeveloperSample(options = {}) {
      const baseConfig = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
      const requestedProvider = parserProviders.has(options?.provider) ? options.provider : (baseConfig.file_parser?.provider || 'local');
      const config = {
        ...baseConfig,
        file_parser: {
          ...(baseConfig.file_parser || {}),
          provider: requestedProvider,
        },
      };
      const supportedExtensions = getSelectableExtensions(requestedProvider);
      let filePath = String(options?.filePath || '').trim();
      if (!filePath) {
        const result = await dialog.showOpenDialog({
          title: '选择解析沙盘样本文件',
          properties: ['openFile'],
          filters: [
            { name: parserLabels[requestedProvider] || '文件解析', extensions: [...supportedExtensions].map((item) => item.slice(1)) },
            { name: '所有文件', extensions: ['*'] },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, message: '已取消选择' };
        }
        filePath = result.filePaths[0];
      }
      const parser = resolveFileParser(config, filePath);
      const startedAt = Date.now();
      const file = await createLocalFileSelection(filePath);
      if (!supportedExtensions.has(path.extname(filePath).toLowerCase())) {
        return {
          success: false,
          message: `当前${parserLabels[requestedProvider] || '解析方式'}不支持该文件格式`,
          file,
          parser_provider: parser.provider,
          parser_label: parserLabels[parser.provider] || '本地解析',
          requested_provider: requestedProvider,
          error_stage: 'extension-filter',
        };
      }

      try {
        const assetHash = crypto.createHash('sha1').update(`${filePath}\n${Date.now()}`).digest('hex').slice(0, 12);
        const markdown = (await parseDocumentWithConfig(app, filePath, config, {
          assetScope: `developer-parser-sandbox-${assetHash}`,
          preserveImages: options?.preserveImages === true,
        })).trim();
        const imageCount = countMarkdownImages(markdown);
        const markdownLimit = 80000;
        return {
          success: true,
          message: parser.fallbackToLocal ? '文件解析完成，当前格式已自动使用本地解析' : '文件解析完成',
          file,
          parser_provider: parser.provider,
          parser_label: parserLabels[parser.provider] || '本地解析',
          requested_provider: requestedProvider,
          fallback_to_local: Boolean(parser.fallbackToLocal),
          duration_ms: Date.now() - startedAt,
          markdown,
          markdown_preview: markdown.slice(0, markdownLimit),
          truncated: markdown.length > markdownLimit,
          markdown_chars: markdown.length,
          image_count: imageCount,
          line_count: markdown ? markdown.split(/\r?\n/).length : 0,
        };
      } catch (error) {
        return {
          success: false,
          message: formatImportError(error, filePath),
          file,
          parser_provider: parser.provider,
          parser_label: parserLabels[parser.provider] || '本地解析',
          requested_provider: requestedProvider,
          duration_ms: Date.now() - startedAt,
          error_stage: 'parseDocumentWithConfig',
        };
      }
    },

    async importRejectionCheckDocument(role = 'tender') {
      const documentRole = role === 'bid' ? 'bid' : 'tender';
      const documentLabel = documentRole === 'bid' ? '投标文件' : '招标文件';
      const config = configStore ? configStore.load() : { file_parser: { provider: 'local' } };
      const provider = config.file_parser?.provider || 'local';
      const supportedExtensions = getSelectableExtensions(provider);
      const multiple = documentRole === 'bid';
      const result = await dialog.showOpenDialog({
        title: `选择${documentLabel}`,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [
          { name: parserLabels[provider] || documentLabel, extensions: [...supportedExtensions].map((item) => item.slice(1)) },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消选择' };
      }

      const parsedDocuments = [];
      const errors = [];
      for (const filePath of result.filePaths) {
        const ext = path.extname(filePath).toLowerCase();
        const parser = resolveFileParser(config, filePath);
        if (!supportedExtensions.has(ext)) {
          errors.push(`${path.basename(filePath)}：当前${parserLabels[provider] || '解析方式'}不支持该文件格式`);
          continue;
        }

        let fileContent = '';
        let pageScreenshots = [];
        try {
          const assetHash = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12);
          const parsedMarkdown = (await parseDocumentWithConfig(app, filePath, config, { assetScope: `rejection-check-${documentRole}-${assetHash}`, preserveImages: true })).trim();
          const lineCount = parsedMarkdown.split(/\r\n|\r|\n/).length;
          const pageImageScreenshots = await renderDocumentPageScreenshotCandidates(app, filePath, {
            assetScope: `rejection-check-${documentRole}-${assetHash}-pages`,
            lineCount,
          });
          pageScreenshots = [
            ...pageImageScreenshots,
            ...extractPageScreenshotCandidates(parsedMarkdown, parser.provider.startsWith('mineru-') ? {
              sourceType: 'mineru-remote-image',
              notePrefix: `${parserLabels[parser.provider] || 'MinerU 远程解析'}返回的页面图片`,
            } : {}),
          ];
          fileContent = stripMarkdownImages(parsedMarkdown).trim();
        } catch (error) {
          errors.push(`${path.basename(filePath)}：${formatImportError(error, filePath)}`);
          continue;
        }

        if (!fileContent) {
          errors.push(`${path.basename(filePath)}：未提取到有效 Markdown 内容，请检查文件内容`);
          continue;
        }

        parsedDocuments.push({
          file_content: fileContent,
          file_name: path.basename(filePath),
          parser_provider: parser.provider,
          parser_label: parserLabels[parser.provider] || '本地解析',
          fallback_to_local: Boolean(parser.fallbackToLocal),
          page_screenshots: pageScreenshots,
        });
      }

      if (!parsedDocuments.length) {
        return {
          success: false,
          message: errors[0] || '未提取到有效 Markdown 内容，请检查文件内容',
          documents: [],
        };
      }

      const fallbackToLocal = parsedDocuments.some((item) => item.fallback_to_local);
      const messageParts = [multiple ? `文件解析完成，共 ${parsedDocuments.length} 份` : '文件解析完成'];
      if (fallbackToLocal) messageParts.push('当前格式已自动使用本地解析');
      if (errors.length) messageParts.push(`失败 ${errors.length} 份`);
      return {
        success: true,
        message: messageParts.join('，'),
        file_content: parsedDocuments[0].file_content,
        file_name: parsedDocuments[0].file_name,
        parser_provider: parsedDocuments[0].parser_provider,
        parser_label: parsedDocuments[0].parser_label,
        documents: parsedDocuments,
        errors,
      };
    },

    async selectDuplicateCheckFiles(options = {}) {
      const multiple = options?.multiple !== false;
      const result = await dialog.showOpenDialog({
        title: multiple ? '选择投标文件' : '选择招标文件',
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [
          { name: '标书文档', extensions: [...duplicateCheckSupportedExtensions].map((item) => item.slice(1)) },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消选择', files: [] };
      }

      const supportedPaths = result.filePaths.filter((filePath) => duplicateCheckSupportedExtensions.has(path.extname(filePath).toLowerCase()));
      if (!supportedPaths.length) {
        return { success: false, message: '未选择支持的文件类型', files: [] };
      }

      const files = await Promise.all(supportedPaths.map(createLocalFileSelection));
      return {
        success: true,
        message: `已选择 ${files.length} 个文件`,
        files,
      };
    },
  };
}

module.exports = {
  createDeveloperParserCapabilityReport,
  createFileService,
  extractPageScreenshotCandidates,
  parseDocumentWithConfig,
  renderDocumentPageScreenshotCandidates,
  renderOfficePageScreenshotCandidates,
  renderPdfPageScreenshotCandidates,
  resolveFileParser,
};
