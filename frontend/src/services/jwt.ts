// Decodes the payload (the middle part) of a JWT. It does NOT verify the signature: the browser
// only displays these claims, and the API verifies the token on every call
// (docs/FRONTEND_SERVICES.md section 4.5). Throws if the string is not a JWT.
export function decodeClaims(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('not a JWT');
  // base64url → base64: other alphabet for two characters, padding left out.
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // atob gives one character per byte; TextDecoder turns the bytes back into UTF-8 text.
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    throw new Error('JWT payload is not an object');
  }
  return claims as Record<string, unknown>;
}
