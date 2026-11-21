import type { ApiErrorCode } from '@shared-calendar/shared';
import { assistantModel, STEP_TIMEOUT_MS } from '../lib/anthropic';
import { AssistantBusyError, saveStep, takeProposal, type Conversation, type NewMessage } from '../lib/assistantDb';
import { coreConfig } from './config';
import { activityLine, currentConversation, remaining, replyOf, type CoreResult, type Identity } from './conversation';
import { AFTER_CLAUDE_MS, runStep, type RequestInfo } from './exchange';
import { DONE, notRunResult, proposalOf, settlement, type Proposal, type ProposedChange } from './proposal';
import { CHANGE_HANDLERS } from './tools/changeHandlers';
import { TOOLS } from './tools/list';
import { cappedJson } from './tools/result';
import { callRoute, errorResult, refusalOf, succeeded } from './tools/run';
import type { RouteHandler, Tool, ToolResult, ToolResultBlock } from './tools/tool';

// The result of a change that was made, as Claude gets it: that the person confirmed and the
// change was made, then what the route answered.
const made = (result: ToolResult): ToolResult => ({ ...result, fields: { ...DONE, ...result.fields } });

// Confirming a proposal (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5): the part of the core
// behind POST /assistant/proposals/{proposalId}/confirm, and the only code of the assistant that
// calls the handler of a route that changes the calendar. It is reached by the person pressing
// the button, never by an answer of Claude and never by a text anybody typed.

// What the log line says of one change that was run: the tool, the status its route answered and
// how long it took. Never what the route was sent or what it answered.
type ChangeLog = { name: string; status: number; ms: number };

/**
 * The person pressed the button to confirm. In order:
 *
 * 1. The proposal must be the one waiting. It is taken with a conditional write: of two
 *    confirmations at once one takes it, and the other finds no such proposal.
 * 2. Each change is run by calling the handler of its route with the identity of this request,
 *    with exactly what the proposal stored. The route checks everything again: a slot taken in
 *    the meantime is refused, and the refusal is the change's outcome.
 * 3. The outcomes are saved before Claude is asked anything: the entry that answers Claude's
 *    request, with the results that were kept back, and the proposal with each outcome.
 * 4. Claude is asked for the closing words, as one more step. When it cannot be asked, the
 *    changes stay made and saved and the conversation waits for `continue`; so it does when the
 *    time the function has left no longer holds a step.
 *
 * It is not a message of the day: nothing is counted.
 */
export async function confirmProposal(
  identity: Identity,
  proposalId: string,
  now: string,
  request: RequestInfo,
  tools: readonly Tool[] = TOOLS,
  handlers: Readonly<Record<string, RouteHandler>> = CHANGE_HANDLERS,
): Promise<CoreResult> {
  const config = coreConfig();
  const model = assistantModel();
  const definitions = tools.map((tool) => tool.definition);
  const current = await currentConversation(identity, now, config, definitions);
  const { conversation } = current;
  const conversationId = conversation?.conversationId ?? null;
  const notFound: CoreResult = { ok: false, refusal: 'proposal_not_found', log: { conversationId, outcome: 'proposal_not_found' } };
  if (!conversation || conversation.status !== 'awaiting_confirmation') return notFound;
  const taken = await takeProposal(identity.sub, conversation, proposalId, now);
  if (!taken) return notFound;

  const waiting = proposalOf(taken)!;
  const caller = { ...identity, requestId: request.requestId };
  const context = { timeZone: config.timeZone, role: identity.role };
  const results: ToolResultBlock[] = [];
  const changes: ProposedChange[] = [];
  const ran: ChangeLog[] = [];
  for (const change of waiting.changes) {
    const started = Date.now();
    const tool = tools.find((candidate) => candidate.definition.name === change.tool);
    const handler = handlers[change.tool];
    // A stored change always names a tool of this deployment: a conversation of another one is
    // over before it gets here. Should one not, nothing is run and its outcome is unknown.
    const answer = tool && handler ? await callRoute(handler, change.call, caller, now) : { status: 500, body: null };
    ran.push({ name: change.tool, status: answer.status, ms: Date.now() - started });
    if (tool && succeeded(answer)) {
      results.push({ type: 'tool_result', tool_use_id: change.toolUseId, content: cappedJson(made(tool.toModel(answer.body, context))) });
      changes.push({ ...change, outcome: 'done', error: null });
    } else if (answer.status >= 500) {
      // The route failed, or its handler threw: whether the change was made is not known.
      results.push(notRunResult(change.toolUseId, 'unknown'));
      changes.push({ ...change, outcome: 'unknown', error: null });
    } else {
      const refusal = refusalOf(answer, 'The change was refused.');
      results.push(errorResult(change.toolUseId, refusal.error, refusal.message));
      changes.push({ ...change, outcome: 'refused', error: refusal.error as ApiErrorCode });
    }
  }

  const settled: Proposal = { ...waiting, changes };
  const messages: NewMessage[] = [settlement(waiting, results)];
  const log = { conversationId, proposalId, changes: ran };
  let saved: Conversation;
  try {
    saved = await saveStep(identity.sub, taken, { messages, status: 'working', proposal: settled, timeZone: config.timeZone }, now);
  } catch (err) {
    // The conversation was ended meanwhile: the changes were run and there is no conversation
    // left to record them in.
    if (!(err instanceof AssistantBusyError)) throw err;
    return { ok: false, refusal: 'assistant_busy', log: { ...log, outcome: 'outcome_not_saved' } };
  }

  const firstSeq = saved.nextSeq - messages.length;
  const stored = messages.map((message, i) => ({ ...message, seq: firstSeq + i, at: now }));
  const after = { ...current, conversation: saved, messages: [...current.messages, ...stored] };
  // With too little time left for a step, Claude is not asked: the function could be stopped in
  // the middle of it. The outcomes are saved, and `continue` gets the closing words.
  if (request.remainingMs !== null && request.remainingMs() < STEP_TIMEOUT_MS + AFTER_CLAUDE_MS) {
    const activity = activityLine(after.messages, definitions, identity.role, saved.language);
    return {
      ok: true,
      reply: replyOf({ ...saved, proposal: settled }, [], remaining(config, current.usedToday), activity),
      log: { ...log, outcome: 'closing_words_left_to_continue' },
    };
  }
  const closing = await runStep({ identity, current: after, language: saved.language, added: [], asking: null, ask: true, model, now, config, request, tools, proposal: settled, dropped: false });
  return { ...closing, log: { ...closing.log, ...log } };
}
