// In-process static server: require('./serve.js')(dir, port) → Promise<server>.
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv', '.woff2': 'font/woff2', '.geojson': 'application/json' };
module.exports = (dir, port) => new Promise(res => {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p); if (!f.startsWith(dir)) { r.writeHead(403); r.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  s.listen(port, () => res(s));
});
