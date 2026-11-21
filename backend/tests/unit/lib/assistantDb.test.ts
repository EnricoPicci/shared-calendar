import { ConditionalCheckFailedException, TransactionCanceledException, TransactionConflictException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { Conversation, Step } from '../../../src/lib/assistantDb';

// The module reads its configuration once per container, so every test imports a fresh copy
// after setting the environment.
type AssistantDb = typeof import('../../../src/lib/assistantDb');
let db: AssistantDb;

const ddb = mockClient(DynamoDBDocumentClient);
const TABLE = 'assistant-test';
const SUB = 'sub-alice';
const ZONE = 'Europe/Rome';
const NOW = '2026-11-21T09:30:00.000Z';
const NOW_SECONDS = Date.parse(NOW) / 1000;
const HOUR = 3600;
const CONVERSATION_ID = '01KAJ5V5Z0000000000000CONV';
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const META_KEY = { PK: `CONV#${SUB}`, SK: 'META' };

const plus = (instant: string, ms: number) => new Date(Date.parse(instant) + ms).toISOString();

// What DynamoDB answers when a transaction is cancelled: one reason per item, in item order.
const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: `Transaction cancelled, please refer cancellation reasons for specific reasons [${codes.join(', ')}]`,
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
const conditionFailed = () => new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
const conflict = () => new TransactionConflictException({ message: 'Transaction is ongoing for the item', $metadata: {} });

async function load(): Promise<AssistantDb> {
  vi.stubEnv('ASSISTANT_TABLE', TABLE);
  vi.resetModules();
  return import('../../../src/lib/assistantDb');
}

// A conversation started an hour before NOW, with two messages stored, as a read gives it.
const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  conversationId: CONVERSATION_ID,
  language: 'en',
  status: 'idle',
  startedAt: plus(NOW, -HOUR * 1000),
  lastActivityAt: plus(NOW, -HOUR * 1000),
  messageCount: 1,
  storedBytes: 30,
  nextSeq: 3,
  promptVersion: 'p1',
  proposal: null,
  executing: null,
  version: 4,
  expiresAt: NOW_SECONDS + 47 * HOUR,
  ...over,
});
const metaItem = (over: Partial<Conversation> = {}) => ({ ...META_KEY, ...conversation(over) });
const messageItem = (seq: number, content: unknown, kind = 'model') => ({
  PK: `CONV#${SUB}`,
  SK: `MSG#${CONVERSATION_ID}#${String(seq).padStart(6, '0')}`,
  seq,
  kind,
  content: JSON.stringify(content),
  at: NOW,
  expiresAt: NOW_SECONDS,
});

const step = (over: Partial<Step> = {}): Step => ({ messages: [], status: 'idle', proposal: null, timeZone: ZONE, ...over });
const person = (text: string) => ({ kind: 'model' as const, content: { role: 'user' as const, content: text }, fromPerson: true });
const answer = (text: string) => ({ kind: 'model' as const, content: { role: 'assistant' as const, content: text } });

const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input.TransactItems ?? []);
const sent = () => transactions()[0] ?? [];
const updates = () => ddb.commandCalls(UpdateCommand).map((call) => call.args[0].input);
const usageOf = (items: ReturnType<typeof transactions>[number]) => items.find((item) => String(item.Update?.Key?.PK).startsWith('USAGE#'))?.Update;

