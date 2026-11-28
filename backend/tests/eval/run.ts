import { localDateOf } from '@shared-calendar/shared';
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { api, API_URL, forgetDailyUse, queryAssistantPartition, realClaudeWired, storedEntries, subOf } from '../integration/setup';
import { atMostSteps, failures, language, status, type Change, type Check, type Seen, type ToolRequest } from './checks';
import { addUsage, cents, centsWithoutCache, median, NO_USAGE, PRICES_PAGE, PRICES_READ_ON, type Usage } from './cost';
import { evalRequests, type EvalRequest } from './requests';
import { calendarToday, foreignTypes, paperWorld, putSettings, readSettings, removeWeek, seedWeek, signInAdmin, type World } from './week';

// npm run assistant:eval -w backend: the evaluation of the assistant with the real model
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3). It makes the known week (week.ts) in the
// local calendar, plays the list (requests.ts) against the local API as a person's screen would,
// checks each exchange (checks.ts), says what it cost (cost.ts), and removes what it made.
//
// It costs money and does not answer the same way twice, so it is no part of the gate. It never
// calls Anthropic itself: the local API does. It refuses to start unless env.local.json wires the
// real Claude and the API is on this machine. It prints the list's own texts and Claude's answers,
// never a token of an account and never the key, which it does not read.
//
// What Claude asked of the tools is read from the stored conversation, in the local assistant
// table. The tokens, the model and the effort of each step are read from the log line the step
// wrote, in the file that keeps the output of npm run local:api.

const DEFAULT_LOG = '/tmp/shared-calendar-local-api.log';
// The requests to Claude one message may take, and one more call to see the exchange has ended.
const MOST_CONTINUES = 9;

type Options = { only: string[] | null; kind: string | null; ceilingUsd: number; out: string | null; hand: string | null; log: string; list: boolean };

function options(argv: string[]): Options {
  const opts: Options = { only: null, kind: null, ceilingUsd: 4, out: null, hand: null, log: DEFAULT_LOG, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [name, value] = [argv[i], argv[i + 1]];
    if (name === '--list') opts.list = true;
    else if (value === undefined) throw new Error(`${name} needs a value`);
    else if (name === '--only') opts.only = value.split(',');
    else if (name === '--kind') opts.kind = value;
    else if (name === '--ceiling') opts.ceilingUsd = Number(value);
    else if (name === '--out') opts.out = value;
    else if (name === '--hand') opts.hand = value;
    else if (name === '--log') opts.log = value;
    else throw new Error(`unknown argument ${name}`);
    if (name !== '--list') i += 1;
  }
  if (!(opts.ceilingUsd > 0)) throw new Error('--ceiling needs a number of US dollars above 0');
  return opts;
}

const USAGE_TEXT =
  'npm run assistant:eval -w backend -- [--only id,id] [--kind kind] [--ceiling dollars] [--out file.json] [--hand file.txt] [--log file] [--list]\n' +
  '  --only     play these requests alone        --kind   play one kind alone\n' +
  '  --ceiling  stop when the run has cost this much, in US dollars (4 when not given)\n' +
  '  --out      write the run as JSON here       --hand   write the answers to read by hand here\n' +
  `  --log      the file that keeps the output of local:api (${DEFAULT_LOG})\n` +
  '  --list     print the list and its checks, play nothing';

// ── The log line of a step ─────────────────────────────────────────────────────────────────────

type StepLine = { route: string; username: string; outcome: string; model?: string; effort?: string; modelMs?: number; usage?: Usage; languageUsage?: Usage; reason?: string; tools?: unknown[]; proposed?: string[] };

