import { passwordProblems } from '@shared-calendar/shared';
import type { ChangePasswordFailureReason, NewPasswordProblem } from '../services/change-password.types';
import { PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from './texts';

// The password screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): from what the three fields
// hold to the hints under them, and from a failure of the change to its sentence and its place.
// Pure. The texts typed are arguments only: nothing here keeps them, and no value returned holds
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

// The sentences of a list of problems.
export function problemTexts(problems: readonly NewPasswordProblem[]): string[] {
  return problems.map((problem) => PASSWORD_PROBLEM_TEXT[problem]);
}

// The hints of the three fields. The two new passwords are compared here, by the screen: the
// service receives the new one once (docs/FRONTEND_SERVICES.md section 8, decision 64).
export function passwordHints({ current, next, again }: PasswordFields): PasswordHints {
  return {
    current: current === '' ? PASSWORD_TEXTS.currentEmpty : null,
    next: problemTexts(newProblems(current, next)),
    again: again === '' ? PASSWORD_TEXTS.againEmpty : again === next ? null : PASSWORD_TEXTS.differ,
  };
}

// Whether any hint stands: while one does, the change cannot be asked for.
export function hintStands(hints: PasswordHints): boolean {
  return hints.current !== null || hints.next.length > 0 || hints.again !== null;
}

// The hints of an empty form: what the screen shows at its start and after its fields were
// emptied.
export const EMPTY_HINTS: PasswordHints = passwordHints({ current: '', next: '', again: '' });

// Where a failure of the change is said: a wrong current password under its field, any other
// reason under the form. `new_password_refused` is not among them: its problems are the new
// field's hints.
export type FailurePlace = 'current' | 'form';

export function failurePlace(reason: Exclude<ChangePasswordFailureReason, 'new_password_refused'>): FailurePlace {
  return reason === 'wrong_current_password' ? 'current' : 'form';
}
