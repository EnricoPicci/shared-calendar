import { ASSISTANT_LIMITS, assistantTexts, type AssistantLanguage, type AssistantStatus } from '@shared-calendar/shared';
import { askLanguage, askStep, assistantModel, STEP_TIMEOUT_MS, type ConversationEntry, type StepAnswer, type TokenCounts } from '../lib/anthropic';
import { AssistantBusyError, endConversation as endStored, saveStep, startConversation, type Conversation, type NewMessage } from '../lib/assistantDb';
import { coreConfig, type CoreConfig } from './config';
import { activityLine, currentConversation, remaining, replyOf, type CoreResult, type Current, type Identity, type Refusal, type StepLog } from './conversation';
import { INSTRUCTIONS, timeLine } from './prompt';
import { TOOLS } from './tools/list';
import { runRead, type ToolLog } from './tools/run';
import type { Tool } from './tools/tool';

// The part of the assistant's core that asks Claude (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.6): what a new message of the person adds to the conversation, then one step, which is one
// request to Claude, the reads Claude asked for, and one write of everything that came of it.
// `continue` is the same step with nothing added.

// What the core needs of the request in progress besides who sent it: its id, which a tool's
// handler writes in its own log line, and how long the function may still run. `remainingMs` is
// null where that is not known; nothing is then decided on it.
export type RequestInfo = { requestId: string; remainingMs: (() => number) | null };
const UNKNOWN_REQUEST: RequestInfo = { requestId: 'unknown', remainingMs: null };

// What a step may take after Claude answered: the reads Claude asked for and the write.
const AFTER_CLAUDE_MS = 2_000;

// The token counts as a log line carries them. The names hold no "token": the logger blanks every
// field whose name does.
const counts = (usage: TokenCounts) => ({ input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens });
// Everything Anthropic counted as input, for the person's use of the day.
const inputOf = (usage: TokenCounts | null) => (usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : 0);

const notice = (text: string): NewMessage => ({ kind: 'notice', content: text });
const entriesOf = (messages: { kind: string; content: unknown }[]) =>
  messages.filter((message) => message.kind === 'model').map((message) => message.content as ConversationEntry);

// The answers of Claude the conversation holds since the person's last message: how many requests
// to Claude that message has taken so far. Counted from the conversation as stored, so the count
// holds across the requests of an exchange and across containers.
function answersSinceThePerson(entries: ConversationEntry[]): number {
  let answers = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.role === 'user' && typeof entry.content === 'string') break;
    if (entry.role === 'assistant') answers++;
  }
  return answers;
}

/**
 * A new message of the person. In order: the conversation must be waiting for the person, the
 * person must have messages left today, and the conversation must have room. The first message of
 * a conversation is first shown to Claude alone, to ask which supported language it is written
 * in; that language is the conversation's for good. Then the message, the line with the time now
 * and the language, and one step.
 *
 * When the language question took so long that a step no longer fits in the time the function
 * has left, the message is saved with its language and the step is left to `continue`: asking
 * Claude a second time could get the function stopped with nothing saved.
 */
