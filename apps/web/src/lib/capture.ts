import { exportToCanvas } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type { SceneSnapshot, CaptureImagePayload } from '@mathboard/shared';

export interface CaptureSnapshot {
  scene: SceneSnapshot;
  image: CaptureImagePayload;
}

const MAX_DIMENSION = 1600;

// Keep payloads comfortably below backend limits (defaults: 5MB image, 1MB scene).
// Base64 expands by ~4/3; we budget bytes based on decoded size.
const TARGET_IMAGE_MAX_BYTES = 4_500_000;

const DIMENSION_CANDIDATES = [1600, 1200, 900, 700, 500];
const QUALITY_CANDIDATES = [0.85, 0.75, 0.65, 0.55];

type ImageFormat = 'image/webp' | 'image/jpeg' | 'image/png';

function pickMinimalScene(scene: { elements: any[]; appState: any; files: any }): SceneSnapshot {
  // Important: Excalidraw "files" can be huge (embedded images). We don't need it for backend storage
  // in our current flow; the AI uses the rendered image plus a light scene summary.
  // Also keep appState minimal to reduce JSON size.
  const minimalAppState = {
    viewBackgroundColor: scene.appState?.viewBackgroundColor,
    theme: scene.appState?.theme,
    zoom: scene.appState?.zoom,
  };

  // Keep only a minimal subset of element fields that are useful for a text summary.
  const minimalElements = (scene.elements ?? []).map((el: any) => {
    const base: any = {
      id: el?.id,
      type: el?.type,
      x: el?.x,
      y: el?.y,
      width: el?.width,
      height: el?.height,
      angle: el?.angle,
      text: el?.text,
      // keep these if present; they're useful for handwriting blocks / markdown blocks
      rawText: el?.rawText,
    };
    // remove undefined keys to further reduce JSON size
    for (const k of Object.keys(base)) {
      if (base[k] === undefined) delete base[k];
    }
    return base;
  });

  return {
    elements: minimalElements as any,
    appState: minimalAppState as any,
    files: {} as any,
  };
}

export async function buildCaptureSnapshot(api: ExcalidrawImperativeAPI): Promise<CaptureSnapshot> {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();

  // Try progressively smaller / more compressed captures.
  const formatCandidates: ImageFormat[] = ['image/webp', 'image/jpeg', 'image/png'];

  let lastCanvas: HTMLCanvasElement | null = null;
  let lastDataUrl: string | null = null;

  for (const maxDim of DIMENSION_CANDIDATES) {
    const canvas = await exportToCanvas({
      elements: [...elements] as any,
      appState,
      files,
      maxWidthOrHeight: maxDim,
      exportBackground: true,
      exportPadding: 16
    });

    lastCanvas = canvas;

    for (const format of formatCandidates) {
      // PNG ignores quality; still try once.
      const qualities = format === 'image/png' ? [1] : QUALITY_CANDIDATES;
      for (const q of qualities) {
        const dataUrl = canvas.toDataURL(format, q);
        const byteSize = estimateByteSize(dataUrl);
        lastDataUrl = dataUrl;

        if (byteSize <= TARGET_IMAGE_MAX_BYTES) {
          return {
            scene: pickMinimalScene({ elements: [...elements] as any, appState, files }),
            image: {
              dataUrl,
              width: canvas.width,
              height: canvas.height,
              byteSize
            }
          };
        }
      }
    }
  }

  // If still too large, return the last attempt; backend may reject but we tried.
  if (!lastCanvas || !lastDataUrl) {
    throw new Error('Capture generation failed');
  }

  return {
    scene: pickMinimalScene({ elements: [...elements] as any, appState, files }),
    image: {
      dataUrl: lastDataUrl,
      width: lastCanvas.width,
      height: lastCanvas.height,
      byteSize: estimateByteSize(lastDataUrl)
    }
  };
}

function estimateByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil((base64.length * 3) / 4);
}
