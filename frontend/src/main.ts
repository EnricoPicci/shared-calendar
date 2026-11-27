import { padded } from './texts/padded';
import { runShell } from './views/shell';

// The entry file of the bundle (docs/FRONTEND_ARCHITECTURE.md section 9), and the only file that
// knows where the configuration comes from: five constants that the bundle command puts in with
// esbuild's `define` (scripts/bundle.mjs), handed on as one plain object
// (docs/FRONTEND_SERVICES.md section 2, rule 3).
declare const API_URL: string; // the API's base URL, no trailing slash
declare const COGNITO_URL: string; // where InitiateAuth is posted
declare const CLIENT_ID: string; // the app client of the user pool
declare const SKIP_GLOBAL_SIGN_OUT: boolean; // true only in the dev server's bundle, for the local stack
// True only in the dev server's bundle: the padded test language is offered there. In every other
// bundle the branch is false, so the minified build drops it and the padded texts with it
// (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 4).
declare const TEST_LANGUAGE: boolean;

runShell({ apiUrl: API_URL, cognitoUrl: COGNITO_URL, clientId: CLIENT_ID, skipGlobalSignOut: SKIP_GLOBAL_SIGN_OUT, ...(TEST_LANGUAGE ? { testLanguage: padded } : {}) });
