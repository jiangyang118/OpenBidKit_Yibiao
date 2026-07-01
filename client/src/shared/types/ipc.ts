import type { ChatCompletionRequest, JsonCompletionRequest, JsonFailureSampleInput, JsonFailureSamplesResult, JsonReplayLogsResult } from './ai';
import type { AiEvaluationExpertScoreInput, AiEvaluationExportReportResult, AiEvaluationImportDocumentResult, AiEvaluationItemPatch, AiEvaluationOfficeExportResult, AiEvaluationState } from '../../features/ai-evaluation/types';
import type { DuplicateCheckExportReportResult, DuplicateCheckWorkspaceState, FileSelectionResult, LocalFileSelection } from './bid';
import type { BusinessBidAiExtractionResult, BusinessBidAttachmentPatch, BusinessBidClausePatch, BusinessBidExportReportResult, BusinessBidImportAttachmentsResult, BusinessBidImportDocumentResult, BusinessBidOfficeExportResult, BusinessBidState } from '../../features/business-bid/types';
import type { ClientConfig, ConfigSaveResult, ImageModelTestResult, ModelListResult, UpdateChannel } from './config';
import type { ExportFormatConfig, ExportTemplateRecord } from './exportFormat';
import type {
  ImageKnowledgeAssetPatch,
  ImageKnowledgeBatchResult,
  ImageKnowledgeBatchUpdatePayload,
  ImageKnowledgeMarkdownReferenceRequest,
  ImageKnowledgeMarkdownReferenceResult,
  ImageKnowledgeReference,
  ImageKnowledgeSearchQuery,
  ImageKnowledgeState,
  ImageKnowledgeTagMutationResult,
  ImageKnowledgeUploadResult,
} from '../../features/image-knowledge-base/types';
import type { BidOpportunityExportCalendarResult, BidOpportunityExportReportResult, BidOpportunityFollowUpPatch, BidOpportunityImportResult, BidOpportunityInput, BidOpportunityState, BidOpportunityStatus } from '../../features/bid-opportunity/types';
import type { KnowledgeAnalysisSnapshot, KnowledgeBaseActiveTasksSnapshot, KnowledgeBaseEvent, KnowledgeBaseIndex, KnowledgeBaseIndexMutationResult, KnowledgeBaseMigrationResult, KnowledgeBaseMigrationStatus, KnowledgeBaseMutationResult, KnowledgeBaseRetryDocumentResult, KnowledgeBaseStartMatchingResult, KnowledgeBaseUploadResult, KnowledgeDocument, KnowledgeFolder, KnowledgeItem } from '../../features/knowledge-base/types';
import type { RejectionCheckExportReportResult, RejectionCheckWorkspaceState, RejectionDocumentRole } from '../../features/rejection-check/types';
import type { BidAnalysisMode, BidAnalysisTaskState, BidSectionMode, ContentGenerationOptions, ContentGenerationPlanState, ContentGenerationRuntimeState, ContentGenerationSectionState, DetectedBidSection, GlobalFactGroupState, SaveOutlineRequest, TechnicalPlanState, TechnicalPlanStep, TechnicalPlanWorkflowKind } from '../../features/technical-plan/types';
import type { OutlineData, OutlineExpansionMode, OutlineMode } from './outline';

export interface TaskEvent<TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown, TBusinessBidState = unknown, TAiEvaluationState = unknown> {
  task: unknown;
  technicalPlan?: TState;
  technicalPlanPatch?: Partial<TechnicalPlanState>;
  bidItem?: BidAnalysisTaskState;
  outlineData?: OutlineData | null;
  contentSection?: ContentGenerationSectionState;
  contentPlan?: { nodeId: string; value: ContentGenerationPlanState | null };
  contentRuntime?: ContentGenerationRuntimeState;
  rejectionCheck?: TRejectionCheckState;
  duplicateCheck?: TDuplicateCheckState;
  businessBid?: TBusinessBidState;
  aiEvaluation?: TAiEvaluationState;
}

export interface WordExportProgressEvent {
  requestId?: string;
  phase: 'running' | 'success' | 'error' | 'canceled';
  progress: number;
  message: string;
  warnings?: string[];
}

