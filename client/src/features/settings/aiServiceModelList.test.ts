// @vitest-environment node

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createAiService } = require('../../../electron/services/aiService.cjs') as {
  createAiService: (deps: { app: unknown; configStore: { load: () => Record<string, unknown> } }) => {
    listModels: (config?: Record<string, unknown>) => Promise<{ success: boolean; message: string; models: string[] }>;
  };
};

function createService() {
  return createAiService({
    app: {},
    configStore: {
      load: () => ({}),
    },
  });
}

describe('aiService model list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads Ollama models from api/tags for local Ollama providers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: 'gemma3:12b' },
        { model: 'qwen3:8b' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService().listModels({
      text_model_provider: 'local-gemma',
      base_url: 'http://127.0.0.1:11434/v1',
      api_key: '',
    });

    expect(result).toEqual({
      success: true,
      message: 'Ollama 模型列表已更新',
      models: ['gemma3:12b', 'qwen3:8b'],
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', { method: 'GET' });
  });

  it('loads LM Studio models from OpenAI-compatible models endpoint without API key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'qwen3-30b-a3b-instruct-mlx' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService().listModels({
      text_model_provider: 'lm-studio',
      base_url: 'http://127.0.0.1:1234/v1',
      api_key: '',
    });

    expect(result.models).toEqual(['qwen3-30b-a3b-instruct-mlx']);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:1234/v1/models', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it.each([
    ['vllm', 'http://127.0.0.1:8000/v1', 'Qwen/Qwen3-32B'],
    ['llama-cpp', 'http://127.0.0.1:8080/v1', 'qwen3-8b-q4_k_m.gguf'],
    ['jan', 'http://127.0.0.1:1337/v1', 'qwen3-30b-a3b'],
  ])('loads %s models from OpenAI-compatible models endpoint without API key', async (provider, baseUrl, modelId) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: modelId },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService().listModels({
      text_model_provider: provider,
      base_url: baseUrl,
      api_key: '',
    });

    expect(result).toEqual({
      success: true,
      message: '模型列表已更新',
      models: [modelId],
    });
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
