import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { error, type HttpResponse, type Outcome } from './http';

export type Role = 'admin' | 'user';

export type Claims = {
  sub: string;
  username: string;
  groups: string[];
};

// The context the authorizer (step 5) attaches to every request it allows.
// API Gateway only carries strings, so the groups arrive as a JSON array string.
const AuthorizerContext = z.object({
  sub: z.string().min(1),
  username: z.string().min(1),
  groups: z.string(),
});
const Groups = z.array(z.string());

// With simple authorizer responses the context sits under requestContext.authorizer.lambda.
type EventWithAuthorizer = APIGatewayProxyEventV2 & {
  requestContext: { authorizer?: { lambda?: unknown } };
};

const unauthorized = (): HttpResponse => error(401, 'unauthorized', 'Missing or invalid identity');

export function getClaims(event: EventWithAuthorizer): Outcome<Claims> {
  const context = AuthorizerContext.safeParse(event.requestContext?.authorizer?.lambda);
  if (!context.success) {
    return { ok: false, response: unauthorized() };
  }
  let groups: unknown;
  try {
    groups = JSON.parse(context.data.groups);
  } catch {
    return { ok: false, response: unauthorized() };
  }
  const parsedGroups = Groups.safeParse(groups);
  if (!parsedGroups.success) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, value: { sub: context.data.sub, username: context.data.username, groups: parsedGroups.data } };
}

// Architecture section 3: admin wins over user; in neither group means no role.
export function resolveRole(groups: readonly string[]): Role | null {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('user')) return 'user';
  return null;
}

// Returns the 403 response to send, or undefined when the caller is in the group.
export function requireGroup(claims: Claims, group: Role): HttpResponse | undefined {
  return claims.groups.includes(group) ? undefined : error(403, 'forbidden', 'Not allowed for this account');
}
