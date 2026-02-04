const DEFAULT_LOCALE = 'en' as const;

type Locale = typeof DEFAULT_LOCALE;

const STRINGS = {
  en: {
    appName: 'Chat',
    autoCaptureLabel: 'Auto capture during instruction',
    emptyState: "No conversation yet. Send an instruction. Ask for a correction, or exercises",
    busyState: 'Analyzing…',
    composerLabel: 'New instruction',
    composerPlaceholder: 'Describe what The AI Teacher should analyze or generate',
    composerCTA: 'Send',
    assistantLabel: 'The AI Teacher',
    userLabel: 'You'
  }
} as const satisfies Record<Locale, Record<string, string>>;

export const SIDEBAR_COPY = STRINGS[DEFAULT_LOCALE];

export type SidebarCopy = typeof SIDEBAR_COPY;
