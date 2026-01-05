import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Compact styling for nodes
        p: ({ children }) => <p className="mb-0.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 bg-black/10 rounded text-[0.9em] font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="p-1.5 bg-black/10 rounded text-[0.85em] overflow-x-auto">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="ml-3 mb-0.5 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="ml-3 mb-0.5 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="mb-0">{children}</li>,
        h1: ({ children }) => <h1 className="text-sm font-semibold mb-0.5">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mb-0.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-semibold mb-0.5">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="pl-2 border-l-2 border-current/30 italic">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
            onClick={(e) => e.stopPropagation()} // Prevent node selection
          >
            {children}
          </a>
        ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
