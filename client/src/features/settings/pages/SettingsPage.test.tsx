import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import type { ClientConfig } from '../../../shared/types';
import SettingsPage from './SettingsPage';

const textProfile = {
  api_key: '',
  base_url: 'https://jlaudeapi.com/v1',
  model_name: 'gpt-3.5-turbo',
  request_mode: 'stream' as const,
};

const imageProfile = {
  provider: 'jinlong' as const,
  base_url: 'https://jlaudeapi.com/v1',
  api_key: '',
  model_name: '',
  request_mode: 'stream' as const,
  status: 'untested' as const,
  tested_at: '',
  last_error: '',
};

const baseConfig: ClientConfig = {
  language: 'zh-CN',
  theme: 'system',
  sidebar_layout: 'classic',
  text_model_provider: 'jinlong',
  text_model_profiles: {
    jinlong: textProfile,
    volcengine: { ...textProfile, base_url: 'https://ark.cn-beijing.volces.com/api/v3', model_name: '' },
    deepseek: { ...textProfile, base_url: 'https://api.deepseek.com', model_name: '' },
    longcat: { ...textProfile, base_url: 'https://api.longcat.chat/openai/v1', model_name: '' },
    'codex-cli': { ...textProfile, base_url: 'local-codex-cli', model_name: 'gpt-5.5', request_mode: 'normal' },
    'local-gemma': { ...textProfile, base_url: 'http://127.0.0.1:11434/v1', model_name: 'gemma4:31b', request_mode: 'normal' },
    'local-qwen': { ...textProfile, base_url: 'http://127.0.0.1:11434/v1', model_name: 'qwen3.6:27b', request_mode: 'normal' },
    'lm-studio': { ...textProfile, base_url: 'http://127.0.0.1:1234/v1', model_name: '', request_mode: 'normal' },
    vllm: { ...textProfile, base_url: 'http://127.0.0.1:8000/v1', model_name: '', request_mode: 'normal' },
    'llama-cpp': { ...textProfile, base_url: 'http://127.0.0.1:8080/v1', model_name: '', request_mode: 'normal' },
    jan: { ...textProfile, base_url: 'http://127.0.0.1:1337/v1', model_name: '', request_mode: 'normal' },
    custom: { ...textProfile, base_url: '', model_name: '' },
  },
  api_key: textProfile.api_key,
  base_url: textProfile.base_url,
  model_name: textProfile.model_name,
  request_mode: textProfile.request_mode,
  image_model: imageProfile,
  image_model_profiles: {
    jinlong: imageProfile,
    volcengine: { ...imageProfile, provider: 'volcengine', base_url: 'https://ark.cn-beijing.volces.com/api/v3' },
    'codex-gpt-image': { ...imageProfile, provider: 'codex-gpt-image', base_url: 'https://api.openai.com/v1', model_name: 'gpt-image-2', request_mode: 'normal' },
    'google-ai-studio': { ...imageProfile, provider: 'google-ai-studio', base_url: 'https://generativelanguage.googleapis.com/v1beta', model_name: 'gemini-3.1-flash-image-preview' },
    custom: { ...imageProfile, provider: 'custom', base_url: '' },
  },
  file_parser: {
    provider: 'local',
    mineru_token: '',
  },
  update_channel: 'github',
  gpu_hardware_acceleration_enabled: true,
  gpu_hardware_acceleration_configured: true,
  developer_mode: false,
};

const projectWorkspaceState = {
  version: 1,
  active_project_id: 'default',
  registry_path: '/userData/projects/projects.json',
  projects_dir: '/userData/projects',
  projects: [
    {
      id: 'default',
      name: '默认项目',
      description: '',
      status: 'active' as const,
      source: 'default',
      created_at: '2026-06-15T00:00:00.000Z',
      updated_at: '2026-06-15T00:00:00.000Z',
      archived_at: null,
      is_default: true,
      is_active: true,
      workspace_path: '/userData/workspace',
    },
    {
      id: 'project-1',
      name: '医院后勤投标',
      description: '独立项目',
      status: 'active' as const,
      source: 'created',
      created_at: '2026-06-15T01:00:00.000Z',
      updated_at: '2026-06-15T01:00:00.000Z',
      archived_at: null,
      is_default: false,
      is_active: false,
      workspace_path: '/userData/projects/project-1/workspace',
    },
  ],
};

function renderPage(onAppearanceChange = vi.fn()) {
  return {
    onAppearanceChange,
    ...render(
      <Tooltip.Provider>
        <ToastProvider>
          <SettingsPage onAppearanceChange={onAppearanceChange} />
        </ToastProvider>
      </Tooltip.Provider>,
    ),
  };
}

