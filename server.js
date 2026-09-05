const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
const rooms = {};

wss.on('connection', (ws) => {
    let boundRoom = null;

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            return;
        }

        switch (msg.type) {
            case 'CREATE_ROOM': {
                boundRoom = msg.code;
                ws.clientName = msg.name || 'Host';
                ws.accountId = msg.accountId;
                ws.role = 'HOST';

                rooms[boundRoom] = {
                    host: ws,
                    peers: [],
                    currentMedia: null
                };

                ws.send(JSON.stringify({ type: 'ROOM_CREATED', code: boundRoom }));
                broadcastPeers(boundRoom);
                break;
            }

            case 'JOIN_ROOM': {
                const roomCode = msg.code;
                if (!rooms[roomCode] || !rooms[roomCode].host) {
                    ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND' }));
                    return;
                }

                boundRoom = roomCode;
                ws.clientName = msg.name || 'Member';
                ws.accountId = msg.accountId;
                ws.role = 'MEMBER';

                rooms[roomCode].peers = rooms[roomCode].peers.filter(p => p.accountId !== ws.accountId);
                rooms[roomCode].peers.push(ws);

                ws.send(JSON.stringify({ type: 'ROOM_JOINED', code: roomCode }));
                
                if (rooms[roomCode].currentMedia) {
                    ws.send(JSON.stringify({
                        type: 'LOAD_VIDEO',
                        videoId: rooms[roomCode].currentMedia.videoId,
                        time: rooms[roomCode].currentMedia.time || 0
                    }));
                }

                broadcastPeers(roomCode);
                break;
            }

            case 'LOAD_VIDEO': {
                if (!boundRoom || !rooms[boundRoom] || rooms[boundRoom].host !== ws) return;
                rooms[boundRoom].currentMedia = msg;
                broadcastToRoom(boundRoom, msg);
                break;
            }

            case 'MEDIA_SYNC': {
                if (!boundRoom || !rooms[boundRoom] || rooms[boundRoom].host !== ws) return;
                if (rooms[boundRoom].currentMedia) {
                    rooms[boundRoom].currentMedia.time = msg.time;
                }
                broadcastToRoom(boundRoom, msg, ws);
                break;
            }

            case 'CHAT': {
                if (!boundRoom || !rooms[boundRoom]) return;
                broadcastToRoom(boundRoom, {
                    type: 'CHAT',
                    name: ws.clientName,
                    message: msg.message
                }, ws);
                break;
            }

            case 'REACTION': {
                if (!boundRoom || !rooms[boundRoom]) return;
                broadcastToRoom(boundRoom, {
                    type: 'REACTION',
                    emoji: msg.emoji
                }, ws);
                break;
            }

            case 'CLOSE_ROOM': {
                if (boundRoom && rooms[boundRoom] && rooms[boundRoom].host === ws) {
                    broadcastToRoom(boundRoom, { type: 'ROOM_CLOSED' });
                    delete rooms[boundRoom];
                    boundRoom = null;
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (!boundRoom || !rooms[boundRoom]) return;

        if (rooms[boundRoom].host === ws) {
            broadcastToRoom(boundRoom, { type: 'ROOM_CLOSED' });
            delete rooms[boundRoom];
        } else {
            rooms[boundRoom].peers = rooms[boundRoom].peers.filter(p => p !== ws);
            broadcastPeers(boundRoom);
        }
    });
});

function broadcastToRoom(roomCode, data, excludeWs = null) {
    const r = rooms[roomCode];
    if (!r) return;
    const all = [r.host, ...r.peers].filter(Boolean);
    all.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function broadcastPeers(roomCode) {
    const r = rooms[roomCode];
    if (!r) return;

    const list = [];
    if (r.host) list.push({ name: r.host.clientName, role: 'HOST' });
    r.peers.forEach(p => list.push({ name: p.clientName, role: 'MEMBER' }));

    broadcastToRoom(roomCode, { type: 'PEER_LIST', peers: list });
}

console.log(`SyncBeat Server listening on port ${PORT}`);
