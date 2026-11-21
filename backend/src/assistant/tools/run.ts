import type { AssistantReadKind } from '@shared-calendar/shared';
import { z } from 'zod';
import type { ToolRequest } from '../../lib/anthropic';
import { toolEvent, type ToolCaller } from './event';
import { cappedJson } from './result';
import { forClaude, type Tool, type ToolContext } from './tool';

// Running one read Claude asked for (docs/CONVERSATIONAL_ARCHITECTURE.md sections 7.4 and 8): the
// request is checked, the route's handler is called with the person's identity, and its answer
// becomes the result Claude gets. Whatever happens, Claude gets a result for the request: a
// request without its result would make the conversation one Anthropic no longer accepts.

// The result of one tool request, as the Messages API takes it back.
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: true };

// Why a request was answered without calling any handler.
export type NotRun = 'unknown_tool' | 'not_offered' | 'not_a_read' | 'invalid_input';

// What the log line says of one tool request: the tool's name with the status its route answered
// and how long it took, or why it was not run. Never the input and never the result. A name Claude
// made up is not a tool's name and is not logged.
export type ToolLog = { name: string; status: number; ms: number } | { name: string | null; notRun: NotRun };

export type ToolOutcome = { result: ToolResultBlock; log: ToolLog; reads: AssistantReadKind | null };

const errorResult = (id: string, error: string, message: string): ToolResultBlock => ({
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
 * Runs one read tool for the person of the request in progress. A tool that does not exist, one
 * not offered to the person's role, one that is not a read, and an input its schema refuses are
 * answered to Claude with an error result that says what was expected, and no handler is called.
 * A refusal of the route is a result too: its error code and message, marked as an error.
 */
export async function runRead(request: ToolRequest, tools: readonly Tool[], caller: ToolCaller, context: ToolContext, now: string): Promise<ToolOutcome> {
  const offered = tools.filter((candidate) => candidate.definition.roles.includes(caller.role));
  const names = offered.map((candidate) => candidate.definition.name).join(', ');
  const found = tools.find((candidate) => candidate.definition.name === request.name);
  const notRun = (name: string | null, why: NotRun, message: string): ToolOutcome => ({
    result: errorResult(request.id, why, message),
    log: { name, notRun: why },
    reads: null,
  });

  // A tool of another role is answered like one that does not exist: its name is not confirmed.
  if (!found || !offered.includes(found)) {
    return notRun(found ? found.definition.name : null, found ? 'not_offered' : 'unknown_tool', `There is no tool with this name. The tools are: ${names}.`);
  }
  const { definition } = found;
  if (definition.kind !== 'read') return notRun(definition.name, 'not_a_read', 'This tool cannot be used here.');

  const input = definition.input(caller.role).safeParse(request.input);
  if (!input.success) {
    const problems = input.error.issues.map((issue) => `${issue.path.join('.') || 'the input'}: ${issue.message}`).join('; ');
    const expected = JSON.stringify(forClaude(definition, caller.role).input_schema);
    return notRun(definition.name, 'invalid_input', `The input of ${definition.name} is not valid (${problems}). It must match this JSON Schema: ${expected}`);
  }

  const started = Date.now();
  const log = (status: number): ToolLog => ({ name: definition.name, status, ms: Date.now() - started });
  let status: number;
  let body: unknown;
  try {
    const response = await found.toHandler.handler(toolEvent(found.toHandler.request(input.data, context), caller, now));
    status = response.statusCode ?? 500;
    body = parsed(response.body);
  } catch {
    // A handler answers its own failures; one that throws all the same is told to Claude as a failure of the route.
    return { result: errorResult(request.id, 'internal_error', 'The calendar could not be read.'), log: log(500), reads: definition.reads };
  }
  if (status < 200 || status > 299) {
    const refusal = z.object({ error: z.string(), message: z.string() }).safeParse(body);
    const { error, message } = refusal.success ? refusal.data : { error: 'internal_error', message: 'The calendar could not be read.' };
    return { result: errorResult(request.id, error, message), log: log(status), reads: definition.reads };
  }
  return {
    result: { type: 'tool_result', tool_use_id: request.id, content: cappedJson(found.toModel(body, context)) },
    log: log(status),
    reads: definition.reads,
  };
}
