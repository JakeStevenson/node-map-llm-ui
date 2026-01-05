import { useState, useEffect, useRef } from 'react';

interface SummarizePromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (customPrompt: string) => void;
  defaultPrompt?: string;
}

const DEFAULT_PROMPT = `Focus on:
- Key decisions and their reasoning
- Important technical details or code discussed
- Action items and next steps
- Unresolved questions or concerns`;

export function SummarizePromptDialog({
  isOpen,
  onClose,
  onSubmit,
  defaultPrompt,
}: SummarizePromptDialogProps): JSX.Element | null {
  const [prompt, setPrompt] = useState(defaultPrompt || DEFAULT_PROMPT);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update prompt when defaultPrompt changes
  useEffect(() => {
    if (isOpen) {
      setPrompt(defaultPrompt || DEFAULT_PROMPT);
    }
  }, [isOpen, defaultPrompt]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Select all text for easy replacement
      textareaRef.current.select();
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

  const handleSubmit = () => {
    onSubmit(prompt);
  };

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
        className="relative w-full max-w-lg mx-4 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summarize-prompt-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2
            id="summarize-prompt-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Customize Summary
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            What aspects of the conversation are most important to preserve?
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <label
            htmlFor="summary-prompt"
            className="block text-sm font-medium text-[var(--color-text-primary)] mb-2"
          >
            Custom Guidance
          </label>
          <textarea
            ref={textareaRef}
            id="summary-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder={DEFAULT_PROMPT}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-y"
          />
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            This guidance will be combined with comprehensive summarization instructions.
            Leave default or clear for standard summary.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Generate Summary
          </button>
        </div>
      </div>
    </div>
  );
}
