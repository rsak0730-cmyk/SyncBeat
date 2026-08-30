const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Keep Render awake and prevent socket timeouts
app.get('/', (req, res) => res.send('SyncBeat Server is Active'));

const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoomCode = null;
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
                currentRoomCode = data.code;
                rooms.set(currentRoomCode, { host: ws, members: new Set() });
                console.log(`Room created: ${currentRoomCode}`);
                ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS', code: data.code }));
            } 
            else if (data.type === 'JOIN_ROOM') {
                const room = rooms.get(data.code);
                if (room) {
                    currentRoomCode = data.code;
                    room.members.add(ws);
                    ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: data.code }));
                    console.log(`User joined: ${data.code}`);
                } else {
                    ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND' }));
                }
            } 
            else if (['CONTROL', 'PLAY_TRACK', 'VOLUME'].includes(data.type)) {
                if (currentRoomCode && rooms.has(currentRoomCode)) {
                    const room = rooms.get(currentRoomCode);
                    if (room.host === ws) {
                        const payload = JSON.stringify(data);
                        room.members.forEach(member => {
                            if (member.readyState === WebSocket.OPEN) {
                                member.send(payload);
                            }
                        });
                    }
                }
            }
            else if (data.type === 'REACTION') {
                if (currentRoomCode && rooms.has(currentRoomCode)) {
                    const room = rooms.get(currentRoomCode);
                    const payload = JSON.stringify(data);
                    if (room.host && room.host !== ws && room.host.readyState === WebSocket.OPEN) {
                        room.host.send(payload);
                    }
                    room.members.forEach(member => {
                        if (member !== ws && member.readyState === WebSocket.OPEN) {
                            member.send(payload);
                        }
                    });
                }
            }
            else if (data.type === 'ROOM_CLOSED') {
                if (currentRoomCode && rooms.has(currentRoomCode)) {
                    const room = rooms.get(currentRoomCode);
                    if (room.host === ws) {
                        const payload = JSON.stringify(data);
                        room.members.forEach(member => {
                            if (member.readyState === WebSocket.OPEN) {
                                member.send(payload);
                            }
                        });
                        rooms.delete(currentRoomCode);
                    }
                }
            }
        } catch (err) {
            console.error('Error:', err);
        }
    });

    ws.on('close', () => {
        if (currentRoomCode && rooms.has(currentRoomCode)) {
            const room = rooms.get(currentRoomCode);
            if (room.host === ws) {
                room.members.forEach(member => {
                    if (member.readyState === WebSocket.OPEN) {
                        member.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                    }
                });
                rooms.delete(currentRoomCode);
            } else {
                room.members.delete(ws);
            }
        }
    });
});

// Periodic heartbeat check every 25 seconds to keep connections alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 25000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`SyncBeat server running on port ${PORT}`);
});
