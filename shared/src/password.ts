import { z } from 'zod';

/**
 * The user pool's password policy (docs/ARCHITECTURE.md section 5.1), with the limits of
 * Cognito's ChangePassword itself (docs/ARCHITECTURE.md section 6.9). The page checks a new
 * password with it before any request, so that Cognito is never asked to refuse one. The first
 * five values are the ones of the pool's `PasswordPolicy` in backend/template.yaml, which a unit
 * test of the back end compares with them; `maximumLength` is ChangePassword's 256.
 */
export const PASSWORD_POLICY = {
  minimumLength: 12,
  maximumLength: 256,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
} as const;

/**
 * The 32 characters Cognito counts as a symbol, copied from docs/ARCHITECTURE.md section 6.9
 * (AWS's developer guide of Amazon Cognito, "Passwords, account recovery, and password policies").
 */
export const PASSWORD_SYMBOLS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`=+-';

/**
 * What a text can miss to be a password of the pool, as names for the screen to put in words:
 * `too_short`, `too_long`, no upper-case or lower-case letter of the basic Latin alphabet (`A` to
 * `Z`, `a` to `z`: an accented letter does not count), no digit, no symbol of the 32, and a blank
 * character somewhere (ChangePassword accepts none).
 */
export const PASSWORD_PROBLEMS = [
  'too_short',
  'too_long',
  'no_uppercase',
  'no_lowercase',
  'no_digit',
  'no_symbol',
  'blank',
] as const;
export type PasswordProblem = (typeof PASSWORD_PROBLEMS)[number];

const SYMBOL_SET = new Set(PASSWORD_SYMBOLS);

// One test per problem, in the order of PASSWORD_PROBLEMS. A condition the policy does not require
// never fails. Length is the JavaScript string length (UTF-16 code units). Any other character
// beyond the required ones is allowed, as Cognito allows it. "Blank" is JavaScript's `\s`, which
// also holds the Unicode spaces: a little more than ChangePassword's `[\S]+` refuses, never less.
const CHECKS: Record<PasswordProblem, (text: string) => boolean> = {
  too_short: (text) => text.length < PASSWORD_POLICY.minimumLength,
  too_long: (text) => text.length > PASSWORD_POLICY.maximumLength,
  no_uppercase: (text) => PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(text),
  no_lowercase: (text) => PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(text),
  no_digit: (text) => PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(text),
  no_symbol: (text) => PASSWORD_POLICY.requireSymbols && ![...text].some((c) => SYMBOL_SET.has(c)),
  blank: (text) => /\s/.test(text),
};

/** The problems of a text, in the order of PASSWORD_PROBLEMS; an empty list for a good password. */
export function passwordProblems(text: string): PasswordProblem[] {
  return PASSWORD_PROBLEMS.filter((problem) => CHECKS[problem](text));
}

/**
 * The policy as a schema: a string with no problem. Each problem is one issue whose message is
 * the problem's name, so a refusal can be read back as the list `passwordProblems` gives.
 */
export const Password = z.string().superRefine((text, ctx) => {
  for (const problem of passwordProblems(text)) ctx.addIssue({ code: 'custom', message: problem });
});
