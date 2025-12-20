import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type { BoardSnapshot } from '@mathboard/shared';
import { env } from '../lib/env';

interface UseCollabOptions {
  boardId: string;
  userId: string;
  userName: string;
}

export function useCollab(
  options: UseCollabOptions,
  excalidrawApi: ExcalidrawImperativeAPI | null
) {
  const socketRef = useRef<Socket | null>(null);
  const suppressBroadcastRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [peerCount, setPeerCount] = useState<number>(0);

  useEffect(() => {
    if (!options.boardId) return;
    const socket: Socket = io(env.wsUrl, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('join-board', options.boardId, options.userId, options.userName);

    socket.on('peer-count', (count: number) => {
      setPeerCount(Number.isFinite(count) ? count : 0);
    });

    socket.on('drawing-update', (snapshot: BoardSnapshot) => {
      if (!excalidrawApi) return;

      suppressBroadcastRef.current = true;
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
      }

      excalidrawApi.updateScene({
        elements: snapshot.elements as any,
        appState: snapshot.appState as any
      });
      const files = Object.values(snapshot.files ?? {});
      if (files.length) {
        excalidrawApi.addFiles(files as any);
      }

      // Excalidraw triggers onChange; ignore broadcasts briefly to prevent echo loops.
      suppressTimerRef.current = setTimeout(() => {
        suppressBroadcastRef.current = false;
      }, 50);
    });

    return () => {
      socketRef.current = null;
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [options.boardId, options.userId, options.userName, excalidrawApi]);

  const broadcastSnapshot = useCallback(
    (snapshot: BoardSnapshot) => {
      if (suppressBroadcastRef.current) return;
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('drawing-update', options.boardId, snapshot);
    },
    [options.boardId]
  );

  const shouldBroadcast = useCallback(() => !suppressBroadcastRef.current, []);

  return useMemo(
    () => ({
      peerCount,
      broadcastSnapshot,
      shouldBroadcast,
    }),
    [peerCount, broadcastSnapshot, shouldBroadcast]
  );
}
