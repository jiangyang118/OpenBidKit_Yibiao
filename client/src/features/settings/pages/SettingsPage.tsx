import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { trackConfigUsage } from '../../../shared/analytics/analytics';
import { FloatingToolbar, InputWithAction, useToast } from '../../../shared/ui';
import { showUpdateReadyToast } from '../../../shared/updateToast';
import type { FloatingToolbarGroup } from '../../../shared/ui';
import type { AgentSelfCheckResult, AiRequestMode, AppTheme, ClientConfig, DisplayLanguage, FileParserProvider, ImageModelConfig, ImageModelProfiles, ImageModelProvider, ImageModelSize, ImageModelStatus, ProjectWorkspaceListResult, ProjectWorkspaceSummary, SidebarLayout, TextModelConfig, TextModelProfiles, TextModelProvider, UpdateChannel } from '../../../shared/types';
import type { SettingsPageState } from '../types';

type SettingsTab = 'general' | 'text-model' | 'image-model' | 'file-parser' | 'agent' | 'about';
type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error' | 'disabled';
type AgentSelfCheckUiStatus = 'untested' | 'checking' | 'normal' | 'busy' | 'error';

type ProjectWorkspaceDialog =
  | { kind: 'switch'; project: ProjectWorkspaceSummary }
  | { kind: 'delete'; project: ProjectWorkspaceSummary }
  | null;

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: '通用' },
  { id: 'text-model', label: '文本模型' },
  { id: 'image-model', label: '生图模型' },
  { id: 'file-parser', label: '文件解析' },
  { id: 'agent', label: '智能体配置' },
  { id: 'about', label: '关于' },
];

const agentSelfCheckStatusMeta: Record<AgentSelfCheckUiStatus, { label: string; description: string }> = {
  untested: { label: '未检测', description: '点击自检后，会验证 OpenCode Server、AI proxy、当前文本模型和智能体输出链路。' },
  checking: { label: '检测中', description: '正在清理上一轮自检日志，并执行极简智能体任务。' },
  normal: { label: '正常', description: '智能体链路已通过自检，可以用于目录修复等 Agent 能力。' },
  busy: { label: '忙碌', description: 'Agent 正在处理其他任务，本次自检已跳过；这不是 OpenCode 故障。' },
  error: { label: '异常', description: '智能体链路自检失败，请查看下方错误详情。' },
};

const updateChannelOptions: Array<{ value: UpdateChannel; label: string; description: string }> = [
  { value: 'github', label: 'GitHub', description: '使用 GitHub Release 检查和下载更新' },
  { value: 'cloudflare', label: 'Cloudflare', description: '使用 Cloudflare R2 镜像检查和下载更新' },
];

const languageOptions: Array<{ value: DisplayLanguage; label: string; description: string }> = [
  { value: 'zh-CN', label: '简体中文', description: '当前版本固定为简体中文，后续增加多语言时会在这里切换。' },
];

const themeOptions: Array<{ value: AppTheme; label: string; description: string }> = [
  { value: 'system', label: '跟随系统', description: '根据系统浅色/深色模式自动切换' },
  { value: 'light', label: '浅色', description: '始终使用浅色界面' },
  { value: 'dark', label: '深色', description: '始终使用深色界面' },
];

const sidebarLayoutOptions: Array<{ value: SidebarLayout; label: string; description: string }> = [
  { value: 'classic', label: '经典布局', description: '显示完整菜单名称和说明，适合日常操作' },
  { value: 'compact', label: '紧凑布局', description: '默认收起侧边栏，只保留图标，适合小屏或专注编辑' },
];

function normalizeUpdateChannel(value?: string): UpdateChannel {
  return value === 'cloudflare' ? 'cloudflare' : 'github';
}

function normalizeLanguage(value?: string): DisplayLanguage {
  return value === 'zh-CN' ? 'zh-CN' : 'zh-CN';
}

function normalizeTheme(value?: string): AppTheme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function normalizeSidebarLayout(value?: string): SidebarLayout {
  return value === 'compact' ? 'compact' : 'classic';
}

const textModelProviders: Array<{ value: TextModelProvider; label: string }> = [
  { value: 'jinlong', label: '金龙中转站【推荐】' },
  { value: 'volcengine', label: '火山方舟' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'longcat', label: '龙猫' },
  { value: 'agnes', label: 'Agnes AI' },
  { value: 'codex-cli', label: '本机 Codex CLI' },
  { value: 'local-gemma', label: '本地 Gemma（Ollama）' },
  { value: 'local-qwen', label: '本地千问/Qwen（Ollama）' },
  { value: 'lm-studio', label: '本地 LM Studio' },
  { value: 'vllm', label: '本地 vLLM' },
  { value: 'llama-cpp', label: '本地 llama.cpp' },
  { value: 'jan', label: '本地 Jan' },
  { value: 'custom', label: '自定义' },
];

const aiRequestModeOptions: Array<{ value: AiRequestMode; label: string }> = [
  { value: 'normal', label: '普通请求' },
  { value: 'stream', label: '流式请求' },
];

const DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT = 400000;
const DEFAULT_TEXT_CONCURRENCY_LIMIT = 10;

const textProviderDefaults: Record<TextModelProvider, Omit<TextModelConfig, 'context_length_limit' | 'concurrency_limit'>> = {
  jinlong: { api_key: '', base_url: 'https://jlaudeapi.com/v1', model_name: 'gpt-3.5-turbo', request_mode: 'stream' },
  volcengine: { api_key: '', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model_name: '', request_mode: 'stream' },
  deepseek: { api_key: '', base_url: 'https://api.deepseek.com', model_name: '', request_mode: 'stream' },
  longcat: { api_key: '', base_url: 'https://api.longcat.chat/openai/v1', model_name: '', request_mode: 'stream' },
  agnes: { api_key: '', base_url: 'https://apihub.agnes-ai.com/v1', model_name: '', request_mode: 'stream' },
  'codex-cli': { api_key: '', base_url: 'local-codex-cli', model_name: 'gpt-5.5', request_mode: 'normal' },
  'local-gemma': { api_key: '', base_url: 'http://127.0.0.1:11434/v1', model_name: 'gemma4:31b', request_mode: 'normal' },
  'local-qwen': { api_key: '', base_url: 'http://127.0.0.1:11434/v1', model_name: 'qwen3.6:27b', request_mode: 'normal' },
  'lm-studio': { api_key: '', base_url: 'http://127.0.0.1:1234/v1', model_name: '', request_mode: 'normal' },
  vllm: { api_key: '', base_url: 'http://127.0.0.1:8000/v1', model_name: '', request_mode: 'normal' },
  'llama-cpp': { api_key: '', base_url: 'http://127.0.0.1:8080/v1', model_name: '', request_mode: 'normal' },
  jan: { api_key: '', base_url: 'http://127.0.0.1:1337/v1', model_name: '', request_mode: 'normal' },
  custom: { api_key: '', base_url: '', model_name: '', request_mode: 'stream' },
};

const textProviderApiKeyUrls: Partial<Record<TextModelProvider, string>> = {
  jinlong: 'https://s.markup.com.cn/jl',
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  longcat: 'https://longcat.chat/platform/api_keys',
  agnes: 'https://platform.agnes-ai.com/settings/apiKeys',
};

function createDefaultTextModelProfiles(): TextModelProfiles {
  return textModelProviders.reduce((profiles, provider) => ({
    ...profiles,
    [provider.value]: normalizeTextModelProfile(provider.value, textProviderDefaults[provider.value]),
  }), {} as TextModelProfiles);
}

function normalizeAiRequestMode(value?: AiRequestMode): AiRequestMode {
  return value === 'normal' ? 'normal' : 'stream';
}

function normalizeTextContextLengthLimit(value?: number | string): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : DEFAULT_TEXT_CONTEXT_LENGTH_LIMIT;
}

function normalizeTextConcurrencyLimit(value?: number | string): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : DEFAULT_TEXT_CONCURRENCY_LIMIT;
}

