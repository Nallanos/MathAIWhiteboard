import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ChatMessage({ message }) {
    const isAssistant = message.role === 'assistant';
    return (_jsxs("div", { className: `rounded-md p-2 text-sm ${isAssistant ? 'bg-slate-800' : 'bg-slate-950'}`, children: [_jsx("p", { className: "mb-1 text-[10px] uppercase tracking-wide text-slate-500", children: isAssistant ? 'Copilote' : 'Toi' }), _jsx("p", { className: "whitespace-pre-line text-slate-100", children: message.content })] }));
}
//# sourceMappingURL=ChatMessage.js.map