import { useEffect, useMemo, useState } from 'react';
import { trackBusinessBidAction } from '../../../shared/analytics/analytics';
import { useToast } from '../../../shared/ui';
import type { BusinessBidAttachmentKind, BusinessBidAttachmentPatch, BusinessBidAttachmentStatus, BusinessBidClause, BusinessBidClausePatch, BusinessBidDeviationType, BusinessBidRiskLevel, BusinessBidState } from '../types';

const emptyState: BusinessBidState = {
  source: null,
  clauses: [],
  attachments: [],
};

const categoryLabels: Record<BusinessBidClause['category'], string> = {
  payment: '付款与结算',
  bond: '保证金/保函',
  quote: '报价要求',
  contract: '合同条款',
  qualification: '资信材料',
  schedule: '工期/服务期',
  other: '其他商务要求',
};

const deviationLabels: Record<BusinessBidDeviationType, string> = {
  none: '无偏离',
  positive: '正偏离',
  negative: '负偏离',
  pending: '待确认',
};

const riskLabels: Record<BusinessBidRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const attachmentKindLabels: Record<BusinessBidAttachmentKind, string> = {
  quote: '报价附件',
  qualification: '资信证明',
  contract: '合同附件',
  bond: '保证金/保函',
  other: '其他附件',
};

const attachmentStatusLabels: Record<BusinessBidAttachmentStatus, string> = {
  pending: '待补充',
  ready: '已就绪',
  missing: '缺失待补',
};

function summarizeClauses(clauses: BusinessBidClause[]) {
  return {
    total: clauses.length,
    confirmed: clauses.filter((item) => item.confirmed).length,
    pending: clauses.filter((item) => item.deviationType === 'pending' || !item.confirmed).length,
    highRisk: clauses.filter((item) => item.riskLevel === 'high').length,
  };
}

