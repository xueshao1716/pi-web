// 工坊静态自测：起临时服务验证所有资源可达，测完即退
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const s = http.createServer((q, r) => {
  let p = q.url === '/' ? '/index.html' : q.url;
  const f = path.join(root, decodeURIComponent(p));
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
    r.writeHead(200, { 'content-type': mime + '; charset=utf-8' });
    r.end(d);
  });
});
s.listen(8799, async () => {
  const targets = ['/', '/css/workshop.css', '/js/main.js', '/js/render.js', '/js/prompt.js', '/js/state.js', '/js/theme.js'];
  let ok = true;
  for (const u of targets) {
    const res = await fetch('http://127.0.0.1:8799' + u);
    const len = (await res.text()).length;
    console.log(u, res.status, len);
    if (res.status !== 200 || len < 100) ok = false;
  }
  s.close();
  process.exit(ok ? 0 : 1);
});
