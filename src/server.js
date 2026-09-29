import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFilters, filterTransactions } from './filters.js';
import { createStore } from './transactions.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

export function createApp({ store = createStore() } = {}) {
  return http.createServer(async (req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/transactions') {
        const q = Object.fromEntries(url.searchParams);
        const { filters, error } = parseFilters(q);
        if (error) return json(400, { error });
        return json(200, { transactions: filterTransactions(store.list(), filters) });
      }
      if (req.method === 'GET' && url.pathname === '/categories') {
        return json(200, { categories: store.categories() });
      }
      if (req.method === 'GET') {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const full = path.join(PUBLIC_DIR, file);
        if (full.startsWith(PUBLIC_DIR + path.sep)) {
          try {
            const data = await readFile(full);
            res.writeHead(200, { 'content-type': TYPES[path.extname(full)] ?? 'application/octet-stream' });
            return res.end(data);
          } catch { /* fall through to 404 */ }
        }
      }
      json(404, { error: 'Not found' });
    } catch {
      json(500, { error: 'Internal Server Error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT ?? 3000;
  createApp().listen(port, () => console.log(`http://localhost:${port}`));
}
