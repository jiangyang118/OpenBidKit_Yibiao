import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type { BidDocumentAssetRef, BidDocumentBuildLog, BidDocumentPaymentTerm, BidDocumentProjectData, BidDocumentQuoteItem, BidDocumentReferenceAlignmentResult, BidDocumentState, BidDocumentTemplate } from '../types';

type BidDocumentWorkflowStep = 'template' | 'project-data' | 'assets' | 'preview' | 'build';
type ReadinessExportPaths = {
  readinessReady?: boolean;
  markdownPath?: string;
  jsonPath?: string;
  xlsxPath?: string;
};
type AssetPackageStatus = {
  mode: 'export' | 'import';
  readinessReady?: boolean;
  validationPassed?: boolean;
  outputDir?: string;
  packageDir?: string;
  markdownPath?: string;
  manifestPath?: string;
  manifestSchemaPath?: string;
  quoteResolutionPath?: string;
  quoteResolutionSchemaPath?: string;
  assetsDir?: string;
  assetCount?: number;
  demoOnlyAssetCount?: number;
  replacementRequiredAssetCount?: number;
  appliedCount?: number;
  missingRequiredCount?: number;
  quoteResolutionApplied?: boolean;
  quoteResolutionAction?: string;
  quoteResolutionErrors?: string[];
};

const workflowSteps: Array<{ id: BidDocumentWorkflowStep; label: string; meta: string }> = [
  { id: 'template', label: '模板选择', meta: '结构' },
  { id: 'project-data', label: '项目数据', meta: '报价' },
  { id: 'assets', label: '附件资产', meta: '材料' },
  { id: 'preview', label: '模板预览', meta: '章节' },
  { id: 'build', label: '生成与校验', meta: 'Word' },
];

function templateHeroDescription(template: BidDocumentTemplate) {
  if (template.id === 'smart-canteen-response') {
    return '当前以智慧食堂响应文件模板作为蓝本，核心数据由模板包和项目实例驱动，不在生成器内写死项目事实。';
  }
  return `当前使用${template.name}，可按项目配置、报价、附件映射和模板章节生成完整响应文件。`;
}

const buildCheckLabels: Array<[keyof BidDocumentBuildLog, string]> = [
  ['templateCheck', '模板定义校验'],
  ['quoteCheck', '报价校验'],
  ['paymentCheck', '付款条款校验'],
  ['titleCheck', '标题校验'],
  ['identityCheck', '项目主体校验'],
  ['forbiddenWordsCheck', '禁用词校验'],
  ['assetCheck', '附件校验'],
  ['sectionSelectionCheck', '章节启用校验'],
  ['sectionCheck', '章节校验'],
  ['docxOpenCheck', 'docx 打开校验'],
  ['docxContentCheck', 'docx 内容校验'],
  ['docxSectionOrderCheck', 'docx 章节顺序校验'],
  ['docxTableCheck', 'docx 表格校验'],
  ['docxQuoteIntegrityCheck', 'docx 报价与付款完整性校验'],
  ['docxLayoutCheck', 'docx 页面与页码校验'],
  ['docxTocCheck', 'docx 目录字段校验'],
  ['docxStyleCheck', 'docx 标题与表头样式校验'],
  ['docxTechnicalDensityCheck', 'docx 技术方案密度校验'],
  ['docxPageBreakCheck', 'docx 分页校验'],
  ['imageInsertionCheck', '图片插入校验'],
  ['docxAssetPlacementCheck', 'docx 附件排版校验'],
  ['docxForbiddenWordsCheck', 'Word 禁用词复检'],
];

const importCheckLabels: Array<[keyof BidDocumentBuildLog, string]> = [
  ['quoteResolutionCheck', '报价决策校验'],
];

