const http = require('http');
const server = http.createServer((req, res) => { res.end('ok'); });
server.on('listening', () => {
  const a = server.address();
  console.log('LISTENING', a);
});
server.on('error', (e) => { console.error('ERROR', e); });
server.listen(8080, '127.0.0.1');