export interface WordExportPreflightReport {
  leafCount: number;
  mermaidCount: number;
  imageCount: number;
  dataUrlImageCount: number;
  localImageCount: number;
  remoteImageCount: number;
  assetImageCount: number;
  missingLocalImageCount: number;
  unknownImageCount: number;
  warnings: string[];
}

export interface WordExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
  warnings?: string[];
  preflight?: WordExportPreflightReport;
}

export interface WordExportPreviewResult {
  success: boolean;
  message: string;
  warnings?: string[];
  preflight?: WordExportPreflightReport;
  stats?: {
    leafCount: number;
    mermaidCount: number;
  };
  duration_ms?: number;
  docx_bytes?: number;
  error_stage?: string;
  error_message?: string;
}

export type DeveloperParserProvider = 'local' | 'mineru-accurate-api' | 'mineru-agent-api';

export interface DeveloperParserSampleResult {
  success: boolean;
  message: string;
  file?: LocalFileSelection;
  parser_provider?: DeveloperParserProvider;
  parser_label?: string;
  requested_provider?: DeveloperParserProvider;
  fallback_to_local?: boolean;
  duration_ms?: number;
  markdown?: string;
  markdown_preview?: string;
  truncated?: boolean;
  markdown_chars?: number;
  image_count?: number;
  line_count?: number;
}

export interface DeveloperParserCapability {
  extension: string;
  local_supported: boolean;
  mineru_accurate_supported: boolean;
  mineru_agent_supported: boolean;
  recommended_provider: DeveloperParserProvider | '';
  status: 'local' | 'mixed' | 'remote' | 'remote-ocr' | 'unsupported';
  note: string;
}

export interface DeveloperParserCapabilityReport {
  providers: Array<{
    provider: DeveloperParserProvider;
    label: string;
    supported_extensions: string[];
    selectable_extensions: string[];
  }>;
  samples: DeveloperParserCapability[];
  chinese_path_smoke: {
    required: boolean;
    note: string;
    example: string;
  };
  scanned_document_policy: string;
}

export interface DeveloperTextTokenStats {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cache_ratio: number;
}

export interface LatestReleaseInfo {
  version: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  download_url?: string;
  channel?: UpdateChannel;
}

export interface UpdateCheckResult {
  enabled: boolean;
  updateAvailable: boolean;
  version?: string;
  downloaded?: boolean;
  failed?: boolean;
  message?: string;
  channel?: UpdateChannel;
}

export interface UpdateInstallResult {
  success: boolean;
  message?: string;
}

export interface GpuHardwareAccelerationStatus {
  configured: boolean;
  enabled: boolean;
  currentEnabled: boolean;
  trial: boolean;
  forcedDisabled: boolean;
}

export type WorkspaceDatabasePhase = 'checking' | 'repairing' | 'backing-up' | 'upgrading' | 'ready' | 'error';

export interface WorkspaceDatabaseStatus {
  phase: WorkspaceDatabasePhase;
  ready: boolean;
  message: string;
  updatedAt?: string;
  currentVersion?: number;
  targetVersion?: number;
  migrationVersion?: number;
  migrationDescription?: string;
  activeProjectId?: string;
  workspacePath?: string;
}

export interface ProjectWorkspaceSummary {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  source: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  is_default: boolean;
  is_active: boolean;
  workspace_path: string;
}

export interface ProjectWorkspaceListResult {
  version: number;
  active_project_id: string;
  registry_path: string;
  projects_dir: string;
  projects: ProjectWorkspaceSummary[];
}

export interface ProjectWorkspaceMutationResult {
  success: boolean;
  project?: ProjectWorkspaceSummary;
  state: ProjectWorkspaceListResult;
  source_project_id?: string;
  imported_from?: string;
}

export interface ProjectWorkspaceActiveResult {
  success: boolean;
  active_project_id: string;
  restart_required: boolean;
  state: ProjectWorkspaceListResult;
}

export interface ProjectWorkspacePackageResult {
  success: boolean;
  package_dir: string;
  manifest_path: string;
}

export interface ProjectWorkspacePathResult {
  project_id: string;
  workspace_path: string;
}

export type AgentSelfCheckStepStatus = 'pending' | 'running' | 'success' | 'error';
export type AgentSelfCheckStatus = 'normal' | 'error' | 'busy';

export type AgentRuntimePhase = 'stopped' | 'starting' | 'idle' | 'running' | 'aborting' | 'unhealthy' | 'restarting' | 'closing';