function linesFrom(file: string, offset: number): StepLine[] {
  const size = statSync(file).size;
  if (size <= offset) return [];
  const fd = openSync(file, 'r');
  const buffer = Buffer.alloc(size - offset);
  readSync(fd, buffer, 0, buffer.length, offset);
  closeSync(fd);
  const found: StepLine[] = [];
  for (const line of buffer.toString('utf8').split('\n')) {
    if (!line.startsWith('{') || !line.includes('"route":"POST /assistant/')) continue;
    try {
      found.push(JSON.parse(line) as StepLine);
    } catch {
      // A line cut in two by the moment of reading: it is whole at the next look.
    }
  }
  return found;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The line the request just made wrote: the first one after `offset` of that route and person.
// The handler writes it before it answers, and the file gets it a moment later.
async function stepLine(file: string, offset: number, route: string, username: string): Promise<StepLine | null> {
  for (let waited = 0; waited <= 10_000; waited += 200) {
    const line = linesFrom(file, offset).find((candidate) => candidate.username === username && (candidate.route === route || (route.endsWith('/confirm') && candidate.route.endsWith('/confirm'))));
    if (line) return line;
    await sleep(200);
  }
  return null;
}

// ── One request of the list ────────────────────────────────────────────────────────────────────

type Reply = { status?: string; language?: string | null; messages?: { from: string; text: string }[]; proposal?: { proposalId: string; actions: { summary: string; outcome: string | null; error: string | null }[] } | null; error?: string };

// One message of the person with the steps it took: an exchange.
type Exchange = { message: string; steps: number; modelMs: number[]; usage: Usage; cents: number; texts: string[]; kind: 'plain' | 'reading' | 'change' };

type Played = {
  id: string;
  kind: string;
  who: string;
  language: string;
  messages: string[];
  pass: boolean;
  failed: string[];
  steps: number;
  seconds: number;
  usage: Usage;
  cents: number;
  centsWithoutCache: number;
  models: string[];
  efforts: string[];
  exchanges: Exchange[];
  tools: ToolRequest[];
  toolErrors: string[];
  proposal: Change[] | null;
  outcomes: string[] | null;
  hand: string | null;
};

class NoLogLine extends Error {}

const USERNAMES = { admin: 'admin', anna: 'eval-anna', bruno: 'eval-bruno' };

async function play(request: EvalRequest, world: World, log: string): Promise<Played> {
  const token = world.tokens[request.who];
  const username = USERNAMES[request.who];
  const sub = subOf(token);
  await forgetDailyUse(sub);
  await api('DELETE', '/assistant/conversation', token);

  const exchanges: Exchange[] = [];
  const problems: string[] = [];
  const models = new Set<string>();
  const efforts = new Set<string>();
  let last: Reply = {};

  // One call that asks Claude, with the log line it wrote.
  const ask = async (exchange: Exchange, method: string, path: string, routeKey: string, body?: unknown): Promise<number> => {
    const offset = statSync(log).size;
    const res = await api(method, path, token, body);
    const line = await stepLine(log, offset, routeKey, username);
    if (line === null) throw new NoLogLine(`no log line of ${routeKey} appeared in ${log}`);
    const usage = addUsage(line.usage ?? NO_USAGE, line.languageUsage ?? NO_USAGE);
    exchange.usage = addUsage(exchange.usage, usage);
    if (line.model) {
      models.add(line.model);
      exchange.cents += cents(line.model, usage);
    }
    if (line.effort) efforts.add(line.effort);
    // An exchange in which a change was proposed or confirmed is a change, one that ran a tool a reading.
    if (line.proposed || routeKey.endsWith('/confirm')) exchange.kind = 'change';
    else if ((line.tools ?? []).length > 0 && exchange.kind === 'plain') exchange.kind = 'reading';
    if (res.status === 200) {
      last = res.body as Reply;
      exchange.steps += 1;
      if (line.modelMs !== undefined) exchange.modelMs.push(line.modelMs);
      exchange.texts.push(...(last.messages ?? []).filter((message) => message.from !== 'person').map((message) => `[${message.from}] ${message.text}`));
    } else {
      problems.push(`${routeKey} answered ${res.status} ${String(res.body?.error ?? '')}${line.reason ? ` (${line.reason})` : ''}`);
    }
    return res.status;
  };

  const goOn = async (exchange: Exchange) => {
    for (let n = 0; n < MOST_CONTINUES && last.status === 'working'; n += 1) {
      if ((await ask(exchange, 'POST', '/assistant/continue', 'POST /assistant/continue')) !== 200) break;
    }
  };

  for (const message of request.messages) {
    const exchange: Exchange = { message, steps: 0, modelMs: [], usage: NO_USAGE, cents: 0, texts: [], kind: 'plain' };
    exchanges.push(exchange);
    if ((await ask(exchange, 'POST', '/assistant/messages', 'POST /assistant/messages', { text: message, ...(request.pageLanguage && { language: request.pageLanguage }) })) !== 200) break;
    await goOn(exchange);
  }

  // What is stored, read before anything is declined, confirmed or ended.
  const meta = (await queryAssistantPartition(`CONV#${sub}`)).find((item) => item.SK === 'META');
  const stored = (meta?.proposal as { proposalId: string; changes: (Change & { outcome: string | null })[] } | null | undefined) ?? null;
  const waiting = stored !== null && last.status === 'awaiting_confirmation' ? stored.changes.map(({ tool, call, summary }) => ({ tool, call: { routeKey: call.routeKey, path: call.path, body: call.body }, summary })) : null;
  const seen: Seen = { requests: [], proposal: waiting, outcomes: null, status: last.status ?? 'none', language: last.language ?? null, steps: exchanges.reduce((sum, exchange) => sum + exchange.steps, 0) };

  if (waiting !== null && stored !== null) {
    const exchange = exchanges.at(-1)!;
    if (request.confirm && waiting.every((change) => request.confirm!.includes(change.tool))) {
      if ((await ask(exchange, 'POST', `/assistant/proposals/${stored.proposalId}/confirm`, 'POST /assistant/proposals/{proposalId}/confirm')) === 200) {
        seen.outcomes = (last.proposal?.actions ?? []).map((action) => (action.outcome === 'refused' ? `refused:${action.error}` : String(action.outcome)));
        await goOn(exchange);
      }
    } else {
      await api('POST', `/assistant/proposals/${stored.proposalId}/decline`, token);
    }
  }

  const entries = await storedEntries(token);
  const blocks = entries.filter((entry) => Array.isArray(entry.content)).flatMap((entry) => entry.content as { type: string; name?: string; input?: Record<string, unknown>; content?: string }[]);
  // Each request for a tool with the message of the person it answered: the person's messages are
  // the stored entries of role "user" whose content is a text.
  let message = -1;
  seen.requests = entries.flatMap((entry) => {
    if (entry.role === 'user' && typeof entry.content === 'string') message += 1;
    if (!Array.isArray(entry.content)) return [];
    return (entry.content as { type: string; name?: string; input?: Record<string, unknown> }[])
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({ name: block.name!, input: block.input ?? {}, message }));
  });
  const toolErrors = blocks
    .filter((block) => block.type === 'tool_result' && typeof block.content === 'string')
    .map((block) => {
      try {
        return (JSON.parse(block.content!) as { error?: unknown }).error;
      } catch {
        return undefined;
      }
    })
    .filter((error): error is string => typeof error === 'string');
  await api('DELETE', '/assistant/conversation', token);

  const ends: Check[] = request.ends === 'answer' ? [status('idle')] : request.ends === 'proposal' ? [status('awaiting_confirmation')] : [];
  const failed = [...problems, ...failures([...request.checks, ...ends, language(request.language), atMostSteps(8 * request.messages.length + 1)], seen)];
  const usage = exchanges.reduce((sum, exchange) => addUsage(sum, exchange.usage), NO_USAGE);
  const model = [...models][0];
  return {
    id: request.id,
    kind: request.kind,
    who: request.who,
    language: request.language,
    messages: request.messages,
    pass: failed.length === 0,
    failed,
    steps: seen.steps,
    seconds: exchanges.flatMap((exchange) => exchange.modelMs).reduce((sum, ms) => sum + ms, 0) / 1000,
    usage,
    cents: exchanges.reduce((sum, exchange) => sum + exchange.cents, 0),
    centsWithoutCache: model ? centsWithoutCache(model, usage) : 0,
    models: [...models],
    efforts: [...efforts],
    exchanges,
    tools: seen.requests,
    toolErrors,
    proposal: waiting,
    outcomes: seen.outcomes,
    hand: request.hand ?? null,
  };
}

