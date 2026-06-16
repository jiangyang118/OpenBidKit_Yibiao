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

export interface BidMarketAnalysisState {
  references: BidMarketReferenceProject[];
  metrics: BidMarketAnalysisMetrics;
  integration: {
    sharedTables: Array<{ name: string; purpose: string }>;
    newTables: string[];
  };
}
