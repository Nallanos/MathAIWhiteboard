import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type { AIAnalyzeResponse, AIMessage, AIPromptPayload, ChatMode, CreateCapturePayload, TutorPayload } from '@mathboard/shared';
import { apiFetch } from '../lib/api';
import { buildCaptureSnapshot } from '../lib/capture';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { useAuth } from '../context/AuthContext';

interface UseAIOptions {
  boardId: string;
  autoCapture: boolean;
  locale: 'fr' | 'en';
  token: string | null;
  getSceneVersion: () => number;
}

export function useAI(
  excalidrawApi: ExcalidrawImperativeAPI | null,
  options: UseAIOptions
) {
  const { setAiCredits } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [tutor, setTutor] = useState<TutorPayload | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastUploadedVersionRef = useRef<number>(-1);
  const lastCaptureIdRef = useRef<string | null>(null);

  // Fetch conversation ID
  useEffect(() => {
    if (!options.boardId || !options.token) return;

    apiFetch(`/api/boards/${options.boardId}/conversation`, { token: options.token })
      .then((res) => res.json())
      .then((data) => {
        if (data.conversation?.id) {
          setConversationId(data.conversation.id);
        }
      })
      .catch((err) => console.error('Failed to get conversation', err));
  }, [options.boardId, options.token]);

  // Reset tutor state when conversation changes
  useEffect(() => {
    setTutor(null);
  }, [conversationId]);

  // Fetch history on mount
  useEffect(() => {
    if (!conversationId || !options.token) return;
    
    apiFetch(`/api/conversations/${conversationId}/messages`, { token: options.token })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages);
        }
      })
      .catch((err) => console.error('Failed to load history', err));
  }, [conversationId, options.token]);

  const MIN_VERSION_DELTA_FOR_CAPTURE = 5; // avoid re-uploading on tiny tweaks

  const uploadCapture = useCallback(async (opts?: { force?: boolean }) => {
    if (!excalidrawApi || !conversationId) return null;
    if (!options.token) {
      console.error('Missing token; cannot upload capture');
      return null;
    }

    const force = Boolean(opts?.force);

    // Optimization: reuse last capture (unless force)
    const currentVersion = options.getSceneVersion();
    const delta = currentVersion - lastUploadedVersionRef.current;
    if (!force) {
      if (currentVersion === lastUploadedVersionRef.current && lastCaptureIdRef.current) {
        // No change since last upload
        return lastCaptureIdRef.current;
      }

      if (delta > 0 && delta < MIN_VERSION_DELTA_FOR_CAPTURE && lastCaptureIdRef.current) {
        // Minor change: reuse last capture to avoid spamming uploads
        return lastCaptureIdRef.current;
      }
    }

    const snapshot = await buildCaptureSnapshot(excalidrawApi);
    const payload: CreateCapturePayload = {
      conversationId,
      boardId: options.boardId,
      scene: snapshot.scene,
      image: snapshot.image
    };

    const response = await apiFetch('/api/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      token: options.token
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
  }, [conversationId, excalidrawApi, options.boardId, options.getSceneVersion, options.token]);

  const resetConversation = useCallback(async () => {
    if (!options.boardId || !options.token) return;

    try {
      const res = await apiFetch(`/api/boards/${options.boardId}/conversation`, {
        method: 'POST',
        token: options.token
      });
      
      if (!res.ok) throw new Error('Failed to reset conversation');
      
      const data = await res.json();
      if (data.conversation?.id) {
        setConversationId(data.conversation.id);
        setMessages([]);
        setTutor(null);
      }
    } catch (err) {
      console.error('Failed to reset conversation', err);
    }
  }, [options.boardId, options.token]);

  const fetchTutorSession = useCallback(async () => {
    if (!conversationId || !options.token) return null;
    const res = await apiFetch(`/api/tutor/conversations/${conversationId}/session`, {
      token: options.token
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.session?.plan && data?.session?.state) {
      setTutor({ plan: data.session.plan, state: data.session.state });
      return data.session;
    }
    return data?.session ?? null;
  }, [conversationId, options.token]);

  const patchTutorState = useCallback(
    async (next: { completedStepIds?: string[]; currentStepId?: string | null; status?: 'active' | 'completed' | 'abandoned' }) => {
      if (!conversationId || !options.token) return null;
      const res = await apiFetch(`/api/tutor/conversations/${conversationId}/session`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
        token: options.token
      });
      if (!res.ok) {
        console.error('Failed to patch tutor state', await res.text());
        return null;
      }
      const data = await res.json();
      if (data?.session?.plan && data?.session?.state) {
        setTutor({ plan: data.session.plan, state: data.session.state });
      } else if (data?.session?.state && tutor?.plan) {
        setTutor({ plan: tutor.plan, state: data.session.state });
      }
      return data?.session ?? null;
    },
    [conversationId, options.token, tutor]
  );

  const sendPrompt = useCallback(
    async (prompt: string, chatMode: ChatMode = 'board', opts?: { model?: string }) => {
      if (!prompt || !conversationId) return;
      setBusy(true);
      let captureId: string | null = null;
      try {
        // Tutor mode is step-by-step: always send a fresh board snapshot.
        captureId = await uploadCapture({ force: chatMode === 'tutor' });
      } catch (error) {
        console.error(error);
      }

      if (!captureId) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            boardId: options.boardId,
            role: 'assistant',
            content:
              "Impossible de capturer le tableau. Réessaie.",
            createdAt: new Date().toISOString()
          }
        ]);
        setBusy(false);
        return;
      }

      const payload: AIPromptPayload = {
        boardId: options.boardId,
        conversationId,
        prompt,
        locale: options.locale,
        mode: options.autoCapture ? 'auto' : 'manual',
        captureId,
        chatMode,
        boardVersion: options.getSceneVersion(),
        provider: 'google',
        model: opts?.model
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
          await apiFetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              role: 'user',
              content: prompt,
              captureId
            }),
            token: options.token
          });
        }
      } catch (err) {
        console.error('Failed to persist user message', err);
      }

      try {
        if (!options.token) {
          throw new Error('Missing token');
        }

        const response = await apiFetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          token: options.token
        });

        if (!response.ok) {
          let errorMessage = 'AI request failed';
          try {
            const maybeJson = await response.json();
            if (typeof maybeJson?.error === 'string') errorMessage = maybeJson.error;
            else if (typeof maybeJson?.message === 'string') errorMessage = maybeJson.message;
            else errorMessage = JSON.stringify(maybeJson);
          } catch {
            try {
              const text = await response.text();
              if (text) errorMessage = text;
            } catch {
              // ignore
            }
          }
          throw new Error(errorMessage);
        }

        let result: AIAnalyzeResponse;
        try {
          result = (await response.json()) as AIAnalyzeResponse;
        } catch {
          throw new Error('AI response was not valid JSON');
        }
        
        const assistantContent = result.message ?? 'Assistant en cours de préparation…';

        if (typeof result.aiCreditsRemaining === 'number') {
          setAiCredits(result.aiCreditsRemaining);
        }

        if (result.tutor) {
          setTutor(result.tutor);
        }
        
        // Persist assistant message (only on success)
        await apiFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            role: 'assistant',
            content: assistantContent
          }),
          token: options.token
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

        // Surface a non-persisted error message to the user.
        const content =
          error instanceof Error
            ? `AI error: ${error.message}`
            : 'AI error: request failed';

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            boardId: options.boardId,
            role: 'assistant',
            content,
            createdAt: new Date().toISOString()
          }
        ]);
      } finally {
        setBusy(false);
      }
    },
    [setAiCredits, uploadCapture, options]
  );

  useEffect(() => {
    // Auto-capture logic removed to prevent polling.
    // Context is now only sent on user interaction (sendPrompt).
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  return { messages, sendPrompt, isBusy, resetConversation, conversationId, tutor, fetchTutorSession, patchTutorState };
}