describe('SettingsPage appearance settings', () => {
  beforeEach(() => {
    window.yibiao = ({
      config: {
        load: vi.fn().mockResolvedValue(baseConfig),
        save: vi.fn().mockResolvedValue({ success: true, message: '已保存' }),
        listModels: vi.fn().mockResolvedValue({ success: true, message: 'ok', models: [] }),
      },
      getVersion: vi.fn().mockResolvedValue('0.1.0'),
      onUpdateProgress: vi.fn(() => () => undefined),
      onUpdateDownloaded: vi.fn(() => () => undefined),
      onUpdateError: vi.fn(() => () => undefined),
      tasks: {
        getActiveTasks: vi.fn().mockResolvedValue([]),
      },
      projectWorkspace: {
        list: vi.fn().mockResolvedValue(projectWorkspaceState),
        create: vi.fn().mockResolvedValue({
          success: true,
          restart_required: false,
          runtime_reloaded: true,
          project: { ...projectWorkspaceState.projects[1], id: 'project-2', name: '新建投标项目' },
          state: {
            ...projectWorkspaceState,
            active_project_id: 'project-2',
            projects: [
              ...projectWorkspaceState.projects.map((project) => ({ ...project, is_active: false })),
              { ...projectWorkspaceState.projects[1], id: 'project-2', name: '新建投标项目', is_active: true },
            ],
          },
        }),
        setActive: vi.fn().mockResolvedValue({
          success: true,
          active_project_id: 'project-1',
          restart_required: false,
          runtime_reloaded: true,
          state: {
            ...projectWorkspaceState,
            active_project_id: 'project-1',
            projects: projectWorkspaceState.projects.map((project) => ({ ...project, is_active: project.id === 'project-1' })),
          },
        }),
        archive: vi.fn().mockResolvedValue({ success: true, state: projectWorkspaceState }),
        delete: vi.fn().mockResolvedValue({ success: true, state: projectWorkspaceState }),
        duplicate: vi.fn().mockResolvedValue({
          success: true,
          project: { ...projectWorkspaceState.projects[1], id: 'project-copy', name: '医院后勤投标 副本' },
          state: {
            ...projectWorkspaceState,
            projects: [
              ...projectWorkspaceState.projects,
              { ...projectWorkspaceState.projects[1], id: 'project-copy', name: '医院后勤投标 副本', is_active: false },
            ],
          },
        }),
        exportPackage: vi.fn().mockResolvedValue({ success: true, package_dir: '/tmp/yibiao-project-package', manifest_path: '/tmp/yibiao-project-package/project.json' }),
        importPackage: vi.fn().mockResolvedValue({
          success: true,
          project: { ...projectWorkspaceState.projects[1], id: 'project-imported', name: '导入项目' },
          state: {
            ...projectWorkspaceState,
            projects: [
              ...projectWorkspaceState.projects,
              { ...projectWorkspaceState.projects[1], id: 'project-imported', name: '导入项目', is_active: false },
            ],
          },
        }),
        getWorkspacePath: vi.fn(),
      },
    } as unknown) as typeof window.yibiao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<typeof window>).yibiao;
  });

  it('saves theme and compact sidebar layout into client config', async () => {
    const { onAppearanceChange } = renderPage();

    expect(await screen.findByText('简体中文')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('应用主题'), { target: { value: 'dark' } });
    await waitFor(() => expect(screen.getByLabelText('应用主题')).toHaveValue('dark'));
    expect(onAppearanceChange).toHaveBeenCalledWith({ theme: 'dark', sidebarLayout: 'classic' });

    fireEvent.change(screen.getByLabelText('侧边栏布局'), { target: { value: 'compact' } });
    await waitFor(() => expect(screen.getByLabelText('侧边栏布局')).toHaveValue('compact'));
    expect(onAppearanceChange).toHaveBeenCalledWith({ theme: 'dark', sidebarLayout: 'compact' });

    const saveButton = screen.getByRole('button', { name: '保存' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.yibiao?.config.save).toHaveBeenCalledWith(expect.objectContaining({
        language: 'zh-CN',
        theme: 'dark',
        sidebar_layout: 'compact',
      }));
    });
  });

  it('saves LM Studio as an API-keyless local text model provider', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: '文本模型' }));
    fireEvent.change(screen.getByLabelText('服务提供商'), { target: { value: 'lm-studio' } });

    await waitFor(() => expect(screen.getByLabelText('服务提供商')).toHaveValue('lm-studio'));
    expect(screen.getByDisplayValue('http://127.0.0.1:1234/v1')).toBeDisabled();
    expect(screen.getByPlaceholderText('当前服务商不需要填写 API Key')).toBeDisabled();

    const saveButton = screen.getByRole('button', { name: '保存' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.yibiao?.config.save).toHaveBeenCalledWith(expect.objectContaining({
        text_model_provider: 'lm-studio',
        api_key: '',
        base_url: 'http://127.0.0.1:1234/v1',
        request_mode: 'normal',
      }));
    });
  });

  it('saves Jan as an API-keyless local OpenAI-compatible text model provider', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: '文本模型' }));
    fireEvent.change(screen.getByLabelText('服务提供商'), { target: { value: 'jan' } });

    await waitFor(() => expect(screen.getByLabelText('服务提供商')).toHaveValue('jan'));
    expect(screen.getByDisplayValue('http://127.0.0.1:1337/v1')).toBeDisabled();
    expect(screen.getByPlaceholderText('当前服务商不需要填写 API Key')).toBeDisabled();
    expect(screen.getByText('本地 Jan Server OpenAI 兼容接口地址，默认使用 127.0.0.1:1337')).toBeInTheDocument();
    expect(screen.getByText('从 Jan Server 拉取，或手动填写已加载模型名称')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: '保存' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(window.yibiao?.config.save).toHaveBeenCalledWith(expect.objectContaining({
        text_model_provider: 'jan',
        api_key: '',
        base_url: 'http://127.0.0.1:1337/v1',
        request_mode: 'normal',
      }));
    });
  });

  it('shows local OCR as the scanning and OFD parser path instead of local text parsing', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: '文件解析' }));

    expect(screen.getByRole('option', { name: '本地 OCR 解析' })).toBeInTheDocument();
    expect(screen.getByText('pdf、docx、doc、wps、txt、md')).toBeInTheDocument();
    expect(screen.getByText('pdf、ofd、jpeg、png、bmp、webp、tif')).toBeInTheDocument();
    expect(screen.getByText(/扫描件、图片和 OFD 先走本地 OCR/)).toBeInTheDocument();
    expect(screen.getByText(/PaddleOCR/)).toBeInTheDocument();
  });

  it('loads project workspace list and creates a new active project', async () => {
    renderPage();

    expect(await screen.findByText('项目工作区')).toBeInTheDocument();
    expect(screen.getByText('当前项目：默认项目。切换项目会热刷新当前会话的工作区数据。')).toBeInTheDocument();
    expect(screen.getByText('医院后勤投标')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('新项目名称'), { target: { value: '新建投标项目' } });
    fireEvent.click(screen.getByRole('button', { name: '新建并切换' }));

    await waitFor(() => {
      expect(window.yibiao?.projectWorkspace.create).toHaveBeenCalledWith({ name: '新建投标项目', makeActive: true });
    });
    expect(await screen.findByText('当前项目：新建投标项目。切换项目会热刷新当前会话的工作区数据。')).toBeInTheDocument();
  });

  it('confirms project switch after checking active tasks', async () => {
    renderPage();

    expect(await screen.findByText('医院后勤投标')).toBeInTheDocument();
    const switchButtons = screen.getAllByRole('button', { name: '设为当前' });
    fireEvent.click(switchButtons[0]);

    expect(await screen.findByRole('dialog')).toHaveTextContent('切换项目');
    fireEvent.click(screen.getByRole('button', { name: '确认切换' }));

    await waitFor(() => {
      expect(window.yibiao?.tasks.getActiveTasks).toHaveBeenCalled();
      expect(window.yibiao?.projectWorkspace.setActive).toHaveBeenCalledWith('project-1');
    });
    expect(await screen.findByText('当前项目：医院后勤投标。切换项目会热刷新当前会话的工作区数据。')).toBeInTheDocument();
  });

  it('blocks project switching while background tasks are running', async () => {
    window.yibiao!.tasks.getActiveTasks = vi.fn().mockResolvedValue([{ id: 'task-1' }]);
    renderPage();

    expect(await screen.findByText('医院后勤投标')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '设为当前' })[0]);

    await waitFor(() => {
      expect(window.yibiao?.projectWorkspace.setActive).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('duplicates, exports, and imports project packages from the project workspace panel', async () => {
    renderPage();

    expect(await screen.findByText('医院后勤投标')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('项目包导出目录'), { target: { value: '/tmp/yibiao-project-package' } });
    fireEvent.change(screen.getByLabelText('项目包导入目录'), { target: { value: '/tmp/imported-yibiao-project' } });

    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0]);
    await waitFor(() => {
      expect(window.yibiao?.projectWorkspace.duplicate).toHaveBeenCalledWith('default', { name: '默认项目 副本', makeActive: false });
    });

    fireEvent.click(screen.getAllByRole('button', { name: '导出' })[0]);
    await waitFor(() => {
      expect(window.yibiao?.projectWorkspace.exportPackage).toHaveBeenCalledWith('default', '/tmp/yibiao-project-package');
    });

    fireEvent.click(screen.getByRole('button', { name: '导入项目包' }));
    await waitFor(() => {
      expect(window.yibiao?.projectWorkspace.importPackage).toHaveBeenCalledWith('/tmp/imported-yibiao-project', { makeActive: false });
    });
  });
});
