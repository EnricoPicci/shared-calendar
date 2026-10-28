import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup, resolveRole, type Claims } from '../../../src/lib/auth';

// Only requestContext matters to getClaims; the rest of the event is irrelevant here.
function eventWith(lambda: unknown): Parameters<typeof getClaims>[0] {
  return { requestContext: { authorizer: { lambda } } } as unknown as Parameters<typeof getClaims>[0];
}

const claims = (groups: string[]): Claims => ({ sub: 'sub-1', username: 'alice', groups });

describe('getClaims', () => {
  it('reads sub, username and the groups JSON array from the authorizer context', () => {
    const result = getClaims(eventWith({ sub: 'sub-1', username: 'alice', groups: '["user"]' }));
    expect(result).toEqual({ ok: true, value: { sub: 'sub-1', username: 'alice', groups: ['user'] } });
  });

  it('accepts an empty group list', () => {
    const result = getClaims(eventWith({ sub: 'sub-1', username: 'alice', groups: '[]' }));
    expect(result).toEqual({ ok: true, value: { sub: 'sub-1', username: 'alice', groups: [] } });
  });

  it.each([
    ['no authorizer at all', { requestContext: {} } as unknown as APIGatewayProxyEventV2],
    ['no requestContext', {} as unknown as APIGatewayProxyEventV2],
    ['an empty context', eventWith({})],
    ['a missing sub', eventWith({ username: 'alice', groups: '[]' })],
    ['an empty username', eventWith({ sub: 'sub-1', username: '', groups: '[]' })],
    ['groups that are not JSON', eventWith({ sub: 'sub-1', username: 'alice', groups: 'admin' })],
    ['groups that are not an array of strings', eventWith({ sub: 'sub-1', username: 'alice', groups: '[1]' })],
  ])('returns 401 for %s', (_case, event) => {
    const result = getClaims(event);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(401);
    expect(JSON.parse(result.response.body as string).error).toBe('unauthorized');
  });
});

// Architecture section 3, the four group combinations.
describe('resolveRole', () => {
  it.each([
    [['admin'], 'admin'],
    [['user'], 'user'],
    [['admin', 'user'], 'admin'],
    [['user', 'admin'], 'admin'],
    [[], null],
    [['other'], null],
  ])('groups %j resolve to %s', (groups, role) => {
    expect(resolveRole(groups)).toBe(role);
  });
});

describe('requireGroup admin', () => {
  it.each([[['admin']], [['admin', 'user']]])('allows %j', (groups) => {
    expect(requireGroup(claims(groups), 'admin')).toBeUndefined();
  });

  it.each([[['user']], [[]]])('returns 403 for %j', (groups) => {
    const response = requireGroup(claims(groups), 'admin');
    expect(response?.statusCode).toBe(403);
    expect(JSON.parse(response?.body as string).error).toBe('forbidden');
  });
});
