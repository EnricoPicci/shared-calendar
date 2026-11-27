import { ASSISTANT_LIMITS, assistantTexts, type AssistantMessageBody, type AssistantStatus, type Language } from '@shared-calendar/shared';
import { askLanguage, askStep, assistantEffort, assistantModel, STEP_TIMEOUT_MS, type ConversationEntry, type StepAnswer, type TokenCounts } from '../lib/anthropic';
import { ulid } from 'ulid';
import { AssistantBusyError, endConversation as endStored, saveStep, startConversation, type Conversation, type NewMessage } from '../lib/assistantDb';
import { coreConfig, type CoreConfig } from './config';
import { activityLine, currentConversation, remaining, replyOf, type CoreResult, type Current, type Identity, type Refusal, type StepLog } from './conversation';
import { INSTRUCTIONS, timeLine } from './prompt';
import { TOOLS } from './tools/list';
import { asUnknown, isWaiting, proposalOf, settledWithout, takenState, type Proposal, type ProposedChange } from './proposal';
import { asksForChange, notRun, proposeChange, runRead, type FactsRead, type Proposable, type ToolLog } from './tools/run';
import type { Place, Tool, ToolResultBlock } from './tools/tool';

// The part of the assistant's core that asks Claude (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.6): what a new message of the person adds to the conversation, then one step, which is one
// request to Claude, the reads Claude asked for, and one write of everything that came of it.
// `continue` is the same step with nothing added. A change Claude asks for is never run here: it
// becomes a proposal (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 1), and this module
// imports no handler of a route that changes the calendar.

// What the core needs of the request in progress besides who sent it: its id, which a tool's
// handler writes in its own log line, and how long the function may still run. `remainingMs` is
// null where that is not known; nothing is then decided on it.
export type RequestInfo = { requestId: string; remainingMs: (() => number) | null };
const UNKNOWN_REQUEST: RequestInfo = { requestId: 'unknown', remainingMs: null };

// What a step may take after Claude answered: the reads Claude asked for and the write.
export const AFTER_CLAUDE_MS = 2_000;

// The token counts as a log line carries them. The names hold no "token": the logger blanks every
// field whose name does.
const counts = (usage: TokenCounts) => ({ input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens });
// Everything Anthropic counted as input, for the person's use of the day.
const inputOf = (usage: TokenCounts | null) => (usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : 0);

const notice = (text: string): NewMessage => ({ kind: 'notice', content: text });
// What the messages of a step add to the stored size of their conversation: the bytes of each
// content as the table stores it, its JSON text.
const storedBytesOf = (messages: NewMessage[]) => messages.reduce((bytes, message) => bytes + Buffer.byteLength(JSON.stringify(message.content), 'utf8'), 0);
// What Claude is told of a read that was not run because its answer asked for too many.
const TOO_MANY_READS = `Only the first ${ASSISTANT_LIMITS.readsPerAnswer} reads of one answer are run, and this one was not: its result is missing, not empty. Ask for it again in your next answer, a few reads at a time. If the person's request needs more than you can read this way, tell them to ask for a shorter period.`;
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
 * person must have messages left today, and the conversation must have room.
 *
 * A message sent while a proposal waits drops the proposal
 * (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 5): Claude's request is answered with
 * "nothing was changed", the message is added after it, and Claude is asked, all in one write.
 * Whatever the message says, a typed "yes" too, it runs nothing. A message that is refused
 * leaves the proposal waiting. A proposal a confirmation has taken stops the message while that
 * confirmation may still be running; once it no longer can be, the message settles the proposal
 * with each outcome unknown (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 6). The first message of
 * a conversation is first shown to Claude alone, to ask which supported language it is written
 * in, the page's language standing in for none of them; that language is the conversation's for
 * good. Then the message, the line with the time now
 * and the language, and one step.
 *
 * When the language question took so long that a step no longer fits in the time the function
 * has left, the message is saved with its language and the step is left to `continue`: asking
 * Claude a second time could get the function stopped with nothing saved.
 */
