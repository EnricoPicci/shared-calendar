import { randomInt } from 'node:crypto';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
// A subset of Cognito's allowed symbols without quotes, backslash, `$` or spaces,
// so the password can be pasted into a shell command without escaping.
const SYMBOLS = '!#%*+-.:=?@^_~';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

export const PASSWORD_LENGTH = 16;

const pick = (chars: string): string => chars[randomInt(chars.length)]!;

// 16 characters that always satisfy the pool policy (min 12, upper, lower, digit, symbol).
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }
  // Fisher-Yates shuffle, so the guaranteed characters are not always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
