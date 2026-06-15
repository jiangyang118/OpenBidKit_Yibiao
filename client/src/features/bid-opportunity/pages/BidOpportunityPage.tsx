import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type { BidOpportunity, BidOpportunityFollowUpPatch, BidOpportunityState, BidOpportunityStatus } from '../types';

const emptyState: BidOpportunityState = {
  opportunities: [],
  activeOpportunityId: null,
};

const statusLabels: Record<BidOpportunityStatus, string> = {
  pending: '待评估',
  tracking: '跟进中',
  abandoned: '已放弃',
  submitted: '已投标',
  won: '已中标',
  lost: '未中标',
};

const statusOptions: BidOpportunityStatus[] = ['pending', 'tracking', 'abandoned', 'submitted', 'won', 'lost'];

const fieldLabels: Array<[keyof BidOpportunity['parsedFields'], string]> = [
  ['projectName', '项目名称'],
  ['buyer', '采购人'],
  ['budget', '预算/限价'],
  ['region', '区域'],
  ['industry', '行业'],
  ['registrationDeadline', '报名截止'],
  ['bidDeadline', '投标截止'],
  ['qualification', '资格要求'],
  ['scoringSummary', '评分办法'],
];

const scoreBreakdownLabels: Array<[keyof BidOpportunity['scoreBreakdown'], string]> = [
  ['qualification', '资格匹配'],
  ['budget', '预算规模'],
  ['timing', '时间节奏'],
  ['region', '区域匹配'],
  ['delivery', '交付可行性'],
  ['competition', '竞争强度'],
  ['profit', '利润空间'],
  ['schedule', '工期可控性'],
  ['historicalSimilarity', '历史中标相似度'],
];

const sampleAnnouncement = `项目名称：产业园智慧运维平台建设项目
采购人：某产业园管理委员会
预算金额：3200万元
项目地点：广东省深圳市
行业：信息化、智慧园区、运维服务
投标截止：2026年07月08日 09:30
资格要求：投标人须具备类似智慧园区平台建设业绩，并提供软件著作权、项目团队和本地化服务承诺。
评分办法：商务资信 30 分，技术方案 50 分，报价 20 分。`;

function formatDateTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function summarizeStats(opportunities: BidOpportunity[]) {
  const trackingCount = opportunities.filter((item) => item.status === 'tracking').length;
  const averageScore = opportunities.length
    ? Math.round(opportunities.reduce((sum, item) => sum + item.score, 0) / opportunities.length)
    : 0;
  const highScoreCount = opportunities.filter((item) => item.score >= 80).length;
  return { trackingCount, averageScore, highScoreCount };
}

