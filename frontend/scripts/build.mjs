// npm run build -w frontend: writes the three files of the page into frontend/dist/.
//
//   API_URL=https://… COGNITO_URL=https://… CLIENT_ID=… npm run build -w frontend
//
// app.js is src/main.ts bundled and minified, with its source map beside it; index.html and
// style.css are copied as they are. The configuration comes from the three environment variables
// and from nowhere else: nothing about a deployed stack is written in a committed file
// (docs/FOLDER_STRUCTURE.md section 7).
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { bundleOptions, path } from './bundle.mjs';

const NAMES = ['API_URL', 'COGNITO_URL', 'CLIENT_ID'];
const missing = NAMES.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`build: missing environment variable${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
  console.error('  API_URL      the API, no trailing slash       (stack output ApiUrl)');
  console.error('  COGNITO_URL  where the login is posted        (https://cognito-idp.<region>.amazonaws.com/)');
  console.error('  CLIENT_ID    the app client of the user pool  (stack output UserPoolClientId)');
  process.exit(1);
}
const config = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

// Start from an empty folder, so that nothing of an earlier build is left in it.
await rm(path('dist'), { recursive: true, force: true });
await mkdir(path('dist'));

try {
  await build({
    ...bundleOptions(config),
    outfile: path('dist/app.js'),
    minify: true,
    sourcemap: 'linked', // dist/app.js.map, named in the last line of app.js
  });
} catch (error) {
  console.error(`build: ${error.message}`);
  process.exit(1);
}
await copyFile(path('index.html'), path('dist/index.html'));
await copyFile(path('style.css'), path('dist/style.css'));

// The sizes, as they are and as a server would send them compressed.
for (const name of ['index.html', 'style.css', 'app.js']) {
  const content = await readFile(path(`dist/${name}`));
  console.log(`dist/${name.padEnd(10)} ${String(content.length).padStart(7)} bytes, ${String(gzipSync(content).length).padStart(6)} gzipped`);
}
