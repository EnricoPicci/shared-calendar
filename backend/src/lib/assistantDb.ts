import { ConditionalCheckFailedException, TransactionCanceledException, TransactionConflictException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { localDateOf, type AssistantLanguage, type AssistantStatus } from '@shared-calendar/shared';
import { ulid } from 'ulid';
import { documentClient } from './db';

// The assistant table (docs/ARCHITECTURE.md section 5.4): a person's conversation with the
// assistant, its messages and the person's daily use. This is the only module that knows its item
// layout. Every read is strongly consistent, every write of a conversation is conditional on the
// version that was read, and nothing is ever deleted here: the items expire by themselves. The
// module logs nothing and decides no limit: it keeps the counters right and the callers judge them.

// ── Configuration ──────────────────────────────────────────────────────────────────────────────

export type AssistantConfig = { table: string };

// A broken deployment. Thrown on use, never at import: a module that fails to load makes the
// Lambda crash instead of answering.
export class AssistantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantConfigError';
  }
}

let config: AssistantConfig | AssistantConfigError | undefined;

// Read once per container, on first use; a failure is kept too, so every request fails alike.
export function assistantConfig(): AssistantConfig {
  config ??= process.env.ASSISTANT_TABLE ? { table: process.env.ASSISTANT_TABLE } : new AssistantConfigError('ASSISTANT_TABLE is not set');
  if (config instanceof AssistantConfigError) throw config;
  return config;
}

// ── The items ──────────────────────────────────────────────────────────────────────────────────

// How long a conversation lives (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.3): it has run out
// 24 hours after its last message, and in any case 48 hours after its first. A day's use is kept
// 35 days.
export const CONVERSATION_IDLE_HOURS = 24;
export const CONVERSATION_LIFE_HOURS = 48;
export const USAGE_DAYS = 35;

// The proposal waiting for the person's answer, or just settled. The module reads its id only; the
// rest (the changes, their input, the facts shown, the read results kept back) is stored as given.
export type StoredProposal = { proposalId: string; [key: string]: unknown };

// The proposal a confirmation has taken, and when: set by `takeProposal`, cleared by the next step.
export type Executing = { proposalId: string; at: string };

// A conversation as stored on its META item. `version` moves on at every write; `expiresAt` (epoch
// seconds) is the same on every item of the conversation.
export type Conversation = {
  conversationId: string;
  language: AssistantLanguage;
  status: AssistantStatus;
  startedAt: string;
  lastActivityAt: string;
  // The messages of the person, not the entries stored.
  messageCount: number;
  // The UTF-8 bytes of every `content` stored for this conversation.
  storedBytes: number;
  // The `seq` the next message will get.
  nextSeq: number;
  // The mark of the instructions and tools the conversation started with.
  promptVersion: string;
  proposal: StoredProposal | null;
  executing: Executing | null;
  version: number;
  expiresAt: number;
};

// `model`: one entry of the conversation exactly as exchanged with Claude. `notice`: a fixed text
// of the server, shown to the person and never sent to Claude.
export type MessageKind = 'model' | 'notice';

// One stored message. `content` comes back as it was given to the write.
export type StoredMessage = { seq: number; kind: MessageKind; content: unknown; at: string };

// What a read gives. `version` is the META item's (0 when the person has none) and is what the next
// write must name, also when `conversation` is null: none yet, ended, or run out.
export type ConversationRead = { version: number; conversation: Conversation | null; messages: StoredMessage[] };

// A message to add. `fromPerson` marks the person's own text, which is what the limits count.
export type NewMessage = { kind: MessageKind; content: unknown; fromPerson?: boolean };

