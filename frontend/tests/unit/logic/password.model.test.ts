import { PASSWORD_PROBLEMS } from '@shared-calendar/shared';
import {
  againHint,
  EMPTY_HINTS,
  EMPTY_NEW_HINTS,
  failurePlace,
  hintStands,
  newHintStands,
  newPasswordHints,
  newProblems,
  passwordHints,
  problemTexts,
} from '../../../src/logic/password.model';
import { PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from '../../../src/logic/texts';
import { useFarBrowserZone } from './zone';

// The pure part of the password screen: the hints of the three fields, and where a failure is
// said; and the hints of the two fields of "Choose your password", which are the same. No network, no DOM, and no password of a real account: made-up texts only.

const GOOD = 'Next-Password-2?';
const CURRENT = 'Current-Pass-1!';
const text = (...problems: (keyof typeof PASSWORD_PROBLEM_TEXT)[]) => problems.map((p) => PASSWORD_PROBLEM_TEXT[p]);

describe('password.model', () => {
  useFarBrowserZone();

  describe('newProblems', () => {
    it('a good new password, other than the current one, misses nothing', () => {
      expect(newProblems(CURRENT, GOOD)).toEqual([]);
    });

    it.each([
      ['Short-1!', ['too_short']],
      ['lower-case-only-1!', ['no_uppercase']],
      ['UPPER-CASE-ONLY-1!', ['no_lowercase']],
      ['No-Digit-Here-at-all!', ['no_digit']],
      ['NoSymbolHere1234', ['no_symbol']],
      ['With A-Space-1!', ['blank']],
      [`Aa1!${'x'.repeat(253)}`, ['too_long']],
      ['', ['too_short', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol']],
    ])('"%s" misses %j, in the order of the shared rule', (next, problems) => {
      expect(newProblems(CURRENT, next)).toEqual(problems);
    });

    it('the current password again: same_as_current, after the rule\'s problems', () => {
      expect(newProblems(GOOD, GOOD)).toEqual(['same_as_current']);
      expect(newProblems('short', 'short')).toEqual(['too_short', 'no_uppercase', 'no_digit', 'no_symbol', 'same_as_current']);
    });

    it('with no current password typed, an empty new one is not "the same"', () => {
      expect(newProblems('', '')).not.toContain('same_as_current');
    });
  });

  describe('problemTexts', () => {
    it('one sentence per problem, in the order given', () => {
      expect(problemTexts(['no_digit', 'too_short'])).toEqual([PASSWORD_PROBLEM_TEXT.no_digit, PASSWORD_PROBLEM_TEXT.too_short]);
      expect(problemTexts([])).toEqual([]);
    });
  });

  describe('passwordHints', () => {
    it('an empty form: each field says what to type, the new one every condition', () => {
      expect(passwordHints({ current: '', next: '', again: '' })).toEqual({
        current: PASSWORD_TEXTS.currentEmpty,
        next: text('too_short', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol'),
        again: PASSWORD_TEXTS.againEmpty,
      });
      expect(EMPTY_HINTS).toEqual(passwordHints({ current: '', next: '', again: '' }));
    });

    it('while the new password is typed, the conditions it still misses, one by one', () => {
      expect(passwordHints({ current: CURRENT, next: 'n', again: '' }).next).toEqual(text('too_short', 'no_uppercase', 'no_digit', 'no_symbol'));
      expect(passwordHints({ current: CURRENT, next: 'Next-Pass', again: '' }).next).toEqual(text('too_short', 'no_digit'));
      expect(passwordHints({ current: CURRENT, next: GOOD, again: '' }).next).toEqual([]);
    });

    it('the two new passwords differ: said under the second', () => {
      expect(passwordHints({ current: CURRENT, next: GOOD, again: 'Next-Password-2' }).again).toBe(PASSWORD_TEXTS.differ);
      expect(passwordHints({ current: CURRENT, next: GOOD, again: GOOD }).again).toBeNull();
    });

    it('the new one equal to the current: said under the new one', () => {
      expect(passwordHints({ current: GOOD, next: GOOD, again: GOOD }).next).toEqual(text('same_as_current'));
    });

    it('all three right: no hint stands', () => {
      const hints = passwordHints({ current: CURRENT, next: GOOD, again: GOOD });
      expect(hints).toEqual({ current: null, next: [], again: null });
      expect(hintStands(hints)).toBe(false);
    });

    it('any one hint stands on its own', () => {
      expect(hintStands({ current: 'x', next: [], again: null })).toBe(true);
      expect(hintStands({ current: null, next: ['x'], again: null })).toBe(true);
      expect(hintStands({ current: null, next: [], again: 'x' })).toBe(true);
    });

    it('no hint holds a password typed', () => {
      const hints = passwordHints({ current: CURRENT, next: 'Next-Pass', again: 'Something' });
      for (const secret of [CURRENT, 'Next-Pass', 'Something']) expect(JSON.stringify(hints)).not.toContain(secret);
    });
  });

  describe('againHint', () => {
    it('empty, different, then the same: two sentences, then none', () => {
      expect(againHint(GOOD, '')).toBe(PASSWORD_TEXTS.againEmpty);
      expect(againHint(GOOD, 'Next')).toBe(PASSWORD_TEXTS.differ);
      expect(againHint(GOOD, GOOD)).toBeNull();
    });
  });

  describe('newPasswordHints, for "Choose your password"', () => {
    it('two empty fields: every condition of the rule, and type it once more', () => {
      expect(EMPTY_NEW_HINTS).toEqual({ next: text('too_short', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol'), again: PASSWORD_TEXTS.againEmpty });
      expect(newHintStands(EMPTY_NEW_HINTS)).toBe(true);
    });

    it('the same sentences as the password screen for the same two fields, and nothing about a current password', () => {
      for (const fields of [
        { next: 'Next', again: '' },
        { next: 'next password', again: 'next' },
        { next: GOOD, again: GOOD },
      ]) {
        const full = passwordHints({ current: '', ...fields });
        expect(newPasswordHints(fields)).toEqual({ next: full.next, again: full.again });
      }
    });

    it('both right: no hint stands; any one hint stands on its own', () => {
      expect(newPasswordHints({ next: GOOD, again: GOOD })).toEqual({ next: [], again: null });
      expect(newHintStands({ next: [], again: null })).toBe(false);
      expect(newHintStands({ next: ['x'], again: null })).toBe(true);
      expect(newHintStands({ next: [], again: 'x' })).toBe(true);
    });

    it('no hint holds a password typed', () => {
      const hints = newPasswordHints({ next: 'Next-Pass', again: 'Something' });
      for (const secret of ['Next-Pass', 'Something']) expect(JSON.stringify(hints)).not.toContain(secret);
    });
  });

  describe('failurePlace', () => {
    it('a wrong current password under its field; every other reason under the form', () => {
      expect(failurePlace('wrong_current_password')).toBe('current');
      for (const reason of ['too_many_attempts', 'network', 'server', 'unexpected', 'not_signed_in'] as const) expect(failurePlace(reason), reason).toBe('form');
    });
  });

  it('every name of the shared rule has its sentence', () => {
    for (const problem of PASSWORD_PROBLEMS) expect(PASSWORD_PROBLEM_TEXT[problem], problem).not.toBe('');
  });
});
