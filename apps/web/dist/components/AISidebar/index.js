import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ChatMessage } from './ChatMessage';
import { InputBox } from './InputBox';
export function AISidebar({ messages, onSend, isBusy, autoCapture, onToggleAutoCapture }) {
    const [currentPrompt, setCurrentPrompt] = useState('');
    const handleSubmit = async () => {
        await onSend(currentPrompt);
        setCurrentPrompt('');
    };
    return (_jsxs("aside", { className: "flex h-full flex-col border-l border-slate-800 bg-slate-900 p-4", children: [_jsxs("header", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "AI Copilot" }), _jsxs("label", { className: "flex items-center gap-2 text-xs", children: [_jsx("input", { type: "checkbox", checked: autoCapture, onChange: (e) => onToggleAutoCapture(e.target.checked) }), "Auto 10s"] })] }), _jsxs("div", { className: "flex-1 space-y-3 overflow-y-auto pr-2", children: [messages.map((message) => (_jsx(ChatMessage, { message: message }, message.id))), isBusy && _jsx("p", { className: "text-xs text-slate-400", children: "Analyse en cours\u2026" })] }), _jsx(InputBox, { value: currentPrompt, disabled: isBusy, onChange: setCurrentPrompt, onSubmit: handleSubmit })] }));
}
//# sourceMappingURL=index.js.map