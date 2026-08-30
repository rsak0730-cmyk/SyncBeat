const { WebSocketServer, WebSocket } = require('ws');

const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

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
        
        // If room exists (e.g. host reconnected), clear any pending deletion timer
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
        console.log(`[ROOM CREATED/REBOUND] Code: ${currentRoom}`);
      } else if (data.type === 'JOIN_ROOM') {
        currentRoom = data.code.trim().toUpperCase();
        userName = data.name || 'Member';
        
        if (rooms[currentRoom]) {
          rooms[currentRoom].members.push(ws);
          ws.send(JSON.stringify({ type: 'ROOM_JOIN_SUCCESS', code: currentRoom }));
          console.log(`[MEMBER JOINED] Room: ${currentRoom}, Member: ${userName}`);
        } else {
          ws.send(JSON.stringify({ type: 'ROOM_NOT_FOUND', message: 'No room found with this code. Make sure the host is online.' }));
          console.log(`[JOIN FAILED] Room not found: ${currentRoom}`);
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
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      if (rooms[currentRoom].host === ws) {
        console.log(`[HOST DISCONNECTED] Waiting 2 minutes before closing room: ${currentRoom}`);
        // Keep room alive for 120 seconds to allow host to switch apps/reconnect
        rooms[currentRoom].cleanupTimer = setTimeout(() => {
          if (rooms[currentRoom]) {
            rooms[currentRoom].members.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
              }
            });
            delete rooms[currentRoom];
            console.log(`[ROOM EXPIRED & DELETED]: ${currentRoom}`);
          }
        }, 120000);
      } else {
        rooms[currentRoom].members = rooms[currentRoom].members.filter((client) => client !== ws);
      }
    }
  });
});

console.log(`SyncBeat server running on port ${port}`);
