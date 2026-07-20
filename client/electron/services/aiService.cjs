const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { getAiLogsDir, getGeneratedImagesDir } = require('../utils/paths.cjs');
const { createDeveloperLogger } = require('../utils/developerLog.cjs');

const AI_REQUEST_TIMEOUT_MS = 300000;
const MAX_AI_LOG_TITLE_LENGTH = 64;
const CODEX_CLI_PROVIDER = 'codex-cli';
const CODEX_CLI_MODELS = ['gpt-5.5', 'gpt-5', 'gpt-5-codex'];
const OLLAMA_TEXT_MODEL_PROVIDERS = new Set(['local-gemma', 'local-qwen']);
const LOCAL_TEXT_MODEL_PROVIDERS = new Set([...OLLAMA_TEXT_MODEL_PROVIDERS, 'lm-studio', 'vllm', 'llama-cpp', 'jan']);
const IMAGE_MODEL_TEST_TIMEOUT_MESSAGE = '生图模型测试超时，请检查 Base URL、API Key 或模型名称';
const ANALYTICS_ENDPOINT = 'https://analytics.agnet.top/track';
const ANALYTICS_PROJECT_NAME = 'yibiao-client';
const JSON_FAILURE_SAMPLE_LIMIT = 20;
const JSON_FAILURE_SAMPLE_TEXT_LIMIT = 12000;
const JSON_FAILURE_SAMPLE_FILE = 'failure-samples.json';
const PROMPT_DEBUG_RECORD_TEXT_LIMIT = 12000;
const PROMPT_DEBUG_RECORD_FILE = 'debug-records.jsonl';
const JSON_LOG_REPLAY_LIMIT = 20;
const OPENAI_IMAGE_PROVIDER_META = {
  jinlong: {
    label: '金龙中转站',
    defaultBaseUrl: 'https://jlaudeapi.com/v1',
    logProvider: 'jinlong',
    modelLabel: '生图模型名称',
  },
  volcengine: {
    label: '火山方舟',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    logProvider: 'volcengine',
    modelLabel: '模型名称或推理接入点 ID',
  },
  'codex-gpt-image': {
    label: 'Codex GPT-image-2',
    defaultBaseUrl: 'https://api.openai.com/v1',
    logProvider: 'codex-gpt-image',
    modelLabel: '生图模型名称',
  },
  custom: {
    label: '自定义生图服务',
    defaultBaseUrl: '',
    logProvider: 'custom',
    modelLabel: '生图模型名称',
  },
};

function trimBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function resolveOllamaTagsUrl(baseUrl) {
  const trimmed = trimBaseUrl(baseUrl);
  const root = trimmed.replace(/\/v1$/i, '');
  return `${root}/api/tags`;
}

function requireBaseUrl(baseUrl, message) {
  const trimmed = trimBaseUrl(baseUrl);
  if (!trimmed) {
    throw new Error(message);
  }
  return trimmed;
}

function createRequestId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
}

function sanitizeAiLogTitle(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_AI_LOG_TITLE_LENGTH)
    .replace(/[. ]+$/g, '');
}

function resolveAiLogTitle(request, fallback = '') {
  return sanitizeAiLogTitle(request?.logTitle || request?.log_title || request?.progressLabel || request?.schemaName || fallback);
}

function buildAiLogFileName(payload) {
  const requestId = String(payload.request_id || createRequestId()).trim();
  const logTitle = sanitizeAiLogTitle(payload.log_title);
  if (!logTitle) {
    return `${requestId}.json`;
  }

  const match = /^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(requestId);
  if (match) {
    return `${match[1]}-${logTitle}-${match[2]}.json`;
  }
  return `${requestId}-${logTitle}.json`;
}

function isResponseFormatUnsupported(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('response_format') && [
    'not supported',
    'does not support',
    'not support',
    'unsupported',
    'unknown parameter',
    'invalid parameter',
    'must be',
  ].some((marker) => normalized.includes(marker));
}

function writeAiLog(app, config, payload) {
  if (!config.developer_mode) {
    return;
  }

  const logsDir = getAiLogsDir(app);
  fs.mkdirSync(logsDir, { recursive: true });
  const logTitle = sanitizeAiLogTitle(payload.log_title);
  const logPayload = logTitle ? { ...payload, log_title: logTitle } : payload;
  const fileName = buildAiLogFileName(logPayload);
  fs.writeFileSync(path.join(logsDir, fileName), JSON.stringify(logPayload, null, 2), 'utf-8');
}

function createModuleDeveloperLogger(app, config, moduleName, request = {}) {
  return createDeveloperLogger({
    app,
    config,
    moduleName,
    name: request.name || request.logTitle || moduleName,
    meta: request.meta || {},
  });
}

function getJsonFailureSamplesPath(app) {
  return path.join(app.getPath('userData'), 'logs', 'developer-json-lab', JSON_FAILURE_SAMPLE_FILE);
}

function getPromptDebugRecordsPath(app) {
  return path.join(app.getPath('userData'), 'logs', 'developer-prompt-lab', PROMPT_DEBUG_RECORD_FILE);
}

function compactJsonFailureText(value, limit = JSON_FAILURE_SAMPLE_TEXT_LIMIT) {
  return String(value || '').slice(0, limit);
}

function compactPromptDebugText(value, limit = PROMPT_DEBUG_RECORD_TEXT_LIMIT) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[API_KEY_REMOVED]')
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, '[LOCAL_PATH_REMOVED]')
    .replace(/\/Users\/[^\s"'`]+/g, '[LOCAL_PATH_REMOVED]')
    .slice(0, limit);
}

function normalizeJsonFailureIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeJsonFailureSample(input = {}) {
  return {
    id: String(input.id || createRequestId()),
    created_at: String(input.created_at || new Date().toISOString()),
    scenario_id: String(input.scenario_id || input.scenarioId || '').slice(0, 80),
    scenario_label: String(input.scenario_label || input.scenarioLabel || '').slice(0, 120),
    schema_name: String(input.schema_name || input.schemaName || '').slice(0, 120),
    target_description: String(input.target_description || input.targetDescription || '').slice(0, 500),
    invalid_content: compactJsonFailureText(input.invalid_content || input.invalidContent),
    issues: normalizeJsonFailureIssues(input.issues),
    error_message: String(input.error_message || input.errorMessage || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
  };
}

function readJsonFailureSamples(app) {
  const filePath = getJsonFailureSamplesPath(app);
  if (!fs.existsSync(filePath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return (Array.isArray(payload?.samples) ? payload.samples : [])
      .map(normalizeJsonFailureSample)
      .filter((sample) => sample.scenario_id && sample.invalid_content)
      .slice(0, JSON_FAILURE_SAMPLE_LIMIT);
  } catch {
    return [];
  }
}

function writeJsonFailureSamples(app, samples) {
  const filePath = getJsonFailureSamplesPath(app);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    updated_at: new Date().toISOString(),
    samples: samples.slice(0, JSON_FAILURE_SAMPLE_LIMIT),
  }, null, 2), 'utf-8');
  return filePath;
}

function saveJsonFailureSample(app, input) {
  const sample = normalizeJsonFailureSample(input);
  if (!sample.scenario_id || !sample.invalid_content) {
    throw new Error('缺少可保存的 JSON 失败样本');
  }
  const samples = [
    sample,
    ...readJsonFailureSamples(app).filter((item) => item.id !== sample.id),
  ].slice(0, JSON_FAILURE_SAMPLE_LIMIT);
  const filePath = writeJsonFailureSamples(app, samples);
  return { success: true, message: 'JSON 失败样本已保存', sample, samples, filePath };
}

