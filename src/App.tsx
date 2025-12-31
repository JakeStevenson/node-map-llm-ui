import { useState, useEffect, useCallback } from 'react';
import { CanvasView } from './components/Canvas';
import { ChatSidebar } from './components/ChatSidebar';
import { SettingsModal } from './components/Settings';

const MIN_VIEWPORT_WIDTH = 1024;

function DesktopRequiredMessage(): JSX.Element {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-background)] p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-4">
          Desktop Required
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Node-Map LLM UI requires a desktop browser with at least {MIN_VIEWPORT_WIDTH}px
          viewport width for the best experience with the canvas interface.
        </p>
      </div>
    </div>
  );
}

export default function App(): JSX.Element {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= MIN_VIEWPORT_WIDTH : true
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleResize = (): void => {
      setIsDesktop(window.innerWidth >= MIN_VIEWPORT_WIDTH);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcut for settings (Cmd+,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  if (!isDesktop) {
    return <DesktopRequiredMessage />;
  }

  return (
    <>
      <div className="h-full flex">
        {/* Sidebar - Fixed 320px */}
        <ChatSidebar className="w-80 flex-shrink-0" onOpenSettings={handleOpenSettings} />

        {/* Canvas - Flexible */}
        <main className="flex-1 h-full">
          <CanvasView />
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />
    </>
  );
}