export async function sendMessage(identity: Identity, message: AssistantMessageBody, now: string, request: RequestInfo = UNKNOWN_REQUEST, tools: readonly Tool[] = TOOLS): Promise<CoreResult> {
  const { text } = message;
  const config = coreConfig();
  const model = assistantModel();
  const effort = assistantEffort();
  const current = await currentConversation(identity, now, config, tools.map((tool) => tool.definition));
  const { conversation } = current;
  const conversationId = conversation?.conversationId ?? null;

  const busy: CoreResult = { ok: false, refusal: 'assistant_busy', log: { conversationId, outcome: 'busy' } };
  if (conversation?.status === 'working') return busy;
  const waiting = conversation?.status === 'awaiting_confirmation' ? proposalOf(conversation) : null;
  const taken = conversation ? takenState(conversation, now) : 'free';
  if (waiting && taken === 'under_way') return busy;
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
        log: { conversationId, outcome: `language_${asked.kind}`, ...(asked.kind === 'unavailable' && { reason: asked.reason }), model, effort, languageMs: Date.now() - started },
      };
    }
    // A first message in none of the supported languages takes the page's language, English
    // when the page sent none (docs/MULTILANGUAGE_ARCHITECTURE.md section 9).
    language = asked.language ?? message.language ?? 'en';
    asking = { usage: asked.usage, ms: Date.now() - started };
  }

  const added: NewMessage[] = [
    // The proposal the message drops: its entry of results comes first, since it answers the
    // answer of Claude the conversation ends with.
    ...(waiting ? [settledWithout(waiting, taken === 'abandoned' ? 'unknown' : 'dropped')] : []),
    { kind: 'model', content: { role: 'user', content: text }, fromPerson: true },
    { kind: 'model', content: { role: 'system', content: timeLine(now, config.timeZone, language, asking !== null) } },
  ];
  // Only a request that asked the language question has spent time on Claude already.
  const room = asking !== null && request.remainingMs !== null ? request.remainingMs() : Infinity;
  const ask = room >= STEP_TIMEOUT_MS + AFTER_CLAUDE_MS;
  return runStep({ identity, current, language, added, asking, ask, model, effort, now, config, request, tools, proposal: null, dropped: waiting !== null });
}

/**
 * The next step of a conversation that waits for one: after a read, whose results Claude has not
 * seen yet, after a confirmation, whose outcomes Claude has not seen yet, and after a step that
 * could not be done because Claude could not be asked. Nothing is added to the conversation and
 * nothing is counted for the day: the person's message was counted when it was saved, so the
 * daily limit does not stop an exchange half-way.
 *
 * It is also the request that settles a proposal whose confirmation stopped without saving what
 * came of it (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 6): each change is recorded
 * with the outcome unknown, and Claude is told to read the calendar. While that confirmation may
 * still be running, the conversation is busy. A proposal that simply waits for the person has
 * nothing to continue.
 */
export async function continueExchange(identity: Identity, now: string, request: RequestInfo = UNKNOWN_REQUEST, tools: readonly Tool[] = TOOLS): Promise<CoreResult> {
  const config = coreConfig();
  const model = assistantModel();
  const effort = assistantEffort();
  const current = await currentConversation(identity, now, config, tools.map((tool) => tool.definition));
  const { conversation } = current;
  const conversationId = conversation?.conversationId ?? null;
  const step = { identity, current, asking: null, ask: true, model, effort, now, config, request, tools, dropped: false };
  const taken = conversation ? takenState(conversation, now) : 'free';
  const waiting = conversation?.status === 'awaiting_confirmation' ? proposalOf(conversation) : null;
  if (conversation && waiting && taken !== 'free') {
    if (taken === 'under_way') return { ok: false, refusal: 'assistant_busy', log: { conversationId, outcome: 'busy' } };
    return runStep({ ...step, language: conversation.language, added: [settledWithout(waiting, 'unknown')], proposal: asUnknown(waiting), settledUnknown: true });
  }
  if (!conversation || conversation.status !== 'working') {
    return { ok: false, refusal: 'nothing_to_continue', log: { conversationId, outcome: 'nothing_to_continue' } };
  }
  // A settled proposal stays with the conversation until the person's next message.
  return runStep({ ...step, language: conversation.language, added: [], proposal: proposalOf(conversation) });
}

/**
 * The places the bookings and moves of one answer take in each slot
 * (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 4). A slot takes the changes of one answer
 * while they fit the places it had left when the calendar was read; the first that does not fit is
 * refused, and so is every one after it. A person takes one place at a time, so the same person
 * twice in one slot is refused too. A change the Administrator asked to make over the capacity
 * takes no place from the others. A move out of a slot frees no place for another change of the
 * same answer: the places are those of the reading.
 */
export class Places {
  private readonly taken = new Map<string, number>();
  private readonly people = new Set<string>();