function normalizePromptDebugRecord(input = {}) {
  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .slice(0, 20)
    .map((message) => ({
      role: String(message?.role || '').slice(0, 24),
      content: compactPromptDebugText(message?.content),
    }))
    .filter((message) => message.role && message.content);

  const messageCount = Number.isFinite(Number(input.messageCount))
    ? Number(input.messageCount)
    : messages.length;
  const charCount = Number.isFinite(Number(input.charCount))
    ? Number(input.charCount)
    : messages.reduce((sum, message) => sum + message.content.length, 0);

  return {
    id: String(input.id || createRequestId()),
    created_at: String(input.created_at || input.createdAt || new Date().toISOString()),
    chain_id: String(input.chain_id || input.chainId || '').slice(0, 120),
    chain_label: String(input.chain_label || input.chainLabel || '').slice(0, 160),
    response_format: String(input.response_format || input.responseFormat || '').slice(0, 80),
    schema: compactPromptDebugText(input.schema, 4000),
    message_count: messageCount,
    char_count: charCount,
    messages,
    redaction: {
      api_key: 'not included',
      base_url: 'not included',
      local_path: 'removed if present',
      file_name: 'sample only',
    },
  };
}

function savePromptDebugRecord(app, input) {
  const record = normalizePromptDebugRecord(input);
  if (!record.chain_id || !record.chain_label || !record.messages.length) {
    throw new Error('缺少可保存的 Prompt 调试记录');
  }
  const filePath = getPromptDebugRecordsPath(app);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
  return {
    success: true,
    message: 'Prompt 调试记录已保存',
    record,
    filePath,
  };
}

function redactJsonReplayText(value) {
  return compactJsonFailureText(value)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[API_KEY_REMOVED]')
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, '[LOCAL_PATH_REMOVED]')
    .replace(/\/Users\/[^\s"'`]+/g, '[LOCAL_PATH_REMOVED]');
}

function readJsonLogPayload(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function isJsonReplayLogPayload(payload) {
  const type = String(payload?.type || '');
  if (type !== 'chat' && type !== 'chat-error') return false;
  const responseFormat = payload?.request?.response_format;
  const logTitle = String(payload?.log_title || '');
  return responseFormat?.type === 'json_object' || /json/i.test(logTitle);
}

function extractJsonReplayContent(payload) {
  if (typeof payload?.content === 'string' && payload.content.trim()) {
    return payload.content;
  }

  const response = payload?.response;
  const choiceContent = response?.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string' && choiceContent.trim()) {
    return choiceContent;
  }

  const candidateText = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text)
    .filter(Boolean)
    .join('\n');
  if (candidateText) return candidateText;

  return '';
}

function normalizeJsonReplayLog(payload, fileName, mtimeMs) {
  if (!isJsonReplayLogPayload(payload)) return null;
  const invalidContent = redactJsonReplayText(extractJsonReplayContent(payload));
  if (!invalidContent.trim()) return null;

  const errorMessage = String(payload.error || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const logTitle = sanitizeAiLogTitle(payload.log_title || payload.request?.schemaName || 'JSON 请求日志');
  return {
    id: String(payload.request_id || fileName || createRequestId()),
    created_at: String(payload.created_at || new Date(mtimeMs || Date.now()).toISOString()),
    log_title: logTitle,
    type: String(payload.type || ''),
    request_mode: String(payload.request_mode || ''),
    error_message: errorMessage,
    content_preview: invalidContent.slice(0, 800),
    invalid_content: invalidContent,
    issues: errorMessage
      ? [`AI 请求失败：${errorMessage}`]
      : [`来自开发者 AI 日志：${logTitle || 'JSON 请求'}，请人工确认 JSON 校验问题。`],
  };
}

function listJsonReplayLogs(app) {
  const logsDir = getAiLogsDir(app);
  if (!fs.existsSync(logsDir)) {
    return { success: true, logs: [] };
  }

  const logs = fs.readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const filePath = path.join(logsDir, entry.name);
      const stat = fs.statSync(filePath);
      const payload = readJsonLogPayload(filePath);
      return payload ? normalizeJsonReplayLog(payload, entry.name, stat.mtimeMs) : null;
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, JSON_LOG_REPLAY_LIMIT);

  return { success: true, logs };
}

function normalizeTokenNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeTokenUsage(usage) {
  const source = usage || {};
  const promptTokens = normalizeTokenNumber(source.prompt_tokens ?? source.promptTokens ?? source.promptTokenCount);
  const completionTokens = normalizeTokenNumber(
    source.completion_tokens
    ?? source.completionTokens
    ?? source.completionTokenCount
    ?? source.candidatesTokenCount,
  );
  const totalTokens = normalizeTokenNumber(source.total_tokens ?? source.totalTokens ?? source.totalTokenCount)
    || promptTokens + completionTokens;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function normalizeAnalyticsEndpointHost(baseUrl) {
  const rawValue = String(baseUrl || '').trim();
  if (!rawValue) {
    return '';
  }

  const candidates = rawValue.includes('://') ? [rawValue] : [`https://${rawValue}`];
  for (const candidate of candidates) {
    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {
      // 尝试下一个候选格式。
    }
  }

  return '';
}

function extractOpenAIUsage(responseData) {
  return normalizeTokenUsage(responseData?.usage);
}

function extractGoogleUsage(responseData) {
  return normalizeTokenUsage(responseData?.usageMetadata || responseData?.usage_metadata);
}

function normalizeRequestTimeoutMs(request) {
  const timeoutMs = Number(request?.timeout_ms);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AI_REQUEST_TIMEOUT_MS;
}

function normalizeTextRequestMode(config) {
  return config?.request_mode === 'normal' ? 'normal' : 'stream';
}

function normalizeImageRequestMode(imageConfig) {
  return imageConfig?.request_mode === 'normal' ? 'normal' : 'stream';
}

function isCodexGptImageProvider(provider) {
  return provider === 'codex-gpt-image';
}

function normalizeGptImageSize(size) {
  return ['1024x1024', '1024x1536', '1536x1024'].includes(size) ? size : '1024x1024';
}

function createOpenAICompatibleImageRequestBody(imageConfig, prompt, requestMode, provider, size) {
  const useGptImageDefaults = isCodexGptImageProvider(provider);
  return {
    model: imageConfig.model_name,
    prompt,
    size: useGptImageDefaults ? normalizeGptImageSize(size) : size,
    ...(useGptImageDefaults ? {} : { response_format: 'url' }),
    ...(requestMode === 'stream' ? { stream: true } : {}),
  };
}

function createAbortError() {
  const error = new Error('AI 请求超时');
  error.name = 'AbortError';
  return error;
}

function createOperationTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutPromise = new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(createAbortError());
    }, timeoutMs);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

  return {
    signal: controller.signal,
    run(promise) {
      return Promise.race([promise, timeoutPromise]);
    },
    clear() {
      controller.abort();
    },
  };
}

function createHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function trackAiRequest(app, config, payload) {
  void Promise.resolve()
    .then(() => {
      const imageConfig = config.image_model || {};
      const requestType = payload.ai_request_type || '';
      const tokenUsage = normalizeTokenUsage(payload.usage);
      const modelProvider = requestType === 'image'
        ? imageConfig.provider || ''
        : config.text_model_provider || '';
      const modelBaseUrl = requestType === 'image'
        ? imageConfig.base_url || ''
        : config.base_url || '';
      const modelEndpointHost = normalizeAnalyticsEndpointHost(modelBaseUrl);
      const modelName = requestType === 'image'
        ? imageConfig.model_name || ''
        : config.model_name || '';
      const body = {
        projectName: ANALYTICS_PROJECT_NAME,
        event: 'ai_request',
        version: typeof app?.getVersion === 'function' ? app.getVersion() : '',
        platform: process.platform,
        arch: process.arch,
        client_id: config.analytics_client_id || '',
        client_created_at: config.analytics_created_at || '',
        ai_request_type: requestType,
        ai_model_provider: modelProvider,
        ai_model_base_url: modelEndpointHost,
        ai_model_name: modelName,
        prompt_tokens: tokenUsage.prompt_tokens,
        completion_tokens: tokenUsage.completion_tokens,
        total_tokens: tokenUsage.total_tokens,
        text_model_name: requestType === 'text' ? modelName : '',
        image_model_name: requestType === 'image' ? modelName : '',
      };

      return fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    })
    .catch(() => undefined);
}

function imageExtensionFromMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  return 'png';
}

function getImageModelAvailability(config) {
  const imageConfig = config.image_model || {};
  if (imageConfig.status !== 'available') {
    return { available: false, status: imageConfig.status || 'untested', message: '生图模型未测试可用' };
  }

  if (!imageConfig.api_key) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 API Key' };
  }

  if (!imageConfig.model_name) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型名称' };
  }

  if (!trimBaseUrl(imageConfig.base_url)) {
    return { available: false, status: 'unavailable', message: '请先填写生图模型 Base URL' };
  }

  return { available: true, status: 'available', message: '生图模型可用' };
}

function normalizeImagePrompt(request) {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) {
    throw new Error('生图提示词为空');
  }

  const styleHint = request.style === 'realistic_photo'
    ? '画面采用专业实景照片风格，真实、克制、适合投标技术方案插图。'
    : '画面采用工程项目图示风格，结构清晰、专业克制、适合投标技术方案插图。';
  return `${prompt}\n\n${styleHint}\n避免出现品牌标识、水印、夸张营销元素和无关文字。`;
}

function safeImageResponse(data) {
  return {
    ...data,
    data: Array.isArray(data?.data)
      ? data.data.map((item) => ({ ...item, b64_json: item.b64_json ? '[base64 omitted]' : item.b64_json }))
      : data?.data,
    candidates: Array.isArray(data?.candidates) ? '[candidates omitted]' : data?.candidates,
  };
}

async function downloadImage(url) {
  const response = await fetch(url);
  await ensureOk(response, '图片下载失败');
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mime_type: response.headers.get('content-type') || 'image/png',
  };
}

function saveGeneratedImage(app, image) {
  const imagesDir = getGeneratedImagesDir(app);
  fs.mkdirSync(imagesDir, { recursive: true });
  const extension = imageExtensionFromMime(image.mime_type);
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(imagesDir, fileName);
  fs.writeFileSync(filePath, image.buffer);
  return {
    asset_url: `yibiao-asset://generated-images/${encodeURIComponent(fileName)}`,
    file_path: filePath,
    mime_type: image.mime_type,
  };
}

async function ensureOk(response, fallbackMessage) {
  if (response.ok) {
    return;
  }

  let detail = '';
  try {
    const body = await response.json();
    detail = body.error?.message || body.message || '';
  } catch {
    detail = await response.text().catch(() => '');
  }

  throw new Error(detail || fallbackMessage);
}

async function fetchOpenAICompatibleImageResponse(baseUrl, apiKey, requestBody, fallbackMessage, options = {}) {
  const sendRequest = (body) => fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const response = await sendRequest(requestBody);
  if (response.ok) {
    return response;
  }

  let detail = '';
  try {
    const body = await response.json();
    detail = body.error?.message || body.message || '';
  } catch {
    detail = await response.text().catch(() => '');
  }

  if (requestBody.response_format && isResponseFormatUnsupported(detail)) {
    const retryBody = { ...requestBody };
    delete retryBody.response_format;
    const retryResponse = await sendRequest(retryBody);
    await ensureOk(retryResponse, fallbackMessage);
    return retryResponse;
  }

  throw new Error(detail || fallbackMessage);
}

function extractJsonContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized.startsWith('```')) {
    return normalized;
  }

  const lines = normalized.split(/\r?\n/);
  const firstLine = (lines[0] || '').trim().toLowerCase();
  const lastLine = (lines[lines.length - 1] || '').trim();
  if ((firstLine === '```' || firstLine === '```json') && lastLine.startsWith('```')) {
    return lines.slice(1, -1).join('\n').trim();
  }

  return normalized;
}

function extractFencedJsonBlocks(content) {
  const blocks = [];
  const normalized = String(content || '').trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fenceRegex.exec(normalized);

  while (match) {
    const block = String(match[1] || '').trim();
    if (block) {
      blocks.push(block);
    }
    match = fenceRegex.exec(normalized);
  }

  return blocks;
}

function extractBalancedJsonCandidates(content) {
  const text = String(content || '');
  const candidates = [];

  for (let start = 0; start < text.length; start += 1) {
    const firstChar = text[start];
    if (firstChar !== '{' && firstChar !== '[') {
      continue;
    }

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expectedOpen = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expectedOpen) {
          break;
        }

        stack.pop();
        if (!stack.length) {
          const candidate = text.slice(start, index + 1).trim();
          if (candidate) {
            candidates.push(candidate);
          }
          start = index;
          break;
        }
      }
    }
  }

  return candidates;
}

const jsonEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);
const markdownEscapeChars = new Set(['.', '(', ')', '[', ']', '{', '}', '#', '*', '+', '-', '_', '!', '<', '>', '|', '`']);

function repairInvalidJsonStringEscapes(content) {
  const text = String(content || '');
  let output = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char !== '\\') {
      output += char;
      continue;
    }

    const nextChar = text[index + 1] || '';
    if (!nextChar) {
      output += '\\\\';
      continue;
    }

    if (nextChar === 'u') {
      const unicodeDigits = text.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
        output += text.slice(index, index + 6);
        index += 5;
      } else {
        output += '\\\\';
      }
      continue;
    }

    if (jsonEscapeChars.has(nextChar)) {
      output += char + nextChar;
      index += 1;
      continue;
    }

    if (markdownEscapeChars.has(nextChar)) {
      output += nextChar;
      index += 1;
      continue;
    }

    output += '\\\\';
  }

  return output;
}

