export type AIMode = 'auto' | 'manual';
export interface AIMessage {
    id: string;
    boardId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
}
export interface AICapturePayload {
    boardId: string;
    imageBase64: string;
    prompt: string;
    locale: 'fr' | 'en';
    mode: AIMode;
}
//# sourceMappingURL=ai.d.ts.map