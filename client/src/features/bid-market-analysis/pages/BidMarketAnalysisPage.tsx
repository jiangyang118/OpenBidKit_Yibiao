import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BidMarketAnalysisState,
  BidMarketCompanySummary,
  BidMarketProductDetail,
  BidMarketRecordDetail,
} from '../types';

const metricLabels: Array<[keyof BidMarketAnalysisState['metrics'], string]> = [
  ['marketRecords', '市场记录'],
  ['products', '产品/设备'],
  ['qualifications', '公司资质'],
  ['riskFlags', '风险红旗'],
  ['opportunityScores', '商机评分'],
  ['linkedOpportunities', '已关联投标机会'],
  ['linkedKnowledgeDocuments', '已关联知识库文档'],
  ['existingBidOpportunities', '现有投标机会'],
  ['existingKnowledgeDocuments', '现有知识库文档'],
  ['existingKnowledgeItems', '现有知识条目'],
];

const numberFormatter = new Intl.NumberFormat('zh-CN');
const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
});

const boardTabs = [
  { id: 'overview', label: '总览趋势' },
  { id: 'customer', label: '客户类型' },
  { id: 'entity', label: '采购单位' },
  { id: 'supplier', label: '供应商' },
  { id: 'topic', label: '主题与品类' },
  { id: 'records', label: '项目明细' },
] as const;

type BidMarketBoardId = typeof boardTabs[number]['id'];

interface ChartRow {
  label: string;
  value: number;
  secondary?: string;
}

interface TrendPoint {
  label: string;
  amount: number;
  records: number;
}

type BidMarketDetailView =
  | {
      kind: 'records';
      title: string;
      subtitle: string;
      rows: BidMarketRecordDetail[];
    }
  | {
      kind: 'products';
      title: string;
      subtitle: string;
      rows: BidMarketProductDetail[];
    }
  | {
      kind: 'companies';
      title: string;
      subtitle: string;
      rows: BidMarketCompanySummary[];
    };

function formatNumber(value?: number | null) {
  return numberFormatter.format(Number(value || 0));
}

function formatMoney(value?: number | null) {
  return moneyFormatter.format(Number(value || 0));
}

function getMonth(value?: string) {
  return String(value || '').slice(0, 7) || '未记录';
}

function sortByValue<T extends { value: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.value - a.value);
}

function groupRecords(
  records: BidMarketRecordDetail[],
  getKey: (record: BidMarketRecordDetail) => string,
  value: 'records' | 'amount',
): ChartRow[] {
  const map = new Map<string, number>();
  for (const record of records) {
    const key = getKey(record) || '未命名';
    const nextValue = value === 'amount' ? Number(record.amount || 0) : 1;
    map.set(key, (map.get(key) || 0) + nextValue);
  }
  return sortByValue(Array.from(map.entries()).map(([label, rowValue]) => ({ label, value: rowValue })));
}

