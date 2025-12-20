import { useState } from 'react';
import type { AIMessage, ChatMode, TutorPayload } from '@mathboard/shared';
import { ChatMessage } from './ChatMessage';
import { InputBox } from './InputBox';
import { SIDEBAR_COPY } from './copy';

interface Props {
  messages: AIMessage[];
  onSend: (prompt: string) => Promise<void> | void;
  isBusy: boolean;
  theme: 'light' | 'dark';
  onNewChat: () => void;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  model: string;
  onModelChange: (model: string) => void;
  premiumAvailable: boolean;
  aiCredits: number | null;
  tutor?: TutorPayload | null;
  onTutorStepClick?: (stepId: string) => void;
  onClose?: () => void;
}

export function AISidebar({
  messages,
  onSend,
  isBusy,
  theme,
  onNewChat,
  chatMode,
  onChatModeChange,
  model,
  onModelChange,
  premiumAvailable,
  aiCredits,
  tutor,
  onTutorStepClick,
  onClose
}: Props) {
  const [currentPrompt, setCurrentPrompt] = useState('');
  const copy = SIDEBAR_COPY;
  const isDark = theme === 'dark';

  const containerClasses = `flex h-full flex-col border-l p-5 ${
    isDark
      ? 'border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100'
      : 'border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900'
  }`;

  const headerClasses = `mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 shadow-sm ${
    isDark
      ? 'border-slate-700 bg-slate-900/60 text-slate-100'
      : 'border-slate-200 bg-white/80 text-slate-900'
  }`;

  const feedClasses = `flex-1 space-y-3 overflow-y-auto rounded-2xl border p-3 shadow-inner pr-2 ${
    isDark ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-200 bg-white/90'
  }`;

  const emptyClasses = `rounded-xl border border-dashed p-4 text-center text-sm ${
    isDark
      ? 'border-slate-700 bg-slate-900/40 text-slate-400'
      : 'border-slate-200 bg-slate-50 text-slate-500'
  }`;

  const busyTextClasses = `text-xs font-medium ${
    isDark ? 'text-slate-400' : 'text-slate-500'
  }`;

  const handleSubmit = async () => {
    if (!currentPrompt.trim()) {
      return;
    }
    await onSend(currentPrompt);
    setCurrentPrompt('');
  };

  return (
    <aside className={containerClasses}>
      <div className={headerClasses}>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors md:hidden ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {copy.appName}
          </p>
          <button
            onClick={onNewChat}
            className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>
      <div className={feedClasses}>
        {!messages.length && !isBusy && (
          <div className={emptyClasses}>{copy.emptyState}</div>
        )}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            assistantLabel={copy.assistantLabel}
            userLabel={copy.userLabel}
            theme={theme}
          />
        ))}
        {isBusy && (
          <p className={busyTextClasses}>{copy.busyState}</p>
        )}
      </div>

      <InputBox
        value={currentPrompt}
        disabled={isBusy}
        onChange={setCurrentPrompt}
        onSubmit={handleSubmit}
        placeholder={copy.composerPlaceholder}
        theme={theme}
        chatMode={chatMode}
        onChatModeChange={onChatModeChange}
        model={model}
        onModelChange={onModelChange}
        premiumAvailable={premiumAvailable}
        aiCredits={aiCredits}
        tutor={tutor}
        onTutorStepClick={onTutorStepClick}
      />
    </aside>
  );
}
