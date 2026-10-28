import { generatePassword, PASSWORD_LENGTH } from '../../../src/lib/password';

// The user pool policy (architecture section 5.1) plus the length the API promises.
function satisfiesPolicy(password: string): boolean {
  return (
    password.length === 16 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

describe('generatePassword', () => {
  it('is 16 characters long', () => {
    expect(PASSWORD_LENGTH).toBe(16);
    expect(generatePassword()).toHaveLength(16);
  });

  it('only uses letters, digits and shell-safe symbols', () => {
    expect(generatePassword()).toMatch(/^[A-Za-z0-9!#%*+\-.:=?@^_~]{16}$/);
  });

  it('satisfies the policy in 1 000 samples, all different', () => {
    const samples = Array.from({ length: 1000 }, generatePassword);
    expect(samples.filter((p) => !satisfiesPolicy(p))).toEqual([]);
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('does not always put the guaranteed classes in front', () => {
    // Without the shuffle the first character would always be uppercase.
    const firsts = Array.from({ length: 200 }, () => generatePassword()[0]!);
    expect(firsts.some((c) => !/[A-Z]/.test(c))).toBe(true);
  });
});
