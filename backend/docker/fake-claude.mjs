// The fake Claude of the local stack (docs/ARCHITECTURE.md section 8): a stand-in for Anthropic's
// Messages API, so that the journeys run without an Anthropic account and always get the same
// answers. Plain Node, no dependency. It answers POST /v1/messages and nothing else, checks no key
// and never calls anything.
//
// What it answers is data, not code: the file of scripted answers that the journeys own
// (backend/tests/integration/fake-claude/answers.json), read again at every request, so a change
// to it needs no restart. The file has four parts:
//   answers    named answers, each a status and a body as Anthropic would send them
//   messages   the exact text of a message of the person -> the steps of the exchange it starts,
//              one per request to Claude; the last one is given again if more requests come
//   language   the same for the language question, and the answer for a text nobody scripted
//   otherwise  the name of the answer for a message nobody scripted
// A step is the name of an answer, or { "once": name, "then": name }: the first answer the first
// time a request is made, the second when the very same request comes again. That is an outage
// that passes: the application asks again with nothing changed. It is the one thing the fake
// remembers between two requests, and it forgets it as soon as "then" is given.
//
// Four marks an answer can hold, each replaced from the request it answers:
//   {{application-line}}  in a text: the last line of the application in the request (the entry
//                         of role "system" that follows a message of the person), so that a
//                         journey can read what Claude was told about the time and the language.
//   {{date+N}}            anywhere, so in the input of a tool request too: the date N days after
//                         the date that line states, as YYYY-MM-DD. The fake knows no time zone
//                         and reads no clock: like the real Claude, it works a date out from the
//                         line the application wrote, so a journey and the fake always agree on
//                         what "today" is.
//   {{last-tool-result}}  in a text: the content of the last result of a tool in the request, so
//                         that a journey can read what Claude was given of the calendar.
//   {{appointment-id-N}}  anywhere, so in the input of a tool request too: the id of the Nth
//                         appointment (1 is the first) in the last result of a tool in the request,
//                         when that result is a list of appointments. An appointment's id is made
//                         by the server and cannot be scripted: like the real Claude, the fake
//                         takes it from the list it was just given.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = 9230;
const ANSWERS_FILE = process.env.ANSWERS_FILE ?? '/answers/answers.json';

// The text of a message of the person, or null for an entry that is not one: an answer of Claude,
// a line of the application, or a message that only carries the results of tools.
function personText(entry) {
  if (entry?.role !== 'user') return null;
  if (typeof entry.content === 'string') return entry.content.trim();
  const texts = (Array.isArray(entry.content) ? entry.content : []).filter((block) => block?.type === 'text').map((block) => block.text);
  return texts.length > 0 ? texts.join('').trim() : null;
}

// Which named answer a request gets, and what kind of request it was (for the log line).
function choose(request, script) {
  const entries = Array.isArray(request.messages) ? request.messages : [];
  let last = -1;
  entries.forEach((entry, index) => {
    if (personText(entry) !== null) last = index;
  });
  const text = last < 0 ? '' : personText(entries[last]);

  // The language question is the one request that asks for an answer in a fixed format.
  if (request.output_config?.format) {
    return { kind: 'language', name: script.language?.texts?.[text] ?? script.language?.otherwise };
  }

  // An exact text, not a marker inside one: a journey's sentence then cannot pick another
  // journey's answers by accident, and what a journey sends is what the file shows.
  const steps = script.messages?.[text];
  if (!Array.isArray(steps) || steps.length === 0) return { kind: 'not scripted', name: script.otherwise };
  // The step is counted from the conversation itself: one answer of Claude after the person's
  // message means the second step is asked for. The fake keeps nothing between two requests.
  const answered = entries.slice(last + 1).filter((entry) => entry?.role === 'assistant').length;
  return { kind: `step ${answered + 1}`, name: onceThen(steps[Math.min(answered, steps.length - 1)], request) };
}

// The requests that were given the "once" answer of a step and have not come again yet.
const givenOnce = new Set();

// The name a step gives this request: its own when it is a name, else "once" the first time this
// exact request is seen and "then" the second.
function onceThen(step, request) {
  if (typeof step === 'string' || typeof step?.once !== 'string' || typeof step?.then !== 'string') return step;
  const key = createHash('sha256').update(JSON.stringify([request.system, request.messages])).digest('hex');
  if (givenOnce.delete(key)) return step.then;
  givenOnce.add(key);
  return step.once;
}

