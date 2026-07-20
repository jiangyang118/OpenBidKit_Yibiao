const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getConfigFilePath } = require('../utils/paths.cjs');

const textModelProviders = ['jinlong', 'volcengine', 'deepseek', 'longcat', 'codex-cli', 'local-gemma', 'local-qwen', 'lm-studio', 'vllm', 'llama-cpp', 'jan', 'custom'];
const imageModelProviders = ['jinlong', 'volcengine', 'codex-gpt-image', 'google-ai-studio', 'custom'];
const aiRequestModes = ['normal', 'stream'];
const updateChannels = ['github', 'cloudflare'];
const displayLanguages = ['zh-CN'];
const appThemes = ['system', 'light', 'dark'];
const sidebarLayouts = ['classic', 'compact'];
const localHttpTextModelProviders = new Set(['local-gemma', 'local-qwen', 'lm-studio', 'vllm', 'llama-cpp', 'jan']);

const textProviderBaseUrls = {
  jinlong: 'https://jlaudeapi.com/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  deepseek: 'https://api.deepseek.com',
  longcat: 'https://api.longcat.chat/openai/v1',
  'codex-cli': 'local-codex-cli',
  'local-gemma': 'http://127.0.0.1:11434/v1',
  'local-qwen': 'http://127.0.0.1:11434/v1',
  'lm-studio': 'http://127.0.0.1:1234/v1',
  vllm: 'http://127.0.0.1:8000/v1',
  'llama-cpp': 'http://127.0.0.1:8080/v1',
  jan: 'http://127.0.0.1:1337/v1',
  custom: '',
};

const defaultTextModelProfiles = {
  jinlong: {
    api_key: '',
    base_url: textProviderBaseUrls.jinlong,
    model_name: 'gpt-3.5-turbo',
    request_mode: 'stream',
  },
  volcengine: {
    api_key: '',
    base_url: textProviderBaseUrls.volcengine,
    model_name: '',
    request_mode: 'stream',
  },
  deepseek: {
    api_key: '',
    base_url: textProviderBaseUrls.deepseek,
    model_name: '',
    request_mode: 'stream',
  },
  longcat: {
    api_key: '',
    base_url: textProviderBaseUrls.longcat,
    model_name: '',
    request_mode: 'stream',
  },
  'codex-cli': {
    api_key: '',
    base_url: textProviderBaseUrls['codex-cli'],
    model_name: 'gpt-5.5',
    request_mode: 'normal',
  },
  'local-gemma': {
    api_key: '',
    base_url: textProviderBaseUrls['local-gemma'],
    model_name: 'gemma4:31b',
    request_mode: 'normal',
  },
  'local-qwen': {
    api_key: '',
    base_url: textProviderBaseUrls['local-qwen'],
    model_name: 'qwen3.6:27b',
    request_mode: 'normal',
  },
  'lm-studio': {
    api_key: '',
    base_url: textProviderBaseUrls['lm-studio'],
    model_name: '',
    request_mode: 'normal',
  },
  vllm: {
    api_key: '',
    base_url: textProviderBaseUrls.vllm,
    model_name: '',
    request_mode: 'normal',
  },
  'llama-cpp': {
    api_key: '',
    base_url: textProviderBaseUrls['llama-cpp'],
    model_name: '',
    request_mode: 'normal',
  },
  jan: {
    api_key: '',
    base_url: textProviderBaseUrls.jan,
    model_name: '',
    request_mode: 'normal',
  },
  custom: {
    api_key: '',
    base_url: '',
    model_name: '',
    request_mode: 'stream',
  },
};

