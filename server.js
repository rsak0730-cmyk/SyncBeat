const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SyncBeat WebSocket Server Running\n');
});

const wss = new WebSocket.Server({ server });
// ... keep the rest of your existing rooms & connection logic ...

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`SyncBeat server running on port ${PORT}`);
});