// What one step saves: the messages it added, the state it leaves, and what it used. The daily use
// is counted on the calendar's local date, hence the time zone.
export type Step = {
  messages: NewMessage[];
  status: AssistantStatus;
  proposal: StoredProposal | null;
  timeZone: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type DailyUse = { messages: number; inputTokens: number; outputTokens: number };

// Another request wrote the person's conversation first. Nothing was written and nothing is
// retried: the caller answers that a step is already under way.
export class AssistantBusyError extends Error {
  constructor() {
    super("Another request wrote this person's conversation first");
    this.name = 'AssistantBusyError';
  }
}

type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

const HOUR_MS = 3_600_000;
const SEQ_WIDTH = 6;

const conversationPk = (sub: string) => `CONV#${sub}`;
const metaKey = (sub: string) => ({ PK: conversationPk(sub), SK: 'META' });
const messagePrefix = (conversationId: string) => `MSG#${conversationId}#`;
// Padded, so that the sort key orders the messages as their numbers do.
const messageSk = (conversationId: string, seq: number) => messagePrefix(conversationId) + String(seq).padStart(SEQ_WIDTH, '0');
const epochSeconds = (instant: string) => Math.floor(Date.parse(instant) / 1000);

// The conversation's own fields, picked one by one so that PK and SK never leave the module.
function toConversation(item: Record<string, unknown>): Conversation {
  return {
    conversationId: item.conversationId as string,
    language: item.language as AssistantLanguage,
    status: item.status as AssistantStatus,
    startedAt: item.startedAt as string,
    lastActivityAt: item.lastActivityAt as string,
    messageCount: item.messageCount as number,
    storedBytes: item.storedBytes as number,
    nextSeq: item.nextSeq as number,
    promptVersion: item.promptVersion as string,
    proposal: (item.proposal as StoredProposal | null | undefined) ?? null,
    executing: (item.executing as Executing | null | undefined) ?? null,
    version: item.version as number,
    expiresAt: item.expiresAt as number,
  };
}

/** Whether a conversation has run out at `now`, whatever DynamoDB has or has not deleted yet. */
export function hasRunOut(conversation: Pick<Conversation, 'startedAt' | 'lastActivityAt'>, now: string): boolean {
  const at = Date.parse(now);
  return (
    at - Date.parse(conversation.lastActivityAt) >= CONVERSATION_IDLE_HOURS * HOUR_MS ||
    at - Date.parse(conversation.startedAt) >= CONVERSATION_LIFE_HOURS * HOUR_MS
  );
}

// ── Reading ────────────────────────────────────────────────────────────────────────────────────

/**
 * The person's conversation at `now`, in two reads: the META item, then, only when it names a
 * conversation that has not run out, that conversation's messages in order. The messages of
 * earlier conversations, which stay in the partition until they expire, are never asked for. A
 * write may land between the two reads: a message META does not know of yet (its `seq` is not
 * below `nextSeq`) is left out, and the write that follows names the version read here.
 */
export async function readConversation(sub: string, now: string): Promise<ConversationRead> {
  const { table } = assistantConfig();
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: metaKey(sub), ConsistentRead: true }));
  if (!Item) return { version: 0, conversation: null, messages: [] };
  const version = Item.version as number;
  if (!Item.conversationId) return { version, conversation: null, messages: [] };
  const conversation = toConversation(Item);
  if (hasRunOut(conversation, now)) return { version, conversation: null, messages: [] };

  const messages: StoredMessage[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await documentClient.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': conversationPk(sub), ':prefix': messagePrefix(conversation.conversationId) },
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if ((item.seq as number) >= conversation.nextSeq) continue;
      messages.push({
        seq: item.seq as number,
        kind: item.kind as MessageKind,
        content: JSON.parse(item.content as string) as unknown,
        at: item.at as string,
      });
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return { version, conversation, messages };
}

// ── Writing ────────────────────────────────────────────────────────────────────────────────────