export async function sendMessage(identity: Identity, text: string, now: string, request: RequestInfo = UNKNOWN_REQUEST, tools: readonly Tool[] = TOOLS): Promise<CoreResult> {
  const config = coreConfig();
  const model = assistantModel();
  const current = await currentConversation(identity, now, config, tools.map((tool) => tool.definition));
  const { conversation } = current;
  const conversationId = conversation?.conversationId ?? null;

  if (conversation && conversation.status !== 'idle') return { ok: false, refusal: 'assistant_busy', log: { conversationId, outcome: 'busy' } };
  if (current.usedToday >= config.dailyMessageLimit) {
    return { ok: false, refusal: 'assistant_limit_reached', log: { conversationId, outcome: 'daily_limit' } };
  }
  if (conversation && (conversation.messageCount >= ASSISTANT_LIMITS.messagesPerConversation || conversation.storedBytes >= ASSISTANT_LIMITS.conversationBytes)) {
    return { ok: false, refusal: 'conversation_full', log: { conversationId, outcome: 'conversation_full' } };
  }

  let language = conversation?.language;
  let asking: { usage: TokenCounts; ms: number } | null = null;
  if (!language) {
    const started = Date.now();
    const asked = await askLanguage(text, now);
    // Without a language there is no conversation to save the message in: nothing is written, and
    // the person sends the message again.
    if (asked.kind !== 'language') {
      return {
        ok: false,
        refusal: asked.kind === 'budget_reached' ? 'assistant_budget_reached' : 'assistant_unavailable',
        log: { conversationId, outcome: `language_${asked.kind}`, ...(asked.kind === 'unavailable' && { reason: asked.reason }), model, languageMs: Date.now() - started },
      };
    }
    language = asked.language;
    asking = { usage: asked.usage, ms: Date.now() - started };
  }

  const added: NewMessage[] = [
    { kind: 'model', content: { role: 'user', content: text }, fromPerson: true },
    { kind: 'model', content: { role: 'system', content: timeLine(now, config.timeZone, language) } },
  ];
  // Only a request that asked the language question has spent time on Claude already.
  const room = asking !== null && request.remainingMs !== null ? request.remainingMs() : Infinity;
  const ask = room >= STEP_TIMEOUT_MS + AFTER_CLAUDE_MS;
  return runStep({ identity, current, language, added, asking, ask, model, now, config, request, tools });
}

/**
 * The next step of a conversation that waits for one: after a read, whose results Claude has not
 * seen yet, and after a step that could not be done because Claude could not be asked. Nothing is
 * added to the conversation and nothing is counted for the day: the person's message was counted
 * when it was saved, so the daily limit does not stop an exchange half-way.
 */
export async function continueExchange(identity: Identity, now: string, request: RequestInfo = UNKNOWN_REQUEST, tools: readonly Tool[] = TOOLS): Promise<CoreResult> {
  const config = coreConfig();
  const model = assistantModel();
  const current = await currentConversation(identity, now, config, tools.map((tool) => tool.definition));
  const { conversation } = current;
  if (!conversation || conversation.status !== 'working') {
    return { ok: false, refusal: 'nothing_to_continue', log: { conversationId: conversation?.conversationId ?? null, outcome: 'nothing_to_continue' } };
  }
  return runStep({ identity, current, language: conversation.language, added: [], asking: null, ask: true, model, now, config, request, tools });
}

type StepInput = {
  identity: Identity;
  current: Current;
  language: AssistantLanguage;
  // What the entry adds to the conversation before Claude is asked.
  added: NewMessage[];
  // The language question, when this request asked it: its token counts and how long it took.
  asking: { usage: TokenCounts; ms: number } | null;
  // False when the step is left to `continue`: the additions are saved and Claude is not asked.
  ask: boolean;
  model: string;
  now: string;
  config: CoreConfig;
  request: RequestInfo;
  tools: readonly Tool[];
};

/**
 * One step: asks Claude with the stored conversation and what the entry added, runs the reads
 * Claude asked for, and saves the additions and everything that came back in one write, on the
 * condition that nobody wrote the conversation meanwhile. When Claude cannot be asked, the
 * additions are saved alone and the conversation is left waiting for its step, so that nothing
 * the person wrote is lost.
 */
