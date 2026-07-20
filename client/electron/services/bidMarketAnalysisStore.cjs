const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const referenceProjects = [
  {
    id: 'bid-analysis-methodology',
    name: 'Bid Analysis Methodology',
    role: '分析方法与数据口径',
    url: 'http://127.0.0.1:8050/',
    repoUrl: 'https://codeup.aliyun.com/60069db88deaa14d9e02b875/zhct/bid-analysis-methodology.git',
    localPath: path.join(os.homedir(), 'code/010-cpt/008-zhct/bid-analysis-methodology'),
    note: '以 2026 年上半年乙方宝智慧食堂中标记录为来源，沉淀客户画像、供应商格局、商机优先级和风险红旗。',
  },
];

function count(db, sql) {
  try {
    return Number(db.prepare(sql).get()?.value || 0);
  } catch {
    return 0;
  }
}

function all(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch {
    return [];
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
      importedData: {
        sources: all(db, `
          SELECT source_name AS name, reference_project AS referenceProject, local_path AS localPath,
                 imported_at AS importedAt, source_type AS sourceType
          FROM bid_market_sources
          ORDER BY updated_at DESC
        `),
        demandBreakdown: all(db, `
          SELECT demand_type AS demandType, COUNT(*) AS records, ROUND(COALESCE(SUM(amount), 0), 2) AS amount
          FROM bid_market_records
          GROUP BY demand_type
          ORDER BY records DESC
        `),
        topBuyers: all(db, `
          SELECT buyer_name AS name, COUNT(*) AS records, ROUND(COALESCE(SUM(amount), 0), 2) AS amount
          FROM bid_market_records
          GROUP BY buyer_name
          ORDER BY records DESC
          LIMIT 10
        `),
        topSuppliers: all(db, `
          SELECT supplier_name AS name, COUNT(*) AS records, ROUND(COALESCE(SUM(amount), 0), 2) AS amount
          FROM bid_market_records
          GROUP BY supplier_name
          ORDER BY records DESC
          LIMIT 10
        `),
        riskBreakdown: all(db, `
          SELECT level, rule, COUNT(*) AS records
          FROM bid_market_risk_flags
          GROUP BY level, rule
          ORDER BY records DESC
        `),
        topScores: all(db, `
          SELECT r.project_name AS projectName, r.buyer_name AS buyerName, r.supplier_name AS supplierName,
                 r.amount, s.total_score AS totalScore
          FROM bid_market_opportunity_scores s
          JOIN bid_market_records r ON r.record_id = s.record_id
          ORDER BY s.total_score DESC, r.amount DESC
          LIMIT 10
        `),
        recentRecords: all(db, `
          SELECT record_id AS recordId, project_name AS projectName, publish_date AS publishDate,
                 buyer_name AS buyerName, supplier_name AS supplierName, demand_type AS demandType,
                 amount, substr(raw_json, 1, 240) AS rawJsonPreview
          FROM bid_market_records
          ORDER BY publish_date DESC, updated_at DESC
          LIMIT 12
        `),
      },
      detailData: {
        records: all(db, `
          SELECT record_id AS recordId, project_name AS projectName, publish_date AS publishDate,
                 province, city, district, stage, ROUND(COALESCE(amount, 0), 2) AS amount,
                 buyer_name AS buyerName, supplier_name AS supplierName, demand_type AS demandType,
                 customer_type AS customerType, product_summary AS productSummary, source_url AS sourceUrl,
                 substr(raw_json, 1, 500) AS rawJsonPreview
          FROM bid_market_records
          ORDER BY publish_date DESC, amount DESC, updated_at DESC
        `),
        products: all(db, `
          SELECT p.product_id AS productId, p.record_id AS recordId, p.name, p.category,
                 r.buyer_name AS buyerName, r.supplier_name AS supplierName,
                 ROUND(COALESCE(r.amount, 0), 2) AS amount, r.publish_date AS publishDate,
                 p.evidence, p.software_features_json AS softwareFeatures,
                 p.hardware_specs_json AS hardwareSpecs, p.model_specs_json AS modelSpecs,
                 p.supporting_items_json AS supportingItems
          FROM bid_market_products p
          JOIN bid_market_records r ON r.record_id = p.record_id
          ORDER BY r.publish_date DESC, r.amount DESC, p.updated_at DESC
        `),
        buyers: all(db, `
          SELECT buyer_name AS name, 'buyer' AS role, customer_type AS customerType,
                 GROUP_CONCAT(DISTINCT demand_type) AS demandTypes,
                 COUNT(*) AS records, ROUND(COALESCE(SUM(amount), 0), 2) AS amount,
                 MAX(publish_date) AS latestDate
          FROM bid_market_records
          GROUP BY buyer_name, customer_type
          ORDER BY records DESC, amount DESC
        `),
        suppliers: all(db, `
          SELECT supplier_name AS name, 'supplier' AS role, '' AS customerType,
                 GROUP_CONCAT(DISTINCT demand_type) AS demandTypes,
                 COUNT(*) AS records, ROUND(COALESCE(SUM(amount), 0), 2) AS amount,
                 MAX(publish_date) AS latestDate
          FROM bid_market_records
          GROUP BY supplier_name
          ORDER BY records DESC, amount DESC
        `),
      },
    };
  };

  return { loadState };
}

module.exports = { createBidMarketAnalysisStore };
