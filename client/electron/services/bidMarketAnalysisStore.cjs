const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const referenceProjects = [
  {
    id: 'transparency-dashboard',
    name: 'Transparency Dashboard',
    role: '产品形态参考',
    url: 'http://127.0.0.1:5174/',
    repoUrl: 'https://github.com/jiangyang118/transparency-dashboard',
    localPath: path.join(os.homedir(), 'code/099-github/jiangyang118/transparency-dashboard'),
    note: '参考搜索、筛选、实体目录、统计图和导出体验。',
  },
  {
    id: 'public-tender-analysis-dashboard',
    name: 'Public Tender Analysis Dashboard',
    role: '分析方法参考',
    url: 'http://127.0.0.1:8050/',
    repoUrl: 'https://github.com/jiangyang118/public-tender-analysis-dashboard',
    localPath: path.join(os.homedir(), 'code/099-github/jiangyang118/public-tender-analysis-dashboard'),
    note: '参考趋势、实体钻取、聚类、主题分析和风险解释。',
  },
];

function count(db, sql) {
  try {
    return Number(db.prepare(sql).get()?.value || 0);
  } catch {
    return 0;
  }
}

function createBidMarketAnalysisStore({ db }) {
  const loadState = () => {
    const references = referenceProjects.map((item) => ({
      ...item,
      exists: fs.existsSync(item.localPath),
    }));

    return {
      references,
      metrics: {
        marketRecords: count(db, 'SELECT COUNT(*) AS value FROM bid_market_records'),
        products: count(db, 'SELECT COUNT(*) AS value FROM bid_market_products'),
        qualifications: count(db, 'SELECT COUNT(*) AS value FROM bid_market_company_qualifications'),
        riskFlags: count(db, 'SELECT COUNT(*) AS value FROM bid_market_risk_flags'),
        opportunityScores: count(db, 'SELECT COUNT(*) AS value FROM bid_market_opportunity_scores'),
        linkedOpportunities: count(db, "SELECT COUNT(*) AS value FROM bid_market_records WHERE linked_opportunity_id IS NOT NULL AND linked_opportunity_id <> ''"),
        linkedKnowledgeDocuments: count(db, "SELECT COUNT(*) AS value FROM bid_market_records WHERE linked_knowledge_document_id IS NOT NULL AND linked_knowledge_document_id <> ''"),
        existingBidOpportunities: count(db, 'SELECT COUNT(*) AS value FROM bid_opportunity_opportunities'),
        existingKnowledgeDocuments: count(db, 'SELECT COUNT(*) AS value FROM knowledge_documents'),
        existingKnowledgeItems: count(db, 'SELECT COUNT(*) AS value FROM knowledge_items'),
      },
      integration: {
        sharedTables: [
          {
            name: 'knowledge_items',
            purpose: '外部网页、产品资料、资质资料可沉淀为知识条目，供技术方案和投标机会复用。',
          },
          {
            name: 'bid_opportunity_opportunities',
            purpose: '市场记录可通过 linked_opportunity_id 关联到具体投标机会。',
          },
        ],
        newTables: [
          'bid_market_sources',
          'bid_market_records',
          'bid_market_products',
          'bid_market_company_qualifications',
          'bid_market_risk_flags',
          'bid_market_opportunity_scores',
        ],
      },
    };
  };

  return { loadState };
}

module.exports = { createBidMarketAnalysisStore };
