import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://analytics.agnet.top/**', async (route) => {
    await route.fulfill({
      status: 204,
      body: '',
    });
  });
});

async function expectDarkSurface(page: Page, selector: string) {
  const background = await page.locator(selector).first().evaluate((element) => {
    return window.getComputedStyle(element).backgroundColor;
  });
  expect(background, `${selector} should use the dark theme surface`).toBe('rgb(22, 32, 51)');
}

test('loads the desktop renderer shell and opens the first workflow menu', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/易标投标工具箱/);
  await expect(page.getByRole('navigation', { name: '主菜单' })).toBeVisible();
  await expect(page.getByRole('button', { name: '标书生成' })).toBeVisible();
  await expect(page.getByLabel('标书生成二级菜单')).toBeVisible();
  await expect(page.getByRole('button', { name: /生成技术方案/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /已有方案扩写/ })).toBeVisible();
});

test('opens the AI evaluation workbench from the secondary menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /AI评标/ }).click();

  await expect(page.getByRole('heading', { name: '评分办法抽取、自评打分和证据复核' })).toBeVisible();
  await expect(page.getByRole('button', { name: '从技术方案生成评分表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入投标文件匹配证据' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'AI 结构化抽取评分项' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出自评报告' })).toBeDisabled();
  await expect(page.getByText('暂无 AI 评标评分表')).toBeVisible();
});

test('opens the duplicate check workbench from the secondary menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /标书查重/ }).click();

  await expect(page.getByRole('heading', { name: '选择标书' })).toBeVisible();
  await expect(page.getByText('招标文件', { exact: true })).toBeVisible();
  await expect(page.getByText('投标文件', { exact: true })).toBeVisible();
  await expect(page.getByLabel('标书查重工具条')).toBeVisible();
});

test('opens duplicate check results and triggers PDF report export', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      tenderFile: {
        id: 'tender-1',
        file_name: '招标文件.docx',
        file_path: '/tmp/招标文件.docx',
        extension: '.docx',
        size: 2048,
        modified_at: '2026-06-15T09:00:00.000Z',
      },
      bidFiles: [{
        id: 'bid-1',
        file_name: '投标文件A.docx',
        file_path: '/tmp/投标文件A.docx',
        extension: '.docx',
        size: 1024,
        modified_at: '2026-06-15T10:00:00.000Z',
      }],
      step: 'analysis',
      activeAnalysisTab: 'content',
      metadataAnalysis: {
        status: 'success',
        progress: 100,
        message: '元数据分析完成',
        signature: 'test-signature',
        contentExtraction: { status: 'success', completed: 1, total: 1 },
        metadataExtraction: { status: 'success', completed: 1, total: 1 },
        files: [],
        rows: [],
        contentFiles: [],
      },
      outlineAnalysis: {
        status: 'success',
        progress: 100,
        message: '目录分析完成',
        signature: 'test-signature',
        tenderSentenceCount: 0,
        tenderMatchedItemCount: 0,
        extraction: { status: 'success', completed: 1, total: 1 },
        files: [],
        duplicateGroups: [],
        pairwiseSimilarities: [],
      },
      contentAnalysis: {
        status: 'success',
        progress: 100,
        message: '正文比对完成',
        signature: 'test-signature',
        tenderSentenceCount: 0,
        tenderMatchedSentenceCount: 0,
        totalSentenceCount: 1,
        extraction: { status: 'success', completed: 1, total: 1 },
        duplicateSentences: [{
          id: 'C000001',
          sentence: '项目团队提供驻场服务。',
          normalized: '项目团队提供驻场服务。',
          file_ids: ['bid-1'],
          occurrences: { 'bid-1': 2 },
          first_order: 1,
          resolution_status: 'pending',
        }],
      },
      imageAnalysis: {
        status: 'success',
        progress: 100,
        message: '图片比对完成',
        signature: 'test-signature',
        extraction: { status: 'success', completed: 1, total: 1 },
        totalImageCount: 0,
        files: [],
        duplicateImages: [],
      },
      contentIgnoreRules: [{
        rule_id: 'RULE-001',
        pattern: '固定模板声明。',
        normalized: '固定模板声明。',
        category: 'boilerplate',
        created_at: '2026-06-15T00:00:00.000Z',
        updated_at: '2026-06-15T00:00:00.000Z',
      }],
    };
    window.__duplicateExportCalls = [];
    window.__duplicateRuleExportCalls = [];
    window.__duplicateRuleImportCalls = [];
    window.yibiao = {
      platform: 'test',
      getVersion: async () => '0.1.0-test',
      openExternal: async () => ({ success: true }),
      config: {
        load: async () => ({}),
        save: async (config) => ({ success: true, config }),
      },
      duplicateCheck: {
        loadState: async () => state,
        saveUiState: async () => state,
        saveFiles: async () => state,
        updateState: async () => state,
        resolveItem: async () => state,
        batchHandleItems: async () => state,
        saveContentIgnoreRule: async () => state,
        deleteContentIgnoreRule: async () => state,
        exportContentIgnoreRules: async (payload) => {
          window.__duplicateRuleExportCalls.push(payload);
          return { success: true, message: '已导出 1 条正文忽略规则', filePath: '/tmp/duplicate-rules.json', ruleCount: 1 };
        },
        importContentIgnoreRules: async (payload) => {
          window.__duplicateRuleImportCalls.push(payload);
          return { success: true, message: '已导入 1 条正文忽略规则', filePath: '/tmp/duplicate-rules.json', importedCount: 1, skippedCount: 0, state };
        },
        exportReport: async (payload) => {
          window.__duplicateExportCalls.push(payload);
          return { success: true, message: '标书查重 PDF 报告已导出', format: 'pdf', filePath: '/tmp/duplicate.pdf', bytes: 2048 };
        },
        clear: async () => ({ success: true, state }),
      },
      file: {
        selectDuplicateCheckFiles: async () => ({ tenderFile: null, bidFiles: [] }),
      },
      tasks: {
        onTaskEvent: () => () => {},
        getActiveTasks: async () => [],
        startDuplicateAnalysis: async () => ({}),
      },
    };
    window.yibiaoClient = { appName: '易标投标工具箱', platform: 'test' };
  });

  await page.goto('/');
  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /标书查重/ }).click();

  await expect(page.getByRole('heading', { name: '查重结果', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeVisible();
  await page.getByRole('button', { name: '导出 PDF' }).click();
  await page.getByRole('button', { name: '导出规则' }).click();
  await page.getByRole('button', { name: '导入规则' }).click();

  await expect.poll(async () => page.evaluate(() => window.__duplicateExportCalls?.length || 0)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__duplicateExportCalls?.[0]?.format)).toBe('pdf');
  await expect.poll(async () => page.evaluate(() => window.__duplicateRuleExportCalls?.length || 0)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__duplicateRuleImportCalls?.length || 0)).toBe(1);
});