export interface AgentRuntimeActiveTask {
  task_id: string;
  title: string;
  stage: string;
  progress_text: string;
  started_at: string;
  last_activity_at: string;
  last_progress_at?: string;
  elapsed_seconds: number;
  idle_seconds: number;
}

export interface AgentRuntimeStatus {
  phase: AgentRuntimePhase;
  healthy: boolean;
  message: string;
  updated_at: string;
  last_health_at?: string;
  last_health_error?: string;
  restart_pending?: boolean;
  restart_pending_reason?: string;
  active_task?: AgentRuntimeActiveTask | null;
  proxy?: {
    active: number;
    queued: number;
    limit: number;
  };
  opencode?: {
    pid: number;
    base_url?: string;
    port?: number;
    last_exit_code?: number | null;
    last_exit_signal?: string;
  };
}

export interface AgentRunFile {
  path: string;
  content: string;
}

export interface AgentRunPayload {
  task_id?: string;
  title?: string;
  task?: string;
  prompt?: string;
  output_file?: string;
  files?: AgentRunFile[];
  timeout_ms?: number;
  agent?: string;
}

export interface AgentRunResult {
  success: boolean;
  status?: 'busy' | string;
  skipped?: boolean;
  message?: string;
  task_id?: string;
  title?: string;
  workspace_dir?: string;
  runtime_workspace_dir?: string;
  runtime_root?: string;
  output_file?: string;
  output_content?: string;
  assistant_text?: string;
  diff?: unknown[];
  session_id?: string;
  active_task?: AgentRuntimeActiveTask | null;
  opencode_request_log?: unknown[];
  opencode_stderr_tail?: string;
  opencode_stdout_tail?: string;
}

export interface AgentSelfCheckStep {
  id: string;
  label: string;
  status: AgentSelfCheckStepStatus;
  message?: string;
  updated_at?: string;
}

export interface AgentSelfCheckDiagnostics {
  name?: string;
  message?: string;
  stage?: string;
  stack?: string;
  agent_task_id?: string;
  agent_title?: string;
  agent_workspace_dir?: string;
  agent_runtime_root?: string;
  agent_output_file?: string;
  agent_output_path?: string;
  agent_partial_output_chars?: number;
  agent_partial_output?: string;
  opencode_binary_path?: string;
  opencode_base_url?: string;
  opencode_port?: number;
  opencode_exit_code?: number | null;
  opencode_exit_signal?: string;
  opencode_spawn_error?: string;
  opencode_last_health_error?: string;
  opencode_last_health_cause?: string;
  opencode_stdout_tail?: string;
  opencode_stderr_tail?: string;
  opencode_request_log?: unknown[];
}

export interface AgentSelfCheckEnvironmentSnapshot {
  app?: Record<string, unknown>;
  process?: Record<string, unknown>;
  paths?: Record<string, unknown>;
  opencode?: Record<string, unknown>;
  text_model?: Record<string, unknown>;
}

export interface AgentSelfCheckResult {
  success: boolean;
  status: AgentSelfCheckStatus;
  message: string;
  checked_at: string;
  duration_ms: number;
  log_dir: string;
  log_file: string;
  runtime_root: string;
  workspace_dir: string;
  output_file: string;
  output_path: string;
  output_content?: string;
  opencode_binary_path: string;
  conclusion?: string;
  model_config?: Record<string, unknown>;
  environment?: AgentSelfCheckEnvironmentSnapshot | null;
  direct_model_test?: Record<string, unknown> | null;
  opencode_request_log?: unknown[];
  proxy_diagnostics?: { events: unknown[] };
  workspace_snapshot?: Record<string, unknown> | null;
  agent_result?: Record<string, unknown>;
  steps: AgentSelfCheckStep[];
  diagnostics?: AgentSelfCheckDiagnostics;
  error?: AgentSelfCheckDiagnostics;
  detail_text: string;
  runtime_status?: AgentRuntimeStatus;
}

export interface AgentSelfCheckReportExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message: string;
}

