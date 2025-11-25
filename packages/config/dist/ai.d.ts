export type AIMode = 'auto' | 'manual';
export interface AIMessage {
    id: string;
    boardId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
}
export interface SceneSnapshot {
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}
export interface CaptureImagePayload {
    dataUrl: string;
    width: number;
    height: number;
    byteSize: number;
}
export interface CreateCapturePayload {
    conversationId: string;
    boardId: string;
    scene: SceneSnapshot;
    image: CaptureImagePayload;
}
export interface AIPromptPayload {
    boardId: string;
    conversationId: string;
    prompt: string;
    locale: 'fr' | 'en';
    mode: AIMode;
    captureId: string | null;
    provider?: 'google' | 'openai' | 'anthropic';
    model?: string;
}
//# sourceMappingURL=ai.d.ts.map