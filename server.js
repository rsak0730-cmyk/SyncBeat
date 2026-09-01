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
            room.peers = room.peers.filter(client => client !== ws && client.readyState === WebSocket.OPEN);
            broadcastPeerList(currentRoom);
        }
    }
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
