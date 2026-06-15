import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type { AiEvaluationExpertScore, AiEvaluationItem, AiEvaluationItemCategory, AiEvaluationItemPatch, AiEvaluationRiskLevel, AiEvaluationState } from '../types';

const emptyState: AiEvaluationState = {
  source: null,
  items: [],
  summary: {
    totalMaxScore: 0,
    totalFinalScore: 0,
    confirmedCount: 0,
    highRiskCount: 0,
    itemCount: 0,
    conclusion: '请先生成评分表',
  },
  bidDocuments: [],
  bidScoreSummaries: [],
  expertScores: [],
  expertReviewSummary: {
    expertCount: 0,
    scoreCount: 0,
    conflictCount: 0,
    maxDeviation: 0,
    conclusion: '尚未录入专家打分。',
  },
  auditOpinions: [],
  latestReport: null,
};

const categoryLabels: Record<AiEvaluationItemCategory, string> = {
  qualification: '资格项',
  business: '商务项',
  technical: '技术项',
  price: '报价项',
  objective: '客观分',
  subjective: '主观分',
  other: '其他评分项',
};

const riskLabels: Record<AiEvaluationRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

type ExpertScoreDraft = {
  expertName: string;
  score: string;
  opinion: string;
};

function clampScore(value: string, maxScore: number) {
  if (!value.trim()) return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(maxScore, Math.round(score * 10) / 10));
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

