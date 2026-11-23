import { readFileSync } from 'node:fs';
import { Password, PASSWORD_POLICY, passwordProblems } from '@shared-calendar/shared';
import { generatePassword, PASSWORD_LENGTH } from '../../../src/lib/password';

const TEMPLATE = new URL('../../../template.yaml', import.meta.url);

// The keys and values under the user pool's `PasswordPolicy:` in backend/template.yaml, read as
// text: the template's `!Ref` and `!GetAtt` tags need no YAML parser for this one block of plain
// values. The block ends at the first line indented no deeper than its key.
function poolPasswordPolicy(): Record<string, string> {
  const lines = readFileSync(TEMPLATE, 'utf8').split('\n');
  const starts = lines.flatMap((line, i) => (/^\s*PasswordPolicy:\s*$/.test(line) ? [i] : []));
  if (starts.length !== 1) throw new Error(`expected one PasswordPolicy in the template, found ${starts.length}`);
  const start = starts[0]!;
  const indent = lines[start]!.search(/\S/);
  const policy: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (line.search(/\S/) <= indent) break;
    const [key, value] = line.trim().split(/:\s*/);
    policy[key!] = value!;
  }
  return policy;
}

// The user pool policy (docs/ARCHITECTURE.md section 5.1) plus the length the API promises.
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

  it('passes the shared password rule in 2 000 samples', () => {
    const samples = Array.from({ length: 2000 }, generatePassword);
    expect(samples.filter((p) => passwordProblems(p).length > 0 || !Password.safeParse(p).success)).toEqual([]);
  });

  it('does not always put the guaranteed classes in front', () => {
    // Without the shuffle the first character would always be uppercase.
    const firsts = Array.from({ length: 200 }, () => generatePassword()[0]!);
    expect(firsts.some((c) => !/[A-Z]/.test(c))).toBe(true);
  });
});

// The shared rule held to the pool (docs/ARCHITECTURE.md section 6.9): the page checks a new
// password with the rule of shared/src/password.ts instead of asking Cognito, so the two must
// say the same. A key added to the pool's policy (a password history, say) fails this test too.
describe('the pool policy of template.yaml', () => {
  it('has exactly the length and the four classes of the shared rule', () => {
    expect(poolPasswordPolicy()).toEqual({
      MinimumLength: String(PASSWORD_POLICY.minimumLength),
      RequireUppercase: String(PASSWORD_POLICY.requireUppercase),
      RequireLowercase: String(PASSWORD_POLICY.requireLowercase),
      RequireNumbers: String(PASSWORD_POLICY.requireNumbers),
      RequireSymbols: String(PASSWORD_POLICY.requireSymbols),
    });
  });
});