  /** Why a change cannot take its place, or null when it can, or takes none. */
  refusal(place: Place | null): string | null {
    if (place === null) return null;
    if (this.people.has(`${place.slot} ${place.who}`)) {
      return 'Another change asked for in the same answer already puts the same person into this slot, and a person holds one place at a time: nothing was proposed. Ask for one change of it.';
    }
    if (place.overbook) return null;
    const taken = this.taken.get(place.slot) ?? 0;
    if (taken < place.left) return null;
    const left = place.left === 1 ? '1 place was' : `${place.left} places were`;
    return `This slot cannot take this change too: ${left} left in it, and the changes before this one in the same answer take ${place.left === 1 ? 'it' : 'them'}. Nothing was proposed. Ask for at most ${place.left} ${place.left === 1 ? 'change' : 'changes'} into this slot.`;
  }

  /** Counts the place of a change that is proposed. */
  take(place: Place | null): void {
    if (place === null) return;
    this.people.add(`${place.slot} ${place.who}`);
    if (!place.overbook) this.taken.set(place.slot, (this.taken.get(place.slot) ?? 0) + 1);
  }
}

export type StepInput = {
  identity: Identity;
  current: Current;
  language: Language;
  // What the entry adds to the conversation before Claude is asked.
  added: NewMessage[];
  // The language question, when this request asked it: its token counts and how long it took.
  asking: { usage: TokenCounts; ms: number } | null;
  // False when the step is left to `continue`: the additions are saved and Claude is not asked.
  ask: boolean;
  model: string;
  effort: string;
  now: string;
  config: CoreConfig;
  request: RequestInfo;
  tools: readonly Tool[];
  // The settled proposal the conversation keeps showing after this step, unless the step makes a
  // new one: null when the step starts from a message of the person.
  proposal: Proposal | null;
  // Whether the entry dropped a waiting proposal, and whether it recorded one as of unknown
  // outcome: for the log line.
  dropped: boolean;
  settledUnknown?: boolean;
};

/**
 * One step: asks Claude with the stored conversation and what the entry added, runs the reads
 * Claude asked for, and saves the additions and everything that came back in one write, on the
 * condition that nobody wrote the conversation meanwhile. A change Claude asks for is not run:
 * its facts are read and it is saved as a proposal, with Claude's answer, in that same write;
 * the reads of the same answer are run and their results kept back in the proposal. When Claude cannot be asked, the
 * additions are saved alone and the conversation is left waiting for its step, so that nothing
 * the person wrote is lost.
 */
