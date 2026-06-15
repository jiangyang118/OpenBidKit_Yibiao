import type { ClientConfig } from '../types/config';

const ANALYTICS_ENDPOINT = 'https://analytics.agnet.top/track';
const PROJECT_NAME = 'yibiao-client';
const LEGACY_CLIENT_ID_KEY = 'analytics_client_id';

type AnalyticsEvent = 'app_open' | 'page_view' | 'config_usage' | 'resource_click';
export type BusinessBidAnalyticsAction =
  | 'import_tender_document'
  | 'generate_matrix_from_technical_plan'
  | 'start_ai_extraction'
  | 'confirm_clause'
  | 'export_markdown'
  | 'export_word'
  | 'export_excel';

interface AnalyticsIdentity {
  clientId: string;
  clientCreatedAt: string;
}

interface ConfigUsagePayload {
  file_parser_provider?: string;
  image_provider?: string;
  image_model_status?: string;
  bid_analysis_mode?: string;
  outline_mode?: string;
  table_requirement?: string;
  use_mermaid_images?: boolean;
  use_ai_images?: boolean;
  content_concurrency?: number;
  content_generation_action?: string;
  business_bid_action?: BusinessBidAnalyticsAction;
  minimum_words?: number;
  enable_consistency_audit?: boolean;
  enable_original_plan_coverage_audit?: boolean;
}

const configUsageFields: Array<[keyof ConfigUsagePayload, string]> = [
  ['file_parser_provider', 'fileParserProviders'],
  ['image_provider', 'imageProviders'],
  ['image_model_status', 'imageModelStatuses'],
  ['bid_analysis_mode', 'bidAnalysisModes'],
  ['outline_mode', 'outlineModes'],
  ['table_requirement', 'tableRequirements'],
  ['use_mermaid_images', 'useMermaidImages'],
  ['use_ai_images', 'useAiImages'],
  ['content_concurrency', 'contentConcurrencies'],
  ['content_generation_action', 'contentGenerationActions'],
  ['business_bid_action', 'businessBidActions'],
  ['minimum_words', 'minimumWords'],
  ['enable_consistency_audit', 'enableConsistencyAudit'],
  ['enable_original_plan_coverage_audit', 'enableOriginalPlanCoverageAudit'],
];

const PAGE_ID_PATTERN = /^[a-zA-Z0-9/_-]{1,120}$/;
const RESOURCE_KEY_PATTERN = /^[a-zA-Z0-9._:-]{1,80}$/;
const BUSINESS_BID_ACTIONS = new Set<BusinessBidAnalyticsAction>([
  'import_tender_document',
  'generate_matrix_from_technical_plan',
  'start_ai_extraction',
  'confirm_clause',
  'export_markdown',
  'export_word',
  'export_excel',
]);

let appOpenTracked = false;
let lastTrackedPage = '';
let versionPromise: Promise<string> | null = null;
let identityPromise: Promise<AnalyticsIdentity> | null = null;

function getLegacyClientId() {
  try {
    return localStorage.getItem(LEGACY_CLIENT_ID_KEY) || '';
  } catch {
    return '';
  }
}

function removeLegacyClientId() {
  try {
    localStorage.removeItem(LEGACY_CLIENT_ID_KEY);
  } catch {
    // 埋点迁移失败不影响主流程。
  }
}

async function migrateLegacyClientId(config: ClientConfig) {
  const legacyClientId = getLegacyClientId();
  if (!legacyClientId) {
    return config;
  }

  if (config.analytics_client_id === legacyClientId) {
    removeLegacyClientId();
    return config;
  }

  const migratedConfig: ClientConfig = {
    ...config,
    analytics_client_id: legacyClientId,
  };

  try {
    const result = await window.yibiao?.config.save(migratedConfig);
    if (result?.success) {
      removeLegacyClientId();
      return migratedConfig;
    }
  } catch {
    // 保存失败时保留旧 localStorage，后续启动继续尝试迁移。
  }

  return migratedConfig;
}

