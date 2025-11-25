import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { AISidebar } from './components/AISidebar';
import { CollaborationStatus } from './components/Collaboration/Status';
import { useAI } from './hooks/useAI';
import { useCollab } from './hooks/useCollab';
export default function App() {
    const [autoCapture, setAutoCapture] = useState(false);
    const [api, setApi] = useState(null);
    const boardId = 'local-board';
    const user = useMemo(() => ({ id: 'local-user', name: 'Moi' }), []);
    const { messages, sendPrompt, isBusy } = useAI(api, {
        boardId,
        autoCapture,
        locale: 'fr'
    });
    const { peerCount } = useCollab({
        boardId,
        userId: user.id,
        userName: user.name
    }, api);
    return (_jsxs("div", { className: "flex h-screen w-screen bg-slate-950 text-white", children: [_jsxs("main", { className: "relative flex-1", children: [_jsx(Excalidraw, { excalidrawAPI: (instance) => setApi(instance) }), _jsx(CollaborationStatus, { boardId: boardId, peerCount: peerCount })] }), _jsx("div", { className: "w-[30%] min-w-[320px] max-w-[420px] border-l border-slate-800", children: _jsx(AISidebar, { messages: messages, onSend: sendPrompt, isBusy: isBusy, autoCapture: autoCapture, onToggleAutoCapture: setAutoCapture }) })] }));
}
//# sourceMappingURL=App.js.map