function AiEvaluationPage() {
  const { showToast } = useToast();
  const [state, setState] = useState<AiEvaluationState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState<'score-table' | 'bid-document' | 'ai' | null>(null);
  const [activeCategory, setActiveCategory] = useState<AiEvaluationItemCategory | 'all'>('all');
  const [expertDrafts, setExpertDrafts] = useState<Record<string, ExpertScoreDraft>>({});
  const aiTaskActive = isTaskActive(state.aiExtractionTask?.status);
  const batchScoringActive = isTaskActive(state.batchScoringTask?.status);
  const running = runningMode !== null || aiTaskActive || batchScoringActive;

  const filteredItems = useMemo(
    () => activeCategory === 'all' ? state.items : state.items.filter((item) => item.category === activeCategory),
    [activeCategory, state.items],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<AiEvaluationItemCategory, number>();
    state.items.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    return counts;
  }, [state.items]);
  const expertScoresByItem = useMemo(() => {
    const grouped = new Map<string, AiEvaluationExpertScore[]>();
    (state.expertScores || []).forEach((score) => {
      if (!grouped.has(score.itemId)) grouped.set(score.itemId, []);
      grouped.get(score.itemId)?.push(score);
    });
    return grouped;
  }, [state.expertScores]);

  useEffect(() => {
    let canceled = false;
    const loader = window.yibiao?.aiEvaluation?.loadState;
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
        if (!canceled) showToast(error instanceof Error ? error.message : 'AI 评标加载失败', 'error');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = window.yibiao?.tasks?.onTaskEvent<unknown, unknown, unknown, unknown, AiEvaluationState>((event) => {
      if (event.aiEvaluation) {
        setState(event.aiEvaluation);
        if (event.aiEvaluation.aiExtractionTask?.status === 'success') {
          showToast('AI 评标结构化抽取已完成', 'success');
        }
        if (event.aiEvaluation.aiExtractionTask?.status === 'error') {
          showToast(event.aiEvaluation.aiExtractionTask.error || 'AI 评标结构化抽取失败', 'error');
        }
        if (event.aiEvaluation.batchScoringTask?.status === 'success') {
          showToast('AI 评标批量评分已完成', 'success');
        }
        if (event.aiEvaluation.batchScoringTask?.status === 'error') {
          showToast(event.aiEvaluation.batchScoringTask.error || 'AI 评标批量评分失败', 'error');
        }
      }
    });
    void window.yibiao?.tasks?.getActiveTasks?.();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [showToast]);

  const generateFromTechnicalPlan = async () => {
    const generator = window.yibiao?.aiEvaluation?.generateFromTechnicalPlan;
    if (!generator) {
      showToast('当前环境不支持生成 AI 评标评分表，请在桌面客户端中使用', 'error');
      return;
    }
    setRunningMode('score-table');
    try {
      const nextState = await generator();
      setState(nextState);
      showToast('AI 评标评分表已生成', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标评分表生成失败', 'error');
    } finally {
      setRunningMode(null);
    }
  };

  const importBidDocument = async () => {
    const importer = window.yibiao?.aiEvaluation?.importBidDocument;
    if (!importer) {
      showToast('当前环境不支持导入 AI 评标投标文件，请在桌面客户端中使用', 'error');
      return;
    }
    setRunningMode('bid-document');
    try {
      const result = await importer();
      setState(result.state);
      showToast(result.message || (result.success ? '投标文件证据已更新' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标投标文件导入失败', 'error');
    } finally {
      setRunningMode(null);
    }
  };

  const enhanceWithAi = async () => {
    const starter = window.yibiao?.tasks?.startAiEvaluationExtraction;
    if (!starter) {
      showToast('当前环境不支持 AI 评标结构化抽取，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const task = await starter({});
      setState((prev) => ({ ...prev, aiExtractionTask: task as AiEvaluationState['aiExtractionTask'] }));
      showToast('AI 评标结构化抽取已启动', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标结构化抽取失败', 'error');
    }
  };

  const batchScoreBidDocuments = async () => {
    const starter = window.yibiao?.tasks?.startAiEvaluationBatchScoring;
    if (!starter) {
      showToast('当前环境不支持 AI 评标批量评分，请在桌面客户端中使用', 'error');
      return;
    }
    if (!state.items.length || !state.bidDocuments?.length) {
      showToast('请先生成评分表并导入投标文件，再批量评分', 'info');
      return;
    }
    try {
      const task = await starter({});
      setState((prev) => ({ ...prev, batchScoringTask: task as AiEvaluationState['batchScoringTask'] }));
      showToast('AI 评标批量评分已启动', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标批量评分失败', 'error');
    }
  };

  const exportReport = async () => {
    if (!state.items.length) {
      showToast('请先生成 AI 评标评分表，再导出自评报告', 'info');
      return;
    }
    const exporter = window.yibiao?.aiEvaluation?.exportReport;
    if (!exporter) {
      showToast('当前环境不支持导出 AI 评标自评报告，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter();
      showToast(result.message || (result.success ? 'AI 评标自评报告已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标自评报告导出失败', 'error');
    }
  };

  const exportOfficePackage = async (format: 'docx' | 'xlsx') => {
    if (!state.items.length) {
      showToast('请先生成 AI 评标评分表，再导出正式报告', 'info');
      return;
    }
    const exporter = window.yibiao?.aiEvaluation?.exportOfficePackage;
    if (!exporter) {
      showToast('当前环境不支持导出 AI 评标正式报告，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter({ format });
      showToast(result.message || (result.success ? 'AI 评标正式报告已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI 评标正式报告导出失败', 'error');
    }
  };

  const patchLocalItem = (id: string, patch: AiEvaluationItemPatch) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const manualScore = patch.manualScore === undefined ? item.manualScore : patch.manualScore;
        return {
          ...item,
          ...patch,
          manualScore,
          finalScore: manualScore === null || manualScore === undefined ? item.autoScore : manualScore,
        };
      }),
    }));
  };

  const saveItemPatch = async (item: AiEvaluationItem, patch: AiEvaluationItemPatch) => {
    patchLocalItem(item.id, patch);
    try {
      const nextState = await window.yibiao?.aiEvaluation?.updateItem(item.id, patch);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '评分项保存失败', 'error');
    }
  };

  const updateExpertDraft = (itemId: string, patch: Partial<ExpertScoreDraft>) => {
    setExpertDrafts((prev) => {
      const current = prev[itemId] || {
        expertName: '',
        score: '',
        opinion: '',
      };
      return {
        ...prev,
        [itemId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const saveExpertScore = async (item: AiEvaluationItem) => {
    const draft = expertDrafts[item.id];
    const expertName = draft?.expertName.trim() || '';
    const score = clampScore(draft?.score || '', item.maxScore);
    if (!expertName) {
      showToast('请先填写专家姓名', 'info');
      return;
    }
    if (score === null) {
      showToast('请填写有效专家分', 'info');
      return;
    }
    const saver = window.yibiao?.aiEvaluation?.saveExpertScore;
    if (!saver) {
      showToast('当前环境不支持保存专家打分，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const nextState = await saver({
        itemId: item.id,
        expertName,
        score,
        opinion: draft?.opinion || '',
      });
      if (nextState) setState(nextState);
      updateExpertDraft(item.id, { score: '', opinion: '' });
      showToast('专家打分已保存，交叉审核已刷新', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '专家打分保存失败', 'error');
    }
  };

  return (
    <div className="ai-evaluation-workbench">
      <section className="ai-evaluation-command-panel">
        <div className="ai-evaluation-title-block">
          <span className="section-kicker">AI 评标</span>
          <h2>评分办法抽取、自评打分和证据复核</h2>
          <p>先从评分办法提取资格、商务、技术、报价和客观评分项，再导入投标文件匹配响应证据，生成可人工调整的自评表。</p>
        </div>
        <div className="ai-evaluation-actions">
          <button type="button" className="primary-action" onClick={generateFromTechnicalPlan} disabled={running}>
            {runningMode === 'score-table' ? '正在生成...' : '从技术方案生成评分表'}
          </button>
          <button type="button" className="secondary-action" onClick={importBidDocument} disabled={running || !state.items.length}>
            {runningMode === 'bid-document' ? '正在导入...' : '导入投标文件匹配证据'}
          </button>
          <button type="button" className="secondary-action" onClick={enhanceWithAi} disabled={running}>
            {aiTaskActive ? 'AI 抽取中...' : 'AI 结构化抽取评分项'}
          </button>
          <button type="button" className="secondary-action" onClick={batchScoreBidDocuments} disabled={running || !state.items.length || !state.bidDocuments?.length}>
            {batchScoringActive ? '批量评分中...' : '批量重评投标文件'}
          </button>
          <button type="button" className="secondary-action" onClick={exportReport} disabled={!state.items.length}>
            导出自评报告
          </button>
          <button type="button" className="secondary-action" onClick={() => { void exportOfficePackage('docx'); }} disabled={!state.items.length}>
            导出 Word 报告
          </button>
          <button type="button" className="secondary-action" onClick={() => { void exportOfficePackage('xlsx'); }} disabled={!state.items.length}>
            导出 Excel 报告
          </button>
          <small>{state.source ? `来源：${state.source.fileName}` : '请先在技术方案中导入招标文件'}</small>
          <small>已导入投标文件：{state.bidDocuments?.length || 0} 份</small>
          <small>专家打分：{state.expertReviewSummary?.scoreCount || 0} 条</small>
          <small>审计意见：{state.auditOpinions?.length || 0} 条</small>
          {state.latestReport ? <small>最近报告：{state.latestReport.generatedAt}</small> : null}
          {state.aiExtractionTask ? (
            <small>
              AI 抽取：{formatTaskStatus(state.aiExtractionTask.status)} · {state.aiExtractionTask.progress}%
              {state.aiExtractionTask.error ? ` · ${state.aiExtractionTask.error}` : ''}
            </small>
          ) : null}
          {state.batchScoringTask ? (
            <small>
              批量评分：{formatTaskStatus(state.batchScoringTask.status)} · {state.batchScoringTask.progress}%
              {state.batchScoringTask.error ? ` · ${state.batchScoringTask.error}` : ''}
            </small>
          ) : null}
        </div>
      </section>

      <section className="ai-evaluation-stat-strip" aria-label="AI 评标统计">
        <article>
          <span>评分项</span>
          <strong>{state.summary.itemCount}</strong>
        </article>
        <article>
          <span>自评总分</span>
          <strong>{state.summary.totalFinalScore}/{state.summary.totalMaxScore}</strong>
        </article>
        <article>
          <span>已确认</span>
          <strong>{state.summary.confirmedCount}</strong>
        </article>
        <article>
          <span>高风险</span>
          <strong>{state.summary.highRiskCount}</strong>
        </article>
        <article>
          <span>投标文件</span>
          <strong>{state.bidDocuments?.length || 0}</strong>
        </article>
        <article>
          <span>专家冲突</span>
          <strong>{state.expertReviewSummary?.conflictCount || 0}</strong>
        </article>
      </section>

      <div className="ai-evaluation-content-grid">
        <aside className="ai-evaluation-filter-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">评分分类</span>
              <h3>评审范围</h3>
            </div>
            {loading ? <span className="demo-soft-pill">加载中</span> : null}
          </div>
          <button type="button" className={activeCategory === 'all' ? 'is-active' : ''} onClick={() => setActiveCategory('all')}>
            全部评分项 <strong>{state.items.length}</strong>
          </button>
          {Object.entries(categoryLabels).map(([category, label]) => (
            <button
              type="button"
              className={activeCategory === category ? 'is-active' : ''}
              key={category}
              onClick={() => setActiveCategory(category as AiEvaluationItemCategory)}
            >
              {label} <strong>{categoryCounts.get(category as AiEvaluationItemCategory) || 0}</strong>
            </button>
          ))}
        </aside>

        <section className="ai-evaluation-result-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">自评结果</span>
              <h3>评分项和证据复核</h3>
            </div>
            <span className="demo-soft-pill">{state.summary.conclusion}</span>
          </div>

          {filteredItems.length ? (
            <div className="ai-evaluation-item-list">
              {state.bidScoreSummaries?.length ? (
                <section className="ai-evaluation-bid-summary" aria-label="投标文件评分汇总">
                  <div className="panel-heading-row">
                    <div>
                      <span className="section-kicker">多投标文件</span>
                      <h3>评分结果汇总</h3>
                    </div>
                  </div>
                  <div className="ai-evaluation-bid-summary-list">
                    {state.bidScoreSummaries.map((summary) => (
                      <article key={summary.documentId}>
                        <strong>{summary.fileName}</strong>
                        <span>{summary.totalFinalScore}/{summary.totalMaxScore} · 高风险 {summary.highRiskCount} · {summary.conclusion}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {state.expertScores?.length ? (
                <section className="ai-evaluation-expert-summary" aria-label="专家打分交叉审核">
                  <div className="panel-heading-row">
                    <div>
                      <span className="section-kicker">专家打分</span>
                      <h3>交叉审核</h3>
                    </div>
                    <span className="demo-soft-pill">{state.expertReviewSummary?.conclusion || '待录入专家打分'}</span>
                  </div>
                  <div className="ai-evaluation-expert-metrics">
                    <span>专家 {state.expertReviewSummary?.expertCount || 0} 人</span>
                    <span>记录 {state.expertReviewSummary?.scoreCount || 0} 条</span>
                    <span>最大偏差 {state.expertReviewSummary?.maxDeviation || 0}</span>
                  </div>
                </section>
              ) : null}
              {state.auditOpinions?.length ? (
                <section className="ai-evaluation-audit-summary" aria-label="AI 评标审计意见">
                  <div className="panel-heading-row">
                    <div>
                      <span className="section-kicker">审计意见</span>
                      <h3>专家复核和客观分核验</h3>
                    </div>
                    {state.latestReport ? <span className="demo-soft-pill">已保存报告快照</span> : null}
                  </div>
                  <div className="ai-evaluation-audit-list">
                    {state.auditOpinions.slice(0, 6).map((opinion) => (
                      <article className={`is-${opinion.severity}`} key={opinion.id}>
                        <div>
                          <strong>{opinion.title}</strong>
                          <span>{riskLabels[opinion.severity]} · {opinion.status === 'closed' ? '已关闭' : '待处理'}</span>
                        </div>
                        <p>{opinion.recommendation}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {filteredItems.map((item) => (
                <article className={`ai-evaluation-item is-${item.riskLevel}`} key={item.id}>
                  <div className="ai-evaluation-item-head">
                    <div>
                      <span>{categoryLabels[item.category]}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <label className="ai-evaluation-confirm">
                      <input
                        type="checkbox"
                        checked={item.confirmed}
                        onChange={(event) => { void saveItemPatch(item, { confirmed: event.target.checked }); }}
                      />
                      已复核
                    </label>
                  </div>

                  <p className="ai-evaluation-requirement">{item.requirementText}</p>
                  {expertScoresByItem.get(item.id)?.length ? (
                    <div className="ai-evaluation-expert-list" aria-label={`${item.title} 专家打分记录`}>
                      {expertScoresByItem.get(item.id)?.map((score) => (
                        <span key={score.id}>{score.expertName}：{score.score} 分{score.opinion ? `，${score.opinion}` : ''}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="ai-evaluation-score-row">
                    <div>
                      <span>满分</span>
                      <strong>{item.maxScore}</strong>
                    </div>
                    <div>
                      <span>规则自评</span>
                      <strong>{item.autoScore}</strong>
                    </div>
                    <label>
                      <span>人工分</span>
                      <input
                        type="number"
                        min={0}
                        max={item.maxScore}
                        step={0.1}
                        value={item.manualScore ?? ''}
                        placeholder="未调整"
                        onChange={(event) => patchLocalItem(item.id, { manualScore: clampScore(event.target.value, item.maxScore) })}
                        onBlur={(event) => { void saveItemPatch(item, { manualScore: clampScore(event.target.value, item.maxScore) }); }}
                      />
                    </label>
                    <label>
                      <span>风险等级</span>
                      <select
                        value={item.riskLevel}
                        onChange={(event) => { void saveItemPatch(item, { riskLevel: event.target.value as AiEvaluationRiskLevel }); }}
                      >
                        {Object.entries(riskLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="ai-evaluation-expert-editor">
                    <label>
                      <span>专家姓名</span>
                      <input
                        type="text"
                        value={expertDrafts[item.id]?.expertName || ''}
                        placeholder="例如：专家A"
                        onChange={(event) => updateExpertDraft(item.id, { expertName: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>专家分</span>
                      <input
                        type="number"
                        min={0}
                        max={item.maxScore}
                        step={0.1}
                        value={expertDrafts[item.id]?.score || ''}
                        placeholder={`0-${item.maxScore}`}
                        onChange={(event) => updateExpertDraft(item.id, { score: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>专家意见</span>
                      <input
                        type="text"
                        value={expertDrafts[item.id]?.opinion || ''}
                        placeholder="评分口径、分差原因或复核说明"
                        onChange={(event) => updateExpertDraft(item.id, { opinion: event.target.value })}
                      />
                    </label>
                    <button type="button" className="secondary-action" onClick={() => { void saveExpertScore(item); }}>
                      保存专家打分
                    </button>
                  </div>

                  <label className="ai-evaluation-field">
                    <span>证据摘录</span>
                    <textarea
                      value={item.evidence}
                      onChange={(event) => patchLocalItem(item.id, { evidence: event.target.value })}
                      onBlur={(event) => { void saveItemPatch(item, { evidence: event.target.value }); }}
                    />
                  </label>
                  <label className="ai-evaluation-field">
                    <span>扣分原因 / 复核意见</span>
                    <textarea
                      value={item.deductionReason}
                      onChange={(event) => patchLocalItem(item.id, { deductionReason: event.target.value })}
                      onBlur={(event) => { void saveItemPatch(item, { deductionReason: event.target.value }); }}
                    />
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel is-large">
              <strong>暂无 AI 评标评分表</strong>
              <span>从技术方案导入评分办法后生成评分表，再导入投标文件匹配响应证据。</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default AiEvaluationPage;