function formatMoney(value: number) {
  return `${Number(value || 0).toFixed(2)} 元`;
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatQuoteDifferenceLabel(value: number) {
  const difference = roundMoney(value);
  if (!difference) return '报价一致';
  return `${difference > 0 ? '分项少' : '分项多'} ${formatMoney(Math.abs(difference))}`;
}

function countMissingAssets(state: BidDocumentState | null) {
  if (!state) return 0;
  return Object.values(state.assetMap || {}).filter((asset) => asset.required && !asset.filePath && isAssetSectionEnabled(state, asset)).length;
}

function isNotRunCheck(result?: { errors?: string[] }) {
  return Boolean(result?.errors?.length === 1 && result.errors[0] === 'not_run');
}

function CheckRow({ label, result }: { label: string; result?: { passed: boolean; errors?: string[] } }) {
  const notRun = isNotRunCheck(result);
  const status = result ? (result.passed ? '通过' : notRun ? '未运行' : '未通过') : '未运行';
  const statusClass = result?.passed ? 'is-passed' : notRun ? 'is-not-run' : result ? 'is-failed' : '';
  const errors = notRun ? [] : result?.errors || [];
  return (
    <div className={`bid-document-check-row ${statusClass}`}>
      <strong>{label}</strong>
      <span>{status}</span>
      {errors.length ? <small>{errors.slice(0, 3).join('；')}</small> : null}
    </div>
  );
}

function AssetPackageStatusCard({ status }: { status: AssetPackageStatus }) {
  const title = status.mode === 'export'
    ? `最近材料包：${status.readinessReady ? '可正式构建' : '仍有阻断项'}`
    : `最近材料包导入：${status.validationPassed ? '校验通过' : '仍有阻断项'}`;
  const quoteStatus = status.mode === 'import'
    ? status.quoteResolutionApplied
      ? `报价决策已应用：${status.quoteResolutionAction || '未命名动作'}`
      : status.quoteResolutionAction
        ? `报价决策未应用：${status.quoteResolutionAction}`
        : '报价决策未填写或未应用'
    : null;
  return (
    <div className="bid-document-export-paths" aria-label="最近材料包状态">
      <strong>{title}</strong>
      {status.outputDir ? <span>输出目录：{status.outputDir}</span> : null}
      {status.packageDir ? <span>导入目录：{status.packageDir}</span> : null}
      {status.markdownPath ? <span>收集清单：{status.markdownPath}</span> : null}
      {status.manifestPath ? <span>材料清单：{status.manifestPath}</span> : null}
      {status.manifestSchemaPath ? <span>材料清单 Schema：{status.manifestSchemaPath}</span> : null}
      {status.quoteResolutionPath ? <span>报价决策：{status.quoteResolutionPath}</span> : null}
      {status.quoteResolutionSchemaPath ? <span>报价决策 Schema：{status.quoteResolutionSchemaPath}</span> : null}
      {status.assetsDir ? <span>附件目录：{status.assetsDir}</span> : null}
      {typeof status.assetCount === 'number' ? <span>材料项：{status.assetCount}</span> : null}
      {typeof status.demoOnlyAssetCount === 'number' ? <span>演示附件：{status.demoOnlyAssetCount}</span> : null}
      {typeof status.replacementRequiredAssetCount === 'number' ? <span>需替换演示附件：{status.replacementRequiredAssetCount}</span> : null}
      {typeof status.appliedCount === 'number' ? <span>已回填附件：{status.appliedCount}</span> : null}
      {typeof status.missingRequiredCount === 'number' ? <span>缺失必填材料：{status.missingRequiredCount}</span> : null}
      {quoteStatus ? <span>{quoteStatus}</span> : null}
      {status.quoteResolutionErrors?.length ? <span>报价决策错误：{status.quoteResolutionErrors.join('；')}</span> : null}
    </div>
  );
}

function parseNumberInput(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sectionLevelLabel(level: number) {
  if (level === 0) return '封面/目录';
  if (level === 1) return '一级章节';
  if (level === 2) return '二级章节';
  return '三级章节';
}

function assetTypeLabel(type: BidDocumentAssetRef['type']) {
  if (type === 'document') return '原始文件';
  if (type === 'scan') return '扫描件';
  return '图片';
}

function isAssetSectionEnabled(state: BidDocumentState, asset: BidDocumentAssetRef) {
  const disabledSectionIds = new Set(state.projectData.disabledSectionIds || []);
  const sectionById = new Map(state.template.sections.map((section) => [section.id, section]));
  let section = sectionById.get(asset.sectionId);
  const visited = new Set<string>();
  while (section) {
    if (disabledSectionIds.has(section.id)) return false;
    if (!section.parentId || visited.has(section.id)) return true;
    visited.add(section.id);
    section = sectionById.get(section.parentId);
  }
  return true;
}

function BidDocumentPage() {
  const { showToast } = useToast();
  const [state, setState] = useState<BidDocumentState | null>(null);
  const [buildLog, setBuildLog] = useState<BidDocumentBuildLog | null>(null);
  const [referenceAlignment, setReferenceAlignment] = useState<BidDocumentReferenceAlignmentResult | null>(null);
  const [lastReadinessExport, setLastReadinessExport] = useState<ReadinessExportPaths | null>(null);
  const [lastAssetPackage, setLastAssetPackage] = useState<AssetPackageStatus | null>(null);
  const [busy, setBusy] = useState<'load' | 'save' | 'validate' | 'export' | 'asset' | 'align' | 'template-info' | 'project-config' | 'readiness-report' | 'asset-package' | null>('load');
  const [activeStep, setActiveStep] = useState<BidDocumentWorkflowStep>('template');

  useEffect(() => {
    let canceled = false;
    const loader = window.yibiao?.bidDocument?.loadState;
    if (!loader) {
      setBusy(null);
      showToast('当前环境不支持完整标书生成，请在桌面客户端中使用', 'error');
      return;
    }
    loader()
      .then((nextState) => {
        if (canceled) return;
        setState(nextState);
        setBuildLog(nextState.lastBuildLog || null);
      })
      .catch((error) => {
        if (!canceled) showToast(error instanceof Error ? error.message : '完整标书加载失败', 'error');
      })
      .finally(() => {
        if (!canceled) setBusy(null);
      });
    return () => {
      canceled = true;
    };
  }, [showToast]);

  const quoteTotal = useMemo(() => (state?.quoteItems || []).reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0), [state]);
  const quoteDifference = roundMoney((state?.projectData.totalWithTax || 0) - quoteTotal);
  const missingAssets = countMissingAssets(state);
  const activeStepIndex = workflowSteps.findIndex((step) => step.id === activeStep);
  const goToAdjacentStep = (direction: -1 | 1) => {
    const nextIndex = Math.min(Math.max(activeStepIndex + direction, 0), workflowSteps.length - 1);
    setActiveStep(workflowSteps[nextIndex].id);
  };

  const updateProjectData = (patch: Partial<BidDocumentProjectData>) => {
    setState((current) => current ? {
      ...current,
      projectData: {
        ...current.projectData,
        ...patch,
      },
    } : current);
  };

  const updateTaxPolicy = (patch: Partial<BidDocumentProjectData['taxPolicy']>) => {
    setState((current) => current ? {
      ...current,
      projectData: {
        ...current.projectData,
        taxPolicy: {
          ...current.projectData.taxPolicy,
          ...patch,
        },
      },
    } : current);
  };

  const toggleOptionalSection = (sectionId: string, enabled: boolean) => {
    setState((current) => {
      if (!current) return current;
      const disabledSectionIds = new Set(current.projectData.disabledSectionIds || []);
      if (enabled) {
        disabledSectionIds.delete(sectionId);
      } else {
        disabledSectionIds.add(sectionId);
      }
      return {
        ...current,
        projectData: {
          ...current.projectData,
          disabledSectionIds: [...disabledSectionIds],
        },
      };
    });
  };

  const updateQuoteItem = (index: number, patch: Partial<BidDocumentQuoteItem>) => {
    setState((current) => current ? {
      ...current,
      quoteItems: current.quoteItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    } : current);
  };

  const addQuoteItem = () => {
    setState((current) => current ? {
      ...current,
      quoteItems: [
        ...current.quoteItems,
        {
          name: '',
          quantity: 1,
          brandModel: '',
          unitPriceWithTax: 0,
          totalWithTax: 0,
          category: 'other',
        },
      ],
    } : current);
  };

  const removeQuoteItem = (index: number) => {
    setState((current) => current ? {
      ...current,
      quoteItems: current.quoteItems.filter((_item, itemIndex) => itemIndex !== index),
    } : current);
  };

  const updatePaymentTerm = (index: number, patch: Partial<BidDocumentPaymentTerm>) => {
    setState((current) => current ? {
      ...current,
      projectData: {
        ...current.projectData,
        paymentTerms: current.projectData.paymentTerms.map((term, termIndex) => termIndex === index ? { ...term, ...patch } : term),
      },
    } : current);
  };

  const addPaymentTerm = () => {
    setState((current) => current ? {
      ...current,
      projectData: {
        ...current.projectData,
        paymentTerms: [
          ...current.projectData.paymentTerms,
          { stage: '', ratio: 0, text: '' },
        ],
      },
    } : current);
  };

  const removePaymentTerm = (index: number) => {
    setState((current) => current ? {
      ...current,
      projectData: {
        ...current.projectData,
        paymentTerms: current.projectData.paymentTerms.filter((_term, termIndex) => termIndex !== index),
      },
    } : current);
  };

  const handleTemplateChange = async (templateId: string) => {
    if (!state) return;
    const nextTemplate = state.templates.find((template) => template.id === templateId) || state.template;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge) {
      setState({
        ...state,
        template: nextTemplate,
        projectData: {
          ...state.projectData,
          templateId: nextTemplate.id,
        },
      });
      return;
    }

    setBusy('save');
    try {
      const nextState = await bridge.saveState({ templateId: nextTemplate.id });
      setState(nextState);
      setBuildLog(nextState.lastBuildLog || null);
      showToast('模板包已切换并保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模板包切换失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const buildPayload = (nextState: BidDocumentState) => ({
    template: nextState.template,
    projectData: nextState.projectData,
    quoteItems: nextState.quoteItems,
    assetMap: nextState.assetMap,
    assetPackage: nextState.assetPackage || null,
  });

  const handleSaveDraft = async (nextState = state) => {
    if (!nextState) return null;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge) {
      showToast('当前环境不支持保存完整标书草稿，请在桌面客户端中使用', 'error');
      return null;
    }
    setBusy('save');
    try {
      const savedState = await bridge.saveState(buildPayload(nextState));
      setState(savedState);
      setBuildLog(savedState.lastBuildLog || null);
      showToast('完整标书草稿已保存', 'success');
      return savedState;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '完整标书草稿保存失败', 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleValidate = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge) {
      showToast('当前环境不支持完整标书校验，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('validate');
    try {
      const result = await bridge.validate(buildPayload(state));
      setBuildLog(result.buildLog);
      showToast(result.success ? '完整标书校验通过' : '完整标书校验未通过，请查看构建日志', result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '完整标书校验失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge) {
      showToast('当前环境不支持完整标书导出，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('export');
    try {
      const result = await bridge.exportWord(buildPayload(state));
      setBuildLog(result.buildLog);
      if (result.success) setReferenceAlignment(null);
      showToast(result.message, result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '完整标书导出失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleReferenceAlignment = async () => {
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.analyzeReference) {
      showToast('当前环境不支持参考响应文件对齐，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('align');
    try {
      const result = await bridge.analyzeReference({
        candidatePath: buildLog?.outputPath,
      });
      setReferenceAlignment(result);
      showToast(result.message, result.success ? 'success' : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '参考响应文件对齐失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleExportTemplateInfo = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.exportTemplateInfo) {
      showToast('当前环境不支持导出模板配置，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('template-info');
    try {
      const result = await bridge.exportTemplateInfo({ templateId: state.template.id });
      showToast(result.message, result.success ? 'success' : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模板配置导出失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleExportProjectConfig = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.exportProjectConfig) {
      showToast('当前环境不支持导出项目配置，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('project-config');
    try {
      const result = await bridge.exportProjectConfig(buildPayload(state));
      showToast(result.message, result.success ? 'success' : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '项目配置导出失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleExportReadinessReport = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.exportReadinessReport) {
      showToast('当前环境不支持导出准备度报告，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('readiness-report');
    try {
      const result = await bridge.exportReadinessReport(buildPayload(state));
      setBuildLog(result.buildLog);
      if (result.success) {
        setLastAssetPackage(null);
        setLastReadinessExport({
          readinessReady: result.readinessReady,
          markdownPath: result.markdownPath,
          jsonPath: result.jsonPath,
          xlsxPath: result.xlsxPath,
        });
        setActiveStep('build');
      }
      showToast(result.message, result.success ? (result.readinessReady ? 'success' : 'info') : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '准备度报告导出失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleExportAssetCollectionPackage = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.exportAssetCollectionPackage) {
      showToast('当前环境不支持导出材料收集包，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('asset-package');
    try {
      const result = await bridge.exportAssetCollectionPackage(buildPayload(state));
      setBuildLog(result.buildLog);
      if (result.success) {
        setLastReadinessExport(null);
        setLastAssetPackage({
          mode: 'export',
          readinessReady: result.readinessReady,
          outputDir: result.outputDir,
          markdownPath: result.markdownPath,
          manifestPath: result.manifestPath,
          manifestSchemaPath: result.manifestSchemaPath,
          quoteResolutionPath: result.quoteResolutionPath,
          quoteResolutionSchemaPath: result.quoteResolutionSchemaPath,
          assetsDir: result.assetsDir,
          assetCount: result.assetCount,
          demoOnlyAssetCount: result.demoOnlyAssetCount,
          replacementRequiredAssetCount: result.replacementRequiredAssetCount,
        });
        setActiveStep('build');
      }
      showToast(result.message, result.success ? (result.readinessReady ? 'success' : 'info') : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '材料收集包导出失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleImportAssetCollectionPackage = async () => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.importAssetCollectionPackage) {
      showToast('当前环境不支持导入材料收集包，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('asset-package');
    try {
      const result = await bridge.importAssetCollectionPackage(buildPayload(state));
      if (result.buildLog) {
        setBuildLog(result.buildLog);
      }
      if (result.success && result.state) {
        setState(result.state);
        setBuildLog(result.buildLog || result.state.lastBuildLog || null);
        setReferenceAlignment(null);
        setLastReadinessExport(null);
        setLastAssetPackage({
          mode: 'import',
          validationPassed: result.validationPassed,
          packageDir: result.packageDir,
          manifestPath: result.manifestPath,
          manifestSchemaPath: result.manifestSchemaPath,
          quoteResolutionPath: result.quoteResolutionPath,
          appliedCount: result.appliedCount,
          missingRequiredCount: result.missingRequiredCount,
          quoteResolutionApplied: result.quoteResolutionApplied,
          quoteResolutionAction: result.quoteResolutionAction,
          quoteResolutionErrors: result.quoteResolutionErrors,
        });
        setActiveStep('assets');
      } else if (result.buildLog && !result.canceled) {
        setActiveStep('build');
      }
      showToast(result.message, result.success ? (result.validationPassed ? 'success' : 'info') : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '材料收集包导入失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleImportProjectConfig = async () => {
    const bridge = window.yibiao?.bidDocument;
    if (!bridge?.importProjectConfig) {
      showToast('当前环境不支持导入项目配置，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('project-config');
    try {
      const result = await bridge.importProjectConfig();
      if (result.buildLog) {
        setBuildLog(result.buildLog);
      }
      if (result.success && result.state) {
        setState(result.state);
        setBuildLog(result.buildLog || result.state.lastBuildLog || null);
        setReferenceAlignment(null);
        setLastReadinessExport(null);
        setLastAssetPackage(null);
        setActiveStep('project-data');
      } else if (result.buildLog && !result.canceled) {
        setActiveStep('build');
      }
      showToast(result.message, result.success ? 'success' : result.canceled ? 'info' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '项目配置导入失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleSelectAsset = async (asset: BidDocumentAssetRef) => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    if (!bridge) {
      showToast('当前环境不支持选择附件，请在桌面客户端中使用', 'error');
      return;
    }
    setBusy('asset');
    try {
      const result = await bridge.selectAsset({ key: asset.key, title: asset.title, type: asset.type });
      if (result.success && result.filePath) {
        const nextState = {
          ...state,
          assetMap: {
            ...state.assetMap,
            [asset.key]: {
              ...state.assetMap[asset.key],
              filePath: result.filePath,
            },
          },
        };
        setState(nextState);
        await bridge.saveState(buildPayload(nextState));
        showToast('附件路径已写入映射并保存', 'success');
      } else {
        showToast(result.message || '已取消选择', 'info');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择附件失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleClearAsset = async (asset: BidDocumentAssetRef) => {
    if (!state) return;
    const bridge = window.yibiao?.bidDocument;
    const nextState = {
      ...state,
      assetMap: {
        ...state.assetMap,
        [asset.key]: {
          ...state.assetMap[asset.key],
          filePath: '',
        },
      },
    };
    setState(nextState);
    if (!bridge) return;
    setBusy('save');
    try {
      await bridge.saveState(buildPayload(nextState));
      showToast('附件映射已清空并保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '附件映射保存失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!state) {
    return (
      <div className="bid-document-page">
        <section className="bid-document-hero">
          <span className="section-kicker">完整标书</span>
          <h1>通用标书生成器</h1>
          <p>{busy === 'load' ? '正在加载模板包...' : '暂无可用模板。'}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="bid-document-page">
      <section className="bid-document-hero">
        <div>
          <span className="section-kicker">完整标书</span>
          <h1>通用标书生成器</h1>
          <p>{templateHeroDescription(state.template)}</p>
        </div>
        <div className="bid-document-actions">
          <button type="button" onClick={() => handleSaveDraft()} disabled={Boolean(busy)}>
            {busy === 'save' ? '保存中...' : '保存草稿'}
          </button>
          <button type="button" onClick={handleImportProjectConfig} disabled={Boolean(busy)}>
            {busy === 'project-config' ? '处理中...' : '导入配置'}
          </button>
          <button type="button" onClick={handleExportProjectConfig} disabled={Boolean(busy)}>
            {busy === 'project-config' ? '处理中...' : '导出配置'}
          </button>
          <button type="button" onClick={handleExportReadinessReport} disabled={Boolean(busy)}>
            {busy === 'readiness-report' ? '导出中...' : '导出缺口报告'}
          </button>
          <button type="button" onClick={handleExportAssetCollectionPackage} disabled={Boolean(busy)}>
            {busy === 'asset-package' ? '导出中...' : '导出材料包'}
          </button>
          <button type="button" onClick={handleImportAssetCollectionPackage} disabled={Boolean(busy)}>
            {busy === 'asset-package' ? '处理中...' : '导入材料包'}
          </button>
          <button type="button" onClick={handleValidate} disabled={Boolean(busy)}>
            {busy === 'validate' ? '校验中...' : '运行校验'}
          </button>
          <button type="button" onClick={handleExport} disabled={Boolean(busy)}>
            {busy === 'export' ? '导出中...' : '导出 Word'}
          </button>
        </div>
      </section>

      <section className="bid-document-summary-grid" aria-label="完整标书摘要">
        <article>
          <span>模板包</span>
          <strong>{state.template.name}</strong>
          <small>{state.template.id}</small>
        </article>
        <article>
          <span>项目名称</span>
          <strong>{state.projectData.projectName}</strong>
          <small>{state.projectData.purchaserName}</small>
        </article>
        <article>
          <span>供应商</span>
          <strong>{state.projectData.supplierName}</strong>
          <small>{state.template.documentTitle}</small>
        </article>
        <article>
          <span>报价合计</span>
          <strong>{formatMoney(quoteTotal)}</strong>
          <small>
            项目总价 {formatMoney(state.projectData.totalWithTax)}
            {` · ${formatQuoteDifferenceLabel(quoteDifference)}`}
          </small>
        </article>
        <article>
          <span>附件状态</span>
          <strong>{missingAssets ? `${missingAssets} 项缺失` : '已齐套'}</strong>
          <small>缺失时只写构建日志，不生成最终 Word</small>
        </article>
      </section>

      <nav className="bid-document-stepper" aria-label="完整标书生成步骤">
        {workflowSteps.map((step, index) => (
          <button
            type="button"
            key={step.id}
            className={step.id === activeStep ? 'is-active' : index < activeStepIndex ? 'is-done' : ''}
            onClick={() => setActiveStep(step.id)}
          >
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.meta}</small>
          </button>
        ))}
      </nav>

      <div className="bid-document-workspace">
        {activeStep === 'template' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>模板包</h2>
            <div className="bid-document-panel-actions">
              <span>{state.template.sections.length} 个章节 · {state.template.requiredAssetKeys.length} 项必填附件</span>
              <button type="button" onClick={handleExportTemplateInfo} disabled={Boolean(busy)}>
                {busy === 'template-info' ? '导出中...' : '导出模板配置 JSON'}
              </button>
            </div>
          </div>
          <div className="bid-document-template-grid">
            <label>
              <span>当前模板</span>
              <select value={state.template.id} onChange={(event) => handleTemplateChange(event.target.value)}>
                {state.templates.map((template) => (
                  <option value={template.id} key={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <div className="bid-document-template-meta">
              <strong>{state.template.documentTitle}</strong>
              <span>{state.template.industry}</span>
              <small>{state.template.id}</small>
            </div>
          </div>
        </section> : null}

        {activeStep === 'project-data' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>项目数据</h2>
            <span>当前项目实例</span>
          </div>
          <div className="bid-document-form-grid">
            <label>
              <span>项目名称</span>
              <input value={state.projectData.projectName} onChange={(event) => updateProjectData({ projectName: event.target.value })} />
            </label>
            <label>
              <span>采购人</span>
              <input value={state.projectData.purchaserName} onChange={(event) => updateProjectData({ purchaserName: event.target.value })} />
            </label>
            <label>
              <span>供应商</span>
              <input value={state.projectData.supplierName} onChange={(event) => updateProjectData({ supplierName: event.target.value })} />
            </label>
            <label>
              <span>含税总价</span>
              <input type="number" value={state.projectData.totalWithTax} onChange={(event) => updateProjectData({ totalWithTax: parseNumberInput(event.target.value, state.projectData.totalWithTax) })} />
            </label>
            <label>
              <span>不含税金额</span>
              <input type="number" value={state.projectData.totalWithoutTax} onChange={(event) => updateProjectData({ totalWithoutTax: parseNumberInput(event.target.value, state.projectData.totalWithoutTax) })} />
            </label>
            <label>
              <span>税率口径说明</span>
              <input value={state.projectData.taxPolicy.description ?? ''} onChange={(event) => updateTaxPolicy({ description: event.target.value })} placeholder="例如：按采购文件约定的适用税率执行" />
            </label>
            <label>
              <span>综合税率</span>
              <input type="number" step="0.01" value={state.projectData.taxPolicy.defaultRate ?? 0} onChange={(event) => updateTaxPolicy({ defaultRate: parseNumberInput(event.target.value, state.projectData.taxPolicy.defaultRate ?? 0) })} />
            </label>
            <label>
              <span>软硬件税率</span>
              <input type="number" step="0.01" value={state.projectData.taxPolicy.softwareHardwareRate ?? 0} onChange={(event) => updateTaxPolicy({ softwareHardwareRate: parseNumberInput(event.target.value, state.projectData.taxPolicy.softwareHardwareRate) })} />
            </label>
            <label>
              <span>实施服务税率</span>
              <input type="number" step="0.01" value={state.projectData.taxPolicy.serviceRate ?? 0} onChange={(event) => updateTaxPolicy({ serviceRate: parseNumberInput(event.target.value, state.projectData.taxPolicy.serviceRate) })} />
            </label>
          </div>
        </section> : null}

        {activeStep === 'project-data' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>付款条款</h2>
            <span>比例合计 {state.projectData.paymentTerms.reduce((sum, term) => sum + Number(term.ratio || 0), 0)}%</span>
          </div>
          <table className="bid-document-table bid-document-payment-table">
            <thead>
              <tr>
                <th>付款节点</th>
                <th>比例</th>
                <th>付款说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {state.projectData.paymentTerms.map((term, index) => (
                <tr key={`${term.stage}-${index}`}>
                  <td>
                    <input value={term.stage} onChange={(event) => updatePaymentTerm(index, { stage: event.target.value })} />
                  </td>
                  <td>
                    <input type="number" value={term.ratio} onChange={(event) => updatePaymentTerm(index, { ratio: parseNumberInput(event.target.value, term.ratio) })} />
                  </td>
                  <td>
                    <textarea value={term.text} onChange={(event) => updatePaymentTerm(index, { text: event.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="bid-document-inline-button" onClick={() => removePaymentTerm(index)} disabled={state.projectData.paymentTerms.length <= 1 || Boolean(busy)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bid-document-secondary-actions">
            <button type="button" onClick={addPaymentTerm} disabled={Boolean(busy)}>新增付款节点</button>
          </div>
        </section> : null}

        {activeStep === 'project-data' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>分项报价</h2>
            <span>行合计 {formatMoney(quoteTotal)}</span>
          </div>
          <table className="bid-document-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>数量</th>
                <th>品牌及型号</th>
                <th>含税单价</th>
                <th>含税总价</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {state.quoteItems.map((item, index) => (
                <tr key={`quote-item-${index}`}>
                  <td>
                    <input aria-label={`报价项名称 ${index + 1}`} value={item.name} onChange={(event) => updateQuoteItem(index, { name: event.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`报价项数量 ${index + 1}`} type="number" value={item.quantity} onChange={(event) => updateQuoteItem(index, { quantity: parseNumberInput(event.target.value, item.quantity) })} />
                  </td>
                  <td>
                    <input aria-label={`报价项品牌型号 ${index + 1}`} value={item.brandModel} onChange={(event) => updateQuoteItem(index, { brandModel: event.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`报价项含税单价 ${index + 1}`} type="number" value={item.unitPriceWithTax} onChange={(event) => updateQuoteItem(index, { unitPriceWithTax: parseNumberInput(event.target.value, item.unitPriceWithTax) })} />
                  </td>
                  <td>
                    <input aria-label={`报价项含税总价 ${index + 1}`} type="number" value={item.totalWithTax} onChange={(event) => updateQuoteItem(index, { totalWithTax: parseNumberInput(event.target.value, item.totalWithTax) })} />
                  </td>
                  <td>
                    <button type="button" className="bid-document-inline-button" onClick={() => removeQuoteItem(index)} disabled={state.quoteItems.length <= 1 || Boolean(busy)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bid-document-secondary-actions">
            <button type="button" onClick={addQuoteItem} disabled={Boolean(busy)}>新增报价项</button>
          </div>
        </section> : null}

        {activeStep === 'assets' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>附件映射</h2>
            <span>{Object.keys(state.assetMap).length} 项</span>
          </div>
          {lastAssetPackage ? <AssetPackageStatusCard status={lastAssetPackage} /> : null}
          <div className="bid-document-asset-list">
            {Object.values(state.assetMap).map((asset) => (
              <div className="bid-document-asset-row" key={asset.key}>
                <strong>{asset.title}</strong>
                <span>{asset.sectionId}</span>
                <div className="bid-document-asset-meta">
                  <span>{asset.required ? '必填材料' : '可选材料'}</span>
                  <span>{assetTypeLabel(asset.type)}</span>
                  <span>{isAssetSectionEnabled(state, asset) ? '章节已启用' : '章节已关闭'}</span>
                  {asset.templateId ? <span>{asset.templateId}</span> : null}
                </div>
                <small>{asset.filePath || '未选择附件'}</small>
                <div className="bid-document-asset-actions">
                  <button type="button" onClick={() => handleSelectAsset(asset)} disabled={Boolean(busy)}>
                    {busy === 'asset' ? '选择中...' : '选择文件'}
                  </button>
                  <button type="button" onClick={() => handleClearAsset(asset)} disabled={!asset.filePath || Boolean(busy)}>
                    清空
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section> : null}

        {activeStep === 'preview' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>模板预览</h2>
            <span>{state.template.sections.length} 个章节</span>
          </div>
          <div className="bid-document-section-tree" aria-label="模板章节预览">
            {state.template.sections.map((section) => (
              <div className={`bid-document-section-row level-${section.level}`} key={section.id}>
                <strong>{section.title}</strong>
                <span>{sectionLevelLabel(section.level)}</span>
                {section.required ? (
                  <small>必选 · {section.id}</small>
                ) : (
                  <label className="bid-document-section-toggle">
                    <input
                      type="checkbox"
                      checked={!state.projectData.disabledSectionIds?.includes(section.id)}
                      disabled={Boolean(busy)}
                      onChange={(event) => toggleOptionalSection(section.id, event.target.checked)}
                    />
                    启用 · {section.id}
                  </label>
                )}
              </div>
            ))}
          </div>
        </section> : null}

        {activeStep === 'build' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>构建日志</h2>
            <span>{buildLog?.passed ? '通过' : buildLog ? '未通过' : '未运行'}</span>
          </div>
          {lastReadinessExport ? (
            <div className="bid-document-export-paths" aria-label="最近导出的缺口报告">
              <strong>最近缺口报告：{lastReadinessExport.readinessReady ? '可正式构建' : '仍有阻断项'}</strong>
              {lastReadinessExport.markdownPath ? <span>Markdown：{lastReadinessExport.markdownPath}</span> : null}
              {lastReadinessExport.jsonPath ? <span>JSON：{lastReadinessExport.jsonPath}</span> : null}
              {lastReadinessExport.xlsxPath ? <span>Excel：{lastReadinessExport.xlsxPath}</span> : null}
            </div>
          ) : null}
          {lastAssetPackage ? <AssetPackageStatusCard status={lastAssetPackage} /> : null}
          <div className="bid-document-check-list">
            {buildCheckLabels.map(([key, label]) => (
              <CheckRow key={key} label={label} result={buildLog?.[key] as { passed: boolean; errors?: string[] } | undefined} />
            ))}
            {importCheckLabels.filter(([key]) => Boolean(buildLog?.[key])).map(([key, label]) => (
              <CheckRow key={key} label={label} result={buildLog?.[key] as { passed: boolean; errors?: string[] } | undefined} />
            ))}
          </div>
        </section> : null}

        {activeStep === 'build' ? <section className="bid-document-panel bid-document-panel-wide">
          <div className="bid-document-panel-head">
            <h2>参考文件对齐</h2>
            <span>{referenceAlignment?.alignment?.passed ? '通过' : referenceAlignment ? '未通过' : '未运行'}</span>
          </div>
          <p className="bid-document-panel-note">
            选择正式参考响应文件，并与最近导出的 Word 成品进行结构对齐；若当前没有导出路径，系统会继续选择候选生成文件。
          </p>
          <div className="bid-document-reference-actions">
            <button type="button" onClick={handleReferenceAlignment} disabled={Boolean(busy)}>
              {busy === 'align' ? '对齐中...' : '选择参考并对齐'}
            </button>
            {buildLog?.outputPath ? <small>候选文件：{buildLog.outputPath}</small> : <small>候选文件：运行时选择</small>}
          </div>
          {referenceAlignment ? (
            <div className={`bid-document-reference-result ${referenceAlignment.alignment?.passed ? 'is-passed' : 'is-failed'}`}>
              <strong>{referenceAlignment.message}</strong>
              <span>参考：{referenceAlignment.referencePath || '未选择'}</span>
              <span>候选：{referenceAlignment.candidatePath || '未选择'}</span>
              {referenceAlignment.alignment?.errors?.length ? (
                <ul>
                  {referenceAlignment.alignment.errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}
                </ul>
              ) : null}
              {referenceAlignment.alignment?.details ? (
                <div className="bid-document-reference-metrics">
                  <span>缺失标题 {referenceAlignment.alignment.details.missingHeadings?.length || 0}</span>
                  <span>新增标题 {referenceAlignment.alignment.details.extraHeadings?.length || 0}</span>
                  <span>缺失表头 {referenceAlignment.alignment.details.missingTableHeaders?.length || 0}</span>
                  <span>页面差异 {referenceAlignment.alignment.details.layoutDiffs?.length || 0}</span>
                  <span>计数差异 {referenceAlignment.alignment.details.summaryDiffs?.length || 0}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section> : null}
      </div>

      <div className="bid-document-step-actions">
        <button type="button" onClick={() => goToAdjacentStep(-1)} disabled={activeStepIndex <= 0 || Boolean(busy)}>
          上一步
        </button>
        <span>{activeStepIndex + 1} / {workflowSteps.length}</span>
        <button type="button" onClick={() => goToAdjacentStep(1)} disabled={activeStepIndex >= workflowSteps.length - 1 || Boolean(busy)}>
          下一步
        </button>
      </div>
    </div>
  );
}

export default BidDocumentPage;