function parseJsonContent(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
  const candidates = [
    normalized,
    extractJsonContent(normalized),
    ...extractFencedJsonBlocks(normalized),
  ].filter(Boolean);

  const withBalancedCandidates = [];
  for (const candidate of candidates) {
    withBalancedCandidates.push(candidate);
    withBalancedCandidates.push(...extractBalancedJsonCandidates(candidate));
  }

  const repairedCandidates = [];
  for (const candidate of withBalancedCandidates) {
    const repaired = repairInvalidJsonStringEscapes(candidate);
    if (repaired !== candidate) {
      repairedCandidates.push(repaired);
    }
  }

  const uniqueCandidates = [...new Set([...withBalancedCandidates, ...repairedCandidates].map((item) => item.trim()).filter(Boolean))];
  let lastError = null;

  for (const candidate of uniqueCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('AI 返回内容为空，无法解析 JSON');
}

function formatJsonIssues(error) {
  if (error instanceof SyntaxError) {
    return [`JSON 语法错误：${error.message}`];
  }

  return [error?.message || String(error || '字段校验失败')];
}

function buildJsonRepairMessages(invalidContent, issues, targetDescription) {
  const issueLines = (issues || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    {
      role: 'system',
      content: `你是一个严格的 JSON 修复助手。请根据给出的原始内容和校验问题，修复现有结果。

要求：
1. 优先在原结果基础上做最小必要修改，不要整体重写
2. 尽量保留原有结构、字段值、节点顺序和已生成内容
3. 若缺少必填字段，应结合现有上下文补齐合理内容，不要用空字符串敷衍
4. 若存在多余说明、代码块包裹、字段名错误、children 结构不规范或顶层包裹错误，应修正为合法 JSON
5. 必须修复 JSON 字符串中的非法反斜杠转义，例如将 1\\. 改为 1.，或将必须保留的反斜杠写成 \\\\
6. 只返回修复后的完整 JSON，不要输出任何解释`,
    },
    { role: 'user', content: `目标结果类型：${targetDescription}` },
    { role: 'user', content: `当前校验问题：\n${issueLines}` },
    {
      role: 'user',
      content: `待修复内容：\n\`\`\`json\n${String(invalidContent || '').slice(0, 60000)}\n\`\`\``,
    },
    {
      role: 'user',
      content: '请在保留原有正确内容的前提下，仅修复上述问题，并返回完整 JSON。',
    },
  ];
}

async function emitProgress(progressCallback, message) {
  if (!progressCallback) {
    return;
  }

  await Promise.resolve(progressCallback(message));
}

function normalizeJsonPayload(request, parsed) {
  const normalized = request.normalizer ? request.normalizer(parsed) : parsed;
  if (request.validator) {
    request.validator(normalized);
  }
  return normalized;
}

async function repairJsonResponse(app, config, invalidContent, issues, temperature, responseFormat, progressCallback, progressLabel, repairMessagesBuilder, logTitle) {
  await emitProgress(progressCallback, `${progressLabel}格式校验失败，正在基于当前结果进行修复。`);
  return chatWithConfig(app, config, {
    messages: repairMessagesBuilder
      ? repairMessagesBuilder({ invalidContent, issues, progressLabel })
      : buildJsonRepairMessages(invalidContent, issues, progressLabel),
    temperature,
    response_format: responseFormat,
    logTitle: logTitle ? `${logTitle}修复` : `${progressLabel}修复`,
  });
}

async function parseOrRepairJsonResponseWithConfig(app, config, request, content) {
  const temperature = request.temperature ?? 0.7;
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);

  try {
    return normalizeJsonPayload(request, parseJsonContent(content));
  } catch (error) {
    const issues = formatJsonIssues(error);
    try {
      const repairedContent = await repairJsonResponse(
        app,
        config,
        content,
        issues,
        temperature,
        responseFormat,
        request.progressCallback,
        progressLabel,
        request.repairMessagesBuilder,
        logTitle,
      );
      return normalizeJsonPayload(request, parseJsonContent(repairedContent));
    } catch {
      throw new Error(failureMessage);
    }
  }
}

async function collectJsonResponseWithConfig(app, config, request) {
  const maxRetries = request.max_retries ?? 2;
  const totalAttempts = maxRetries + 1;
  const temperature = request.temperature ?? 0.7;
  const responseFormat = request.response_format || { type: 'json_object' };
  const progressLabel = request.progressLabel || 'JSON结果';
  const failureMessage = request.failureMessage || '模型返回的 JSON 数据格式无效';
  const logTitle = resolveAiLogTitle(request, progressLabel);
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const content = await chatWithConfig(app, config, {
      messages: request.messages,
      temperature,
      response_format: responseFormat,
      timeout_ms: request.timeout_ms,
      timeout_message: request.timeout_message,
      logTitle,
    });

    try {
      const parsed = parseJsonContent(content);
      return normalizeJsonPayload(request, parsed);
    } catch (error) {
      lastError = error;
      const issues = formatJsonIssues(error);

      try {
        const repairedContent = await repairJsonResponse(
          app,
          config,
          content,
          issues,
          temperature,
          responseFormat,
          request.progressCallback,
          progressLabel,
          request.repairMessagesBuilder,
          logTitle,
        );
        const repairedParsed = parseJsonContent(repairedContent);
        return normalizeJsonPayload(request, repairedParsed);
      } catch (repairError) {
        lastError = repairError;

        if (attempt === maxRetries) {
          await emitProgress(request.progressCallback, `${progressLabel}连续 ${totalAttempts} 次校验失败。`);
          throw new Error(failureMessage);
        }

        await emitProgress(request.progressCallback, `${progressLabel}第 ${attempt + 1}/${totalAttempts} 次校验失败，正在重试。`);
      }
    }
  }

  throw new Error(lastError?.message || failureMessage);
}

function createChatRequestBody(config, request, options = {}) {
  const body = {
    model: config.model_name,
    messages: request.messages,
  };

  if (options.stream) {
    body.stream = true;
  }

  if (request.response_format && !options.omitResponseFormat) {
    body.response_format = request.response_format;
  }

  return body;
}

function isCodexCliTextProvider(config) {
  return config?.text_model_provider === CODEX_CLI_PROVIDER;
}

function isLocalHttpTextProvider(config) {
  return LOCAL_TEXT_MODEL_PROVIDERS.has(config?.text_model_provider);
}

function isOllamaTextProvider(config) {
  return OLLAMA_TEXT_MODEL_PROVIDERS.has(config?.text_model_provider);
}

function formatCodexCliMessage(message) {
  const roleLabels = {
    system: '系统',
    user: '用户',
    assistant: '助手',
  };
  return `## ${roleLabels[message?.role] || message?.role || '消息'}\n${String(message?.content || '').trim()}`;
}

function createCodexCliPrompt(request) {
  const jsonInstruction = request.response_format?.type === 'json_object'
    ? '\n\n输出要求：只返回一个合法 JSON 对象，不要添加 Markdown 代码块、解释或前后缀。'
    : '';
  const messages = Array.isArray(request.messages)
    ? request.messages.map(formatCodexCliMessage).join('\n\n')
    : '';

  return `你是易标投标工具箱的文本生成后端。请严格根据下面的对话内容生成最终回复，不要读取本机文件，不要运行命令，不要修改任何文件。${jsonInstruction}

${messages}`.trim();
}

function createCodexCliArgs(config, outputFile) {
  const args = [
    '--ask-for-approval',
    'never',
    'exec',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--color',
    'never',
    '--output-last-message',
    outputFile,
  ];
  const modelName = String(config.model_name || '').trim();
  if (modelName) {
    args.push('-m', modelName);
  }
  args.push('-');
  return args;
}

function resolveCodexCliCommand(env = process.env, fileExists = fs.existsSync) {
  const explicitPath = String(env.CODEX_CLI_PATH || '').trim();
  if (explicitPath) {
    return explicitPath;
  }

  const candidatePaths = [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ];
  const foundPath = candidatePaths.find((candidate) => {
    try {
      return fileExists(candidate);
    } catch {
      return false;
    }
  });
  return foundPath || 'codex';
}

