const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
    res.send('SyncBeat Server is Active');
});

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let userName = 'User';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
                return;
            }

            if (data.type === 'HOST_ROOM') {
                currentRoom = data.code;
                userName = data.name || 'Host';
                rooms[currentRoom] = { host: ws, members: [] };
                ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS', code: currentRoom }));
            } else if (data.type === 'JOIN_ROOM') {
                currentRoom = data.code;
                userName = data.name || 'Member';
                if (rooms[currentRoom]) {
                    rooms[currentRoom].members.push(ws);
                    ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: currentRoom }));
                } else {
                    ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND', message: 'Room code not found.' }));
                }
            } else if (['CONTROL', 'PLAY_TRACK', 'VOLUME', 'REACTION', 'ROOM_CLOSED'].includes(data.type)) {
                if (rooms[currentRoom]) {
                    const room = rooms[currentRoom];
                    const targets = [room.host, ...room.members].filter(client => client !== ws && client.readyState === 1);
                    targets.forEach(client => client.send(JSON.stringify({ ...data, name: userName })));
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            if (rooms[currentRoom].host === ws) {
                const targets = [...rooms[currentRoom].members].filter(client => client.readyState === 1);
                targets.forEach(client => client.send(JSON.stringify({ type: 'ROOM_CLOSED' })));
                delete rooms[currentRoom];
            } else {
                rooms[currentRoom].members = rooms[currentRoom].members.filter(client => client !== ws);
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`SyncBeat server running on port ${PORT}`);
});
