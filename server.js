const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SyncBeat Backend Running\n');
});

const wss = new WebSocket.Server({ server });
const rooms = {}; // Format: { roomCode: { host: ws, peers: [], currentTrack: null, isPlaying: false, currentTime: 0 } }

wss.on('connection', (ws) => {
    let currentRoom = null;
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
                return;
            }

            if (data.type === 'HOST_ROOM') {
                currentRoom = data.code;
                ws.clientName = data.name || 'Host';
                ws.clientAccountId = data.accountId || 'SYNC-0000';

                if (!rooms[currentRoom]) {
                    rooms[currentRoom] = { host: ws, peers: [], currentTrack: null, isPlaying: false, currentTime: 0 };
                } else {
                    rooms[currentRoom].host = ws;
                }

                updateRoomPeers(currentRoom);
                ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS', code: currentRoom }));

            } else if (data.type === 'JOIN_ROOM') {
                currentRoom = data.code;
                ws.clientName = data.name || 'Member';
                ws.clientAccountId = data.accountId || 'SYNC-0000';

                if (!rooms[currentRoom]) {
                    ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND', message: 'Room does not exist or expired.' }));
                    return;
                }

                rooms[currentRoom].peers = rooms[currentRoom].peers.filter(p => p.accountId !== ws.clientAccountId);
                rooms[currentRoom].peers.push({ ws, name: ws.clientName, accountId: ws.clientAccountId, role: 'MEMBER' });

                ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: currentRoom }));
                updateRoomPeers(currentRoom);
                broadcastToRoom(currentRoom, { type: 'NOTIFICATION', message: `${ws.clientName} joined the room` }, ws);

                // Instantly sync currently playing track to the newly joined member
                const room = rooms[currentRoom];
                if (room.currentTrack) {
                    ws.send(JSON.stringify({
                        type: 'PLAY_TRACK',
                        title: room.currentTrack,
                        currentTime: room.currentTime || 0
                    }));
                    if (room.isPlaying) {
                        ws.send(JSON.stringify({
                            type: 'CONTROL',
                            action: 'play',
                            time: room.currentTime || 0
                        }));
                    }
                }

            } else if (data.type === 'PLAY_TRACK') {
                if (currentRoom && rooms[currentRoom]) {
                    rooms[currentRoom].currentTrack = data.title;
                    rooms[currentRoom].isPlaying = true;
                    rooms[currentRoom].currentTime = data.currentTime || 0;
                }
                broadcastToRoom(currentRoom, data, ws);

            } else if (data.type === 'CONTROL') {
                if (currentRoom && rooms[currentRoom]) {
                    if (data.action === 'play' || data.action === 'seek') {
                        rooms[currentRoom].isPlaying = true;
                    } else if (data.action === 'pause') {
                        rooms[currentRoom].isPlaying = false;
                    }
                    if (typeof data.time === 'number') {
                        rooms[currentRoom].currentTime = data.time;
                    }
                }
                broadcastToRoom(currentRoom, data, ws);

            } else if (['VOLUME', 'REACTION'].includes(data.type)) {
                broadcastToRoom(currentRoom, data, ws);

            } else if (data.type === 'ROOM_CLOSED') {
                broadcastToRoom(currentRoom, { type: 'ROOM_CLOSED' });
                broadcastToRoom(currentRoom, { type: 'NOTIFICATION', message: `${ws.clientName || 'Host'} closed the room` });
                if (currentRoom && rooms[currentRoom]) {
                    delete rooms[currentRoom];
                }
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (room.host === ws) {
                broadcastToRoom(currentRoom, { type: 'ROOM_CLOSED' });
                broadcastToRoom(currentRoom, { type: 'NOTIFICATION', message: `Host left the room` });
                delete rooms[currentRoom];
            } else {
                const leavingPeer = room.peers.find(p => p.ws === ws);
                const leavingName = leavingPeer ? leavingPeer.name : 'A member';
                room.peers = room.peers.filter(p => p.ws !== ws);
                updateRoomPeers(currentRoom);
                broadcastToRoom(currentRoom, { type: 'NOTIFICATION', message: `${leavingName} left the room` });
            }
        }
    });
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

function broadcastToRoom(roomCode, data, excludeWs = null) {
    const room = rooms[roomCode];
    if (!room) return;
    const payload = JSON.stringify(data);
    [room.host, ...room.peers.map(p => p.ws)].forEach(client => {
        if (client && client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function updateRoomPeers(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const peerList = [];
    if (room.host) {
        peerList.push({ name: room.host.clientName || 'Host', accountId: room.host.clientAccountId || 'HOST-ID', role: 'HOST' });
    }
    room.peers.forEach(p => {
        peerList.push({ name: p.name, accountId: p.accountId, role: 'MEMBER' });
    });

    broadcastToRoom(roomCode, { type: 'PEER_LIST', peers: peerList });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`SyncBeat Server running on port ${PORT}`);
});
