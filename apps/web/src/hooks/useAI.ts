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
  enableStreaming?: boolean;
}

export function useAI(
  excalidrawApi: ExcalidrawImperativeAPI | null,
  options: UseAIOptions
) {
  const { setAiCredits } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [tutor, setTutor] = useState<TutorPayload | null>(null);
  const [streamingStage, setStreamingStage] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastUploadedVersionRef = useRef<number>(-1);
  const lastCaptureIdRef = useRef<string | null>(null);

  const MAX_MESSAGES_IN_MEMORY = 200;

  const capMessages = useCallback((next: AIMessage[]) => {
    if (next.length <= MAX_MESSAGES_IN_MEMORY) return next;
    return next.slice(next.length - MAX_MESSAGES_IN_MEMORY);
  }, []);

  const reloadConversations = useCallback(async () => {
    if (!options.boardId || !options.token) return;
    try {
      const res = await apiFetch(`/api/boards/${options.boardId}/conversations`, { token: options.token });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.conversations)) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  }, [options.boardId, options.token]);

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

  // Fetch conversation list (history)
  useEffect(() => {
    reloadConversations();
  }, [reloadConversations]);

  // Reset tutor state when conversation changes
  useEffect(() => {
    setTutor(null);
  }, [conversationId]);

  // Fetch history on mount
  useEffect(() => {
    if (!conversationId || !options.token) return;
    
    apiFetch(`/api/conversations/${conversationId}/messages?limit=${MAX_MESSAGES_IN_MEMORY}`, { token: options.token })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(capMessages(data.messages));
        }
      })
      .catch((err) => console.error('Failed to load history', err));
  }, [conversationId, options.token, capMessages]);

  const activateConversation = useCallback(async (nextConversationId: string) => {
    if (!options.boardId || !options.token) return;
    if (!nextConversationId) return;

    try {
      setMessages([]);
      setTutor(null);
      const res = await apiFetch(`/api/boards/${options.boardId}/conversations/${nextConversationId}/activate`, {
        method: 'POST',
        token: options.token
      });
      if (!res.ok) throw new Error('Failed to activate conversation');
      const data = await res.json();
      if (data.conversation?.id) {
        setConversationId(data.conversation.id);
      } else {
        setConversationId(nextConversationId);
      }
      await reloadConversations();
    } catch (err) {
      console.error('Failed to activate conversation', err);
    }
  }, [options.boardId, options.token, reloadConversations]);

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
      let details = '';
      try {
        const json = await response.json();
        details = typeof json?.error === 'string' ? json.error : JSON.stringify(json);
      } catch {
        try {
          details = await response.text();
        } catch {
          details = '';
        }
      }
      const prefix = response.status === 413 ? 'Capture too large' : 'Capture failed';
      throw new Error(details ? `${prefix}: ${details}` : prefix);
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
        await reloadConversations();
      }
    } catch (err) {
      console.error('Failed to reset conversation', err);
    }
  }, [options.boardId, options.token, reloadConversations]);

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

  const parseSSE = useCallback((data: string): any | null => {
    const debugSSE = typeof window !== 'undefined' && window.localStorage.getItem('debugSSE') === '1';
    try {
      const normalized = data.replace(/\r\n/g, '\n');
      const lines = normalized
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((line) => line.startsWith('data:'));
      if (lines.length === 0) {
        if (debugSSE) console.log('[parseSSE] No data: lines found in:', data.slice(0, 200));
        return null;
      }
      const lastLine = lines[lines.length - 1];
      const json = lastLine.replace(/^data:\s*/, '');
      const parsed = JSON.parse(json);
      if (debugSSE) {
        console.log('[parseSSE] Parsed event:', parsed.type, parsed.type === 'delta' ? `(${parsed.text?.length || 0} chars)` : '');
      }
      return parsed;
    } catch (err) {
      if (debugSSE) console.warn('[parseSSE] Failed to parse:', data.slice(0, 200), err);
      return null;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setBusy(false);
      setStreamingStage(null);
    }
  }, [abortController]);

  const sendPrompt = useCallback(
    async (prompt: string, chatMode: ChatMode = 'board', opts?: { model?: string; thinking?: any }) => {
      if (!prompt || !conversationId) return;
      setBusy(true);
      setStreamingStage(null);
      
      let captureId: string | null = null;
      let captureError: string | null = null;
      
      try {
        captureId = await uploadCapture({ force: chatMode === 'tutor' });
      } catch (error) {
        console.error(error);
        captureError = error instanceof Error ? error.message : 'Capture failed';
      }

      if (!captureId) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            boardId: options.boardId,
            role: 'assistant',
            content:
              captureError ? `Cannot capture the board. (${captureError})` : "Cannot capture the board. Try again.",
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
        model: opts?.model,
        thinking: opts?.thinking
      };

      const tempId = crypto.randomUUID();
      setMessages((prev) => [
        ...capMessages(prev),
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

      const useStreaming = options.enableStreaming && chatMode === 'board';
      
      if (useStreaming) {
        // Streaming mode
        const controller = new AbortController();
        setAbortController(controller);
        
        const draftId = crypto.randomUUID();
        let accumulatedText = '';
        
        setMessages((prev) => [
          ...capMessages(prev),
          {
            id: draftId,
            boardId: options.boardId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString()
          }
        ]);

        try {
          if (!options.token) {
            throw new Error('Missing token');
          }

          const response = await apiFetch('/api/ai/analyze/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            token: options.token,
            signal: controller.signal
          });

          if (!response.ok) {
            let errorMessage = 'AI streaming failed';
            try {
              const maybeJson = await response.json();
              if (typeof maybeJson?.error === 'string') errorMessage = maybeJson.error;
            } catch {}
            throw new Error(errorMessage);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Stream not available, falling back to non-streaming');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const debugSSE = typeof window !== 'undefined' && window.localStorage.getItem('debugSSE') === '1';
            if (debugSSE) console.log('[Stream] Raw buffer chunk:', buffer.slice(0, 300));
            const lines = buffer.split(/\r?\n\r?\n/);
            buffer = lines.pop() || '';
            if (debugSSE) console.log('[Stream] Split into', lines.length, 'events, remaining buffer:', buffer.length);

            for (const line of lines) {
              if (!line.trim()) continue;
              
              const event = parseSSE(line);
              if (!event) continue;

              if (event.type === 'status') {
                setStreamingStage(event.message || event.stage);
              } else if (event.type === 'delta') {
                accumulatedText += event.text;
                setMessages((prev) => 
                  prev.map(m => m.id === draftId ? { ...m, content: accumulatedText } : m)
                );
              } else if (event.type === 'replace') {
                accumulatedText = String(event.text || '');
                setMessages((prev) => 
                  prev.map(m => m.id === draftId ? { ...m, content: accumulatedText } : m)
                );
              } else if (event.type === 'credits') {
                if (typeof event.remaining === 'number') {
                  setAiCredits(event.remaining);
                }
              } else if (event.type === 'error') {
                throw new Error(event.error);
              } else if (event.type === 'done') {
                setStreamingStage(null);
              }
            }
          }

          // Flush any trailing buffered event (in case the stream ended without a final separator).
          const trailing = parseSSE(buffer);
          if (trailing?.type === 'replace') {
            accumulatedText = String(trailing.text || '');
            setMessages((prev) => prev.map(m => m.id === draftId ? { ...m, content: accumulatedText } : m));
          } else if (trailing?.type === 'delta') {
            accumulatedText += trailing.text;
            setMessages((prev) => prev.map(m => m.id === draftId ? { ...m, content: accumulatedText } : m));
          }

          // Persist final message
          if (accumulatedText && options.token) {
            await apiFetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId,
                role: 'assistant',
                content: accumulatedText
              }),
              token: options.token
            });
          }

        } catch (error) {
          if (controller.signal.aborted) {
            setMessages((prev) => 
              prev.map(m => m.id === draftId ? { ...m, content: accumulatedText + '\n\n_[Interrupted]_' } : m)
            );
          } else {
            console.error('AI streaming failed', error);
            const content = error instanceof Error ? `AI error: ${error.message}` : 'AI error: streaming failed';
            setMessages((prev) => 
              prev.map(m => m.id === draftId ? { ...m, content } : m)
            );
          }
        } finally {
          setAbortController(null);
          setBusy(false);
          setStreamingStage(null);
        }
      } else {
        // Non-streaming mode (original logic)
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
              } catch {}
            }
            throw new Error(errorMessage);
          }

          let result: AIAnalyzeResponse;
          try {
            result = (await response.json()) as AIAnalyzeResponse;
          } catch {
            throw new Error('AI response was not valid JSON');
          }
          
          const assistantContent = result.message ?? 'Assistant in preparation…';

          if (typeof result.aiCreditsRemaining === 'number') {
            setAiCredits(result.aiCreditsRemaining);
          }

          if (result.tutor) {
            setTutor(result.tutor);
          }
          
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
            ...capMessages(prev),
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

          const content =
            error instanceof Error
              ? `AI error: ${error.message}`
              : 'AI error: request failed';

          setMessages((prev) => [
            ...capMessages(prev),
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
      }
    },
    [conversationId, uploadCapture, options, capMessages, setAiCredits, parseSSE]
  );

  useEffect(() => {
    // Auto-capture logic removed to prevent polling.
    // Context is now only sent on user interaction (sendPrompt).
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  return { 
    messages, 
    sendPrompt, 
    isBusy, 
    resetConversation, 
    conversationId, 
    conversations, 
    activateConversation, 
    tutor, 
    fetchTutorSession, 
    patchTutorState,
    streamingStage,
    stopStreaming,
    isStreaming: abortController !== null
  };
}