async function runStep({ identity, current, language, added, asking, ask, model, now, config, request, tools }: StepInput): Promise<CoreResult> {
  const texts = assistantTexts(language);
  const languageUsage = asking?.usage ?? null;
  const conversation = [...entriesOf(current.messages), ...entriesOf(added)];
  const asked = Date.now();
  const answer: StepAnswer | null = ask
    ? await askStep({ tools: current.tools, instructions: INSTRUCTIONS, context: current.context, conversation }, now)
    : null;
  const modelMs = Date.now() - asked;
  // The requests to Claude the person's message has taken, this one included when it was answered.
  const steps = answersSinceThePerson(conversation) + (answer && 'content' in answer ? 1 : 0);

  const messages = [...added];
  let status: AssistantStatus = 'idle';
  let outcome: string = answer?.kind ?? 'step_left_to_continue';
  let refusal: Refusal | null = null;
  let reason: string | undefined;
  const ran: ToolLog[] = [];
  // Anthropic's safety filters refused: the person reads a fixed sentence and the conversation is over.
  let over = false;
  // An answer of Claude is stored exactly as given. One without content has nothing to store, and
  // an entry without content would not be accepted back.
  const keep = (content: ConversationEntry['content']) => {
    if (content.length > 0) messages.push({ kind: 'model', content: { role: 'assistant', content } });
  };
  switch (answer?.kind) {
    case undefined:
      status = 'working';
      break;
    case 'text':
      keep(answer.content);
      break;
    case 'cut_short':
      keep(answer.content);
      messages.push(notice(texts.answerCutShort));
      break;
    case 'refusal':
      messages.push(notice(texts.refused));
      over = true;
      break;
    case 'budget_reached':
      status = 'working';
      refusal = 'assistant_budget_reached';
      break;
    case 'unavailable':
      status = 'working';
      refusal = 'assistant_unavailable';
      reason = answer.reason;
      break;
    case 'tool_requests': {
      keep(answer.content);
      // An answer that stopped for tools and asks for none has nothing to wait for.
      if (answer.requests.length === 0) break;
      // Every read asked for, in the order asked, each for the person of this request. The results
      // go back to Claude together, as one entry: a request left without its result would make the
      // conversation one Anthropic no longer accepts.
      const results = [];
      for (const asked of answer.requests) {
        const done = await runRead(asked, tools, { ...identity, requestId: request.requestId }, { timeZone: config.timeZone, role: identity.role }, now);
        results.push(done.result);
        ran.push(done.log);
      }
      messages.push({ kind: 'model', content: { role: 'user', content: results } });
      if (steps >= ASSISTANT_LIMITS.modelRequestsPerMessage) {
        // The message has used all its requests to Claude: the exchange stops here, with the
        // results saved so that the conversation stays one Claude can be given again.
        messages.push(notice(texts.tooManySteps));
        outcome = 'step_limit';
      } else {
        status = 'working';
      }
      break;
    }
  }

  const usage = answer && 'usage' in answer ? answer.usage : null;
  const step = {
    messages,
    status,
    proposal: null,
    timeZone: config.timeZone,
    inputTokens: inputOf(usage) + inputOf(languageUsage),
    outputTokens: (usage?.outputTokens ?? 0) + (languageUsage?.outputTokens ?? 0),
  };
  let saved: Conversation;
  try {
    saved = current.conversation
      ? await saveStep(identity.sub, current.conversation, step, now)
      : await startConversation(identity.sub, current.version, { language, promptVersion: current.mark }, step, now);
    if (over) await endStored(identity.sub, saved.version);
  } catch (err) {
    // Another request of the same person wrote first: nothing of this step was saved.
    if (!(err instanceof AssistantBusyError)) throw err;
    return { ok: false, refusal: 'assistant_busy', log: { conversationId: current.conversation?.conversationId ?? null, outcome: 'lost_the_race', model, modelMs } };
  }

  const log: StepLog = {
    conversationId: saved.conversationId,
    outcome,
    ...(reason && { reason }),
    model,
    modelMs,
    ...(usage && { usage: counts(usage) }),
    ...(asking && { languageUsage: counts(asking.usage), languageMs: asking.ms }),
    newConversation: current.conversation === null,
    tools: ran,
    steps,
  };
  if (refusal) return { ok: false, refusal, log };

  const firstSeq = saved.nextSeq - messages.length;
  const stored = messages.map((message, i) => ({ ...message, seq: firstSeq + i, at: now }));
  const fromPerson = added.filter((message) => message.fromPerson).length;
  const activity = activityLine([...current.messages, ...messages], tools.map((tool) => tool.definition), identity.role, language);
  return { ok: true, reply: replyOf(over ? null : saved, stored, remaining(config, current.usedToday + fromPerson), activity), log };
}
