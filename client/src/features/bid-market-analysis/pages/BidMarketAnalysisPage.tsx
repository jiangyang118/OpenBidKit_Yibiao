import { useEffect, useState } from 'react';
import type { BidMarketAnalysisState } from '../types';

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

function BidMarketAnalysisPage() {
  const [state, setState] = useState<BidMarketAnalysisState | null>(null);
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
        {metricLabels.map(([key, label]) => (
          <article key={key} className="bid-market-metric">
            <span>{label}</span>
            <strong>{state?.metrics[key] ?? 0}</strong>
          </article>
        ))}
      </section>

      <section className="bid-market-panel">
        <div className="bid-market-panel-head">
          <div>
            <h3>参考项目联动</h3>
            <p>一个看产品形态，一个看分析方法；当前页面负责把它们沉淀为易标自己的数据模型。</p>
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
              <div className="bid-market-reference-actions">
                <button type="button" className="secondary-action" onClick={() => openExternal(item.url)}>打开本地服务</button>
                <button type="button" className="secondary-action" onClick={() => openExternal(item.repoUrl)}>打开仓库</button>
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
