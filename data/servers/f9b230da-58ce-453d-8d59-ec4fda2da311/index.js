// AetherPanel - Node.js Server Instance
const http = require('http');
const PORT = process.env.PORT || 9399;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from Node.js 20 LTS Instance!',
    server: 'f9b230da-58ce-453d-8d59-ec4fda2da311',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }));
});

server.listen(PORT, () => {
  console.log('[Aether] Server "Node.js 20 LTS Instance" running on port ' + PORT);
  console.log('[Aether] Node.js process initialized successfully.');
});
