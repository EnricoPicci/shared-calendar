import type { Role } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ToolCall } from './tool';

// The event a route's handler receives when it is called as a tool
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 8.1): the one API Gateway would have built for the
// same request, with the identity its authorizer attaches. The handler cannot tell the difference,
// so it checks the role and applies every rule exactly as it does for the web pages.

// Who the tool is run for, and the id of the request in progress, which the handler writes in its
// own log line: the line of the tool and the line of the assistant then carry the same id.
export type ToolCaller = { sub: string; username: string; role: Role; requestId: string };

const queryString = (query: Record<string, string>) => new URLSearchParams(query).toString();

/**
 * Builds the event for one call of a tool. The identity is the one of the request in progress,
 * never something Claude said: `groups` holds the person's resolved role alone, as the JSON text
 * the authorizer writes. No header is given: no token is passed around, and no handler reads one.
 */
export function toolEvent(call: ToolCall, caller: ToolCaller, now: string): APIGatewayProxyEventV2 {
  const method = call.routeKey.slice(0, call.routeKey.indexOf(' '));
  const hasQuery = call.query !== undefined && Object.keys(call.query).length > 0;
  const event = {
    version: '2.0',
    routeKey: call.routeKey,
    rawPath: call.path,
    rawQueryString: hasQuery ? queryString(call.query!) : '',
    headers: {},
    // API Gateway leaves the key out when the request has no query string.
    ...(hasQuery && { queryStringParameters: call.query }),
    pathParameters: call.pathParameters ?? {},
    ...(call.body !== undefined && { body: JSON.stringify(call.body) }),
    isBase64Encoded: false,
    requestContext: {
      accountId: 'assistant',
      apiId: 'assistant',
      authorizer: { lambda: { sub: caller.sub, username: caller.username, groups: JSON.stringify([caller.role]) } },
      domainName: 'assistant',
      domainPrefix: 'assistant',
      http: { method, path: call.path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'assistant' },
      requestId: caller.requestId,
      routeKey: call.routeKey,
      stage: '$default',
      time: now,
      timeEpoch: Date.parse(now),
    },
  };
  return event as APIGatewayProxyEventV2;
}