// Whether a transaction was cancelled because another write got there first: the version condition
// of the META item failed, or (real DynamoDB, two transactions at once) an item was being written.
function wasBusy(err: unknown): boolean {
  return (
    err instanceof TransactionCanceledException &&
    (err.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed' || reason.Code === 'TransactionConflict')
  );
}

// The same for a single conditional update, which reports the two cases as two exceptions.
function updateWasBusy(err: unknown): boolean {
  return err instanceof ConditionalCheckFailedException || err instanceof TransactionConflictException;
}

// The step's messages as items, numbered from `firstSeq`, with what they add to the counters. A
// content is stored as its JSON text: it comes back exactly as given, key order included, which a
// DynamoDB map would not keep.
function messageItems(table: string, sub: string, conversationId: string, firstSeq: number, expiresAt: number, step: Step, now: string) {
  let bytes = 0;
  let fromPerson = 0;
  const items: TransactItem[] = step.messages.map((message, i) => {
    const content = JSON.stringify(message.content);
    bytes += Buffer.byteLength(content, 'utf8');
    if (message.fromPerson) fromPerson++;
    const seq = firstSeq + i;
    return {
      Put: {
        TableName: table,
        Item: { PK: conversationPk(sub), SK: messageSk(conversationId, seq), seq, kind: message.kind, content, at: now, expiresAt },
        // A sequence number is written once.
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    };
  });
  return { items, bytes, fromPerson };
}

// The step's addition to the person's use of the day, or nothing when it used nothing. The date is
// the calendar's local date of `now`; the item expires USAGE_DAYS after its first write.
function usageItem(table: string, sub: string, step: Step, fromPerson: number, now: string): TransactItem[] {
  const inputTokens = step.inputTokens ?? 0;
  const outputTokens = step.outputTokens ?? 0;
  if (fromPerson === 0 && inputTokens === 0 && outputTokens === 0) return [];
  return [
    {
      Update: {
        TableName: table,
        Key: { PK: `USAGE#${sub}`, SK: localDateOf(now, step.timeZone) },
        UpdateExpression: 'ADD #messages :messages, #inputTokens :inputTokens, #outputTokens :outputTokens SET #expiresAt = if_not_exists(#expiresAt, :expiresAt)',
        ExpressionAttributeNames: { '#messages': 'messages', '#inputTokens': 'inputTokens', '#outputTokens': 'outputTokens', '#expiresAt': 'expiresAt' },
        ExpressionAttributeValues: {
          ':messages': fromPerson,
          ':inputTokens': inputTokens,
          ':outputTokens': outputTokens,
          ':expiresAt': epochSeconds(now) + USAGE_DAYS * 24 * 3600,
        },
      },
    },
  ];
}

// One transaction: the META item first, then the messages, then the daily use. All of it is
// written or none; a writer that lost the race gets AssistantBusyError.
async function transact(items: TransactItem[]): Promise<void> {
  try {
    await documentClient.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (err) {
    if (wasBusy(err)) throw new AssistantBusyError();
    throw err;
  }
}

/**
 * Starts a conversation with its first step, replacing whatever the META item held (nothing, an
 * ended conversation, one that ran out, or one the caller chose to drop). `version` is the one
 * `readConversation` gave. The earlier conversation's messages are left to expire.
 */
export async function startConversation(
  sub: string,
  version: number,
  start: { language: AssistantLanguage; promptVersion: string },
  step: Step,
  now: string,
): Promise<Conversation> {
  const { table } = assistantConfig();
  const conversationId = ulid();
  const expiresAt = epochSeconds(now) + CONVERSATION_LIFE_HOURS * 3600;
  const { items, bytes, fromPerson } = messageItems(table, sub, conversationId, 1, expiresAt, step, now);
  const conversation: Conversation = {
    conversationId,
    language: start.language,
    status: step.status,
    startedAt: now,
    lastActivityAt: now,
    messageCount: fromPerson,
    storedBytes: bytes,
    nextSeq: 1 + step.messages.length,
    promptVersion: start.promptVersion,
    proposal: step.proposal,
    executing: null,
    version: version + 1,
    expiresAt,
  };
  const meta: TransactItem = {
    Put: {
      TableName: table,
      Item: { ...metaKey(sub), ...conversation },
      ...(version === 0
        ? { ConditionExpression: 'attribute_not_exists(PK)' }
        : { ConditionExpression: '#version = :read', ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':read': version } }),
    },
  };
  await transact([meta, ...items, ...usageItem(table, sub, step, fromPerson, now)]);
  return conversation;
}

/**
 * Saves one step of the conversation that was read: its messages, the state it leaves, the
 * counters, and the day's use. A proposal that was being executed is settled by the step, so
 * `executing` is cleared. Refused with AssistantBusyError when the conversation moved since the
 * read.
 */
export async function saveStep(sub: string, read: Conversation, step: Step, now: string): Promise<Conversation> {
  const { table } = assistantConfig();
  const { items, bytes, fromPerson } = messageItems(table, sub, read.conversationId, read.nextSeq, read.expiresAt, step, now);
  const conversation: Conversation = {
    ...read,
    status: step.status,
    lastActivityAt: now,
    messageCount: read.messageCount + fromPerson,
    storedBytes: read.storedBytes + bytes,
    nextSeq: read.nextSeq + step.messages.length,
    proposal: step.proposal,
    executing: null,
    version: read.version + 1,
  };
  const meta: TransactItem = {
    Update: {
      TableName: table,
      Key: metaKey(sub),
      UpdateExpression:
        'SET #status = :status, #lastActivityAt = :lastActivityAt, #messageCount = :messageCount, #storedBytes = :storedBytes, #nextSeq = :nextSeq, #proposal = :proposal, #executing = :executing, #version = :next',
      ConditionExpression: '#version = :read AND #conversationId = :conversationId',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#lastActivityAt': 'lastActivityAt',
        '#messageCount': 'messageCount',
        '#storedBytes': 'storedBytes',
        '#nextSeq': 'nextSeq',
        '#proposal': 'proposal',
        '#executing': 'executing',
        '#version': 'version',
        '#conversationId': 'conversationId',
      },
      ExpressionAttributeValues: {
        ':status': conversation.status,
        ':lastActivityAt': now,
        ':messageCount': conversation.messageCount,
        ':storedBytes': conversation.storedBytes,
        ':nextSeq': conversation.nextSeq,
        ':proposal': conversation.proposal,
        ':executing': null,
        ':next': conversation.version,
        ':read': read.version,
        ':conversationId': read.conversationId,
      },
    },
  };
  await transact([meta, ...items, ...usageItem(table, sub, step, fromPerson, now)]);
  return conversation;
}

/**
 * Takes the waiting proposal for execution (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule
 * 6): one conditional update that marks it as being executed. It answers the conversation as it
 * is afterwards, or null when the proposal is not the one waiting, is already taken, or another
 * request wrote first. Of two takes at once, exactly one is not null.
 */
export async function takeProposal(sub: string, read: Conversation, proposalId: string, now: string): Promise<Conversation | null> {
  if (read.proposal?.proposalId !== proposalId || read.executing !== null) return null;
  const { table } = assistantConfig();
  const executing: Executing = { proposalId, at: now };
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: table,
        Key: metaKey(sub),
        UpdateExpression: 'SET #executing = :executing, #version = :next',
        // The version read is the one that held this proposal, waiting and not taken.
        ConditionExpression: '#version = :read AND #conversationId = :conversationId',
        ExpressionAttributeNames: { '#executing': 'executing', '#version': 'version', '#conversationId': 'conversationId' },
        ExpressionAttributeValues: { ':executing': executing, ':next': read.version + 1, ':read': read.version, ':conversationId': read.conversationId },
      }),
    );
  } catch (err) {
    if (updateWasBusy(err)) return null;
    throw err;
  }
  return { ...read, executing, version: read.version + 1 };
}

