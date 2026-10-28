import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { CognitoJwtVerifier, JwtRsaVerifier } from 'aws-jwt-verify';
import { FetchError } from 'aws-jwt-verify/error';
import { SimpleJwksCache } from 'aws-jwt-verify/jwk';
import { log } from '../lib/logger';

// The claims of a Cognito access token this authorizer reads (architecture section 4).
type AccessTokenPayload = {
  sub: string;
  username?: unknown;
  'cognito:groups'?: unknown;
};

// The library's default fetcher only speaks HTTPS; cognito-local serves its keys over plain HTTP.
// Node's fetch has no timeout of its own, so give up after a few seconds like the default fetcher.
// Every failure becomes the library's FetchError, as with the default fetcher, so the handler
// treats an unreachable key server the same way locally and in the cloud.
const JWKS_TIMEOUT_MS = 3000;
const httpFetcher = {
  fetch: async (uri: string): Promise<ArrayBuffer> => {
    let response: Response;
    try {
      response = await fetch(uri, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) });
    } catch (err) {
      throw new FetchError(uri, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
    if (!response.ok) throw new FetchError(uri, `status code ${response.status}, expected 200`);
    return response.arrayBuffer();
  },
};

// Cloud: the Cognito verifier derives issuer and JWKS address from the pool id.
// Local (JWKS_URI set): cognito-local issues tokens under its own issuer, so the generic
// RSA verifier is used with the same client_id and token_use checks done by hand.
// Created once per container so the downloaded keys are reused across invocations.
function createVerifier() {
  const clientId = process.env.CLIENT_ID ?? '';
  const jwksUri = process.env.JWKS_URI;
  if (!jwksUri) {
    return CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID ?? '',
      clientId,
      tokenUse: 'access',
    });
  }
  return JwtRsaVerifier.create(
    {
      issuer: process.env.COGNITO_ISSUER ?? '',
      jwksUri,
      audience: null,
      customJwtCheck: ({ payload }) => {
        // token_use first, like the cloud verifier: an id token has no client_id claim, and
        // "token_use is not access" is the reason worth reading in the log.
        if (payload.token_use !== 'access') throw new Error('token_use is not access');
        if (payload.client_id !== clientId) throw new Error('client_id does not match');
      },
    },
    { jwksCache: new SimpleJwksCache({ fetcher: httpFetcher }) },
  );
}

export const verifier = createVerifier();

// Shape read back by getClaims in src/lib/auth.ts; the context only carries strings.
type AuthorizerContext = { sub: string; username: string; groups: string };
type AuthorizerResult = APIGatewaySimpleAuthorizerResult | APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>;

const deny: AuthorizerResult = { isAuthorized: false };

// API Gateway lowercases header names for HTTP APIs; look the header up case-insensitively anyway.
function bearerToken(headers: Record<string, string | undefined> | undefined): string | undefined {
  const header = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
  return header?.match(/^Bearer (\S+)$/)?.[1];
}

export const handler = async (event: APIGatewayRequestAuthorizerEventV2): Promise<AuthorizerResult> => {
  const requestId = event.requestContext?.requestId ?? 'unknown';
  const token = bearerToken(event.headers);
  if (!token) {
    log('warn', { requestId, msg: 'authorizer denied', reason: 'missing or malformed Authorization header' });
    return deny;
  }

  let payload: AccessTokenPayload;
  try {
    payload = (await verifier.verify(token)) as AccessTokenPayload;
  } catch (err) {
    // The signing keys could not be downloaded: not the caller's fault. Crash so that the
    // client gets a 500 and the authorizer Errors alarm fires (architecture section 11).
    if (err instanceof FetchError) {
      log('error', { requestId, msg: 'authorizer could not download the signing keys', reason: err });
      throw err;
    }
    // Library error messages name the failed check, never the token itself.
    log('warn', { requestId, msg: 'authorizer denied', reason: err });
    return deny;
  }

  const groups = payload['cognito:groups'] ?? [];
  if (typeof payload.username !== 'string' || !Array.isArray(groups) || !groups.every((g) => typeof g === 'string')) {
    log('warn', { requestId, msg: 'authorizer denied', reason: 'unexpected username or cognito:groups claim' });
    return deny;
  }

  return {
    isAuthorized: true,
    context: { sub: payload.sub, username: payload.username, groups: JSON.stringify(groups) },
  };
};
