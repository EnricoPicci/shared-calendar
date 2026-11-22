import type { AssistantReadKind, AssistantTexts } from '@shared-calendar/shared';
import { z } from 'zod';
import type { ToolRequest } from '../../lib/anthropic';
import { toolEvent, type ToolCaller } from './event';
import { cappedJson } from './result';
import {
  forClaude,
  isChange,
  type CallRoute,
  type ChangeTool,
  type ReadTool,
  type RouteAnswer,
  type RouteHandler,
  type Tool,
  type ToolCall,
  type ToolContext,
  type ToolResultBlock,
} from './tool';

// Answering one tool request of Claude (docs/CONVERSATIONAL_ARCHITECTURE.md sections 7.4 and 8):
// the request is checked, then a read is run by calling its route's handler with the person's
// identity, and a change is not run: the facts its proposal shows are read. Whatever happens,
// Claude gets a result for the request: a request without its result would make the conversation
// one Anthropic no longer accepts.

export type { ToolResultBlock } from './tool';

// Why a request was answered without calling the handler of its route.
export type NotRun = 'unknown_tool' | 'not_offered' | 'not_a_read' | 'invalid_input' | 'too_many_changes' | 'not_possible' | 'same_thing_twice' | 'not_proposed';

// What the log line says of one tool request: the tool's name with the status its route answered
// and how long it took, or why it was not run. For a change that was proposed, the status and the
// time are those of the read of its facts. Never the input and never the result. A name Claude
// made up is not a tool's name and is not logged.
export type ToolLog = { name: string; status: number; ms: number; proposed?: true } | { name: string | null; notRun: NotRun; status?: number; ms?: number };

export type ToolOutcome = { result: ToolResultBlock; log: ToolLog; reads: AssistantReadKind | null };

export const errorResult = (id: string, error: string, message: string): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: id,
  content: JSON.stringify({ error, message }),
  is_error: true,
});

const parsed = (body: string | undefined): unknown => {
  try {
    return JSON.parse(body ?? '');
  } catch {
    return null;
  }
};

/**
 * Calls the handler of a route inside this function, with the event API Gateway would have built
 * for the person of the request in progress. A handler answers its own failures; one that throws
 * all the same is given as a 500 without a body.
 */
export async function callRoute(handler: RouteHandler, call: ToolCall, caller: ToolCaller, now: string): Promise<RouteAnswer> {
  try {
    const response = await handler(toolEvent(call, caller, now));
    return { status: response.statusCode ?? 500, body: parsed(response.body) };
  } catch {
    return { status: 500, body: null };
  }
}

/** Whether a route answered with a success. */
export const succeeded = (answer: RouteAnswer): boolean => answer.status >= 200 && answer.status <= 299;

/**
 * The error code and the message of a route's refusal, as its body gives them; a refusal without
 * that shape, a handler that threw among them, is told as a failure of the route.
 */
export function refusalOf(answer: RouteAnswer, failure: string): { error: string; message: string } {
  const refusal = z.object({ error: z.string(), message: z.string() }).safeParse(answer.body);
  return refusal.success ? refusal.data : { error: 'internal_error', message: failure };
}

// A request that passed the checks every request gets: the tool it names, and the input its schema gave.
export type Checked = { ok: true; tool: Tool; input: unknown } | { ok: false; outcome: ToolOutcome };

/**
 * Checks one request of Claude before anything is called: the tool must exist, be offered to the
 * person's role, and its input must be one its schema accepts. Each failure is answered to Claude
 * with an error result that says what was expected.
 */
export function checkRequest(request: ToolRequest, tools: readonly Tool[], caller: ToolCaller): Checked {
  const offered = tools.filter((candidate) => candidate.definition.roles.includes(caller.role));
  const names = offered.map((candidate) => candidate.definition.name).join(', ');
  const found = tools.find((candidate) => candidate.definition.name === request.name);

  // A tool of another role is answered like one that does not exist, code and sentence alike:
  // its name is not confirmed. Only the log line tells the two apart.
  if (!found || !offered.includes(found)) {
    const log: ToolLog = found ? { name: found.definition.name, notRun: 'not_offered' } : { name: null, notRun: 'unknown_tool' };
    return { ok: false, outcome: { result: errorResult(request.id, 'unknown_tool', `There is no tool with this name. The tools are: ${names}.`), log, reads: null } };
  }
  const { definition } = found;
  const input = definition.input(caller.role).safeParse(request.input);
  if (!input.success) {
    const problems = input.error.issues.map((issue) => `${issue.path.join('.') || 'the input'}: ${issue.message}`).join('; ');
    const expected = JSON.stringify(forClaude(definition, caller.role).input_schema);
    return {
      ok: false,
      outcome: notRun(request.id, definition.name, 'invalid_input', `The input of ${definition.name} is not valid (${problems}). It must match this JSON Schema: ${expected}`),
    };
  }
  return { ok: true, tool: found, input: input.data };
}

