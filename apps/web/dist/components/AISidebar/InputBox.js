import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function InputBox({ value, disabled, onChange, onSubmit }) {
    return (_jsxs("div", { className: "mt-3 flex flex-col gap-2", children: [_jsx("textarea", { className: "h-24 rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-white", placeholder: "Pose une question au copilote", value: value, disabled: disabled, onChange: (event) => onChange(event.target.value) }), _jsx("button", { type: "button", className: "rounded-md bg-primary/90 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50", onClick: () => onSubmit(), disabled: disabled || !value.trim(), children: "Envoyer" })] }));
}
//# sourceMappingURL=InputBox.js.map