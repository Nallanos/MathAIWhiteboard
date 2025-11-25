import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { AISidebar } from './components/AISidebar';
import { CollaborationStatus } from './components/Collaboration/Status';
import { useAI } from './hooks/useAI';
import { useCollab } from './hooks/useCollab';
export default function App() {
    const [autoCapture] = useState(false);
    const [api, setApi] = useState(null);
    const [theme, setTheme] = useState('light');
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
    const handleAppStateChange = useCallback((_elements, appState) => {
        if (appState?.theme) {
            setTheme((prev) => (appState.theme !== prev ? appState.theme : prev));
        }
    }, []);
    return (_jsxs("div", { className: "flex h-full min-h-0 w-full bg-[#f5f5f7] text-slate-900", children: [_jsxs("main", { className: "relative flex-1 min-w-0 min-h-0 bg-white", children: [_jsx("div", { className: "absolute inset-0", children: _jsx("div", { className: "h-full w-full", children: _jsx(Excalidraw, { onChange: handleAppStateChange, excalidrawAPI: (instance) => setApi(instance) }) }) }), _jsx(CollaborationStatus, { boardId: boardId, peerCount: peerCount })] }), _jsx("div", { className: "w-[30%] min-w-[320px] max-w-[420px]", children: _jsx(AISidebar, { messages: messages, onSend: sendPrompt, isBusy: isBusy, theme: theme }) })] }));
}
//# sourceMappingURL=App.js.map