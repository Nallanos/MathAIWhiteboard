import { useEffect, useRef, useCallback } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import { exportToBlob } from '@excalidraw/excalidraw';
import { apiFetch } from '../lib/api';

interface UseBoardPersistenceOptions {
  boardId: string | null;
  token: string | null;
}

export function useBoardPersistence(
  api: ExcalidrawImperativeAPI | null,
  options: UseBoardPersistenceOptions
) {
  const { boardId, token } = options;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const isLoadedRef = useRef(false);

  // Load board on mount
  useEffect(() => {
    if (!api || !boardId || !token || isLoadedRef.current) return;

    const loadBoard = async () => {
      try {
        const response = await apiFetch(`/api/boards/${boardId}`, { token });
        
        if (response.ok) {
          const data = await response.json();
          if (data.board?.scene && Object.keys(data.board.scene).length > 0) {
             const scene = data.board.scene;
             // Sanitize loaded scene to remove transient data that might cause errors
             if (scene.appState?.collaborators) {
               delete scene.appState.collaborators;
             }
             // Ensure files are loaded
             if (scene.files) {
               api.addFiles(Object.values(scene.files));
             }
             api.updateScene(scene);
             lastSavedDataRef.current = JSON.stringify(scene);
          }
          isLoadedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load board', error);
      }
    };

    loadBoard();
  }, [api, boardId]);

  const saveBoard = useCallback((elements: any, appState: any, files: any) => {
    if (!boardId || !isLoadedRef.current) return;

    // Strip transient data that shouldn't be persisted
    const { collaborators, ...cleanAppState } = appState;
    const sceneData = { elements, appState: cleanAppState, files };
    const serialized = JSON.stringify(sceneData);

    if (serialized === lastSavedDataRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (!token) return;

        let thumbnailUrl: string | undefined;
        try {
          const blob = await exportToBlob({
            elements,
            appState,
            files,
            mimeType: 'image/png',
            quality: 0.5,
            getDimensions: (width: number, height: number) => ({ width: 300, height: 300 * (height / width) }) // Resize for thumbnail
          });
          if (blob) {
            thumbnailUrl = await blobToBase64(blob);
          }
        } catch (e) {
          console.warn('Failed to generate thumbnail', e);
        }

        await apiFetch(`/api/boards/${boardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene: sceneData, thumbnailUrl }),
          token
        });
        lastSavedDataRef.current = serialized;
      } catch (error) {
        console.error('Failed to save board', error);
      }
    }, 2000); // 2 second debounce
  }, [boardId, token]);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return { saveBoard };
}
