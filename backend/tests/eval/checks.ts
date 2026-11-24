// What the evaluation checks of an exchange with the real model
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3). Every check is mechanical: it looks at what
// Claude asked of the tools and at what the server made of it, never at the wording of an answer.
// Pure: a check is given what was seen and says what is wrong, or nothing.

// One request of Claude for a tool, as the conversation stores it, and which message of the
// request it answered, counted from 0 (absent: not known).
export type ToolRequest = { name: string; input: Record<string, unknown>; message?: number };

// One change of a proposal as the server stored it: the tool, and the request its route would be
// sent at the confirmation. That request, not the sentence shown, is what is checked.
export type Change = { tool: string; call: { routeKey: string; path: string; body?: unknown }; summary: string };

// What was seen of one request of the list, at the end of its last message and before the
// evaluation itself declined or confirmed anything.
export type Seen = {
  // Every tool Claude asked for, over all the messages of the request, in order.
  requests: ToolRequest[];
  // The proposal waiting at the end, or null.
  proposal: Change[] | null;
  // What came of each change, when the evaluation confirmed the proposal: `done`, `unknown`, or
  // `refused:` and the route's code. Null when nothing was confirmed.
  outcomes: string[] | null;
  // The status of the last answer, and the language of the conversation.
  status: string;
  language: string | null;
  // How many times Claude was asked.
  steps: number;
};

export type Check = { what: string; failed: (seen: Seen) => string | null };

// What a value must be: a fixed value, a text matched by a pattern, or anything a function accepts.
type Wanted = unknown;

/**
 * Whether `actual` holds everything `wanted` names. An object may hold more fields than wanted.
 * A list must have the same length, each wanted item found in an item of its own, in any order.
 */
export function holds(actual: unknown, wanted: Wanted): boolean {
  if (wanted instanceof RegExp) return typeof actual === 'string' && wanted.test(actual);
  if (typeof wanted === 'function') return (wanted as (value: unknown) => boolean)(actual);
  if (Array.isArray(wanted)) {
    if (!Array.isArray(actual) || actual.length !== wanted.length) return false;
    const left = [...actual];
    return wanted.every((item) => {
      const at = left.findIndex((candidate) => holds(candidate, item));
      if (at === -1) return false;
      left.splice(at, 1);
      return true;
    });
  }
  if (wanted !== null && typeof wanted === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(wanted).every(([key, value]) => holds((actual as Record<string, unknown>)[key], value));
  }
  return actual === wanted;
}

const names = (seen: Seen) => seen.requests.map((request) => request.name);
const show = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => (item instanceof RegExp || typeof item === 'function' ? String(item) : item));
const inputsOf = (seen: Seen, tools: string[]) => seen.requests.filter((request) => tools.includes(request.name));

/** At least one of these tools was asked for. */
export const asked = (...tools: string[]): Check => ({
  what: `asks for ${tools.join(' or ')}`,
  failed: (seen) => (names(seen).some((name) => tools.includes(name)) ? null : `asked for ${show(names(seen))}`),
});

/** No tool but these was asked for. */
export const askedOnly = (...tools: string[]): Check => ({
  what: `asks for nothing but ${tools.join(', ')}`,
  failed: (seen) => {
    const others = names(seen).filter((name) => !tools.includes(name));
    return others.length === 0 ? null : `also asked for ${show(others)}`;
  },
});

/** No tool at all was asked for. */
export const askedNothing = (): Check => ({
  what: 'asks for no tool',
  failed: (seen) => (seen.requests.length === 0 ? null : `asked for ${show(names(seen))}`),
});

/** These tools were asked for in this order, whatever else was asked between them. */
export const askedInOrder = (...tools: string[]): Check => ({
  what: `asks for ${tools.join(', then ')}`,
  failed: (seen) => {
    let next = 0;
    for (const name of names(seen)) if (name === tools[next]) next += 1;
    return next === tools.length ? null : `asked for ${show(names(seen))}`;
  },
});

/** One of these tools was asked with an input that holds one of the wanted inputs. */
export const askedWith = (tools: string | string[], ...wanted: Wanted[]): Check => {
  const list = Array.isArray(tools) ? tools : [tools];
  return {
    what: `asks ${list.join(' or ')} with ${wanted.map(show).join(' or ')}`,
    failed: (seen) => {
      const inputs = inputsOf(seen, list).map((request) => request.input);
      return inputs.some((input) => wanted.some((one) => holds(input, one))) ? null : `the inputs were ${show(inputs)}`;
    },
  };
};

/**
 * One of these tools was asked for a period that holds `date` and is at most `longest` days long:
 * a reading of that day, of its week, but not of a month that happens to hold it.
 */
