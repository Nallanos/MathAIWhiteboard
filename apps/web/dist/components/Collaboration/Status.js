import { jsxs as _jsxs } from "react/jsx-runtime";
export function CollaborationStatus({ boardId, peerCount }) {
    return (_jsxs("div", { className: "absolute left-4 top-4 flex items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2 text-xs text-white shadow-lg", children: [_jsxs("span", { className: "font-semibold", children: ["Board: ", boardId] }), _jsxs("span", { className: "text-slate-300", children: [peerCount, " en ligne"] })] }));
}
//# sourceMappingURL=Status.js.map