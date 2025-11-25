import { exportToCanvas } from '@excalidraw/excalidraw';
const MAX_DIMENSION = 1600;
export async function buildCaptureSnapshot(api) {
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const canvas = await exportToCanvas({
        elements,
        appState,
        files,
        maxWidthOrHeight: MAX_DIMENSION,
        exportBackground: true,
        exportPadding: 16
    });
    const dataUrl = canvas.toDataURL('image/png', 0.92);
    const byteSize = estimateByteSize(dataUrl);
    return {
        scene: {
            elements,
            appState,
            files
        },
        image: {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            byteSize
        }
    };
}
function estimateByteSize(dataUrl) {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.ceil((base64.length * 3) / 4);
}
//# sourceMappingURL=capture.js.map