// ── The run ────────────────────────────────────────────────────────────────────────────────────

const two = (n: number) => n.toFixed(2);
const out = (line: string) => process.stdout.write(`${line}\n`);

function line(played: Played): string {
  const u = played.usage;
  return `${played.pass ? 'PASS' : 'FAIL'}  ${played.id.padEnd(24)} ${played.who.padEnd(5)} ${played.language}  ${String(played.steps).padStart(2)} steps ${two(played.seconds).padStart(6)} s  in ${u.input} out ${u.output} read ${u.cacheRead} written ${u.cacheWrite}  ${two(played.cents)} c  ${played.models.join('+')} ${played.efforts.join('+')}`;
}

function totals(played: Played[], ceilingUsd: number, stopped: string | null) {
  const exchanges = played.flatMap((p) => p.exchanges);
  const stepMs = exchanges.flatMap((exchange) => exchange.modelMs);
  const of = (kind: string) => exchanges.filter((exchange) => exchange.kind === kind).map((exchange) => exchange.cents);
  return {
    requests: played.length,
    passed: played.filter((p) => p.pass).length,
    models: [...new Set(played.flatMap((p) => p.models))],
    efforts: [...new Set(played.flatMap((p) => p.efforts))],
    steps: stepMs.length,
    secondsPerStep: { median: median(stepMs) / 1000, slowest: Math.max(0, ...stepMs) / 1000 },
    centsPerExchange: { median: median(exchanges.map((e) => e.cents)), dearest: Math.max(0, ...exchanges.map((e) => e.cents)) },
    centsByKind: { plain: median(of('plain')), reading: median(of('reading')), change: median(of('change')) },
    usage: played.reduce((sum, p) => addUsage(sum, p.usage), NO_USAGE),
    cents: played.reduce((sum, p) => sum + p.cents, 0),
    centsWithoutCache: played.reduce((sum, p) => sum + p.centsWithoutCache, 0),
    ceilingUsd,
    stopped,
    prices: { page: PRICES_PAGE, readOn: PRICES_READ_ON },
  };
}