/**
 * Ends the person's conversation: the META item stays, naming no conversation, and a waiting
 * proposal goes with it. `version` is the one `readConversation` gave; with no META item there is
 * nothing to end and nothing is written. The messages are left to expire.
 */
export async function endConversation(sub: string, version: number): Promise<void> {
  if (version === 0) return;
  const { table } = assistantConfig();
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: table,
        Key: metaKey(sub),
        UpdateExpression: 'SET #conversationId = :none, #status = :idle, #proposal = :none, #executing = :none, #version = :next',
        ConditionExpression: '#version = :read',
        ExpressionAttributeNames: {
          '#conversationId': 'conversationId',
          '#status': 'status',
          '#proposal': 'proposal',
          '#executing': 'executing',
          '#version': 'version',
        },
        ExpressionAttributeValues: { ':none': null, ':idle': 'idle' satisfies AssistantStatus, ':next': version + 1, ':read': version },
      }),
    );
  } catch (err) {
    if (updateWasBusy(err)) throw new AssistantBusyError();
    throw err;
  }
}

// ── The daily use ──────────────────────────────────────────────────────────────────────────────

/** What the person has used on the calendar's local date of `now`; zeros when nothing yet. */
export async function readDailyUse(sub: string, now: string, timeZone: string): Promise<DailyUse> {
  const { table } = assistantConfig();
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: table, Key: { PK: `USAGE#${sub}`, SK: localDateOf(now, timeZone) }, ConsistentRead: true }),
  );
  return {
    messages: (Item?.messages as number | undefined) ?? 0,
    inputTokens: (Item?.inputTokens as number | undefined) ?? 0,
    outputTokens: (Item?.outputTokens as number | undefined) ?? 0,
  };
}
