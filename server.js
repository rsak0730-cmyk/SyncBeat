const WebSocket = require('ws');
const ytSearch = require('yt-search');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
        }

        if (data.type === 'HOST_ROOM') {
            currentRoom = data.code;
            ws.clientName = data.name;
            ws.accountId = data.accountId;
            
            if (!rooms[currentRoom]) {
                rooms[currentRoom] = { host: ws, peers: [] };
            } else {
                rooms[currentRoom].host = ws;
            }
            ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS' }));
            broadcastPeerList(currentRoom);
        } 
        else if (data.type === 'JOIN_ROOM') {
            const roomCode = data.code;
            if (!rooms[roomCode]) {
                ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND' }));
                return;
            }
            currentRoom = roomCode;
            ws.clientName = data.name;
            ws.accountId = data.accountId;

            rooms[roomCode].peers = rooms[roomCode].peers.filter(p => p.accountId !== data.accountId);
            rooms[roomCode].peers.push(ws);
            
            ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: roomCode }));
            broadcastPeerList(roomCode);
        } 
        else if (data.type === 'ROOM_CLOSED') {
            if (currentRoom && rooms[currentRoom] && rooms[currentRoom].host === ws) {
                const room = rooms[currentRoom];
                [room.host, ...room.peers].forEach(client => {
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                    }
                });
                delete rooms[currentRoom];
                currentRoom = null;
            }
        }
        else if (data.type === 'AI_SEARCH_SONG') {
            try {
                const searchResult = await ytSearch(data.query);
                const video = searchResult.videos && searchResult.videos[0];
                if (video && currentRoom && rooms[currentRoom]) {
                    const room = rooms[currentRoom];
                    const payload = {
                        type: 'PLAY_YOUTUBE',
                        title: video.title,
                        ytId: video.videoId,
                        currentTime: 0
                    };
                    [room.host, ...room.peers].forEach(client => {
                        if (client && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(payload));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'NOTIFICATION', message: 'No song found.' }));
                }
            } catch (err) {
                ws.send(JSON.stringify({ type: 'NOTIFICATION', message: 'AI search error.' }));
            }
        }
        else {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom];
                const targets = [room.host, ...room.peers].filter(client => client && client !== ws && client.readyState === WebSocket.OPEN);
                targets.forEach(client => {
                    client.send(JSON.stringify(data));
                });
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (room.host === ws) {
                room.host = null; 
                setTimeout(() => {
                    if (rooms[currentRoom] && rooms[currentRoom].host === null) {
                        const targets = [...rooms[currentRoom].peers].filter(client => client && client.readyState === WebSocket.OPEN);
                        targets.forEach(client => {
                            client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                        });
                        delete rooms[currentRoom];
                    }
                }, 30000); 
            } else {
                room.peers = room.peers.filter(client => client !== ws && client.readyState === WebSocket.OPEN);
                broadcastPeerList(currentRoom);
            }
        }
    });
});

function broadcastPeerList(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.host && room.host.readyState !== WebSocket.OPEN) {
        room.host = null;
    }
    room.peers = room.peers.filter(client => client && client.readyState === WebSocket.OPEN);

    const peersData = [];
    if (room.host) {
        peersData.push({ name: room.host.clientName || 'Host', accountId: room.host.accountId || '', role: 'HOST' });
    }
    room.peers.forEach(p => {
        if (!peersData.some(existing => existing.accountId === p.accountId)) {
            peersData.push({ name: p.clientName || 'Member', accountId: p.accountId || '', role: 'MEMBER' });
        }
    });

    const targets = [room.host, ...room.peers].filter(client => client && client.readyState === WebSocket.OPEN);
    targets.forEach(client => {
        client.send(JSON.stringify({ 
            type: 'PEER_LIST', 
            peers: peersData,
            count: peersData.length 
        }));
    });
}

console.log('SyncBeat WebSocket Server Running...');

