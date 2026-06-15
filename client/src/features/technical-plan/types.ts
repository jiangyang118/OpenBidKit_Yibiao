import type { OutlineData, OutlineMode } from '../../shared/types';

export type TechnicalPlanStep = 'document-analysis' | 'bid-analysis' | 'outline-generation' | 'global-facts' | 'content-edit';
export type TechnicalPlanWorkflowKind = 'technical-plan' | 'existing-plan-expansion';
export type BidAnalysisMode = 'key' | 'full' | 'custom';
export type BidAnalysisTaskStatus = 'idle' | 'running' | 'success' | 'error';
export type BackgroundTaskType = 'bid-analysis' | 'outline-generation' | 'global-facts-generation' | 'content-generation';
export type BackgroundTaskStatus = 'running' | 'pausing' | 'paused' | 'success' | 'error';
export type ContentGenerationSectionStatus = 'idle' | 'running' | 'success' | 'error';
export type ContentTableRequirement = 'none' | 'light' | 'moderate' | 'heavy';
export type SaveOutlineReason = 'sort' | 'edit' | 'delete' | 'add-root' | 'add-child' | 'replace';

export interface SaveOutlineRequest {
  outlineData: OutlineData;
  reason: SaveOutlineReason;
  idMap?: Record<string, string>;
  affectedNodeIds?: string[];
}

export interface ContentGenerationOptions {
  useAiImages: boolean;
  maxAiImages: number;
  useMermaidImages: boolean;
  tableRequirement: ContentTableRequirement;
  minimumWords: number;
  contentConcurrency: number;
  enableConsistencyAudit: boolean;
  enableOriginalPlanCoverageAudit: boolean;
}

export interface ContentImageStats {
  planned: number;
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
}

export type ContentConsistencyAuditItemStatus = 'conflict' | 'fixed' | 'manual';

export interface ContentConsistencyAuditItem {
  section_id: string;
  title: string;
  fact_title: string;
  evidence: string;
  reason: string;
  severity: string;
  status: ContentConsistencyAuditItemStatus;
  applied_count?: number;
  errors?: string[];
}

export interface ContentConsistencyAuditFailedGroup {
  index: number;
  total: number;
  error: string;
  section_ids?: string[];
}

export interface ContentConsistencyAuditReport {
  enabled: boolean;
  ran: boolean;
  status: 'idle' | 'running' | 'success' | 'partial' | 'skipped';
  group_total: number;
  group_completed: number;
  conflict_total: number;
  fixed_total: number;
  manual_total: number;
  failed_group_total: number;
  items: ContentConsistencyAuditItem[];
  failed_groups: ContentConsistencyAuditFailedGroup[];
  updated_at?: string;
}

export type ContentOriginalCoverageItemStatus = 'covered' | 'partial' | 'missing' | 'conflict';
export type ContentOriginalCoverageRepairStatus = 'none' | 'fixed' | 'manual';

export interface ContentOriginalCoverageItem {
  source_id: string;
  node_id: string;
  title: string;
  source_title: string;
  status: ContentOriginalCoverageItemStatus;
  missing_points: string[];
  repair_suggestion: string;
  repair_status: ContentOriginalCoverageRepairStatus;
  errors?: string[];
}

export type ContentOriginalCommitmentStatus = 'preserved' | 'partial' | 'missing' | 'conflict';

export interface ContentOriginalCommitmentItem {
  source_id: string;
  source_title: string;
  node_id: string;
  title: string;
  category: string;
  status: ContentOriginalCommitmentStatus;
  missing_points: string[];
  repair_status?: ContentOriginalCoverageRepairStatus;
  errors?: string[];
}

export interface ContentOriginalCommitmentSummary {
  total: number;
  preserved_total: number;
  partial_total: number;
  missing_total: number;
  conflict_total: number;
  risk_total: number;
  preservation_rate: number;
  items: ContentOriginalCommitmentItem[];
}

export interface ContentOriginalCoverageFailedSection {
  node_id: string;
  title: string;
  error: string;
}

export type ContentOriginalCoverageUnassignedStatus = 'pending' | 'bound' | 'ignored';

export interface ContentOriginalCoverageUnassignedItem {
  source_id: string;
  source_title: string;
  chars: number;
  excerpt: string;
  status: ContentOriginalCoverageUnassignedStatus;
  bound_node_id?: string;
  bound_node_title?: string;
  handled_at?: string;
}

export interface ContentOriginalCoverageReport {
  enabled: boolean;
  ran: boolean;
  status: 'idle' | 'running' | 'success' | 'partial' | 'skipped';
  source_total: number;
  audited_total: number;
  covered_total: number;
  partial_total: number;
  missing_total: number;
  conflict_total: number;
  fixed_total: number;
  manual_total: number;
  coverage_rate: number;
  items: ContentOriginalCoverageItem[];
  unassigned_total?: number;
  pending_unassigned_total?: number;
  unassigned_items?: ContentOriginalCoverageUnassignedItem[];
  commitment_summary?: ContentOriginalCommitmentSummary;
  failed_sections: ContentOriginalCoverageFailedSection[];
  updated_at?: string;
}

