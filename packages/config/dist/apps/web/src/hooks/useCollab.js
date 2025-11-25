import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { env } from '../lib/env';
export function useCollab(options, excalidrawApi) {
    const [peers, setPeers] = useState({});
    useEffect(() => {
        if (!options.boardId)
            return;
        const socket = io(env.wsUrl, { transports: ['websocket'] });
        socket.emit('join-board', options.boardId, options.userId, options.userName);
        socket.on('user-joined', ({ userId, userName }) => {
            setPeers((prev) => ({ ...prev, [userId]: userName }));
        });
        socket.on('drawing-update', (snapshot) => {
            if (!excalidrawApi)
                return;
            excalidrawApi.updateScene({
                elements: snapshot.elements,
                appState: snapshot.appState
            });
            const files = Object.values(snapshot.files ?? {});
            if (files.length) {
                excalidrawApi.addFiles(files);
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
//# sourceMappingURL=useCollab.js.map