function summarizeCodexCliFailure(stderr, stdout, signal) {
  const combined = [stderr, stdout].filter(Boolean).join('\n').trim();
  if (!combined) {
    return signal ? `进程被终止：${signal}` : '';
  }

  if (/Codex ran out of room in the model's context window/i.test(combined)) {
    return 'Codex CLI 上下文窗口不足：本次输入内容过长，请减少参考资料或分批生成。';
  }

  const lines = combined.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const importantLines = lines.filter((line) => {
    if (/^\d{4}-\d{2}-\d{2}T.*\bWARN\b/.test(line)) return false;
    if (/^OpenAI Codex\b|^workdir:|^model:|^provider:|^approval:|^sandbox:|^reasoning\b|^session id:|^-{4,}$/.test(line)) return false;
    if (/^["']?(content|resume|summary|title|description)["']?\s*[:：]/i.test(line)) return false;
    if (/^(第\s*\d+\s*页|附录|正常启动日志样例|接口调用日志样例|异常日志样例|验证方式|验证步骤|验收通过标准)/.test(line)) return false;
    return /\b(ERROR|Error|error|failed|失败|超时|timeout|not found|未找到)\b/.test(line);
  });
  const fallbackLines = lines.filter((line) => {
    if (/^["']?(content|resume|summary|title|description)["']?\s*[:：]/i.test(line)) return false;
    if (/^(第\s*\d+\s*页|附录|正常启动日志样例|接口调用日志样例|异常日志样例|验证方式|验证步骤|验收通过标准)/.test(line)) return false;
    return line.length <= 500;
  });
  const summary = (importantLines.length ? importantLines : fallbackLines)
    .slice(-8)
    .join('\n')
    .trim();
  if (!summary) {
    return signal
      ? `进程被终止：${signal}`
      : 'Codex CLI 已退出但未返回明确错误；请减少参考资料后重试，或打开开发者模式查看本机 AI 日志。';
  }
  return summary.length > 1600 ? `${summary.slice(0, 1600)}...` : summary;
}

function runCodexCli(app, config, prompt, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-codex-'));
  const outputFile = path.join(tempDir, 'last-message.txt');
  const cwd = typeof app?.getPath === 'function' ? app.getPath('userData') : os.tmpdir();
  const args = createCodexCliArgs(config, outputFile);
  const codexCommand = resolveCodexCliCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(codexCommand, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options.signal,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
    const stdoutParts = [];
    const stderrParts = [];

    child.stdout.on('data', (chunk) => stdoutParts.push(chunk));
    child.stderr.on('data', (chunk) => stderrParts.push(chunk));
    child.on('error', (error) => {
      cleanupCodexCliTempDir(tempDir);
      if (error.name === 'AbortError') {
        reject(createAbortError());
        return;
      }
      if (error.code === 'ENOENT') {
        reject(new Error('未找到 codex 命令，请先安装并登录 Codex CLI'));
        return;
      }
      reject(error);
    });
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(stdoutParts).toString('utf-8').trim();
      const stderr = Buffer.concat(stderrParts).toString('utf-8').trim();
      try {
        if (code !== 0) {
          const suffix = summarizeCodexCliFailure(stderr, stdout, signal);
          reject(new Error(`Codex CLI 调用失败${suffix ? `：${suffix}` : ''}`));
          return;
        }

        const content = fs.existsSync(outputFile)
          ? fs.readFileSync(outputFile, 'utf-8').trim()
          : stdout;
        if (!content) {
          reject(new Error('Codex CLI 未返回文本内容'));
          return;
        }
        resolve({
          content,
          responseData: {
            provider: CODEX_CLI_PROVIDER,
            model: config.model_name || '',
            stdout,
            stderr,
          },
        });
      } finally {
        cleanupCodexCliTempDir(tempDir);
      }
    });

    child.stdin.end(prompt);
  });
}

function cleanupCodexCliTempDir(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败不影响主流程。
  }
}

async function fetchChatCompletion(app, config, body, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS) : null;
  try {
    const baseUrl = requireBaseUrl(config.base_url, '请先在设置中配置文本模型 Base URL');
    return await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: createHeaders(config.api_key),
      body: JSON.stringify(body),
      signal: options.signal || controller.signal,
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function createAiHttpError(detail, fallbackMessage) {
  const error = new Error(detail || fallbackMessage);
  error.responseFormatUnsupported = isResponseFormatUnsupported(detail);
  return error;
}

async function ensureTextAiResponseOk(response, fallbackMessage) {
  if (response.ok) {
    return;
  }

  let detail = '';
  const rawText = await response.text().catch(() => '');
  try {
    const body = rawText ? JSON.parse(rawText) : null;
    detail = body?.error?.message || body?.message || '';
  } catch {
    detail = rawText;
  }

  throw createAiHttpError(detail, fallbackMessage);
}

function appendStreamChoiceContent(choice, contentParts) {
  const deltaContent = choice?.delta?.content;
  const messageContent = choice?.message?.content;
  const textContent = choice?.text;

  if (typeof deltaContent === 'string') {
    contentParts.push(deltaContent);
    return;
  }

  if (typeof messageContent === 'string') {
    contentParts.push(messageContent);
    return;
  }

  if (typeof textContent === 'string') {
    contentParts.push(textContent);
  }
}

function normalizeStreamPayloadError(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || error.code || fallbackMessage;
}

async function readSseJsonDataLine(line, state, options) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
    return;
  }

  const data = trimmed.slice(5).trim();
  if (!data) {
    return;
  }

  if (data === '[DONE]') {
    state.done = true;
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(data);
  } catch (error) {
    throw new Error(`${options.parseErrorMessage || 'AI 流式响应解析失败'}：${error.message}`);
  }

  if (payload?.error && options.throwOnPayloadError !== false) {
    throw new Error(normalizeStreamPayloadError(payload.error, options.failureMessage || 'AI 流式请求失败'));
  }

  await Promise.resolve(options.onPayload?.(payload));
}

async function readSseJsonStream(response, options = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error(options.unreadableMessage || 'AI 流式响应不可读');
  }

  const decoder = new TextDecoder('utf-8');
  const state = { done: false };
  let buffer = '';

  while (!state.done) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      await readSseJsonDataLine(line, state, options);
      if (state.done) {
        break;
      }
    }
  }

  buffer += decoder.decode();
  if (!state.done && buffer.trim()) {
    const lines = buffer.split(/\r?\n/);
    for (const line of lines) {
      await readSseJsonDataLine(line, state, options);
      if (state.done) {
        break;
      }
    }
  }
}

async function readOpenAIChatStream(response) {
  const state = { usage: null, contentParts: [] };

  await readSseJsonStream(response, {
    unreadableMessage: 'AI 流式响应不可读',
    parseErrorMessage: 'AI 流式响应解析失败',
    failureMessage: 'AI 流式请求失败',
    onPayload(payload) {
      if (payload?.usage) {
        state.usage = payload.usage;
      }

      const choices = Array.isArray(payload?.choices) ? payload.choices : [];
      choices.forEach((choice) => appendStreamChoiceContent(choice, state.contentParts));
    },
  });

  const content = state.contentParts.join('');
  return {
    content,
    usage: state.usage,
    responseData: {
      stream: true,
      choices: [{ message: { content } }],
      usage: state.usage,
    },
  };
}

async function requestTextAiNormal(app, config, requestBody, options = {}) {
  const response = await fetchChatCompletion(app, config, requestBody, { signal: options.signal });
  await ensureTextAiResponseOk(response, 'AI 请求失败');
  const responseData = await response.json();
  return {
    content: responseData.choices?.[0]?.message?.content || '',
    usage: extractOpenAIUsage(responseData),
    responseData,
  };
}

async function requestTextAiStream(app, config, requestBody, options = {}) {
  const response = await fetchChatCompletion(app, config, requestBody, { signal: options.signal });
  await ensureTextAiResponseOk(response, 'AI 请求失败');
  return readOpenAIChatStream(response);
}

