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

type CursorPosition = { x: number; y: number };

type RemoteCursor = {
  userId: string;
  userName?: string;
  position: CursorPosition;
  updatedAt: number;
};

export function useCollab(
  options: UseCollabOptions,
  excalidrawApi: ExcalidrawImperativeAPI | null
) {
  const socketRef = useRef<Socket | null>(null);
  const suppressBroadcastRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRemoteSnapshotRef = useRef<BoardSnapshot | null>(null);

  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});

  const [peerCount, setPeerCount] = useState<number>(0);

  useEffect(() => {
    if (!options.boardId) return;
    const socket: Socket = io(env.wsUrl, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('join-board', options.boardId, options.userId, options.userName);

    const isLocallyInteracting = () => {
      if (!excalidrawApi) return false;
      const appState: any = excalidrawApi.getAppState?.();
      return Boolean(
        appState?.isDrawing ||
          appState?.draggingElement ||
          appState?.resizingElement ||
          appState?.editingElement ||
          appState?.isRotating
      );
    };

    const mergeElements = (localElements: readonly any[], remoteElements: readonly any[]) => {
      const byId = new Map<string, any>();
      for (const el of localElements) {
        if (el?.id) byId.set(String(el.id), el);
      }

      const pickWinner = (a: any, b: any) => {
        // Prefer higher version. Break ties using updated/versionNonce where available.
        const av = Number(a?.version ?? 0);
        const bv = Number(b?.version ?? 0);
        if (bv !== av) return bv > av ? b : a;
        const au = Number(a?.updated ?? 0);
        const bu = Number(b?.updated ?? 0);
        if (bu !== au) return bu > au ? b : a;
        const an = Number(a?.versionNonce ?? 0);
        const bn = Number(b?.versionNonce ?? 0);
        return bn > an ? b : a;
      };

      for (const remoteEl of remoteElements) {
        if (!remoteEl?.id) continue;
        const id = String(remoteEl.id);
        const localEl = byId.get(id);
        byId.set(id, localEl ? pickWinner(localEl, remoteEl) : remoteEl);
      }
      return Array.from(byId.values());
    };

    const applyRemoteSnapshot = (snapshot: BoardSnapshot) => {
      if (!excalidrawApi) return;

      suppressBroadcastRef.current = true;
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
      }

      const localElements = (excalidrawApi.getSceneElements?.() as any[]) ?? [];
      const mergedElements = mergeElements(localElements, (snapshot.elements as any[]) ?? []);

      excalidrawApi.updateScene({
        elements: mergedElements as any,
        appState: snapshot.appState as any,
      });

      const files = Object.values(snapshot.files ?? {});
      if (files.length) {
        excalidrawApi.addFiles(files as any);
      }

      // Excalidraw triggers onChange; ignore broadcasts briefly to prevent echo loops.
      suppressTimerRef.current = setTimeout(() => {
        suppressBroadcastRef.current = false;
      }, 80);
    };

    socket.on('peer-count', (count: number) => {
      setPeerCount(Number.isFinite(count) ? count : 0);
    });

    socket.on('drawing-update', (snapshot: BoardSnapshot) => {
      if (!excalidrawApi) return;

      // Important: applying a full remote snapshot while the user is drawing can cancel
      // the in-progress stroke and make it look like lines "disappear".
      // We queue the latest snapshot and apply it once the user is idle.
      if (isLocallyInteracting()) {
        pendingRemoteSnapshotRef.current = snapshot;
        return;
      }

      applyRemoteSnapshot(snapshot);
    });

    const flushPending = setInterval(() => {
      if (!excalidrawApi) return;
      if (isLocallyInteracting()) return;
      const pending = pendingRemoteSnapshotRef.current;
      if (!pending) return;
      pendingRemoteSnapshotRef.current = null;
      applyRemoteSnapshot(pending);
    }, 80);

    socket.on(
      'cursor-move',
      (payload: { userId: string; userName?: string; position: { x: number; y: number } }) => {
        if (!payload?.userId) return;
        if (!payload?.position) return;
        const x = Number(payload.position.x);
        const y = Number(payload.position.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        setRemoteCursors((prev) => ({
          ...prev,
          [payload.userId]: {
            userId: payload.userId,
            userName: payload.userName,
            position: { x, y },
            updatedAt: Date.now(),
          },
        }));
      }
    );

    return () => {
      socketRef.current = null;
      pendingRemoteSnapshotRef.current = null;
      clearInterval(flushPending);
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [options.boardId, options.userId, options.userName, excalidrawApi]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        let changed = false;
        const next: Record<string, RemoteCursor> = {};
        for (const [userId, cursor] of Object.entries(prev)) {
          if (now - cursor.updatedAt <= 5000) {
            next[userId] = cursor;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const broadcastSnapshot = useCallback(
    (snapshot: BoardSnapshot) => {
      if (suppressBroadcastRef.current) return;
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('drawing-update', options.boardId, snapshot);
    },
    [options.boardId]
  );

  const broadcastCursor = useCallback(
    (position: CursorPosition) => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('cursor-move', {
        boardId: options.boardId,
        userId: options.userId,
        userName: options.userName,
        position,
      });
    },
    [options.boardId, options.userId, options.userName]
  );

  const shouldBroadcast = useCallback(() => !suppressBroadcastRef.current, []);

  return useMemo(
    () => ({
      peerCount,
      broadcastSnapshot,
      shouldBroadcast,
      broadcastCursor,
      remoteCursors,
    }),
    [peerCount, broadcastSnapshot, shouldBroadcast, broadcastCursor, remoteCursors]
  );
}
