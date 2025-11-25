import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type { AIMessage } from '@mathboard/shared';
interface UseAIOptions {
    boardId: string;
    autoCapture: boolean;
    locale: 'fr' | 'en';
}
export declare function useAI(excalidrawApi: ExcalidrawImperativeAPI | null, options: UseAIOptions): {
    messages: AIMessage[];
    sendPrompt: (prompt: string) => Promise<void>;
    isBusy: boolean;
};
export {};
//# sourceMappingURL=useAI.d.ts.map