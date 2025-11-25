import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type { AIMessage, AIPromptPayload, CreateCapturePayload } from '@mathboard/shared';
import { env } from '../lib/env';
import { buildCaptureSnapshot } from '../lib/capture';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';

interface UseAIOptions {
  boardId: string;
  autoCapture: boolean;
  locale: 'fr' | 'en';
  token: string | null;
  getSceneVersion: () => number;
  provider?: 'google' | 'openai' | 'anthropic';
  model?: string;
}

export function useAI(
  excalidrawApi: ExcalidrawImperativeAPI | null,
  options: UseAIOptions
) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastUploadedVersionRef = useRef<number>(-1);
  const lastCaptureIdRef = useRef<string | null>(null);

  // Fetch conversation ID
  useEffect(() => {
    if (!options.boardId || !options.token) return;

    fetch(`${env.backendUrl}/api/boards/${options.boardId}/conversation`, {
      headers: { Authorization: `Bearer ${options.token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.conversation?.id) {
          setConversationId(data.conversation.id);
        }
      })
      .catch((err) => console.error('Failed to get conversation', err));
  }, [options.boardId, options.token]);

  // Fetch history on mount
  useEffect(() => {
    if (!conversationId || !options.token) return;
    
    fetch(`${env.backendUrl}/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${options.token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages);
        }
      })
      .catch((err) => console.error('Failed to load history', err));
  }, [conversationId, options.token]);

  const uploadCapture = useCallback(async () => {
    if (!excalidrawApi || !conversationId) return null;
    if (!options.token) {
      console.error('Missing token; cannot upload capture');
      return null;
    }

    // Optimization: If scene hasn't changed since last upload, reuse the capture ID
    const currentVersion = options.getSceneVersion();
    if (
      currentVersion === lastUploadedVersionRef.current &&
      lastCaptureIdRef.current
    ) {
      return lastCaptureIdRef.current;
    }

    const snapshot = await buildCaptureSnapshot(excalidrawApi);
    const payload: CreateCapturePayload = {
      conversationId,
      boardId: options.boardId,
      scene: snapshot.scene,
      image: snapshot.image
    };

    const response = await fetch(`${env.backendUrl}/api/captures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.token}`
      },
      body: JSON.stringify(payload)
    });


    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Capture failed: ${errorText}`);
    }

    const body = await response.json();
    const newCaptureId = (body.captureId as string) ?? null;
    
    if (newCaptureId) {
      lastUploadedVersionRef.current = currentVersion;
      lastCaptureIdRef.current = newCaptureId;
    }
    
    return newCaptureId;
  }, [conversationId, excalidrawApi, options.boardId, options.getSceneVersion]);

  const resetConversation = useCallback(async () => {
    if (!options.boardId || !options.token) return;

    try {
      const res = await fetch(`${env.backendUrl}/api/boards/${options.boardId}/conversation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.token}` }
      });
      
      if (!res.ok) throw new Error('Failed to reset conversation');
      
      const data = await res.json();
      if (data.conversation?.id) {
        setConversationId(data.conversation.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to reset conversation', err);
    }
  }, [options.boardId, options.token]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (!prompt || !conversationId) return;
      setBusy(true);
      let captureId: string | null = null;
      try {
        captureId = await uploadCapture();
      } catch (error) {
        console.error(error);
      }

      const payload: AIPromptPayload = {
        boardId: options.boardId,
        conversationId,
        prompt,
        locale: options.locale,
        mode: options.autoCapture ? 'auto' : 'manual',
        captureId,
        provider: options.provider,
        model: options.model
      };

      // Optimistic update
      const tempId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          boardId: options.boardId,
          role: 'user',
          content: prompt,
          createdAt: new Date().toISOString()
        }
      ]);

      // Persist user message
      try {
        if (options.token) {
          await fetch(`${env.backendUrl}/api/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${options.token}`
            },
            body: JSON.stringify({
              conversationId,
              role: 'user',
              content: prompt,
              captureId
            })
          });
        }
      } catch (err) {
        console.error('Failed to persist user message', err);
      }

      try {
        if (!options.token) {
          throw new Error('Missing token');
        }

        const response = await fetch(`${env.backendUrl}/api/ai/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.token}`
          },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        const assistantContent = result.message ?? 'Assistant en cours de préparation…';
        
        // Persist assistant message
        await fetch(`${env.backendUrl}/api/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.token}`
          },
          body: JSON.stringify({
            conversationId,
            role: 'assistant',
            content: assistantContent
          })
        });

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            boardId: options.boardId,
            role: 'assistant',
            content: assistantContent,
            createdAt: new Date().toISOString()
          }
        ]);
      } catch (error) {
        console.error('AI request failed', error);
      } finally {
        setBusy(false);
      }
    },
    [uploadCapture, options]
  );

  useEffect(() => {
    // Auto-capture logic removed to prevent polling.
    // Context is now only sent on user interaction (sendPrompt).
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  return { messages, sendPrompt, isBusy, resetConversation };
}
