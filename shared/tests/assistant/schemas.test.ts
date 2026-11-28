import { ASSISTANT_LIMITS, AssistantMessageBody, SUPPORTED_LANGUAGES } from '../../src/index';

// The body of POST /assistant/messages (docs/CONVERSATIONAL_ARCHITECTURE.md section 6): what it
// accepts, what it refuses, and that the text is trimmed before it is counted.
describe('AssistantMessageBody', () => {
  it.each([
    ['1 character', 'a'],
    ['2 000 characters', 'a'.repeat(2000)],
    ['line breaks inside', 'first line\nsecond line'],
  ])('accepts a text of %s', (_case, text) => {
    expect(AssistantMessageBody.safeParse({ text })).toEqual({ success: true, data: { text } });
  });

  it.each([
    ['an empty text', ''],
    ['a text of only spaces', '   \n\t '],
    ['a text of 2 001 characters', 'a'.repeat(2001)],
    ['a number', 42],
    ['null', null],
    ['a list', ['hello']],
  ])('rejects %s', (_case, text) => {
    expect(AssistantMessageBody.safeParse({ text }).success).toBe(false);
  });

  it('trims the text', () => {
    expect(AssistantMessageBody.safeParse({ text: '  book me Tuesday at ten \n' })).toEqual({
      success: true,
      data: { text: 'book me Tuesday at ten' },
    });
  });

  it('counts the characters after trimming', () => {
    const text = 'a'.repeat(2000);
    expect(AssistantMessageBody.safeParse({ text: `  ${text}  ` })).toEqual({ success: true, data: { text } });
  });

  it('counts UTF-16 code units, as a textarea does', () => {
    // One emoji is two code units: 1 000 of them fill the message, one more character does not fit.
    expect(AssistantMessageBody.safeParse({ text: '😀'.repeat(1000) }).success).toBe(true);
    expect(AssistantMessageBody.safeParse({ text: '😀'.repeat(1000) + 'a' }).success).toBe(false);
  });

  it('uses the limit of ASSISTANT_LIMITS', () => {
    expect(AssistantMessageBody.safeParse({ text: 'a'.repeat(ASSISTANT_LIMITS.messageLength) }).success).toBe(true);
    expect(AssistantMessageBody.safeParse({ text: 'a'.repeat(ASSISTANT_LIMITS.messageLength + 1) }).success).toBe(false);
  });

  it.each(SUPPORTED_LANGUAGES)('accepts the page\'s language %s beside the text', (language) => {
    expect(AssistantMessageBody.safeParse({ text: 'hello', language })).toEqual({ success: true, data: { text: 'hello', language } });
  });

  it.each(['fr', 'it-IT', '', 'IT', 3, null])('rejects a language that is not one of the list: %j', (language) => {
    expect(AssistantMessageBody.safeParse({ text: 'hello', language }).success).toBe(false);
  });

  it('rejects another field', () => {
    expect(AssistantMessageBody.safeParse({ text: 'hello', locale: 'it' }).success).toBe(false);
  });

  it('rejects a missing text', () => {
    expect(AssistantMessageBody.safeParse({}).success).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(AssistantMessageBody.safeParse('hello').success).toBe(false);
  });
});