test('opens the rejection check workbench from the secondary menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /废标项检查/ }).click();

  await expect(page.getByText('等待招标文件')).toBeVisible();
  await expect(page.getByText('等待投标文件')).toBeVisible();
  await expect(page.getByRole('button', { name: '从技术方案读取' })).toBeVisible();
  await expect(page.getByLabel('废标项检查工具条')).toBeVisible();
});

test('opens rejection check results and triggers PDF report export', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      tenderDocument: {
        id: 'tender',
        role: 'tender',
        fileName: '招标文件.docx',
        content: '未提供授权书将废标。',
        source: 'upload',
        importedAt: '2026-06-15T10:00:00.000Z',
      },
      bidDocuments: [{
        id: 'bid-1',
        role: 'bid',
        fileName: '投标文件A.docx',
        content: '# 投标文件\n## 授权文件\n授权书将在中标后补充。',
        source: 'upload',
        importedAt: '2026-06-15T10:10:00.000Z',
      }],
      activeDocumentTab: 'tender',
      step: 'results',
      activeResultTab: 'analysis',
      activeCheckResultTab: 'rejection',
      invalidBidAndRejectionItems: { status: 'success', content: '- 未提供授权书将废标。' },
      customCheckItems: '',
      checkOptions: { rejectionCheck: true, typoCheck: true, logicCheck: true },
      rejectionCheckResult: {
        status: 'success',
        findings: [{
          id: 'risk-1',
          bidDocumentId: 'bid-1',
          type: 'rejectionItem',
          severity: 'high',
          title: '授权书缺失',
          summary: '授权书未按招标文件要求提供。',
          requirement: '未提供授权书将废标。',
          bidEvidence: '授权书将在中标后补充。',
          riskReason: '授权书没有随投标文件提交。',
          suggestion: '补充有效授权书。',
        }],
      },
      typoCheckResult: { status: 'success', findings: [] },
      logicCheckResult: { status: 'success', findings: [] },
    };
    window.__rejectionExportCalls = [];
    window.yibiao = {
      platform: 'test',
      getVersion: async () => '0.1.0-test',
      openExternal: async () => ({ success: true }),
      config: {
        load: async () => ({}),
        save: async (config) => ({ success: true, config }),
      },
      rejectionCheck: {
        loadState: async () => state,
        saveUiState: async () => state,
        updateState: async () => state,
        resolveFinding: async () => state,
        batchHandleFindings: async () => state,
        importDocument: async () => ({ success: false, state }),
        importTenderFromTechnicalPlan: async () => ({ success: false, state }),
        removeDocument: async () => state,
        exportReport: async (payload) => {
          window.__rejectionExportCalls.push(payload);
          return { success: true, message: '废标项检查 PDF 报告已导出', format: 'pdf', filePath: '/tmp/rejection.pdf', bytes: 2048 };
        },
        clear: async () => ({ success: true, state }),
      },
      tasks: {
        onTaskEvent: () => () => {},
        getActiveTasks: async () => [],
        startRejectionItemsExtraction: async () => ({}),
        startRejectionCheck: async () => ({}),
      },
    };
    window.yibiaoClient = { appName: '易标投标工具箱', platform: 'test' };
  });

  await page.goto('/');
  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /废标项检查/ }).click();

  await expect(page.getByRole('heading', { name: '检查结果', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeVisible();
  await page.getByRole('button', { name: '导出 PDF' }).click();

  await expect.poll(async () => page.evaluate(() => window.__rejectionExportCalls?.length || 0)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__rejectionExportCalls?.[0]?.format)).toBe('pdf');
});

