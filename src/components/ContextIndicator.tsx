import { useMemo } from 'react';
import type { ContextStatus } from '../types';

interface ContextIndicatorProps {
  contextStatus: ContextStatus;
  onClick?: () => void;
}

export function ContextIndicator({ contextStatus, onClick }: ContextIndicatorProps) {
  const { currentTokens, maxTokens, percentage, state } = contextStatus;

  // Only show if usage is above 60%
  if (percentage < 0.6) {
    return null;
  }

  // Calculate display values
  const percentageDisplay = Math.round(percentage * 100);

  // Subtle color based on state - muted and less distracting
  const colorClasses = useMemo(() => {
    switch (state) {
      case 'critical':
        return {
          bar: 'bg-red-400/60',
          text: 'text-red-400/80',
          dot: 'bg-red-400',
        };
      case 'warning':
        return {
          bar: 'bg-amber-400/60',
          text: 'text-amber-400/80',
          dot: 'bg-amber-400',
        };
      default:
        return {
          bar: 'bg-gray-400/40',
          text: 'text-gray-400',
          dot: 'bg-gray-400',
        };
    }
  }, [state]);

  return (
    <div
      className="flex items-center gap-2 py-1 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
      onClick={onClick}
      title={`Context usage: ${percentageDisplay}% (${currentTokens} / ${maxTokens} tokens)\nClick for details`}
    >
      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full ${colorClasses.dot} flex-shrink-0`} />

      {/* Compact progress bar */}
      <div className="flex-1 min-w-0">
        <div className="w-full bg-[var(--color-border)] rounded-full h-1 overflow-hidden">
          <div
            className={`h-full ${colorClasses.bar} transition-all duration-300 ease-out`}
            style={{ width: `${Math.min(percentage * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Compact text */}
      <span className={`text-[10px] font-medium ${colorClasses.text} flex-shrink-0`}>
        {percentageDisplay}%
      </span>
    </div>
  );
}
