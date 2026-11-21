// The fake Claude of the local stack (docs/ARCHITECTURE.md section 8): a stand-in for Anthropic's
// Messages API, so that the journeys run without an Anthropic account and always get the same
// answers. Plain Node, no dependency. It answers POST /v1/messages and nothing else, checks no key
// and never calls anything.
//
// What it answers is data, not code: the file of scripted answers that the journeys own
// (backend/tests/integration/fake-claude/answers.json), read again at every request, so a change
// to it needs no restart. The file has four parts:
//   answers    named answers, each a status and a body as Anthropic would send them
//   messages   the exact text of a message of the person -> the names of the answers to give, one
//              per step of the exchange it starts
//   language   the same for the language question, and the answer for a text nobody scripted
//   otherwise  the name of the answer for a message nobody scripted
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
  return { kind: `step ${answered + 1}`, name: steps[Math.min(answered, steps.length - 1)] };
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
  return { kind, name, status: answer.status, body: answer.body };
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
