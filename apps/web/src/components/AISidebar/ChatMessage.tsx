import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { AIMessage } from '@mathboard/shared';
import type { ReactNode, HTMLAttributes } from 'react';
import { normalizeMathDelimiters } from './markdown';

interface Props {
  message: AIMessage;
  assistantLabel: string;
  userLabel: string;
  theme: 'light' | 'dark';
}

type CodeRendererProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
};

export function ChatMessage({ message, assistantLabel, userLabel, theme }: Props) {
  const isAssistant = message.role === 'assistant';
  const isDark = theme === 'dark';
  
  // Hide the JSON board block from the chat UI
  const displayContent = normalizeMathDelimiters(
    message.content.replace(/```json_board[\s\S]*?```/g, '').trim()
  );

  if (!displayContent) return null;

  const cardClass = isAssistant
    ? isDark
      ? 'border-slate-700 bg-slate-900 text-slate-100'
      : 'border-slate-200 bg-slate-50 text-slate-900'
    : isDark
      ? 'border-slate-600 bg-slate-800 text-slate-100'
      : 'border-slate-300 bg-white text-slate-900';
  const labelClass = `mb-1 text-xs font-semibold uppercase tracking-[0.2em] ${
    isDark ? 'text-slate-400' : 'text-slate-400'
  }`;
  const bodyTextClass = isDark ? 'text-slate-200' : 'text-slate-700';

  const codeRenderer = ({ inline, children, className, ...props }: CodeRendererProps) => (
    inline ? (
      <code
        {...props}
        className={`rounded bg-slate-800/40 px-1 py-0.5 text-sm text-rose-200 ${className ?? ''}`.trim()}
      >
        {children}
      </code>
    ) : (
      <code
        {...props}
        className={`block rounded bg-slate-950/60 p-2 text-sm text-rose-100 ${className ?? ''}`.trim()}
      >
        {children}
      </code>
    )
  );

  const markdownComponents: Components = {
    p: ({ children, ...props }) => (
      <p {...props} className="mb-2 last:mb-0 whitespace-pre-line">
        {children}
      </p>
    ),
    strong: ({ children, ...props }) => (
      <strong {...props} className="font-semibold">
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em {...props} className="italic">
        {children}
      </em>
    ),
    ul: ({ children, ...props }) => (
      <ul {...props} className="mb-2 ml-4 list-disc space-y-1">
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol {...props} className="mb-2 ml-4 list-decimal space-y-1">
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li {...props}>
        {children}
      </li>
    ),
    code: codeRenderer
  };

  return (
    <div className={`rounded-2xl border p-3 text-base shadow-sm ${cardClass}`}>
      <p className={labelClass}>{isAssistant ? assistantLabel : userLabel}</p>
      <div className={`leading-relaxed ${bodyTextClass}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
