import { runShell } from './views/shell';

// The entry file of the bundle (docs/FRONTEND_ARCHITECTURE.md section 9), and the only file that
// knows where the configuration comes from: three constants that the bundle command puts in with
// esbuild's `define` (scripts/bundle.mjs), handed on as one plain object
// (docs/FRONTEND_SERVICES.md section 2, rule 3).
declare const API_URL: string; // the API's base URL, no trailing slash
declare const COGNITO_URL: string; // where InitiateAuth is posted
declare const CLIENT_ID: string; // the app client of the user pool

runShell({ apiUrl: API_URL, cognitoUrl: COGNITO_URL, clientId: CLIENT_ID });