const defaultImageModelProfiles = {
  jinlong: {
    provider: 'jinlong',
    base_url: 'https://jlaudeapi.com/v1',
    api_key: '',
    model_name: '',
    request_mode: 'stream',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  volcengine: {
    provider: 'volcengine',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    api_key: '',
    model_name: '',
    request_mode: 'stream',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'codex-gpt-image': {
    provider: 'codex-gpt-image',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model_name: 'gpt-image-2',
    request_mode: 'normal',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  'google-ai-studio': {
    provider: 'google-ai-studio',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    api_key: '',
    model_name: 'gemini-3.1-flash-image-preview',
    request_mode: 'stream',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
  custom: {
    provider: 'custom',
    base_url: '',
    api_key: '',
    model_name: '',
    request_mode: 'stream',
    status: 'untested',
    tested_at: '',
    last_error: '',
  },
};

const defaultExportFormat = {
  page: {
    paper_size: 'a4',
    orientation: 'portrait',
    margin_top_cm: 2,
    margin_bottom_cm: 2,
    margin_left_cm: 2,
    margin_right_cm: 2,
    footer_enabled: true,
    footer_distance_cm: 1.75,
    footer_font: '宋体',
    footer_size: '小五',
    page_number_enabled: true,
    page_number_format: '第{page}页',
    cover_enabled: false,
    cover_title: '投标技术文件',
    cover_subtitle: '',
    cover_company: '',
    cover_date: '',
    toc_enabled: false,
    toc_title: '目录',
    toc_depth: 3,
    chapter_section_break_enabled: false,
    header_enabled: false,
    header_text: '投标技术文件',
    header_first_page_different: false,
    header_first_page_text: '',
    header_even_odd_different: false,
    header_even_text: '',
    header_font: '宋体',
    header_size: '小五',
    header_alignment: '居中对齐',
    watermark_enabled: false,
    watermark_text: '内部资料',
    watermark_font: '宋体',
    watermark_size_pt: 54,
    watermark_color: 'D9D9D9',
    watermark_opacity: 0.28,
  },
  headings: [
    { font: '黑体', size: '小二', alignment: '居中对齐', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 0, line_spacing: 1, numbering_format: 'chinese-chapter' },
    { font: '黑体', size: '四号', alignment: '两端对齐', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 1.5, line_spacing: 1, numbering_format: 'chinese-section' },
    { font: '黑体', size: '小四', alignment: '两端对齐', spacing_before_pt: 10, spacing_after_pt: 10, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'chinese-dun' },
    { font: '楷体', size: '小四', alignment: '两端对齐', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'chinese-paren' },
    { font: '黑体', size: '小四', alignment: '两端对齐', spacing_before_pt: 5, spacing_after_pt: 5, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'arabic-dun' },
    { font: '宋体', size: '小四', alignment: '两端对齐', spacing_before_pt: 0, spacing_after_pt: 0, first_line_indent_chars: 2, line_spacing: 1, numbering_format: 'arabic-paren' },
  ],
  body_text: {
    font: '宋体',
    size: '小四',
    alignment: '两端对齐',
    spacing_before_pt: 0,
    spacing_after_pt: 0,
    first_line_indent_chars: 2,
    line_spacing_multiple: 1.2,
  },
  table: {
    header_fill_color: 'F1F6FF',
    border_color: 'DCDFF6',
    inside_border_color: 'E8EDF6',
    cell_margin_twips: 120,
  },
  image: {
    max_width_px: 520,
  },
};

const defaultConfig = {
  language: 'zh-CN',
  theme: 'system',
  sidebar_layout: 'classic',
  text_model_provider: 'jinlong',
  text_model_profiles: defaultTextModelProfiles,
  api_key: '',
  base_url: textProviderBaseUrls.jinlong,
  model_name: 'gpt-3.5-turbo',
  request_mode: 'stream',
  image_model: {
    ...defaultImageModelProfiles['codex-gpt-image'],
  },
  image_model_profiles: defaultImageModelProfiles,
  file_parser: {
    provider: 'local',
    mineru_token: '',
  },
  update_channel: 'github',
  gpu_hardware_acceleration_enabled: true,
  gpu_hardware_acceleration_configured: true,
  export_format: defaultExportFormat,
  developer_mode: false,
  analytics_client_id: '',
  analytics_created_at: '',
};

function createAnalyticsClientId() {
  return crypto.randomUUID();
}

function createAnalyticsCreatedAt() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isTextModelProvider(value) {
  return textModelProviders.includes(value);
}

function isImageModelProvider(value) {
  return imageModelProviders.includes(value);
}

function normalizeAiRequestMode(value, fallback = 'stream') {
  return aiRequestModes.includes(value) ? value : fallback;
}

function normalizeUpdateChannel(value, fallback = defaultConfig.update_channel) {
  return updateChannels.includes(value) ? value : fallback;
}

function normalizeDisplayLanguage(value, fallback = defaultConfig.language) {
  return displayLanguages.includes(value) ? value : fallback;
}

function normalizeAppTheme(value, fallback = defaultConfig.theme) {
  return appThemes.includes(value) ? value : fallback;
}

function normalizeSidebarLayout(value, fallback = defaultConfig.sidebar_layout) {
  return sidebarLayouts.includes(value) ? value : fallback;
}

function normalizeTextModelProfile(provider, profile) {
  const defaults = defaultTextModelProfiles[provider];
  const source = profile || {};
  const sourceBaseUrl = provider === 'custom'
    ? source.base_url !== undefined ? source.base_url : defaults.base_url
    : defaults.base_url;
  const requestMode = localHttpTextModelProviders.has(provider) || provider === 'codex-cli'
    ? 'normal'
    : normalizeAiRequestMode(source.request_mode, defaults.request_mode);
  return {
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    base_url: sourceBaseUrl,
    model_name: source.model_name !== undefined ? source.model_name : defaults.model_name,
    request_mode: requestMode,
  };
}

function normalizeTextModelProfiles(sourceProfiles) {
  const profiles = {};
  textModelProviders.forEach((provider) => {
    profiles[provider] = normalizeTextModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object' ? sourceProfiles[provider] : null,
    );
  });
  return profiles;
}

function textProfileFromFlatConfig(source, fallback, provider) {
  const sourceBaseUrl = provider === 'custom'
    ? source.base_url !== undefined ? source.base_url : fallback.base_url
    : fallback.base_url;
  return {
    api_key: source.api_key !== undefined ? source.api_key : fallback.api_key,
    base_url: sourceBaseUrl,
    model_name: source.model_name !== undefined ? source.model_name : fallback.model_name,
    request_mode: normalizeAiRequestMode(source.request_mode !== undefined ? source.request_mode : fallback.request_mode, fallback.request_mode),
  };
}

function hasTextModelProfileData(profile) {
  return Boolean(profile && ['api_key', 'base_url', 'model_name'].some((key) => String(profile[key] || '').trim()));
}

function isLegacyBlankImageModel(sourceImageModel) {
  return sourceImageModel?.provider === 'jinlong'
    && !String(sourceImageModel.api_key || '').trim()
    && !String(sourceImageModel.model_name || '').trim()
    && (!sourceImageModel.status || sourceImageModel.status === 'untested')
    && !String(sourceImageModel.last_error || '').trim();
}

function getSourceTextModelProfiles(source) {
  return source.text_model_profiles && typeof source.text_model_profiles === 'object'
    ? source.text_model_profiles
    : {};
}

function pickTextProfileField(primary, secondary, fallback) {
  if (primary !== undefined && String(primary).trim()) return primary;
  if (secondary !== undefined && String(secondary).trim()) return secondary;
  if (primary !== undefined) return primary;
  if (secondary !== undefined) return secondary;
  return fallback;
}

function textProfileFromUnknownProvider(source, sourceProvider, fallback) {
  const sourceProfiles = getSourceTextModelProfiles(source);
  const selectedProfile = sourceProvider ? sourceProfiles[sourceProvider] : null;
  return {
    api_key: pickTextProfileField(source.api_key, selectedProfile?.api_key, fallback.api_key),
    base_url: pickTextProfileField(source.base_url, selectedProfile?.base_url, fallback.base_url),
    model_name: pickTextProfileField(source.model_name, selectedProfile?.model_name, fallback.model_name),
    request_mode: normalizeAiRequestMode(pickTextProfileField(source.request_mode, selectedProfile?.request_mode, fallback.request_mode), fallback.request_mode),
  };
}

function normalizeImageModelProfile(provider, profile) {
  const defaults = defaultImageModelProfiles[provider];
  const source = profile || {};
  return {
    provider,
    base_url: provider === 'custom'
      ? source.base_url !== undefined ? source.base_url : defaults.base_url
      : defaults.base_url,
    api_key: source.api_key !== undefined ? source.api_key : defaults.api_key,
    model_name: source.model_name !== undefined ? source.model_name : defaults.model_name,
    request_mode: normalizeAiRequestMode(source.request_mode, defaults.request_mode),
    status: source.status !== undefined ? source.status : defaults.status,
    tested_at: source.tested_at !== undefined ? source.tested_at : defaults.tested_at,
    last_error: source.last_error !== undefined ? source.last_error : defaults.last_error,
  };
}

function normalizeImageModelProfiles(sourceProfiles) {
  const profiles = {};
  imageModelProviders.forEach((provider) => {
    profiles[provider] = normalizeImageModelProfile(
      provider,
      sourceProfiles && typeof sourceProfiles === 'object' ? sourceProfiles[provider] : null,
    );
  });
  return profiles;
}

const VALID_NUMBERING_FORMATS = ['chinese-chapter','chinese-section','chinese-dun','chinese-paren','arabic-dun','arabic-dot','arabic-paren','arabic','none'];

function normalizeExportFormat(source) {
  const def = defaultExportFormat;
  if (!source || typeof source !== 'object') return { page: { ...def.page }, headings: def.headings.map(h => ({ ...h })), body_text: { ...def.body_text }, table: { ...def.table }, image: { ...def.image } };

  const srcPage = source.page && typeof source.page === 'object' ? source.page : {};
  const page = {
    paper_size: ['a4','a3','a5','b4','b5','letter','legal','16k'].includes(srcPage.paper_size) ? srcPage.paper_size : def.page.paper_size,
    orientation: ['portrait', 'landscape'].includes(srcPage.orientation) ? srcPage.orientation : def.page.orientation,
    margin_top_cm: typeof srcPage.margin_top_cm === 'number' ? srcPage.margin_top_cm : def.page.margin_top_cm,
    margin_bottom_cm: typeof srcPage.margin_bottom_cm === 'number' ? srcPage.margin_bottom_cm : def.page.margin_bottom_cm,
    margin_left_cm: typeof srcPage.margin_left_cm === 'number' ? srcPage.margin_left_cm : def.page.margin_left_cm,
    margin_right_cm: typeof srcPage.margin_right_cm === 'number' ? srcPage.margin_right_cm : def.page.margin_right_cm,
    footer_enabled: typeof srcPage.footer_enabled === 'boolean' ? srcPage.footer_enabled : def.page.footer_enabled,
    footer_distance_cm: typeof srcPage.footer_distance_cm === 'number' ? srcPage.footer_distance_cm : def.page.footer_distance_cm,
    footer_font: typeof srcPage.footer_font === 'string' && srcPage.footer_font ? srcPage.footer_font : def.page.footer_font,
    footer_size: typeof srcPage.footer_size === 'string' && srcPage.footer_size ? srcPage.footer_size : def.page.footer_size,
    page_number_enabled: typeof srcPage.page_number_enabled === 'boolean' ? srcPage.page_number_enabled : def.page.page_number_enabled,
    page_number_format: typeof srcPage.page_number_format === 'string' && srcPage.page_number_format ? srcPage.page_number_format : def.page.page_number_format,
    cover_enabled: typeof srcPage.cover_enabled === 'boolean' ? srcPage.cover_enabled : def.page.cover_enabled,
    cover_title: typeof srcPage.cover_title === 'string' && srcPage.cover_title.trim() ? srcPage.cover_title.trim() : def.page.cover_title,
    cover_subtitle: typeof srcPage.cover_subtitle === 'string' ? srcPage.cover_subtitle.trim() : def.page.cover_subtitle,
    cover_company: typeof srcPage.cover_company === 'string' ? srcPage.cover_company.trim() : def.page.cover_company,
    cover_date: typeof srcPage.cover_date === 'string' ? srcPage.cover_date.trim() : def.page.cover_date,
    toc_enabled: typeof srcPage.toc_enabled === 'boolean' ? srcPage.toc_enabled : def.page.toc_enabled,
    toc_title: typeof srcPage.toc_title === 'string' && srcPage.toc_title.trim() ? srcPage.toc_title.trim() : def.page.toc_title,
    toc_depth: typeof srcPage.toc_depth === 'number' ? Math.max(1, Math.min(6, Math.round(srcPage.toc_depth))) : def.page.toc_depth,
    chapter_section_break_enabled: typeof srcPage.chapter_section_break_enabled === 'boolean' ? srcPage.chapter_section_break_enabled : def.page.chapter_section_break_enabled,
    header_enabled: typeof srcPage.header_enabled === 'boolean' ? srcPage.header_enabled : def.page.header_enabled,
    header_text: typeof srcPage.header_text === 'string' && srcPage.header_text ? srcPage.header_text : def.page.header_text,
    header_first_page_different: typeof srcPage.header_first_page_different === 'boolean' ? srcPage.header_first_page_different : def.page.header_first_page_different,
    header_first_page_text: typeof srcPage.header_first_page_text === 'string' ? srcPage.header_first_page_text : def.page.header_first_page_text,
    header_even_odd_different: typeof srcPage.header_even_odd_different === 'boolean' ? srcPage.header_even_odd_different : def.page.header_even_odd_different,
    header_even_text: typeof srcPage.header_even_text === 'string' ? srcPage.header_even_text : def.page.header_even_text,
    header_font: typeof srcPage.header_font === 'string' && srcPage.header_font ? srcPage.header_font : def.page.header_font,
    header_size: typeof srcPage.header_size === 'string' && srcPage.header_size ? srcPage.header_size : def.page.header_size,
    header_alignment: typeof srcPage.header_alignment === 'string' && srcPage.header_alignment ? srcPage.header_alignment : def.page.header_alignment,
    watermark_enabled: typeof srcPage.watermark_enabled === 'boolean' ? srcPage.watermark_enabled : def.page.watermark_enabled,
    watermark_text: typeof srcPage.watermark_text === 'string' && srcPage.watermark_text ? srcPage.watermark_text : def.page.watermark_text,
    watermark_font: typeof srcPage.watermark_font === 'string' && srcPage.watermark_font ? srcPage.watermark_font : def.page.watermark_font,
    watermark_size_pt: typeof srcPage.watermark_size_pt === 'number' ? Math.max(12, Math.min(120, srcPage.watermark_size_pt)) : def.page.watermark_size_pt,
    watermark_color: typeof srcPage.watermark_color === 'string' && /^[0-9a-f]{6}$/i.test(srcPage.watermark_color) ? srcPage.watermark_color.toUpperCase() : def.page.watermark_color,
    watermark_opacity: typeof srcPage.watermark_opacity === 'number' ? Math.max(0.05, Math.min(0.8, srcPage.watermark_opacity)) : def.page.watermark_opacity,
  };

  const srcHeadings = Array.isArray(source.headings) ? source.headings : [];
  const headings = def.headings.map((defH, i) => {
    const srcH = srcHeadings[i];
    if (!srcH || typeof srcH !== 'object') return { ...defH };
    return {
      font: typeof srcH.font === 'string' && srcH.font ? srcH.font : defH.font,
      size: typeof srcH.size === 'string' && srcH.size ? srcH.size : defH.size,
      alignment: typeof srcH.alignment === 'string' && srcH.alignment ? srcH.alignment : defH.alignment,
      spacing_before_pt: typeof srcH.spacing_before_pt === 'number' ? srcH.spacing_before_pt : defH.spacing_before_pt,
      spacing_after_pt: typeof srcH.spacing_after_pt === 'number' ? srcH.spacing_after_pt : defH.spacing_after_pt,
      first_line_indent_chars: typeof srcH.first_line_indent_chars === 'number' ? srcH.first_line_indent_chars : defH.first_line_indent_chars,
      line_spacing: typeof srcH.line_spacing === 'number' ? srcH.line_spacing : defH.line_spacing,
      numbering_format: typeof srcH.numbering_format === 'string' && VALID_NUMBERING_FORMATS.includes(srcH.numbering_format) ? srcH.numbering_format : defH.numbering_format,
    };
  });

  const srcBody = source.body_text && typeof source.body_text === 'object' ? source.body_text : {};
  const body_text = {
    font: typeof srcBody.font === 'string' && srcBody.font ? srcBody.font : def.body_text.font,
    size: typeof srcBody.size === 'string' && srcBody.size ? srcBody.size : def.body_text.size,
    alignment: typeof srcBody.alignment === 'string' && srcBody.alignment ? srcBody.alignment : def.body_text.alignment,
    spacing_before_pt: typeof srcBody.spacing_before_pt === 'number' ? srcBody.spacing_before_pt : def.body_text.spacing_before_pt,
    spacing_after_pt: typeof srcBody.spacing_after_pt === 'number' ? srcBody.spacing_after_pt : def.body_text.spacing_after_pt,
    first_line_indent_chars: typeof srcBody.first_line_indent_chars === 'number' ? srcBody.first_line_indent_chars : def.body_text.first_line_indent_chars,
    line_spacing_multiple: typeof srcBody.line_spacing_multiple === 'number' ? srcBody.line_spacing_multiple : def.body_text.line_spacing_multiple,
  };

  const srcTable = source.table && typeof source.table === 'object' ? source.table : {};
  const table = {
    header_fill_color: typeof srcTable.header_fill_color === 'string' && /^[0-9a-f]{6}$/i.test(srcTable.header_fill_color) ? srcTable.header_fill_color.toUpperCase() : def.table.header_fill_color,
    border_color: typeof srcTable.border_color === 'string' && /^[0-9a-f]{6}$/i.test(srcTable.border_color) ? srcTable.border_color.toUpperCase() : def.table.border_color,
    inside_border_color: typeof srcTable.inside_border_color === 'string' && /^[0-9a-f]{6}$/i.test(srcTable.inside_border_color) ? srcTable.inside_border_color.toUpperCase() : def.table.inside_border_color,
    cell_margin_twips: typeof srcTable.cell_margin_twips === 'number' ? Math.max(60, Math.min(360, Math.round(srcTable.cell_margin_twips))) : def.table.cell_margin_twips,
  };

  const srcImage = source.image && typeof source.image === 'object' ? source.image : {};
  const image = {
    max_width_px: typeof srcImage.max_width_px === 'number' ? Math.max(160, Math.min(960, Math.round(srcImage.max_width_px))) : def.image.max_width_px,
  };

  return { page, headings, body_text, table, image };
}

function normalizeConfig(config) {
  const source = config || {};
  const fileParser = source.file_parser ? source.file_parser : {};
  const hasTextProvider = Object.prototype.hasOwnProperty.call(source, 'text_model_provider');
  const rawTextProvider = typeof source.text_model_provider === 'string' ? source.text_model_provider : '';
  const sourceTextProvider = isTextModelProvider(rawTextProvider)
    ? rawTextProvider
    : '';
  const textModelProvider = sourceTextProvider || (hasTextProvider || config ? 'custom' : defaultConfig.text_model_provider);
  const textModelProfiles = normalizeTextModelProfiles(source.text_model_profiles);
  if (sourceTextProvider) {
    textModelProfiles[textModelProvider] = textProfileFromFlatConfig(source, textModelProfiles[textModelProvider], textModelProvider);
  } else if (textModelProvider === 'custom' && !hasTextModelProfileData(textModelProfiles.custom)) {
    textModelProfiles.custom = textProfileFromUnknownProvider(source, rawTextProvider, textModelProfiles.custom);
  }
  const activeTextProfile = textModelProfiles[textModelProvider];
  const sourceImageModel = source.image_model && typeof source.image_model === 'object' ? source.image_model : {};
  const sourceImageModelProvider = isImageModelProvider(sourceImageModel.provider) ? sourceImageModel.provider : '';
  const useSourceImageModel = sourceImageModelProvider && !isLegacyBlankImageModel(sourceImageModel);
  const imageModelProvider = useSourceImageModel
    ? sourceImageModelProvider
    : defaultConfig.image_model.provider;
  const imageModelProfiles = normalizeImageModelProfiles(source.image_model_profiles);
  imageModelProfiles[imageModelProvider] = normalizeImageModelProfile(imageModelProvider, useSourceImageModel ? sourceImageModel : null);
  const activeImageProfile = imageModelProfiles[imageModelProvider];
  const hasGpuHardwareAccelerationEnabled = typeof source.gpu_hardware_acceleration_enabled === 'boolean';
  const hasGpuHardwareAccelerationConfigured = typeof source.gpu_hardware_acceleration_configured === 'boolean';
  const gpuHardwareAccelerationConfigured = hasGpuHardwareAccelerationConfigured
    ? source.gpu_hardware_acceleration_configured
    : defaultConfig.gpu_hardware_acceleration_configured;
  const gpuHardwareAccelerationEnabled = gpuHardwareAccelerationConfigured === false
    ? defaultConfig.gpu_hardware_acceleration_enabled
    : hasGpuHardwareAccelerationEnabled ? source.gpu_hardware_acceleration_enabled : defaultConfig.gpu_hardware_acceleration_enabled;

  return {
    ...defaultConfig,
    language: normalizeDisplayLanguage(source.language),
    theme: normalizeAppTheme(source.theme),
    sidebar_layout: normalizeSidebarLayout(source.sidebar_layout),
    text_model_provider: textModelProvider,
    text_model_profiles: textModelProfiles,
    api_key: activeTextProfile.api_key,
    base_url: activeTextProfile.base_url,
    model_name: activeTextProfile.model_name,
    request_mode: activeTextProfile.request_mode,
    image_model: activeImageProfile,
    image_model_profiles: imageModelProfiles,
    file_parser: {
      provider: fileParser.provider || defaultConfig.file_parser.provider,
      mineru_token: fileParser.mineru_token || defaultConfig.file_parser.mineru_token,
    },
    update_channel: normalizeUpdateChannel(source.update_channel),
    gpu_hardware_acceleration_enabled: gpuHardwareAccelerationEnabled,
    gpu_hardware_acceleration_configured: gpuHardwareAccelerationConfigured === false ? true : gpuHardwareAccelerationConfigured,
    export_format: normalizeExportFormat(source.export_format),
    developer_mode: source.developer_mode === undefined ? defaultConfig.developer_mode : Boolean(source.developer_mode),
    analytics_client_id: source.analytics_client_id || defaultConfig.analytics_client_id,
    analytics_created_at: source.analytics_created_at || defaultConfig.analytics_created_at,
  };
}

function createConfigStore(app) {
  const configFile = getConfigFilePath(app);

  function persist(config) {
    let tempFile = '';
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    try {
      tempFile = `${configFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tempFile, configFile);
    } catch (error) {
      if (tempFile) {
        try { fs.rmSync(tempFile, { force: true }); } catch {}
      }
      throw error;
    }
  }

  function withAnalyticsIdentity(config) {
    if (config.analytics_client_id && config.analytics_created_at) {
      return config;
    }

    return {
      ...config,
      analytics_client_id: config.analytics_client_id || createAnalyticsClientId(),
      analytics_created_at: config.analytics_created_at || createAnalyticsCreatedAt(),
    };
  }

  return {
    getConfigFilePath() {
      return configFile;
    },

    load() {
      if (!fs.existsSync(configFile)) {
        const config = withAnalyticsIdentity(normalizeConfig());
        persist(config);
        return config;
      }

      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const parsedConfig = JSON.parse(raw);
        const config = normalizeConfig(parsedConfig);
        const nextConfig = withAnalyticsIdentity(config);
        if (JSON.stringify(parsedConfig) !== JSON.stringify(nextConfig)) {
          persist(nextConfig);
        }
        return nextConfig;
      } catch (error) {
        throw new Error(`配置文件读取失败：${error.message}`);
      }
    },

    save(config) {
      try {
        const currentConfig = fs.existsSync(configFile)
          ? normalizeConfig(JSON.parse(fs.readFileSync(configFile, 'utf-8')))
          : normalizeConfig();
        const nextConfig = withAnalyticsIdentity(normalizeConfig({
          ...currentConfig,
          ...config,
          text_model_profiles: {
            ...currentConfig.text_model_profiles,
            ...(config && config.text_model_profiles ? config.text_model_profiles : {}),
          },
          image_model_profiles: {
            ...currentConfig.image_model_profiles,
            ...(config && config.image_model_profiles ? config.image_model_profiles : {}),
          },
          analytics_client_id: config?.analytics_client_id || currentConfig.analytics_client_id,
          analytics_created_at: config?.analytics_created_at || currentConfig.analytics_created_at,
        }));
        persist(nextConfig);
        return { success: true, message: '配置已保存', config_path: configFile };
      } catch (error) {
        throw new Error(`配置文件保存失败：${error.message}`);
      }
    },
  };
}

module.exports = {
  createConfigStore,
};