function handText(played: Played[]): string {
  return played
    .filter((p) => p.hand !== null || !p.pass)
    .map((p) =>
      [
        `── ${p.id} (${p.who}, ${p.language}) ${p.pass ? 'PASS' : 'FAIL'}`,
        ...(p.hand ? [`To read: ${p.hand}`] : []),
        ...p.failed.map((failure) => `Failed: ${failure}`),
        ...p.exchanges.flatMap((exchange) => [`> ${exchange.message}`, ...exchange.texts]),
        ...(p.tools.length > 0 ? [`Tools: ${p.tools.map((tool) => `${tool.name} ${JSON.stringify(tool.input)}`).join(' | ')}`] : []),
        ...(p.toolErrors.length > 0 ? [`Error results: ${p.toolErrors.join(', ')}`] : []),
        ...(p.proposal ?? []).map((change) => `Proposed: ${change.summary}`),
        ...(p.outcomes ? [`Outcomes: ${p.outcomes.join(', ')}`] : []),
        '',
      ].join('\n'),
    )
    .join('\n');
}

function printList(requests: EvalRequest[]): void {
  for (const request of requests) {
    out(`${request.id}  [${request.kind}]  ${request.who}, ${request.language}, ends with ${request.ends}${request.confirm ? ', confirmed' : ''}`);
    for (const message of request.messages) out(`    > ${message}`);
    for (const check of request.checks) out(`    - ${check.what}`);
    if (request.hand) out(`    by hand: ${request.hand}`);
  }
  out(`${requests.length} requests, ${requests.reduce((sum, request) => sum + request.messages.length, 0)} messages.`);
}

function chosen(requests: EvalRequest[], opts: Options): EvalRequest[] {
  const picked = requests.filter((request) => (opts.only === null || opts.only.includes(request.id)) && (opts.kind === null || request.kind === opts.kind));
  if (picked.length === 0) throw new Error('no request of the list has that id or kind');
  return picked;
}

