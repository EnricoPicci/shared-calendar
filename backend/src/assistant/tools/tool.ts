import type { AssistantReadKind, Role } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import type { ToolDefinition as ClaudeTool } from '../../lib/anthropic';
import type { HttpResponse } from '../../lib/http';

// What a tool of the assistant is (docs/CONVERSATIONAL_ARCHITECTURE.md section 8.2). A tool stands
// for one route of the calendar and has four parts: its definition, what turns Claude's input
// into the route's request, what turns the route's answer into a small result for Claude, and,
// for a tool that changes the calendar, what its confirmation shows. A tool holds no rule of the
// calendar: the route's handler checks the role and everything else, as it does for the web pages.

// A tool that only reads is run at once. A tool that changes the calendar never is: it becomes a
// proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5).
export type ToolKind = 'read' | 'change';

// The first part: what Claude and the core know of a tool without running anything. It imports no
// handler, so the functions that never run a tool can read it without carrying the calendar's code.
export type ToolDefinition = {
  name: string;
  // For Claude: what the tool gives and when to use it.
  description: string;
  kind: ToolKind;
  // The roles the tool is offered to. A request of another role does not name it, and the core
  // refuses it before any handler is called.
  roles: readonly Role[];
  // The input Claude must give, for the role of the person: where a route takes more from the
  // Administrator, the Administrator's schema offers more. The same schema gives Claude its JSON
  // Schema and checks what Claude sent.
  input: (role: Role) => z.ZodType;
  // What the tool looks at, which chooses the line of progress shown after it ran.
  reads: AssistantReadKind;
};

// What a tool needs to know of the request in progress: the calendar's time zone, in which Claude
// gives and gets every date and time, and the role of the person.
export type ToolContext = { timeZone: string; role: Role };

// The route's request as a tool asks for it; `event.ts` makes of it the event API Gateway would
// have built. `routeKey` is the route as the template names it ("GET /calendar"), `path` the
// address with its parameters filled in.
export type ToolCall = {
  routeKey: string;
  path: string;
  query?: Record<string, string>;
  pathParameters?: Record<string, string>;
  body?: unknown;
};

// A route's handler, as every file of src/handlers exports it.
export type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<HttpResponse>;

// What a tool gives Claude of a route's 2xx answer: a few fixed fields and, when the answer is a
// list, its items under one name, so that a result too long can be cut at a whole item.
export type ToolResult = { fields: Record<string, unknown>; list?: { name: string; items: unknown[] } };

// The fourth part, of a change tool only. No tool has it yet: the type keeps its place, so that a
// change tool is added without touching what a tool is.
export type ToolConfirmation = Record<string, never>;

// `Input` is what the tool's schema gives once it accepted Claude's input. A tool's file writes
// its parts as a plain object, not through a helper function: the bundler then leaves the tool,
// and with it the calendar's handler, out of the functions that only read the definitions.
export type Tool<Input = unknown> = {
  definition: ToolDefinition;
  toHandler: {
    // The exported handler of the tool's route, called inside the function that runs the tool.
    handler: RouteHandler;
    request: (input: Input, context: ToolContext) => ToolCall;
  };
  // `body` is the parsed body of a 2xx answer of the route.
  toModel: (body: unknown, context: ToolContext) => ToolResult;
  confirmation?: ToolConfirmation;
};

/** The definitions offered to a role, in the order of the list. */
export function offeredTo(definitions: readonly ToolDefinition[], role: Role): ToolDefinition[] {
  return definitions.filter((definition) => definition.roles.includes(role));
}

/**
 * A definition as the Messages API takes a tool: its name, its description and the JSON Schema of
 * its input, made from the same `zod` schema that then checks what Claude sent. The schema's
 * `$schema` line is left out: the API does not need it.
 */
export function forClaude(definition: ToolDefinition, role: Role): ClaudeTool {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(definition.input(role)) };
  delete schema.$schema;
  return { name: definition.name, description: definition.description, input_schema: schema as ClaudeTool['input_schema'] };
}

/** The tools a request to Claude names for a role. */
export function toolsForClaude(definitions: readonly ToolDefinition[], role: Role): ClaudeTool[] {
  return offeredTo(definitions, role).map((definition) => forClaude(definition, role));
}