function parseTextContextLengthInput(value: string): number | '' {
  if (value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : '';
}

function parseTextConcurrencyLimitInput(value: string): number | '' {
  if (value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.round(number)) : '';
}

function normalizeTextModelProfile(provider: TextModelProvider, profile?: Partial<TextModelConfig>): TextModelConfig {
  const defaults = textProviderDefaults[provider];
  const baseUrl = provider === 'custom' ? profile?.base_url ?? defaults.base_url : defaults.base_url;
  const requestMode = isApiKeylessTextProvider(provider)
    ? 'normal'
    : normalizeAiRequestMode(profile?.request_mode ?? defaults.request_mode);
  return {
    api_key: profile?.api_key ?? defaults.api_key,
    base_url: baseUrl,
    model_name: profile?.model_name ?? defaults.model_name,
    context_length_limit: normalizeTextContextLengthLimit(profile?.context_length_limit),
    concurrency_limit: normalizeTextConcurrencyLimit(profile?.concurrency_limit),
    request_mode: requestMode,
  };
}

function normalizeTextModelProfiles(profiles?: Partial<TextModelProfiles>): TextModelProfiles {
  return textModelProviders.reduce((nextProfiles, provider) => ({
    ...nextProfiles,
    [provider.value]: normalizeTextModelProfile(provider.value, profiles?.[provider.value]),
  }), {} as TextModelProfiles);
}

function textProfileFromState(textModel: SettingsPageState['textModel']): TextModelConfig {
  return {
    api_key: textModel.api_key,
    base_url: textModel.provider === 'custom' ? textModel.base_url : textProviderDefaults[textModel.provider].base_url,
    model_name: textModel.model_name,
    context_length_limit: normalizeTextContextLengthLimit(textModel.context_length_limit),
    concurrency_limit: normalizeTextConcurrencyLimit(textModel.concurrency_limit),
    request_mode: textModel.request_mode,
  };
}

function isCodexCliTextProvider(provider: TextModelProvider) {
  return provider === 'codex-cli';
}

function isLocalHttpTextProvider(provider: TextModelProvider) {
  return provider === 'local-gemma'
    || provider === 'local-qwen'
    || provider === 'lm-studio'
    || provider === 'vllm'
    || provider === 'llama-cpp'
    || provider === 'jan';
}

function isOllamaTextProvider(provider: TextModelProvider) {
  return provider === 'local-gemma' || provider === 'local-qwen';
}

function isApiKeylessTextProvider(provider: TextModelProvider) {
  return isCodexCliTextProvider(provider) || isLocalHttpTextProvider(provider);
}

function getTextBaseUrlDescription(provider: TextModelProvider) {
  if (isCodexCliTextProvider(provider)) return '本机 Codex CLI 桥接模式，不使用 HTTP Base URL';
  if (isOllamaTextProvider(provider)) return '本地 Ollama OpenAI 兼容接口地址，拉取模型时会读取 127.0.0.1:11434/api/tags';
  if (provider === 'lm-studio') return '本地 LM Studio OpenAI 兼容接口地址，默认使用 127.0.0.1:1234';
  if (provider === 'vllm') return '本地 vLLM OpenAI 兼容接口地址，默认使用 127.0.0.1:8000';
  if (provider === 'llama-cpp') return '本地 llama.cpp server OpenAI 兼容接口地址，默认使用 127.0.0.1:8080';
  if (provider === 'jan') return '本地 Jan Server OpenAI 兼容接口地址，默认使用 127.0.0.1:1337';
  return 'OpenAI Like 接口地址，用于文本生成和分析任务';
}

function getTextApiKeyDescription(provider: TextModelProvider) {
  if (isCodexCliTextProvider(provider)) return '使用本机 Codex 登录状态，不在本应用中保存 API Key';
  if (isOllamaTextProvider(provider)) return '本地 Ollama 默认不需要 API Key';
  if (provider === 'lm-studio') return '本地 LM Studio 默认不需要 API Key';
  if (provider === 'vllm') return '本地 vLLM 默认不需要 API Key';
  if (provider === 'llama-cpp') return '本地 llama.cpp server 默认不需要 API Key';
  if (provider === 'jan') return '本地 Jan Server 默认不需要 API Key';
  return '仅保存在本机配置文件中，不暴露给 Renderer 以外的原始能力';
}

function getTextModelDescription(provider: TextModelProvider) {
  if (isCodexCliTextProvider(provider)) return '填写 Codex CLI 支持的模型名称，例如 gpt-5.5';
  if (provider === 'local-gemma') return '填写本地已安装的 Gemma 模型名称，例如 gemma4:31b';
  if (provider === 'local-qwen') return '填写本地已安装的千问/Qwen 模型名称，例如 qwen3.6:27b';
  if (provider === 'lm-studio') return '从 LM Studio Local Server 拉取，或手动填写已加载模型名称';
  if (provider === 'vllm') return '从 vLLM OpenAI 兼容服务拉取，或手动填写已部署模型名称';
  if (provider === 'llama-cpp') return '从 llama.cpp server 拉取，或手动填写已加载模型名称';
  if (provider === 'jan') return '从 Jan Server 拉取，或手动填写已加载模型名称';
  return '可手动录入，也可从当前 Base URL 拉取可用模型';
}

function getTextModelPlaceholder(provider: TextModelProvider) {
  if (isCodexCliTextProvider(provider)) return '例如 gpt-5.5';
  if (provider === 'local-gemma') return '例如 gemma4:31b';
  if (provider === 'local-qwen') return '例如 qwen3.6:27b';
  if (provider === 'lm-studio') return '例如 qwen3-30b-a3b-instruct-mlx';
  if (provider === 'vllm') return '例如 Qwen/Qwen3-32B';
  if (provider === 'llama-cpp') return '例如 qwen3-8b-q4_k_m.gguf';
  if (provider === 'jan') return '例如 qwen3-30b-a3b';
  if (provider === 'deepseek') return '例如 deepseek-chat';
  return '请输入文本模型名称';
}

function getLocalModelSizeScore(model: string) {
  const match = /(\d+(?:\.\d+)?)b/i.exec(model);
  return match ? Number(match[1]) : 0;
}

function getLocalTextModelScore(provider: TextModelProvider, model: string) {
  const normalized = model.toLowerCase();
  let score = getLocalModelSizeScore(normalized);

  if (provider === 'local-gemma') {
    if (normalized.includes('gemma4')) score += 1000;
    if (normalized.includes('gemma3')) score += 500;
  }

  if (provider === 'local-qwen') {
    if (normalized.includes('qwen3.6')) score += 1000;
    if (normalized.includes('qwen3')) score += 700;
    if (normalized.includes('qwen2.5')) score += 500;
    if (normalized.includes('vl')) score -= 200;
    if (normalized.includes('coder')) score -= 150;
  }

  return score;
}

function filterTextModelsForProvider(provider: TextModelProvider, models: string[]) {
  if (provider === 'local-gemma') {
    const gemmaModels = models.filter((model) => /gemma/i.test(model));
    const filteredModels = gemmaModels.length > 0 ? gemmaModels : models;
    return [...filteredModels].sort((a, b) => getLocalTextModelScore(provider, b) - getLocalTextModelScore(provider, a));
  }

  if (provider === 'local-qwen') {
    const qwenModels = models.filter((model) => /(qwen|qwq)/i.test(model));
    const filteredModels = qwenModels.length > 0 ? qwenModels : models;
    return [...filteredModels].sort((a, b) => getLocalTextModelScore(provider, b) - getLocalTextModelScore(provider, a));
  }

  return models;
}

const imageProviders: Array<{ value: ImageModelProvider; label: string }> = [
  { value: 'jinlong', label: '金龙中转站【推荐】' },
  { value: 'volcengine', label: '火山方舟' },
  { value: 'google-ai-studio', label: 'Google AI Studio' },
  { value: 'agnes', label: 'Agnes AI' },
  { value: 'custom', label: '自定义 OpenAI-like' },
];

const DEFAULT_IMAGE_CONCURRENCY_LIMIT = 2;

const openAICompatibleImageSizeOptions: Array<{ value: ImageModelSize; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1024×1024（1K 方图）' },
  { value: '1536x1024', label: '1536×1024（1K 横图）' },
  { value: '1024x1536', label: '1024×1536（1K 竖图）' },
  { value: '2048x2048', label: '2048×2048（2K 方图）' },
  { value: '2048x1152', label: '2048×1152（2K 横图）' },
  { value: '3840x2160', label: '3840×2160（4K 横图）' },
  { value: '2160x3840', label: '2160×3840（4K 竖图）' },
];

const googleImageSizeOptions: Array<{ value: ImageModelSize; label: string }> = [
  { value: '512', label: '512' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

function getImageSizeOptions(provider: ImageModelProvider) {
  return provider === 'google-ai-studio' ? googleImageSizeOptions : openAICompatibleImageSizeOptions;
}

function normalizeImageSize(provider: ImageModelProvider, value?: string): ImageModelSize {
  const options = getImageSizeOptions(provider);
  const candidate = String(value || '').trim() as ImageModelSize;
  return options.some((option) => option.value === candidate)
    ? candidate
    : provider === 'google-ai-studio' ? '1K' : '1024x1024';
}

const imageProviderDefaults: ImageModelProfiles = {
  jinlong: {
    provider: 'jinlong',
    base_url: 'https://img-api.jlaudeapi.com/v1',
    api_key: '',
    model_name: '',
    image_size: '1024x1024',
    request_mode: 'stream',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  volcengine: {
    provider: 'volcengine',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    api_key: '',
    model_name: '',
    image_size: '1024x1024',
    request_mode: 'stream',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'google-ai-studio': {
    provider: 'google-ai-studio',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    api_key: '',
    model_name: 'gemini-3.1-flash-image-preview',
    image_size: '1K',
    request_mode: 'stream',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  agnes: {
    provider: 'agnes',
    base_url: 'https://apihub.agnes-ai.com/v1',
    api_key: '',
    model_name: '',
    image_size: '1024x1024',
    request_mode: 'stream',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  custom: {
    provider: 'custom',
    base_url: '',
    api_key: '',
    model_name: '',
    image_size: '1024x1024',
    request_mode: 'stream',
    concurrency_limit: DEFAULT_IMAGE_CONCURRENCY_LIMIT,
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
};

const imageProviderApiKeyUrls: Record<ImageModelProvider, string> = {
  jinlong: 'https://s.markup.com.cn/jl',
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  'google-ai-studio': 'https://aistudio.google.com/api-keys',
  agnes: 'https://platform.agnes-ai.com/settings/apiKeys',
  custom: '',
};

const imageProviderLabels: Record<ImageModelProvider, string> = {
  jinlong: '金龙中转站',
  volcengine: '火山方舟',
  'google-ai-studio': 'Google AI Studio',
  agnes: 'Agnes AI',
  custom: '自定义生图服务',
};

function getImageBaseUrlDescription(provider: ImageModelProvider) {
  if (provider === 'jinlong') return '金龙中转站 OpenAI 兼容接口地址';
  if (provider === 'volcengine') return '火山方舟 OpenAI 兼容接口地址';
  if (provider === 'agnes') return 'Agnes AI OpenAI 兼容接口地址';
  if (provider === 'custom') return '填写兼容 OpenAI /images/generations 的接口地址';
  return 'Google Gemini API REST 地址';
}

function getImageApiKeyDescription(provider: ImageModelProvider) {
  if (provider === 'jinlong') return '用于调用金龙中转站图片生成 API';
  if (provider === 'volcengine') return '用于调用火山方舟图片生成 API';
  if (provider === 'agnes') return '用于调用 Agnes AI 图片生成 API';
  if (provider === 'custom') return '用于调用自定义 OpenAI-like 生图接口';
  return '用于调用 Google AI Studio Gemini API';
}

function getImageModelDescription(provider: ImageModelProvider) {
  if (provider === 'jinlong') return '填写金龙中转站已开通的生图模型名称';
  if (provider === 'volcengine') return '填写火山方舟控制台中已开通的模型或推理接入点 ID';
  if (provider === 'agnes') return '填写 Agnes AI 已开通的生图模型名称';
  if (provider === 'custom') return '填写自定义接口支持的生图模型名称';
  return '选择或填写支持图片生成的 Gemini 模型';
}

function getImageModelPlaceholder(provider: ImageModelProvider) {
  if (provider === 'jinlong') return '请输入已开通的生图模型名称';
  if (provider === 'volcengine') return '请输入已开通的模型或推理接入点 ID';
  if (provider === 'agnes') return '请输入 Agnes AI 生图模型名称';
  if (provider === 'custom') return '请输入 OpenAI-like 生图模型名称';
  return 'gemini-3.1-flash-image-preview';
}

function createDefaultImageModelProfiles(): ImageModelProfiles {
  return imageProviders.reduce((profiles, provider) => ({
    ...profiles,
    [provider.value]: { ...imageProviderDefaults[provider.value] },
  }), {} as ImageModelProfiles);
}

function normalizeImageModelProfile(provider: ImageModelProvider, profile?: Partial<ImageModelConfig>): ImageModelConfig {
  const defaults = imageProviderDefaults[provider];
  return {
    provider,
    base_url: provider === 'custom' ? profile?.base_url ?? defaults.base_url : defaults.base_url,
    api_key: profile?.api_key ?? defaults.api_key,
    model_name: profile?.model_name ?? defaults.model_name,
    image_size: normalizeImageSize(provider, profile?.image_size ?? defaults.image_size),
    request_mode: normalizeAiRequestMode(profile?.request_mode ?? defaults.request_mode),
    concurrency_limit: normalizeImageConcurrencyLimit(profile?.concurrency_limit ?? defaults.concurrency_limit),
    status: profile?.status ?? defaults.status,
    tested_at: profile?.tested_at ?? defaults.tested_at,
    last_error: profile?.last_error ?? defaults.last_error,
  };
}

function normalizeImageConcurrencyLimit(value?: number | string): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : DEFAULT_IMAGE_CONCURRENCY_LIMIT;
}

function parseImageConcurrencyLimitInput(value: string): number | '' {
  if (value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.round(number)) : '';
}

function normalizeImageModelProfiles(profiles?: Partial<ImageModelProfiles>): ImageModelProfiles {
  return imageProviders.reduce((nextProfiles, provider) => ({
    ...nextProfiles,
    [provider.value]: normalizeImageModelProfile(provider.value, profiles?.[provider.value]),
  }), {} as ImageModelProfiles);
}

function imageProfileFromState(imageModel: SettingsPageState['imageModel']): ImageModelConfig {
  return {
    provider: imageModel.provider,
    base_url: imageModel.provider === 'custom' ? imageModel.base_url || '' : imageProviderDefaults[imageModel.provider].base_url,
    api_key: imageModel.api_key,
    model_name: imageModel.model_name,
    image_size: normalizeImageSize(imageModel.provider, imageModel.image_size),
    request_mode: imageModel.request_mode,
    concurrency_limit: normalizeImageConcurrencyLimit(imageModel.concurrency_limit),
    status: imageModel.status || 'untested',
    tested_at: imageModel.tested_at || '',
    last_error: imageModel.last_error || '',
  };
}

const imageStatusMeta: Record<ImageModelStatus, { label: string; description: string }> = {
  untested: {
    label: '未测试',
    description: '请点击测试确认当前生图模型可用，正文生成时只有可用状态才会自动配图。',
  },
  available: {
    label: '可用',
    description: '当前生图模型已通过测试，正文生成时会按内容需要自动配图。',
  },
  unavailable: {
    label: '不可用',
    description: '当前生图模型测试失败，正文生成会跳过配图。',
  },
};

function resetImageModelStatus(imageModel: SettingsPageState['imageModel']): SettingsPageState['imageModel'] {
  return {
    ...imageModel,
    status: 'untested',
    tested_at: '',
    last_error: '',
  };
}

function formatImageTestTime(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatProjectTime(value?: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getActiveProject(projectState: ProjectWorkspaceListResult | null) {
  return projectState?.projects.find((project) => project.is_active) || null;
}

function getActiveTaskCount(tasks: unknown) {
  if (!Array.isArray(tasks)) return 0;
  return tasks.length;
}

const fileParserProviders: Array<{ value: FileParserProvider; label: string }> = [
  { value: 'local', label: '本地解析' },
  { value: 'mineru-accurate-api', label: 'MinerU-精准解析 API' },
  { value: 'mineru-agent-api', label: 'MinerU-Agent 轻量解析 API' },
];

const parserOptions = [
  {
    title: '本地解析',
    badge: '推荐默认',
    tone: 'primary',
    summary: '覆盖大多数 Word 和带文字层 PDF，速度快、无调用限制。',
    items: [
      ['Token', '无需'],
      ['解析速度', '快'],
      ['支持格式', 'pdf、jpeg、png、docx、doc、wps、ofd'],
      ['大小/页数', '无限制'],
      ['解析质量', '高'],
      ['扫描件', '不支持'],
    ],
  },
  {
    title: 'MinerU 精准解析 API',
    badge: '扫描件兜底',
    tone: 'accent',
    summary: '解析质量高，适合本地解析失败或扫描件质量要求高的文档。',
    items: [
      ['Token', '需要'],
      ['解析速度', '慢'],
      ['支持格式', 'pdf、jpeg、png、docx'],
      ['大小/页数', '≤ 200MB / ≤ 200 页'],
      ['解析质量', '高'],
      ['扫描件', '支持'],
    ],
  },
  {
    title: 'MinerU-Agent 轻量解析 API',
    badge: '轻量备用',
    tone: 'muted',
    summary: '无需 Token 但存在 IP 限频，适合轻量文档的备用解析。',
    items: [
      ['Token', '无需（IP 限频）'],
      ['解析速度', '中等'],
      ['支持格式', 'pdf、jpeg、png、docx'],
      ['大小/页数', '≤ 10MB / ≤ 20 页'],
      ['解析质量', '中'],
      ['扫描件', '质量差'],
    ],
  },
];

const initialState: SettingsPageState = {
  textModel: {
    provider: 'jinlong',
    ...normalizeTextModelProfile('jinlong', textProviderDefaults.jinlong),
  },
  textModelProfiles: createDefaultTextModelProfiles(),
  imageModel: {
    ...imageProviderDefaults.jinlong,
  },
  imageModelProfiles: createDefaultImageModelProfiles(),
  fileParser: {
    provider: 'local',
    mineru_token: '',
  },
  general: {
    language: 'zh-CN',
    theme: 'system',
    sidebar_layout: 'classic',
    developer_mode: false,
    developer_token_stats_auto_open: false,
    update_channel: 'github',
    gpu_hardware_acceleration_enabled: true,
    gpu_hardware_acceleration_configured: true,
  },
};

interface SettingsPageProps {
  onDeveloperModeChange?: (developerMode: boolean) => void;
  onAppearanceChange?: (appearance: { theme: AppTheme; sidebarLayout: SidebarLayout }) => void;
}

function SettingsPage({ onDeveloperModeChange, onAppearanceChange }: SettingsPageProps) {
  const [state, setState] = useState<SettingsPageState>(initialState);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [savedConfig, setSavedConfig] = useState<ClientConfig | null>(null);
  const [textModels, setTextModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState<'text' | 'image' | null>(null);
  const [testingTextModel, setTestingTextModel] = useState(false);
  const [testingImageModel, setTestingImageModel] = useState(false);
  const [imageTestPreview, setImageTestPreview] = useState<{ src: string; title: string } | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updatePercent, setUpdatePercent] = useState(0);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [projectState, setProjectState] = useState<ProjectWorkspaceListResult | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectExportDir, setProjectExportDir] = useState('');
  const [projectImportDir, setProjectImportDir] = useState('');
  const [projectDialog, setProjectDialog] = useState<ProjectWorkspaceDialog>(null);
  const [agentSelfCheckStatus, setAgentSelfCheckStatus] = useState<AgentSelfCheckUiStatus>('untested');
  const [agentSelfCheckResult, setAgentSelfCheckResult] = useState<AgentSelfCheckResult | null>(null);
  const [exportingAgentSelfCheckReport, setExportingAgentSelfCheckReport] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    void loadTextConfig();
    void loadProjectState();
    void window.yibiao?.getVersion().then(setAppVersion);

    const unsubs: Array<() => void> = [];
    unsubs.push(
      window.yibiao?.onUpdateProgress(({ percent }) => {
        setUpdateStatus('downloading');
        setUpdatePercent(Math.round(percent));
      }) ?? (() => {})
    );
    unsubs.push(
      window.yibiao?.onUpdateDownloaded(({ version }) => {
        if (version) {
          setUpdateVersion(version);
        }
        setUpdateStatus('downloaded');
      }) ?? (() => {})
    );
    unsubs.push(
      window.yibiao?.onUpdateError(({ message }) => {
        setUpdateStatus('error');
        setUpdateError(message);
      }) ?? (() => {})
    );

    return () => { unsubs.forEach((unsub) => unsub()); };
  }, []);

  const loadTextConfig = async () => {
    try {
      const config = await window.yibiao?.config.load();
      if (!config) {
        return;
      }

      const textModelProfiles = normalizeTextModelProfiles(config.text_model_profiles);
      const activeTextProfile = normalizeTextModelProfile(config.text_model_provider, textModelProfiles[config.text_model_provider]);
      const imageModelProfiles = normalizeImageModelProfiles(config.image_model_profiles);
      const activeImageProfile = normalizeImageModelProfile(config.image_model.provider, config.image_model);
      imageModelProfiles[activeImageProfile.provider] = activeImageProfile;

      setState((prev) => ({
        ...prev,
        textModel: {
          provider: config.text_model_provider,
          ...activeTextProfile,
        },
        textModelProfiles,
        imageModel: activeImageProfile,
        imageModelProfiles,
        fileParser: {
          provider: config.file_parser.provider,
          mineru_token: config.file_parser.mineru_token || '',
        },
        general: {
          language: normalizeLanguage(config.language),
          theme: normalizeTheme(config.theme),
          sidebar_layout: normalizeSidebarLayout(config.sidebar_layout),
          developer_mode: Boolean(config.developer_mode),
          developer_token_stats_auto_open: Boolean(config.developer_token_stats_auto_open),
          update_channel: normalizeUpdateChannel(config.update_channel),
          gpu_hardware_acceleration_enabled: Boolean(config.gpu_hardware_acceleration_enabled),
          gpu_hardware_acceleration_configured: Boolean(config.gpu_hardware_acceleration_configured),
        },
      }));
      setSavedConfig(config);
      onDeveloperModeChange?.(Boolean(config.developer_mode));
      onAppearanceChange?.({
        theme: normalizeTheme(config.theme),
        sidebarLayout: normalizeSidebarLayout(config.sidebar_layout),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载客户端配置失败';
      showToast(errorMessage, 'error');
    }
  };

  const loadProjectState = async () => {
    try {
      setProjectLoading(true);
      const stateResult = await window.yibiao?.projectWorkspace?.list();
      if (stateResult) {
        setProjectState(stateResult);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载项目工作区失败', 'error');
    } finally {
      setProjectLoading(false);
    }
  };

  const assertNoActiveProjectTasks = async () => {
    const activeTasks = await window.yibiao?.tasks?.getActiveTasks?.();
    const activeTaskCount = getActiveTaskCount(activeTasks);
    if (activeTaskCount > 0) {
      throw new Error(`当前还有 ${activeTaskCount} 个后台任务运行中，请等待任务完成后再切换或删除项目。`);
    }
  };

  const getCurrentTextModelProfiles = (): TextModelProfiles => ({
    ...state.textModelProfiles,
    [state.textModel.provider]: textProfileFromState(state.textModel),
  });

  const getCurrentImageModelProfiles = (): ImageModelProfiles => ({
    ...state.imageModelProfiles,
    [state.imageModel.provider]: imageProfileFromState(state.imageModel),
  });

  const createClientConfig = (): ClientConfig => {
    const textModelProfiles = getCurrentTextModelProfiles();
    const activeTextProfile = textModelProfiles[state.textModel.provider];
    const imageModelProfiles = getCurrentImageModelProfiles();
    const activeImageProfile = imageModelProfiles[state.imageModel.provider];

    return {
      text_model_provider: state.textModel.provider,
      text_model_profiles: textModelProfiles,
      api_key: activeTextProfile.api_key,
      base_url: activeTextProfile.base_url,
      model_name: activeTextProfile.model_name,
      context_length_limit: activeTextProfile.context_length_limit,
      concurrency_limit: activeTextProfile.concurrency_limit,
      request_mode: activeTextProfile.request_mode,
      image_model: activeImageProfile,
      image_model_profiles: imageModelProfiles,
      file_parser: {
        provider: state.fileParser.provider,
        mineru_token: state.fileParser.mineru_token || '',
      },
      language: state.general.language,
      theme: state.general.theme,
      sidebar_layout: state.general.sidebar_layout,
      update_channel: state.general.update_channel,
      gpu_hardware_acceleration_enabled: state.general.gpu_hardware_acceleration_enabled,
      gpu_hardware_acceleration_configured: state.general.gpu_hardware_acceleration_configured,
      developer_mode: state.general.developer_mode,
      developer_token_stats_auto_open: state.general.developer_token_stats_auto_open,
    };
  };

  const checkForUpdates = async () => {
    if (updateStatus === 'checking' || updateStatus === 'downloading') {
      return;
    }

    try {
      setUpdateStatus('checking');
      setUpdatePercent(0);
      setUpdateError('');
      const result = await window.yibiao?.checkUpdate();
      if (!result?.enabled) {
        setUpdateStatus('disabled');
        showToast('开发调试模式不执行自动更新', 'info');
        return;
      }
      if (result.failed) {
        const message = result.message || '检查更新失败';
        setUpdateStatus('error');
        setUpdateError(message);
        showToast(message, 'error');
        return;
      }
      if (!result.updateAvailable) {
        setUpdateStatus('idle');
        showToast('已是最新版本', 'success');
        return;
      }

      const version = result.version || updateVersion;
      setUpdateVersion(version);
      if (result.downloaded) {
        setUpdateStatus('downloaded');
        showUpdateReadyToast(showToast, version);
        return;
      }

      setUpdateStatus('idle');
      showToast('发现新版本，但更新包尚未下载完成，请稍后重试', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败';
      setUpdateStatus('error');
      setUpdateError(message);
      showToast(message, 'error');
    }
  };

  const installDownloadedUpdate = async () => {
    try {
      const result = await window.yibiao?.quitAndInstall();
      if (result && !result.success) {
        showToast(result.message || '安装更新失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '安装更新失败';
      showToast(message, 'error');
    }
  };

  const updateImageModelConfig = (partial: Partial<Omit<SettingsPageState['imageModel'], 'provider'>>, options: { clearModels?: boolean } = {}) => {
    if (options.clearModels) {
      setImageModels([]);
    }

    setState((prev) => ({
      ...prev,
      ...(() => {
        const imageModel = resetImageModelStatus({ ...prev.imageModel, ...partial });
        return {
          imageModel,
          imageModelProfiles: {
            ...prev.imageModelProfiles,
            [prev.imageModel.provider]: imageProfileFromState(imageModel),
          },
        };
      })(),
    }));
  };

  const updateImageModelProvider = (provider: ImageModelProvider) => {
    setImageModels([]);
    setImageTestPreview(null);
    setState((prev) => ({
      ...prev,
      imageModelProfiles: {
        ...prev.imageModelProfiles,
        [prev.imageModel.provider]: imageProfileFromState(prev.imageModel),
      },
      imageModel: normalizeImageModelProfile(provider, prev.imageModelProfiles[provider]),
    }));
  };

  const saveClientConfig = async (config: ClientConfig) => {
    try {
      const result = await window.yibiao?.config.save(config);
      showToast(result?.success ? '配置已保存' : result?.message || '配置保存失败', result?.success ? 'success' : 'error');
      if (result?.success) {
        setSavedConfig(config);
        onDeveloperModeChange?.(Boolean(config.developer_mode));
        onAppearanceChange?.({
          theme: normalizeTheme(config.theme),
          sidebarLayout: normalizeSidebarLayout(config.sidebar_layout),
        });
        trackConfigUsage({}, config);
      }
      return Boolean(result?.success);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '配置保存失败';
      showToast(errorMessage, 'error');
      return false;
    }
  };

  const saveTextConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const updateDeveloperMode = (developerMode: boolean) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, developer_mode: developerMode },
    }));
    onDeveloperModeChange?.(developerMode);
  };

  const updateDeveloperTokenStatsAutoOpen = (autoOpen: boolean) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, developer_token_stats_auto_open: autoOpen },
    }));
  };

  const updateUpdateChannel = (updateChannel: UpdateChannel) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, update_channel: updateChannel },
    }));
  };

  const updateTheme = (theme: AppTheme) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, theme },
    }));
    onAppearanceChange?.({ theme, sidebarLayout: state.general.sidebar_layout });
  };

  const updateSidebarLayout = (sidebarLayout: SidebarLayout) => {
    setState((prev) => ({
      ...prev,
      general: { ...prev.general, sidebar_layout: sidebarLayout },
    }));
    onAppearanceChange?.({ theme: state.general.theme, sidebarLayout });
  };

  const updateGpuHardwareAcceleration = (enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      general: {
        ...prev.general,
        gpu_hardware_acceleration_enabled: enabled,
        gpu_hardware_acceleration_configured: true,
      },
    }));
  };

  const updateTextModelProvider = (provider: TextModelProvider) => {
    setTextModels([]);
    setState((prev) => ({
      ...prev,
      textModelProfiles: {
        ...prev.textModelProfiles,
        [prev.textModel.provider]: textProfileFromState(prev.textModel),
      },
      textModel: {
        provider,
        ...normalizeTextModelProfile(provider, prev.textModelProfiles[provider]),
      },
    }));
  };

  const updateTextModelConfig = (partial: Partial<Omit<SettingsPageState['textModel'], 'provider'>>, options: { clearModels?: boolean } = {}) => {
    if (options.clearModels) {
      setTextModels([]);
    }

    setState((prev) => ({
      ...prev,
      ...(() => {
        const textModel = { ...prev.textModel, ...partial };
        return {
          textModel,
          textModelProfiles: {
            ...prev.textModelProfiles,
            [prev.textModel.provider]: textProfileFromState(textModel),
          },
        };
      })(),
    }));
  };

  const openTextProviderApiKeyPage = async () => {
    const url = textProviderApiKeyUrls[state.textModel.provider];
    if (!url) {
      showToast('自定义服务商没有预置 API Key 获取页面', 'info');
      return;
    }

    try {
      const result = await window.yibiao?.openExternal(url);
      if (result && !result.success) {
        showToast(result.message || '打开 API Key 获取页面失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开 API Key 获取页面失败', 'error');
    }
  };

  const openImageProviderApiKeyPage = async () => {
    const url = imageProviderApiKeyUrls[state.imageModel.provider];
    if (!url) {
      showToast('自定义生图服务没有预置 API Key 获取页面', 'info');
      return;
    }

    try {
      const result = await window.yibiao?.openExternal(url);
      if (result && !result.success) {
        showToast(result.message || '打开生图服务 API Key 获取页面失败', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开生图服务 API Key 获取页面失败', 'error');
    }
  };

  const testTextConfig = async () => {
    try {
      setTestingTextModel(true);
      const config = createClientConfig();
      const result = await window.yibiao?.config.save(config);
      if (result?.success) {
        setSavedConfig(config);
      }
      const content = await window.yibiao?.ai.chat({
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0,
        timeout_ms: 30000,
        timeout_message: '文本模型测试超时，请检查 Base URL、API Key 或模型名称',
        logTitle: '文本模型测试',
      });
      const reply = (content || '').trim();
      showToast(reply ? `测试成功：${reply.slice(0, 160)}` : '测试成功', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '测试失败', 'error');
    } finally {
      setTestingTextModel(false);
    }
  };

  const runAgentSelfCheck = async () => {
    if (agentSelfCheckStatus === 'checking') return;

    try {
      setAgentSelfCheckStatus('checking');
      setAgentSelfCheckResult(null);

      const config = createClientConfig();
      const saveResult = await window.yibiao?.config.save(config);
      if (!saveResult?.success) {
        throw new Error(saveResult?.message || '保存当前文本模型配置失败，无法执行智能体自检');
      }
      setSavedConfig(config);
      onDeveloperModeChange?.(Boolean(config.developer_mode));

      const result = await window.yibiao?.agent.selfCheck();
      if (!result) {
        throw new Error('智能体自检未返回结果');
      }

      setAgentSelfCheckResult(result);
      const nextStatus = result.success ? 'normal' : result.status === 'busy' ? 'busy' : 'error';
      setAgentSelfCheckStatus(nextStatus);
      showToast(
        result.success ? '智能体自检正常' : result.message || '智能体自检失败',
        result.success ? 'success' : result.status === 'busy' ? 'info' : 'error'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '智能体自检失败';
      const failedResult: AgentSelfCheckResult = {
        success: false,
        status: 'error',
        message,
        checked_at: new Date().toISOString(),
        duration_ms: 0,
        log_dir: '',
        log_file: '',
        runtime_root: '',
        workspace_dir: '',
        output_file: '',
        output_path: '',
        opencode_binary_path: '',
        steps: [],
        error: { message },
        diagnostics: { message },
        detail_text: message,
      };
      setAgentSelfCheckResult(failedResult);
      setAgentSelfCheckStatus('error');
      showToast(message, 'error');
    }
  };

  const exportAgentSelfCheckReport = async () => {
    if (!agentSelfCheckResult || exportingAgentSelfCheckReport) return;

    try {
      setExportingAgentSelfCheckReport(true);
      const result = await window.yibiao?.agent.exportSelfCheckReport(agentSelfCheckResult);
      if (!result) {
        throw new Error('导出智能体自检报告失败');
      }
      if (result.canceled) {
        showToast(result.message || '已取消导出', 'info');
        return;
      }
      if (!result.success) {
        throw new Error(result.message || '导出智能体自检报告失败');
      }
      showToast(result.message || '智能体自检报告已导出', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出智能体自检报告失败', 'error');
    } finally {
      setExportingAgentSelfCheckReport(false);
    }
  };

  const saveImageConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const testImageConfig = async () => {
    try {
      setTestingImageModel(true);
      const config = createClientConfig();
      const result = await window.yibiao?.ai.testImageModel(config);
      if (!result?.success) {
        throw new Error(result?.message || '生图模型测试失败');
      }
      const testedImageModel: ImageModelConfig = {
        ...config.image_model,
        status: 'available',
        tested_at: new Date().toISOString(),
        last_error: '',
      };
      const testedConfig: ClientConfig = {
        ...config,
        image_model: testedImageModel,
        image_model_profiles: {
          ...config.image_model_profiles,
          [testedImageModel.provider]: testedImageModel,
        },
      };
      await window.yibiao?.config.save(testedConfig);
      setState((prev) => ({
        ...prev,
        imageModel: testedConfig.image_model,
        imageModelProfiles: {
          ...prev.imageModelProfiles,
          [testedConfig.image_model.provider]: imageProfileFromState(testedConfig.image_model),
        },
      }));
      setSavedConfig(testedConfig);
      trackConfigUsage({}, testedConfig);
      const previewSrc = result?.image_url || (result?.image_data ? `data:${result.mime_type || 'image/png'};base64,${result.image_data}` : '');

      if (previewSrc) {
        setImageTestPreview({ src: previewSrc, title: `${imageProviderLabels[state.imageModel.provider]} 测试图片` });
      }

      showToast(result?.message || '生图模型测试成功', result?.success ? 'success' : 'error');
    } catch (error) {
      const message = error instanceof Error ? error.message : '生图模型测试失败';
      const config = createClientConfig();
      const failedImageModel: ImageModelConfig = {
        ...config.image_model,
        status: 'unavailable',
        tested_at: new Date().toISOString(),
        last_error: message,
      };
      const failedConfig: ClientConfig = {
        ...config,
        image_model: failedImageModel,
        image_model_profiles: {
          ...config.image_model_profiles,
          [failedImageModel.provider]: failedImageModel,
        },
      };
      await window.yibiao?.config.save(failedConfig).catch(() => undefined);
      setState((prev) => ({
        ...prev,
        imageModel: failedConfig.image_model,
        imageModelProfiles: {
          ...prev.imageModelProfiles,
          [failedConfig.image_model.provider]: imageProfileFromState(failedConfig.image_model),
        },
      }));
      setSavedConfig(failedConfig);
      trackConfigUsage({}, failedConfig);
      showToast(message, 'error');
    } finally {
      setTestingImageModel(false);
    }
  };

  const saveFileParserConfig = async () => {
    await saveClientConfig(createClientConfig());
  };

  const openConfigFolder = async () => {
    try {
      await window.yibiao?.config.openConfigFolder();
      showToast('已打开配置文件夹', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开配置文件夹失败', 'error');
    }
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      showToast('请先填写项目名称', 'info');
      return;
    }

    try {
      setProjectActionBusy(true);
      const result = await window.yibiao?.projectWorkspace?.create({ name, makeActive: true });
      if (result?.state) {
        setProjectState(result.state);
      }
      setNewProjectName('');
      showToast('项目已创建并设为当前项目，重启后加载该项目工作区', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建项目失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const archiveProject = async (project: ProjectWorkspaceSummary, archived: boolean) => {
    try {
      setProjectActionBusy(true);
      const result = await window.yibiao?.projectWorkspace?.archive(project.id, archived);
      if (result?.state) {
        setProjectState(result.state);
      }
      showToast(archived ? '项目已归档' : '项目已恢复', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : archived ? '归档项目失败' : '恢复项目失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const duplicateProject = async (project: ProjectWorkspaceSummary) => {
    try {
      setProjectActionBusy(true);
      await assertNoActiveProjectTasks();
      const result = await window.yibiao?.projectWorkspace?.duplicate(project.id, { name: `${project.name} 副本`, makeActive: false });
      if (result?.state) {
        setProjectState(result.state);
      }
      showToast(`项目已复制：${result?.project?.name || `${project.name} 副本`}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制项目失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const exportProjectPackage = async (project: ProjectWorkspaceSummary) => {
    const packageDir = projectExportDir.trim();
    if (!packageDir) {
      showToast('请先填写项目包导出目录', 'info');
      return;
    }

    try {
      setProjectActionBusy(true);
      await assertNoActiveProjectTasks();
      const result = await window.yibiao?.projectWorkspace?.exportPackage(project.id, packageDir);
      showToast(`项目包已导出到 ${result?.package_dir || packageDir}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出项目包失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const importProjectPackage = async () => {
    const packageDir = projectImportDir.trim();
    if (!packageDir) {
      showToast('请先填写项目包导入目录', 'info');
      return;
    }

    try {
      setProjectActionBusy(true);
      await assertNoActiveProjectTasks();
      const result = await window.yibiao?.projectWorkspace?.importPackage(packageDir, { makeActive: false });
      if (result?.state) {
        setProjectState(result.state);
      }
      showToast(`项目包已导入：${result?.project?.name || '新项目'}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入项目包失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const requestSwitchProject = async (project: ProjectWorkspaceSummary) => {
    if (project.is_active) return;
    try {
      await assertNoActiveProjectTasks();
      setProjectDialog({ kind: 'switch', project });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '当前不能切换项目', 'error');
    }
  };

  const confirmSwitchProject = async () => {
    if (projectDialog?.kind !== 'switch') return;
    try {
      setProjectActionBusy(true);
      await assertNoActiveProjectTasks();
      const result = await window.yibiao?.projectWorkspace?.setActive(projectDialog.project.id);
      if (result?.state) {
        setProjectState(result.state);
      }
      setProjectDialog(null);
      showToast(result?.restart_required ? '当前项目已切换，请重启应用加载新的项目数据' : '当前项目已切换', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const requestDeleteProject = async (project: ProjectWorkspaceSummary) => {
    try {
      await assertNoActiveProjectTasks();
      setProjectDialog({ kind: 'delete', project });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '当前不能删除项目', 'error');
    }
  };

  const confirmDeleteProject = async () => {
    if (projectDialog?.kind !== 'delete') return;
    try {
      setProjectActionBusy(true);
      await assertNoActiveProjectTasks();
      const result = await window.yibiao?.projectWorkspace?.delete(projectDialog.project.id, { deleteFiles: false });
      if (result?.state) {
        setProjectState(result.state);
      }
      setProjectDialog(null);
      showToast('项目已从列表删除，工作区文件已保留', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error');
    } finally {
      setProjectActionBusy(false);
    }
  };

  const fetchTextModels = async () => {
    try {
      setLoadingModels('text');
      if (isCodexCliTextProvider(state.textModel.provider)) {
        const models = ['gpt-5.5', 'gpt-5', 'gpt-5-codex'];
        setTextModels(models);
        setState((prev) => ({
          ...prev,
          ...(() => {
            const textModel = models.includes(prev.textModel.model_name)
              ? prev.textModel
              : { ...prev.textModel, model_name: models[0] };
            return {
              textModel,
              textModelProfiles: {
                ...prev.textModelProfiles,
                [prev.textModel.provider]: textProfileFromState(textModel),
              },
            };
          })(),
        }));
        showToast('已加载本机 Codex CLI 常用模型；实际可用性以测试结果为准', 'success');
        return;
      }

      const result = await window.yibiao?.config.listModels(createClientConfig());
      const models = filterTextModelsForProvider(state.textModel.provider, result?.models || []);
      setTextModels(models);
      if (result?.success && models.length > 0) {
        setState((prev) => ({
          ...prev,
          ...(() => {
            const textModel = models.includes(prev.textModel.model_name)
              ? prev.textModel
              : { ...prev.textModel, model_name: models[0] };
            return {
              textModel,
              textModelProfiles: {
                ...prev.textModelProfiles,
                [prev.textModel.provider]: textProfileFromState(textModel),
              },
            };
          })(),
        }));
      }
      showToast(result?.message || `获取到 ${result?.models.length || 0} 个文本模型`, result?.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '获取文本模型失败', 'error');
    } finally {
      setLoadingModels(null);
    }
  };

  const fetchImageModels = async () => {
    try {
      setLoadingModels('image');
      if (state.imageModel.provider === 'jinlong' || state.imageModel.provider === 'agnes' || state.imageModel.provider === 'custom') {
        const providerLabel = imageProviderLabels[state.imageModel.provider];
        const baseUrl = state.imageModel.provider === 'custom'
          ? state.imageModel.base_url || ''
          : state.imageModel.base_url || imageProviderDefaults[state.imageModel.provider].base_url || '';

        if (!state.imageModel.api_key.trim()) {
          setImageModels([]);
          showToast(`请先填写${providerLabel} API Key`, 'info');
          return;
        }

        if (!baseUrl.trim()) {
          setImageModels([]);
          showToast(`请先填写${providerLabel} Base URL`, 'info');
          return;
        }

        const config = createClientConfig();
        const result = await window.yibiao?.config.listModels({
          ...config,
          api_key: state.imageModel.api_key,
          base_url: baseUrl,
          model_name: state.imageModel.model_name,
        });
        const models = result?.models || [];
        setImageModels(models);
        if (result?.success && models.length > 0) {
          setState((prev) => ({
            ...prev,
            ...(() => {
              const imageModel = models.includes(prev.imageModel.model_name)
                ? prev.imageModel
                : resetImageModelStatus({ ...prev.imageModel, model_name: models[0] });
              return {
                imageModel,
                imageModelProfiles: {
                  ...prev.imageModelProfiles,
                  [prev.imageModel.provider]: imageProfileFromState(imageModel),
                },
              };
            })(),
          }));
        }
        showToast(result?.message || `获取到 ${models.length} 个${providerLabel}模型`, result?.success ? 'success' : 'info');
        return;
      }

      if (state.imageModel.provider === 'volcengine') {
        setImageModels([]);
        showToast('火山方舟请填写控制台中已开通的模型或推理接入点 ID。');
        return;
      }

      if (state.imageModel.provider === 'google-ai-studio') {
        const models = [
          'gemini-3.1-flash-image-preview',
          'gemini-3-pro-image-preview',
          'gemini-2.5-flash-image',
        ];
        setImageModels(models);
        setState((prev) => ({
          ...prev,
          ...(() => {
            const imageModel = models.includes(prev.imageModel.model_name)
              ? prev.imageModel
              : resetImageModelStatus({ ...prev.imageModel, model_name: models[0] });
            return {
              imageModel,
              imageModelProfiles: {
                ...prev.imageModelProfiles,
                [prev.imageModel.provider]: imageProfileFromState(imageModel),
              },
            };
          })(),
        }));
        showToast('已载入 Google AI Studio 生图模型', 'success');
        return;
      }

      setImageModels([]);
      showToast('该服务商模型列表接口暂未接入。');
    } finally {
      setLoadingModels(null);
    }
  };

  const isActiveTabDirty = () => {
    if (!savedConfig) {
      return false;
    }

    if (activeTab === 'text-model') {
      return JSON.stringify({
        provider: state.textModel.provider,
        profiles: getCurrentTextModelProfiles(),
      }) !== JSON.stringify({
        provider: savedConfig.text_model_provider,
        profiles: normalizeTextModelProfiles(savedConfig.text_model_profiles),
      });
    }

    if (activeTab === 'general') {
      return JSON.stringify({
        language: state.general.language,
        theme: state.general.theme,
        sidebar_layout: state.general.sidebar_layout,
        developer_mode: Boolean(state.general.developer_mode),
        developer_token_stats_auto_open: Boolean(state.general.developer_token_stats_auto_open),
        update_channel: state.general.update_channel,
        gpu_hardware_acceleration_enabled: Boolean(state.general.gpu_hardware_acceleration_enabled),
        gpu_hardware_acceleration_configured: Boolean(state.general.gpu_hardware_acceleration_configured),
      }) !== JSON.stringify({
        language: normalizeLanguage(savedConfig.language),
        theme: normalizeTheme(savedConfig.theme),
        sidebar_layout: normalizeSidebarLayout(savedConfig.sidebar_layout),
        developer_mode: Boolean(savedConfig.developer_mode),
        developer_token_stats_auto_open: Boolean(savedConfig.developer_token_stats_auto_open),
        update_channel: normalizeUpdateChannel(savedConfig.update_channel),
        gpu_hardware_acceleration_enabled: Boolean(savedConfig.gpu_hardware_acceleration_enabled),
        gpu_hardware_acceleration_configured: Boolean(savedConfig.gpu_hardware_acceleration_configured),
      });
    }

    if (activeTab === 'image-model') {
      return JSON.stringify({
        provider: state.imageModel.provider,
        profiles: getCurrentImageModelProfiles(),
      }) !== JSON.stringify({
        provider: savedConfig.image_model.provider,
        profiles: normalizeImageModelProfiles(savedConfig.image_model_profiles),
      });
    }

    if (activeTab === 'file-parser') {
      return JSON.stringify(state.fileParser) !== JSON.stringify(savedConfig.file_parser);
    }

    return false;
  };

  const openDeveloperTokenStatsWindow = async () => {
    const nextConfig = createClientConfig();
    if (!nextConfig.developer_mode) {
      showToast('请先开启开发者模式', 'info');
      return;
    }

    if (!savedConfig?.developer_mode || isActiveTabDirty()) {
      const saved = await saveClientConfig(nextConfig);
      if (!saved) {
        return;
      }
    }

    try {
      const result = await window.yibiao?.developerTokenStats.openWindow();
      showToast(result?.success ? '已打开 Token 统计小窗' : '打开 Token 统计小窗失败', result?.success ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开 Token 统计小窗失败', 'error');
    }
  };

  const saveActiveTabConfig = async () => {
    if (activeTab === 'general') {
      const nextConfig = createClientConfig();
      const previousGpuEnabled = Boolean(savedConfig?.gpu_hardware_acceleration_enabled);
      const nextGpuEnabled = Boolean(state.general.gpu_hardware_acceleration_enabled);

      if (!previousGpuEnabled && nextGpuEnabled) {
        const saved = await saveClientConfig({
          ...nextConfig,
          gpu_hardware_acceleration_enabled: false,
          gpu_hardware_acceleration_configured: true,
        });
        if (saved) {
          try {
            const result = await window.yibiao?.startGpuHardwareAccelerationTrial();
            if (!result?.success) {
              throw new Error('GPU 硬件加速试启用失败');
            }
            showToast('即将重启试用 GPU 硬件加速', 'info');
          } catch (error) {
            setState((prev) => ({
              ...prev,
              general: {
                ...prev.general,
                gpu_hardware_acceleration_enabled: false,
                gpu_hardware_acceleration_configured: true,
              },
            }));
            const message = error instanceof Error ? error.message : 'GPU 硬件加速试启用失败';
            showToast(`${message}，已保持关闭，请稍后重试。`, 'error');
          }
        }
        return;
      }

      const saved = await saveClientConfig(nextConfig);
      if (saved && previousGpuEnabled !== nextGpuEnabled) {
        showToast(nextGpuEnabled ? 'GPU 硬件加速将在重启后启用' : 'GPU 硬件加速将在重启后关闭', 'info');
      }
      return;
    }
    if (activeTab === 'text-model') {
      await saveTextConfig();
      return;
    }
    if (activeTab === 'image-model') {
      await saveImageConfig();
      return;
    }
    if (activeTab === 'file-parser') {
      await saveFileParserConfig();
    }
  };

  const canSaveActiveTab = activeTab === 'general' || activeTab === 'text-model' || activeTab === 'image-model' || activeTab === 'file-parser';
  const activeTabDirty = isActiveTabDirty();
  const currentTextProviderDefault = textProviderDefaults[state.textModel.provider];
  const imageModelStatus: ImageModelStatus = state.imageModel.status || 'untested';
  const currentImageStatus = imageStatusMeta[imageModelStatus];
  const currentAgentSelfCheckStatus = agentSelfCheckStatusMeta[agentSelfCheckStatus];
  const imageTestTime = formatImageTestTime(state.imageModel.tested_at);
  const settingsToolbarGroups: FloatingToolbarGroup[] = canSaveActiveTab
    ? [
        {
          id: 'settings-save-state',
          actions: [
            {
              id: 'save-state',
              label: activeTabDirty ? '未保存' : '已保存',
              variant: 'ghost',
              disabled: true,
              onClick: () => undefined,
            },
          ],
        },
        {
          id: 'settings-save-action',
          actions: [
            {
              id: 'save',
              label: '保存',
              variant: 'primary',
              disabled: !activeTabDirty,
              tooltip: activeTabDirty ? '保存当前设置' : '当前设置已保存',
              onClick: saveActiveTabConfig,
            },
          ],
        },
      ]
    : [];

  const updateBusy = updateStatus === 'checking' || updateStatus === 'downloading';
  const activeProject = getActiveProject(projectState);
  const updateStatusText = (() => {
    if (updateStatus === 'checking') return '正在检查更新...';
    if (updateStatus === 'downloading') return `正在下载 ${updatePercent}%`;
    if (updateStatus === 'downloaded') return updateVersion ? `新版本 ${updateVersion} 已准备好` : '更新已准备好';
    if (updateStatus === 'error') return `更新失败：${updateError || '未知错误'}`;
    if (updateStatus === 'disabled') return '开发调试模式不执行自动更新';
    return '启动后自动检查，每 30 分钟轮询';
  })();

  return (
    <div className="settings-page">
      <div className="settings-page-scroll">
        <div className="settings-tab-shell" role="tablist" aria-label="设置分类">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

      {activeTab === 'general' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>通用</strong>
          </div>
          <div className="settings-list">
            <div className="settings-row settings-row-wide">
              <div className="settings-row-copy">
                <strong>项目工作区</strong>
                <span>
                  {activeProject
                    ? `当前项目：${activeProject.name}。切换项目会在重启后加载对应工作区数据。`
                    : projectLoading ? '正在读取项目列表。' : '尚未读取到项目工作区。'}
                </span>
              </div>
              <div className="project-workspace-panel">
                <div className="project-workspace-current">
                  <div>
                    <span>当前项目</span>
                    <strong>{activeProject?.name || '默认项目'}</strong>
                    <small>{activeProject?.workspace_path || projectState?.projects_dir || '未读取到工作区路径'}</small>
                  </div>
                  <button type="button" className="inline-action" onClick={() => { void loadProjectState(); }} disabled={projectLoading}>
                    {projectLoading ? '刷新中' : '刷新'}
                  </button>
                </div>
                <div className="project-workspace-create">
                  <input
                    type="text"
                    value={newProjectName}
                    placeholder="新项目名称"
                    onChange={(event) => setNewProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void createProject();
                      }
                    }}
                  />
                  <button type="button" className="inline-action" onClick={() => { void createProject(); }} disabled={projectActionBusy}>
                    新建并切换
                  </button>
                </div>
                <div className="project-workspace-package">
                  <label>
                    <span>导出目录</span>
                    <input
                      type="text"
                      value={projectExportDir}
                      placeholder="项目包导出目录，例如 D:\\投标项目备份\\医院后勤"
                      aria-label="项目包导出目录"
                      onChange={(event) => setProjectExportDir(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>导入目录</span>
                    <input
                      type="text"
                      value={projectImportDir}
                      placeholder="包含 project.json 的项目包目录"
                      aria-label="项目包导入目录"
                      onChange={(event) => setProjectImportDir(event.target.value)}
                    />
                  </label>
                  <button type="button" className="inline-action" onClick={() => { void importProjectPackage(); }} disabled={projectActionBusy}>
                    导入项目包
                  </button>
                </div>
                <div className="project-workspace-list" aria-label="项目工作区列表">
                  {(projectState?.projects || []).map((project) => (
                    <article className={`project-workspace-item ${project.is_active ? 'is-active' : ''}`} key={project.id}>
                      <div>
                        <strong>{project.name}</strong>
                        <span>{project.description || (project.is_default ? '默认旧版工作区' : '独立项目工作区')}</span>
                        <small>
                          {project.status === 'archived' ? '已归档' : project.is_active ? '当前项目' : '可切换'} · 更新于 {formatProjectTime(project.updated_at)}
                        </small>
                      </div>
                      <div className="project-workspace-actions">
                        <button
                          type="button"
                          className="inline-action"
                          disabled={project.is_active || project.status === 'archived' || projectActionBusy}
                          onClick={() => { void requestSwitchProject(project); }}
                        >
                          {project.is_active ? '当前' : '设为当前'}
                        </button>
                        <button
                          type="button"
                          className="inline-action"
                          disabled={project.status === 'archived' || projectActionBusy}
                          onClick={() => { void duplicateProject(project); }}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          className="inline-action"
                          disabled={project.status === 'archived' || projectActionBusy}
                          onClick={() => { void exportProjectPackage(project); }}
                        >
                          导出
                        </button>
                        <button
                          type="button"
                          className="inline-action"
                          disabled={project.is_default || projectActionBusy}
                          onClick={() => { void archiveProject(project, project.status !== 'archived'); }}
                        >
                          {project.status === 'archived' ? '恢复' : '归档'}
                        </button>
                        <button
                          type="button"
                          className="inline-action"
                          disabled={project.is_default || project.is_active || projectActionBusy}
                          onClick={() => { void requestDeleteProject(project); }}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                  {!projectLoading && !projectState?.projects.length && (
                    <div className="project-workspace-empty">暂无项目数据，请刷新后重试。</div>
                  )}
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>显示语言</strong>
                <span>{languageOptions[0].description}</span>
              </div>
              <span className="settings-static-value">{languageOptions[0].label}</span>
            </div>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>应用主题</strong>
                <span>{themeOptions.find((option) => option.value === state.general.theme)?.description || '切换深色或浅色模式'}</span>
              </div>
              <select
                aria-label="应用主题"
                value={state.general.theme}
                onChange={(event) => updateTheme(event.target.value as AppTheme)}
              >
                {themeOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>侧边栏布局</strong>
                <span>{sidebarLayoutOptions.find((option) => option.value === state.general.sidebar_layout)?.description || '选择侧边栏显示密度'}</span>
              </div>
              <select
                aria-label="侧边栏布局"
                value={state.general.sidebar_layout}
                onChange={(event) => updateSidebarLayout(event.target.value as SidebarLayout)}
              >
                {sidebarLayoutOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>自动更新渠道</strong>
                <span>{updateChannelOptions.find((option) => option.value === state.general.update_channel)?.description || '选择自动检查更新和下载客户端安装包的来源'}</span>
              </div>
              <select
                value={state.general.update_channel}
                onChange={(event) => updateUpdateChannel(event.target.value as UpdateChannel)}
              >
                {updateChannelOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>GPU 硬件加速</strong>
                <span>启用后界面可能更流畅；极少数电脑启用后会闪退，关闭后兼容性更好。修改后需重启生效。</span>
              </div>
              <span className="settings-switch-control">
                <input
                  type="checkbox"
                  checked={state.general.gpu_hardware_acceleration_enabled}
                  onChange={(event) => updateGpuHardwareAcceleration(event.target.checked)}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </span>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>开发者模式</strong>
                <span>会打乱既有工作流，生成大量日志占用磁盘空间，<strong>非专业人士请勿开启</strong></span>
              </div>
              <span className="settings-switch-control">
                <input
                  type="checkbox"
                  checked={state.general.developer_mode}
                  onChange={(event) => updateDeveloperMode(event.target.checked)}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
              </span>
            </label>
            {state.general.developer_mode && (
              <>
                <label className="settings-row">
                  <div className="settings-row-copy">
                    <strong>默认打开 Token 统计小窗</strong>
                    <span>开启后，应用下次启动时自动打开开发者 Token 统计悬浮窗</span>
                  </div>
                  <span className="settings-switch-control">
                    <input
                      type="checkbox"
                      checked={state.general.developer_token_stats_auto_open}
                      onChange={(event) => updateDeveloperTokenStatsAutoOpen(event.target.checked)}
                    />
                    <span className="settings-switch-track" aria-hidden="true">
                      <span className="settings-switch-thumb" />
                    </span>
                  </span>
                </label>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>Token 统计小窗</strong>
                    <span>半透明悬浮展示文本模型输入、输出、总量、缓存命中和请求次数</span>
                  </div>
                  <div className="settings-action-cell">
                    <button type="button" className="inline-action" onClick={openDeveloperTokenStatsWindow}>
                      打开 Token 统计小窗
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <strong>配置文件夹</strong>
                    <span>打开本机配置、工作区缓存和开发者日志所在目录</span>
                  </div>
                  <div className="settings-action-cell">
                    <button type="button" className="inline-action" onClick={openConfigFolder}>
                      打开配置文件夹
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === 'text-model' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>文本模型配置</strong>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>服务提供商</strong>
                <span>选择服务商会自动使用预置 Base URL；Codex CLI 使用本机登录状态</span>
              </div>
              <select
                aria-label="服务提供商"
                value={state.textModel.provider}
                onChange={(event) => updateTextModelProvider(event.target.value as TextModelProvider)}
              >
                {textModelProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>Base URL</strong>
                <span>{getTextBaseUrlDescription(state.textModel.provider)}</span>
              </div>
              <input
                type="text"
                value={state.textModel.base_url}
                placeholder={currentTextProviderDefault.base_url || '例如 https://api.openai.com/v1'}
                onChange={(event) => updateTextModelConfig({ base_url: event.target.value }, { clearModels: true })}
                disabled={state.textModel.provider !== 'custom'}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>API Key</strong>
                <span>{getTextApiKeyDescription(state.textModel.provider)}</span>
              </div>
              <InputWithAction
                type="password"
                value={state.textModel.api_key}
                placeholder={isApiKeylessTextProvider(state.textModel.provider) ? '当前服务商不需要填写 API Key' : '请输入文本模型 API Key'}
                onChange={(event) => updateTextModelConfig({ api_key: event.target.value }, { clearModels: true })}
                actionLabel="获取"
                actionTitle="打开当前服务商的 API Key 获取页面"
                actionDisabled={!textProviderApiKeyUrls[state.textModel.provider]}
                disabled={isApiKeylessTextProvider(state.textModel.provider)}
                onAction={() => { void openTextProviderApiKeyPage(); }}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>模型名称</strong>
                <span>{getTextModelDescription(state.textModel.provider)}</span>
              </div>
              <div className="settings-control-with-action">
                {textModels.length > 0 ? (
                  <select
                    value={state.textModel.model_name}
                    onChange={(event) => updateTextModelConfig({ model_name: event.target.value })}
                  >
                    {textModels.map((model) => <option value={model} key={model}>{model}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state.textModel.model_name}
                    placeholder={getTextModelPlaceholder(state.textModel.provider)}
                    onChange={(event) => updateTextModelConfig({ model_name: event.target.value })}
                  />
                )}
                <button
                  type="button"
                  className="inline-action"
                  onClick={fetchTextModels}
                  disabled={loadingModels === 'text'}
                >
                  {loadingModels === 'text' && <span className="inline-spinner" aria-hidden="true" />}
                  {loadingModels === 'text' ? '获取中' : '获取'}
                </button>
                <button type="button" className="inline-action" onClick={testTextConfig} disabled={testingTextModel}>
                  {testingTextModel && <span className="inline-spinner" aria-hidden="true" />}
                  {testingTextModel ? '测试中' : '测试'}
                </button>
              </div>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>上下文长度限制</strong>
                <span>配置所选模型的上下文长度，在处理长文本时会自动截断，分批处理</span>
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={state.textModel.context_length_limit}
                placeholder="400000"
                onChange={(event) => updateTextModelConfig({ context_length_limit: parseTextContextLengthInput(event.target.value) })}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>并发上限</strong>
                <span>全局文本 AI 请求同时执行的最大数量，超出后自动排队</span>
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={state.textModel.concurrency_limit}
                placeholder="10"
                onChange={(event) => updateTextModelConfig({ concurrency_limit: parseTextConcurrencyLimitInput(event.target.value) })}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>请求方式</strong>
                <span>流式请求只影响后端调用方式，应用仍等待完整结果后继续流程</span>
              </div>
              <select
                value={state.textModel.request_mode}
                onChange={(event) => updateTextModelConfig({ request_mode: event.target.value as AiRequestMode })}
              >
                {aiRequestModeOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {activeTab === 'image-model' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>生图模型配置</strong>
          </div>
          <div className={`image-model-status is-${imageModelStatus}`}>
            <div>
              <strong>接口状态：{currentImageStatus.label}</strong>
              <span>{currentImageStatus.description}</span>
              {imageTestTime && <small>最近测试：{imageTestTime}</small>}
              {imageModelStatus === 'unavailable' && state.imageModel.last_error && <small>失败原因：{state.imageModel.last_error}</small>}
            </div>
            <em>{currentImageStatus.label}</em>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>服务提供商</strong>
                <span>各家生图接口不统一，先选择服务商再配置模型</span>
              </div>
              <select
                value={state.imageModel.provider}
                onChange={(event) => {
                  const provider = event.target.value as ImageModelProvider;
                  updateImageModelProvider(provider);
                }}
              >
                {imageProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>Base URL</strong>
                <span>{getImageBaseUrlDescription(state.imageModel.provider)}</span>
              </div>
              <input
                type="text"
                value={state.imageModel.base_url || ''}
                placeholder={state.imageModel.provider === 'custom' ? 'https://api.example.com/v1' : imageProviderDefaults[state.imageModel.provider].base_url}
                onChange={(event) => updateImageModelConfig({ base_url: event.target.value }, { clearModels: true })}
                disabled={state.imageModel.provider !== 'custom'}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>API Key</strong>
                <span>{getImageApiKeyDescription(state.imageModel.provider)}</span>
              </div>
              <InputWithAction
                type="password"
                value={state.imageModel.api_key}
                placeholder="请输入生图服务 API Key"
                onChange={(event) => updateImageModelConfig({ api_key: event.target.value }, { clearModels: true })}
                actionLabel="获取"
                actionTitle="打开当前生图服务商的 API Key 获取页面"
                onAction={() => { void openImageProviderApiKeyPage(); }}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>模型名称</strong>
                <span>{getImageModelDescription(state.imageModel.provider)}</span>
              </div>
              <div className="settings-control-with-action">
                {imageModels.length > 0 ? (
                  <select
                    value={state.imageModel.model_name}
                    onChange={(event) => updateImageModelConfig({ model_name: event.target.value })}
                  >
                    {imageModels.map((model) => <option value={model} key={model}>{model}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state.imageModel.model_name}
                    placeholder={getImageModelPlaceholder(state.imageModel.provider)}
                    onChange={(event) => updateImageModelConfig({ model_name: event.target.value })}
                  />
                )}
                <button
                  type="button"
                  className="inline-action"
                  onClick={fetchImageModels}
                  disabled={loadingModels === 'image'}
                >
                  {loadingModels === 'image' && <span className="inline-spinner" aria-hidden="true" />}
                  {loadingModels === 'image' ? '获取中' : '获取'}
                </button>
                <button type="button" className="inline-action" onClick={testImageConfig} disabled={testingImageModel}>
                  {testingImageModel && <span className="inline-spinner" aria-hidden="true" />}
                  {testingImageModel ? '测试中' : '测试'}
                </button>
              </div>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>图片尺寸</strong>
                <span>{state.imageModel.provider === 'google-ai-studio' ? '使用 Google AI Studio 官方 imageSize 枚举' : '使用 OpenAI Image API 官方常用尺寸枚举'}</span>
              </div>
              <select
                value={normalizeImageSize(state.imageModel.provider, state.imageModel.image_size)}
                onChange={(event) => updateImageModelConfig({ image_size: event.target.value as ImageModelSize })}
              >
                {getImageSizeOptions(state.imageModel.provider).map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>并发上限</strong>
                <span>全局生图 AI 请求同时执行的最大数量，超出后自动排队</span>
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={state.imageModel.concurrency_limit}
                placeholder="2"
                onChange={(event) => updateImageModelConfig({ concurrency_limit: parseImageConcurrencyLimitInput(event.target.value) })}
              />
            </label>
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>请求方式</strong>
                <span>流式请求只影响后端调用方式，应用仍等待完整图片生成后继续流程</span>
              </div>
              <select
                value={state.imageModel.request_mode}
                onChange={(event) => updateImageModelConfig({ request_mode: event.target.value as AiRequestMode })}
              >
                {aiRequestModeOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          {imageTestPreview && (
            <div className="image-test-preview">
              <div>
                <strong>{imageTestPreview.title}</strong>
                <span>用于确认当前生图配置可用</span>
              </div>
              <img src={imageTestPreview.src} alt="生图模型测试结果" />
            </div>
          )}
        </section>
      )}

      {activeTab === 'file-parser' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>文件解析配置</strong>
          </div>
          <div className="settings-list">
            <label className="settings-row">
              <div className="settings-row-copy">
                <strong>文件解析方式</strong>
                <span>优先使用本地解析，复杂扫描件可尝试 MinerU 精准解析 API</span>
              </div>
              <select
                value={state.fileParser.provider}
                onChange={(event) => setState((prev) => ({
                ...prev,
                fileParser: { ...prev.fileParser, provider: event.target.value as FileParserProvider },
              }))}
            >
              {fileParserProviders.map((provider) => (
                  <option value={provider.value} key={provider.value}>{provider.label}</option>
                ))}
              </select>
            </label>
            {state.fileParser.provider === 'mineru-accurate-api' && (
              <label className="settings-row">
                <div className="settings-row-copy">
                  <strong>MinerU Token</strong>
                  <span>仅精准解析 API 需要 Token；轻量解析和本地解析无需填写</span>
                </div>
                <input
                  type="password"
                  value={state.fileParser.mineru_token || ''}
                  placeholder="请输入 MinerU Token"
                  onChange={(event) => setState((prev) => ({
                    ...prev,
                    fileParser: { ...prev.fileParser, mineru_token: event.target.value },
                  }))}
                />
              </label>
            )}
          </div>

          <div className="parser-compare">
            {parserOptions.map((option) => (
              <article className={`parser-card parser-card-${option.tone}`} key={option.title}>
                <div className="parser-card-head">
                  <div>
                    <strong>{option.title}</strong>
                    <p>{option.summary}</p>
                  </div>
                  <span>{option.badge}</span>
                </div>
                <dl className="parser-metrics">
                  {option.items.map(([label, value]) => (
                    <div key={`${option.title}-${label}`}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="parser-note">
            招标文件大多数是 Word 或 Word 导出的带文字层 PDF，本地解析可以适应 95% 以上的情况；如果解析失败，再尝试 MinerU 精准解析 API。
          </div>
        </section>
      )}

      {activeTab === 'agent' && (
        <section className="settings-page-section">
          <div className="settings-section-title">
            <span />
            <strong>智能体配置</strong>
          </div>
          <div className={`agent-self-check-status is-${agentSelfCheckStatus}`}>
            <div>
              <strong>智能体自检</strong>
              <span>{currentAgentSelfCheckStatus.description}</span>
            </div>
            <em>{currentAgentSelfCheckStatus.label}</em>
          </div>
          <div className="settings-list">
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>自检</strong>
                <span>执行一个极简智能体任务，检测 OpenCode Server、AI proxy、当前文本模型和输出文件校验链路。每次自检前会清空上一轮自检日志。</span>
              </div>
              <div className="settings-action-cell">
                <button type="button" className="inline-action" onClick={runAgentSelfCheck} disabled={agentSelfCheckStatus === 'checking'}>
                  {agentSelfCheckStatus === 'checking' && <span className="inline-spinner" aria-hidden="true" />}
                  {agentSelfCheckStatus === 'checking' ? '自检中' : '自检'}
                </button>
              </div>
            </div>
          </div>
          {agentSelfCheckResult && (
            <div className={`agent-self-check-result is-${agentSelfCheckResult.success ? 'normal' : agentSelfCheckResult.status === 'busy' ? 'busy' : 'error'}`}>
              <div className="agent-self-check-result-head">
                <div>
                  <strong>{agentSelfCheckResult.success ? '自检通过' : agentSelfCheckResult.status === 'busy' ? '自检跳过' : '自检失败'}</strong>
                  <span>{agentSelfCheckResult.message}</span>
                </div>
                <div className="agent-self-check-result-actions">
                  <small>{agentSelfCheckResult.duration_ms ? `${Math.round(agentSelfCheckResult.duration_ms / 1000)} 秒` : agentSelfCheckResult.checked_at}</small>
                  <button type="button" className="inline-action" onClick={exportAgentSelfCheckReport} disabled={exportingAgentSelfCheckReport}>
                    {exportingAgentSelfCheckReport && <span className="inline-spinner" aria-hidden="true" />}
                    {exportingAgentSelfCheckReport ? '导出中' : '导出报告'}
                  </button>
                </div>
              </div>
              {agentSelfCheckResult.steps.length > 0 && (
                <div className="agent-self-check-steps">
                  {agentSelfCheckResult.steps.map((step) => (
                    <div className={`agent-self-check-step is-${step.status}`} key={step.id}>
                      <strong>{step.label}</strong>
                      <span>{step.message || step.status}</span>
                    </div>
                  ))}
                </div>
              )}
              <pre>{agentSelfCheckResult.detail_text}</pre>
            </div>
          )}
        </section>
      )}

      {activeTab === 'about' && (
        <section className="settings-page-section about-section">
          <div className="settings-section-title">
            <span />
            <strong>关于</strong>
          </div>
          <div className="about-grid">
            <div><span>当前版本</span><strong>{appVersion || '...'}</strong></div>
            <div><span>GitHub 仓库</span><a href="https://github.com/FB208/OpenBidKit_Yibiao" target="_blank" rel="noreferrer">FB208/OpenBidKit_Yibiao</a></div>
            <div>
              <span>自动更新</span>
              <strong>{updateStatusText}</strong>
              <button
                type="button"
                className="update-button"
                disabled={updateBusy}
                onClick={() => {
                  if (updateStatus === 'downloaded') {
                    void installDownloadedUpdate();
                    return;
                  }
                  void checkForUpdates();
                }}
              >
                {updateStatus === 'downloaded' ? '安装并重启' : updateBusy ? '检查中...' : '检查更新'}
              </button>
            </div>
            <div><span>运行模式</span><strong>独立 Electron 客户端</strong></div>
          </div>
          <div className="privacy-statement">
            <div className="privacy-statement-head">
              <span>Privacy</span>
              <strong>隐私声明</strong>
              <p>本工具尽量把数据处理留在本机和你自行选择的服务商之间，只保留运行所必需的最少信息。</p>
            </div>
            <div className="privacy-list">
              <article className="privacy-item">
                <span>01</span>
                <strong>你的业务数据不会被我收集</strong>
                <p>应用不会上传、收集或保存你配置的 API Key、导入的招标文件、解析后的文档内容、生成的方案正文、导出文件或其他业务结果。</p>
              </article>
              <article className="privacy-item">
                <span>02</span>
                <strong>线上 AI 请求只发送给你配置的服务商</strong>
                <p>当你使用 OpenAI 兼容接口、MinerU 或其他线上 API 时，应用会把完成任务所需的内容发送给你自行配置的服务商。这是实现文档解析、内容生成、模型测试等功能的必要步骤；这些请求不经过我的服务器，我也不会额外留存任何请求内容或生成结果。</p>
              </article>
              <article className="privacy-item">
                <span>03</span>
                <strong>匿名埋点只用于了解功能使用情况</strong>
                <p>为了判断开源项目是否有人使用、哪些功能更常用，应用会把匿名页面访问和功能使用次数上报到 Cloudflare。统计不包含文档内容、文件名、本地路径、API Key、用户输入、生成结果或任何可还原业务内容的信息。</p>
              </article>
            </div>
          </div>
        </section>
      )}
      </div>
      <Dialog.Root open={Boolean(projectDialog)} onOpenChange={(open) => !open && !projectActionBusy && setProjectDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="content-regenerate-modal" />
          <Dialog.Content className="content-regenerate-dialog project-workspace-dialog">
            <Dialog.Title>{projectDialog?.kind === 'delete' ? '删除项目' : '切换项目'}</Dialog.Title>
            <Dialog.Description>
              {projectDialog?.kind === 'delete'
                ? `将从项目列表删除“${projectDialog.project.name}”，本地工作区文件会保留。`
                : `将当前项目切换为“${projectDialog?.project.name || ''}”。切换后需要重启应用，业务数据才会从该项目工作区重新加载。`}
            </Dialog.Description>
            <div className="project-workspace-dialog-path">
              {projectDialog?.project.workspace_path || ''}
            </div>
            <div className="content-regenerate-actions">
              <button type="button" className="secondary-button" onClick={() => setProjectDialog(null)} disabled={projectActionBusy}>取消</button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (projectDialog?.kind === 'delete') {
                    void confirmDeleteProject();
                    return;
                  }
                  void confirmSwitchProject();
                }}
                disabled={projectActionBusy}
              >
                {projectActionBusy ? '处理中...' : projectDialog?.kind === 'delete' ? '确认删除' : '确认切换'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <FloatingToolbar groups={settingsToolbarGroups} label="设置保存工具条" />
    </div>
  );
}

export default SettingsPage;
