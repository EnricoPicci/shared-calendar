import type { AssistantReadKind, AssistantTexts, Role } from '@shared-calendar/shared';
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
  // What the description adds for the Administrator, where the tool takes more from that role:
  // a User's request to Claude does not hold it.
  descriptionForAdmin?: string;
  kind: ToolKind;
  // The roles the tool is offered to. A request of another role does not name it, and the core
  // refuses it before any handler is called.
  roles: readonly Role[];
  // The input Claude must give, for the role of the person: where a route takes more from the
  // Administrator, the Administrator's schema offers more. The same schema gives Claude its JSON
  // Schema and checks what Claude sent.
  input: (role: Role) => z.ZodType;
  // What the tool looks at: for a read, it chooses the line of progress shown after it ran; for a
  // change, it is what its confirmation reads.
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

// What a tool gives Claude of a route's answer: a few fixed fields and, when the answer is a
// list, its items under one name, so that a result too long can be cut at a whole item. `rest`
// tells Claude how to get the items a cut left out, where asking for a shorter period is not it.
export type ToolResult = { fields: Record<string, unknown>; list?: { name: string; items: unknown[]; rest?: string } };

// The result of one tool request, as the Messages API takes it back.
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: true };

// What a route's handler answered when it was called in-process: its status and its parsed body,
// null when the body is not JSON. A handler that threw is given as a 500 without a body.
export type RouteAnswer = { status: number; body: unknown };

// How a tool's confirmation calls a route: the core gives it this function, which builds the
// event with the identity of the person of the request in progress.
export type CallRoute = (handler: RouteHandler, call: ToolCall) => Promise<RouteAnswer>;

// What reading the facts of a change gives. When the change can be proposed: the request its route
// will be sent at the confirmation, exactly, and the facts the proposal shows. When it cannot (the
// facts could not be read, or they say the change cannot be made): a code and a sentence for
// Claude, and nothing is proposed. `subjects` names what the change acts on (an appointment, a
// type): two changes of one answer of Claude that share a subject are not proposed together, since
// the second would be refused once the first was made. `place` is the place a booking or a move
// takes in a slot, which is counted instead (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 4).
export type ConfirmationRead<Facts> = { ok: true; call: ToolCall; facts: Facts; subjects?: string[]; place?: Place } | { ok: false; error: string; message: string };

// The place a booking or a move takes in a slot: the slot, by its start; the places it had left
// when the calendar was read; who takes the place (the User's username, or "" for the person
// asking, a User); and whether the Administrator asked to go over the capacity, which takes no
// place from the others (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
export type Place = { slot: string; left: number; who: string; overbook: boolean };

// The fourth part, of a change tool only (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule
// 2): it reads the facts a proposal shows, through the handler of a route that only reads, and
// names the fixed text that words them. Nothing of what Claude wrote reaches the proposal but the
// checked input.
export type ToolConfirmation<Input, Facts> = {
  read: (input: Input, context: ToolContext, route: CallRoute) => Promise<ConfirmationRead<Facts>>;
  summary: (texts: AssistantTexts, facts: Facts) => string;
};

// `Input` is what the tool's schema gives once it accepted Claude's input. A tool's file writes
// its parts as a plain object, not through a helper function: the bundler then leaves the tool,
// and with it the calendar's handler, out of the functions that only read the definitions.

// A tool that only reads: it is run at once, by calling the handler of its route.
export type ReadTool<Input = unknown> = {
  definition: ToolDefinition;
  toHandler: {
    // The exported handler of the tool's route, called inside the function that runs the tool.
    handler: RouteHandler;
    request: (input: Input, context: ToolContext) => ToolCall;
    // A second route the result needs, called after the first with the same identity: its answer
    // gives the names the first route's answer only has the ids of.
    also?: { handler: RouteHandler; call: ToolCall };
  };
  // `body` is the parsed body of a 2xx answer of the route, `also` that of the second route.
  toModel: (body: unknown, context: ToolContext, also?: unknown) => ToolResult;
};

// A tool that changes the calendar. It does not hold the handler of its route: the functions that
// build a proposal must not carry the code that changes the calendar, so the handlers of the
// change routes are in a module of their own, `changeHandlers.ts`, which only the confirmation
// imports. What the route will be sent comes from `confirmation.read`.
export type ChangeTool<Input = unknown, Facts = unknown> = {
  definition: ToolDefinition;
  confirmation: ToolConfirmation<Input, Facts>;
  // `body` is the parsed body of the 2xx answer the change route gave at the confirmation. The
  // third argument is never given to a change: it is here so that both shapes of tool turn an
  // answer into a result with one signature.
  toModel: (body: unknown, context: ToolContext, also?: unknown) => ToolResult;
};

export type Tool<Input = unknown> = ReadTool<Input> | ChangeTool<Input>;

/** Whether a tool is one that changes the calendar. */
export const isChange = (tool: Tool): tool is ChangeTool => tool.definition.kind === 'change';

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
  const description = definition.description + (role === 'admin' && definition.descriptionForAdmin ? ` ${definition.descriptionForAdmin}` : '');
  return { name: definition.name, description, input_schema: schema as ClaudeTool['input_schema'] };
}

/** The tools a request to Claude names for a role. */
export function toolsForClaude(definitions: readonly ToolDefinition[], role: Role): ClaudeTool[] {
  return offeredTo(definitions, role).map((definition) => forClaude(definition, role));
}
