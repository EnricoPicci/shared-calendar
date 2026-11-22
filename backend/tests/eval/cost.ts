// What a request to Claude costs, from its token counts
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 14). Pure.

// The tokens of one or more requests, named as the log line of a step names them.
export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const NO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

// Anthropic's prices in US dollars per million tokens, for the models the template allows: input
// that is not cached, output, input read from the cache, and input written to the cache that
// lasts five minutes, the one the assistant's requests use. Read on PRICES_READ_ON from
// PRICES_PAGE, the table "Model pricing". The Haiku model costs more for a prompt over 100 000
// tokens, which no request of the assistant comes near: a conversation is full long before.
export const PRICES_READ_ON = '2026-11-22';
export const PRICES_PAGE = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const PRICES: Record<string, Usage> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** The cost of these tokens on this model, in US cents. Throws for a model with no price here. */
export function cents(model: string, usage: Usage): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price is known for the model ${model}`);
  const dollars = (usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite) / 1_000_000;
  return dollars * 100;
}

/** What the same tokens would have cost with no cache: every input token at the full price. */
export function centsWithoutCache(model: string, usage: Usage): number {
  return cents(model, { input: usage.input + usage.cacheRead + usage.cacheWrite, output: usage.output, cacheRead: 0, cacheWrite: 0 });
}

/** The middle value of a list of numbers (the mean of the two middle ones), 0 for none. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
