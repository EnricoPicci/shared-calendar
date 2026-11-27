import { PASSWORD_POLICY, PASSWORD_SYMBOLS, passwordProblems } from '@shared-calendar/shared';
import type { ChangePasswordFailureReason, NewPasswordProblem } from '../services/change-password.types';
import type { PasswordTexts } from '../texts/texts';

// The password screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): from what the three fields
// hold to the hints under them, and from a failure of the change to its sentence and its place.
// The screen "Choose your password" of a first sign-in uses the hints of its two fields, the new
// password and the new one again, from here too: one rule, one set of sentences.
// Pure; the words are the page texts' `password`, handed in first. The texts typed are arguments only: nothing here keeps them, and no value returned holds
// one (docs/FRONTEND_SERVICES.md section 2, rule 6).

// The three fields as the form holds them: the current password, the new one, the new one again.
export type PasswordFields = { current: string; next: string; again: string };

// What stands under each field: a sentence or none for the current password and for the new one
// again; for the new one, one sentence per condition it still misses, in the order of the shared
// rule, being the current one again last.
export type PasswordHints = { current: string | null; next: readonly string[]; again: string | null };

// The problems of a new password, as the service checks them (docs/FRONTEND_SERVICES.md section
// 8, decisions 63 and 64): the shared rule's, then being the current one again. The second only
// once a current password is typed, so that an empty form does not say it.
export function newProblems(current: string, next: string): NewPasswordProblem[] {
  const problems: NewPasswordProblem[] = passwordProblems(next);
  if (current !== '' && next === current) problems.push('same_as_current');
  return problems;
}

// The sentence of one problem, with the shared rule's own numbers and its 32 symbols.
export function problemText(texts: PasswordTexts, problem: NewPasswordProblem): string {
  const { problems } = texts;
  switch (problem) {
    case 'too_short':
      return problems.too_short(PASSWORD_POLICY.minimumLength);
    case 'too_long':
      return problems.too_long(PASSWORD_POLICY.maximumLength);
    case 'no_symbol':
      return problems.no_symbol([...PASSWORD_SYMBOLS].join(' '));
    default:
      return problems[problem];
  }
}

// The sentences of a list of problems.
export function problemTexts(texts: PasswordTexts, problems: readonly NewPasswordProblem[]): string[] {
  return problems.map((problem) => problemText(texts, problem));
}

// The hint under the new password typed again: none once it is the new password, letter for
// letter. The two are compared here, by the screen: the service receives the new one once
// (docs/FRONTEND_SERVICES.md section 8, decision 64).
export function againHint(texts: PasswordTexts, next: string, again: string): string | null {
  return again === '' ? texts.againEmpty : again === next ? null : texts.differ;
}

// The hints of the three fields.
export function passwordHints(texts: PasswordTexts, { current, next, again }: PasswordFields): PasswordHints {
  return {
    current: current === '' ? texts.currentEmpty : null,
    next: problemTexts(texts, newProblems(current, next)),
    again: againHint(texts, next, again),
  };
}

// The two fields of "Choose your password" (docs/FRONTEND_ARCHITECTURE.md section 5.1), and their
// hints: those of the password screen's two fields of the same name, without a current password.
export type NewPasswordFields = { next: string; again: string };
export type NewPasswordHints = { next: readonly string[]; again: string | null };

export function newPasswordHints(texts: PasswordTexts, { next, again }: NewPasswordFields): NewPasswordHints {
  return { next: problemTexts(texts, newProblems('', next)), again: againHint(texts, next, again) };
}

// Whether a hint of the two fields stands: while one does, the new password is not sent.
export function newHintStands(hints: NewPasswordHints): boolean {
  return hints.next.length > 0 || hints.again !== null;
}

// The hints of "Choose your password" while its fields are empty.
export function emptyNewHints(texts: PasswordTexts): NewPasswordHints {
  return newPasswordHints(texts, { next: '', again: '' });
}

// Whether any hint stands: while one does, the change cannot be asked for.
export function hintStands(hints: PasswordHints): boolean {
  return hints.current !== null || hints.next.length > 0 || hints.again !== null;
}

// The hints of an empty form: what the screen shows at its start and after its fields were
// emptied.
export function emptyHints(texts: PasswordTexts): PasswordHints {
  return passwordHints(texts, { current: '', next: '', again: '' });
}

// Where a failure of the change is said: a wrong current password under its field, any other
// reason under the form. `new_password_refused` is not among them: its problems are the new
// field's hints.
export type FailurePlace = 'current' | 'form';

export function failurePlace(reason: Exclude<ChangePasswordFailureReason, 'new_password_refused'>): FailurePlace {
  return reason === 'wrong_current_password' ? 'current' : 'form';
}
