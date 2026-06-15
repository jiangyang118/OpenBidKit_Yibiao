export type BusinessBidClauseCategory = 'payment' | 'bond' | 'quote' | 'contract' | 'qualification' | 'schedule' | 'other';
export type BusinessBidDeviationType = 'none' | 'positive' | 'negative' | 'pending';
export type BusinessBidRiskLevel = 'low' | 'medium' | 'high';
export type BusinessBidAttachmentKind = 'quote' | 'qualification' | 'contract' | 'bond' | 'other';
export type BusinessBidAttachmentStatus = 'pending' | 'ready' | 'missing';

export interface BusinessBidSource {
  type: 'technical-plan' | 'tender-document';
  fileName: string;
  contentHash: string;
  generatedAt: string;
}

export interface BusinessBidClause {
  id: string;
  category: BusinessBidClauseCategory;
  label: string;
  originalText: string;
  responseText: string;
  deviationType: BusinessBidDeviationType;
  riskLevel: BusinessBidRiskLevel;
  materialRequirement: string;
  owner: string;
  confirmedBy: string;
  confirmed: boolean;
  sourceHint: string;
  sortOrder: number;
  updatedAt: string;
}

export interface BusinessBidAttachment {
  id: string;
  kind: BusinessBidAttachmentKind;
  fileName: string;
  storedPath: string;
  originalPath: string;
  fileSize: number;
  status: BusinessBidAttachmentStatus;
  owner: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessBidTaskState {
  task_id: string;
  type: string;
  status: 'idle' | 'running' | 'pausing' | 'paused' | 'success' | 'error';
  progress: number;
  logs: string[];
  stats?: Record<string, unknown>;
  error?: string | null;
  started_at: string;
  updated_at: string;
}

export interface BusinessBidState {
  source: BusinessBidSource | null;
  clauses: BusinessBidClause[];
  attachments?: BusinessBidAttachment[];
  aiExtractionTask?: BusinessBidTaskState;
}

export interface BusinessBidClausePatch {
  responseText?: string;
  deviationType?: BusinessBidDeviationType;
  riskLevel?: BusinessBidRiskLevel;
  materialRequirement?: string;
  owner?: string;
  confirmedBy?: string;
  confirmed?: boolean;
}

export interface BusinessBidAttachmentPatch {
  kind?: BusinessBidAttachmentKind;
  status?: BusinessBidAttachmentStatus;
  owner?: string;
  note?: string;
}

export interface BusinessBidExportReportResult {
  success: boolean;
  message: string;
  filePath?: string;
  markdownChars?: number;
}

export interface BusinessBidOfficeExportResult {
  success: boolean;
  message: string;
  filePath?: string;
  bytes?: number;
  format?: 'docx' | 'xlsx';
}

export interface BusinessBidImportDocumentResult {
  success: boolean;
  message: string;
  state: BusinessBidState;
}

export interface BusinessBidImportAttachmentsResult {
  success: boolean;
  message: string;
  state: BusinessBidState;
}

export interface BusinessBidAiExtractionResult {
  success: boolean;
  message: string;
  state: BusinessBidState;
}
