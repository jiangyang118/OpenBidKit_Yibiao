export type RejectionDocumentRole = 'tender' | 'bid';

export type RejectionDocumentTabId = 'tender' | string;

export type RejectionDocumentSource = 'upload' | 'technical-plan';

export type RejectionCheckStep = 'documents' | 'items' | 'results';

export type RejectionResultTab = 'analysis' | 'custom';

export type RejectionCheckResultTab = 'rejection' | 'typo' | 'logic';

export type RejectionExtractionStatus = 'idle' | 'running' | 'success' | 'error';

export type RejectionExtractionSource = 'ai' | 'technical-plan';

export type RejectionCheckRunStatus = 'idle' | 'running' | 'success' | 'error';

export type RejectionFindingType = 'invalidBid' | 'rejectionItem';

export type RejectionFindingSeverity = 'high' | 'medium' | 'low';

export type RejectionFindingResolutionStatus = 'pending' | 'ignored';

export type RejectionBackgroundTaskType = 'rejection-items-extraction' | 'rejection-check-run';

export type RejectionBackgroundTaskStatus = 'running' | 'success' | 'error';

export interface RejectionBackgroundTaskState {
  task_id: string;
  type: RejectionBackgroundTaskType;
  status: RejectionBackgroundTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
}

export interface RejectionEvidencePageScreenshot {
  pageNumber?: number;
  page_number?: number;
  page?: number;
  lineStart?: number;
  line_start?: number;
  lineEnd?: number;
  line_end?: number;
  imageLine?: number;
  image_line?: number;
  width?: number;
  height?: number;
  page_width?: number;
  page_height?: number;
  pageWidth?: number;
  pageHeight?: number;
  dimensions?: { width?: number; height?: number };
  size?: { width?: number; height?: number };
  assetUrl?: string;
  asset_url?: string;
  imageUrl?: string;
  image_url?: string;
  previewUrl?: string;
  preview_url?: string;
  filePath?: string;
  file_path?: string;
  path?: string;
  crop?: { left?: number; top?: number; width?: number; height?: number; x?: number; y?: number; w?: number; h?: number };
  cropBox?: { left?: number; top?: number; width?: number; height?: number; x?: number; y?: number; w?: number; h?: number };
  crop_box?: { left?: number; top?: number; width?: number; height?: number; x?: number; y?: number; w?: number; h?: number };
  note?: string;
  description?: string;
}

export interface RejectionDocumentContent {
  id: string;
  role: RejectionDocumentRole;
  fileName: string;
  content: string;
  source: RejectionDocumentSource;
  parserLabel?: string;
  importedAt: string;
  pageScreenshots?: RejectionEvidencePageScreenshot[];
  page_screenshots?: RejectionEvidencePageScreenshot[];
  pageImages?: RejectionEvidencePageScreenshot[];
  page_images?: RejectionEvidencePageScreenshot[];
}

export interface RejectionCheckWorkspaceState {
  tenderDocument: RejectionDocumentContent | null;
  bidDocuments: RejectionDocumentContent[];
  activeDocumentTab: RejectionDocumentTabId;
  step?: RejectionCheckStep;
  activeResultTab?: RejectionResultTab;
  activeCheckResultTab?: RejectionCheckResultTab;
  invalidBidAndRejectionItems?: RejectionExtractionState;
  customCheckItems?: string;
  checkOptions?: RejectionCheckOptions;
  rejectionCheckResult?: RejectionCheckResultState;
  typoCheckResult?: TypoCheckResultState;
  logicCheckResult?: LogicCheckResultState;
  extractionTask?: RejectionBackgroundTaskState;
  checkTask?: RejectionBackgroundTaskState;
}

export interface RejectionCheckExportReportResult {
  success: boolean;
  message?: string;
  filePath?: string;
  format?: 'md' | 'docx' | 'pdf';
  bytes?: number;
  markdownChars?: number;
}

export interface RejectionCheckOptions {
  rejectionCheck: boolean;
  typoCheck: boolean;
  logicCheck: boolean;
}

export interface RejectionExtractionState {
  status: RejectionExtractionStatus;
  content: string;
  source?: RejectionExtractionSource;
  tenderSignature?: string;
  updatedAt?: string;
  error?: string;
}

export interface RejectionCheckFinding {
  id: string;
  bidDocumentId: string;
  type: RejectionFindingType;
  severity: RejectionFindingSeverity;
  title: string;
  summary: string;
  requirement: string;
  bidEvidence: string;
  riskReason: string;
  suggestion: string;
  resolution_status?: RejectionFindingResolutionStatus;
  resolved_at?: string;
}

export interface RejectionCheckResultState {
  status: RejectionCheckRunStatus;
  findings: RejectionCheckFinding[];
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface TypoCheckFinding {
  id: string;
  bidDocumentId: string;
  wrongText: string;
  correctText: string;
  originalExcerpt: string;
  reason: string;
  locationHint?: string;
  resolution_status?: RejectionFindingResolutionStatus;
  resolved_at?: string;
}

export interface TypoCheckResultState {
  status: RejectionCheckRunStatus;
  findings: TypoCheckFinding[];
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface LogicCheckFinding {
  id: string;
  bidDocumentId: string;
  title: string;
  originalText: string;
  locationHint: string;
  fallacyReason: string;
  suggestion: string;
  resolution_status?: RejectionFindingResolutionStatus;
  resolved_at?: string;
}

export interface LogicCheckResultState {
  status: RejectionCheckRunStatus;
  findings: LogicCheckFinding[];
  inputSignature?: string;
  activeFindingId?: string;
  progressMessage?: string;
  updatedAt?: string;
  error?: string;
}

export interface RejectionRiskItem {
  id: string;
  title: string;
  source: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RejectionCheckReport {
  passed: boolean;
  risks: RejectionRiskItem[];
}
