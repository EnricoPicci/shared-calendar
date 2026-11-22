import { addUsage, cents, centsWithoutCache, median, NO_USAGE, PRICES } from '../../eval/cost';

// What a request to Claude costs, from its tokens (docs/CONVERSATIONAL_ARCHITECTURE.md section 14).
describe('the cost of the tokens', () => {
  const usage = { input: 1_000, output: 500, cacheRead: 10_000, cacheWrite: 2_000 };

  it('prices each kind of token of a model, in US cents', () => {
    // Input at two dollars a million tokens, output at ten, cached input at ten cents, and the
    // cache's writing at two and a half dollars.
    expect(cents('claude-sonnet-5-5', usage)).toBeCloseTo(1.3, 10);
    expect(cents('claude-haiku-5-5', usage)).toBeCloseTo(0.07, 10);
    expect(cents('claude-sonnet-5-5', NO_USAGE)).toBe(0);
  });

  it('says what the same tokens cost with no cache', () => {
    // All the input, thirteen thousand tokens, at the full price, and the output.
    expect(centsWithoutCache('claude-sonnet-5-5', usage)).toBeCloseTo(3.1, 10);
  });

  it('refuses a model it has no price for', () => {
    expect(() => cents('claude-unknown', usage)).toThrow('No price is known for the model claude-unknown');
  });

  it('has a price for each model the template allows', () => {
    expect(Object.keys(PRICES).sort()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
  });

  it('adds token counts', () => {
    expect(addUsage(usage, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toEqual({ input: 1_001, output: 502, cacheRead: 10_003, cacheWrite: 2_004 });
  });

  it('finds the median of none, of an odd and of an even number of values', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