/** The answer to a request whose route's handler is not called: an error result with the reason. */
export function notRun(id: string, name: string | null, why: NotRun, message: string): ToolOutcome {
  return { result: errorResult(id, why, message), log: { name, notRun: why }, reads: null };
}

/**
 * Runs a read whose request passed `checkRequest`, for the person of the request in progress. A
 * refusal of the route is a result too: its error code and message, marked as an error.
 */
export async function runChecked(id: string, tool: ReadTool, input: unknown, caller: ToolCaller, context: ToolContext, now: string): Promise<ToolOutcome> {
  const { definition } = tool;
  const started = Date.now();
  const { handler, request, also } = tool.toHandler;
  const first = await callRoute(handler, request(input, context), caller, now);
  // The second route is asked only when the first answered: the status of the log line is that
  // of the last route called.
  const second = also && succeeded(first) ? await callRoute(also.handler, also.call, caller, now) : null;
  const answer = second ?? first;
  const log: ToolLog = { name: definition.name, status: answer.status, ms: Date.now() - started };
  if (!succeeded(answer)) {
    const { error, message } = refusalOf(answer, 'The calendar could not be read.');
    return { result: errorResult(id, error, message), log, reads: definition.reads };
  }
  return { result: { type: 'tool_result', tool_use_id: id, content: cappedJson(tool.toModel(first.body, context, second?.body)) }, log, reads: definition.reads };
}

/**
 * Runs one read tool for the person of the request in progress. A tool that does not exist, one
 * not offered to the person's role, one that is not a read, and an input its schema refuses are
 * answered to Claude with an error result that says what was expected, and no handler is called.
 */
export async function runRead(request: ToolRequest, tools: readonly Tool[], caller: ToolCaller, context: ToolContext, now: string): Promise<ToolOutcome> {
  const checked = checkRequest(request, tools, caller);
  if (!checked.ok) return checked.outcome;
  if (isChange(checked.tool)) return notRun(request.id, checked.tool.definition.name, 'not_a_read', 'This tool cannot be used here.');
  return runChecked(request.id, checked.tool as ReadTool, checked.input, caller, context, now);
}

/** Whether a request names a tool that changes the calendar and is offered to the person's role. */
export function asksForChange(request: ToolRequest, tools: readonly Tool[], caller: ToolCaller): boolean {
  return tools.some((tool) => tool.definition.name === request.name && isChange(tool) && tool.definition.roles.includes(caller.role));
}

// A change that can be proposed: the tool, what its route will be sent at the confirmation, and
// the server's own words for it in the conversation's language.
// `subjects` is what the change acts on, as its tool names it.
export type Proposable = { ok: true; tool: string; call: ToolCall; summary: string; subjects: string[]; log: ToolLog } | { ok: false; outcome: ToolOutcome };

// The answers of the read routes the confirmations of one answer of Claude have asked for, by
// what was asked: the changes of one answer are worked out on one reading of the calendar, and a
// route several of them need is called once.
export type FactsRead = Map<string, Promise<RouteAnswer>>;

/**
 * Answers a request for a change without running it: the input is checked, then the facts the
 * proposal shows are read through a route that only reads, with the person's identity, and the
 * change is worded with the fixed text of the conversation's language. When the input is wrong,
 * or the facts cannot be read or say the change cannot be made, Claude gets an error result with
 * the reason and nothing is proposed. `facts` holds what the confirmations of the same answer have
 * read already.
 */
export async function proposeChange(
  request: ToolRequest,
  tools: readonly Tool[],
  caller: ToolCaller,
  context: ToolContext,
  texts: AssistantTexts,
  now: string,
  facts: FactsRead = new Map(),
): Promise<Proposable> {
  const checked = checkRequest(request, tools, caller);
  if (!checked.ok) return { ok: false, outcome: checked.outcome };
  const tool = checked.tool as ChangeTool;
  const { name, reads } = tool.definition;
  const started = Date.now();
  // The status of the last route the confirmation called, for the log line.
  let status = 0;
  const route: CallRoute = async (handler, call) => {
    const key = JSON.stringify(call);
    const asked = facts.get(key) ?? callRoute(handler, call, caller, now);
    facts.set(key, asked);
    const answer = await asked;
    status = answer.status;
    return answer;
  };
  const read = await tool.confirmation.read(checked.input, context, route);
  const ms = Date.now() - started;
  if (!read.ok) {
    return { ok: false, outcome: { result: errorResult(request.id, read.error, read.message), log: { name, notRun: 'not_possible', status, ms }, reads } };
  }
  return { ok: true, tool: name, call: read.call, summary: tool.confirmation.summary(texts, read.facts), subjects: read.subjects ?? [], log: { name, status, ms, proposed: true } };
}
