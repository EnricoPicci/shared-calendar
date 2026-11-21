import { getClaims } from '../../../../src/lib/auth';
import { toolEvent, type ToolCaller } from '../../../../src/assistant/tools/event';
import recorded from './recorded/sam-local-events.json';

// The events in `recorded/sam-local-events.json` are what `sam local start-api` gave a function
// behind an HTTP API with a Lambda authorizer (simple responses, payload format 2.0), for
// GET /calendar?from=…&to=… and for GET /calendar/settings, with the authorizer answering alice,
// a User. The event the assistant builds is compared with them where a handler reads it.

const NOW = '2026-11-21T14:05:00.000Z';
const ALICE: ToolCaller = { sub: 'sub-alice', username: 'alice', role: 'user', requestId: recorded.withQuery.requestContext.requestId };
const QUERY = { from: '2026-11-23', to: '2026-11-29' };

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('toolEvent (8.1)', () => {
  it('builds, for a route with a query string, what API Gateway builds: every field a handler reads', () => {
    const real = recorded.withQuery;
    const built = toolEvent({ routeKey: 'GET /calendar', path: '/calendar', query: QUERY }, ALICE, NOW);

    expect(built.version).toBe(real.version);
    expect(built.routeKey).toBe(real.routeKey);
    expect(built.rawPath).toBe(real.rawPath);
    expect(built.rawQueryString).toBe(real.rawQueryString);
    expect(built.queryStringParameters).toEqual(real.queryStringParameters);
    expect(built.pathParameters).toEqual(real.pathParameters);
    expect(built.isBase64Encoded).toBe(real.isBase64Encoded);
    expect(built.requestContext.requestId).toBe(real.requestContext.requestId);
    expect(built.requestContext.routeKey).toBe(real.requestContext.routeKey);
    expect(built.requestContext.stage).toBe(real.requestContext.stage);
    expect(built.requestContext.http.method).toBe(real.requestContext.http.method);
    expect(built.requestContext.http.path).toBe(real.requestContext.http.path);
    // The identity, exactly as the authorizer attaches it: `groups` is a JSON text.
    expect((built.requestContext as unknown as typeof real.requestContext).authorizer).toEqual(real.requestContext.authorizer);
  });

  it('has no field API Gateway does not have, at the top and in the request context', () => {
    const real = recorded.withQuery;
    const built = toolEvent({ routeKey: 'GET /calendar', path: '/calendar', query: QUERY }, ALICE, NOW);
    for (const key of Object.keys(built)) expect(Object.keys(real)).toContain(key);
    for (const key of Object.keys(built.requestContext)) expect(Object.keys(real.requestContext)).toContain(key);
  });

  it('leaves the query out when there is none, as API Gateway does', () => {
    const real = recorded.withoutQuery;
    expect(real).not.toHaveProperty('queryStringParameters');
    for (const query of [undefined, {}]) {
      const built = toolEvent({ routeKey: 'GET /calendar/settings', path: '/calendar/settings', query }, ALICE, NOW);
      expect(built).not.toHaveProperty('queryStringParameters');
      expect(built.rawQueryString).toBe(real.rawQueryString);
      expect(built.routeKey).toBe(real.routeKey);
      expect(built.rawPath).toBe(real.rawPath);
    }
  });

  it("gives the handlers' own reading of the caller the same answer as the recorded event", () => {
    const built = toolEvent({ routeKey: 'GET /calendar', path: '/calendar', query: QUERY }, ALICE, NOW);
    const fromBuilt = getClaims(built);
    expect(fromBuilt).toEqual(getClaims(recorded.withQuery as never));
    expect(fromBuilt).toEqual({ ok: true, value: { sub: 'sub-alice', username: 'alice', groups: ['user'] } });
  });

  it('names the role resolved for the request, the Administrator too, and carries no header', () => {
    const built = toolEvent({ routeKey: 'GET /calendar/types', path: '/calendar/types' }, { ...ALICE, username: 'admin', sub: 'sub-admin', role: 'admin' }, NOW);
    expect(getClaims(built)).toEqual({ ok: true, value: { sub: 'sub-admin', username: 'admin', groups: ['admin'] } });
    expect(built.headers).toEqual({});
  });

  it('carries the path parameters and a body as JSON text, for the routes that have them', () => {
    const built = toolEvent(
      { routeKey: 'POST /calendar/appointments/{appointmentId}/cancel', path: '/calendar/appointments/01A/cancel', pathParameters: { appointmentId: '01A' }, body: { a: 1 } },
      ALICE,
      NOW,
    );
    expect(built.pathParameters).toEqual({ appointmentId: '01A' });
    expect(built.body).toBe('{"a":1}');
    expect(built.requestContext.http.method).toBe('POST');
    expect(built.requestContext.timeEpoch).toBe(Date.parse(NOW));
  });
});
