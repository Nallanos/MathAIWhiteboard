interface Props {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  label: string;
  placeholder: string;
  buttonLabel: string;
  theme: 'light' | 'dark';
}

export function InputBox({ value, disabled, onChange, onSubmit, label, placeholder, buttonLabel, theme }: Props) {
  const isDark = theme === 'dark';
  const wrapperClass = `mt-4 rounded-2xl border p-3 shadow-sm ${
    isDark ? 'border-slate-800 bg-slate-900/70 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
  const textareaClass = `h-24 w-full rounded-xl border p-3 text-sm placeholder:text-slate-400 focus:outline-none ${
    isDark
      ? 'border-slate-700 bg-slate-900 text-slate-100 focus:border-slate-500'
      : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-400'
  }`;
  const buttonClass = `mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
    isDark ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'
  }`;

  return (
    <div className={wrapperClass}>
      <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        {label}
      </p>
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
      <button
        type="button"
        className={buttonClass}
        onClick={() => onSubmit()}
        disabled={disabled || !value.trim()}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
