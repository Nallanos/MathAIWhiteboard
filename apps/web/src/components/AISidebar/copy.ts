const DEFAULT_LOCALE = 'fr' as const;

type Locale = typeof DEFAULT_LOCALE;

const STRINGS = {
  fr: {
    appName: 'Chat',
    autoCaptureLabel: 'Capture auto pendant la consigne',
    emptyState: "Aucune conversation pour l'instant. Envoyez une consigne. Demandez une correction, ou des exercices",
    busyState: 'Analyse en cours…',
    composerLabel: 'Nouvelle consigne',
    composerPlaceholder: 'Décrivez ce que Le Prof Artificiel doit analyser ou générer',
    composerCTA: 'Envoyer',
    assistantLabel: 'Le Prof Artificiel',
    userLabel: 'Vous'
  }
} as const satisfies Record<Locale, Record<string, string>>;

export const SIDEBAR_COPY = STRINGS[DEFAULT_LOCALE];

export type SidebarCopy = typeof SIDEBAR_COPY;
