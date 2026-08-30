const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('SyncBeat Server Live');
});

const wss = new WebSocketServer({ server });
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
        currentRoom = data.code.trim().toUpperCase();
        userName = data.name || 'Host';

        if (rooms[currentRoom] && rooms[currentRoom].cleanupTimer) {
          clearTimeout(rooms[currentRoom].cleanupTimer);
          rooms[currentRoom].cleanupTimer = null;
        }

        rooms[currentRoom] = {
          host: ws,
          members: rooms[currentRoom] ? rooms[currentRoom].members.filter(c => c.readyState === WebSocket.OPEN) : [],
          cleanupTimer: null
        };

        ws.send(JSON.stringify({ type: 'ROOM_HOSTED_SUCCESS', code: currentRoom }));
      } else if (data.type === 'JOIN_ROOM') {
        currentRoom = data.code.trim().toUpperCase();
        userName = data.name || 'Member';

        if (rooms[currentRoom]) {
          rooms[currentRoom].members.push(ws);
          ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: currentRoom }));
        } else {
          ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND', message: 'No room found with this code.' }));
        }
      } else if (['CONTROL', 'PLAY_TRACK', 'VOLUME', 'REACTION', 'ROOM_CLOSED'].includes(data.type)) {
        if (rooms[currentRoom]) {
          const room = rooms[currentRoom];
          const payload = JSON.stringify({ ...data, name: userName });
          [room.host, ...room.members]
            .filter((client) => client && client !== ws && client.readyState === WebSocket.OPEN)
            .forEach((client) => client.send(payload));
        }
      }
    } catch (err) {
      console.error('Socket message error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      if (rooms[currentRoom].host === ws) {
        rooms[currentRoom].cleanupTimer = setTimeout(() => {
          if (rooms[currentRoom]) {
            rooms[currentRoom].members.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
              }
            });
            delete rooms[currentRoom];
          }
        }, 120000);
      } else {
        rooms[currentRoom].members = rooms[currentRoom].members.filter((client) => client !== ws);
      }
    }
  });
});

server.listen(port, () => {
  console.log(`SyncBeat server running on port ${port}`);
});
