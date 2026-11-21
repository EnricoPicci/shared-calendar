import { assistantTexts, type ApiErrorCode, type AssistantMessage, type AssistantReply, type Role } from '@shared-calendar/shared';
import {
  AssistantBusyError,
  endConversation as endStored,
  readConversation,
  readDailyUse,
  type Conversation,
  type MessageBody,
  type StoredMessage,
} from '../lib/assistantDb';
import type { ToolDefinition as ClaudeTool } from '../lib/anthropic';
import { coreConfig, type CoreConfig } from './config';
import { contextBlock, INSTRUCTIONS, promptVersion } from './prompt';
import { DEFINITIONS } from './tools/list';
import { proposalOf, shownProposal, takenState, type Taken } from './proposal';
import { offeredTo, toolsForClaude, type ToolDefinition } from './tools/tool';

// The part of the assistant's core that never asks Claude anything: who is speaking, the person's
// conversation as it stands, what of it a person reads, and ending it
// (docs/CONVERSATIONAL_ARCHITECTURE.md sections 4 and 6). It knows no HTTP request and no token:
// the routes' handlers give it an identity and turn what it answers into a response.

// Who is speaking, taken from the verified token of the request: the conversation is found by
// `sub`, and nobody can name another person's.
export type Identity = { sub: string; username: string; role: Role };

// What stops a request without anything being wrong in the way it was written, as the error code
// its route answers (docs/CONVERSATIONAL_ARCHITECTURE.md section 6).
export type Refusal = Extract<
  ApiErrorCode,
  'assistant_busy' | 'conversation_full' | 'nothing_to_continue' | 'proposal_not_found' | 'assistant_limit_reached' | 'assistant_unavailable' | 'assistant_budget_reached'
>;

// The status and the message of each refusal. The message is for a developer reading the answer:
// what a person reads is the fixed text of the conversation's language, chosen by the screen.
export const REFUSALS: Record<Refusal, { status: number; message: string }> = {
  assistant_busy: { status: 409, message: 'A step of this conversation is waiting or under way' },
  conversation_full: { status: 409, message: 'This conversation is full; start a new one' },
  nothing_to_continue: { status: 409, message: 'No step of this conversation is waiting' },
  proposal_not_found: { status: 404, message: 'No such proposal is waiting for an answer' },
  assistant_limit_reached: { status: 429, message: "Today's limit of messages to the assistant is reached" },
  assistant_unavailable: { status: 503, message: 'The assistant is not available at the moment' },
  assistant_budget_reached: { status: 503, message: 'The assistant has reached its spending limit' },
};

// What goes into the log line of the request besides who asked: the conversation, what came of
// the step, the token counts, the durations. Never a text of the person, of Claude or of a notice
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 10.1).
export type StepLog = { conversationId: string | null; outcome: string } & Record<string, unknown>;

export type CoreResult = { ok: true; reply: AssistantReply; log: StepLog } | { ok: false; refusal: Refusal; log: StepLog };

// The person's conversation at the start of a request, with what the request must name when it
// writes: the version read, the block about the person, the tools of the person's role as Claude
// is given them, and the mark of this deployment.
export type Current = {
  version: number;
  conversation: Conversation | null;
  messages: StoredMessage[];
  usedToday: number;
  context: string;
  tools: ClaudeTool[];
  mark: string;
};

/**
 * Reads the person's conversation and their use of the day. A conversation that started under
 * other instructions or other tools than the deployed ones is over
 * (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.3): it is given as absent, and the next message
 * starts a new one in its place. `definitions` are the tools of the deployment; only those offered
 * to the person's role are given to Claude and counted in the mark.
 */
export async function currentConversation(
  identity: Identity,
  now: string,
  config: CoreConfig,
  definitions: readonly ToolDefinition[] = DEFINITIONS,
): Promise<Current> {
  const context = contextBlock(identity, config.timeZone);
  const tools = toolsForClaude(definitions, identity.role);
  const mark = promptVersion(INSTRUCTIONS, context, tools);
  const [read, use] = await Promise.all([readConversation(identity.sub, now), readDailyUse(identity.sub, now, config.timeZone)]);
  const conversation = read.conversation?.promptVersion === mark ? read.conversation : null;
  return { version: read.version, conversation, messages: conversation ? read.messages : [], usedToday: use.messages, context, tools, mark };
}

/**
 * What a person reads of one stored message, or null for what never leaves the server
 * (docs/CONVERSATIONAL_ARCHITECTURE.md section 6): a line of the application, the results of
 * tools, an answer of Claude that holds no text. An answer that holds both a text and requests
 * for tools shows its text alone. The person's own message is the one entry of role `user` whose
 * content is a plain text; the entry that carries the results of tools has role `user` too, with
 * a list as its content.
 */
