import { useEffect, useState } from 'react';
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
  const [peers, setPeers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!options.boardId) return;
    const socket: Socket = io(env.wsUrl, { transports: ['websocket'] });
    socket.emit('join-board', options.boardId, options.userId, options.userName);

    socket.on('user-joined', ({ userId, userName }) => {
      setPeers((prev) => ({ ...prev, [userId]: userName }));
    });

    socket.on('drawing-update', (snapshot: BoardSnapshot) => {
      if (!excalidrawApi) return;
      excalidrawApi.updateScene({
        elements: snapshot.elements as any,
        appState: snapshot.appState as any
      });
      const files = Object.values(snapshot.files ?? {});
      if (files.length) {
        excalidrawApi.addFiles(files as any);
      }
    });

    socket.on('cursor-move', ({ userId, position }) => {
      setPeers((prev) => ({ ...prev, [userId]: `${position.x},${position.y}` }));
    });

    return () => {
      socket.disconnect();
    };
  }, [options.boardId, options.userId, options.userName, excalidrawApi]);

  return {
    peerCount: Object.keys(peers).length
  };
}
