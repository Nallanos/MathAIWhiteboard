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

    socket.on('join-board', (boardId: string, userId: string, userName: string) => {
      socket.join(boardId);
      socket.to(boardId).emit('user-joined', { userId, userName });
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

    socket.on('disconnect', () => {
      console.log('socket disconnected', socket.id);
    });
  });
}
