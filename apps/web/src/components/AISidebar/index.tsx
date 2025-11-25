import { useState } from 'react';
import type { AIMessage } from '@mathboard/shared';
import { ChatMessage } from './ChatMessage';
import { InputBox } from './InputBox';
import { SIDEBAR_COPY } from './copy';

interface Props {
  messages: AIMessage[];
  onSend: (prompt: string) => Promise<void> | void;
  isBusy: boolean;
  theme: 'light' | 'dark';
  provider: 'google' | 'openai' | 'anthropic';
  model: string;
  onModelChange: (provider: 'google' | 'openai' | 'anthropic', model: string) => void;
  onNewChat: () => void;
}

export function AISidebar({
  messages,
  onSend,
  isBusy,
  theme,
  provider,
  model,
  onModelChange,
  onNewChat
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
        <select 
          value={`${provider}:${model}`}
          onChange={(e) => {
            const [p, m] = e.target.value.split(':');
            onModelChange(p as any, m);
          }}
          className={`text-xs bg-transparent border rounded px-1 py-0.5 outline-none ${isDark ? 'text-slate-300 border-slate-700' : 'text-slate-600 border-slate-300'}`}
        >
           <optgroup label="Google">
             <option value="google:gemini-2.0-flash">Gemini 2.0 Flash</option>
           </optgroup>
           <optgroup label="OpenAI">
             <option value="openai:gpt-4o-mini">GPT-4o Mini</option>
           </optgroup>
           <optgroup label="Anthropic">
             <option value="anthropic:claude-3-5-haiku-latest">Claude 3.5 Haiku</option>
             <option value="anthropic:claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
           </optgroup>
        </select>
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
        label={copy.composerLabel}
        placeholder={copy.composerPlaceholder}
        buttonLabel={copy.composerCTA}
        theme={theme}
      />
    </aside>
  );
}
