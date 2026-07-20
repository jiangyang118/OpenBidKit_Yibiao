export type BidDocumentAssetType = 'image' | 'scan' | 'document';
export type BidDocumentQuoteCategory = 'software' | 'hardware' | 'service' | 'material' | 'other';

export interface BidDocumentSectionTemplate {
  id: string;
  title: string;
  level: number;
  required: boolean;
  parentId?: string;
}

export interface BidDocumentAssetDefinition {
  key: string;
  title: string;
  sectionId: string;
  type?: BidDocumentAssetType;
  required?: boolean;
}

export interface BidDocumentValidationProfile {
  quoteTotalWithTax?: number;
  requiredModels?: string[];
  paymentRequiredText?: string;
  paymentForbiddenText?: string;
  requiredDocumentTitleText?: string;
  requiredSectionIds?: string[];
}

export interface BidDocumentContentProfile {
  qualificationSummary?: string;
  projectUnderstanding?: string;
  architectureRows?: string[][];
  flowRows?: string[][];
  keyFunctionRows?: string[][];
  interfaceRows?: string[][];
  dataSecurityText?: string;
  deliveryResultsText?: string;
  detailedFunctionsIntro?: string;
  supportingEquipmentText?: string;
}

export interface BidDocumentTemplate {
  id: string;
  name: string;
  documentTitle: string;
  industry: string;
  contentProfile?: BidDocumentContentProfile;
  sections: BidDocumentSectionTemplate[];
  requiredAssetKeys: string[];
  assetDefinitions?: BidDocumentAssetDefinition[];
  validationProfile: BidDocumentValidationProfile;
}

export interface BidDocumentPaymentTerm {
  stage: string;
  ratio: number;
  text: string;
}

export interface BidDocumentProjectData {
  templateId: string;
  projectName: string;
  purchaserName: string;
  supplierName: string;
  totalWithTax: number;
  totalWithoutTax: number;
  disabledSectionIds?: string[];
  taxPolicy: {
    description?: string;
    softwareHardwareRate?: number;
    serviceRate?: number;
    defaultRate?: number;
  };
  paymentTerms: BidDocumentPaymentTerm[];
}

export interface BidDocumentQuoteItem {
  name: string;
  quantity: number;
  brandModel: string;
  unitPriceWithTax: number;
  totalWithTax: number;
  taxRate?: number;
  category?: BidDocumentQuoteCategory;
}

export interface BidDocumentAssetRef {
  key: string;
  title: string;
  filePath: string;
  type: BidDocumentAssetType;
  required: boolean;
  sectionId: string;
  templateId?: string;
}

export interface BidDocumentValidationResult {
  passed: boolean;
  errors: string[];
  details: Record<string, unknown>;
}

export interface BidDocumentBuildLog {
  templateCheck: BidDocumentValidationResult;
  quoteCheck: BidDocumentValidationResult;
  paymentCheck: BidDocumentValidationResult;
  titleCheck: BidDocumentValidationResult;
  identityCheck: BidDocumentValidationResult;
  forbiddenWordsCheck: BidDocumentValidationResult;
  assetCheck: BidDocumentValidationResult;
  sectionSelectionCheck: BidDocumentValidationResult;
  sectionCheck: BidDocumentValidationResult;
  quoteResolutionCheck?: BidDocumentValidationResult;
  docxOpenCheck: BidDocumentValidationResult;
  docxContentCheck: BidDocumentValidationResult;
  docxSectionOrderCheck: BidDocumentValidationResult;
  docxTableCheck: BidDocumentValidationResult;
  docxQuoteIntegrityCheck: BidDocumentValidationResult;
  docxLayoutCheck: BidDocumentValidationResult;
  docxTocCheck: BidDocumentValidationResult;
  docxStyleCheck: BidDocumentValidationResult;
  docxTechnicalDensityCheck: BidDocumentValidationResult;
  docxPageBreakCheck: BidDocumentValidationResult;
  imageInsertionCheck: BidDocumentValidationResult;
  docxAssetPlacementCheck: BidDocumentValidationResult;
  docxForbiddenWordsCheck: BidDocumentValidationResult;
  passed: boolean;
  errors: string[];
  outputPath?: string;
}

export interface BidDocumentState {
  templates: BidDocumentTemplate[];
  template: BidDocumentTemplate;
  projectData: BidDocumentProjectData;
  quoteItems: BidDocumentQuoteItem[];
  assetMap: Record<string, BidDocumentAssetRef>;
  assetPackage?: Record<string, unknown> | null;
  lastBuildLog?: BidDocumentBuildLog | null;
}

export interface BidDocumentValidateResult {
  success: boolean;
  buildLog: BidDocumentBuildLog;
}

export interface BidDocumentExportResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  filePath?: string;
  bytes?: number;
  buildLog: BidDocumentBuildLog;
}

export interface BidDocumentSelectAssetResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  filePath?: string;
}

export interface BidDocumentReferenceAlignmentResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  referencePath?: string;
  candidatePath?: string;
  analysis?: Record<string, unknown>;
  candidateAnalysis?: Record<string, unknown>;
  alignment?: {
    passed: boolean;
    errors: string[];
    details?: {
      missingHeadings?: string[];
      extraHeadings?: string[];
      outOfOrderHeadings?: string[];
      missingTableHeaders?: string[];
      extraTableHeaders?: string[];
      layoutDiffs?: unknown[];
      summaryDiffs?: unknown[];
      referenceSummary?: Record<string, unknown>;
      candidateSummary?: Record<string, unknown>;
    };
  };
}

export interface BidDocumentTemplateInfoExportResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  filePath?: string;
  templateInfo?: Record<string, unknown>;
}

export interface BidDocumentProjectConfigExportResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  filePath?: string;
  schemaPath?: string;
  projectConfig?: Record<string, unknown>;
  assetPackage?: Record<string, unknown>;
}

export interface BidDocumentReadinessReportResult {
  success: boolean;
  canceled?: boolean;
  readinessReady?: boolean;
  message: string;
  markdownPath?: string;
  jsonPath?: string;
  xlsxPath?: string;
  readinessReport?: Record<string, unknown>;
  buildLog: BidDocumentBuildLog;
}

export interface BidDocumentAssetCollectionPackageResult {
  success: boolean;
  canceled?: boolean;
  readinessReady?: boolean;
  message: string;
  outputDir?: string;
  markdownPath?: string;
  manifestPath?: string;
  manifestSchemaPath?: string;
  quoteResolutionPath?: string;
  quoteResolutionSchemaPath?: string;
  assetsDir?: string;
  assetCount?: number;
  demoOnlyAssetCount?: number;
  replacementRequiredAssetCount?: number;
  missingRequiredAssetCount?: number;
  readinessReport?: Record<string, unknown>;
  buildLog: BidDocumentBuildLog;
}

export interface BidDocumentAssetCollectionPackageImportResult {
  success: boolean;
  validationPassed?: boolean;
  canceled?: boolean;
  message: string;
  packageDir?: string;
  manifestPath?: string;
  manifestSchemaPath?: string;
  quoteResolutionPath?: string;
  quoteResolutionApplied?: boolean;
  quoteResolutionAction?: string;
  quoteResolutionErrors?: string[];
  appliedCount?: number;
  missingCount?: number;
  missingRequiredCount?: number;
  state?: BidDocumentState;
  buildLog?: BidDocumentBuildLog;
}

export interface BidDocumentProjectConfigImportResult {
  success: boolean;
  validationPassed?: boolean;
  canceled?: boolean;
  message: string;
  filePath?: string;
  state?: BidDocumentState;
  buildLog?: BidDocumentBuildLog;
}