test('opens the business bid workbench from the secondary menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /商务标/ }).click();

  await expect(page.getByRole('heading', { name: '商务响应矩阵和偏离确认' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入商务标招标文件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '从技术方案生成矩阵' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 结构化提取' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出 Markdown' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出 Excel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导入报价附件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入资信证明' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入其他附件' })).toBeVisible();
  await expect(page.getByText('暂无独立附件')).toBeVisible();
  await expect(page.getByText('暂无商务响应矩阵')).toBeVisible();
});

test('opens the bid opportunity workbench from the main navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '投标机会' }).click();

  await expect(page.getByRole('heading', { name: '公告录入、字段解析和投前判断' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入公告文件' })).toBeVisible();
  await expect(page.getByRole('button', { name: '读取公告 URL' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '解析并保存' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出投标建议报告' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '导出提醒日历' })).toBeDisabled();
  await expect(page.getByText('暂无机会')).toBeVisible();
});

test('opens resources from the main navigation and shows resource details', async ({ page }) => {
  await page.route('https://analytics.agnet.top/resources**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        resources: [
          {
            id: 'template-1',
            title: '投标文件结构模板',
            description: '用于快速搭建投标文件章节。',
            tags: ['模板', '技术标'],
            modalContent: '## 下载说明\n请按项目需要复制模板。',
            imageUrl: '',
            analyticsKey: 'template-1',
            clickCount: 12,
          },
        ],
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '资源下载' }).click();

  await expect(page.getByRole('heading', { name: '精选资源' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看资源：投标文件结构模板' })).toBeVisible();
  await expect(page.getByText('累计点击 12 次')).toBeVisible();

  await page.getByRole('button', { name: '查看资源：投标文件结构模板' }).click();
  await expect(page.getByRole('dialog', { name: '投标文件结构模板' })).toBeVisible();
  await expect(page.getByText('下载说明')).toBeVisible();
});

test('opens export format header controls from the main navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导出格式' }).click();

  await expect(page.getByRole('heading', { name: 'Word 文档排版与编号格式' })).toBeVisible();
  await expect(page.getByText('启用后会写入 Word 页眉')).toBeVisible();
  await expect(page.getByText('暂未支持')).toHaveCount(0);
});

test('applies settings theme and compact sidebar layout controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  await expect(page.getByText('简体中文', { exact: true })).toBeVisible();
  await page.getByLabel('应用主题').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByLabel('侧边栏布局').selectOption('compact');
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
});

test('keeps historical workbench panels dark when dark theme is active', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('应用主题').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: '资源下载' }).click();
  await expect(page.getByRole('heading', { name: '精选资源' })).toBeVisible();
  await expectDarkSurface(page, '.resources-shelf-panel');

  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /标书查重/ }).click();
  await expect(page.getByRole('heading', { name: '选择标书' })).toBeVisible();
  await expectDarkSurface(page, '.duplicate-upload-board');

  await page.getByRole('button', { name: '标书检查' }).click();
  await page.getByRole('button', { name: /废标项检查/ }).click();
  await expect(page.getByRole('heading', { name: '选择标书' })).toBeVisible();
  await expect(page.getByLabel('废标项检查工具条')).toBeVisible();
  await expectDarkSurface(page, '.rejection-upload-board');

  await page.getByRole('button', { name: '设置' }).click();
  const developerMode = page.getByRole('checkbox', { name: /开发者模式/ });
  if (!(await developerMode.isChecked())) {
    await developerMode.click();
  }
  await page.getByRole('button', { name: '测试页' }).click();
  await page.getByRole('button', { name: /Json请求测试/ }).click();
  await expect(page.getByRole('heading', { name: 'Json请求测试' })).toBeVisible();
  await expectDarkSurface(page, '.developer-test-panel');
});

