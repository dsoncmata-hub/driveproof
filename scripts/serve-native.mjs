import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('dist-native/public');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.webmanifest':'application/manifest+json' };
createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = resolve(root, '.'+pathname);
  if (!file.startsWith(root+sep) && file!==root) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream'); res.end(data); }
  catch { if (extname(pathname)) { res.writeHead(404).end(); return; } res.setHeader('Content-Type','text/html'); res.end(await readFile(root+'/index.html')); }
}).listen(3000,'127.0.0.1');
