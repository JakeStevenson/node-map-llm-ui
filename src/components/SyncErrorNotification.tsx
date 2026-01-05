import { useConversationStore } from '../store/conversationStore';

export function SyncErrorNotification() {
  const syncState = useConversationStore((state) => state.syncState);
  const clearSyncErrors = useConversationStore((state) => state.clearSyncErrors);

  if (!syncState.lastError) return null;

  const { type, message, retryCount } = syncState.lastError;

  const getIcon = () => {
    if (type === 'network') return '🌐';
    if (type === 'timeout') return '⏱️';
    return '⚠️';
  };

  const getTitle = () => {
    if (type === 'network') return 'Network Error';
    if (type === 'timeout') return 'Sync Timeout';
    return 'Sync Error';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-red-500/90 text-white rounded-lg shadow-lg p-4 flex items-start gap-3">
        <span className="text-2xl">{getIcon()}</span>
        <div className="flex-1">
          <h3 className="font-semibold mb-1">{getTitle()}</h3>
          <p className="text-sm opacity-90">{message}</p>
          <p className="text-xs mt-1 opacity-75">
            Failed after {retryCount + 1} attempts. Changes saved locally.
          </p>
        </div>
        <button
          onClick={clearSyncErrors}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {syncState.failed.length > 1 && (
        <p className="text-xs text-center mt-2 text-gray-600 dark:text-gray-400">
          {syncState.failed.length} sync errors
        </p>
      )}
    </div>
  );
}