async function requestTextAi(app, config, requestBody, options = {}) {
  if (options.requestMode === 'stream') {
    return requestTextAiStream(app, config, requestBody, options);
  }

  return requestTextAiNormal(app, config, requestBody, options);
}

function appendOpenAICompatibleImageItem(state, item) {
  const url = String(item?.url || '');
  const b64Json = String(item?.b64_json || '');
  if (!url && !b64Json) {
    return;
  }

  state.images.push({
    ...item,
    url,
    b64_json: b64Json,
    mime_type: item?.mime_type || item?.mimeType || 'image/png',
  });
}

function appendOpenAICompatibleImageError(state, payload) {
  state.errors.push({
    image_index: payload?.image_index,
    code: payload?.error?.code || '',
    message: normalizeStreamPayloadError(payload?.error, '图片生成失败'),
  });
}

function appendOpenAICompatibleImagePayload(payload, state) {
  if (payload?.usage) {
    state.usage = payload.usage;
  }

  if (payload?.error && payload?.type !== 'image_generation.completed' && payload?.type !== 'image_generation.partial_failed') {
    appendOpenAICompatibleImageError(state, payload);
    return;
  }

  if (payload?.type === 'image_generation.completed') {
    state.completed = payload;
    if (payload.usage) {
      state.usage = payload.usage;
    }
    if (Array.isArray(payload?.data)) {
      payload.data.forEach((item) => appendOpenAICompatibleImageItem(state, item));
    } else {
      appendOpenAICompatibleImageItem(state, payload);
    }
    if (payload.error) {
      appendOpenAICompatibleImageError(state, payload);
    }
    return;
  }

  if (payload?.type === 'image_generation.partial_failed') {
    appendOpenAICompatibleImageError(state, payload);
    return;
  }

  if (payload?.type === 'image_generation.partial_succeeded') {
    appendOpenAICompatibleImageItem(state, payload);
    return;
  }

  if (Array.isArray(payload?.data)) {
    payload.data.forEach((item) => appendOpenAICompatibleImageItem(state, item));
    return;
  }

  appendOpenAICompatibleImageItem(state, payload);
}

async function readOpenAICompatibleImageStream(response) {
  const state = { images: [], errors: [], completed: null, usage: null };

  await readSseJsonStream(response, {
    unreadableMessage: '生图流式响应不可读',
    parseErrorMessage: '生图流式响应解析失败',
    failureMessage: '生图流式请求失败',
    throwOnPayloadError: false,
    onPayload(payload) {
      appendOpenAICompatibleImagePayload(payload, state);
    },
  });

  return {
    stream: true,
    data: state.images,
    errors: state.errors,
    completed: state.completed,
    usage: state.usage,
  };
}

async function requestOpenAICompatibleImageData(baseUrl, apiKey, requestBody, fallbackMessage, options = {}) {
  const response = await fetchOpenAICompatibleImageResponse(baseUrl, apiKey, requestBody, fallbackMessage, options);
  if (requestBody.stream) {
    return readOpenAICompatibleImageStream(response);
  }
  return response.json();
}

async function createImageFromOpenAICompatibleItem(item) {
  if (item?.b64_json) {
    return {
      buffer: Buffer.from(item.b64_json, 'base64'),
      mime_type: item.mime_type || item.mimeType || 'image/png',
    };
  }

  if (item?.url) {
    return downloadImage(item.url);
  }

  return null;
}

function getOpenAICompatibleImageFailureMessage(responseData, fallbackMessage) {
  const firstError = Array.isArray(responseData?.errors) ? responseData.errors.find((item) => item?.message) : null;
  return firstError?.message || fallbackMessage;
}

function createGoogleImageRequestBody(prompt) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
}

function createGoogleImageUrl(baseUrl, modelName, requestMode) {
  const action = requestMode === 'stream' ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return `${baseUrl}/models/${encodeURIComponent(modelName)}:${action}`;
}

function createGoogleHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function extractGoogleCandidateParts(responseData) {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];
  return candidates.flatMap((candidate) => (
    Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  ));
}

function appendGoogleImagePayload(payload, state) {
  if (payload?.usageMetadata || payload?.usage_metadata) {
    state.usageMetadata = payload.usageMetadata || payload.usage_metadata;
  }

  state.parts.push(...extractGoogleCandidateParts(payload));
}

async function readGoogleImageStream(response) {
  const state = { parts: [], usageMetadata: null };

  await readSseJsonStream(response, {
    unreadableMessage: '生图流式响应不可读',
    parseErrorMessage: '生图流式响应解析失败',
    failureMessage: 'Google AI Studio 生图流式请求失败',
    onPayload(payload) {
      appendGoogleImagePayload(payload, state);
    },
  });

  return {
    stream: true,
    candidates: [{ content: { parts: state.parts } }],
    usageMetadata: state.usageMetadata,
  };
}

async function requestGoogleImageData(baseUrl, imageConfig, requestBody, requestMode, fallbackMessage, options = {}) {
  const response = await fetch(createGoogleImageUrl(baseUrl, imageConfig.model_name, requestMode), {
    method: 'POST',
    headers: createGoogleHeaders(imageConfig.api_key),
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  await ensureOk(response, fallbackMessage);
  if (requestMode === 'stream') {
    return readGoogleImageStream(response);
  }
  return response.json();
}

function getGoogleImageInlineData(responseData) {
  const imagePart = extractGoogleCandidateParts(responseData).find((part) => part.inlineData?.data || part.inline_data?.data);
  return imagePart?.inlineData || imagePart?.inline_data || null;
}

function getGoogleText(responseData) {
  return extractGoogleCandidateParts(responseData)
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('')
    .trim();
}

async function chatWithConfig(app, config, request) {
  if (isCodexCliTextProvider(config)) {
    return chatWithCodexCliConfig(app, config, request);
  }

  if (!isLocalHttpTextProvider(config) && !config.api_key) {
    throw new Error('请先在设置中配置文本模型 API Key');
  }

  if (!config.model_name) {
    throw new Error('请先在设置中配置文本模型名称');
  }

  requireBaseUrl(config.base_url, '请先在设置中配置文本模型 Base URL');

  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, '文本请求');
  const requestMode = normalizeTextRequestMode(config);
  let requestBody = createChatRequestBody(config, request, { stream: requestMode === 'stream' });
  let responseData = null;
  let errorMessage = '';
  let analyticsTracked = false;
  const timeoutMs = normalizeRequestTimeoutMs(request);
  const timeout = createOperationTimeout(timeoutMs);

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-pending',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    let result = null;
    try {
      result = await timeout.run(requestTextAi(app, config, requestBody, { signal: timeout.signal, requestMode }));
    } catch (error) {
      if (!request.response_format || !error.responseFormatUnsupported) {
        throw error;
      }

      requestBody = createChatRequestBody(config, request, { omitResponseFormat: true, stream: requestMode === 'stream' });
      result = await timeout.run(requestTextAi(app, config, requestBody, { signal: timeout.signal, requestMode }));
    }

    responseData = result.responseData;
    trackAiRequest(app, config, { ai_request_type: 'text', usage: result.usage });
    analyticsTracked = true;
    const content = result.content || '';
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      content,
      created_at: new Date().toISOString(),
    });
    return content;
  } catch (error) {
    errorMessage = error.name === 'AbortError'
      ? request.timeout_message || `AI 请求超时（${timeoutMs / 1000} 秒）`
      : error.message;
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'text' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-error',
      request_mode: requestMode,
      url: `${trimBaseUrl(config.base_url)}/chat/completions`,
      request: requestBody,
      response: responseData,
      error: errorMessage,
      created_at: new Date().toISOString(),
    });
    throw new Error(errorMessage || 'AI 请求失败');
  } finally {
    timeout.clear();
  }
}

