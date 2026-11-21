import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram.tsx';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView = memo(function MarkdownView({
  content,
  className = '',
}: MarkdownViewProps) {
  return (
    <div className={`conceptus-md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClass, children, ...props }) {
            const match = /language-([\w-]+)/.exec(codeClass || '');
            const lang = match?.[1]?.toLowerCase();
            const rawText = String(children).replace(/\n$/, '');

            if (lang === 'mermaid') {
              return <MermaidDiagram code={rawText} />;
            }

            return (
              <code className={codeClass} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            // Avoid double-wrapping Mermaid diagrams inside <pre>
            const child = Array.isArray(children) ? children[0] : children;
            if (
              child &&
              typeof child === 'object' &&
              'props' in child &&
              typeof (child as any).props?.className === 'string' &&
              (child as any).props.className.includes('language-mermaid')
            ) {
              return <>{children}</>;
            }
            return <pre>{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
