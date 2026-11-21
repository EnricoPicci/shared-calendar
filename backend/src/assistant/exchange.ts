import { ASSISTANT_LIMITS, assistantTexts, type AssistantLanguage, type AssistantStatus } from '@shared-calendar/shared';
import { askLanguage, askStep, assistantModel, type ConversationEntry, type TokenCounts } from '../lib/anthropic';
import { AssistantBusyError, endConversation as endStored, saveStep, startConversation, type Conversation, type NewMessage } from '../lib/assistantDb';
import { coreConfig, type CoreConfig } from './config';
import { currentConversation, remaining, replyOf, type CoreResult, type Current, type Identity, type Refusal, type StepLog } from './conversation';
import { INSTRUCTIONS, timeLine } from './prompt';

// The part of the assistant's core that asks Claude (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.6): what a new message of the person adds to the conversation, then one step, which is one
// request to Claude and one write of everything that came of it.

// The token counts as a log line carries them. The names hold no "token": the logger blanks every
// field whose name does.
const counts = (usage: TokenCounts) => ({ input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens });
// Everything Anthropic counted as input, for the person's use of the day.
const inputOf = (usage: TokenCounts | null) => (usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : 0);

const notice = (text: string): NewMessage => ({ kind: 'notice', content: text });
const entriesOf = (messages: { kind: string; content: unknown }[]) =>
  messages.filter((message) => message.kind === 'model').map((message) => message.content as ConversationEntry);

/**
 * A new message of the person. In order: the conversation must be waiting for the person, the
 * person must have messages left today, and the conversation must have room. The first message of
 * a conversation is first shown to Claude alone, to ask which supported language it is written
 * in; that language is the conversation's for good. Then the message, the line with the time now
 * and the language, and one step.
 */
export async function sendMessage(identity: Identity, text: string, now: string): Promise<CoreResult> {
  const config = coreConfig();
  const model = assistantModel();
  const current = await currentConversation(identity, now, config);
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
  return runStep(identity, current, language, added, asking, model, now, config);
}

/**
 * One step: asks Claude with the stored conversation and what the entry added, and saves the
 * additions and what came back in one write, on the condition that nobody wrote the conversation
 * meanwhile. When Claude cannot be asked, the additions are saved alone and the conversation is
 * left waiting for its step, so that nothing the person wrote is lost.
 */
async function runStep(
  identity: Identity,
  current: Current,
  language: AssistantLanguage,
  added: NewMessage[],
  // The language question, when this request asked it: its token counts and how long it took.
  asking: { usage: TokenCounts; ms: number } | null,
  model: string,
  now: string,
  config: CoreConfig,
): Promise<CoreResult> {
  const texts = assistantTexts(language);
  const languageUsage = asking?.usage ?? null;
  const asked = Date.now();
  const answer = await askStep(
    { tools: [], instructions: INSTRUCTIONS, context: current.context, conversation: [...entriesOf(current.messages), ...entriesOf(added)] },
    now,
  );
  const modelMs = Date.now() - asked;

  const messages = [...added];
  let status: AssistantStatus = 'idle';
  let refusal: Refusal | null = null;
  let reason: string | undefined;
  // Anthropic's safety filters refused: the person reads a fixed sentence and the conversation is over.
  let over = false;
  // An answer of Claude is stored exactly as given. One without content has nothing to store, and
  // an entry without content would not be accepted back.
  const keep = (content: ConversationEntry['content']) => {
    if (content.length > 0) messages.push({ kind: 'model', content: { role: 'assistant', content } });
  };
  switch (answer.kind) {
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
    case 'tool_requests':
      // No tool was offered, so this is not an answer the conversation can keep: the step stays to do.
      status = 'working';
      refusal = 'assistant_unavailable';
      reason = 'tool_not_offered';
      break;
  }

  const usage = 'usage' in answer ? answer.usage : null;
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
    outcome: answer.kind,
    ...(reason && { reason }),
    model,
    modelMs,
    ...(usage && { usage: counts(usage) }),
    ...(asking && { languageUsage: counts(asking.usage), languageMs: asking.ms }),
    newConversation: current.conversation === null,
    tools: [],
  };
  if (refusal) return { ok: false, refusal, log };

  const firstSeq = saved.nextSeq - messages.length;
  const stored = messages.map((message, i) => ({ ...message, seq: firstSeq + i, at: now }));
  const fromPerson = added.filter((message) => message.fromPerson).length;
  return { ok: true, reply: replyOf(over ? null : saved, stored, remaining(config, current.usedToday + fromPerson)), log };
}
