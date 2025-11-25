import type { AIMessage } from '@mathboard/shared';
interface Props {
    messages: AIMessage[];
    onSend: (prompt: string) => Promise<void> | void;
    isBusy: boolean;
    theme: 'light' | 'dark';
}
export declare function AISidebar({ messages, onSend, isBusy, theme }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=index.d.ts.map