/**
 * Whiteboard Page
 * 
 * Protected page for editing a whiteboard with Excalidraw and AI sidebar.
 * Includes collaboration features and board persistence.
 */

import { useCallback, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from '@tanstack/react-router';
import '@excalidraw/excalidraw/index.css';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import { AISidebar } from '../components/AISidebar';
import { CollaborationStatus } from '../components/Collaboration/Status';
import { useAI } from '../hooks/useAI';
import { useCollab } from '../hooks/useCollab';
import { useBoardPersistence } from '../hooks/useBoardPersistence';
import { useAuth } from '../context/AuthContext';

// Lazy load Excalidraw to avoid SSR issues
const Excalidraw = lazy(() => 
  import('@excalidraw/excalidraw').then(mod => ({ default: mod.Excalidraw }))
);

interface WhiteboardProps {
  boardId: string;
}

export function Whiteboard({ boardId }: WhiteboardProps) {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [autoCapture] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [provider, setProvider] = useState<'google' | 'openai' | 'anthropic'>('google');
  const [model, setModel] = useState<string>('gemini-2.0-flash');
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

  const { messages, sendPrompt, isBusy, resetConversation } = useAI(api, {
    boardId,
    autoCapture,
    locale: 'fr',
    token,
    getSceneVersion,
    provider,
    model
  });

  const { peerCount } = useCollab(
    {
      boardId,
      userId: user?.id || 'anon',
      userName: user?.displayName || 'Anonymous'
    },
    api
  );

  const handleAppStateChange = useCallback(
    (elements: readonly any[], appState: AppState, files: any) => {
      if (appState?.theme) {
        setTheme((prev) => (appState.theme !== prev ? appState.theme : prev));
      }
      sceneVersionRef.current += 1;
      saveBoard(elements, appState, files);
    },
    [saveBoard]
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
                excalidrawAPI={(instance) => setApi(instance)}
              />
            </Suspense>
          </div>
        </div>
        <CollaborationStatus boardId={boardId} peerCount={peerCount} />
        <div className="absolute top-4 left-4 z-10 flex gap-2">
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
              onSend={sendPrompt}
              isBusy={isBusy}
              theme={theme}
              provider={provider}
              model={model}
              onModelChange={(p, m) => {
                setProvider(p);
                setModel(m);
              }}
              onNewChat={resetConversation}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