export async function runStep(input: StepInput): Promise<CoreResult> {
  const { identity, current, language, added, asking, ask, model, effort, now, config, request, tools } = input;
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
  let proposal = input.proposal;
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
      // Every request is answered in the order asked, each for the person of this request. A
      // read is run. A change is not: its facts are read and it becomes a proposal. The results
      // go back to Claude together, as one entry: a request left without its result would make
      // the conversation one Anthropic no longer accepts.
      const caller = { ...identity, requestId: request.requestId };
      const context = { timeZone: config.timeZone, role: identity.role };
      // More changes than a proposal may hold: none is proposed, and no fact is read.
      const tooMany = answer.requests.filter((asked) => asksForChange(asked, tools, caller)).length > ASSISTANT_LIMITS.changesPerProposal;
      // One reading of the calendar for all the changes of this answer.
      const facts: FactsRead = new Map();
      const subjects = new Set<string>();
      const places = new Places();
      // What each request of the answer came to, in the order asked: the result of a read or of
      // a request that was refused, or a change that can be proposed.
      const answered: ({ result: ToolResultBlock } | { change: ProposedChange; log: number })[] = [];
      let refusedChange = false;
      // The requests of this answer that are not changes, counted as they come.
      let reads = 0;
      // A name Claude gave, when it is a tool of the person's role: the log line names no other.
      const offeredName = (name: string) => (tools.some((tool) => tool.definition.name === name && tool.definition.roles.includes(caller.role)) ? name : null);
      for (const asked of answer.requests) {
        if (!asksForChange(asked, tools, caller)) {
          // The results of one answer are stored together, so only its first few requests that
          // are not changes are looked at, a mistaken one among them: Claude is told to ask for
          // the others in its next answer.
          reads += 1;
          const done =
            reads <= ASSISTANT_LIMITS.readsPerAnswer ? await runRead(asked, tools, caller, context, now) : notRun(asked.id, offeredName(asked.name), 'too_many_reads', TOO_MANY_READS);
          answered.push({ result: done.result });
          ran.push(done.log);
          continue;
        }
        const proposed: Proposable = tooMany
          ? { ok: false, outcome: notRun(asked.id, asked.name, 'too_many_changes', `Ask for at most ${ASSISTANT_LIMITS.changesPerProposal} changes in one answer: nothing was proposed. Call the tools again for the first ${ASSISTANT_LIMITS.changesPerProposal}, and for the others after the person has confirmed those.`) }
          : await proposeChange(asked, tools, caller, context, texts, now, facts);
        // Two changes of one answer about the same thing: the second would be refused once the
        // first was made, so it is not proposed. Into one slot, the changes are counted instead,
        // against the places it had left (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 4).
        const twice = proposed.ok && proposed.subjects.some((subject) => subjects.has(subject));
        const unplaced = proposed.ok && !twice ? places.refusal(proposed.place) : null;
        if (!proposed.ok || twice || unplaced !== null) {
          const refused = !proposed.ok
            ? proposed.outcome
            : notRun(
                asked.id,
                proposed.tool,
                'same_thing_twice',
                unplaced ?? 'Another change asked for in the same answer is about the same thing (the same appointment, type, pattern, date or window, or a second mail): nothing was proposed. Ask for one change of it, or one mail from the first day to the last.',
              );
          answered.push({ result: refused.result });
          ran.push(refused.log);
          refusedChange = true;
          continue;
        }
        for (const subject of proposed.subjects) subjects.add(subject);
        places.take(proposed.place);
        ran.push(proposed.log);
        answered.push({ change: { toolUseId: asked.id, tool: proposed.tool, call: proposed.call, summary: proposed.summary, outcome: null, error: null }, log: ran.length - 1 });
      }
      // The changes of one answer are confirmed together or not at all: when one of them cannot
      // be proposed, none is, so that the person is never shown half of what they asked for. Each
      // of the others is answered with the reason, and Claude tells the person.
      const results: ToolResultBlock[] = [];
      const changes: ProposedChange[] = [];
      for (const one of answered) {
        if ('result' in one) {
          results.push(one.result);
        } else if (refusedChange) {
          const left = notRun(one.change.toolUseId, one.change.tool, 'not_proposed', 'Nothing was proposed: another change asked for in the same answer could not be proposed, and the changes of one answer are confirmed together. This change itself is possible. Tell the person what could not be done, and call the tools again for what can be.');
          results.push(left.result);
          ran[one.log] = left.log;
        } else {
          changes.push(one.change);
        }
      }
      if (changes.length > 0) {
        // The conversation now ends with an answer of Claude whose results are not all there:
        // the entry of results is written when the person settles the proposal.
        proposal = { proposalId: ulid(), changes, keptBack: results };
        status = 'awaiting_confirmation';
        outcome = 'proposal';
        break;
      }
      messages.push({ kind: 'model', content: { role: 'user', content: results } });
      if (steps >= ASSISTANT_LIMITS.modelRequestsPerMessage) {
        // The message has used all its requests to Claude: the exchange stops here, with the
        // results saved so that the conversation stays one Claude can be given again.
        messages.push(notice(texts.tooManySteps));
        outcome = 'step_limit';
      } else if ((current.conversation?.storedBytes ?? 0) + storedBytesOf(messages) >= ASSISTANT_LIMITS.conversationBytes) {
        // With these results the conversation is full: the exchange stops here, results saved,
        // and the person is told to start a new conversation, which the next message would be
        // told anyway. Without this a single message could go on filling it, step after step.
        messages.push(notice(texts.conversationFull));
        outcome = 'conversation_full';
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
    proposal,
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
    return { ok: false, refusal: 'assistant_busy', log: { conversationId: current.conversation?.conversationId ?? null, outcome: 'lost_the_race', model, effort, modelMs } };
  }

  const log: StepLog = {
    conversationId: saved.conversationId,
    outcome,
    ...(reason && { reason }),
    model,
    effort,
    modelMs,
    ...(usage && { usage: counts(usage) }),
    ...(asking && { languageUsage: counts(asking.usage), languageMs: asking.ms }),
    newConversation: current.conversation === null,
    tools: ran,
    steps,
    // The names of the changes a proposal made by this step holds, never their input or wording.
    ...(proposal && isWaiting(proposal) && { proposalId: proposal.proposalId, proposed: proposal.changes.map((change) => change.tool) }),
    ...(input.dropped && { droppedProposal: true }),
    ...(input.settledUnknown && { settledUnknown: true }),
  };
  if (refusal) return { ok: false, refusal, log };

  const firstSeq = saved.nextSeq - messages.length;
  const stored = messages.map((message, i) => ({ ...message, seq: firstSeq + i, at: now }));
  const fromPerson = added.filter((message) => message.fromPerson).length;
  const activity = activityLine([...current.messages, ...messages], tools.map((tool) => tool.definition), identity.role, language);
  return { ok: true, reply: replyOf(over ? null : { ...saved, proposal }, stored, remaining(config, current.usedToday + fromPerson), activity), log };
}
