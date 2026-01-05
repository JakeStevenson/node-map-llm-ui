import { useState, useEffect, useRef } from 'react';

interface SummaryReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  onRetry: () => void;
  onSave: (editedSummary: string) => void;
}

export function SummaryReviewDialog({
  isOpen,
  onClose,
  summary,
  onRetry,
  onSave,
}: SummaryReviewDialogProps): JSX.Element | null {
  const [editedSummary, setEditedSummary] = useState(summary);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update edited summary when summary prop changes
  useEffect(() => {
    if (isOpen) {
      setEditedSummary(summary);
    }
  }, [isOpen, summary]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleSave = () => {
    onSave(editedSummary);
  };

  const characterCount = editedSummary.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl mx-4 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-review-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2
            id="summary-review-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Review Summary
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Review and edit the generated summary before saving, or retry with different guidance.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="summary-content"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Generated Summary
            </label>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {characterCount.toLocaleString()} characters
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="summary-content"
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-y font-mono"
          />
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            You can edit the summary above before saving. Click "Re-try" to regenerate with different guidance.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between items-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-background)] transition-colors"
          >
            Re-try
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Save Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
