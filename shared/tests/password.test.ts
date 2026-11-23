import { Password, PASSWORD_POLICY, PASSWORD_PROBLEMS, PASSWORD_SYMBOLS, passwordProblems } from '../src/index';

// A password with every condition met, 12 characters: upper, lower, digit, symbol.
const GOOD = 'Abcdefgh1!xy';

// The list of issues the schema gives, by message.
function schemaProblems(text: unknown): string[] {
  const parsed = Password.safeParse(text);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

// Test names: the architecture is docs/ARCHITECTURE.md, which lists the 32 symbols.
describe('PASSWORD_SYMBOLS', () => {
  it('holds the 32 symbols of architecture 6.9, each once, in its order', () => {
    expect([...PASSWORD_SYMBOLS]).toEqual('^ $ * . [ ] { } ( ) ? " ! @ # % & / \\ , > < \' : ; | _ ~ ` = + -'.split(' '));
    expect(new Set(PASSWORD_SYMBOLS).size).toBe(32);
  });
});

describe('PASSWORD_POLICY', () => {
  it('is 12 to 256 characters with all four classes required', () => {
    expect(PASSWORD_POLICY).toEqual({
      minimumLength: 12,
      maximumLength: 256,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
    });
  });
});

describe('passwordProblems', () => {
  it('finds nothing in a good password, and the schema accepts it unchanged', () => {
    expect(passwordProblems(GOOD)).toEqual([]);
    expect(Password.safeParse(GOOD)).toEqual({ success: true, data: GOOD });
  });

  it.each([
    ['too_short', 'Abcdefg1!xy'],
    ['too_long', `Ab1!${'x'.repeat(253)}`],
    ['no_uppercase', 'abcdefgh1!xy'],
    ['no_lowercase', 'ABCDEFGH1!XY'],
    ['no_digit', 'Abcdefghi!xy'],
    ['no_symbol', 'Abcdefgh1axy'],
    ['blank', 'Abcdefgh1! xy'],
  ] as const)('each condition alone: %s', (problem, text) => {
    expect(passwordProblems(text)).toEqual([problem]);
    expect(schemaProblems(text)).toEqual([problem]);
  });

  it('the bounds: 11 is too short, 12 and 256 are fine, 257 is too long', () => {
    const of = (length: number) => `Ab1!${'x'.repeat(length - 4)}`;
    expect(of(11)).toHaveLength(11);
    expect(passwordProblems(of(11))).toEqual(['too_short']);
    expect(passwordProblems(of(12))).toEqual([]);
    expect(passwordProblems(of(256))).toEqual([]);
    expect(of(257)).toHaveLength(257);
    expect(passwordProblems(of(257))).toEqual(['too_long']);
  });

  it.each([...PASSWORD_SYMBOLS])('the symbol %s counts as a symbol', (symbol) => {
    expect(passwordProblems(`Abcdefgh1xy${symbol}`)).toEqual([]);
  });

  it.each([
    ['a space', ' '],
    ['a tab', '\t'],
    ['a line break', '\n'],
    ['a no-break space', ' '],
  ])('%s anywhere is blank, and is no symbol', (_case, blank) => {
    expect(passwordProblems(`${blank}${GOOD}`)).toEqual(['blank']);
    expect(passwordProblems(`${GOOD}${blank}`)).toEqual(['blank']);
    expect(passwordProblems(`Abcdefgh1x${blank}y`)).toEqual(['no_symbol', 'blank']);
  });

  it('a letter outside basic Latin counts as no letter', () => {
    expect(passwordProblems('ÀÉÎabcdefg1!')).toEqual(['no_uppercase']);
    expect(passwordProblems('ABCDEFGàéî1!')).toEqual(['no_lowercase']);
    expect(passwordProblems('ΑΒΓαβγδεζηθ1!')).toEqual(['no_uppercase', 'no_lowercase']);
  });

  it('a digit outside 0 to 9 counts as no digit, a character outside the 32 as no symbol', () => {
    expect(passwordProblems('Abcdefgh١!xy')).toEqual(['no_digit']);
    expect(passwordProblems('Abcdefgh1€xy')).toEqual(['no_symbol']);
  });

  it('other characters beyond the required ones are allowed', () => {
    expect(passwordProblems('Abcdefgh1!€éß漢字🙂')).toEqual([]);
  });

  it('lists every problem, in the order of PASSWORD_PROBLEMS', () => {
    expect(passwordProblems('')).toEqual(['too_short', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol']);
    expect(passwordProblems(' ')).toEqual(['too_short', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol', 'blank']);
    expect(schemaProblems(' ')).toEqual(passwordProblems(' '));
    expect(PASSWORD_PROBLEMS).toEqual(['too_short', 'too_long', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol', 'blank']);
  });

  it('the schema refuses a value that is not a string', () => {
    expect(Password.safeParse(42).success).toBe(false);
    expect(Password.safeParse(undefined).success).toBe(false);
  });
});
