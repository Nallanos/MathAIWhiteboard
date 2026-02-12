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
  const [boardTitle, setBoardTitle] = useState<string>('');
  const [isRenamingBoard, setIsRenamingBoard] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState<string>('');
  const sceneVersionRef = useRef(0);
  const getSceneVersion = useCallback(() => sceneVersionRef.current, []);
  
  const BREAKPOINT = 1100; // px; below this we show a closable overlay sidebar
  const MIN_SIDEBAR_WIDTH = 320;
  const MIN_CANVAS_WIDTH = 480;

  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const isCompact = viewportWidth < BREAKPOINT;

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Responsive default: smaller on compact viewports
    if (window.innerWidth < BREAKPOINT) return 0;

    try {
      const stored = window.localStorage.getItem(`sidebarWidth:${boardId}`);
      const parsed = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        const maxSidebarWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(1200, window.innerWidth - MIN_CANVAS_WIDTH)
        );
        return Math.min(Math.max(parsed, MIN_SIDEBAR_WIDTH), maxSidebarWidth);
      }
    } catch {
      // ignore
    }

    return 400;
  });

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < BREAKPOINT) return false;
    try {
      const stored = window.localStorage.getItem(`sidebarOpen:${boardId}`);
      if (stored === '0') return false;
      if (stored === '1') return true;
    } catch {
      // ignore
    }
    return window.innerWidth >= BREAKPOINT;
  });
  const isResizingRef = useRef(false);
  const lastWidthRef = useRef(-1);

  const startResizing = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    isResizingRef.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;

      // If we missed the mouseup (released outside the window, focus lost, etc.),
      // don't stay stuck in resizing mode.
      if (mouseMoveEvent.buttons === 0) {
        isResizingRef.current = false;
        return;
      }

      const maxSidebarWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(1200, window.innerWidth - MIN_CANVAS_WIDTH)
      );

      const rawWidth = window.innerWidth - mouseMoveEvent.clientX;
      const clampedWidth = Math.min(Math.max(rawWidth, MIN_SIDEBAR_WIDTH), maxSidebarWidth);
      setSidebarWidth(clampedWidth);
    },
    []
  );

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      
      // If width hasn't changed, this is likely a fake resize event 
      // (e.g. dispatched by our own nudge useEffect) or a height-only change.
      // We ignore it to avoid resetting the sidebar state.
      if (width === lastWidthRef.current) return;

      const wasCompact = lastWidthRef.current < BREAKPOINT && lastWidthRef.current !== -1;
      const isNowCompact = width < BREAKPOINT;
      
      lastWidthRef.current = width;
      setViewportWidth(width);

      if (isNowCompact) {
        // Only auto-close if we just transitioned to compact mode or it's the first run
        if (!wasCompact) {
          setSidebarOpen(false);
        }
      } else {
        // On large screens, restore last known desktop sidebar state.
        try {
          const storedOpen = window.localStorage.getItem(`sidebarOpen:${boardId}`);
          if (storedOpen === '0') {
            setSidebarOpen(false);
          } else {
            setSidebarOpen(true);
          }

          const storedWidth = window.localStorage.getItem(`sidebarWidth:${boardId}`);
          const parsedWidth = storedWidth ? Number(storedWidth) : NaN;
          if (Number.isFinite(parsedWidth)) {
            const maxSidebarWidth = Math.max(
              MIN_SIDEBAR_WIDTH,
              Math.min(1200, window.innerWidth - MIN_CANVAS_WIDTH)
            );
            setSidebarWidth(Math.min(Math.max(parsedWidth, MIN_SIDEBAR_WIDTH), maxSidebarWidth));
          } else {
            setSidebarWidth((current) => (current === 0 ? 400 : current));
          }
        } catch {
          setSidebarOpen(true);
          setSidebarWidth((current) => (current === 0 ? 400 : current));
        }
      }
    };

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener('blur', stopResizing);
    window.addEventListener("resize", handleResize);
    
    // Reset track width on mount/board change to ensure first run works
    lastWidthRef.current = -1;
    handleResize();

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener('blur', stopResizing);
      window.removeEventListener("resize", handleResize);
    };
  }, [resize, stopResizing, boardId]);

  useEffect(() => {
    if (isCompact) return;
    try {
      window.localStorage.setItem(`sidebarWidth:${boardId}`, String(sidebarWidth));
    } catch {
      // ignore
    }
  }, [boardId, sidebarWidth, isCompact]);

  useEffect(() => {
    if (isCompact) return;
    try {
      window.localStorage.setItem(`sidebarOpen:${boardId}`, sidebarOpen ? '1' : '0');
    } catch {
      // ignore
    }
  }, [boardId, sidebarOpen, isCompact]);

  useEffect(() => {
    // Excalidraw can occasionally miss layout changes caused by flex width updates.
    // Nudge it by dispatching a resize event after sidebar size/state changes.
    if (!api) return;
    const id = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      (api as any)?.refresh?.();
    });
    return () => window.cancelAnimationFrame(id);
  }, [api, sidebarWidth, sidebarOpen, isCompact]);
  
  const { saveBoard } = useBoardPersistence(api, { boardId, token });

  const { messages, sendPrompt, isBusy, resetConversation, conversationId, conversations, activateConversation, tutor, fetchTutorSession, patchTutorState, streamingStage, stopStreaming, isStreaming } = useAI(api, {
    boardId,
    autoCapture,
    locale: 'fr',
    token,
    getSceneVersion,
    enableStreaming: true
  });

  const [chatMode, setChatMode] = useState<ChatMode>('board');
  const [model, setModel] = useState<string>('gemini-3-flash-preview');
  const [premiumAvailable, setPremiumAvailable] = useState<boolean>(false);
  const [thinkingLevel, setThinkingLevel] = useState<string>('auto');

  useEffect(() => {
    refreshMe().catch(() => {});
  }, [refreshMe]);

  useEffect(() => {
    if (!token || !boardId) return;
    apiFetch(`/api/boards/${boardId}`, { token })
      .then((res) => res.json())
      .then((data) => {
        const title = String(data?.board?.title ?? '');
        setBoardTitle(title);
        if (!isRenamingBoard) {
          setBoardTitleDraft(title);
        }
      })
      .catch((e) => console.error('Failed to load board title', e));
  }, [boardId, token, isRenamingBoard]);

  const saveBoardTitle = useCallback(
    async (nextTitle: string) => {
      if (!token) return;
      const trimmed = nextTitle.trim();
      if (!trimmed || trimmed === boardTitle) {
        setIsRenamingBoard(false);
        setBoardTitleDraft(boardTitle);
        return;
      }

      const previous = boardTitle;
      setBoardTitle(trimmed);
      setIsRenamingBoard(false);

      try {
        const res = await apiFetch(`/api/boards/${boardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed }),
          token
        });
        if (!res.ok) {
          throw new Error(`Failed to rename board (${res.status})`);
        }
        const data = await res.json();
        const updated = String(data?.board?.title ?? trimmed);
        setBoardTitle(updated);
        setBoardTitleDraft(updated);
      } catch (e) {
        console.error('Failed to rename board', e);
        setBoardTitle(previous);
        setBoardTitleDraft(previous);
        alert('Failed to rename the board.');
      }
    },
    [token, boardId, boardTitle]
  );

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
      // Gemini 2 Flash deprecated -> migrate to free Gemini 3 Flash.
      setModel('gemini-3-flash-preview');
      window.localStorage.setItem('aiModel', 'gemini-3-flash-preview');
      return;
    }
    if (stored === 'gemini-3-flash' || stored === 'gemini-3-flash-preview') {
      // Migrate legacy id -> documented preview id.
      setModel('gemini-3-flash-preview');
      window.localStorage.setItem('aiModel', 'gemini-3-flash-preview');
      return;
    }
    if (stored === 'gemini-3-pro' || stored === 'gemini-3-pro-preview') {
      setModel('gemini-3-pro');
      window.localStorage.setItem('aiModel', 'gemini-3-pro');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/ai/models', { token })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const available = Boolean(data?.premiumAvailable);
        setPremiumAvailable(available);
        if (!available && model === 'gemini-3-pro') {
          setModel('gemini-3-flash-preview');
          window.localStorage.setItem('aiModel', 'gemini-3-flash-preview');
        }
      })
      .catch(() => {
        setPremiumAvailable(false);
        if (model === 'gemini-3-pro') {
          setModel('gemini-3-flash-preview');
          window.localStorage.setItem('aiModel', 'gemini-3-flash-preview');
        }
      });
  }, [token, model]);

  const handleModelChange = useCallback((next: string) => {
    const value = next === 'gemini-3-pro' ? 'gemini-3-pro' : 'gemini-3-flash-preview';
    if (value === 'gemini-3-pro' && !premiumAvailable) {
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
    navigate({ to: '/app' });
  };

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
        <div className="absolute top-16 left-4 z-10 flex items-center gap-2">
          <button onClick={handleBack} className="bg-white px-3 py-1 rounded shadow text-sm hover:bg-gray-50">
            ← Back
          </button>

          {isRenamingBoard ? (
            <input
              className="bg-white px-3 py-1 rounded shadow text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-[280px]"
              value={boardTitleDraft}
              autoFocus
              onChange={(e) => setBoardTitleDraft(e.target.value)}
              onBlur={() => saveBoardTitle(boardTitleDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveBoardTitle(boardTitleDraft);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsRenamingBoard(false);
                  setBoardTitleDraft(boardTitle);
                }
              }}
              aria-label="Board title"
            />
          ) : (
            <button
              type="button"
              className="bg-white px-3 py-1 rounded shadow text-sm hover:bg-gray-50 max-w-[280px] truncate text-left"
              title="Rename board"
              onClick={() => {
                setIsRenamingBoard(true);
                setBoardTitleDraft(boardTitle || 'Untitled Board');
              }}
            >
              {boardTitle || 'Untitled Board'}
            </button>
          )}
        </div>
      </main>
      {/* Compact (phone/tablet) floating toggle on the right side */}
      {isCompact && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed right-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white shadow-lg rounded-full px-3 py-2 text-base hover:bg-blue-700 active:bg-blue-800 z-50"
          aria-label="Toggle chat sidebar"
        >
          {sidebarOpen ? '✕' : '💬'}
        </button>
      )}

      {sidebarOpen && (
        <>
          {!isCompact && (
            <div
              className="w-1 cursor-col-resize hover:bg-blue-500 bg-gray-200 transition-colors z-20"
              onMouseDown={(e) => startResizing(e)}
            />
          )}

          <div
            style={isCompact ? undefined : { width: sidebarWidth }}
            className={
              isCompact
                ? 'fixed right-0 top-0 h-full w-full bg-white shadow-2xl z-40'
                : 'relative right-0 top-0 h-full flex-shrink-0 z-30 min-w-[320px]'
            }
          >
            <AISidebar
              messages={messages}
              onSend={async (prompt) => {
                const thinking = thinkingLevel === 'auto' 
                  ? { mode: 'auto' }
                  : { mode: 'level', level: thinkingLevel };
                await sendPrompt(prompt, chatMode, { model, thinking });
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
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={setThinkingLevel}
              streamingStage={streamingStage}
              isStreaming={isStreaming}
              onStopStreaming={stopStreaming}
            />
          </div>
        </>
      )}
    </div>
  );
}
