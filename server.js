const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SyncBeat Backend Running\n');
});

const wss = new WebSocket.Server({ server });
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'PING') return;

            if (data.type === 'HOST_ROOM') {
                currentRoom = data.code;
                ws.clientName = data.name || 'Host';
                ws.accountId = data.accountId || '';
                
                if (!rooms[currentRoom]) {
                    rooms[currentRoom] = { host: ws, peers: [] };
                } else {
                    rooms[currentRoom].host = ws;
                }
                ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS', code: currentRoom }));
                broadcastPeerList(currentRoom);
            } else if (data.type === 'JOIN_ROOM') {
                currentRoom = data.code;
                ws.clientName = data.name || 'Member';
                ws.accountId = data.accountId || '';

                if (rooms[currentRoom]) {
                    rooms[currentRoom].peers.push(ws);
                    ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: currentRoom }));
                    broadcastPeerList(currentRoom);
                } else {
                    ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND', message: 'Room code not found or expired.' }));
                }
            } else if (data.type === 'CONTROL' || data.type === 'PLAY_TRACK' || data.type === 'VOLUME' || data.type === 'REACTION' || data.type === 'CHAT_MESSAGE' || data.type === 'PLAY_REAL_SONG') {
                if (currentRoom && rooms[currentRoom]) {
                    const room = rooms[currentRoom];
                    const targets = [room.host, ...room.peers].filter(client => client && client !== ws && client.readyState === WebSocket.OPEN);
                    targets.forEach(client => {
                        client.send(JSON.stringify(data));
                    });
                }
            } else if (data.type === 'ROOM_CLOSED') {
                if (currentRoom && rooms[currentRoom]) {
                    const room = rooms[currentRoom];
                    const targets = [room.host, ...room.peers].filter(client => client && client.readyState === WebSocket.OPEN);
                    targets.forEach(client => {
                        client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                    });
                    delete rooms[currentRoom];
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (room.host === ws) {
                const targets = [...room.peers].filter(client => client && client.readyState === WebSocket.OPEN);
                targets.forEach(client => {
                    client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                });
                delete rooms[currentRoom];
            } else {
                room.peers = room.peers.filter(client => client !== ws);
                broadcastPeerList(currentRoom);
            }
        }
    });
});

function broadcastPeerList(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    const peersData = [];
    if (room.host) {
        peersData.push({ name: room.host.clientName || 'Host', accountId: room.host.accountId || '', role: 'HOST' });
    }
    room.peers.forEach(p => {
        peersData.push({ name: p.clientName || 'Member', accountId: p.accountId || '', role: 'MEMBER' });
    });
    const targets = [room.host, ...room.peers].filter(client => client && client.readyState === WebSocket.OPEN);
    targets.forEach(client => {
        client.send(JSON.stringify({ type: 'PEER_LIST', peers: peersData }));
    });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
