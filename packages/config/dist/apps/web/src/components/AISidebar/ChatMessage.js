import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export function ChatMessage({ message, assistantLabel, userLabel, theme }) {
    const isAssistant = message.role === 'assistant';
    const isDark = theme === 'dark';
    const cardClass = isAssistant
        ? isDark
            ? 'border-slate-700 bg-slate-900 text-slate-100'
            : 'border-slate-200 bg-slate-50 text-slate-900'
        : isDark
            ? 'border-slate-600 bg-slate-800 text-slate-100'
            : 'border-slate-300 bg-white text-slate-900';
    const labelClass = `mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${isDark ? 'text-slate-400' : 'text-slate-400'}`;
    const bodyTextClass = isDark ? 'text-slate-200' : 'text-slate-700';
    const codeRenderer = ({ inline, children, className, ...props }) => (inline ? (_jsx("code", { ...props, className: `rounded bg-slate-800/40 px-1 py-0.5 text-xs text-rose-200 ${className ?? ''}`.trim(), children: children })) : (_jsx("code", { ...props, className: `block rounded bg-slate-950/60 p-2 text-xs text-rose-100 ${className ?? ''}`.trim(), children: children })));
    const markdownComponents = {
        p: ({ children, ...props }) => (_jsx("p", { ...props, className: "mb-2 last:mb-0 whitespace-pre-line", children: children })),
        strong: ({ children, ...props }) => (_jsx("strong", { ...props, className: "font-semibold", children: children })),
        em: ({ children, ...props }) => (_jsx("em", { ...props, className: "italic", children: children })),
        ul: ({ children, ...props }) => (_jsx("ul", { ...props, className: "mb-2 ml-4 list-disc space-y-1", children: children })),
        ol: ({ children, ...props }) => (_jsx("ol", { ...props, className: "mb-2 ml-4 list-decimal space-y-1", children: children })),
        li: ({ children, ...props }) => (_jsx("li", { ...props, children: children })),
        code: codeRenderer
    };
    return (_jsxs("div", { className: `rounded-2xl border p-3 text-sm shadow-sm ${cardClass}`, children: [_jsx("p", { className: labelClass, children: isAssistant ? assistantLabel : userLabel }), _jsx("div", { className: `leading-relaxed ${bodyTextClass}`, children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [rehypeKatex], components: markdownComponents, children: message.content }) })] }));
}
//# sourceMappingURL=ChatMessage.js.map