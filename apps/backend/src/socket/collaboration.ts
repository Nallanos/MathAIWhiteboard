import type { Server, Socket } from 'socket.io';
import type { BoardSnapshot } from '@mathboard/shared';

interface CursorPayload {
  boardId: string;
  userId: string;
  position: { x: number; y: number };
}

export function setupCollaboration(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log('socket connected', socket.id);

    const emitPeerCount = (boardId: string) => {
      const count = io.sockets.adapter.rooms.get(boardId)?.size ?? 0;
      io.to(boardId).emit('peer-count', count);
    };

    socket.on('join-board', (boardId: string, userId: string, userName: string) => {
      socket.join(boardId);
      socket.to(boardId).emit('user-joined', { userId, userName });
      emitPeerCount(boardId);
    });

    socket.on('drawing-update', (boardId: string, snapshot: BoardSnapshot) => {
      socket.to(boardId).emit('drawing-update', snapshot);
    });

    socket.on('cursor-move', (payload: CursorPayload) => {
      socket.to(payload.boardId).emit('cursor-move', {
        userId: payload.userId,
        position: payload.position
      });
    });

    socket.on('disconnecting', () => {
      // socket is still in its rooms at this stage (including board rooms)
      for (const room of socket.rooms) {
        if (room === socket.id) continue;
        // Room size still includes this socket; subtract 1.
        const currentSize = io.sockets.adapter.rooms.get(room)?.size ?? 1;
        const nextSize = Math.max(0, currentSize - 1);
        socket.to(room).emit('peer-count', nextSize);
      }
    });

    socket.on('disconnect', () => {
      console.log('socket disconnected', socket.id);
    });
  });
}