beforeEach(async () => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  db = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assistantConfig', () => {
  it('reads the table', () => {
    expect(db.assistantConfig()).toEqual({ table: TABLE });
  });

  it('reads the environment once per container', () => {
    db.assistantConfig();
    vi.stubEnv('ASSISTANT_TABLE', 'another');
    expect(db.assistantConfig().table).toBe(TABLE);
  });

  it('throws AssistantConfigError on use, not on import, when the table is missing, and keeps the error', async () => {
    vi.stubEnv('ASSISTANT_TABLE', '');
    vi.resetModules();
    const broken = await import('../../../src/lib/assistantDb');
    expect(() => broken.assistantConfig()).toThrow(broken.AssistantConfigError);
    expect(() => broken.assistantConfig()).toThrow('ASSISTANT_TABLE is not set');
    vi.stubEnv('ASSISTANT_TABLE', TABLE);
    expect(() => broken.assistantConfig()).toThrow(broken.AssistantConfigError);
    await expect(broken.readConversation(SUB, NOW)).rejects.toThrow(broken.AssistantConfigError);
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('the lifetimes', () => {
  it('are 24 hours without a message, 48 hours in all, and 35 days for the daily use', () => {
    expect([db.CONVERSATION_IDLE_HOURS, db.CONVERSATION_LIFE_HOURS, db.USAGE_DAYS]).toEqual([24, 48, 35]);
  });
});

describe('readConversation', () => {
  it('reads the META item consistently, and nothing else when the person has none', async () => {
    expect(await db.readConversation(SUB, NOW)).toEqual({ version: 0, conversation: null, messages: [] });
    expect(ddb.commandCalls(GetCommand).map((call) => call.args[0].input)).toEqual([{ TableName: TABLE, Key: META_KEY, ConsistentRead: true }]);
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it('gives the version and no conversation, in one read, when the conversation was ended', async () => {
    ddb.on(GetCommand).resolves({ Item: { ...META_KEY, ...conversation(), conversationId: null, version: 7 } });
    expect(await db.readConversation(SUB, NOW)).toEqual({ version: 7, conversation: null, messages: [] });
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it('then reads the messages of that conversation only, consistently, in order', async () => {
    ddb.on(GetCommand).resolves({ Item: metaItem() });
    ddb.on(QueryCommand).resolves({
      Items: [messageItem(1, { role: 'user', content: 'ciao' }), messageItem(2, 'Nothing was changed.', 'notice')],
    });
    const read = await db.readConversation(SUB, NOW);
    expect(read).toEqual({
      version: 4,
      conversation: conversation(),
      messages: [
        { seq: 1, kind: 'model', content: { role: 'user', content: 'ciao' }, at: NOW },
        { seq: 2, kind: 'notice', content: 'Nothing was changed.', at: NOW },
      ],
    });
    expect(ddb.commandCalls(QueryCommand).map((call) => call.args[0].input)).toEqual([
      {
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `CONV#${SUB}`, ':prefix': `MSG#${CONVERSATION_ID}#` },
        ConsistentRead: true,
        ExclusiveStartKey: undefined,
      },
    ]);
  });

  it('gives the conversation without the keys of its item, and null for a proposal never written', async () => {
    const item: Record<string, unknown> = metaItem();
    delete item.proposal;
    delete item.executing;
    ddb.on(GetCommand).resolves({ Item: item });
    const read = await db.readConversation(SUB, NOW);
    expect(read.conversation).toEqual(conversation());
    expect(read.conversation).not.toHaveProperty('PK');
  });

  it('follows the pages of the messages to the end', async () => {
    const key = { PK: `CONV#${SUB}`, SK: `MSG#${CONVERSATION_ID}#000001` };
    ddb.on(GetCommand).resolves({ Item: metaItem() });
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [messageItem(1, 'a')], LastEvaluatedKey: key })
      .resolvesOnce({ Items: [messageItem(2, 'b')] });
    const read = await db.readConversation(SUB, NOW);
    expect(read.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(ddb.commandCalls(QueryCommand).map((call) => call.args[0].input.ExclusiveStartKey)).toEqual([undefined, key]);
  });

  it('leaves out a message written between the two reads, which META does not know of', async () => {
    ddb.on(GetCommand).resolves({ Item: metaItem({ nextSeq: 3 }) });
    ddb.on(QueryCommand).resolves({ Items: [messageItem(1, 'a'), messageItem(2, 'b'), messageItem(3, 'late')] });
    expect((await db.readConversation(SUB, NOW)).messages.map((m) => m.seq)).toEqual([1, 2]);
  });

  it('reads an answer without items as no messages', async () => {
    ddb.on(GetCommand).resolves({ Item: metaItem() });
    ddb.on(QueryCommand).resolves({});
    expect((await db.readConversation(SUB, NOW)).messages).toEqual([]);
  });

  // A conversation runs out 24 hours after its last message and 48 hours after its first.
  it.each([
    { name: 'one second before 24 hours without a message', startedAt: -30 * HOUR, lastActivityAt: -24 * HOUR + 1, present: true },
    { name: '24 hours after the last message', startedAt: -30 * HOUR, lastActivityAt: -24 * HOUR, present: false },
    { name: 'one second before 48 hours after the first', startedAt: -48 * HOUR + 1, lastActivityAt: -HOUR, present: true },
    { name: '48 hours after the first message', startedAt: -48 * HOUR, lastActivityAt: -HOUR, present: false },
  ])('$name: present $present', async ({ startedAt, lastActivityAt, present }) => {
    ddb.on(GetCommand).resolves({ Item: metaItem({ startedAt: plus(NOW, startedAt * 1000), lastActivityAt: plus(NOW, lastActivityAt * 1000) }) });
    const read = await db.readConversation(SUB, NOW);
    expect(read.version).toBe(4);
    expect(read.conversation !== null).toBe(present);
    // A conversation that has run out is not read any further, whatever DynamoDB still holds.
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(present ? 1 : 0);
  });
});

describe('startConversation', () => {
  it('writes a first conversation in one transaction: META if absent, the messages, the daily use', async () => {
    const started = await db.startConversation(
      SUB,
      0,
      { language: 'it', promptVersion: 'p1' },
      step({ messages: [person('ciao')], status: 'working', inputTokens: 12, outputTokens: 3 }),
      NOW,
    );
    const content = JSON.stringify({ role: 'user', content: 'ciao' });
    expect(started).toEqual({
      conversationId: expect.stringMatching(ULID),
      language: 'it',
      status: 'working',
      startedAt: NOW,
      lastActivityAt: NOW,
      messageCount: 1,
      storedBytes: content.length,
      nextSeq: 2,
      promptVersion: 'p1',
      proposal: null,
      executing: null,
      version: 1,
      expiresAt: NOW_SECONDS + 48 * HOUR,
    });
    expect(transactions()).toEqual([
      [
        { Put: { TableName: TABLE, Item: { ...META_KEY, ...started }, ConditionExpression: 'attribute_not_exists(PK)' } },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: `CONV#${SUB}`,
              SK: `MSG#${started.conversationId}#000001`,
              seq: 1,
              kind: 'model',
              content,
              at: NOW,
              expiresAt: NOW_SECONDS + 48 * HOUR,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `USAGE#${SUB}`, SK: '2026-11-21' },
            UpdateExpression:
              'ADD #messages :messages, #inputTokens :inputTokens, #outputTokens :outputTokens SET #expiresAt = if_not_exists(#expiresAt, :expiresAt)',
            ExpressionAttributeNames: { '#messages': 'messages', '#inputTokens': 'inputTokens', '#outputTokens': 'outputTokens', '#expiresAt': 'expiresAt' },
            ExpressionAttributeValues: { ':messages': 1, ':inputTokens': 12, ':outputTokens': 3, ':expiresAt': NOW_SECONDS + 35 * 24 * HOUR },
          },
        },
      ],
    ]);
  });

  it('replaces an earlier conversation on the version read, with a new id, and deletes nothing', async () => {
    const started = await db.startConversation(SUB, 7, { language: 'en', promptVersion: 'p2' }, step({ messages: [person('hello')] }), NOW);
    expect(started.conversationId).not.toBe(CONVERSATION_ID);
    expect(started.version).toBe(8);
    const items = sent();
    expect(items[0]?.Put).toMatchObject({
      ConditionExpression: '#version = :read',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':read': 7 },
    });
    expect(items.every((item) => item.Delete === undefined)).toBe(true);
    expect(items[1]?.Put?.Item?.SK).toBe(`MSG#${started.conversationId}#000001`);
  });

  it.each([
    ['the version moved', cancelled('ConditionalCheckFailed', 'None', 'None')],
    ['a transaction was in conflict', cancelled('None', 'None', 'TransactionConflict')],
  ])('throws AssistantBusyError, without a retry, when %s', async (_name, error) => {
    ddb.on(TransactWriteCommand).rejects(error);
    await expect(db.startConversation(SUB, 0, { language: 'en', promptVersion: 'p1' }, step({ messages: [person('hi')] }), NOW)).rejects.toThrow(
      db.AssistantBusyError,
    );
    expect(transactions()).toHaveLength(1);
  });
});

describe('saveStep', () => {
  const metaUpdate = (values: Record<string, unknown>) => ({
    Update: {
      TableName: TABLE,
      Key: META_KEY,
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
      ExpressionAttributeValues: values,
    },
  });

  it('a message of the person: idle to working, counted in the conversation and in the day', async () => {
    const read = conversation();
    const saved = await db.saveStep(SUB, read, step({ messages: [person('book me Tuesday')], status: 'working' }), NOW);
    const bytes = JSON.stringify({ role: 'user', content: 'book me Tuesday' }).length;
    expect(saved).toEqual({ ...read, status: 'working', lastActivityAt: NOW, messageCount: 2, storedBytes: 30 + bytes, nextSeq: 4, version: 5 });
    const items = sent();
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual(
      metaUpdate({
        ':status': 'working',
        ':lastActivityAt': NOW,
        ':messageCount': 2,
        ':storedBytes': 30 + bytes,
        ':nextSeq': 4,
        ':proposal': null,
        ':executing': null,
        ':next': 5,
        ':read': 4,
        ':conversationId': CONVERSATION_ID,
      }),
    );
    expect(items[1]?.Put?.Item).toMatchObject({ SK: `MSG#${CONVERSATION_ID}#000003`, seq: 3, at: NOW, expiresAt: read.expiresAt });
    expect(usageOf(items)?.ExpressionAttributeValues).toMatchObject({ ':messages': 1, ':inputTokens': 0, ':outputTokens': 0 });
  });

  it('a read by Claude: working stays working, two entries stored, only tokens added to the day', async () => {
    const read = conversation({ status: 'working' });
    const saved = await db.saveStep(
      SUB,
      read,
      step({ messages: [answer('use get_calendar'), { kind: 'model', content: { role: 'user', content: 'the result' } }], status: 'working', inputTokens: 900, outputTokens: 40 }),
      NOW,
    );
    expect(saved).toMatchObject({ status: 'working', messageCount: 1, nextSeq: 5, version: 5 });
    const items = sent();
    expect(items.slice(1, 3).map((item) => item.Put?.Item?.SK)).toEqual([`MSG#${CONVERSATION_ID}#000003`, `MSG#${CONVERSATION_ID}#000004`]);
    expect(usageOf(items)?.ExpressionAttributeValues).toMatchObject({ ':messages': 0, ':inputTokens': 900, ':outputTokens': 40 });
  });

  it("Claude's text: working to idle", async () => {
    const saved = await db.saveStep(SUB, conversation({ status: 'working' }), step({ messages: [answer('Done.')], status: 'idle', outputTokens: 5 }), NOW);
    expect(saved.status).toBe('idle');
    expect(sent()[0]?.Update?.ExpressionAttributeValues).toMatchObject({ ':status': 'idle', ':proposal': null });
  });

  it('a change asked for: working to awaiting_confirmation, the proposal stored as given', async () => {
    const proposal = { proposalId: '01KAJ5V5Z0000000000000PROP', actions: [{ tool: 'book_appointment', input: { date: '2026-11-24' } }] };
    const saved = await db.saveStep(
      SUB,
      conversation({ status: 'working' }),
      step({ messages: [answer('use book_appointment')], status: 'awaiting_confirmation', proposal, inputTokens: 100 }),
      NOW,
    );
    expect(saved).toMatchObject({ status: 'awaiting_confirmation', proposal });
    expect(sent()[0]?.Update?.ExpressionAttributeValues).toMatchObject({ ':status': 'awaiting_confirmation', ':proposal': proposal });
  });

  it('a confirmation: the outcomes saved, awaiting_confirmation to working, the taken proposal no longer executing', async () => {
    const proposal = { proposalId: '01KAJ5V5Z0000000000000PROP' };
    const taken = conversation({ status: 'awaiting_confirmation', proposal, executing: { proposalId: proposal.proposalId, at: NOW }, version: 5 });
    const settled = { ...proposal, outcomes: ['done'] };
    const saved = await db.saveStep(SUB, taken, step({ messages: [{ kind: 'model', content: { role: 'user', content: 'outcome' } }], status: 'working', proposal: settled }), NOW);
    expect(saved).toMatchObject({ status: 'working', proposal: settled, executing: null, version: 6 });
    expect(sent()[0]?.Update?.ExpressionAttributeValues).toMatchObject({ ':executing': null, ':proposal': settled, ':read': 5 });
  });

  it('a decline: awaiting_confirmation to idle with a notice, nothing added to the day', async () => {
    const waiting = conversation({ status: 'awaiting_confirmation', proposal: { proposalId: '01KAJ5V5Z0000000000000PROP' } });
    const saved = await db.saveStep(SUB, waiting, step({ messages: [{ kind: 'notice', content: 'Nothing was changed.' }], status: 'idle' }), NOW);
    expect(saved).toMatchObject({ status: 'idle', proposal: null, messageCount: 1 });
    const items = sent();
    expect(items).toHaveLength(2);
    expect(items[1]?.Put?.Item).toMatchObject({ kind: 'notice', content: '"Nothing was changed."' });
    expect(usageOf(items)).toBeUndefined();
  });

  it('the person writes instead: the proposal dropped, awaiting_confirmation to working', async () => {
    const waiting = conversation({ status: 'awaiting_confirmation', proposal: { proposalId: '01KAJ5V5Z0000000000000PROP' } });
    const saved = await db.saveStep(SUB, waiting, step({ messages: [{ kind: 'notice', content: 'Nothing was changed.' }, person('no, at eleven')], status: 'working' }), NOW);
    expect(saved).toMatchObject({ status: 'working', proposal: null, messageCount: 2, nextSeq: 5 });
  });

  it('counts the bytes of what is stored, not the characters, and only the messages of the person', async () => {
    const text = 'Così, perché no? 😀';
    const first = JSON.stringify({ role: 'user', content: text });
    const second = JSON.stringify({ role: 'assistant', content: 'Sì.' });
    const saved = await db.saveStep(SUB, conversation({ storedBytes: 0, messageCount: 0 }), step({ messages: [person(text), answer('Sì.')] }), NOW);
    const bytes = new TextEncoder().encode(first).length + new TextEncoder().encode(second).length;
    expect(bytes).toBeGreaterThan(first.length + second.length);
    expect(saved).toMatchObject({ storedBytes: bytes, messageCount: 1 });
    expect(sent()[1]?.Put?.Item?.content).toBe(first);
  });

  it('puts the expiry of the conversation on every message, whenever it is written', async () => {
    const read = conversation({ expiresAt: 1_800_000_000 });
    await db.saveStep(SUB, read, step({ messages: [person('a'), answer('b')] }), plus(NOW, 5 * HOUR * 1000));
    expect(sent().slice(1, 3).map((item) => item.Put?.Item?.expiresAt)).toEqual([1_800_000_000, 1_800_000_000]);
  });

  it.each([
    ['the version moved', cancelled('ConditionalCheckFailed', 'None')],
    ['a transaction was in conflict', cancelled('TransactionConflict', 'None')],
  ])('throws AssistantBusyError, without a retry, when %s', async (_name, error) => {
    ddb.on(TransactWriteCommand).rejects(error);
    await expect(db.saveStep(SUB, conversation(), step({ messages: [answer('x')] }), NOW)).rejects.toThrow(db.AssistantBusyError);
    expect(transactions()).toHaveLength(1);
  });

  it.each([
    ['a cancellation for another reason', cancelled('ValidationError', 'None')],
    ['a cancellation without reasons', new TransactionCanceledException({ message: 'cancelled', $metadata: {} })],
    ['any other failure', new Error('network')],
  ])('passes on %s', async (_name, error) => {
    ddb.on(TransactWriteCommand).rejects(error);
    await expect(db.saveStep(SUB, conversation(), step({ messages: [answer('x')] }), NOW)).rejects.toBe(error);
  });
});

describe('takeProposal', () => {
  const PROPOSAL = '01KAJ5V5Z0000000000000PROP';
  const waiting = () => conversation({ status: 'awaiting_confirmation', proposal: { proposalId: PROPOSAL, actions: [] } });

  it('marks the waiting proposal as being executed, on the version read', async () => {
    const taken = await db.takeProposal(SUB, waiting(), PROPOSAL, NOW);
    expect(taken).toEqual({ ...waiting(), executing: { proposalId: PROPOSAL, at: NOW }, version: 5 });
    expect(updates()).toEqual([
      {
        TableName: TABLE,
        Key: META_KEY,
        UpdateExpression: 'SET #executing = :executing, #version = :next',
        ConditionExpression: '#version = :read AND #conversationId = :conversationId',
        ExpressionAttributeNames: { '#executing': 'executing', '#version': 'version', '#conversationId': 'conversationId' },
        ExpressionAttributeValues: { ':executing': { proposalId: PROPOSAL, at: NOW }, ':next': 5, ':read': 4, ':conversationId': CONVERSATION_ID },
      },
    ]);
  });

  it('of two takes at once, one wins and the other is not taken', async () => {
    ddb.on(UpdateCommand).resolvesOnce({}).rejectsOnce(conditionFailed());
    const [first, second] = await Promise.all([db.takeProposal(SUB, waiting(), PROPOSAL, NOW), db.takeProposal(SUB, waiting(), PROPOSAL, NOW)]);
    expect(first?.executing).toEqual({ proposalId: PROPOSAL, at: NOW });
    expect(second).toBeNull();
  });

  it('is not taken when the item is in another transaction', async () => {
    ddb.on(UpdateCommand).rejects(conflict());
    expect(await db.takeProposal(SUB, waiting(), PROPOSAL, NOW)).toBeNull();
  });

  it.each([
    ['another proposal is the one waiting', () => waiting(), '01KAJ5V5Z000000000000OTHER'],
    ['no proposal is waiting', () => conversation(), PROPOSAL],
    ['the proposal is already being executed', () => ({ ...waiting(), executing: { proposalId: PROPOSAL, at: NOW } }), PROPOSAL],
  ])('is not taken, and nothing is written, when %s', async (_name, read, proposalId) => {
    expect(await db.takeProposal(SUB, read(), proposalId, NOW)).toBeNull();
    expect(updates()).toHaveLength(0);
  });

  it('passes on any other failure', async () => {
    const error = new Error('network');
    ddb.on(UpdateCommand).rejects(error);
    await expect(db.takeProposal(SUB, waiting(), PROPOSAL, NOW)).rejects.toBe(error);
  });
});

describe('endConversation', () => {
  it('leaves the META item naming no conversation, on the version read, and deletes nothing', async () => {
    await db.endConversation(SUB, 4);
    expect(updates()).toEqual([
      {
        TableName: TABLE,
        Key: META_KEY,
        UpdateExpression: 'SET #conversationId = :none, #status = :idle, #proposal = :none, #executing = :none, #version = :next',
        ConditionExpression: '#version = :read',
        ExpressionAttributeNames: { '#conversationId': 'conversationId', '#status': 'status', '#proposal': 'proposal', '#executing': 'executing', '#version': 'version' },
        ExpressionAttributeValues: { ':none': null, ':idle': 'idle', ':next': 5, ':read': 4 },
      },
    ]);
    expect(ddb.calls()).toHaveLength(1);
  });

  it('writes nothing for a person who never had a conversation', async () => {
    await db.endConversation(SUB, 0);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    ['the version moved', conditionFailed],
    ['the item is in another transaction', conflict],
  ])('throws AssistantBusyError when %s', async (_name, error) => {
    ddb.on(UpdateCommand).rejects(error());
    await expect(db.endConversation(SUB, 4)).rejects.toThrow(db.AssistantBusyError);
  });

  it('passes on any other failure', async () => {
    const error = new Error('network');
    ddb.on(UpdateCommand).rejects(error);
    await expect(db.endConversation(SUB, 4)).rejects.toBe(error);
  });
});

// The day of the daily use is the calendar's local date. In Europe/Rome the clocks go forward on
// 2027-03-28 (a day of 23 hours) and back on 2027-10-31 (a day of 25 hours).
describe('the daily use', () => {
  const DATES = [
    { name: 'just before local midnight', now: '2026-11-20T22:59:59.000Z', date: '2026-11-20' },
    { name: 'at local midnight', now: '2026-11-20T23:00:00.000Z', date: '2026-11-21' },
    { name: 'the last second of the day the clocks go forward', now: '2027-03-28T21:59:59.000Z', date: '2027-03-28' },
    { name: 'the first second after it', now: '2027-03-28T22:00:00.000Z', date: '2027-03-29' },
    { name: 'the first second of the day the clocks go back', now: '2027-10-30T22:00:00.000Z', date: '2027-10-31' },
    { name: 'its last second, 25 hours later', now: '2027-10-31T22:59:59.000Z', date: '2027-10-31' },
    { name: 'the first second after it', now: '2027-10-31T23:00:00.000Z', date: '2027-11-01' },
  ];

  it.each(DATES)('a step is counted on $date: $name', async ({ now, date }) => {
    await db.saveStep(SUB, conversation({ startedAt: now, lastActivityAt: now }), step({ messages: [person('hi')] }), now);
    const usage = usageOf(sent());
    expect(usage?.Key).toEqual({ PK: `USAGE#${SUB}`, SK: date });
    expect(usage?.ExpressionAttributeValues?.[':expiresAt']).toBe(Date.parse(now) / 1000 + 35 * 24 * HOUR);
  });

  it.each(DATES)('is read from $date: $name', async ({ now, date }) => {
    await db.readDailyUse(SUB, now, ZONE);
    expect(ddb.commandCalls(GetCommand).map((call) => call.args[0].input)).toEqual([
      { TableName: TABLE, Key: { PK: `USAGE#${SUB}`, SK: date }, ConsistentRead: true },
    ]);
  });

  it('follows the time zone it is given', async () => {
    await db.readDailyUse(SUB, '2026-11-20T23:30:00.000Z', 'America/New_York');
    expect(ddb.commandCalls(GetCommand)[0]?.args[0].input.Key).toEqual({ PK: `USAGE#${SUB}`, SK: '2026-11-20' });
  });

  it('is zero when nothing was used that day', async () => {
    expect(await db.readDailyUse(SUB, NOW, ZONE)).toEqual({ messages: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('is what the item holds, and nothing else of it', async () => {
    ddb.on(GetCommand).resolves({ Item: { PK: `USAGE#${SUB}`, SK: '2026-11-21', messages: 7, inputTokens: 5400, outputTokens: 610, expiresAt: 1 } });
    expect(await db.readDailyUse(SUB, NOW, ZONE)).toEqual({ messages: 7, inputTokens: 5400, outputTokens: 610 });
  });
});