async function chatWithCodexCliConfig(app, config, request) {
  if (!config.model_name) {
    throw new Error('请先在设置中配置 Codex CLI 模型名称');
  }

  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, 'Codex CLI 文本请求');
  const requestBody = {
    model: config.model_name,
    messages: request.messages,
    response_format: request.response_format || null,
  };
  const prompt = createCodexCliPrompt(request);
  let responseData = null;
  let errorMessage = '';
  let analyticsTracked = false;
  const timeoutMs = normalizeRequestTimeoutMs(request);
  const timeout = createOperationTimeout(timeoutMs);

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-pending',
      request_mode: CODEX_CLI_PROVIDER,
      url: CODEX_CLI_PROVIDER,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    const result = await timeout.run(runCodexCli(app, config, prompt, { signal: timeout.signal }));
    responseData = result.responseData;
    trackAiRequest(app, config, { ai_request_type: 'text' });
    analyticsTracked = true;
    const content = result.content || '';
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat',
      request_mode: CODEX_CLI_PROVIDER,
      url: CODEX_CLI_PROVIDER,
      request: requestBody,
      response: responseData,
      content,
      created_at: new Date().toISOString(),
    });
    return content;
  } catch (error) {
    errorMessage = error.name === 'AbortError'
      ? request.timeout_message || `Codex CLI 请求超时（${timeoutMs / 1000} 秒）`
      : error.message;
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'text' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'chat-error',
      request_mode: CODEX_CLI_PROVIDER,
      url: CODEX_CLI_PROVIDER,
      request: requestBody,
      response: responseData,
      error: errorMessage,
      created_at: new Date().toISOString(),
    });
    throw new Error(errorMessage || 'Codex CLI 请求失败');
  } finally {
    timeout.clear();
  }
}

async function testOpenAICompatibleImageModel(app, config, provider) {
  const imageConfig = config.image_model || {};
  const meta = OPENAI_IMAGE_PROVIDER_META[provider] || OPENAI_IMAGE_PROVIDER_META.volcengine;
  let responseData = null;
  let analyticsTracked = false;

  if (!imageConfig.api_key) {
    throw new Error(`请先填写${meta.label} API Key`);
  }

  if (!imageConfig.model_name) {
    throw new Error(`请先填写${meta.label}${meta.modelLabel}`);
  }

  const baseUrl = requireBaseUrl(imageConfig.base_url, `${meta.label} Base URL 缺失，请重新选择服务商后保存配置`);
  const requestMode = normalizeImageRequestMode(imageConfig);
  const timeout = createOperationTimeout(AI_REQUEST_TIMEOUT_MS);

  try {
    const requestBody = createOpenAICompatibleImageRequestBody(
      imageConfig,
      'a simple blue dot on a white background',
      requestMode,
      provider,
      '2048x2048',
    );
    try {
      responseData = await timeout.run(requestOpenAICompatibleImageData(
        baseUrl,
        imageConfig.api_key,
        requestBody,
        `${meta.label}生图测试失败`,
        { signal: timeout.signal },
      ));
    } catch (error) {
      const message = error.message || '';
      if (message.includes('does not exist') || message.includes('do not have access')) {
        throw new Error(`${meta.label}生图模型不可用，请确认${meta.modelLabel}已开通并可访问。原始错误：${message}`);
      }

      throw error;
    }

    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractOpenAIUsage(responseData) });
    analyticsTracked = true;
    const firstImage = responseData.data?.[0] || {};
    const imageUrl = firstImage.url || '';
    const imageData = firstImage.b64_json || '';

    if (!imageUrl && !imageData) {
      throw new Error(getOpenAICompatibleImageFailureMessage(responseData, `${meta.label}生图测试未返回图片数据`));
    }

    return {
      success: true,
      message: imageUrl ? `测试成功：已生成图片 ${imageUrl}` : '测试成功：已返回生图结果',
      image_url: imageUrl,
      image_data: imageData,
      mime_type: 'image/png',
    };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
    }
    throw new Error(error?.name === 'AbortError' ? IMAGE_MODEL_TEST_TIMEOUT_MESSAGE : error?.message || '生图模型测试失败');
  } finally {
    timeout.clear();
  }
}

async function testGoogleImageModel(app, config) {
  const imageConfig = config.image_model || {};
  let analyticsTracked = false;

  if (!imageConfig.api_key) {
    throw new Error('请先填写 Google AI Studio API Key');
  }

  if (!imageConfig.model_name) {
    throw new Error('请先填写 Google 生图模型名称');
  }

  const baseUrl = requireBaseUrl(imageConfig.base_url, 'Google AI Studio Base URL 缺失，请重新选择服务商后保存配置');
  const requestMode = normalizeImageRequestMode(imageConfig);
  const timeout = createOperationTimeout(AI_REQUEST_TIMEOUT_MS);

  try {
    const requestBody = createGoogleImageRequestBody('Create a simple blue dot on a white background.');
    const data = await timeout.run(requestGoogleImageData(
      baseUrl,
      imageConfig,
      requestBody,
      requestMode,
      'Google AI Studio 生图测试失败',
      { signal: timeout.signal },
    ));
    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractGoogleUsage(data) });
    analyticsTracked = true;
    const text = getGoogleText(data);
    const inlineData = getGoogleImageInlineData(data);

    if (!inlineData?.data) {
      throw new Error('Google AI Studio 生图测试未返回图片数据');
    }

    return {
      success: true,
      message: `测试成功：已返回图片${text ? `，${text}` : ''}`,
      image_data: inlineData.data,
      mime_type: inlineData?.mimeType || inlineData?.mime_type || 'image/png',
    };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
    }
    throw new Error(error?.name === 'AbortError' ? IMAGE_MODEL_TEST_TIMEOUT_MESSAGE : error?.message || '生图模型测试失败');
  } finally {
    timeout.clear();
  }
}

