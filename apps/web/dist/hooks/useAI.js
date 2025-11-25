import { useCallback, useEffect, useRef, useState } from 'react';
import { exportToBlob } from '@excalidraw/excalidraw';
import { env } from '../lib/env';
export function useAI(excalidrawApi, options) {
    const [messages, setMessages] = useState([]);
    const [isBusy, setBusy] = useState(false);
    const timerRef = useRef(null);
    const captureScene = useCallback(async () => {
        if (!excalidrawApi)
            return null;
        const blob = await exportToBlob({
            elements: excalidrawApi.getSceneElements(),
            appState: excalidrawApi.getAppState(),
            files: excalidrawApi.getFiles(),
            mimeType: 'image/png'
        });
        return blobToBase64(blob);
    }, [excalidrawApi]);
    const sendPrompt = useCallback(async (prompt) => {
        if (!prompt)
            return;
        setBusy(true);
        const screenshot = await captureScene();
        const payload = {
            boardId: options.boardId,
            imageBase64: screenshot ?? '',
            prompt,
            locale: options.locale,
            mode: options.autoCapture ? 'auto' : 'manual'
        };
        setMessages((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                boardId: options.boardId,
                role: 'user',
                content: prompt,
                createdAt: new Date().toISOString()
            }
        ]);
        try {
            const response = await fetch(`${env.backendUrl}/api/ai/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    boardId: options.boardId,
                    role: 'assistant',
                    content: result.message ?? 'Assistant en cours de préparation…',
                    createdAt: new Date().toISOString()
                }
            ]);
        }
        catch (error) {
            console.error('AI request failed', error);
        }
        finally {
            setBusy(false);
        }
    }, [captureScene, options]);
    useEffect(() => {
        if (!options.autoCapture) {
            if (timerRef.current)
                window.clearInterval(timerRef.current);
            timerRef.current = null;
            return;
        }
        timerRef.current = window.setInterval(() => {
            sendPrompt('Analyse automatique');
        }, 10000);
        return () => {
            if (timerRef.current)
                window.clearInterval(timerRef.current);
        };
    }, [options.autoCapture, sendPrompt]);
    return { messages, sendPrompt, isBusy };
}
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
//# sourceMappingURL=useAI.js.map