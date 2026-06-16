export type AiEvaluationItemCategory = 'qualification' | 'business' | 'technical' | 'price' | 'objective' | 'subjective' | 'other';
export type AiEvaluationRiskLevel = 'low' | 'medium' | 'high';

export interface AiEvaluationSource {
  type: 'technical-plan' | 'bid-document';
  fileName: string;
  contentHash: string;
  generatedAt: string;
}

export interface AiEvaluationItem {
  id: string;
  category: AiEvaluationItemCategory;
  label: string;
  title: string;
  requirementText: string;
  maxScore: number;
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  evidence: string;
  deductionReason: string;
  riskLevel: AiEvaluationRiskLevel;
  confirmed: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface AiEvaluationSummary {
  totalMaxScore: number;
  totalFinalScore: number;
  confirmedCount: number;
  highRiskCount: number;
  itemCount: number;
  conclusion: string;
}

export interface AiEvaluationTaskState {
  task_id: string;
  type: string;
  status: 'running' | 'pausing' | 'paused' | 'success' | 'error';
  progress: number;
  logs: string[];
  stats?: Record<string, unknown>;
  error?: string | null;
  started_at: string;
  updated_at: string;
}

export interface AiEvaluationBidDocument {
  id: string;
  fileName: string;
  contentHash: string;
  contentChars: number;
  parserLabel?: string;
  importedAt: string;
  sortOrder: number;
}

export interface AiEvaluationBidScoreSummary {
  documentId: string;
  fileName: string;
  totalMaxScore: number;
  totalFinalScore: number;
  confirmedCount: number;
  highRiskCount: number;
  itemCount: number;
  conclusion: string;
}

export interface AiEvaluationAuditOpinion {
  id: string;
  type: string;
  severity: AiEvaluationRiskLevel;
  title: string;
  targetType: string;
  targetId: string;
  evidence: string;
  recommendation: string;
  status: string;
  sortOrder: number;
  updatedAt: string;
}

export interface AiEvaluationExpertScore {
  id: string;
  itemId: string;
  expertName: string;
  expertRole: string;
  reviewSession: string;
  score: number;
  signatureConfirmed: boolean;
  signedAt?: string;
  opinion: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiEvaluationExpertReviewSummary {
  expertCount: number;
  scoreCount: number;
  signedCount: number;
  pendingSignatureCount: number;
  reviewSessionCount: number;
  conflictCount: number;
  maxDeviation: number;
  conclusion: string;
}

export interface AiEvaluationReportSnapshot {
  id: string;
  type: string;
  title: string;
  markdownChars: number;
  summary: Record<string, unknown>;
  generatedAt: string;
  exportedPath?: string;
  exportedAt?: string;
}

export interface AiEvaluationState {
  source: AiEvaluationSource | null;
  items: AiEvaluationItem[];
  summary: AiEvaluationSummary;
  aiExtractionTask?: AiEvaluationTaskState;
  batchScoringTask?: AiEvaluationTaskState;
  bidDocuments?: AiEvaluationBidDocument[];
  bidScoreSummaries?: AiEvaluationBidScoreSummary[];
  expertScores?: AiEvaluationExpertScore[];
  expertReviewSummary?: AiEvaluationExpertReviewSummary;
  auditOpinions?: AiEvaluationAuditOpinion[];
  latestReport?: AiEvaluationReportSnapshot | null;
}

export interface AiEvaluationItemPatch {
  manualScore?: number | null;
  evidence?: string;
  deductionReason?: string;
  riskLevel?: AiEvaluationRiskLevel;
  confirmed?: boolean;
}

export interface AiEvaluationExpertScoreInput {
  id?: string;
  itemId: string;
  expertName: string;
  expertRole?: string;
  reviewSession?: string;
  score: number;
  signatureConfirmed?: boolean;
  opinion?: string;
}

export interface AiEvaluationExportReportResult {
  success: boolean;
  message: string;
  reportId?: string;
  filePath?: string;
  markdownChars?: number;
}

export interface AiEvaluationOfficeExportResult {
  success: boolean;
  message: string;
  reportId?: string;
  filePath?: string;
  bytes?: number;
  format?: 'docx' | 'xlsx';
}

export interface AiEvaluationCommitteeExportResult {
  success: boolean;
  message: string;
  reportId?: string;
  filePath?: string;
  bytes?: number;
  markdownChars?: number;
  format?: 'docx' | 'md';
}

export interface AiEvaluationImportDocumentResult {
  success: boolean;
  message: string;
  state: AiEvaluationState;
}
