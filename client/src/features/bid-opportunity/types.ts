export type BidOpportunityStatus = 'pending' | 'tracking' | 'abandoned' | 'submitted' | 'won' | 'lost';

export interface BidOpportunityParsedFields {
  projectName: string;
  buyer: string;
  budget: string;
  region: string;
  industry: string;
  registrationDeadline: string;
  bidDeadline: string;
  qualification: string;
  scoringSummary: string;
}

export interface BidOpportunityScoreBreakdown {
  qualification: number;
  budget: number;
  timing: number;
  region: number;
  delivery: number;
  competition?: number;
  profit?: number;
  schedule?: number;
  historicalSimilarity?: number;
}

export interface BidOpportunityRisk {
  level: 'low' | 'medium' | 'high';
  text: string;
}

export interface BidOpportunityKnowledgeMatch {
  itemId: string;
  title: string;
  resume: string;
  sourceFile: string;
  score: number;
  matchedKeywords: string[];
}

export interface BidOpportunity {
  id: string;
  title: string;
  sourceText: string;
  status: BidOpportunityStatus;
  owner: string;
  nextAction: string;
  reminderAt: string;
  parsedFields: BidOpportunityParsedFields;
  score: number;
  scoreBreakdown: BidOpportunityScoreBreakdown;
  risks: BidOpportunityRisk[];
  knowledgeMatches?: BidOpportunityKnowledgeMatch[];
  recommendation: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidOpportunityInput {
  title?: string;
  sourceText: string;
  status?: BidOpportunityStatus;
  owner?: string;
  nextAction?: string;
  reminderAt?: string;
}

export interface BidOpportunityFollowUpPatch {
  owner?: string;
  nextAction?: string;
  reminderAt?: string;
}

export interface BidOpportunityState {
  opportunities: BidOpportunity[];
  activeOpportunityId: string | null;
}

export interface BidOpportunityExportReportResult {
  success: boolean;
  message: string;
  filePath?: string;
  markdownChars?: number;
}

export interface BidOpportunityExportCalendarResult {
  success: boolean;
  message: string;
  filePath?: string;
  calendarChars?: number;
  eventCount?: number;
}

export interface BidOpportunityImportResult {
  success: boolean;
  message: string;
  state: BidOpportunityState;
}
