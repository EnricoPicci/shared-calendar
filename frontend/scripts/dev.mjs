// npm run dev -w frontend [-- <port>]: the page on http://localhost:5173, against the back
// end's local stack. For local work only.
//
// It serves three addresses: / (index.html), /style.css and /app.js. The last is not a file: it is
// src/main.ts bundled at every request, so an edit shows after a reload of the page. It passes
// /api/… on to the local API and /cognito/… to cognito-local, so that the browser sees one
// origin: the API answers no cross-origin request (docs/FRONTEND_SERVICES.md section 10.3).
//
// It never prints a request's body or headers: the login's body holds a password, and the API
// calls carry a token.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { bundleOptions, path } from './bundle.mjs';

const port = Number(process.argv[2] ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('usage: npm run dev -w frontend [-- <port>]');
  process.exit(1);
}

const API = 'http://127.0.0.1:3000'; // npm run local:api -w backend
const COGNITO = 'http://localhost:9229'; // cognito-local of npm run local:up -w backend

// The app client id of the local user pool, which the back end's local seed writes.
const ENV_FILE = path('../backend/env.local.json');
async function clientId() {
  const env = JSON.parse(await readFile(ENV_FILE, 'utf8'));
  return env.AuthorizerFunction.CLIENT_ID;
}
try {
  await clientId();
} catch {
  console.error('dev: cannot read the client id from backend/env.local.json.');
  console.error('     Start the local stack first: npm run local:up -w backend');
  process.exit(1);
}

// The bundle for this server. The two addresses have no host: the browser completes them with
// the origin the page came from, whichever name it reached this server by (localhost, or a
// forwarded port of a Codespace).
async function bundle() {
  const config = { API_URL: '/api', COGNITO_URL: '/cognito/', CLIENT_ID: await clientId() };
  const result = await build({ ...bundleOptions(config), sourcemap: 'inline', write: false });
  return result.outputFiles[0].text;
}

const NO_STORE = { 'cache-control': 'no-store' }; // every reload asks again

function send(res, type, body, headers = {}) {
  res.writeHead(200, { 'content-type': type, ...NO_STORE, ...headers }).end(body);
}

function refuse(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE }).end(text);
}

// Sends the request on to the local stack and the answer back, both as they are.
function pass(req, res, target) {
  const headers = { ...req.headers, host: new URL(target).host };
  const upstream = request(target, { method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, { ...answer.headers, ...NO_STORE });
    answer.pipe(res);
  });
  upstream.on('error', (error) => {
    console.error(`dev: ${new URL(target).origin} not reachable (${error.code ?? error.message})`);
    refuse(res, 502, 'The local stack is not reachable: npm run local:up -w backend, then npm run local:api -w backend');
  });
  req.pipe(upstream);
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/')) return pass(req, res, API + url.slice('/api'.length));
  if (url.startsWith('/cognito/')) return pass(req, res, COGNITO + url.slice('/cognito'.length));
  if (req.method !== 'GET') return refuse(res, 405, 'Only GET here');
  try {
    if (url === '/') {
      // A strict policy: this origin's script and style sheet only, nothing inline
      // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 6), no other site may show the page in
      // a frame, and the page may hold no <base> element. The words the deployed page gets
      // (docs/FRONTEND_ARCHITECTURE.md section 13.4), without Cognito's address: here the
      // login goes through this server.
      const policy = { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'" };
      return send(res, 'text/html; charset=utf-8', await readFile(path('index.html')), policy);
    }
    if (url === '/style.css') return send(res, 'text/css; charset=utf-8', await readFile(path('style.css')));
    if (url === '/app.js') return send(res, 'text/javascript; charset=utf-8', await bundle());
    // A browser asks for the icon by itself; the page has none. An empty answer rather than a
    // 404, which the browser would report in its console.
    if (url === '/favicon.ico') return res.writeHead(204, NO_STORE).end();
    refuse(res, 404, 'Not found');
  } catch (error) {
    // A file that cannot be read, or code that esbuild refuses: said here and to the browser,
    // where the page stays blank.
    console.error(`dev: ${url}: ${error.message}`);
    refuse(res, 500, error.message);
  }
});

server.on('error', (error) => {
  console.error(`dev: cannot listen on port ${port} (${error.code ?? error.message})`);
  process.exit(1);
});
// This machine only: the server passes requests on to the local stack.
server.listen(port, '127.0.0.1', () => {
  console.log(`Shared calendar on http://localhost:${port}  (API → ${API}, Cognito → ${COGNITO})`);
  console.log('Stop with Ctrl-C.');
});