function getAnalyticsIdentity() {
  if (!identityPromise) {
    identityPromise = window.yibiao?.config.load()
      .then((config) => migrateLegacyClientId(config))
      .then((config) => ({
        clientId: config?.analytics_client_id || '',
        clientCreatedAt: config?.analytics_created_at || '',
      }))
      .catch(() => ({ clientId: '', clientCreatedAt: '' })) || Promise.resolve({ clientId: '', clientCreatedAt: '' });
  }

  return identityPromise;
}

function getPlatform() {
  return window.yibiao?.platform || window.yibiaoClient?.platform || '';
}

function getVersion() {
  if (!versionPromise) {
    versionPromise = window.yibiao?.getVersion?.().catch(() => '') || Promise.resolve('');
  }

  return versionPromise;
}

function booleanText(value: boolean | undefined) {
  if (value === undefined) return undefined;
  return value ? 'true' : 'false';
}

function normalizeBusinessBidAction(value: unknown) {
  const action = String(value || '').trim() as BusinessBidAnalyticsAction;
  return BUSINESS_BID_ACTIONS.has(action) ? action : undefined;
}

function buildBaseConfigUsage(config?: ClientConfig | null): ConfigUsagePayload {
  return {
    file_parser_provider: config?.file_parser?.provider,
    image_provider: config?.image_model?.provider,
    image_model_status: config?.image_model?.status || undefined,
  };
}

function normalizeUsagePayload(payload: ConfigUsagePayload) {
  return {
    ...payload,
    use_mermaid_images: booleanText(payload.use_mermaid_images),
    use_ai_images: booleanText(payload.use_ai_images),
    enable_consistency_audit: booleanText(payload.enable_consistency_audit),
    enable_original_plan_coverage_audit: booleanText(payload.enable_original_plan_coverage_audit),
    business_bid_action: normalizeBusinessBidAction(payload.business_bid_action),
  };
}

function configUsageValueText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizePageId(page: string) {
  const normalizedPage = String(page || '').trim();
  return PAGE_ID_PATTERN.test(normalizedPage) ? normalizedPage : '';
}

function sendAnalytics(event: AnalyticsEvent, page = '', payload: Record<string, unknown> = {}) {
  void Promise.all([getVersion(), getAnalyticsIdentity()]).then(([version, identity]) => {
    fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName: PROJECT_NAME,
        event,
        page,
        version,
        platform: getPlatform(),
        arch: '',
        client_id: identity.clientId,
        client_created_at: identity.clientCreatedAt,
        ...payload,
      }),
    }).catch(() => undefined);
  }).catch(() => undefined);
}

export function trackAppOpen() {
  if (appOpenTracked) return;
  appOpenTracked = true;
  sendAnalytics('app_open');
}

export function trackPageView(page: string) {
  const normalizedPage = normalizePageId(page);
  if (!normalizedPage || normalizedPage === lastTrackedPage) return;

  lastTrackedPage = normalizedPage;
  sendAnalytics('page_view', normalizedPage);
}

export function trackConfigUsage(payload: ConfigUsagePayload = {}, config?: ClientConfig | null) {
  const send = (loadedConfig?: ClientConfig | null) => {
    const usagePayload = normalizeUsagePayload({
      ...buildBaseConfigUsage(loadedConfig),
      ...payload,
    });

    for (const [payloadKey, configKey] of configUsageFields) {
      const configValue = configUsageValueText(usagePayload[payloadKey]);
      if (!configValue) continue;
      sendAnalytics('config_usage', '', {
        config_key: configKey,
        config_value: configValue,
      });
    }
  };

  if (config) {
    send(config);
    return;
  }

  void window.yibiao?.config.load()
    .then((loadedConfig) => send(loadedConfig))
    .catch(() => send(null));
}

export function trackBusinessBidAction(action: BusinessBidAnalyticsAction) {
  if (!BUSINESS_BID_ACTIONS.has(action)) return;
  trackConfigUsage({ business_bid_action: action });
}

export function trackResourceClick(resourceKey: string) {
  const key = resourceKey.trim();
  if (!RESOURCE_KEY_PATTERN.test(key)) return;

  sendAnalytics('resource_click', 'resources', { resource_key: key });
}