export const readsDay = (tools: string | string[], date: string, longest = 7): Check => {
  const list = Array.isArray(tools) ? tools : [tools];
  const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return {
    what: `asks ${list.join(' or ')} for ${date}, at most ${longest} days`,
    failed: (seen) => {
      const inputs = inputsOf(seen, list).map((request) => request.input);
      const fits = inputs.some(({ from, to }) => typeof from === 'string' && typeof to === 'string' && from <= date && date <= to && days(from, to) <= longest);
      return fits ? null : `the inputs were ${show(inputs)}`;
    },
  };
};

/**
 * No request of this tool before the message `message` (counted from 0) held the wanted input:
 * what the person must ask for first, such as going over the capacity, was not done on Claude's
 * own.
 */
export const notBefore = (message: number, tool: string, wanted: Wanted): Check => ({
  what: `asks ${tool} with ${show(wanted)} only from message ${message + 1} on`,
  failed: (seen) => {
    const early = seen.requests.filter((request) => request.name === tool && (request.message ?? 0) < message && holds(request.input, wanted));
    return early.length === 0 ? null : `asked it before: ${show(early.map((request) => request.input))}`;
  },
});

/** No proposal waits at the end. */
export const noProposal = (): Check => ({
  what: 'proposes nothing',
  failed: (seen) => (seen.proposal === null ? null : `proposed ${show(seen.proposal.map((change) => change.tool))}`),
});

// One change a proposal must hold: its tool and, when given, a part of its route's path and what
// the body sent to the route must hold.
export type WantedChange = { tool: string; path?: string; body?: Wanted };

/** A proposal waits at the end and holds exactly these changes, in any order. */
export const proposes = (...changes: WantedChange[]): Check => ({
  what: `proposes ${changes.map((change) => change.tool).join(' and ')}`,
  failed: (seen) => {
    if (seen.proposal === null) return 'proposed nothing';
    const stored = seen.proposal.map(({ tool, call }) => ({ tool, path: call.path, body: call.body ?? null }));
    const wanted = changes.map(({ tool, path, body }) => ({
      tool,
      ...(path !== undefined && { path: (value: unknown) => typeof value === 'string' && value.includes(path) }),
      ...(body !== undefined && { body }),
    }));
    return holds(stored, wanted) ? null : `proposed ${show(stored)}, wanted ${show(changes)}`;
  },
});

/** The first sentence of the proposal starts with these words: the server wrote it in this language. */
export const proposalStarts = (words: string): Check => ({
  what: `the proposal's sentence starts "${words}"`,
  failed: (seen) => {
    const summary = seen.proposal?.[0]?.summary ?? null;
    return summary?.startsWith(words) ? null : `the sentence was ${show(summary)}`;
  },
});

/** The confirmation the evaluation made had these outcomes, one per change in order. */
export const outcomes = (...wanted: string[]): Check => ({
  what: `the confirmation gives ${wanted.join(', ')}`,
  failed: (seen) => (show(seen.outcomes) === show(wanted) ? null : `the outcomes were ${show(seen.outcomes)}`),
});

/** The last answer has this status. */
export const status = (wanted: string): Check => ({
  what: `ends ${wanted}`,
  failed: (seen) => (seen.status === wanted ? null : `ended ${seen.status}`),
});

/** The conversation is in this language. */
export const language = (wanted: string): Check => ({
  what: `the conversation is in ${wanted}`,
  failed: (seen) => (seen.language === wanted ? null : `the language was ${show(seen.language)}`),
});

/** Claude was asked at most this many times. */
export const atMostSteps = (most: number): Check => ({
  what: `takes at most ${most} steps`,
  failed: (seen) => (seen.steps <= most ? null : `took ${seen.steps} steps`),
});

/** Passes when one of the checks passes: for a request that may rightly be answered in two ways. */
export const either = (...checks: Check[]): Check => ({
  what: checks.map((check) => check.what).join(', or '),
  failed: (seen) => {
    const failures = checks.map((check) => check.failed(seen));
    return failures.includes(null) ? null : failures.join('; and ');
  },
});

/** Passes when every check passes: to group the checks of one way inside `either`. */
export const all = (...checks: Check[]): Check => ({
  what: checks.map((check) => check.what).join(' and '),
  failed: (seen) => checks.map((check) => check.failed(seen)).find((failure) => failure !== null) ?? null,
});

/** The checks that failed, each as what was checked and what was seen instead. */
export function failures(checks: Check[], seen: Seen): string[] {
  return checks.flatMap((check) => {
    const failure = check.failed(seen);
    return failure === null ? [] : [`${check.what}: ${failure}`];
  });
}