test('guards project workspace switching while tasks are running and confirms restart-scoped switch', async ({ page }) => {
  await page.addInitScript(() => {
    const defaultProject = {
      id: 'default',
      name: '默认项目',
      description: '兼容旧版单例工作区 userData/workspace。',
      status: 'active',
      is_default: true,
      is_active: true,
      workspace_path: '/userData/workspace',
      created_at: '2026-06-15T09:00:00.000Z',
      updated_at: '2026-06-15T09:00:00.000Z',
    };
    const projectA = {
      id: 'project-a',
      name: '医院后勤投标',
      description: '独立项目工作区',
      status: 'active',
      is_default: false,
      is_active: false,
      workspace_path: '/userData/projects/project-a/workspace',
      created_at: '2026-06-15T10:00:00.000Z',
      updated_at: '2026-06-15T10:00:00.000Z',
    };
    let activeProjectId = 'default';
    let activeTasks = [{ task_id: 'task-1', type: 'technical-plan', status: 'running', progress: 30 }];
    const buildState = () => ({
      active_project_id: activeProjectId,
      projects_dir: '/userData/projects',
      projects: [defaultProject, projectA].map((project) => ({ ...project, is_active: project.id === activeProjectId })),
    });
    const textProfile = {
      api_key: '',
      base_url: 'https://api.jinlong.com/v1',
      model_name: 'gpt-3.5-turbo',
      request_mode: 'stream',
    };
    const imageProfile = {
      provider: 'jinlong',
      api_key: '',
      base_url: 'https://api.jinlong.com/v1',
      model_name: 'gpt-image-1',
      request_mode: 'normal',
      status: 'untested',
    };
    const clientConfig = {
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
    window.__projectSetActiveCalls = [];
    window.__projectDuplicateCalls = [];
    window.__projectExportCalls = [];
    window.__projectImportCalls = [];
    window.__setProjectTasksIdle = () => {
      activeTasks = [];
    };
    window.yibiao = {
      platform: 'test',
      getVersion: async () => '0.1.0-test',
      openExternal: async () => ({ success: true }),
      onUpdateProgress: () => () => {},
      onUpdateDownloaded: () => () => {},
      onUpdateError: () => () => {},
      checkUpdate: async () => ({ updateAvailable: false, message: '已是最新版本' }),
      config: {
        load: async () => clientConfig,
        save: async (config) => ({ success: true, config }),
        listModels: async () => ({ success: true, message: 'ok', models: [] }),
      },
      projectWorkspace: {
        list: async () => buildState(),
        create: async () => ({ success: true, project: projectA, state: buildState() }),
        setActive: async (projectId) => {
          window.__projectSetActiveCalls.push(projectId);
          activeProjectId = projectId;
          return { success: true, active_project_id: projectId, restart_required: true, state: buildState() };
        },
        archive: async () => ({ success: true, state: buildState() }),
        delete: async () => ({ success: true, state: buildState() }),
        duplicate: async (projectId, payload) => {
          window.__projectDuplicateCalls.push({ projectId, payload });
          return { success: true, project: { ...projectA, id: 'project-copy', name: payload?.name || '项目副本' }, state: buildState() };
        },
        exportPackage: async (projectId, packageDir) => {
          window.__projectExportCalls.push({ projectId, packageDir });
          return { success: true, package_dir: packageDir };
        },
        importPackage: async (packageDir, payload) => {
          window.__projectImportCalls.push({ packageDir, payload });
          return { success: true, project: { ...projectA, id: 'project-imported', name: '导入项目' }, state: buildState() };
        },
        getWorkspacePath: async (projectId) => ({ project_id: projectId || activeProjectId, workspace_path: `/userData/projects/${projectId || activeProjectId}/workspace` }),
      },
      tasks: {
        getActiveTasks: async () => activeTasks,
        onTaskEvent: () => () => {},
      },
    };
    window.yibiaoClient = { appName: '易标投标工具箱', platform: 'test' };
  });

  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  await expect(page.getByText('项目工作区', { exact: true })).toBeVisible();
  await expect(page.getByText('当前项目：默认项目。切换项目会在重启后加载对应工作区数据。')).toBeVisible();
  await expect(page.getByText('医院后勤投标')).toBeVisible();

  await page.getByRole('button', { name: '设为当前' }).click();
  await expect(page.getByText('当前还有 1 个后台任务运行中，请等待任务完成后再切换或删除项目。')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__projectSetActiveCalls?.length || 0)).toBe(0);

  await page.evaluate(() => window.__setProjectTasksIdle?.());
  await page.getByLabel('项目包导出目录').fill('/tmp/yibiao-project-package');
  await page.getByLabel('项目包导入目录').fill('/tmp/imported-yibiao-project');

  const projectList = page.getByLabel('项目工作区列表');
  await projectList.getByRole('button', { name: '复制' }).first().click();
  await expect.poll(async () => page.evaluate(() => window.__projectDuplicateCalls?.[0]?.projectId)).toBe('default');
  await projectList.getByRole('button', { name: '导出' }).first().click();
  await expect.poll(async () => page.evaluate(() => window.__projectExportCalls?.[0]?.packageDir)).toBe('/tmp/yibiao-project-package');
  await page.getByRole('button', { name: '导入项目包' }).click();
  await expect.poll(async () => page.evaluate(() => window.__projectImportCalls?.[0]?.packageDir)).toBe('/tmp/imported-yibiao-project');

  await page.getByRole('button', { name: '设为当前' }).click();
  await expect(page.getByRole('dialog', { name: '切换项目' })).toBeVisible();
  await expect(page.getByText('切换后需要重启应用')).toBeVisible();
  await page.getByRole('button', { name: '确认切换' }).click();

  await expect.poll(async () => page.evaluate(() => window.__projectSetActiveCalls?.[0])).toBe('project-a');
  await expect(page.getByText('当前项目：医院后勤投标。切换项目会在重启后加载对应工作区数据。')).toBeVisible();
});