function BidOpportunityPage() {
  const { showToast } = useToast();
  const [state, setState] = useState<BidOpportunityState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<'rule' | 'ai' | null>(null);
  const [importingMode, setImportingMode] = useState<'document' | 'url' | null>(null);
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const activeOpportunity = useMemo(
    () => state.opportunities.find((item) => item.id === state.activeOpportunityId) || state.opportunities[0] || null,
    [state],
  );
  const stats = useMemo(() => summarizeStats(state.opportunities), [state.opportunities]);
  const reminderCount = useMemo(() => state.opportunities.filter((item) => item.reminderAt).length, [state.opportunities]);

  useEffect(() => {
    let canceled = false;
    const loadState = window.yibiao?.bidOpportunity?.loadState;
    setLoading(true);
    if (!loadState) {
      setLoading(false);
      return () => {
        canceled = true;
      };
    }
    loadState()
      .then((nextState) => {
        if (!canceled && nextState) setState(nextState);
      })
      .catch((error) => {
        if (!canceled) showToast(error?.message || '投标机会加载失败', 'error');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [showToast]);

  const saveOpportunity = async () => {
    if (!sourceText.trim()) {
      showToast('请先粘贴公告原文', 'info');
      return;
    }
    setSavingMode('rule');
    try {
      const saver = window.yibiao?.bidOpportunity?.saveOpportunity;
      if (!saver) {
        showToast('当前环境不支持保存投标机会，请在桌面客户端中使用', 'error');
        return;
      }
      const nextState = await saver({ title, sourceText });
      if (nextState) {
        setState(nextState);
        setTitle('');
        setSourceText('');
        showToast('投标机会已解析并保存', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '投标机会保存失败', 'error');
    } finally {
      setSavingMode(null);
    }
  };

  const saveOpportunityWithAi = async () => {
    if (!sourceText.trim()) {
      showToast('请先粘贴公告原文', 'info');
      return;
    }
    setSavingMode('ai');
    try {
      const saver = window.yibiao?.bidOpportunity?.saveOpportunityWithAi;
      if (!saver) {
        showToast('当前环境不支持 AI 解析公告，请在桌面客户端中使用', 'error');
        return;
      }
      const nextState = await saver({ title, sourceText });
      if (nextState) {
        setState(nextState);
        setTitle('');
        setSourceText('');
        showToast('投标机会已通过 AI 解析并保存', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '投标机会 AI 解析失败', 'error');
    } finally {
      setSavingMode(null);
    }
  };

  const importDocument = async () => {
    const importer = window.yibiao?.bidOpportunity?.importDocument;
    if (!importer) {
      showToast('当前环境不支持导入公告文件，请在桌面客户端中使用', 'error');
      return;
    }
    setImportingMode('document');
    try {
      const result = await importer();
      setState(result.state);
      showToast(result.message || (result.success ? '公告文件已导入' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '公告文件导入失败', 'error');
    } finally {
      setImportingMode(null);
    }
  };

  const importUrl = async () => {
    if (!sourceUrl.trim()) {
      showToast('请先填写公告 URL', 'info');
      return;
    }
    const importer = window.yibiao?.bidOpportunity?.importUrl;
    if (!importer) {
      showToast('当前环境不支持读取公告 URL，请在桌面客户端中使用', 'error');
      return;
    }
    setImportingMode('url');
    try {
      const result = await importer({ url: sourceUrl });
      setState(result.state);
      if (result.success) setSourceUrl('');
      showToast(result.message || (result.success ? '公告 URL 已导入' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '公告 URL 导入失败', 'error');
    } finally {
      setImportingMode(null);
    }
  };

  const updateStatus = async (id: string, status: BidOpportunityStatus) => {
    try {
      const nextState = await window.yibiao?.bidOpportunity?.updateStatus(id, status);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '状态更新失败', 'error');
    }
  };

  const patchLocalFollowUp = (id: string, patch: BidOpportunityFollowUpPatch) => {
    setState((prev) => ({
      ...prev,
      opportunities: prev.opportunities.map((item) => (
        item.id === id ? { ...item, ...patch } : item
      )),
    }));
  };

  const saveFollowUp = async (opportunity: BidOpportunity, patch: BidOpportunityFollowUpPatch) => {
    const nextPatch: BidOpportunityFollowUpPatch = {
      owner: opportunity.owner,
      nextAction: opportunity.nextAction,
      reminderAt: opportunity.reminderAt,
      ...patch,
    };
    patchLocalFollowUp(opportunity.id, nextPatch);
    try {
      const updater = window.yibiao?.bidOpportunity?.updateFollowUp;
      if (!updater) {
        showToast('当前环境不支持保存跟进信息，请在桌面客户端中使用', 'error');
        return;
      }
      const nextState = await updater(opportunity.id, nextPatch);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '跟进信息保存失败', 'error');
    }
  };

  const deleteOpportunity = async (id: string) => {
    try {
      const nextState = await window.yibiao?.bidOpportunity?.deleteOpportunity(id);
      if (nextState) setState(nextState);
      showToast('投标机会已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  const exportReport = async () => {
    if (!state.opportunities.length) {
      showToast('请先保存投标机会，再导出建议报告', 'info');
      return;
    }
    const exporter = window.yibiao?.bidOpportunity?.exportReport;
    if (!exporter) {
      showToast('当前环境不支持导出投标机会建议报告，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter();
      showToast(result.message || (result.success ? '投标机会建议报告已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '投标机会建议报告导出失败', 'error');
    }
  };

  const exportCalendar = async () => {
    if (!reminderCount) {
      showToast('请先为投标机会设置提醒时间，再导出日历', 'info');
      return;
    }
    const exporter = window.yibiao?.bidOpportunity?.exportCalendar;
    if (!exporter) {
      showToast('当前环境不支持导出提醒日历，请在桌面客户端中使用', 'error');
      return;
    }
    try {
      const result = await exporter();
      showToast(result.message || (result.success ? '投标机会提醒日历已导出' : '已取消导出'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '投标机会提醒日历导出失败', 'error');
    }
  };

  return (
    <div className="opportunity-workbench">
      <section className="opportunity-command-panel">
        <div className="opportunity-title-block">
          <span className="section-kicker">投标机会</span>
          <h2>公告录入、字段解析和投前判断</h2>
          <p>支持粘贴公告、导入公告文件或读取公告 URL，沉淀为结构化机会后按资格、预算、时间和交付可行性做初筛。</p>
        </div>
        <div className="opportunity-stat-strip" aria-label="投标机会统计">
          <article>
            <span>机会总数</span>
            <strong>{state.opportunities.length}</strong>
          </article>
          <article>
            <span>跟进中</span>
            <strong>{stats.trackingCount}</strong>
          </article>
          <article>
            <span>平均评分</span>
            <strong>{stats.averageScore}</strong>
          </article>
          <article>
            <span>重点机会</span>
            <strong>{stats.highScoreCount}</strong>
          </article>
        </div>
        <div className="opportunity-command-actions">
          <button type="button" className="secondary-action" onClick={exportReport} disabled={!state.opportunities.length}>
            导出投标建议报告
          </button>
          <button type="button" className="secondary-action" onClick={exportCalendar} disabled={!reminderCount}>
            导出提醒日历
          </button>
        </div>
      </section>

      <div className="opportunity-workspace-grid">
        <section className="opportunity-input-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">公告录入</span>
              <h3>新增投标机会</h3>
            </div>
            <button type="button" className="secondary-action" onClick={() => setSourceText(sampleAnnouncement)}>填入样例</button>
          </div>
          <label className="form-field">
            <span>机会标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="可选，留空时自动从公告识别" />
          </label>
          <label className="form-field">
            <span>公告 URL</span>
            <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
          </label>
          <div className="opportunity-import-actions">
            <button type="button" className="secondary-action" onClick={importDocument} disabled={savingMode !== null || importingMode !== null}>
              {importingMode === 'document' ? '正在导入文件...' : '导入公告文件'}
            </button>
            <button type="button" className="secondary-action" onClick={importUrl} disabled={savingMode !== null || importingMode !== null || !sourceUrl.trim()}>
              {importingMode === 'url' ? '正在读取 URL...' : '读取公告 URL'}
            </button>
          </div>
          <label className="form-field is-textarea">
            <span>公告原文</span>
            <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="粘贴招标公告、采购公告或线索文本" />
          </label>
          <div className="opportunity-import-actions">
            <button type="button" className="primary-action" onClick={saveOpportunityWithAi} disabled={savingMode !== null || importingMode !== null || !sourceText.trim()}>
              {savingMode === 'ai' ? 'AI 解析中...' : 'AI 解析并保存'}
            </button>
            <button type="button" className="secondary-action" onClick={saveOpportunity} disabled={savingMode !== null || importingMode !== null || !sourceText.trim()}>
              {savingMode === 'rule' ? '规则解析中...' : '规则解析保存'}
            </button>
          </div>
        </section>

        <section className="opportunity-list-panel">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">机会看板</span>
              <h3>线索列表</h3>
            </div>
            {loading ? <span className="demo-soft-pill">加载中</span> : null}
          </div>
          <div className="opportunity-real-list">
            {state.opportunities.length ? state.opportunities.map((item) => (
              <button
                type="button"
                className={`opportunity-real-card${activeOpportunity?.id === item.id ? ' is-active' : ''}`}
                key={item.id}
                onClick={() => setState((prev) => ({ ...prev, activeOpportunityId: item.id }))}
              >
                <span className={`opportunity-status is-${item.status}`}>{statusLabels[item.status]}</span>
                <strong>{item.title}</strong>
                <small>{item.parsedFields.region || '未识别区域'} · {item.recommendation}</small>
                <em>{item.score}</em>
              </button>
            )) : (
              <div className="empty-panel">
                <strong>暂无机会</strong>
                <span>粘贴公告后会在这里形成线索看板。</span>
              </div>
            )}
          </div>
        </section>

        <section className="opportunity-detail-panel">
          {activeOpportunity ? (
            <>
              <div className="panel-heading-row">
                <div>
                  <span className="section-kicker">机会详情</span>
                  <h3>{activeOpportunity.title}</h3>
                </div>
                <strong className="opportunity-score">{activeOpportunity.score}</strong>
              </div>

              <div className="opportunity-action-row">
                <select
                  value={activeOpportunity.status}
                  onChange={(event) => updateStatus(activeOpportunity.id, event.target.value as BidOpportunityStatus)}
                  aria-label="机会状态"
                >
                  {statusOptions.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                </select>
                <button type="button" className="secondary-action is-danger" onClick={() => deleteOpportunity(activeOpportunity.id)}>删除</button>
              </div>

              <div className="opportunity-follow-up-panel" aria-label="机会跟进信息">
                <label className="form-field">
                  <span>负责人</span>
                  <input
                    value={activeOpportunity.owner}
                    onChange={(event) => patchLocalFollowUp(activeOpportunity.id, { owner: event.target.value })}
                    onBlur={(event) => saveFollowUp(activeOpportunity, { owner: event.target.value })}
                    placeholder="填写跟进负责人"
                  />
                </label>
                <label className="form-field">
                  <span>提醒时间</span>
                  <input
                    type="datetime-local"
                    value={activeOpportunity.reminderAt}
                    onChange={(event) => patchLocalFollowUp(activeOpportunity.id, { reminderAt: event.target.value })}
                    onBlur={(event) => saveFollowUp(activeOpportunity, { reminderAt: event.target.value })}
                  />
                </label>
                <label className="form-field is-textarea">
                  <span>下一步动作</span>
                  <textarea
                    value={activeOpportunity.nextAction}
                    onChange={(event) => patchLocalFollowUp(activeOpportunity.id, { nextAction: event.target.value })}
                    onBlur={(event) => saveFollowUp(activeOpportunity, { nextAction: event.target.value })}
                    placeholder="例如：补充类似业绩、确认本地服务承诺、预约投标评审"
                  />
                </label>
              </div>

              <div className="opportunity-field-grid">
                {fieldLabels.map(([field, label]) => (
                  <article key={field} className={field === 'qualification' || field === 'scoringSummary' ? 'is-wide' : ''}>
                    <span>{label}</span>
                    <strong>{activeOpportunity.parsedFields[field] || '未识别'}</strong>
                  </article>
                ))}
              </div>

              <div className="opportunity-breakdown-panel" aria-label="评分拆解">
                <div>
                  <span className="section-kicker">评分拆解</span>
                  <strong>投前评分维度</strong>
                </div>
                <div className="opportunity-breakdown-grid">
                  {scoreBreakdownLabels.map(([field, label]) => (
                    <article key={field}>
                      <span>{label}</span>
                      <strong>{Number(activeOpportunity.scoreBreakdown?.[field] || 0)}</strong>
                    </article>
                  ))}
                </div>
              </div>

              <div className="opportunity-knowledge-panel" aria-label="知识库匹配">
                <div>
                  <span className="section-kicker">知识库匹配</span>
                  <strong>{activeOpportunity.knowledgeMatches?.length ? `匹配到 ${activeOpportunity.knowledgeMatches.length} 条历史资料` : '暂无匹配资料'}</strong>
                </div>
                <div className="opportunity-knowledge-list">
                  {activeOpportunity.knowledgeMatches?.length ? activeOpportunity.knowledgeMatches.map((match) => (
                    <article key={match.itemId}>
                      <strong>{match.title}</strong>
                      <span>匹配分 {match.score}{match.sourceFile ? ` · ${match.sourceFile}` : ''}</span>
                      {match.matchedKeywords?.length ? <small>命中：{match.matchedKeywords.join('、')}</small> : null}
                      {match.resume ? <p>{match.resume}</p> : null}
                    </article>
                  )) : <span className="is-empty">保存机会时会自动匹配企业知识库中的资质、业绩和历史项目资料。</span>}
                </div>
              </div>

              <div className="opportunity-risk-panel">
                <div>
                  <span className="section-kicker">投前建议</span>
                  <strong>{activeOpportunity.recommendation}</strong>
                  <small>更新时间：{formatDateTime(activeOpportunity.updatedAt)}</small>
                </div>
                <div className="opportunity-risk-list">
                  {activeOpportunity.risks.length ? activeOpportunity.risks.map((risk) => (
                    <span className={`is-${risk.level}`} key={risk.text}>{risk.text}</span>
                  )) : <span className="is-low">暂无明显风险，建议继续补充企业资质和历史业绩匹配。</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-panel is-large">
              <strong>选择或新增一个投标机会</strong>
              <span>系统会展示解析字段、评分、风险和跟进状态。</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default BidOpportunityPage;
