// A small static file server for built sites (ENG-12). Astro builds `build.format: 'file'`, so
// /work/x is served from work/x.html. A path that leaves the folder, or a missing file, is a 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

async function findFile(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const candidates = rel.endsWith('/') ? [`${rel}index.html`] : [rel, `${rel}.html`];
  for (const c of candidates) {
    const file = resolve(join(root, c));
    if (file !== root && !file.startsWith(root + sep)) return null;
    const s = await stat(file).catch(() => null);
    if (s?.isFile()) return file;
  }
  return null;
}

/** Starts the server; resolves with the http.Server once it listens. */
export function serve(root, port) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    const file = await findFile(base, new URL(req.url, 'http://x').pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res
      .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      .end(await readFile(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}