export interface YibiaoBridge {
  appName: string;
  platform: string;
  getVersion: () => Promise<string>;
  getGpuHardwareAccelerationStatus: () => Promise<GpuHardwareAccelerationStatus>;
  saveGpuHardwareAccelerationPreference: (enabled: boolean) => Promise<ConfigSaveResult & { enabled: boolean; configured: boolean; restartRequired: boolean }>;
  startGpuHardwareAccelerationTrial: () => Promise<{ success: boolean }>;
  relaunchWithGpuHardwareAccelerationDisabled: () => Promise<{ success: boolean }>;
  getLatestVersion: () => Promise<LatestReleaseInfo>;
  getUpdateDownloadUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<UpdateCheckResult>;
  quitAndInstall: () => Promise<UpdateInstallResult>;
  onUpdateProgress: (callback: (event: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (event: { version: string }) => void) => () => void;
  onUpdateError: (callback: (event: { message: string }) => void) => () => void;
  database: {
    getStatus: () => Promise<WorkspaceDatabaseStatus>;
    onStatus: (callback: (status: WorkspaceDatabaseStatus) => void) => () => void;
  };
  projectWorkspace: {
    list: () => Promise<ProjectWorkspaceListResult>;
    create: (payload: { name: string; description?: string; makeActive?: boolean }) => Promise<ProjectWorkspaceMutationResult>;
    setActive: (projectId: string) => Promise<ProjectWorkspaceActiveResult>;
    archive: (projectId: string, archived?: boolean) => Promise<{ success: boolean; state: ProjectWorkspaceListResult }>;
    delete: (projectId: string, options?: { deleteFiles?: boolean }) => Promise<{ success: boolean; state: ProjectWorkspaceListResult }>;
    duplicate: (projectId: string, payload?: { name?: string; description?: string; makeActive?: boolean }) => Promise<ProjectWorkspaceMutationResult>;
    exportPackage: (projectId: string, packageDir: string) => Promise<ProjectWorkspacePackageResult>;
    importPackage: (packageDir: string, payload?: { name?: string; description?: string; makeActive?: boolean }) => Promise<ProjectWorkspaceMutationResult>;
    getWorkspacePath: (projectId?: string) => Promise<ProjectWorkspacePathResult>;
  };
  config: {
    load: () => Promise<ClientConfig>;
    save: (config: ClientConfig) => Promise<ConfigSaveResult>;
    listModels: (config?: ClientConfig) => Promise<ModelListResult>;
    openConfigFolder: () => Promise<{ success: boolean; path: string }>;
  };
  templates: {
    list: () => Promise<ExportTemplateRecord[]>;
    get: (templateId: string) => Promise<ExportTemplateRecord | null>;
    create: (config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    update: (templateId: string, config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    delete: (templateId: string) => Promise<{ success: boolean; message?: string }>;
  };
  ai: {
    chat: (request: ChatCompletionRequest) => Promise<string>;
    requestJson: <TResult = unknown>(request: JsonCompletionRequest) => Promise<TResult>;
    listJsonFailureSamples: () => Promise<JsonFailureSamplesResult>;
    listJsonReplayLogs: () => Promise<JsonReplayLogsResult>;
    saveJsonFailureSample: (sample: JsonFailureSampleInput) => Promise<JsonFailureSamplesResult>;
    clearJsonFailureSamples: () => Promise<JsonFailureSamplesResult>;
    testImageModel: (config: ClientConfig) => Promise<ImageModelTestResult>;
  };
  agent: {
    run: (payload: AgentRunPayload) => Promise<AgentRunResult>;
    selfCheck: () => Promise<AgentSelfCheckResult>;
    exportSelfCheckReport: (payload: AgentSelfCheckResult) => Promise<AgentSelfCheckReportExportResult>;
    getStatus: () => Promise<AgentRuntimeStatus>;
    restart: (reason?: string) => Promise<AgentRuntimeStatus>;
    onStatus: (callback: (status: AgentRuntimeStatus) => void) => () => void;
  };
  developerTokenStats: {
    openWindow: () => Promise<{ success: boolean }>;
    get: () => Promise<DeveloperTextTokenStats>;
    reset: () => Promise<DeveloperTextTokenStats>;
    onChanged: (callback: (stats: DeveloperTextTokenStats) => void) => () => void;
  };
  file: {
    selectDuplicateCheckFiles: (options?: { multiple?: boolean }) => Promise<FileSelectionResult>;
    parseDeveloperSample: (options?: { provider?: DeveloperParserProvider; preserveImages?: boolean }) => Promise<DeveloperParserSampleResult>;
    getDeveloperParserCapabilities: () => Promise<DeveloperParserCapabilityReport>;
  };
  knowledgeBase: {
    getMigrationStatus: () => Promise<KnowledgeBaseMigrationStatus>;
    migrateLegacy: () => Promise<KnowledgeBaseMigrationResult>;
    list: () => Promise<KnowledgeBaseIndex>;
    getActiveTasks: () => Promise<KnowledgeBaseActiveTasksSnapshot>;
    createFolder: (name: string) => Promise<KnowledgeFolder>;
    renameFolder: (folderId: string, name: string) => Promise<KnowledgeFolder>;
    reorderFolder: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    deleteFolder: (folderId: string) => Promise<KnowledgeBaseMutationResult>;
    deleteDocument: (documentId: string) => Promise<KnowledgeBaseMutationResult>;
    moveDocument: (documentId: string, targetFolderId: string, targetDocumentId?: string | null, position?: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    uploadDocuments: (folderId: string) => Promise<KnowledgeBaseUploadResult>;
    retryDocument: (documentId: string) => Promise<KnowledgeBaseRetryDocumentResult>;
    startMatching: (documentId: string, batchSize: number) => Promise<KnowledgeBaseStartMatchingResult>;
    readMarkdown: (documentId: string) => Promise<string>;
    readItems: (documentId: string) => Promise<KnowledgeItem[]>;
    readAnalysis: (documentId: string) => Promise<KnowledgeAnalysisSnapshot>;
    onEvent: (callback: (event: KnowledgeBaseEvent) => void) => () => void;
  };
  imageKnowledgeBase: {
    list: (query?: ImageKnowledgeSearchQuery) => Promise<ImageKnowledgeState>;
    uploadImages: () => Promise<ImageKnowledgeUploadResult>;
    updateAsset: (id: string, patch: ImageKnowledgeAssetPatch) => Promise<ImageKnowledgeState>;
    batchUpdateAssets: (payload: ImageKnowledgeBatchUpdatePayload) => Promise<ImageKnowledgeBatchResult>;
    renameTag: (oldTag: string, newTag: string) => Promise<ImageKnowledgeTagMutationResult>;
    deleteTag: (tag: string) => Promise<ImageKnowledgeTagMutationResult>;
    deleteAsset: (id: string) => Promise<ImageKnowledgeState>;
    batchDeleteAssets: (ids: string[]) => Promise<ImageKnowledgeBatchResult>;
    createMarkdownReference: (payload: ImageKnowledgeMarkdownReferenceRequest) => Promise<ImageKnowledgeMarkdownReferenceResult>;
    listReferences: (imageId: string) => Promise<ImageKnowledgeReference[]>;
  };
  technicalPlan: {
    loadState: () => Promise<TechnicalPlanState>;
    importTenderDocument: () => Promise<{
      success: boolean;
      message?: string;
      state?: TechnicalPlanState;
      markdown?: string;
      fileName?: string;
      parserLabel?: string | null;
    }>;
    importOriginalPlanDocument: () => Promise<{
      success: boolean;
      message?: string;
      state?: TechnicalPlanState;
      markdown?: string;
    }>;
    checkBidSections: () => Promise<{ hasMultiple: boolean; totalDeclared?: number | null }>;
    selectBidSection: (selectedSection: DetectedBidSection) => Promise<{ success: boolean; message?: string; state: TechnicalPlanState; markdown: string }>;
    readTenderMarkdown: () => Promise<string>;
    readOriginalPlanMarkdown: () => Promise<string>;
    updateStep: (step: TechnicalPlanStep) => Promise<TechnicalPlanState>;
    setWorkflowKind: (workflowKind: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanState>;
    switchWorkflowKind: (workflowKind: TechnicalPlanWorkflowKind) => Promise<TechnicalPlanState>;
    saveBidAnalysisConfig: (payload: { mode: BidAnalysisMode; selectedTaskIds: string[]; bidSectionMode?: BidSectionMode }) => Promise<TechnicalPlanState>;
    saveOutlineConfig: (payload: { referenceKnowledgeDocumentIds: string[]; outlineExpansionMode?: OutlineExpansionMode }) => Promise<TechnicalPlanState>;
    saveOutline: (payload: SaveOutlineRequest) => Promise<TechnicalPlanState>;
    saveGlobalFacts: (globalFacts: GlobalFactGroupState[]) => Promise<TechnicalPlanState>;
    saveContentGenerationOptions: (options: ContentGenerationOptions) => Promise<TechnicalPlanState>;
    resolveConsistencyAuditItem: (payload: { sectionId: string; index?: number }) => Promise<TechnicalPlanState>;
    handleOriginalCoverageUnassignedSegment: (payload: { sourceId: string; action: 'ignore' | 'bind'; nodeId?: string }) => Promise<TechnicalPlanState>;
    saveChapterContent: (payload: { nodeId: string; content: string }) => Promise<TechnicalPlanState>;
    clear: () => Promise<{ success: boolean; message?: string; state: TechnicalPlanState }>;
  };
  duplicateCheck: {
    loadState: () => Promise<DuplicateCheckWorkspaceState>;
    saveFiles: (payload: Pick<DuplicateCheckWorkspaceState, 'tenderFile' | 'bidFiles'> & Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<DuplicateCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<DuplicateCheckWorkspaceState>;
    updateState: (partial: Partial<DuplicateCheckWorkspaceState>) => Promise<DuplicateCheckWorkspaceState>;
    resolveItem: (payload: { section: 'content' | 'image'; itemId: string; status: 'pending' | 'confirmed' | 'ignored' }) => Promise<DuplicateCheckWorkspaceState>;
    batchHandleItems: (payload: { section: 'content' | 'image'; itemIds: string[]; action: 'resolve' | 'delete'; status?: 'pending' | 'confirmed' | 'ignored' }) => Promise<DuplicateCheckWorkspaceState>;
    saveContentIgnoreRule: (payload: { pattern: string; normalized?: string; category?: string }) => Promise<DuplicateCheckWorkspaceState>;
    deleteContentIgnoreRule: (ruleId: string) => Promise<DuplicateCheckWorkspaceState>;
    exportContentIgnoreRules: (payload?: { filePath?: string }) => Promise<{ success: boolean; message?: string; filePath?: string; ruleCount?: number; bytes?: number }>;
    importContentIgnoreRules: (payload?: { filePath?: string }) => Promise<{ success: boolean; message?: string; filePath?: string; importedCount?: number; skippedCount?: number; state: DuplicateCheckWorkspaceState }>;
    exportReport: (payload?: { filePath?: string; format?: 'md' | 'docx' | 'pdf' }) => Promise<DuplicateCheckExportReportResult>;
    clear: () => Promise<{ success: boolean; message?: string; state: DuplicateCheckWorkspaceState }>;
  };
  rejectionCheck: {
    loadState: () => Promise<RejectionCheckWorkspaceState>;
    importDocument: (role: RejectionDocumentRole) => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    importTenderFromTechnicalPlan: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
    removeDocument: (role: RejectionDocumentRole, documentId?: string) => Promise<RejectionCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<RejectionCheckWorkspaceState, 'step' | 'activeDocumentTab' | 'activeResultTab' | 'activeCheckResultTab' | 'customCheckItems' | 'checkOptions'>>) => Promise<RejectionCheckWorkspaceState>;
    updateState: (partial: Partial<RejectionCheckWorkspaceState>) => Promise<RejectionCheckWorkspaceState>;
    resolveFinding: (payload: { section: 'rejection' | 'typo' | 'logic'; findingId: string; status: 'pending' | 'ignored' }) => Promise<RejectionCheckWorkspaceState>;
    batchHandleFindings: (payload: { section: 'rejection' | 'typo' | 'logic'; findingIds: string[]; action: 'resolve' | 'delete'; status?: 'pending' | 'ignored' }) => Promise<RejectionCheckWorkspaceState>;
    exportReport: (payload?: { filePath?: string; format?: 'md' | 'docx' | 'pdf' }) => Promise<RejectionCheckExportReportResult>;
    clear: () => Promise<{ success: boolean; message?: string; state: RejectionCheckWorkspaceState }>;
  };
  aiEvaluation: {
    loadState: () => Promise<AiEvaluationState>;
    generateFromTechnicalPlan: () => Promise<AiEvaluationState>;
    importBidDocument: () => Promise<AiEvaluationImportDocumentResult>;
    updateItem: (id: string, patch: AiEvaluationItemPatch) => Promise<AiEvaluationState>;
    saveExpertScore: (payload: AiEvaluationExpertScoreInput) => Promise<AiEvaluationState>;
    exportReport: (options?: { filePath?: string }) => Promise<AiEvaluationExportReportResult>;
    exportOfficePackage: (options: { format: 'docx' | 'xlsx'; filePath?: string }) => Promise<AiEvaluationOfficeExportResult>;
    clear: () => Promise<AiEvaluationState>;
  };
  businessBid: {
    loadState: () => Promise<BusinessBidState>;
    importFromTechnicalPlan: () => Promise<BusinessBidState>;
    importTenderDocument: () => Promise<BusinessBidImportDocumentResult>;
    enhanceWithAi: () => Promise<BusinessBidAiExtractionResult>;
    updateClause: (id: string, patch: BusinessBidClausePatch) => Promise<BusinessBidState>;
    importAttachments: (options?: { kind?: string }) => Promise<BusinessBidImportAttachmentsResult>;
    updateAttachment: (id: string, patch: BusinessBidAttachmentPatch) => Promise<BusinessBidState>;
    deleteAttachment: (id: string) => Promise<BusinessBidState>;
    exportReport: (options?: { filePath?: string }) => Promise<BusinessBidExportReportResult>;
    exportOfficePackage: (options: { format: 'docx' | 'xlsx'; filePath?: string }) => Promise<BusinessBidOfficeExportResult>;
    clear: () => Promise<BusinessBidState>;
  };
  bidOpportunity: {
    loadState: () => Promise<BidOpportunityState>;
    saveOpportunity: (payload: BidOpportunityInput) => Promise<BidOpportunityState>;
    saveOpportunityWithAi: (payload: BidOpportunityInput) => Promise<BidOpportunityState>;
    importDocument: () => Promise<BidOpportunityImportResult>;
    importUrl: (payload: { url: string }) => Promise<BidOpportunityImportResult>;
    updateStatus: (id: string, status: BidOpportunityStatus) => Promise<BidOpportunityState>;
    updateFollowUp: (id: string, patch: BidOpportunityFollowUpPatch) => Promise<BidOpportunityState>;
    deleteOpportunity: (id: string) => Promise<BidOpportunityState>;
    exportReport: (options?: { filePath?: string }) => Promise<BidOpportunityExportReportResult>;
    exportCalendar: (options?: { filePath?: string }) => Promise<BidOpportunityExportCalendarResult>;
    clear: () => Promise<BidOpportunityState>;
  };
  tasks: {
    startBidSectionExtraction: (payload?: unknown) => Promise<unknown>;
    startBidAnalysis: (payload: unknown) => Promise<unknown>;
    startOutlineGeneration: (payload: unknown) => Promise<unknown>;
    startGlobalFactsGeneration: (payload: unknown) => Promise<unknown>;
    startContentGeneration: (payload: unknown) => Promise<unknown>;
    pauseContentGeneration: () => Promise<unknown>;
    startRejectionItemsExtraction: (payload: unknown) => Promise<unknown>;
    startRejectionCheck: (payload: unknown) => Promise<unknown>;
    startDuplicateAnalysis: (payload: unknown) => Promise<unknown>;
    startBusinessBidAiExtraction: (payload: unknown) => Promise<unknown>;
    startAiEvaluationExtraction: (payload: unknown) => Promise<unknown>;
    startAiEvaluationBatchScoring: (payload: unknown) => Promise<unknown>;
    getActiveTasks: () => Promise<unknown[]>;
    onTaskEvent: <TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown, TBusinessBidState = unknown, TAiEvaluationState = unknown>(callback: (event: TaskEvent<TState, TRejectionCheckState, TDuplicateCheckState, TBusinessBidState, TAiEvaluationState>) => void) => () => void;
  };
  export: {
    previewWordExport: (payload: unknown) => Promise<WordExportPreviewResult>;
    exportWord: (payload: unknown) => Promise<WordExportResult>;
    openFile: (filePath: string) => Promise<{ success: boolean }>;
    onWordExportProgress: (callback: (event: WordExportProgressEvent) => void) => () => void;
  };
  systemFonts: {
    list: () => Promise<string[]>;
  };
}
