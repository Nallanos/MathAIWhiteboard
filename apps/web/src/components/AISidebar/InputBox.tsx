import type { ChatMode, TutorPayload } from '@mathboard/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from './markdown';

interface Props {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  placeholder: string;
  theme: 'light' | 'dark';
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  model: string;
  onModelChange: (model: string) => void;
  premiumAvailable: boolean;
  aiCredits: number | null;
  tutor?: TutorPayload | null;
  onTutorStepClick?: (stepId: string) => void;
}

export function InputBox({
  value,
  disabled,
  onChange,
  onSubmit,
  placeholder,
  theme,
  chatMode,
  onChatModeChange,
  model,
  onModelChange,
  premiumAvailable,
  aiCredits,
  tutor,
  onTutorStepClick
}: Props) {
  const isDark = theme === 'dark';
  const wrapperClass = `mt-4 rounded-2xl border p-3 shadow-sm ${
    isDark ? 'border-slate-800 bg-slate-900/70 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
  const textareaClass = `h-24 w-full flex-1 resize-none rounded-xl border p-3 text-sm placeholder:text-slate-400 focus:outline-none ${
    isDark
      ? 'border-slate-700 bg-slate-900 text-slate-100 focus:border-slate-500'
      : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-400'
  }`;
  const sendButtonClass = `inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-60 ${
    isDark
      ? 'border-slate-700 bg-slate-950/40 text-slate-200 hover:bg-slate-800'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  }`;

  const selectClass = `h-8 rounded-lg border px-2 text-xs font-semibold focus:outline-none ${
    isDark
      ? 'border-slate-700 bg-slate-950/40 text-slate-200 focus:border-slate-500'
      : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-slate-400'
  }`;

  const selectDisabledClass = `opacity-60 cursor-not-allowed`;

  const todoItemBase = `flex cursor-pointer items-start gap-2 rounded-xl border p-2`;

  const renderTodoTitle = (title: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children, ...props }) => (
          <span {...props} className="whitespace-pre-line">
            {children}
          </span>
        )
      }}
    >
      {normalizeMathDelimiters(title)}
    </ReactMarkdown>
  );

  const showTodos = chatMode === 'tutor';
  const steps = tutor?.plan?.steps ?? [];
  const completedSet = new Set(tutor?.state.completedStepIds ?? []);
  const visibleSteps = steps.filter((s) => s?.id && !completedSet.has(s.id));
  const firstStep = visibleSteps[0] ?? null;
  const remainingSteps = visibleSteps.slice(1);

  const canSubmit = Boolean(value.trim()) && !disabled;

  return (
    <div className={wrapperClass}>
      {showTodos && (
        <div className="mb-3">
          {!steps.length ? (
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Envoie l’énoncé pour générer un plan.
            </p>
          ) : visibleSteps.length === 0 ? (
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Toutes les étapes sont terminées. Envoie un nouveau message pour générer un nouveau plan.
            </p>
          ) : (
            <div className="space-y-2">
              {firstStep && (() => {
                const isCurrent = tutor?.state.currentStepId === firstStep.id;

                const itemClass = `${todoItemBase} ${
                  isCurrent
                    ? isDark
                      ? 'border-slate-600 bg-slate-900/60'
                      : 'border-slate-300 bg-slate-50'
                    : isDark
                      ? 'border-slate-800 bg-slate-950/20'
                      : 'border-slate-200 bg-white'
                }`;

                return (
                  <button
                    key={firstStep.id}
                    type="button"
                    className={itemClass}
                    disabled={disabled}
                    onClick={() => onTutorStepClick?.(firstStep.id)}
                  >
                    <span className="mt-1 inline-block h-4 w-4 rounded border border-current opacity-50" aria-hidden="true" />
                    <span>{renderTodoTitle(firstStep.title)}</span>
                  </button>
                );
              })()}

              {remainingSteps.length > 0 && (
                <details
                  className={`rounded-xl border p-2 ${isDark ? 'border-slate-800 bg-slate-950/20' : 'border-slate-200 bg-white'}`}
                >
                  <summary className={`cursor-pointer select-none text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {`Autres étapes (${remainingSteps.length})`}
                  </summary>

                  <div className="mt-2 space-y-2">
                    {remainingSteps.map((step) => {
                      const isCurrent = tutor?.state.currentStepId === step.id;

                      const itemClass = `${todoItemBase} ${
                        isCurrent
                          ? isDark
                            ? 'border-slate-600 bg-slate-900/60'
                            : 'border-slate-300 bg-slate-50'
                          : isDark
                            ? 'border-slate-800 bg-slate-950/20'
                            : 'border-slate-200 bg-white'
                      }`;

                      return (
                        <button
                          key={step.id}
                          type="button"
                          className={itemClass}
                          disabled={disabled}
                          onClick={() => onTutorStepClick?.(step.id)}
                        >
                          <span className="mt-1 inline-block h-4 w-4 rounded border border-current opacity-50" aria-hidden="true" />
                          <span>{renderTodoTitle(step.title)}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          className={textareaClass}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) {
                onSubmit();
              }
            }
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value={chatMode}
            onChange={(e) => onChatModeChange(e.target.value as ChatMode)}
            disabled={disabled}
            aria-label="Mode"
          >
            <option value="board">Tableau</option>
            <option value="tutor">Penser</option>
          </select>

          <select
            className={selectClass}
            disabled={disabled}
            aria-label="Modèle"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          >
            <option value="gemini-3-flash-preview">Gemini 3 Flash (gratuit)</option>
            <option value="gemini-3-pro" disabled={!premiumAvailable}>
              {premiumAvailable ? 'Gemini 3 Pro (1 crédit)' : 'Gemini 3 Pro (indispo)'}
            </option>
          </select>

          {typeof aiCredits === 'number' && (
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {`Crédits: ${aiCredits}`}
            </span>
          )}
        </div>

        <button
          type="button"
          className={sendButtonClass}
          onClick={() => onSubmit()}
          disabled={!canSubmit}
          title="Envoyer"
          aria-label="Envoyer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
