import type { AIMessage } from '@mathboard/shared';
interface Props {
    messages: AIMessage[];
    onSend: (prompt: string) => Promise<void> | void;
    isBusy: boolean;
    autoCapture: boolean;
    onToggleAutoCapture: (value: boolean) => void;
}
export declare function AISidebar({ messages, onSend, isBusy, autoCapture, onToggleAutoCapture }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=index.d.ts.map