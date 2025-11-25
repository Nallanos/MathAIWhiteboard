import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { InputBox } from './InputBox';
import { SIDEBAR_COPY } from './copy';
export function AISidebar({ messages, onSend, isBusy, theme }) {
    const [currentPrompt, setCurrentPrompt] = useState('');
    const copy = SIDEBAR_COPY;
    const isDark = theme === 'dark';
    const containerClasses = `flex h-full flex-col border-l p-5 ${isDark
        ? 'border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100'
        : 'border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900'}`;
    const headerClasses = `mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 shadow-sm ${isDark
        ? 'border-slate-700 bg-slate-900/60 text-slate-100'
        : 'border-slate-200 bg-white/80 text-slate-900'}`;
    const feedClasses = `flex-1 space-y-3 overflow-y-auto rounded-2xl border p-3 shadow-inner pr-2 ${isDark ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-200 bg-white/90'}`;
    const emptyClasses = `rounded-xl border border-dashed p-4 text-center text-sm ${isDark
        ? 'border-slate-700 bg-slate-900/40 text-slate-400'
        : 'border-slate-200 bg-slate-50 text-slate-500'}`;
    const busyTextClasses = `text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`;
    const handleSubmit = async () => {
        if (!currentPrompt.trim()) {
            return;
        }
        await onSend(currentPrompt);
        setCurrentPrompt('');
    };
    return (_jsxs("aside", { className: containerClasses, children: [_jsx("div", { className: headerClasses, children: _jsx("div", { children: _jsx("p", { className: `text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`, children: copy.appName }) }) }), _jsxs("div", { className: feedClasses, children: [!messages.length && !isBusy && (_jsx("div", { className: emptyClasses, children: copy.emptyState })), messages.map((message) => (_jsx(ChatMessage, { message: message, assistantLabel: copy.assistantLabel, userLabel: copy.userLabel, theme: theme }, message.id))), isBusy && (_jsx("p", { className: busyTextClasses, children: copy.busyState }))] }), _jsx(InputBox, { value: currentPrompt, disabled: isBusy, onChange: setCurrentPrompt, onSubmit: handleSubmit, label: copy.composerLabel, placeholder: copy.composerPlaceholder, buttonLabel: copy.composerCTA, theme: theme })] }));
}
//# sourceMappingURL=index.js.map