import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../ui/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
http.createServer(async (req, res) => {
  const asset = assets[new URL(req.url, 'http://localhost').pathname];
  if (!asset) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await fs.readFile(path.join(root, asset[0]));
    res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Interface preview listening on port ${port}. Applying settings requires the Windows desktop app.`));
