import { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasView } from './components/Canvas';
import { ChatSidebar } from './components/ChatSidebar';
import { SettingsModal } from './components/Settings';
import { ChatsModal } from './components/Chats';
import { SyncErrorNotification } from './components/SyncErrorNotification';
import { useConversationStore, hasPendingSyncs } from './store/conversationStore';

const MIN_VIEWPORT_WIDTH = 1024;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

// Load saved width from localStorage
const getSavedSidebarWidth = (): number => {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
  const saved = localStorage.getItem('sidebar-width');
  if (saved) {
    const width = parseInt(saved, 10);
    if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
      return width;
    }
  }
  return DEFAULT_SIDEBAR_WIDTH;
};

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
  const [isChatsOpen, setIsChatsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSavedSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Store initialization
  const isInitialized = useConversationStore((state) => state.isInitialized);
  const isLoading = useConversationStore((state) => state.isLoading);
  const initFromApi = useConversationStore((state) => state.initFromApi);

  // Initialize store from API on mount
  useEffect(() => {
    if (!isInitialized && !isLoading) {
      initFromApi();
    }
  }, [isInitialized, isLoading, initFromApi]);

  useEffect(() => {
    const handleResize = (): void => {
      setIsDesktop(window.innerWidth >= MIN_VIEWPORT_WIDTH);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle sidebar resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, resizeRef.current.startWidth + delta)
      );
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save to localStorage
      localStorage.setItem('sidebar-width', sidebarWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

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

  // Warn user if they try to leave with pending syncs
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingSyncs()) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we set one anyway
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const handleOpenChats = useCallback(() => {
    setIsChatsOpen(true);
  }, []);

  const handleCloseChats = useCallback(() => {
    setIsChatsOpen(false);
  }, []);

  if (!isDesktop) {
    return <DesktopRequiredMessage />;
  }

  // Show loading state while initializing from API
  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)] mx-auto mb-4"></div>
          <p className="text-[var(--color-text-secondary)]">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`h-full flex ${isResizing ? 'select-none' : ''}`}>
        {/* Sidebar - Resizable */}
        <ChatSidebar
          style={{ width: sidebarWidth }}
          className="flex-shrink-0"
          onOpenSettings={handleOpenSettings}
          onOpenChats={handleOpenChats}
        />

        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-[var(--color-accent)]/50 active:bg-[var(--color-accent)] transition-colors ${
            isResizing ? 'bg-[var(--color-accent)]' : 'bg-transparent'
          }`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />

        {/* Canvas - Flexible */}
        <main className="flex-1 h-full min-w-0">
          <CanvasView />
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={handleCloseSettings} />

      {/* Chats Modal */}
      <ChatsModal isOpen={isChatsOpen} onClose={handleCloseChats} />

      {/* Sync Error Notification */}
      <SyncErrorNotification />
    </>
  );
}
