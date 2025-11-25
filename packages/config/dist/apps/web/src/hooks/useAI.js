import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { env } from '../lib/env';
import { buildCaptureSnapshot } from '../lib/capture';
export function useAI(excalidrawApi, options) {
    const [messages, setMessages] = useState([]);
    const [isBusy, setBusy] = useState(false);
    const timerRef = useRef(null);
    const conversationId = useMemo(() => crypto.randomUUID(), [options.boardId]);
    const uploadCapture = useCallback(async () => {
        if (!excalidrawApi)
            return null;
        if (!env.platformApiKey) {
            console.error('Missing VITE_PLATFORM_API_KEY; cannot upload capture');
            return null;
        }
        const snapshot = await buildCaptureSnapshot(excalidrawApi);
        const payload = {
            conversationId,
            boardId: options.boardId,
            scene: snapshot.scene,
            image: snapshot.image
        };
        const response = await fetch(`${env.backendUrl}/api/captures`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.platformApiKey}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Capture failed: ${errorText}`);
        }
        const body = await response.json();
        return body.captureId ?? null;
    }, [conversationId, excalidrawApi, options.boardId]);
    const sendPrompt = useCallback(async (prompt) => {
        if (!prompt)
            return;
        setBusy(true);
        let captureId = null;
        try {
            captureId = await uploadCapture();
        }
        catch (error) {
            console.error(error);
        }
        const payload = {
            boardId: options.boardId,
            prompt,
            locale: options.locale,
            mode: options.autoCapture ? 'auto' : 'manual',
            captureId
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
            if (!env.platformApiKey) {
                throw new Error('Missing platform API key');
            }
            const response = await fetch(`${env.backendUrl}/api/ai/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.platformApiKey}`
                },
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
    }, [uploadCapture, options]);
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
//# sourceMappingURL=useAI.js.map