export function shown(message: StoredMessage): AssistantMessage | null {
  const { seq, at } = message;
  if (message.kind === 'notice') return { seq, from: 'notice', text: String(message.content), at };
  const entry = message.content;
  if (entry.role === 'user') return typeof entry.content === 'string' ? { seq, from: 'person', text: entry.content, at } : null;
  if (entry.role !== 'assistant' || typeof entry.content === 'string') return null;
  const text = entry.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return text.trim() === '' ? null : { seq, from: 'assistant', text, at };
}

const notNull = <T>(value: T | null): value is T => value !== null;

/**
 * The line of progress of a conversation that waits for its next step
 * (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.1), read from the conversation itself, so that
 * the route that ran a step and the route that shows the conversation say the same. It is the line
 * of the last tool Claude asked for since the person's last message, when that is a tool of the
 * person's role; with no such request (the step after the person's message is still to do), the
 * general line.
 */
export function activityLine(
  messages: readonly MessageBody[],
  definitions: readonly ToolDefinition[],
  role: Role,
  language: Conversation['language'],
): string {
  const texts = assistantTexts(language);
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.kind !== 'model') continue;
    const entry = message.content;
    if (entry.role === 'user' && typeof entry.content === 'string') break;
    if (entry.role !== 'assistant' || typeof entry.content === 'string') continue;
    const asked = entry.content.filter((block) => block.type === 'tool_use');
    if (asked.length === 0) continue;
    const last = asked[asked.length - 1]!;
    const definition = offeredTo(definitions, role).find((candidate) => candidate.name === last.name);
    return definition ? texts.reading[definition.reads] : texts.working;
  }
  return texts.working;
}

/**
 * The answer of a route: the state of the conversation, or of none, the messages to show, and the
 * conversation's proposal, waiting or settled. `activity` is the line of progress of a
 * conversation that is `working`; without one, the general line.
 *
 * A proposal a confirmation has taken is not shown as waiting, whatever is stored: the
 * conversation is shown as `working`, so that the screen offers no button for it. When the
 * confirmation that took it has stopped without saving what came of it, each change is shown with
 * the outcome `unknown`.
 */
export function replyOf(
  conversation: (Pick<Conversation, 'conversationId' | 'language' | 'status'> & Partial<Pick<Conversation, 'proposal'>>) | null,
  messages: StoredMessage[],
  remainingToday: number,
  activity?: string,
  taken: Taken = 'free',
): AssistantReply {
  const status = conversation ? (taken === 'free' ? conversation.status : 'working') : 'idle';
  const proposal = conversation?.proposal ? shownProposal(proposalOf({ proposal: conversation.proposal })!, conversation.language) : null;
  return {
    conversationId: conversation?.conversationId ?? null,
    language: conversation?.language ?? null,
    status,
    messages: messages.map(shown).filter(notNull),
    activity: conversation && status === 'working' ? (activity ?? assistantTexts(conversation.language).working) : null,
    proposal: proposal && taken === 'abandoned' ? { ...proposal, actions: proposal.actions.map(({ summary }) => ({ summary, outcome: 'unknown' as const, error: null })) } : proposal,
    remainingToday,
  };
}

/** The messages a person may still send today, never below zero. */
export const remaining = (config: CoreConfig, usedToday: number): number => Math.max(0, config.dailyMessageLimit - usedToday);

/** The whole conversation of the person as they read it, or an empty answer when there is none. */
export async function showConversation(
  identity: Identity,
  now: string,
  definitions: readonly ToolDefinition[] = DEFINITIONS,
): Promise<{ reply: AssistantReply; log: StepLog }> {
  const config = coreConfig();
  const current = await currentConversation(identity, now, config, definitions);
  const { conversation } = current;
  const activity = conversation ? activityLine(current.messages, definitions, identity.role, conversation.language) : undefined;
  return {
    reply: replyOf(conversation, current.messages, remaining(config, current.usedToday), activity, conversation ? takenState(conversation, now) : 'free'),
    log: { conversationId: current.conversation?.conversationId ?? null, outcome: 'shown' },
  };
}

// How many times ending is tried when a step of the same person is being saved at that moment.
const END_ATTEMPTS = 3;

/**
 * Ends the person's conversation, whatever its state: a waiting step or proposal goes with it.
 * Nothing to end is not an error. A write of the same person at the same moment makes the first
 * try fail; it is read and tried again, and `AssistantBusyError` leaves only if that keeps
 * happening.
 */
export async function closeConversation(identity: Identity, now: string): Promise<StepLog> {
  for (let attempt = 1; ; attempt++) {
    const read = await readConversation(identity.sub, now);
    if (read.conversation === null) return { conversationId: null, outcome: 'nothing_to_end' };
    try {
      await endStored(identity.sub, read.version);
      return { conversationId: read.conversation.conversationId, outcome: 'ended' };
    } catch (err) {
      if (!(err instanceof AssistantBusyError) || attempt === END_ATTEMPTS) throw err;
    }
  }
}
