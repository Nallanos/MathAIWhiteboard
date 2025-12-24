/**
 * Whiteboard Page
 * 
 * Protected page for editing a whiteboard with Excalidraw and AI sidebar.
 * Includes collaboration features and board persistence.
 */

import { useCallback, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from '@tanstack/react-router';
import '@excalidraw/excalidraw/index.css';
import { sceneCoordsToViewportCoords } from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import { AISidebar } from '../components/AISidebar';
import type { ChatMode } from '@mathboard/shared';
import { CollaborationStatus } from '../components/Collaboration/Status';
import { useAI } from '../hooks/useAI';
import { useCollab } from '../hooks/useCollab';
import { useBoardPersistence } from '../hooks/useBoardPersistence';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { BoardSnapshot } from '@mathboard/shared';

// Lazy load Excalidraw to avoid SSR issues
const Excalidraw = lazy(() => 
  import('@excalidraw/excalidraw').then(mod => ({ default: mod.Excalidraw }))
);

interface WhiteboardProps {
  boardId: string;
}

export function Whiteboard({ boardId }: WhiteboardProps) {
  const navigate = useNavigate();
  const { user, token, refreshMe } = useAuth();
  const [autoCapture] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const sceneVersionRef = useRef(0);
  const getSceneVersion = useCallback(() => sceneVersionRef.current, []);
  
  const BREAKPOINT = 1100; // px; below this we show a closable overlay sidebar
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Responsive default: smaller on compact viewports
    return window.innerWidth < BREAKPOINT ? 0 : 400;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= BREAKPOINT);
  const isResizingRef = useRef(false);

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizingRef.current) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX;
        if (newWidth > 300 && newWidth < 1200) {
            setSidebarWidth(newWidth);
        }
      }
    },
    []
  );

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setViewportWidth(width);

      if (width < BREAKPOINT) {
        // On small screens, close sidebar by default to maximize canvas
        setSidebarOpen(false);
      } else {
        // On large screens, keep sidebar visible
        setSidebarOpen(true);
        setSidebarWidth((current) => (current === 0 ? 400 : current));
      }
    };

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("resize", handleResize);
    };
  }, [resize, stopResizing]);
  
  const { saveBoard } = useBoardPersistence(api, { boardId, token });

  const { messages, sendPrompt, isBusy, resetConversation, conversationId, conversations, activateConversation, tutor, fetchTutorSession, patchTutorState } = useAI(api, {
    boardId,
    autoCapture,
    locale: 'fr',
    token,
    getSceneVersion
  });

  const [chatMode, setChatMode] = useState<ChatMode>('board');
  const [model, setModel] = useState<string>('gemini-2.0-flash');
  const [premiumAvailable, setPremiumAvailable] = useState<boolean>(false);

  useEffect(() => {
    refreshMe().catch(() => {});
  }, [refreshMe]);

  useEffect(() => {
    if (!conversationId) {
      setChatMode('board');
      return;
    }

    const key = `chatMode:${conversationId}`;
    const stored = window.localStorage.getItem(key);
    if (stored === 'board' || stored === 'tutor') {
      setChatMode(stored);
      return;
    }

    // Migration: old clients may have stored 'quick'
    setChatMode('board');
    window.localStorage.setItem(key, 'board');
  }, [conversationId]);

  useEffect(() => {
    const stored = window.localStorage.getItem('aiModel');
    if (stored === 'gemini-2.0-flash') {
      setModel(stored);
      return;
    }
    if (stored === 'gemini-3-flash' || stored === 'gemini-3-flash-preview') {
      // Migrate legacy id -> documented preview id.
      setModel('gemini-3-flash-preview');
      window.localStorage.setItem('aiModel', 'gemini-3-flash-preview');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/ai/models', { token })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const available = Boolean(data?.premiumAvailable);
        setPremiumAvailable(available);
        if (!available && model === 'gemini-3-flash-preview') {
          setModel('gemini-2.0-flash');
          window.localStorage.setItem('aiModel', 'gemini-2.0-flash');
        }
      })
      .catch(() => {
        setPremiumAvailable(false);
        if (model === 'gemini-3-flash-preview') {
          setModel('gemini-2.0-flash');
          window.localStorage.setItem('aiModel', 'gemini-2.0-flash');
        }
      });
  }, [token, model]);

  const handleModelChange = useCallback((next: string) => {
    const value = next === 'gemini-3-flash-preview' ? 'gemini-3-flash-preview' : 'gemini-2.0-flash';
    if (value === 'gemini-3-flash-preview' && !premiumAvailable) {
      return;
    }
    setModel(value);
    window.localStorage.setItem('aiModel', value);
  }, [premiumAvailable]);

  const handleChatModeChange = useCallback(
    (mode: ChatMode) => {
      setChatMode(mode);
      if (conversationId) {
        window.localStorage.setItem(`chatMode:${conversationId}`, mode);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (chatMode !== 'tutor') return;
    if (!conversationId) return;
    // Load persisted tutor session (if any) when switching to tutor mode
    fetchTutorSession().catch((e) => console.error('Failed to fetch tutor session', e));
  }, [chatMode, conversationId, fetchTutorSession]);

  const handleTutorStepClick = useCallback(
    async (stepId: string) => {
      if (!tutor) return;

      const completedSet = new Set(tutor.state.completedStepIds);
      if (completedSet.has(stepId)) return;

      // First click selects the step. Second click (when it's already current) completes it.
      if (tutor.state.currentStepId !== stepId) {
        await patchTutorState({ currentStepId: stepId, status: 'active' });
        return;
      }

      completedSet.add(stepId);
      const completedStepIds = Array.from(completedSet);
      const nextCurrent = tutor.plan.steps.find((s) => !completedSet.has(s.id))?.id ?? null;
      const status = nextCurrent ? 'active' : 'completed';

      await patchTutorState({ completedStepIds, currentStepId: nextCurrent, status });
    },
    [tutor, patchTutorState]
  );

  const { peerCount, broadcastSnapshot, shouldBroadcast, remoteCursors, broadcastCursor } = useCollab(
    {
      boardId,
      userId: user?.id || 'anon',
      userName: user?.displayName || 'Anonymous'
    },
    api
  );

  const cursorRafRef = useRef<number | null>(null);
  const lastCursorSentAtRef = useRef(0);

  const broadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<BoardSnapshot | null>(null);
  const lastBroadcastDigestRef = useRef<string | null>(null);

  const computeSceneDigest = useCallback((elements: readonly any[], files: any) => {
    const sumVersions = elements.reduce((acc, el) => acc + (typeof el?.version === 'number' ? el.version : 0), 0);
    const filesCount = files && typeof files === 'object' ? Object.keys(files).length : 0;
    return `${elements.length}:${sumVersions}:${filesCount}`;
  }, []);

  const handleAppStateChange = useCallback(
    (elements: readonly any[], appState: AppState, files: any) => {
      if (appState?.theme) {
        setTheme((prev) => (appState.theme !== prev ? appState.theme : prev));
      }
      sceneVersionRef.current += 1;
      saveBoard(elements, appState, files);

      if (!shouldBroadcast()) return;

      // Avoid broadcasting when only the local camera/tool state changes (pan/zoom, selections, etc.).
      // This prevents middle-click panning from moving everyone else's viewport.
      const digest = computeSceneDigest(elements, files);
      if (lastBroadcastDigestRef.current === digest) {
        return;
      }
      lastBroadcastDigestRef.current = digest;

      // Remove transient appState bits to reduce noise.
      const { collaborators, ...rest } = appState as any;
      // Never sync camera-related state across users.
      const {
        scrollX,
        scrollY,
        zoom,
        offsetLeft,
        offsetTop,
        width,
        height,
        ...cleanAppState
      } = rest;
      pendingSnapshotRef.current = {
        id: boardId,
        elements: elements as any,
        // Keep appState minimal to avoid syncing per-user UI/tooling.
        appState: {
          viewBackgroundColor: cleanAppState?.viewBackgroundColor,
        },
        files,
        capturedAt: new Date().toISOString(),
      };

      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
      }
      broadcastTimeoutRef.current = setTimeout(() => {
        if (!pendingSnapshotRef.current) return;
        broadcastSnapshot(pendingSnapshotRef.current);
        pendingSnapshotRef.current = null;
      }, 120);
    },
    [saveBoard, broadcastSnapshot, shouldBroadcast, boardId, computeSceneDigest]
  );

  const handleBack = () => {
    navigate({ to: '/' });
  };

  const isCompact = viewportWidth < BREAKPOINT;

  return (
    <div className="flex h-screen max-h-screen overflow-hidden w-full bg-[#f5f5f7] text-slate-900">
      <main className="relative flex-1 min-w-0 h-full overflow-hidden bg-white">
        <div className="absolute inset-0">
          <div className="h-full w-full">
            <Suspense fallback={<div className="flex h-full items-center justify-center">Loading editor...</div>}>
              <Excalidraw
                onChange={handleAppStateChange}
                onPointerUpdate={(payload: any) => {
                  const pointer = payload?.pointer;
                  if (!pointer) return;
                  const x = Number(pointer.x);
                  const y = Number(pointer.y);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

                  const now = performance.now();
                  // Throttle to keep it light.
                  if (now - lastCursorSentAtRef.current < 40) return;

                  // Send at most one per animation frame.
                  if (cursorRafRef.current) return;
                  cursorRafRef.current = window.requestAnimationFrame(() => {
                    cursorRafRef.current = null;
                    lastCursorSentAtRef.current = performance.now();
                    broadcastCursor({ x, y });
                  });
                }}
                excalidrawAPI={(instance) => setApi(instance)}
              />
            </Suspense>
          </div>
        </div>

        {api && (
          <div className="pointer-events-none fixed inset-0 z-30">
            {Object.values(remoteCursors)
              .filter((c) => c.userId !== (user?.id || 'anon'))
              .map((c) => {
                const appState = api.getAppState() as any;
                const vp = sceneCoordsToViewportCoords(
                  { sceneX: c.position.x, sceneY: c.position.y },
                  appState
                );

                const offsetLeft = Number(appState?.offsetLeft ?? 0);
                const offsetTop = Number(appState?.offsetTop ?? 0);
                const scrollX = Number(appState?.scrollX ?? 0);
                const scrollY = Number(appState?.scrollY ?? 0);
                const zoom = Number(appState?.zoom?.value ?? 1);

                // Excalidraw helpers have historically differed on whether the returned
                // viewport coords include appState.offsetLeft/Top.
                // We detect which one we got by comparing against the expected mapping.
                const approxWithoutOffsetX = (c.position.x + scrollX) * zoom;
                const approxWithoutOffsetY = (c.position.y + scrollY) * zoom;
                const approxWithOffsetX = approxWithoutOffsetX + offsetLeft;
                const approxWithOffsetY = approxWithoutOffsetY + offsetTop;

                const vpX = Number(vp.x);
                const vpY = Number(vp.y);
                if (!Number.isFinite(vpX) || !Number.isFinite(vpY)) return null;

                // If vp already matches the "with offset" form, use it as-is.
                // If it matches the "without offset" form, add offset.
                const x =
                  Math.abs(vpX - approxWithOffsetX) < 2
                    ? vpX
                    : Math.abs(vpX - approxWithoutOffsetX) < 2
                      ? vpX + offsetLeft
                      : vpX;
                const y =
                  Math.abs(vpY - approxWithOffsetY) < 2
                    ? vpY
                    : Math.abs(vpY - approxWithoutOffsetY) < 2
                      ? vpY + offsetTop
                      : vpY;

                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

                return (
                  <div
                    key={c.userId}
                    className="absolute"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                      <div className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-white">
                        {c.userName || c.userId}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        <CollaborationStatus boardId={boardId} peerCount={peerCount} />
        <div className="absolute top-16 left-4 z-10 flex gap-2">
           <button onClick={handleBack} className="bg-white px-3 py-1 rounded shadow text-sm hover:bg-gray-50">
             ← Back
           </button>
        </div>
      </main>
      {/* Mobile floating toggle on the right side */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed right-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white shadow-lg rounded-full px-3 py-2 text-base hover:bg-blue-700 active:bg-blue-800 z-40"
        aria-label="Toggle chat sidebar"
      >
        {sidebarOpen ? '✕' : '💬'}
      </button>
      {/* Sidebar toggle for desktop */}
      {sidebarOpen && (
        <>
          {!isCompact && (
            <div
              className="hidden md:block w-1 cursor-col-resize hover:bg-blue-500 bg-gray-200 transition-colors z-20"
              onMouseDown={startResizing}
            />
          )}
          <div
            style={{ width: isCompact ? '100%' : sidebarWidth }}
            className={`right-0 top-0 h-full flex-shrink-0 z-30 md:z-auto ${
              isCompact ? 'absolute md:relative md:min-w-[320px] bg-white shadow-2xl' : 'md:relative md:min-w-[320px]'
            }`}
          >
            <AISidebar
              messages={messages}
              onSend={async (prompt) => {
                await sendPrompt(prompt, chatMode, { model });
              }}
              isBusy={isBusy}
              theme={theme}
              onNewChat={resetConversation}
              conversations={conversations}
              activeConversationId={conversationId}
              onConversationChange={activateConversation}
              chatMode={chatMode}
              onChatModeChange={handleChatModeChange}
              model={model}
              onModelChange={handleModelChange}
              premiumAvailable={premiumAvailable}
              aiCredits={user?.aiCredits ?? null}
              tutor={tutor}
              onTutorStepClick={handleTutorStepClick}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
