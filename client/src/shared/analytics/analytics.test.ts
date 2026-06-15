import { afterEach, describe, expect, it, vi } from 'vitest';

function createYibiaoMock() {
  return {
    platform: 'darwin',
    getVersion: vi.fn(async () => '0.1.0-test'),
    config: {
      load: vi.fn(async () => ({
        analytics_client_id: 'client-001',
        analytics_created_at: '2026-06-15',
      })),
      save: vi.fn(),
    },
  };
}

async function loadAnalytics(fetchMock = vi.fn(async () => new Response('{}'))) {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'yibiao', {
    configurable: true,
    writable: true,
    value: createYibiaoMock(),
  });
  return import('./analytics');
}

function readFetchBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analytics privacy guardrails', () => {
  it('tracks only stable page ids and rejects local path shaped page values', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    const analytics = await loadAnalytics(fetchMock);

    analytics.trackPageView('technical-plan/content-edit');
    analytics.trackPageView('/Users/jack/投标文件.docx');
    analytics.trackPageView('C:\\Users\\jack\\Desktop\\prompt.md');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(readFetchBody(fetchMock)).toMatchObject({
      event: 'page_view',
      page: 'technical-plan/content-edit',
      projectName: 'yibiao-client',
    });
  });

  it('does not send arbitrary config payload fields or path shaped resource keys', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    const analytics = await loadAnalytics(fetchMock);

    analytics.trackConfigUsage({
      file_parser_provider: 'local',
      prompt: '请完整生成投标正文',
      local_path: '/Users/jack/项目/投标文件.docx',
      file_name: '投标文件.docx',
    } as never);
    analytics.trackResourceClick('../资源/投标文件.docx');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = readFetchBody(fetchMock);
    expect(body).toMatchObject({
      event: 'config_usage',
      config_key: 'fileParserProviders',
      config_value: 'local',
    });
    expect(JSON.stringify(body)).not.toContain('/Users/jack');
    expect(JSON.stringify(body)).not.toContain('投标文件.docx');
    expect(JSON.stringify(body)).not.toContain('请完整生成投标正文');
  });

  it('tracks only fixed business bid action values', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    const analytics = await loadAnalytics(fetchMock);

    analytics.trackBusinessBidAction('export_word');
    analytics.trackConfigUsage({
      business_bid_action: '/Users/jack/项目/商务条款.docx',
    } as never);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(readFetchBody(fetchMock)).toMatchObject({
      event: 'config_usage',
      config_key: 'businessBidActions',
      config_value: 'export_word',
    });
  });
});
