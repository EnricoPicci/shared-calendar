// The throw-away dev server of the two view prototypes.
//
//   node prototypes/serve.mjs plain   → http://localhost:5173
//   node prototypes/serve.mjs lit     → http://localhost:5174
//
// It serves the prototype's index.html, the shared style sheet and the bundle of its main.ts
// (built again at every request, so an edit shows after a page reload), and it passes /api and
// /cognito on to the back end's local stack, so that the browser sees one origin.

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';

const variant = process.argv[2];
if (variant !== 'plain' && variant !== 'lit') {
  console.error('usage: node prototypes/serve.mjs <plain|lit> [port]');
  process.exit(1);
}
const port = Number(process.argv[3] ?? (variant === 'plain' ? 5173 : 5174));

const here = new URL('.', import.meta.url);
const API = 'http://127.0.0.1:3000'; // npm run local:api -w backend
const COGNITO = 'http://localhost:9229'; // cognito-local of npm run local:up -w backend

// The app client id of the local user pool, written by the back end's local seed.
const env = JSON.parse(await readFile(new URL('../backend/env.local.json', here), 'utf8'));
const clientId = env.AuthorizerFunction.CLIENT_ID;

async function bundle() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`view-${variant}/main.ts`, here))],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: 'inline',
    write: false,
    logLevel: 'silent',
    define: { CLIENT_ID: JSON.stringify(clientId) },
  });
  return result.outputFiles[0].text;
}

// Sends the request on to the local stack and the answer back, both as they are.
function pass(req, res, target) {
  const upstream = request(target, { method: req.method, headers: { ...req.headers, host: new URL(target).host } }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain' }).end(`local stack not reachable: ${error.message}`);
  });
  req.pipe(upstream);
}

const send = (res, type, body, headers = {}) => res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...headers }).end(body);

createServer(async (req, res) => {
  const url = req.url ?? '/';
  try {
    if (url.startsWith('/api/')) return pass(req, res, API + url.slice('/api'.length));
    if (url.startsWith('/cognito/')) return pass(req, res, COGNITO + url.slice('/cognito'.length));
    if (url === '/') {
      // A strict policy: only this origin's script and style sheet, nothing inline.
      const policy = { 'content-security-policy': "default-src 'self'" };
      return send(res, 'text/html; charset=utf-8', await readFile(new URL(`view-${variant}/index.html`, here)), policy);
    }
    if (url === '/style.css') return send(res, 'text/css; charset=utf-8', await readFile(new URL('common/style.css', here)));
    if (url === '/app.js') return send(res, 'text/javascript; charset=utf-8', await bundle());
    res.writeHead(404).end();
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
  }
}).listen(port, () => console.log(`${variant} prototype on http://localhost:${port}`));
