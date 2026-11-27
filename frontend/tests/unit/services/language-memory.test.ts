import { LANGUAGE_KEY, LanguageMemory } from '../../../src/services/language-memory';

// What the browser remembers of the page's language (docs/MULTILANGUAGE_PLAN.md finding F11).
describe('LanguageMemory', () => {
  const storage = (held: Record<string, string> = {}) => ({
    getItem: vi.fn((key: string) => held[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      held[key] = value;
    }),
  });
  const refusing = () => ({
    getItem: vi.fn(() => {
      throw new Error('SecurityError');
    }),
    setItem: vi.fn(() => {
      throw new Error('QuotaExceededError');
    }),
  });

  it('remembers a language in one entry, and reads it back', () => {
    const held = storage();
    const memory = new LanguageMemory(held);
    expect(memory.read()).toBeNull();
    memory.write('it');
    expect(held.setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'it');
    expect(memory.read()).toBe('it');
    expect(LANGUAGE_KEY).toBe('shared-calendar.language');
  });

  it.each(['fr', 'IT', '', 'it-IT'])('an entry "%s", which is no language of the calendar, counts as nothing', (value) => {
    expect(new LanguageMemory(storage({ [LANGUAGE_KEY]: value })).read()).toBeNull();
  });

  it('a storage that refuses counts as empty, and a write it refuses is forgotten in silence', () => {
    const memory = new LanguageMemory(refusing());
    expect(memory.read()).toBeNull();
    expect(() => memory.write('it')).not.toThrow();
  });

  it('no storage at all: nothing read, nothing written', () => {
    const memory = new LanguageMemory(null);
    expect(memory.read()).toBeNull();
    expect(() => memory.write('en')).not.toThrow();
  });
});
