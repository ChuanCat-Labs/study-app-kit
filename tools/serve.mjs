// Only serve runtime files and course-referenced media, never production originals or keys.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {args, projectRoot, readJSON, normalizeCourse, mediaPaths, inside, courseAsset, WEB_FILES} from './lib.mjs';

const opts = args(), root = projectRoot(opts), port = Number(opts['--port'] || opts._[0] || 8000);
const types = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405); res.end(); return;}
    const url = new URL(req.url, 'http://localhost'), fixture = url.pathname.startsWith('/fixture/');
    const name = decodeURIComponent(url.pathname.slice(fixture ? 9 : 1)) || 'index.html';
    const data = readJSON(path.join(root, fixture ? 'tests/fixtures/ui-course.json' : 'course-data.json'));
    normalizeCourse(root, data);
    const images = [...mediaPaths(data), readJSON(path.join(root, 'app-config.json')).icon];
    for (const image of images) courseAsset(root, image);
    const allowed = new Set([...WEB_FILES, ...images]);
    if (!allowed.has(name)) {res.writeHead(404); res.end(); return;}
    res.setHeader('Content-Type', (types[path.extname(name)] || 'application/octet-stream') + (types[path.extname(name)]?.startsWith('image/') ? '' : '; charset=utf-8'));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') {res.end(); return;}
    if (fixture && name === 'course-data.js') res.end('window.COURSE_SOURCE=' + JSON.stringify(data) + ';');
    else res.end(fs.readFileSync(inside(root, name)));
  } catch {res.writeHead(404); res.end();}
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? '端口已占用；请用 --port 选择其他端口。' : error.message); process.exitCode = 1;});
server.listen(port, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:' + server.address().port + ' ; neutral fixture: /fixture/'));