function getMonthTrend(records: BidMarketRecordDetail[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const record of records) {
    const label = getMonth(record.publishDate);
    const current = map.get(label) || { label, amount: 0, records: 0 };
    current.amount += Number(record.amount || 0);
    current.records += 1;
    map.set(label, current);
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function getKeywordRows(records: BidMarketRecordDetail[]): ChartRow[] {
  const keywords = [
    '智慧食堂', '食堂', '刷脸', '消费机', '支付', '监管', '设备', '系统', '平台', '运维',
    '硬件', '机器人', '银医', '金融', '后勤', '菜品', '订餐', '结算', '营养', '监控',
    '厨房', '一卡通', '收银', '接口', '维保', '食材', '运营',
  ];
  return keywords
    .map((keyword) => {
      const value = records.reduce((sum, record) => {
        const text = `${record.projectName || ''}${record.productSummary || ''}${record.demandType || ''}`;
        return sum + (text.includes(keyword) ? 1 : 0);
      }, 0);
      return { label: keyword, value };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 18);
}

function MiniBarList({ rows, valueType = 'number', limit = 10 }: { rows: ChartRow[]; valueType?: 'number' | 'money'; limit?: number }) {
  const visibleRows = rows.slice(0, limit);
  const max = Math.max(...visibleRows.map((row) => row.value), 1);
  return (
    <div className="bid-market-mini-bars">
      {visibleRows.map((row) => (
        <div className="bid-market-mini-bar" key={row.label}>
          <div>
            <strong title={row.label}>{row.label || '未命名'}</strong>
            <span>{valueType === 'money' ? formatMoney(row.value) : formatNumber(row.value)}{row.secondary ? ` · ${row.secondary}` : ''}</span>
          </div>
          <i><b style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

function MiniLineChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(...data.map((item) => item.amount), 1);
  const width = 720;
  const height = 180;
  const points = data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - (item.amount / max) * (height - 28) - 14;
    return { ...item, x, y };
  });
  const path = points.map((item) => `${item.x},${item.y}`).join(' ');
  return (
    <div className="bid-market-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="中标金额趋势">
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="3" />
        {points.map((item) => (
          <g key={item.label}>
            <circle cx={item.x} cy={item.y} r="4" />
            <text x={item.x} y={height - 2} textAnchor="middle">{item.label.slice(5)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BidMarketAnalysisPage() {
  const [state, setState] = useState<BidMarketAnalysisState | null>(null);
  const [detailView, setDetailView] = useState<BidMarketDetailView | null>(null);
  const [activeBoard, setActiveBoard] = useState<BidMarketBoardId>('overview');
  const [selectedCustomerType, setSelectedCustomerType] = useState('');
  const [selectedDemandTypes, setSelectedDemandTypes] = useState<string[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState('');
  const [topLimit, setTopLimit] = useState(12);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    if (!window.yibiao?.bidMarketAnalysis) {
      setError('当前运行环境未暴露招投标分析接口');
      return () => {
        disposed = true;
      };
    }
    window.yibiao.bidMarketAnalysis.loadState()
      .then((nextState) => {
        if (!disposed) setState(nextState);
      })
      .catch((nextError) => {
        if (!disposed) setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    return () => {
      disposed = true;
    };
  }, []);

  const openExternal = (url: string) => {
    if (window.yibiao?.openExternal) {
      void window.yibiao.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const records = state?.detailData.records ?? [];
  const products = state?.detailData.products ?? [];
  const buyers = state?.detailData.buyers ?? [];
  const suppliers = state?.detailData.suppliers ?? [];

  const demandTypes = useMemo(() => Array.from(new Set(records.map((record) => record.demandType).filter(Boolean))).sort(), [records]);
  const customerTypes = useMemo(() => Array.from(new Set(records.map((record) => record.customerType || '未识别').filter(Boolean))).sort(), [records]);
  const filteredRecords = useMemo(() => records.filter((record) => {
    if (selectedCustomerType && (record.customerType || '未识别') !== selectedCustomerType) return false;
    if (selectedDemandTypes.length && !selectedDemandTypes.includes(record.demandType)) return false;
    if (selectedBuyer && record.buyerName !== selectedBuyer) return false;
    return true;
  }), [records, selectedBuyer, selectedCustomerType, selectedDemandTypes]);
  const buyerOptions = useMemo(() => {
    const scopedRecords = records.filter((record) => !selectedCustomerType || (record.customerType || '未识别') === selectedCustomerType);
    return groupRecords(scopedRecords, (record) => record.buyerName, 'records').slice(0, 80).map((row) => row.label);
  }, [records, selectedCustomerType]);
  const selectedBuyerRecords = useMemo(() => selectedBuyer
    ? records.filter((record) => record.buyerName === selectedBuyer)
    : filteredRecords, [filteredRecords, records, selectedBuyer]);
  const summaryStats = useMemo(() => {
    const amounts = records.map((record) => Number(record.amount || 0)).filter((value) => value > 0);
    const months = records.map((record) => getMonth(record.publishDate)).filter((value) => value !== '未记录').sort();
    return {
      buyers: new Set(records.map((record) => record.buyerName).filter(Boolean)).size,
      suppliers: new Set(records.map((record) => record.supplierName).filter(Boolean)).size,
      minAmount: amounts.length ? Math.min(...amounts) : 0,
      maxAmount: amounts.length ? Math.max(...amounts) : 0,
      minMonth: months[0] || '未记录',
      maxMonth: months[months.length - 1] || '未记录',
    };
  }, [records]);
  const trend = useMemo(() => getMonthTrend(filteredRecords), [filteredRecords]);
  const customerTypeRows = useMemo(() => groupRecords(records, (record) => record.customerType || '未识别', 'records')
    .map((row) => ({
      ...row,
      secondary: formatMoney(records.filter((record) => (record.customerType || '未识别') === row.label).reduce((sum, record) => sum + Number(record.amount || 0), 0)),
    })), [records]);
  const supplierFrequencyRows = useMemo(() => groupRecords(filteredRecords, (record) => record.supplierName, 'records'), [filteredRecords]);
  const supplierAmountRows = useMemo(() => groupRecords(filteredRecords, (record) => record.supplierName, 'amount'), [filteredRecords]);
  const buyerAmountRows = useMemo(() => groupRecords(filteredRecords, (record) => record.buyerName, 'amount'), [filteredRecords]);
  const selectedBuyerSupplierRows = useMemo(() => groupRecords(selectedBuyerRecords, (record) => record.supplierName, 'records'), [selectedBuyerRecords]);
  const selectedBuyerSupplierAmountRows = useMemo(() => groupRecords(selectedBuyerRecords, (record) => record.supplierName, 'amount'), [selectedBuyerRecords]);
  const keywordRows = useMemo(() => getKeywordRows(filteredRecords), [filteredRecords]);
  const productCategoryRows = useMemo(() => {
    const scopedRecordIds = new Set(filteredRecords.map((record) => record.recordId));
    const scopedProducts = products.filter((product) => scopedRecordIds.has(product.recordId));
    const map = new Map<string, number>();
    for (const product of scopedProducts) {
      const key = product.category || '未标注品类';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return sortByValue(Array.from(map.entries()).map(([label, value]) => ({ label, value })));
  }, [filteredRecords, products]);

  const toggleDemandType = (demandType: string) => {
    setSelectedDemandTypes((prev) => prev.includes(demandType) ? prev.filter((item) => item !== demandType) : [...prev, demandType]);
  };

  const showRecords = (title = '市场记录明细', subtitle = '按公告日期倒序展示全部市场记录。', rows = records) => {
    setDetailView({ kind: 'records', title, subtitle, rows });
  };

  const showProducts = (title = '产品/设备明细', subtitle = '按关联市场记录日期倒序展示全部产品、设备和品名抽取结果。', rows = products) => {
    setDetailView({ kind: 'products', title, subtitle, rows });
  };

  const showCompanies = (title: string, subtitle: string, rows: BidMarketCompanySummary[]) => {
    setDetailView({ kind: 'companies', title, subtitle, rows });
  };

  const metricAction = (key: keyof BidMarketAnalysisState['metrics']) => {
    if (key === 'marketRecords') return () => showRecords();
    if (key === 'products') return () => showProducts();
    return null;
  };

  const renderBoard = () => {
    if (activeBoard === 'overview') {
      return (
        <section className="bid-market-board-grid">
          <div className="bid-market-analysis-card is-wide">
            <div className="bid-market-card-head">
              <h3>月度中标金额趋势</h3>
              <p>对应 Dash 首页的时间序列图，按当前筛选条件汇总金额和记录数。</p>
            </div>
            <MiniLineChart data={trend} />
            <div className="bid-market-trend-meta">
              {trend.map((item) => (
                <span key={item.label}>{item.label}：{formatNumber(item.records)} 条 / {formatMoney(item.amount)}</span>
              ))}
            </div>
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>数据概览</h3>
              <p>采购单位、供应商、金额和时间范围。</p>
            </div>
            <div className="bid-market-summary-grid">
              <article><span>采购单位</span><strong>{formatNumber(summaryStats.buyers)}</strong></article>
              <article><span>中标供应商</span><strong>{formatNumber(summaryStats.suppliers)}</strong></article>
              <article><span>金额范围</span><strong>{formatMoney(summaryStats.minAmount)} - {formatMoney(summaryStats.maxAmount)}</strong></article>
              <article><span>公告月份</span><strong>{summaryStats.minMonth} - {summaryStats.maxMonth}</strong></article>
            </div>
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>采购单位金额排行</h3>
              <p>按当前筛选后的累计中标金额排序。</p>
            </div>
            <MiniBarList rows={buyerAmountRows} valueType="money" limit={topLimit} />
          </div>
        </section>
      );
    }

    if (activeBoard === 'customer') {
      return (
        <section className="bid-market-board-grid">
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>客户类型分布</h3>
              <p>对应 Dash 的客户类型筛选与聚类视图。</p>
            </div>
            <MiniBarList rows={customerTypeRows} limit={customerTypeRows.length} />
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>{selectedCustomerType || '全部客户类型'} 采购单位</h3>
              <p>选择客户类型后，仅展示该类型下的采购单位。</p>
            </div>
            <MiniBarList rows={groupRecords(filteredRecords, (record) => record.buyerName, 'records')} limit={topLimit} />
          </div>
          <div className="bid-market-analysis-card is-wide">
            <div className="bid-market-card-head">
              <h3>客户类型趋势</h3>
              <p>当前筛选范围内的月度金额变化。</p>
            </div>
            <MiniLineChart data={trend} />
          </div>
        </section>
      );
    }

    if (activeBoard === 'entity') {
      return (
        <section className="bid-market-board-grid">
          <div className="bid-market-analysis-card is-wide">
            <div className="bid-market-card-head">
              <h3>{selectedBuyer || '采购单位'} 年月金额分布</h3>
              <p>选择采购单位后，查看该单位的供应商、金额和项目走势。</p>
            </div>
            <MiniLineChart data={getMonthTrend(selectedBuyerRecords)} />
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>供应商中标次数排行</h3>
              <p>{selectedBuyer ? `${selectedBuyer} 的供应商频次。` : '未选择采购单位时显示当前筛选范围。'}</p>
            </div>
            <MiniBarList rows={selectedBuyerSupplierRows} limit={topLimit} />
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>供应商累计金额排行</h3>
              <p>对应 Dash 的 Vendors by Awarded Amount 图。</p>
            </div>
            <MiniBarList rows={selectedBuyerSupplierAmountRows} valueType="money" limit={topLimit} />
          </div>
        </section>
      );
    }

    if (activeBoard === 'supplier') {
      return (
        <section className="bid-market-board-grid">
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>供应商中标次数</h3>
              <p>对应 Dash 的 Tender Frequency Count by Vendor。</p>
            </div>
            <MiniBarList rows={supplierFrequencyRows} limit={topLimit} />
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>供应商中标金额</h3>
              <p>按当前筛选范围汇总供应商累计金额。</p>
            </div>
            <MiniBarList rows={supplierAmountRows} valueType="money" limit={topLimit} />
          </div>
          <div className="bid-market-analysis-card is-wide">
            <div className="bid-market-card-head">
              <h3>供应商参与项目</h3>
              <p>点击下方记录可以进入项目明细。</p>
            </div>
            <table className="bid-market-table">
              <thead><tr><th>项目</th><th>采购单位</th><th>供应商</th><th>金额</th></tr></thead>
              <tbody>
                {filteredRecords.slice(0, topLimit).map((record) => (
                  <tr key={record.recordId} className="bid-market-click-row" onClick={() => showRecords(record.projectName, '查看该项目所在筛选范围。', [record])}>
                    <td>{record.projectName}</td>
                    <td>{record.buyerName || '未命名'}</td>
                    <td>{record.supplierName || '未命名'}</td>
                    <td>{formatMoney(record.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (activeBoard === 'topic') {
      return (
        <section className="bid-market-board-grid">
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>项目主题词</h3>
              <p>替代 Dash 词云，在本地按项目名称和产品摘要统计。</p>
            </div>
            <div className="bid-market-keyword-cloud">
              {keywordRows.map((row, index) => (
                <button type="button" key={row.label} style={{ '--weight': Math.max(1, 7 - index % 7) } as CSSProperties} onClick={() => showRecords(`${row.label} 相关项目`, `项目名称或产品摘要包含“${row.label}”的市场记录。`, filteredRecords.filter((record) => `${record.projectName}${record.productSummary}${record.demandType}`.includes(row.label)))}>
                  {row.label}<span>{row.value}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bid-market-analysis-card">
            <div className="bid-market-card-head">
              <h3>产品品类</h3>
              <p>从产品/设备抽取结果中统计品名类别。</p>
            </div>
            <MiniBarList rows={productCategoryRows} limit={topLimit} />
          </div>
          <div className="bid-market-analysis-card is-wide">
            <div className="bid-market-card-head">
              <h3>品类关联项目</h3>
              <p>点击品类分布表也可钻取到每条市场记录。</p>
            </div>
            <table className="bid-market-table">
              <thead><tr><th>品类</th><th>记录</th><th>金额</th></tr></thead>
              <tbody>
                {(state?.importedData.demandBreakdown ?? []).map((row) => (
                  <tr key={row.demandType} className="bid-market-click-row" onClick={() => showRecords(`${row.demandType} 明细`, `查看 ${row.demandType} 下的每一条市场记录。`, records.filter((record) => record.demandType === row.demandType))}>
                    <td>{row.demandType}</td>
                    <td>{formatNumber(row.records)}</td>
                    <td>{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    return (
      <section className="bid-market-analysis-card is-full">
        <div className="bid-market-card-head">
          <h3>项目明细</h3>
          <p>当前筛选范围内共 {formatNumber(filteredRecords.length)} 条市场记录。</p>
        </div>
        <table className="bid-market-table bid-market-detail-table">
          <thead><tr><th>日期</th><th>项目</th><th>采购单位</th><th>供应商</th><th>需求类型</th><th>金额</th></tr></thead>
          <tbody>
            {filteredRecords.slice(0, Math.max(topLimit, 20)).map((record) => (
              <tr key={record.recordId} className="bid-market-click-row" onClick={() => showRecords(record.projectName, '查看该项目记录。', [record])}>
                <td>{record.publishDate || '未记录'}</td>
                <td>{record.projectName}</td>
                <td>{record.buyerName || '未命名'}</td>
                <td>{record.supplierName || '未命名'}</td>
                <td>{record.demandType || '未标注'}</td>
                <td>{formatMoney(record.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };

  const renderDetail = () => {
    if (!detailView) return null;
    return (
      <section className="bid-market-panel bid-market-detail-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>{detailView.title}</h3>
            <p>{detailView.subtitle}</p>
          </div>
          <strong>{formatNumber(detailView.rows.length)} 条</strong>
        </div>
        {detailView.kind === 'records' ? (
          <div className="bid-market-detail-list">
            {detailView.rows.map((record) => (
              <article key={record.recordId} className="bid-market-detail-card">
                <div className="bid-market-detail-card-head">
                  <div>
                    <span>{record.publishDate || '未记录日期'} · {record.demandType || '未标注品类'} · {record.customerType || '未识别客户类型'}</span>
                    <h4>{record.projectName}</h4>
                  </div>
                  <strong>{formatMoney(record.amount)}</strong>
                </div>
                <dl className="bid-market-detail-meta">
                  <div><dt>采购单位</dt><dd>{record.buyerName || '未命名'}</dd></div>
                  <div><dt>中标供应商</dt><dd>{record.supplierName || '未命名'}</dd></div>
                  <div><dt>地区</dt><dd>{[record.province, record.city, record.district].filter(Boolean).join(' / ') || '未记录'}</dd></div>
                  <div><dt>阶段</dt><dd>{record.stage || '未记录'}</dd></div>
                </dl>
                {record.sourceUrl ? (
                  <button type="button" className="secondary-action" onClick={() => openExternal(record.sourceUrl)}>打开来源公告</button>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
        {detailView.kind === 'products' ? (
          <div className="bid-market-detail-list">
            {detailView.rows.map((product) => (
              <article key={product.productId} className="bid-market-detail-card">
                <div className="bid-market-detail-card-head">
                  <div>
                    <span>{product.publishDate || '未记录日期'} · {product.category || '未标注品类'}</span>
                    <h4>{product.name}</h4>
                  </div>
                  <strong>{formatMoney(product.amount)}</strong>
                </div>
                <dl className="bid-market-detail-meta">
                  <div><dt>采购单位</dt><dd>{product.buyerName || '未命名'}</dd></div>
                  <div><dt>中标供应商</dt><dd>{product.supplierName || '未命名'}</dd></div>
                  <div><dt>软件功能</dt><dd>{product.softwareFeatures || '[]'}</dd></div>
                  <div><dt>硬件规格</dt><dd>{product.hardwareSpecs || '[]'}</dd></div>
                </dl>
                <p>{product.evidence || '暂无证据摘要'}</p>
              </article>
            ))}
          </div>
        ) : null}
        {detailView.kind === 'companies' ? (
          <table className="bid-market-table bid-market-detail-table">
            <thead><tr><th>名称</th><th>类型</th><th>品类</th><th>记录</th><th>金额</th><th>最近日期</th></tr></thead>
            <tbody>
              {detailView.rows.map((company) => (
                <tr key={`${company.role}-${company.name || 'unnamed'}-${company.customerType || ''}`}>
                  <td>{company.name || '未命名'}</td>
                  <td>{company.role === 'buyer' ? (company.customerType || '采购单位') : '中标供应商'}</td>
                  <td>{company.demandTypes || '未标注'}</td>
                  <td>{formatNumber(company.records)}</td>
                  <td>{formatMoney(company.amount)}</td>
                  <td>{company.latestDate || '未记录'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    );
  };

  if (detailView) {
    return (
      <div className="bid-market-page page-stack">
        <section className="bid-market-hero bid-market-detail-hero">
          <div>
            <span>招投标分析</span>
            <h2>{detailView.title}</h2>
            <p>{detailView.subtitle}</p>
          </div>
          <button type="button" className="secondary-action" onClick={() => setDetailView(null)}>返回概览</button>
        </section>
        {renderDetail()}
      </div>
    );
  }

  return (
    <div className="bid-market-page page-stack">
      <section className="bid-market-hero">
        <div>
          <span>招投标分析</span>
          <h2>市场扫描、商机评分和风险红旗</h2>
          <p>把外部招投标数据沉淀成市场记录、产品参数、公司资质和风险项，并与投标机会、知识库保持关联。</p>
        </div>
      </section>

      {error ? <div className="bid-market-error">{error}</div> : null}

      <section className="bid-market-grid">
        {metricLabels.map(([key, label]) => {
          const action = metricAction(key);
          if (action) {
            return (
              <button key={key} type="button" className="bid-market-metric bid-market-clickable" onClick={action}>
                <span>{label}</span>
                <strong>{formatNumber(state?.metrics[key])}</strong>
              </button>
            );
          }
          return (
            <article key={key} className="bid-market-metric">
              <span>{label}</span>
              <strong>{formatNumber(state?.metrics[key])}</strong>
            </article>
          );
        })}
      </section>

      <section className="bid-market-panel bid-market-workbench">
        <div className="bid-market-panel-head">
          <div>
            <h3>内置分析工作台</h3>
            <p>已把 8050 看板中的筛选、趋势、客户类型、采购单位、供应商、主题词和项目详情迁入当前页面。</p>
          </div>
          <strong>{formatNumber(filteredRecords.length)} 条记录</strong>
        </div>
        <div className="bid-market-board-tabs" role="tablist" aria-label="招投标分析板块">
          {boardTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={activeBoard === tab.id ? 'is-active' : ''}
              onClick={() => setActiveBoard(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bid-market-filter-bar">
          <label>
            <span>客户类型</span>
            <select
              value={selectedCustomerType}
              onChange={(event) => {
                setSelectedCustomerType(event.target.value);
                setSelectedBuyer('');
              }}
            >
              <option value="">全部客户类型</option>
              {customerTypes.map((customerType) => <option key={customerType} value={customerType}>{customerType}</option>)}
            </select>
          </label>
          <label>
            <span>采购单位</span>
            <select value={selectedBuyer} onChange={(event) => setSelectedBuyer(event.target.value)}>
              <option value="">全部采购单位</option>
              {buyerOptions.map((buyer) => <option key={buyer} value={buyer}>{buyer}</option>)}
            </select>
          </label>
          <label>
            <span>展示数量</span>
            <input type="number" min="5" max="50" value={topLimit} onChange={(event) => setTopLimit(Math.max(5, Math.min(50, Number(event.target.value) || 12)))} />
          </label>
        </div>
        <div className="bid-market-demand-filter" aria-label="需求类型筛选">
          {demandTypes.map((demandType) => (
            <button
              type="button"
              key={demandType}
              className={selectedDemandTypes.includes(demandType) ? 'is-active' : ''}
              onClick={() => toggleDemandType(demandType)}
            >
              {demandType}
            </button>
          ))}
          {selectedDemandTypes.length ? (
            <button type="button" className="is-reset" onClick={() => setSelectedDemandTypes([])}>清空需求筛选</button>
          ) : null}
        </div>
        {renderBoard()}
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>导入数据概览</h3>
            <p>本地 bid-analysis-methodology 的清洗后中标 CSV 已按市场记录、产品抽取、风险标记和商机评分沉淀。</p>
          </div>
        </div>
        <div className="bid-market-source-list">
          {(state?.importedData.sources ?? []).map((source) => (
            <div key={`${source.referenceProject}-${source.localPath}`} className="bid-market-source-row">
              <div>
                <strong>{source.name}</strong>
                <span>{source.referenceProject} · {source.sourceType} · {source.importedAt || '未记录导入时间'}</span>
              </div>
              <small>{source.localPath}</small>
            </div>
          ))}
        </div>
        <div className="bid-market-table-grid">
          <div>
            <h4>品类分布</h4>
            <table className="bid-market-table">
              <thead><tr><th>品类</th><th>记录</th><th>金额</th></tr></thead>
              <tbody>
                {(state?.importedData.demandBreakdown ?? []).map((row) => (
                  <tr
                    key={row.demandType}
                    className="bid-market-click-row"
                    onClick={() => showRecords(`${row.demandType} 明细`, `查看 ${row.demandType} 下的每一条市场记录。`, records.filter((record) => record.demandType === row.demandType))}
                  >
                    <td>{row.demandType}</td>
                    <td>{formatNumber(row.records)}</td>
                    <td>{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4>风险分布</h4>
            <table className="bid-market-table">
              <thead><tr><th>等级</th><th>规则</th><th>数量</th></tr></thead>
              <tbody>
                {(state?.importedData.riskBreakdown ?? []).map((row) => (
                  <tr key={`${row.level}-${row.rule}`}>
                    <td>{row.level}</td>
                    <td>{row.rule}</td>
                    <td>{formatNumber(row.records)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>采购单位与中标供应商</h3>
            <p>按记录数排序，用于快速识别市场热度、客户集中度和主要竞品/合作方。</p>
          </div>
          <div className="bid-market-panel-actions">
            <button type="button" className="secondary-action" onClick={() => showCompanies('采购单位明细', '查看全部采购单位的记录数、金额、品类和最近日期。', buyers)}>查看全部采购单位</button>
            <button type="button" className="secondary-action" onClick={() => showCompanies('中标供应商明细', '查看全部中标供应商的记录数、金额、品类和最近日期。', suppliers)}>查看全部供应商</button>
          </div>
        </div>
        <div className="bid-market-table-grid">
          <div>
            <h4>Top 采购单位</h4>
            <table className="bid-market-table">
              <thead><tr><th>单位</th><th>记录</th><th>金额</th></tr></thead>
              <tbody>
                {(state?.importedData.topBuyers ?? []).map((row) => (
                  <tr
                    key={row.name}
                    className="bid-market-click-row"
                    onClick={() => showRecords(`${row.name || '未命名采购单位'} 记录`, '查看该采购单位关联的全部市场记录。', records.filter((record) => record.buyerName === row.name))}
                  >
                    <td>{row.name || '未命名'}</td>
                    <td>{formatNumber(row.records)}</td>
                    <td>{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4>Top 中标供应商</h4>
            <table className="bid-market-table">
              <thead><tr><th>供应商</th><th>记录</th><th>金额</th></tr></thead>
              <tbody>
                {(state?.importedData.topSuppliers ?? []).map((row) => (
                  <tr
                    key={row.name}
                    className="bid-market-click-row"
                    onClick={() => showRecords(`${row.name || '未命名供应商'} 记录`, '查看该供应商关联的全部市场记录。', records.filter((record) => record.supplierName === row.name))}
                  >
                    <td>{row.name || '未命名'}</td>
                    <td>{formatNumber(row.records)}</td>
                    <td>{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>高分商机样本</h3>
            <p>评分结合采购热度、金额吸引力、客户价值、竞争可进入性和行动可用性。</p>
          </div>
        </div>
        <table className="bid-market-table">
          <thead><tr><th>项目</th><th>采购单位</th><th>供应商</th><th>金额</th><th>评分</th></tr></thead>
          <tbody>
            {(state?.importedData.topScores ?? []).map((row) => (
              <tr key={`${row.projectName}-${row.buyerName}-${row.supplierName}-${row.amount}`}>
                <td>{row.projectName}</td>
                <td>{row.buyerName}</td>
                <td>{row.supplierName || '未命名'}</td>
                <td>{formatMoney(row.amount)}</td>
                <td>{Number(row.totalScore || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>最近市场记录</h3>
            <p>保留原始 JSON 预览，后续可继续扩展为全文检索和单条详情页。</p>
          </div>
        </div>
        <div className="bid-market-record-list">
          {(state?.importedData.recentRecords ?? []).map((record) => (
            <article key={record.recordId} className="bid-market-record">
              <div>
                <span>{record.publishDate || '未记录日期'} · {record.demandType}</span>
                <h4>{record.projectName}</h4>
                <p>{record.buyerName} / {record.supplierName || '未命名供应商'} / {formatMoney(record.amount)}</p>
              </div>
              <code>{record.rawJsonPreview}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>内置数据来源</h3>
            <p>当前页面已内置 bid-analysis-methodology 的主要分析能力，不需要再跳转到本地 8050 看板。</p>
          </div>
        </div>
        <div className="bid-market-reference-list">
          {(state?.references ?? []).map((item) => (
            <article key={item.id} className="bid-market-reference">
              <div>
                <span className={item.exists ? 'is-ready' : 'is-missing'}>{item.exists ? '本地已下载' : '未找到本地目录'}</span>
                <h4>{item.name}</h4>
                <p>{item.role}：{item.note}</p>
                <small>{item.localPath}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>数据库联动方式</h3>
            <p>能共享的资料进入知识库和投标机会，不能共享的市场实体进入独立表，再通过关联字段连接。</p>
          </div>
        </div>
        <div className="bid-market-link-grid">
          <div>
            <h4>共享现有表</h4>
            {(state?.integration.sharedTables ?? []).map((item) => (
              <p key={item.name}><strong>{item.name}</strong>：{item.purpose}</p>
            ))}
          </div>
          <div>
            <h4>新增市场分析表</h4>
            <ul>
              {(state?.integration.newTables ?? []).map((table) => <li key={table}>{table}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default BidMarketAnalysisPage;