// Why the run must not start, or null.
function refusal(opts: Options): string | null {
  if (!existsSync('env.local.json')) return 'env.local.json is missing: start the local stack (npm run local:up -w backend).';
  if (!realClaudeWired()) {
    return 'env.local.json wires the fake Claude: the evaluation judges the real model. Run npm run local:up with ANTHROPIC_API_KEY set for that command, then restart npm run local:api.';
  }
  const host = new URL(API_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') return `refused: the API at ${API_URL} is not on this machine.`;
  if (!existsSync(opts.log)) return `${opts.log} is missing: start the API with npm run local:api -w backend 2>&1 | tee ${opts.log}, so that the tokens of each step can be read.`;
  return null;
}

async function main(): Promise<number> {
  let opts: Options;
  try {
    opts = options(process.argv.slice(2));
  } catch (err) {
    out(`assistant:eval: ${(err as Error).message}\n${USAGE_TEXT}`);
    return 1;
  }
  if (opts.list) {
    const zone = 'Europe/Rome';
    printList(chosen(evalRequests(paperWorld(localDateOf(new Date().toISOString(), zone), zone)), opts));
    return 0;
  }
  const why = refusal(opts);
  if (why !== null) {
    out(`assistant:eval: ${why}`);
    return 1;
  }

  // The local tables are read and written directly for two things: the stored conversation and
  // the count of the day. Asked once here, so that a wrong port is said before anything is made.
  try {
    await queryAssistantPartition('USAGE#nobody');
  } catch (err) {
    out(`assistant:eval: the local assistant table cannot be read (${(err as Error).name}). Pass the same DYNAMODB_PORT as npm run local:up.`);
    return 1;
  }
  const admin = await signInAdmin();
  await removeWeek(admin, (text) => out(`left by an earlier run: ${text}`));
  const foreign = await foreignTypes(admin);
  if (foreign.length > 0) {
    out(`assistant:eval: the local calendar holds types that are not the evaluation's (${foreign.join(', ')}). The known week is only known on an empty calendar: start the stack afresh (local:down, local:up, local:api).`);
    return 1;
  }

  const run: { stop: string | null } = { stop: null };
  process.on('SIGINT', () => {
    run.stop = 'interrupted';
    out('\nInterrupted: finishing the request under way, then removing the week.');
  });

  const settings = await readSettings(admin);
  const played: Played[] = [];
  let code = 0;
  try {
    const world = await seedWeek(admin);
    const { today } = await calendarToday(admin);
    const requests = chosen(evalRequests(world), opts);
    out(`The known week is made (today is ${today}). Playing ${requests.length} requests, ceiling ${two(opts.ceilingUsd)} USD.`);
    for (const request of requests) {
      if (run.stop !== null) break;
      let result: Played;
      try {
        result = await play(request, world, opts.log);
      } catch (err) {
        if (err instanceof NoLogLine) {
          run.stop = `${err.message}: without it the cost cannot be counted`;
          break;
        }
        result = { id: request.id, kind: request.kind, who: request.who, language: request.language, messages: request.messages, pass: false, failed: [`could not be played: ${(err as Error).name} ${(err as Error).message}`], steps: 0, seconds: 0, usage: NO_USAGE, cents: 0, centsWithoutCache: 0, models: [], efforts: [], exchanges: [], tools: [], toolErrors: [], proposal: null, outcomes: null, hand: request.hand ?? null };
      }
      played.push(result);
      out(line(result));
      for (const failure of result.failed) out(`      ${failure}`);
      if (result.failed.some((failure) => failure.includes('assistant_budget_reached'))) run.stop = "Anthropic's spending limit is reached";
      const spent = played.reduce((sum, p) => sum + p.cents, 0) / 100;
      if (run.stop === null && spent > opts.ceilingUsd) run.stop = `the ceiling of ${two(opts.ceilingUsd)} USD is passed (${two(spent)} USD spent)`;
    }
  } catch (err) {
    run.stop = `failed: ${(err as Error).message}`;
  } finally {
    await putSettings(admin, settings);
    await removeWeek(admin, () => undefined);
  }

  const sum = totals(played, opts.ceilingUsd, run.stop);
  out('');
  out(`${sum.passed} of ${sum.requests} passed, ${sum.steps} steps, on ${sum.models.join('+') || 'no model'} at effort ${sum.efforts.join('+') || 'unknown'}.`);
  out(`Seconds per step: median ${two(sum.secondsPerStep.median)}, slowest ${two(sum.secondsPerStep.slowest)}.`);
  out(`Cents per exchange: median ${two(sum.centsPerExchange.median)}, dearest ${two(sum.centsPerExchange.dearest)}; a plain answer ${two(sum.centsByKind.plain)}, a reading ${two(sum.centsByKind.reading)}, a change ${two(sum.centsByKind.change)}.`);
  out(`Tokens: input ${sum.usage.input}, output ${sum.usage.output}, cache read ${sum.usage.cacheRead}, cache written ${sum.usage.cacheWrite}.`);
  out(`Cost: ${two(sum.cents)} US cents (${two(sum.centsWithoutCache)} without the cache), by the prices read on ${PRICES_READ_ON}.`);
  if (run.stop !== null) {
    out(`STOPPED: ${run.stop}.`);
    code = 2;
  }
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify({ at: new Date().toISOString(), totals: sum, requests: played }, null, 2)}\n`);
  const hand = handText(played);
  if (opts.hand) writeFileSync(opts.hand, hand);
  else if (hand) out(`\nTo read by hand:\n\n${hand}`);
  out('The known week is removed.');
  return code !== 0 ? code : sum.passed === sum.requests ? 0 : 3;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    out(`assistant:eval: ${(err as Error).message}`);
    process.exit(1);
  },
);