test('shows LM Studio as an API-keyless local text model provider', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('tab', { name: '文本模型' }).click();

  await page.getByLabel('服务提供商').selectOption('lm-studio');
  await expect(page.locator('input[value="http://127.0.0.1:1234/v1"]')).toBeVisible();
  await expect(page.getByPlaceholder('当前服务商不需要填写 API Key')).toBeDisabled();
  await expect(page.getByText('从 LM Studio Local Server 拉取')).toBeVisible();

  await page.getByLabel('服务提供商').selectOption('jan');
  await expect(page.locator('input[value="http://127.0.0.1:1337/v1"]')).toBeVisible();
  await expect(page.getByPlaceholder('当前服务商不需要填写 API Key')).toBeDisabled();
  await expect(page.getByText('从 Jan Server 拉取')).toBeVisible();
});

test('opens the image knowledge base workbench from the secondary menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '知识库' }).click();
  await page.getByRole('button', { name: /图片知识库/ }).click();

  await expect(page.getByRole('heading', { name: '图片素材、图示和资质扫描件管理' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传图片' })).toBeVisible();
  await expect(page.getByLabel('图片批量管理')).toContainText('已选择 0 张');
  await expect(page.getByRole('button', { name: '批量设置分类' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '批量设置文件夹' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '批量追加标签' })).toBeDisabled();
  await expect(page.getByText('暂无图片素材')).toBeVisible();
});

test('opens the real prompt lab in developer mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  const developerMode = page.getByRole('checkbox', { name: /开发者模式/ });
  if (!(await developerMode.isChecked())) {
    await developerMode.click();
  }
  await page.getByRole('button', { name: '测试页' }).click();
  await page.getByRole('button', { name: /Prompt调试台/ }).click();

  await expect(page.getByRole('heading', { name: 'Prompt调试台' })).toBeVisible();
  await expect(page.getByText('变量注入后的消息')).toBeVisible();
  await expect(page.getByText(/项目名称：易标测试项目/)).toBeVisible();
});

test('opens the export dry-run preview in developer mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  const developerMode = page.getByRole('checkbox', { name: /开发者模式/ });
  if (!(await developerMode.isChecked())) {
    await developerMode.click();
  }
  await page.getByRole('button', { name: '测试页' }).click();
  await page.getByRole('button', { name: /导出链路预演/ }).click();

  await expect(page.getByRole('heading', { name: '导出链路预演' })).toBeVisible();
  await expect(page.getByText('真实 Word dry-run')).toBeVisible();
  await expect(page.getByText('需桌面环境')).toBeVisible();
});

test('opens the generic JSON request lab in developer mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  const developerMode = page.getByRole('checkbox', { name: /开发者模式/ });
  if (!(await developerMode.isChecked())) {
    await developerMode.click();
  }
  await page.getByRole('button', { name: '测试页' }).click();
  await page.getByRole('button', { name: /Json请求测试/ }).click();

  await expect(page.getByRole('heading', { name: 'Json请求测试' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '目录生成' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '全局事实' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '废标项检查' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '商务标条款' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '投标机会' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'AI 评标' })).toBeVisible();
  await expect(page.getByText('失败样本', { exact: true })).toBeVisible();
  await expect(page.getByText('校验问题', { exact: true })).toBeVisible();
  await expect(page.getByText('已保存失败样本', { exact: true })).toBeVisible();
  await expect(page.getByText('开发者日志回放', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: '废标项检查' }).click();
  await expect(page.getByText(/"schemaName": "rejection-findings"/)).toBeVisible();
  await expect(page.getByText(/第三轮：补充与定稿/)).toBeVisible();
});
