import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
interface UseCollabOptions {
    boardId: string;
    userId: string;
    userName: string;
}
export declare function useCollab(options: UseCollabOptions, excalidrawApi: ExcalidrawImperativeAPI | null): {
    peerCount: number;
};
export {};
//# sourceMappingURL=useCollab.d.ts.map