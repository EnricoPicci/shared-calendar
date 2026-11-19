// What the build and the dev server share: how src/main.ts becomes the one module script of
// index.html, app.js (docs/FRONTEND_ARCHITECTURE.md section 3, rule 6).
import { fileURLToPath } from 'node:url';

// The folder frontend/, whatever the directory the script is started from.
export const FRONTEND = new URL('../', import.meta.url);

export const path = (relative) => fileURLToPath(new URL(relative, FRONTEND));

// The esbuild options common to both. `config` holds the three values that src/main.ts declares
// as constants; esbuild writes each one into the bundle in place of its name.
export function bundleOptions(config) {
  return {
    entryPoints: [path('src/main.ts')],
    bundle: true, // follow every import: the views, the services, rxjs, zod, shared/
    format: 'esm', // index.html loads it with type="module"
    target: 'es2022',
    logLevel: 'silent', // the caller reports the errors
    define: {
      API_URL: JSON.stringify(config.API_URL),
      COGNITO_URL: JSON.stringify(config.COGNITO_URL),
      CLIENT_ID: JSON.stringify(config.CLIENT_ID),
    },
  };
}
