import { memo, useMemo, useState } from 'react';
import type { AIMessage, ChatMode, TutorPayload } from '@mathboard/shared';
import { ChatMessage } from './ChatMessage';
import { InputBox } from './InputBox';
import { SIDEBAR_COPY } from './copy';

type MessageFeedProps = {
  messages: AIMessage[];
  isBusy: boolean;
  theme: 'light' | 'dark';
  assistantLabel: string;
  userLabel: string;
  emptyState: string;
  busyState: string;
};

const MessageFeed = memo(function MessageFeed({
  messages,
  isBusy,
  theme,
  assistantLabel,
  userLabel,
  emptyState,
  busyState
}: MessageFeedProps) {
  const isDark = theme === 'dark';

  const feedClasses = `flex-1 space-y-3 overflow-y-auto rounded-2xl border p-3 shadow-inner pr-2 ${
    isDark ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-200 bg-white/90'
  }`;

  const emptyClasses = `rounded-xl border border-dashed p-4 text-center text-sm ${
    isDark
      ? 'border-slate-700 bg-slate-900/40 text-slate-400'
      : 'border-slate-200 bg-slate-50 text-slate-500'
  }`;

  const busyTextClasses = `text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`;

  return (
    <div className={feedClasses}>
      {!messages.length && !isBusy && <div className={emptyClasses}>{emptyState}</div>}

      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          assistantLabel={assistantLabel}
          userLabel={userLabel}
          theme={theme}
        />
      ))}

      {isBusy && <p className={busyTextClasses}>{busyState}</p>}
    </div>
  );
}, (prev, next) => {
  return (
    prev.messages === next.messages &&
    prev.isBusy === next.isBusy &&
    prev.theme === next.theme &&
    prev.assistantLabel === next.assistantLabel &&
    prev.userLabel === next.userLabel &&
    prev.emptyState === next.emptyState &&
    prev.busyState === next.busyState
  );
});

interface Props {
  messages: AIMessage[];
  onSend: (prompt: string) => Promise<void> | void;
  isBusy: boolean;
  theme: 'light' | 'dark';
  onNewChat: () => void;
  conversations?: Array<{ id: string; status: string; createdAt: string }>;
  activeConversationId?: string | null;
  onConversationChange?: (conversationId: string) => void;
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
  conversations = [],
  activeConversationId = null,
  onConversationChange,
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

  const selectClass = `h-8 max-w-[160px] rounded-lg border px-2 text-xs font-semibold focus:outline-none ${
    isDark
      ? 'border-slate-700 bg-slate-950/40 text-slate-200 focus:border-slate-500'
      : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-slate-400'
  }`;

  const conversationDateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const formatConversationLabel = (c: { createdAt: string; status: string }, index: number) => {
    const dt = new Date(c.createdAt);
    const when = Number.isFinite(dt.getTime())
      ? conversationDateFormatter.format(dt)
      : `Chat ${index + 1}`;
    return c.status === 'active' ? `${when} (actif)` : when;
  };

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

          {conversations.length > 1 && (
            <select
              className={selectClass}
              value={activeConversationId ?? conversations[0]?.id}
              onChange={(e) => onConversationChange?.(e.target.value)}
              disabled={isBusy}
              aria-label="Historique"
              title="Historique"
            >
              {conversations.map((c, idx) => (
                <option key={c.id} value={c.id}>
                  {formatConversationLabel(c, idx)}
                </option>
              ))}
            </select>
          )}

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
      <MessageFeed
        messages={messages}
        isBusy={isBusy}
        theme={theme}
        assistantLabel={copy.assistantLabel}
        userLabel={copy.userLabel}
        emptyState={copy.emptyState}
        busyState={copy.busyState}
      />

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
