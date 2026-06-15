import { useEffect, useRef, useState } from 'react';
import AppRouter from './app/AppRouter';
import GpuHardwareAccelerationPrompt from './app/GpuHardwareAccelerationPrompt';
import UpdateNotifier from './app/UpdateNotifier';
import AppShell from './components/AppShell';
import { trackAppOpen, trackConfigUsage, trackPageView } from './shared/analytics/analytics';
import type { AppTheme, SidebarLayout } from './shared/types';
import type { SectionId } from './shared/types/navigation';

function isDeveloperSection(section: SectionId) {
  return section.startsWith('developer-');
}

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('bid-generation');
  const [developerMode, setDeveloperMode] = useState(false);
  const [theme, setTheme] = useState<AppTheme>('system');
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayout>('classic');
  const leaveGuardRef = useRef<((nextSection?: string) => Promise<boolean>) | null>(null);

  useEffect(() => {
    trackAppOpen();

    void window.yibiao?.config.load()
      .then((config) => {
        setDeveloperMode(Boolean(config?.developer_mode));
        setTheme(normalizeAppTheme(config?.theme));
        setSidebarLayout(normalizeSidebarLayout(config?.sidebar_layout));
        trackConfigUsage({}, config);
      })
      .catch((error) => console.warn('读取开发者模式失败', error));
  }, []);

  useEffect(() => {
    trackPageView(activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (!developerMode && isDeveloperSection(activeSection)) {
      setActiveSection('bid-generation');
    }
  }, [activeSection, developerMode]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const effectiveTheme = theme === 'system' && mediaQuery ? (mediaQuery.matches ? 'dark' : 'light') : theme === 'dark' ? 'dark' : 'light';
      root.dataset.theme = effectiveTheme;
      root.dataset.themePreference = theme;
      root.style.colorScheme = effectiveTheme;
    };

    applyTheme();
    if (theme !== 'system' || !mediaQuery) {
      return;
    }

    mediaQuery.addEventListener?.('change', applyTheme);
    return () => mediaQuery.removeEventListener?.('change', applyTheme);
  }, [theme]);

  const requestSectionChange = async (section: SectionId) => {
    if (section === activeSection) {
      return;
    }
    const allowed = await (leaveGuardRef.current?.(section) ?? Promise.resolve(true));
    if (allowed) {
      setActiveSection(section);
    }
  };

  return (
    <>
      <GpuHardwareAccelerationPrompt />
      <UpdateNotifier />
      <AppShell
        activeSection={activeSection}
        developerMode={developerMode}
        sidebarLayout={sidebarLayout}
        onSectionChange={(section) => { void requestSectionChange(section); }}
      >
        <AppRouter
          activeSection={activeSection}
          developerMode={developerMode}
          onDeveloperModeChange={setDeveloperMode}
          onAppearanceChange={({ theme: nextTheme, sidebarLayout: nextSidebarLayout }) => {
            setTheme(nextTheme);
            setSidebarLayout(nextSidebarLayout);
          }}
          onSectionChange={(section) => { void requestSectionChange(section); }}
          registerLeaveGuard={(guard) => {
            leaveGuardRef.current = guard;
          }}
        />
      </AppShell>
    </>
  );
}

function normalizeAppTheme(value?: string): AppTheme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function normalizeSidebarLayout(value?: string): SidebarLayout {
  return value === 'compact' ? 'compact' : 'classic';
}

export default App;