const LINE_MARK = '{{application-line}}';
const RESULT_MARK = '{{last-tool-result}}';
const DATE_MARK = /\{\{date\+(\d+)\}\}/g;
const APPOINTMENT_MARK = /\{\{appointment-id-(\d+)\}\}/g;

// The last line of the application in the request, or null.
function applicationLine(request) {
  const lines = (Array.isArray(request.messages) ? request.messages : []).filter((entry) => entry?.role === 'system' && typeof entry.content === 'string');
  return lines.length > 0 ? lines[lines.length - 1].content : null;
}

// The content of the last result of a tool in the request, as text, or null.
function lastToolResult(request) {
  const results = (Array.isArray(request.messages) ? request.messages : [])
    .flatMap((entry) => (entry?.role === 'user' && Array.isArray(entry.content) ? entry.content : []))
    .filter((block) => block?.type === 'tool_result');
  if (results.length === 0) return null;
  const { content } = results[results.length - 1];
  return typeof content === 'string' ? content : JSON.stringify(content);
}

// The id of the appointment at `position` (from 1) in the last result of a tool in the request, or
// null when that result is not a list of appointments or is shorter.
function appointmentId(request, position) {
  try {
    const id = JSON.parse(lastToolResult(request) ?? 'null')?.appointments?.[position - 1]?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

// The date `days` after a date written YYYY-MM-DD. Plain calendar arithmetic: no time zone is involved.
function daysAfter(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Every string of a value, however deep, passed through `change`.
function mapStrings(value, change) {
  if (typeof value === 'string') return change(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, change));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)]));
  return value;
}

// The answer's body with its marks replaced; a body without content (an error) is given as it is.
function withMarks(body, request) {
  if (!Array.isArray(body?.content)) return body;
  const line = applicationLine(request);
  const today = line?.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  const dated = mapStrings(body.content, (text) =>
    text.replace(DATE_MARK, (mark, days) => (today ? daysAfter(today, Number(days)) : mark)).replace(APPOINTMENT_MARK, (mark, position) => appointmentId(request, Number(position)) ?? mark),
  );
  const inText = (text) =>
    text
      .split(LINE_MARK)
      .join(line ?? '(no line of the application in the request)')
      .split(RESULT_MARK)
      .join(lastToolResult(request) ?? '(no result of a tool in the request)');
  return { ...body, content: dated.map((block) => (block?.type === 'text' ? { ...block, text: inText(block.text) } : block)) };
}

const failure = (status, type, message) => ({ status, body: { type: 'error', error: { type, message }, request_id: 'req_fake' } });

function answerTo(method, url, raw) {
  if (method !== 'POST' || url !== '/v1/messages') return { kind: 'unknown address', ...failure(404, 'not_found_error', 'The fake Claude answers POST /v1/messages only.') };
  let request;
  try {
    request = JSON.parse(raw);
  } catch {
    return { kind: 'not JSON', ...failure(400, 'invalid_request_error', 'The request body is not valid JSON.') };
  }
  let script;
  try {
    script = JSON.parse(readFileSync(ANSWERS_FILE, 'utf8'));
  } catch {
    return { kind: 'answers file unreadable', ...failure(500, 'api_error', `The fake Claude cannot read ${ANSWERS_FILE} as JSON.`) };
  }
  const { kind, name } = choose(request ?? {}, script);
  const answer = script.answers?.[name];
  if (typeof answer?.status !== 'number' || answer.body === undefined) {
    return { kind, name, ...failure(500, 'api_error', `The fake Claude has no answer named "${name}" in ${ANSWERS_FILE}.`) };
  }
  return { kind, name, status: answer.status, body: withMarks(answer.body, request ?? {}) };
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const { kind, name, status, body } = answerTo(req.method, req.url, Buffer.concat(chunks).toString('utf8'));
    res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_fake' });
    res.end(JSON.stringify(body));
    // One line per request, never the body: the method, the address, the status, and which answer.
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${status} ${kind}${name ? ` -> ${name}` : ''}`);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`fake Claude listening on ${PORT}, answers from ${ANSWERS_FILE}`));
// As the container's first process Node ignores the stop signal unless told otherwise.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
