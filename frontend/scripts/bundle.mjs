// What the build and the dev server share: how src/main.ts becomes the one module script of
// index.html, app.js (docs/FRONTEND_ARCHITECTURE.md section 3, rule 6).
import { fileURLToPath } from 'node:url';

// The folder frontend/, whatever the directory the script is started from.
export const FRONTEND = new URL('../', import.meta.url);

export const path = (relative) => fileURLToPath(new URL(relative, FRONTEND));

// The languages the calendar speaks: SUPPORTED_LANGUAGES of shared/src/language/languages.ts,
// which a Node script cannot import; the test of this file holds the two lists equal.
export const LANGUAGES = ['en', 'it'];

// The esbuild options common to both. `config` holds the values that src/main.ts declares as
// constants; esbuild writes each one into the bundle in place of its name. SKIP_GLOBAL_SIGN_OUT is
// true only when `config` holds exactly true, which only the dev server gives, for the local
// stack whose Cognito emulator has no GlobalSignOut (docs/FRONTEND_SERVICES.md section 8,
// decision 67): a build that gives nothing, as `npm run build` does, always signs a person out
// everywhere after a change of password. TEST_LANGUAGE is true on the same terms: only the dev
// server offers the padded test language, and a bundle built with it false holds none of it
// (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 4). DEFAULT_LANGUAGE is the page's
// language when neither the browser's memory nor its own languages name one the calendar speaks
// (docs/MULTILANGUAGE_PLAN.md finding F11): `en` when `config` gives none, and a value that is not
// a language of the calendar stops the bundle.
export function bundleOptions(config) {
  const language = config.DEFAULT_LANGUAGE ?? 'en';
  if (!LANGUAGES.includes(language)) throw new Error(`DEFAULT_LANGUAGE must be one of ${LANGUAGES.join(', ')}, not "${language}".`);
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
      SKIP_GLOBAL_SIGN_OUT: JSON.stringify(config.SKIP_GLOBAL_SIGN_OUT === true),
      TEST_LANGUAGE: JSON.stringify(config.TEST_LANGUAGE === true),
      DEFAULT_LANGUAGE: JSON.stringify(language),
    },
  };
}
