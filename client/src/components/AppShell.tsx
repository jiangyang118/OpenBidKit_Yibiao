import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import type { SidebarLayout } from '../shared/types';
import type { SectionId } from '../shared/types/navigation';
import Sidebar from './Sidebar';

interface AppShellProps {
  activeSection: SectionId;
  children: ReactNode;
  developerMode: boolean;
  sidebarLayout: SidebarLayout;
  onSectionChange: (section: SectionId) => void;
}

function AppShell({ activeSection, children, developerMode, sidebarLayout, onSectionChange }: AppShellProps) {
  const isMac = navigator.platform.toLowerCase().includes('mac');

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
      <div className={`app-shell${isMac ? ' is-mac' : ''} is-sidebar-${sidebarLayout}`}>
        {isMac && <div className="mac-window-drag-region" aria-hidden="true" />}
        <Sidebar activeSection={activeSection} developerMode={developerMode} sidebarLayout={sidebarLayout} onSectionChange={onSectionChange} />

        <main className="main-area">
          <section className="content-shell" aria-label="主内容">
            {children}
          </section>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

export default AppShell;