async function generateOpenAICompatibleImage(app, config, request, provider) {
  const imageConfig = config.image_model || {};
  const meta = OPENAI_IMAGE_PROVIDER_META[provider] || OPENAI_IMAGE_PROVIDER_META.volcengine;
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, request.title ? `AI生图-${request.title}` : 'AI生图');
  const requestMode = normalizeImageRequestMode(imageConfig);
  const requestBody = createOpenAICompatibleImageRequestBody(
    imageConfig,
    normalizeImagePrompt(request),
    requestMode,
    provider,
    request.size || '2048x2048',
  );
  const baseUrl = requireBaseUrl(imageConfig.base_url, `${meta.label} Base URL 缺失，请重新选择服务商后保存配置`);
  let responseData = null;
  let analyticsTracked = false;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-pending',
      provider: meta.logProvider,
      request_mode: requestMode,
      url: `${baseUrl}/images/generations`,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    responseData = await requestOpenAICompatibleImageData(baseUrl, imageConfig.api_key, requestBody, `${meta.label}生图失败`);
    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractOpenAIUsage(responseData) });
    analyticsTracked = true;

    const item = responseData.data?.[0] || {};
    const image = await createImageFromOpenAICompatibleItem(item);

    if (!image) {
      throw new Error(getOpenAICompatibleImageFailureMessage(responseData, `${meta.label}生图未返回图片数据`));
    }

    const saved = saveGeneratedImage(app, image);
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image',
      provider: meta.logProvider,
      request_mode: requestMode,
      request: requestBody,
      response: safeImageResponse(responseData),
      result: saved,
      created_at: new Date().toISOString(),
    });
    return { success: true, title: request.title || '', ...saved };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-error',
      provider: meta.logProvider,
      request_mode: requestMode,
      request: requestBody,
      response: responseData ? safeImageResponse(responseData) : null,
      error: error.message,
      created_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function generateGoogleImage(app, config, request) {
  const imageConfig = config.image_model || {};
  const requestId = createRequestId();
  const logTitle = resolveAiLogTitle(request, request.title ? `AI生图-${request.title}` : 'AI生图');
  const requestMode = normalizeImageRequestMode(imageConfig);
  const requestBody = createGoogleImageRequestBody(normalizeImagePrompt(request));
  const baseUrl = requireBaseUrl(imageConfig.base_url, 'Google AI Studio Base URL 缺失，请重新选择服务商后保存配置');
  const url = createGoogleImageUrl(baseUrl, imageConfig.model_name, requestMode);
  let responseData = null;
  let analyticsTracked = false;

  try {
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-pending',
      provider: 'google-ai-studio',
      request_mode: requestMode,
      url,
      request: requestBody,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    responseData = await requestGoogleImageData(baseUrl, imageConfig, requestBody, requestMode, 'Google AI Studio 生图失败');
    trackAiRequest(app, config, { ai_request_type: 'image', usage: extractGoogleUsage(responseData) });
    analyticsTracked = true;
    const inlineData = getGoogleImageInlineData(responseData);

    if (!inlineData?.data) {
      throw new Error('Google AI Studio 生图未返回图片数据');
    }

    const saved = saveGeneratedImage(app, {
      buffer: Buffer.from(inlineData.data, 'base64'),
      mime_type: inlineData.mimeType || inlineData.mime_type || 'image/png',
    });
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image',
      provider: 'google-ai-studio',
      request_mode: requestMode,
      request: requestBody,
      response: safeImageResponse(responseData),
      result: saved,
      created_at: new Date().toISOString(),
    });
    return { success: true, title: request.title || '', ...saved };
  } catch (error) {
    if (!analyticsTracked) {
      trackAiRequest(app, config, { ai_request_type: 'image' });
      analyticsTracked = true;
    }
    writeAiLog(app, config, {
      request_id: requestId,
      log_title: logTitle,
      type: 'image-error',
      provider: 'google-ai-studio',
      request_mode: requestMode,
      request: requestBody,
      response: responseData ? safeImageResponse(responseData) : null,
      error: error.message,
      created_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function generateImageWithConfig(app, config, request) {
  const availability = getImageModelAvailability(config);
  if (!availability.available) {
    throw new Error(availability.message);
  }

  if (
    config.image_model?.provider === 'jinlong'
    || config.image_model?.provider === 'volcengine'
    || config.image_model?.provider === 'codex-gpt-image'
    || config.image_model?.provider === 'custom'
  ) {
    return generateOpenAICompatibleImage(app, config, request, config.image_model.provider);
  }

  if (config.image_model?.provider === 'google-ai-studio') {
    return generateGoogleImage(app, config, request);
  }

  throw new Error('当前生图服务商暂不支持正文配图');
}

function createAiService({ app, configStore }) {
  return {
    async chat(request) {
      const config = configStore.load();
      return chatWithConfig(app, config, request);
    },

    async requestJson(request) {
      const config = configStore.load();
      return collectJsonResponseWithConfig(app, config, request);
    },

    async listJsonFailureSamples() {
      const samples = readJsonFailureSamples(app);
      return { success: true, samples, filePath: getJsonFailureSamplesPath(app) };
    },

    async listJsonReplayLogs() {
      return listJsonReplayLogs(app);
    },

    async saveJsonFailureSample(sample) {
      return saveJsonFailureSample(app, sample);
    },

    async savePromptDebugRecord(record) {
      return savePromptDebugRecord(app, record);
    },

    async clearJsonFailureSamples() {
      const filePath = getJsonFailureSamplesPath(app);
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      return { success: true, message: 'JSON 失败样本已清空', samples: [], filePath };
    },

    async collectJsonResponse(request) {
      const config = configStore.load();
      return collectJsonResponseWithConfig(app, config, request);
    },

    async parseJsonResponseContent(request, content) {
      const config = configStore.load();
      return parseOrRepairJsonResponseWithConfig(app, config, request, content);
    },

    async testImageModel(config) {
      const currentConfig = configStore.load();
      const trackedConfig = {
        ...config,
        analytics_client_id: config.analytics_client_id || currentConfig.analytics_client_id,
        analytics_created_at: config.analytics_created_at || currentConfig.analytics_created_at,
      };

      if (
        trackedConfig.image_model?.provider === 'jinlong'
        || trackedConfig.image_model?.provider === 'volcengine'
        || trackedConfig.image_model?.provider === 'codex-gpt-image'
        || trackedConfig.image_model?.provider === 'custom'
      ) {
        return testOpenAICompatibleImageModel(app, trackedConfig, trackedConfig.image_model.provider);
      }

      if (trackedConfig.image_model?.provider === 'google-ai-studio') {
        return testGoogleImageModel(app, trackedConfig);
      }

      throw new Error('当前服务商暂不支持测试');
    },

    getImageModelAvailability() {
      return getImageModelAvailability(configStore.load());
    },

    isDeveloperMode() {
      return Boolean(configStore.load()?.developer_mode);
    },

    createTechnicalPlanDeveloperLogger(request) {
      const config = configStore.load();
      return createModuleDeveloperLogger(app, config, 'technical-plan', request);
    },

    createDeveloperLogger(moduleName, request) {
      const config = configStore.load();
      return createModuleDeveloperLogger(app, config, moduleName, request);
    },

    async generateImage(request) {
      const config = configStore.load();
      return generateImageWithConfig(app, config, request);
    },

    async listModels(configOverride) {
      const config = configOverride || configStore.load();

      if (isCodexCliTextProvider(config)) {
        return {
          success: true,
          message: '已加载本机 Codex CLI 常用模型；实际可用性以测试结果为准',
          models: CODEX_CLI_MODELS,
        };
      }

      if (!isLocalHttpTextProvider(config) && !config.api_key) {
        return { success: false, message: '请先填写文本模型 API Key', models: [] };
      }

      if (!trimBaseUrl(config.base_url)) {
        return { success: false, message: '请先填写文本模型 Base URL', models: [] };
      }

      if (isOllamaTextProvider(config)) {
        const response = await fetch(resolveOllamaTagsUrl(config.base_url), {
          method: 'GET',
        });

        await ensureOk(response, '获取 Ollama 模型列表失败');
        const data = await response.json();
        const models = Array.isArray(data.models)
          ? data.models.map((item) => item.name || item.model).filter(Boolean)
          : [];

        return {
          success: true,
          message: 'Ollama 模型列表已更新',
          models,
        };
      }

      const response = await fetch(`${trimBaseUrl(config.base_url)}/models`, {
        method: 'GET',
        headers: createHeaders(config.api_key),
      });

      await ensureOk(response, '获取模型列表失败');
      const data = await response.json();

      return {
        success: true,
        message: '模型列表已更新',
        models: Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [],
      };
    },
  };
}

module.exports = {
  createAiService,
  __test__: {
    resolveCodexCliCommand,
    summarizeCodexCliFailure,
  },
};
