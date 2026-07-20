export interface BidMarketReferenceProject {
  id: string;
  name: string;
  role: string;
  url: string;
  repoUrl: string;
  localPath: string;
  note: string;
  exists: boolean;
}

export interface BidMarketAnalysisMetrics {
  marketRecords: number;
  products: number;
  qualifications: number;
  riskFlags: number;
  opportunityScores: number;
  linkedOpportunities: number;
  linkedKnowledgeDocuments: number;
  existingBidOpportunities: number;
  existingKnowledgeDocuments: number;
  existingKnowledgeItems: number;
}

export interface BidMarketRankRow {
  name: string;
  records: number;
  amount: number;
}

export interface BidMarketDemandRow {
  demandType: string;
  records: number;
  amount: number;
}

export interface BidMarketRiskRow {
  level: string;
  rule: string;
  records: number;
}

export interface BidMarketScoreRow {
  projectName: string;
  buyerName: string;
  supplierName: string;
  amount: number;
  totalScore: number;
}

export interface BidMarketRecentRecord {
  recordId: string;
  projectName: string;
  publishDate: string;
  buyerName: string;
  supplierName: string;
  demandType: string;
  amount: number;
  rawJsonPreview: string;
}

export interface BidMarketRecordDetail {
  recordId: string;
  projectName: string;
  publishDate: string;
  province: string;
  city: string;
  district: string;
  stage: string;
  amount: number;
  buyerName: string;
  supplierName: string;
  demandType: string;
  customerType: string;
  productSummary: string;
  sourceUrl: string;
  rawJsonPreview: string;
}

export interface BidMarketProductDetail {
  productId: string;
  recordId: string;
  name: string;
  category: string;
  buyerName: string;
  supplierName: string;
  amount: number;
  publishDate: string;
  evidence: string;
  softwareFeatures: string;
  hardwareSpecs: string;
  modelSpecs: string;
  supportingItems: string;
}

export interface BidMarketCompanySummary {
  name: string;
  role: 'buyer' | 'supplier';
  customerType?: string;
  demandTypes: string;
  records: number;
  amount: number;
  latestDate: string;
}

export interface BidMarketSourceSummary {
  name: string;
  referenceProject: string;
  localPath: string;
  importedAt: string;
  sourceType: string;
}

export interface BidMarketAnalysisState {
  references: BidMarketReferenceProject[];
  metrics: BidMarketAnalysisMetrics;
  integration: {
    sharedTables: Array<{ name: string; purpose: string }>;
    newTables: string[];
  };
  importedData: {
    sources: BidMarketSourceSummary[];
    demandBreakdown: BidMarketDemandRow[];
    topBuyers: BidMarketRankRow[];
    topSuppliers: BidMarketRankRow[];
    riskBreakdown: BidMarketRiskRow[];
    topScores: BidMarketScoreRow[];
    recentRecords: BidMarketRecentRecord[];
  };
  detailData: {
    records: BidMarketRecordDetail[];
    products: BidMarketProductDetail[];
    buyers: BidMarketCompanySummary[];
    suppliers: BidMarketCompanySummary[];
  };
}
