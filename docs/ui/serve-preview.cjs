/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS preview server. */
// Local-only UI preview. Explicit routes prevent serving repository secrets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = {
  '/': ['restaurant-preview.html', 'text/html'],
  '/restaurant-preview.css': ['restaurant-preview.css', 'text/css'],
  '/restaurant-preview.js': ['restaurant-preview.js', 'text/javascript'],
  '/leaflet.js': ['../../node_modules/leaflet/dist/leaflet.js', 'text/javascript'],
  '/leaflet.css': ['../../node_modules/leaflet/dist/leaflet.css', 'text/css'],
};
http.createServer((req, res) => {
  const route = routes[new URL(req.url, 'http://localhost').pathname];
  if (!route) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.resolve(__dirname, route[0]), (error, body) => {
    if (error) { res.writeHead(500); res.end('Preview unavailable'); return; }
    res.writeHead(200, { 'Content-Type': route[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  });
}).listen(3100, '127.0.0.1', () => console.log('Preview: http://localhost:3100'));
