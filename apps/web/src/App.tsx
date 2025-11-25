import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { AISidebar } from './components/AISidebar';
import { CollaborationStatus } from './components/Collaboration/Status';
import { useAI } from './hooks/useAI';
import { useCollab } from './hooks/useCollab';
import { useBoardPersistence } from './hooks/useBoardPersistence';
import { env } from './lib/env';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';

function Whiteboard({ boardId, onBack }: { boardId: string; onBack: () => void }) {
  const { user, token, logout } = useAuth();
  const [autoCapture] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [provider, setProvider] = useState<'google' | 'openai' | 'anthropic'>('google');
  const [model, setModel] = useState<string>('gemini-2.0-flash');
  const sceneVersionRef = useRef(0);
  const getSceneVersion = useCallback(() => sceneVersionRef.current, []);
  
  const [sidebarWidth, setSidebarWidth] = useState(400);
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
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
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

  return (
    <div className="flex h-full min-h-0 w-full bg-[#f5f5f7] text-slate-900">
      <main className="relative flex-1 min-w-0 min-h-0 bg-white">
        <div className="absolute inset-0">
          <div className="h-full w-full">
            <Excalidraw
              onChange={handleAppStateChange}
              excalidrawAPI={(instance) => setApi(instance)}
            />
          </div>
        </div>
        <CollaborationStatus boardId={boardId} peerCount={peerCount} />
        <div className="absolute top-4 left-4 z-10">
           <button onClick={onBack} className="bg-white px-3 py-1 rounded shadow text-sm hover:bg-gray-50">
             ← Back to Dashboard
           </button>
        </div>
      </main>
      <div
        className="w-1 cursor-col-resize hover:bg-blue-500 bg-gray-200 transition-colors z-20"
        onMouseDown={startResizing}
      />
      <div style={{ width: sidebarWidth }} className="min-w-[320px] flex-shrink-0">
        <AISidebar
          messages={messages}
          onSend={sendPrompt}
          isBusy={isBusy}
          theme={theme}
          provider={provider}
          model={model}
          onModelChange={(p, m) => { setProvider(p); setModel(m); }}
          onNewChat={resetConversation}
        />
      </div>
    </div>
  );
}

function Main() {
  const { isAuthenticated } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('boardId');
    if (idFromUrl) {
      setCurrentBoardId(idFromUrl);
    }
  }, []);

  const handleSelectBoard = (id: string) => {
    setCurrentBoardId(id);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('boardId', id);
    window.history.pushState({}, '', newUrl);
  };

  const handleBack = () => {
    setCurrentBoardId(null);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('boardId');
    window.history.pushState({}, '', newUrl);
  };

  if (!isAuthenticated) {
    if (isRegistering) {
      return <Register onLoginClick={() => setIsRegistering(false)} />;
    }
    return <Login onRegisterClick={() => setIsRegistering(true)} />;
  }

  if (currentBoardId) {
    return <Whiteboard boardId={currentBoardId} onBack={handleBack} />;
  }

  return <Dashboard onSelectBoard={handleSelectBoard} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
