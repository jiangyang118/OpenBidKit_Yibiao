import type { SectionId } from '../shared/types/navigation';
import type { AppTheme, SidebarLayout } from '../shared/types';
import { getAppMenuItemById } from './menuConfig';
import AiEvaluationPage from '../features/ai-evaluation/pages/AiEvaluationPage';
import BidMarketAnalysisPage from '../features/bid-market-analysis/pages/BidMarketAnalysisPage';
import BidDocumentPage from '../features/bid-document/pages/BidDocumentPage';
import BidOpportunityPage from '../features/bid-opportunity/pages/BidOpportunityPage';
import BusinessBidPage from '../features/business-bid/pages/BusinessBidPage';
import DeveloperToolsPage, { isDeveloperToolsSection } from '../features/developer/pages/DeveloperToolsPage';
import DeveloperTestPage from '../features/developer/pages/DeveloperTestPage';
import ExportFormatPage from '../features/export-format/pages/ExportFormatPage';
import DuplicateCheckPage from '../features/duplicate-check/pages/DuplicateCheckPage';
import ImageKnowledgeBasePage from '../features/image-knowledge-base/pages/ImageKnowledgeBasePage';
import KnowledgeBasePage from '../features/knowledge-base/pages/KnowledgeBasePage';
import RejectionCheckPage from '../features/rejection-check/pages/RejectionCheckPage';
import ResourcesPage from '../features/resources/pages/ResourcesPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import TechnicalPlanHome from '../features/technical-plan/pages/TechnicalPlanHome';
import SecondaryMenuPage from '../shared/ui/SecondaryMenuPage';

interface AppRouterProps {
  activeSection: SectionId;
  developerMode: boolean;
  onDeveloperModeChange: (developerMode: boolean) => void;
  onAppearanceChange: (appearance: { theme: AppTheme; sidebarLayout: SidebarLayout }) => void;
  onSectionChange: (section: SectionId) => void;
  registerLeaveGuard?: (guard: ((nextSection?: string) => Promise<boolean>) | null) => void;
}

function AppRouter({ activeSection, developerMode, onDeveloperModeChange, onAppearanceChange, onSectionChange, registerLeaveGuard }: AppRouterProps) {
  const activeMenuItem = getAppMenuItemById(activeSection, developerMode);

  if (activeMenuItem?.children?.length) {
    return <SecondaryMenuPage menuItem={activeMenuItem} onNavigate={onSectionChange} />;
  }

  if (isDeveloperToolsSection(activeSection)) {
    return <DeveloperToolsPage sectionId={activeSection} />;
  }

  switch (activeSection) {
    case 'technical-plan':
      return <TechnicalPlanHome workflowKind="technical-plan" registerLeaveGuard={registerLeaveGuard} onSectionChange={onSectionChange} />;
    case 'existing-plan-expansion':
      return <TechnicalPlanHome workflowKind="existing-plan-expansion" registerLeaveGuard={registerLeaveGuard} onSectionChange={onSectionChange} />;
    case 'business-bid':
      return <BusinessBidPage />;
    case 'bid-document':
      return <BidDocumentPage />;
    case 'document-knowledge-base':
      return <KnowledgeBasePage />;
    case 'image-knowledge-base':
      return <ImageKnowledgeBasePage />;
    case 'resources':
      return <ResourcesPage />;
    case 'duplicate-check':
      return <DuplicateCheckPage />;
    case 'rejection-check':
      return <RejectionCheckPage />;
    case 'ai-evaluation':
      return <AiEvaluationPage />;
    case 'export-format':
      return <ExportFormatPage />;
    case 'bid-opportunity':
      return <BidOpportunityPage />;
    case 'bid-market-analysis':
      return <BidMarketAnalysisPage />;
    case 'developer-test':
      return null;
    case 'developer-json-test':
      return <DeveloperTestPage />;
    case 'settings':
      return <SettingsPage onDeveloperModeChange={onDeveloperModeChange} onAppearanceChange={onAppearanceChange} />;
    default:
      return null;
  }
}

export default AppRouter;
