import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../shared/ui';
import type {
  BidOpportunity,
  BidOpportunityAttachmentKind,
  BidOpportunityFollowUpMethod,
  BidOpportunityFollowUpPatch,
  BidOpportunityFollowUpRecordInput,
  BidOpportunityState,
  BidOpportunityStatus,
} from '../types';

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

const followUpMethodLabels: Record<BidOpportunityFollowUpMethod, string> = {
  phone: '电话',
  wechat: '微信',
  email: '邮件',
  meeting: '会议',
  site: '现场',
  system: '系统',
  other: '其他',
};

const followUpMethodOptions: BidOpportunityFollowUpMethod[] = ['phone', 'wechat', 'email', 'meeting', 'site', 'system', 'other'];

const attachmentKindLabels: Record<BidOpportunityAttachmentKind, string> = {
  announcement: '公告附件',
  communication: '沟通附件',
  qualification: '资质附件',
  other: '其他附件',
};

const attachmentKindOptions: BidOpportunityAttachmentKind[] = ['announcement', 'communication', 'qualification', 'other'];

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

type OpportunityPanelId = 'input' | 'list' | 'detail';

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

function formatFileSize(value: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
  const [followUpDraft, setFollowUpDraft] = useState<BidOpportunityFollowUpRecordInput>({
    method: 'phone',
    content: '',
    nextAction: '',
    nextFollowUpAt: '',
    contactPerson: '',
  });
  const [attachmentKind, setAttachmentKind] = useState<BidOpportunityAttachmentKind>('announcement');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [importingAttachments, setImportingAttachments] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<OpportunityPanelId | null>(null);
  const [expandedPanels, setExpandedPanels] = useState<Record<OpportunityPanelId, boolean>>({
    input: true,
    list: true,
    detail: true,
  });

  const activeOpportunity = useMemo(
    () => state.opportunities.find((item) => item.id === state.activeOpportunityId) || state.opportunities[0] || null,
    [state],
  );
  const stats = useMemo(() => summarizeStats(state.opportunities), [state.opportunities]);
  const reminderCount = useMemo(() => state.opportunities.filter((item) => item.reminderAt).length, [state.opportunities]);
  const panelButtons = useMemo(
    () => [
      { id: 'input' as const, label: '录入全屏', meta: sourceText.trim() ? '有草稿' : '待录入' },
      { id: 'list' as const, label: '看板全屏', meta: `${state.opportunities.length} 条` },
      { id: 'detail' as const, label: '详情全屏', meta: activeOpportunity ? `${activeOpportunity.score} 分` : '未选择' },
    ],
    [activeOpportunity, sourceText, state.opportunities.length],
  );

  useEffect(() => {
    setFollowUpDraft({
      method: 'phone',
      content: '',
      nextAction: activeOpportunity?.nextAction || '',
      nextFollowUpAt: activeOpportunity?.reminderAt || '',
      owner: activeOpportunity?.owner || '',
      contactPerson: '',
    });
  }, [activeOpportunity?.id]);

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

  const addFollowUpRecord = async () => {
    if (!activeOpportunity) return;
    if (!String(followUpDraft.content || '').trim() && !String(followUpDraft.nextAction || '').trim()) {
      showToast('请填写本次沟通记录或下一步动作', 'info');
      return;
    }
    const creator = window.yibiao?.bidOpportunity?.addFollowUpRecord;
    if (!creator) {
      showToast('当前环境不支持保存跟进记录，请在桌面客户端中使用', 'error');
      return;
    }
    setSavingFollowUp(true);
    try {
      const nextState = await creator(activeOpportunity.id, {
        ...followUpDraft,
        owner: followUpDraft.owner || activeOpportunity.owner,
      });
      if (nextState) setState(nextState);
      setFollowUpDraft({
        method: 'phone',
        content: '',
        nextAction: '',
        nextFollowUpAt: '',
        owner: followUpDraft.owner || activeOpportunity.owner,
        contactPerson: '',
      });
      showToast('跟进记录已保存', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '跟进记录保存失败', 'error');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const deleteFollowUpRecord = async (id: string) => {
    try {
      const nextState = await window.yibiao?.bidOpportunity?.deleteFollowUpRecord(id);
      if (nextState) setState(nextState);
      showToast('跟进记录已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '跟进记录删除失败', 'error');
    }
  };

  const importAttachments = async () => {
    if (!activeOpportunity) return;
    const importer = window.yibiao?.bidOpportunity?.importAttachments;
    if (!importer) {
      showToast('当前环境不支持导入投标机会附件，请在桌面客户端中使用', 'error');
      return;
    }
    setImportingAttachments(true);
    try {
      const result = await importer(activeOpportunity.id, { kind: attachmentKind });
      setState(result.state);
      showToast(result.message || (result.success ? '附件已导入' : '已取消导入'), result.success ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '附件导入失败', 'error');
    } finally {
      setImportingAttachments(false);
    }
  };

  const updateAttachment = async (id: string, patch: { kind?: BidOpportunityAttachmentKind; note?: string }) => {
    try {
      const nextState = await window.yibiao?.bidOpportunity?.updateAttachment(id, patch);
      if (nextState) setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '附件更新失败', 'error');
    }
  };

  const patchLocalAttachment = (id: string, patch: { kind?: BidOpportunityAttachmentKind; note?: string }) => {
    setState((prev) => ({
      ...prev,
      opportunities: prev.opportunities.map((opportunity) => ({
        ...opportunity,
        attachments: opportunity.attachments?.map((attachment) => (
          attachment.id === id ? { ...attachment, ...patch } : attachment
        )),
      })),
    }));
  };

  const deleteAttachment = async (id: string) => {
    try {
      const nextState = await window.yibiao?.bidOpportunity?.deleteAttachment(id);
      if (nextState) setState(nextState);
      showToast('附件已删除', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '附件删除失败', 'error');
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

  const focusPanel = (panel: OpportunityPanelId) => {
    setFocusedPanel((current) => (current === panel ? null : panel));
    setExpandedPanels((prev) => ({ ...prev, [panel]: true }));
  };

  const togglePanel = (panel: OpportunityPanelId) => {
    const willCollapseFocusedPanel = expandedPanels[panel] && focusedPanel === panel;
    if (willCollapseFocusedPanel) setFocusedPanel(null);
    setExpandedPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const panelClassName = (panel: OpportunityPanelId, baseClassName: string) => [
    baseClassName,
    'opportunity-panel-shell',
    expandedPanels[panel] ? 'is-expanded' : 'is-collapsed',
    focusedPanel === panel ? 'is-focused' : '',
    focusedPanel && focusedPanel !== panel ? 'is-hidden-by-focus' : '',
  ].filter(Boolean).join(' ');

  const workspaceClassName = [
    'opportunity-workspace-grid',
    focusedPanel ? `is-focused is-focused-${focusedPanel}` : '',
  ].filter(Boolean).join(' ');

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
        <div className="opportunity-focus-switcher" aria-label="投标机会显示模式">
          {panelButtons.map((button) => (
            <button
              type="button"
              className={`opportunity-focus-button${focusedPanel === button.id ? ' is-active' : ''}`}
              onClick={() => focusPanel(button.id)}
              key={button.id}
            >
              <strong>{button.label}</strong>
              <span>{button.meta}</span>
            </button>
          ))}
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

      <div className={workspaceClassName}>
        <section className={panelClassName('input', 'opportunity-input-panel')} aria-label="公告录入面板">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">公告录入</span>
              <h3>新增投标机会</h3>
              <small>{sourceText.trim() ? '已有公告草稿，可继续解析保存。' : '粘贴公告、导入文件或读取 URL。'}</small>
            </div>
            <div className="opportunity-panel-actions">
              <button type="button" className="secondary-action" onClick={() => focusPanel('input')}>
                {focusedPanel === 'input' ? '退出全屏' : '全屏'}
              </button>
              <button type="button" className="secondary-action" onClick={() => togglePanel('input')}>
                {expandedPanels.input ? '收起' : '展开'}
              </button>
            </div>
          </div>
          <div className="opportunity-panel-body">
            <div className="opportunity-inline-actions">
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
          </div>
        </section>

        <section className={panelClassName('list', 'opportunity-list-panel')} aria-label="机会看板面板">
          <div className="panel-heading-row">
            <div>
              <span className="section-kicker">机会看板</span>
              <h3>线索列表</h3>
              <small>{state.opportunities.length ? `${state.opportunities.length} 条机会，点击卡片查看详情。` : '暂无机会。'}</small>
            </div>
            <div className="opportunity-panel-actions">
              {loading ? <span className="demo-soft-pill">加载中</span> : null}
              <button type="button" className="secondary-action" onClick={() => focusPanel('list')}>
                {focusedPanel === 'list' ? '退出全屏' : '全屏'}
              </button>
              <button type="button" className="secondary-action" onClick={() => togglePanel('list')}>
                {expandedPanels.list ? '收起' : '展开'}
              </button>
            </div>
          </div>
          <div className="opportunity-panel-body">
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
          </div>
        </section>

        <section className={panelClassName('detail', 'opportunity-detail-panel')} aria-label="机会详情面板">
          {activeOpportunity ? (
            <>
              <div className="panel-heading-row">
                <div>
                  <span className="section-kicker">机会详情</span>
                  <h3>{activeOpportunity.title}</h3>
                  <small>{activeOpportunity.parsedFields.region || '未识别区域'} · {activeOpportunity.recommendation}</small>
                </div>
                <div className="opportunity-panel-actions">
                  <strong className="opportunity-score">{activeOpportunity.score}</strong>
                  <button type="button" className="secondary-action" onClick={() => focusPanel('detail')}>
                    {focusedPanel === 'detail' ? '退出全屏' : '全屏'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => togglePanel('detail')}>
                    {expandedPanels.detail ? '收起' : '展开'}
                  </button>
                </div>
              </div>

              <div className="opportunity-panel-body">
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

              <div className="opportunity-follow-history-panel" aria-label="多轮跟进记录">
                <div className="opportunity-panel-title-row">
                  <div>
                    <span className="section-kicker">持续跟进</span>
                    <strong>新增跟进记录</strong>
                  </div>
                  <button type="button" className="secondary-action" onClick={addFollowUpRecord} disabled={savingFollowUp}>
                    {savingFollowUp ? '保存中...' : '保存记录'}
                  </button>
                </div>
                <div className="opportunity-follow-up-form">
                  <label className="form-field">
                    <span>方式</span>
                    <select
                      value={followUpDraft.method || 'other'}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, method: event.target.value as BidOpportunityFollowUpMethod }))}
                    >
                      {followUpMethodOptions.map((method) => <option value={method} key={method}>{followUpMethodLabels[method]}</option>)}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>跟进负责人</span>
                    <input
                      value={followUpDraft.owner || ''}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, owner: event.target.value }))}
                      placeholder="默认使用机会负责人"
                    />
                  </label>
                  <label className="form-field">
                    <span>沟通对象</span>
                    <input
                      value={followUpDraft.contactPerson || ''}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, contactPerson: event.target.value }))}
                      placeholder="采购人、代理、内部评审人"
                    />
                  </label>
                  <label className="form-field">
                    <span>下次跟进</span>
                    <input
                      type="datetime-local"
                      value={followUpDraft.nextFollowUpAt || ''}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, nextFollowUpAt: event.target.value }))}
                    />
                  </label>
                  <label className="form-field is-textarea">
                    <span>本次沟通记录</span>
                    <textarea
                      value={followUpDraft.content || ''}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, content: event.target.value }))}
                      placeholder="记录公告补充、资格确认、客户沟通、内部评审意见等"
                    />
                  </label>
                  <label className="form-field is-textarea">
                    <span>记录下一步动作</span>
                    <textarea
                      value={followUpDraft.nextAction || ''}
                      onChange={(event) => setFollowUpDraft((prev) => ({ ...prev, nextAction: event.target.value }))}
                      placeholder="例如：补充业绩证明、拉商务报价、确认开标时间"
                    />
                  </label>
                </div>
                <div className="opportunity-follow-record-list">
                  {activeOpportunity.followUps?.length ? activeOpportunity.followUps.map((record) => (
                    <article key={record.id}>
                      <div>
                        <strong>{formatDateTime(record.occurredAt) || '未记录时间'} · {followUpMethodLabels[record.method]}</strong>
                        <button type="button" className="link-button is-danger" onClick={() => deleteFollowUpRecord(record.id)}>删除</button>
                      </div>
                      <span>{record.owner || '未指定负责人'}{record.contactPerson ? ` · ${record.contactPerson}` : ''}</span>
                      {record.content ? <p>{record.content}</p> : null}
                      {record.nextAction || record.nextFollowUpAt ? <small>下一步：{record.nextAction || '未填写'}{record.nextFollowUpAt ? ` · ${formatDateTime(record.nextFollowUpAt)}` : ''}</small> : null}
                    </article>
                  )) : <span className="is-empty">暂无跟进记录。保存沟通记录后，会同步进入导出的投标建议报告。</span>}
                </div>
              </div>

              <div className="opportunity-attachment-panel" aria-label="公告和沟通附件">
                <div className="opportunity-panel-title-row">
                  <div>
                    <span className="section-kicker">附件</span>
                    <strong>公告/沟通附件</strong>
                  </div>
                  <div className="opportunity-attachment-actions">
                    <select value={attachmentKind} onChange={(event) => setAttachmentKind(event.target.value as BidOpportunityAttachmentKind)}>
                      {attachmentKindOptions.map((kind) => <option value={kind} key={kind}>{attachmentKindLabels[kind]}</option>)}
                    </select>
                    <button type="button" className="secondary-action" onClick={importAttachments} disabled={importingAttachments}>
                      {importingAttachments ? '导入中...' : '导入附件'}
                    </button>
                  </div>
                </div>
                <div className="opportunity-attachment-list">
                  {activeOpportunity.attachments?.length ? activeOpportunity.attachments.map((attachment) => (
                    <article key={attachment.id}>
                      <div className="opportunity-attachment-main">
                        <strong>{attachment.fileName}</strong>
                        <span>{formatFileSize(attachment.fileSize)} · {attachment.storedPath}</span>
                      </div>
                      <select
                        value={attachment.kind}
                        onChange={(event) => {
                          const kind = event.target.value as BidOpportunityAttachmentKind;
                          patchLocalAttachment(attachment.id, { kind });
                          void updateAttachment(attachment.id, { kind });
                        }}
                      >
                        {attachmentKindOptions.map((kind) => <option value={kind} key={kind}>{attachmentKindLabels[kind]}</option>)}
                      </select>
                      <input
                        value={attachment.note}
                        onChange={(event) => patchLocalAttachment(attachment.id, { note: event.target.value })}
                        onBlur={(event) => updateAttachment(attachment.id, { note: event.target.value })}
                        placeholder="附件说明"
                      />
                      <button type="button" className="link-button is-danger" onClick={() => deleteAttachment(attachment.id)}>删除</button>
                    </article>
                  )) : <span className="is-empty">暂无附件。可导入公告原文、答疑截图、客户沟通记录或内部评审资料。</span>}
                </div>
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
              </div>
            </>
          ) : (
            <>
              <div className="panel-heading-row">
                <div>
                  <span className="section-kicker">机会详情</span>
                  <h3>选择或新增一个投标机会</h3>
                  <small>系统会展示解析字段、评分、风险和跟进状态。</small>
                </div>
                <div className="opportunity-panel-actions">
                  <button type="button" className="secondary-action" onClick={() => focusPanel('detail')}>
                    {focusedPanel === 'detail' ? '退出全屏' : '全屏'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => togglePanel('detail')}>
                    {expandedPanels.detail ? '收起' : '展开'}
                  </button>
                </div>
              </div>
              <div className="opportunity-panel-body">
                <div className="empty-panel is-large">
                  <strong>选择或新增一个投标机会</strong>
                  <span>系统会展示解析字段、评分、风险和跟进状态。</span>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default BidOpportunityPage;
