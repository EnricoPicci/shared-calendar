import { PASSWORD_PROBLEMS } from '@shared-calendar/shared';
import { emptyHints, emptyNewHints, problemText } from '../../../src/logic/password.model';
import type { NewPasswordProblem } from '../../../src/services/change-password.types';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The password's words in English, as the tests of the password screen, of "Choose your password"
// and of their views expect them: what a new password misses, the hints of the other fields, and
// the hints of an empty form. A helper, not a test file.

export const PASSWORD_TEXTS = PAGE_TEXTS_EN.password;

const PROBLEMS: NewPasswordProblem[] = [...PASSWORD_PROBLEMS, 'same_as_current'];

export const PASSWORD_PROBLEM_TEXT = Object.fromEntries(PROBLEMS.map((problem) => [problem, problemText(PASSWORD_TEXTS, problem)])) as Record<NewPasswordProblem, string>;

export const EMPTY_HINTS = emptyHints(PASSWORD_TEXTS);
export const EMPTY_NEW_HINTS = emptyNewHints(PASSWORD_TEXTS);