export interface BackgroundTaskState {
  task_id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  stats?: {
    content?: {
      phase: 'planning' | 'restoring' | 'generating' | 'outline-expanding' | 'expanding' | 'original-auditing' | 'auditing' | 'illustrating' | 'done';
      planning_total: number;
      planning_completed: number;
      generation_total: number;
      generation_completed: number;
      outline_expansion_total?: number;
      outline_expansion_completed?: number;
      outline_expansion_step_total?: number;
      outline_expansion_step_completed?: number;
      outline_expansion_round?: number;
      outline_expansion_round_total?: number;
      outline_expansion_step_label?: string;
      minimum_words?: number;
      current_words?: number;
      audit_group_total?: number;
      audit_group_completed?: number;
      audit_conflict_total?: number;
      audit_fix_total?: number;
      audit_fix_completed?: number;
      audit_fix_failed?: number;
      illustration_total?: number;
      illustration_completed?: number;
    };
    images?: Partial<ContentImageStats> & {
      total?: ContentImageStats;
      ai?: ContentImageStats;
      mermaid?: ContentImageStats;
      knowledge?: ContentImageStats;
    };
    audit?: ContentConsistencyAuditReport;
    originalCoverage?: ContentOriginalCoverageReport;
  };
}

export interface BidAnalysisTaskState {
  id: string;
  label: string;
  status: BidAnalysisTaskStatus;
  content: string;
  error?: string;
}

export type BidAnalysisTasks = Record<string, BidAnalysisTaskState>;

export interface GlobalFactGroupState {
  id: string;
  title: string;
  content: string;
  updated_at?: string;
}

export interface ContentGenerationSectionState {
  id: string;
  title: string;
  status: ContentGenerationSectionStatus;
  content: string;
  error?: string;
  updated_at?: string;
}

export type ContentGenerationSections = Record<string, ContentGenerationSectionState>;

export type ContentIllustrationType = 'ai' | 'mermaid' | 'none';

export interface ContentGenerationPlanData {
  knowledge: {
    item_ids: string[];
  };
  facts: {
    titles: string[];
  };
  table: {
    needed: boolean;
    purpose: string;
  };
  mermaid: {
    needed: boolean;
    title: string;
    code: string;
    priority: number;
    reason: string;
  };
  image: {
    needed: boolean;
    style: 'engineering_diagram' | 'realistic_photo' | '';
    title: string;
    prompt: string;
    priority: number;
    reason: string;
  };
  original_material?: {
    restored: boolean;
    optimized: boolean;
    source_ids: string[];
    source_titles: string[];
    source_hashes: string[];
    restored_chars: number;
    restored_at?: string;
    optimized_at?: string;
  };
}

export interface ContentGenerationPlanState {
  plan: ContentGenerationPlanData;
  illustration_type: ContentIllustrationType;
  updated_at?: string;
}

export type ContentGenerationPlans = Record<string, ContentGenerationPlanState>;

export interface ContentGenerationRuntimeState {
  phase?: string;
  touched_item_ids?: string[];
  outline_expansion_completed?: number;
  expansion_cycle_item_ids?: string[];
  expansion_attempted_item_ids?: string[];
  expansion_cycle_start_words?: number;
  target_item_id?: string;
  regenerate_requirement?: string;
  updated_at?: string;
}

export interface TechnicalPlanTenderFile {
  fileName: string;
  markdownPath: string;
  markdownChars: number;
  contentHash: string;
  parserLabel?: string;
  importedAt?: string;
  selectedSectionId?: string;
  selectedSectionTitle?: string;
  selectedSectionHeadLine?: string;
  updatedAt: string;
}

export interface TechnicalPlanOriginalPlanFile {
  fileName: string;
  markdownPath: string;
  markdownChars: number;
  contentHash: string;
  parserLabel?: string;
  importedAt?: string;
  updatedAt: string;
}

export interface DetectedBidSection {
  id: string;
  index: number;
  unit: string;
  title: string;
  headLine: string;
  description: string;
}

export interface PendingSectionSelection {
  fileName: string;
  parserLabel?: string | null;
  sections: DetectedBidSection[];
  totalDeclared?: number | null;
  createdAt?: string;
}

export interface TechnicalPlanState {
  workflowKind: TechnicalPlanWorkflowKind;
  step: TechnicalPlanStep;
  tenderFile: TechnicalPlanTenderFile | null;
  originalPlanFile: TechnicalPlanOriginalPlanFile | null;
  projectOverview: string;
  techRequirements: string;
  bidAnalysisMode: BidAnalysisMode;
  bidAnalysisSelectedTaskIds: string[];
  bidAnalysisTasks: BidAnalysisTasks;
  bidAnalysisProgress: number;
  outlineMode: OutlineMode;
  referenceKnowledgeDocumentIds: string[];
  bidAnalysisTask?: BackgroundTaskState;
  outlineGenerationTask?: BackgroundTaskState;
  globalFactsTask?: BackgroundTaskState;
  globalFacts: GlobalFactGroupState[];
  contentGenerationTask?: BackgroundTaskState;
  contentGenerationOptions?: ContentGenerationOptions;
  contentGenerationSections: ContentGenerationSections;
  contentGenerationPlans: ContentGenerationPlans;
  contentGenerationRuntime?: ContentGenerationRuntimeState;
  outlineData: OutlineData | null;
  pendingSectionSelection: PendingSectionSelection | null;
}