function formatFileSize(bytes: number) {
  if (!bytes) return '-';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function isTaskActive(status?: string) {
  return status === 'running' || status === 'pausing';
}

function formatTaskStatus(status?: string) {
  if (status === 'running') return '执行中';
  if (status === 'pausing') return '暂停中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  return '未启动';
}

function BusinessBidPage() {
  const { showToast } = useToast();
  const [state, setState] = useState<BusinessBidState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [generatingMode, setGeneratingMode] = useState<'technical-plan' | 'document' | 'ai' | null>(null);
  const [activeCategory, setActiveCategory] = useState<BusinessBidClause['category'] | 'all'>('all');

  const stats = useMemo(() => summarizeClauses(state.clauses), [state.clauses]);
  const attachments = state.attachments || [];
  const filteredClauses = useMemo(
    () => activeCategory === 'all' ? state.clauses : state.clauses.filter((item) => item.category === activeCategory),
    [activeCategory, state.clauses],
  );

  const generating = generatingMode !== null;
  const aiTaskActive = isTaskActive(state.aiExtractionTask?.status);
  const busy = generating || aiTaskActive;

  useEffect(() => {
    let canceled = false;
    const loader = window.yibiao?.businessBid?.loadState;
    setLoading(true);
    if (!loader) {
      setLoading(false);
      return () => {
        canceled = true;
      };
    }
    loader()
      .then((nextState) => {
        if (!canceled && nextState) setState(nextState);
      })
      .catch((error) => {
        if (!canceled) showToast(error instanceof Error ? error.message : '商务标加载失败', 'error');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = window.yibiao?.tasks?.onTaskEvent<unknown, unknown, unknown, BusinessBidState>((event) => {
      if (event.businessBid) {
        setState(event.businessBid);
        if (event.businessBid.aiExtractionTask?.status === 'success') {
          showToast('商务标 AI 结构化提取已完成', 'success');
        }
        if (event.businessBid.aiExtractionTask?.status === 'error') {
          showToast(event.businessBid.aiExtractionTask.error || '商务标 AI 结构化提取失败', 'error');
        }
      }
    });
    void window.yibiao?.tasks?.getActiveTasks?.();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [showToast]);

  const importFromTechnicalPlan = async () => {
    const importer = window.yibiao?.businessBid?.importFromTechnicalPlan;
    if (!importer) {
      showToast('当前环境不支持生成商务标矩阵，请在桌面客户端中使用', 'error');
      return;
    }
    setGeneratingMode('technical-plan');
    try {
      const nextState = await importer();
      setState(nextState);
      trackBusinessBidAction('generate_matrix_from_technical_plan');
      showToast('商务响应矩阵已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务响应矩阵生成失败', 'error');
    } finally {
      setGeneratingMode(null);
    }
  };

  const importTenderDocument = async () => {
    const importer = window.yibiao?.businessBid?.importTenderDocument;
    if (!importer) {
      showToast('当前环境不支持导入商务标招标文件，请在桌面客户端中使用', 'error');
      return;
    }
    setGeneratingMode('document');
    try {
      const result = await importer();
      setState(result.state);
      if (result.success) {
        trackBusinessBidAction('import_tender_document');
      }
      showToast(result.message || (result.success ? '商务标招标文件已导入' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标招标文件导入失败', 'error');
    } finally {
      setGeneratingMode(null);
    }
  };

  const enhanceWithAi = async () => {
    if (!state.source) {
      showToast('请先导入招标文件或从技术方案生成矩阵', 'info');
      return;
    }
    const starter = window.yibiao?.tasks?.startBusinessBidAiExtraction;
    if (!starter) {
      showToast('当前环境不支持 AI 结构化提取，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const task = await starter({});
      setState((prev) => ({ ...prev, aiExtractionTask: task as BusinessBidState['aiExtractionTask'] }));
      trackBusinessBidAction('start_ai_extraction');
      showToast('商务标 AI 结构化提取已启动', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标 AI 结构化提取失败', 'error');
    }
  };

  const exportReport = async () => {
    if (!state.clauses.length) {
      showToast('请先生成商务响应矩阵，再导出交付包', 'info');
      return;
    }
    const exporter = window.yibiao?.businessBid?.exportReport;
    if (!exporter) {
      showToast('当前环境不支持导出商务标交付包，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter();
      if (result.success) {
        trackBusinessBidAction('export_markdown');
      }
      showToast(result.message || (result.success ? '商务标响应交付包已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标响应交付包导出失败', 'error');
    }
  };

  const exportOfficePackage = async (format: 'docx' | 'xlsx') => {
    if (!state.clauses.length) {
      showToast('请先生成商务响应矩阵，再导出交付文件', 'info');
      return;
    }
    const exporter = window.yibiao?.businessBid?.exportOfficePackage;
    if (!exporter) {
      showToast('当前环境不支持导出商务标 Office 文件，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter({ format });
      if (result.success) {
        trackBusinessBidAction(format === 'docx' ? 'export_word' : 'export_excel');
      }
      showToast(result.message || (result.success ? '商务标交付文件已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标 Office 文件导出失败', 'error');
    }
  };

  const patchLocalClause = (id: string, patch: BusinessBidClausePatch) => {
    setState((prev) => ({
      ...prev,
      clauses: prev.clauses.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const saveClausePatch = async (id: string, patch: BusinessBidClausePatch) => {
    patchLocalClause(id, patch);
    try {
      const nextState = await window.yibiao?.businessBid?.updateClause(id, patch);
      if (nextState) setState(nextState);
      if (patch.confirmed === true) {
        trackBusinessBidAction('confirm_clause');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务条款保存失败', 'error');
    }
  };

  const importAttachments = async (kind: BusinessBidAttachmentKind) => {
    const importer = window.yibiao?.businessBid?.importAttachments;
    if (!importer) {
      showToast('当前环境不支持导入商务标附件，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await importer({ kind });
      setState(result.state);
      showToast(result.message || (result.success ? '商务标附件已导入' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标附件导入失败', 'error');
    }
  };

  const patchLocalAttachment = (id: string, patch: BusinessBidAttachmentPatch) => {
    setState((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const saveAttachmentPatch = async (id: string, patch: BusinessBidAttachmentPatch) => {
    patchLocalAttachment(id, patch);
    try {
      const nextState = await window.yibiao?.businessBid?.updateAttachment(id, patch);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标附件保存失败', 'error');
    }
  };

  const deleteAttachment = async (id: string) => {
    try {
      const nextState = await window.yibiao?.businessBid?.deleteAttachment(id);
      if (nextState) setState(nextState);
      showToast('商务标附件已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '商务标附件删除失败', 'error');
    }
  };

  return (
    <div className="business-bid-workbench">
      <section className="business-bid-command-panel">
        <div className="business-bid-title-block">
          <span className="section-kicker">商务标</span>
          <h2>商务响应矩阵和偏离确认</h2>
          <p>可直接导入商务标招标文件，或复用技术方案已导入的招标文件，提取付款、报价、合同、资信和保证金条款，形成可人工确认的商务响应矩阵。</p>
        </div>
        <div className="business-bid-actions">
          <button type="button" className="primary-action" onClick={importTenderDocument} disabled={busy}>
            {generatingMode === 'document' ? '正在导入...' : '导入商务标招标文件'}
          </button>
          <button type="button" className="secondary-action" onClick={importFromTechnicalPlan} disabled={busy}>
            {generatingMode === 'technical-plan' ? '正在生成...' : '从技术方案生成矩阵'}
          </button>
          <button type="button" className="secondary-action" onClick={enhanceWithAi} disabled={busy || !state.source}>
            {aiTaskActive ? 'AI 提取中...' : 'AI 结构化提取'}
          </button>
          <button type="button" className="secondary-action" onClick={exportReport} disabled={!state.clauses.length}>
            导出 Markdown
          </button>
          <button type="button" className="secondary-action" onClick={() => { void exportOfficePackage('docx'); }} disabled={!state.clauses.length}>
            导出 Word
          </button>
          <button type="button" className="secondary-action" onClick={() => { void exportOfficePackage('xlsx'); }} disabled={!state.clauses.length}>
            导出 Excel
          </button>
          <small>{state.source ? `来源：${state.source.fileName}` : '请先在技术方案中导入招标文件'}</small>
          {state.aiExtractionTask ? (
            <small>
              AI 提取：{formatTaskStatus(state.aiExtractionTask.status)} · {state.aiExtractionTask.progress}%
              {state.aiExtractionTask.error ? ` · ${state.aiExtractionTask.error}` : ''}
            </small>
          ) : null}
        </div>
      </section>

      <section className="business-bid-stat-strip" aria-label="商务标统计">
        <article>
          <span>识别条款</span>
          <strong>{stats.total}</strong>
        </article>
        <article>
          <span>已确认</span>
          <strong>{stats.confirmed}</strong>
        </article>
        <article>
          <span>待处理</span>
          <strong>{stats.pending}</strong>
        </article>
        <article>
          <span>高风险</span>
          <strong>{stats.highRisk}</strong>
        </article>
        <article>
          <span>独立附件</span>
          <strong>{attachments.length}</strong>
        </article>
      </section>

      <section className="business-bid-attachment-panel" aria-label="商务标附件管理">
        <div className="panel-heading-row">
          <div>
            <span className="section-kicker">附件管理</span>
            <h3>独立附件清单</h3>
          </div>
          <div className="business-bid-attachment-actions">
            <button type="button" className="secondary-action" onClick={() => { void importAttachments('quote'); }}>导入报价附件</button>
            <button type="button" className="secondary-action" onClick={() => { void importAttachments('qualification'); }}>导入资信证明</button>
            <button type="button" className="secondary-action" onClick={() => { void importAttachments('other'); }}>导入其他附件</button>
          </div>
        </div>
        {attachments.length ? (
          <div className="business-bid-attachment-list">
            {attachments.map((attachment) => (
              <article key={attachment.id} className={`is-${attachment.status}`}>
                <div className="business-bid-attachment-title">
                  <strong>{attachment.fileName}</strong>
                  <span>{formatFileSize(attachment.fileSize)} · {attachmentKindLabels[attachment.kind]}</span>
                </div>
                <label>
                  <span>类型</span>
                  <select
                    value={attachment.kind}
                    onChange={(event) => { void saveAttachmentPatch(attachment.id, { kind: event.target.value as BusinessBidAttachmentKind }); }}
                  >
                    {Object.entries(attachmentKindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={attachment.status}
                    onChange={(event) => { void saveAttachmentPatch(attachment.id, { status: event.target.value as BusinessBidAttachmentStatus }); }}
                  >
                    {Object.entries(attachmentStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>负责人</span>
                  <input
                    value={attachment.owner}
                    onChange={(event) => patchLocalAttachment(attachment.id, { owner: event.target.value })}
                    onBlur={(event) => { void saveAttachmentPatch(attachment.id, { owner: event.target.value }); }}
                    placeholder="附件负责人"
                  />
                </label>
                <label className="is-wide">
                  <span>备注</span>
                  <input
                    value={attachment.note}
                    onChange={(event) => patchLocalAttachment(attachment.id, { note: event.target.value })}
                    onBlur={(event) => { void saveAttachmentPatch(attachment.id, { note: event.target.value }); }}
                    placeholder="例如：待财务确认最终报价"
                  />
                </label>
                <button type="button" className="secondary-action is-danger" onClick={() => { void deleteAttachment(attachment.id); }}>删除</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <strong>暂无独立附件</strong>
            <span>可导入报价表、资信证明、合同附件或保证金/保函材料，导出交付包时会进入独立附件清单。</span>
          </div>
        )}
      </section>

      <div className="business-bid-content-grid">
        <aside className="business-bid-filter-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">条款分类</span>
              <h3>响应范围</h3>
            </div>
            {loading ? <span className="demo-soft-pill">加载中</span> : null}
          </div>
          <button type="button" className={activeCategory === 'all' ? 'is-active' : ''} onClick={() => setActiveCategory('all')}>
            全部条款 <strong>{state.clauses.length}</strong>
          </button>
          {Object.entries(categoryLabels).map(([category, label]) => {
            const count = state.clauses.filter((item) => item.category === category).length;
            return (
              <button type="button" className={activeCategory === category ? 'is-active' : ''} key={category} onClick={() => setActiveCategory(category as BusinessBidClause['category'])}>
                {label} <strong>{count}</strong>
              </button>
            );
          })}
        </aside>

        <section className="business-bid-matrix-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">响应矩阵</span>
              <h3>商务条款确认</h3>
            </div>
          </div>

          {filteredClauses.length ? (
            <div className="business-bid-clause-list">
              {filteredClauses.map((clause) => (
                <article className={`business-bid-clause is-${clause.riskLevel}`} key={clause.id}>
                  <div className="business-bid-clause-head">
                    <div>
                      <span>{categoryLabels[clause.category]}</span>
                      <strong>{clause.originalText}</strong>
                    </div>
                    <label className="business-bid-confirm">
                      <input
                        type="checkbox"
                        checked={clause.confirmed}
                        onChange={(event) => { void saveClausePatch(clause.id, { confirmed: event.target.checked }); }}
                      />
                      已确认
                    </label>
                  </div>

                  <div className="business-bid-clause-controls">
                    <label>
                      <span>偏离类型</span>
                      <select
                        value={clause.deviationType}
                        onChange={(event) => { void saveClausePatch(clause.id, { deviationType: event.target.value as BusinessBidDeviationType }); }}
                      >
                        {Object.entries(deviationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>风险等级</span>
                      <select
                        value={clause.riskLevel}
                        onChange={(event) => { void saveClausePatch(clause.id, { riskLevel: event.target.value as BusinessBidRiskLevel }); }}
                      >
                        {Object.entries(riskLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>负责人</span>
                      <input
                        value={clause.owner}
                        onChange={(event) => patchLocalClause(clause.id, { owner: event.target.value })}
                        onBlur={(event) => { void saveClausePatch(clause.id, { owner: event.target.value }); }}
                        placeholder="条款负责人"
                      />
                    </label>
                    <label>
                      <span>确认人</span>
                      <input
                        value={clause.confirmedBy}
                        onChange={(event) => patchLocalClause(clause.id, { confirmedBy: event.target.value })}
                        onBlur={(event) => { void saveClausePatch(clause.id, { confirmedBy: event.target.value }); }}
                        placeholder="最终确认人"
                      />
                    </label>
                  </div>

                  <label className="business-bid-response-field">
                    <span>响应内容</span>
                    <textarea
                      value={clause.responseText}
                      onChange={(event) => patchLocalClause(clause.id, { responseText: event.target.value })}
                      onBlur={(event) => { void saveClausePatch(clause.id, { responseText: event.target.value }); }}
                    />
                  </label>
                  <label className="business-bid-response-field">
                    <span>待补充材料</span>
                    <textarea
                      value={clause.materialRequirement}
                      onChange={(event) => patchLocalClause(clause.id, { materialRequirement: event.target.value })}
                      onBlur={(event) => { void saveClausePatch(clause.id, { materialRequirement: event.target.value }); }}
                    />
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel is-large">
              <strong>暂无商务响应矩阵</strong>
              <span>可直接导入商务标招标文件，或先在技术方案中导入招标文件后点击“从技术方案生成矩阵”。</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default BusinessBidPage;
