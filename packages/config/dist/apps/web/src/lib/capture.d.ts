import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw';
import type { SceneSnapshot, CaptureImagePayload } from '@mathboard/shared';
export interface CaptureSnapshot {
    scene: SceneSnapshot;
    image: CaptureImagePayload;
}
export declare function buildCaptureSnapshot(api: ExcalidrawImperativeAPI): Promise<CaptureSnapshot>;
//# sourceMappingURL=capture.d.ts.map