// Dev-only static server that ALSO runs the /api/* functions, which
// `vite preview` does not (see CLAUDE.md — that gap is why AI-backed features
// 404 under plain preview). The drive scripts for multiplayer need a live
// /api/room, so this serves dist/ and routes /api/* through the real TypeScript
// handlers, loaded via Vite's SSR pipeline so no build step is needed.
//
// The room store falls back to its in-process Map here — which is exactly right
// for a single-process drive, and exactly wrong for production (see the
// isPersistent note in api/_lib/roomStore.ts).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 4173);

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' });

const readBody = req => new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname.startsWith('/api/')) {
        try {
            const mod = await vite.ssrLoadModule(`/api${url.pathname.slice(4)}.ts`);
            // Minimal VercelRequest/VercelResponse shim — only what the
            // handlers actually touch.
            const vreq = {
                method: req.method,
                body: req.method === 'POST' ? await readBody(req) : {},
                query: Object.fromEntries(url.searchParams),
                headers: req.headers,
            };
            const vres = {
                statusCode: 200,
                setHeader: (k, v) => res.setHeader(k, v),
                status(code) { this.statusCode = code; return this; },
                json(payload) {
                    res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(payload));
                    return this;
                },
            };
            await mod.default(vreq, vres);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
        }
        return;
    }

    // Static, with SPA fallback.
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`serve-with-api listening on http://localhost:${PORT}`));
