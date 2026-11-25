import { EmailAddress, PersonName, PostalAddress, PROFILE_LIMITS } from '@shared-calendar/shared';
import { anyRefused, EMPTY_FIELDS, fieldsOf, NO_REFUSALS, PROFILE_RULES, profileFor, profileRefusals, recheck } from '../../../src/logic/profile.model';
import { useFarBrowserZone } from './zone';

// The four facts of docs/EMAIL_ARCHITECTURE.md section 4.1, as the forms hold them. What each rule
// accepts is tested in shared/tests/user.test.ts; here, what the forms do with it.

const GOOD = { givenName: 'Anna', familyName: 'Rossi', email: 'anna@example.com', address: 'Via Po 2\n10100 Torino' };

describe('the facts of a person, in a form', () => {
  useFarBrowserZone();

  it('four facts that follow their rules: no refusal, and what is sent is what the shared rules make of them', () => {
    expect(profileRefusals(GOOD)).toEqual(NO_REFUSALS);
    expect(profileFor({ givenName: ' Anna ', familyName: 'Rossi ', email: ' Anna@Example.com ', address: ' Via Po 2\r\n10100 Torino ' })).toEqual({ profile: GOOD });
  });

  it.each([
    ['givenName', ''],
    ['givenName', '   '],
    ['givenName', 'a'.repeat(PROFILE_LIMITS.nameLength + 1)],
    ['givenName', 'An\nna'],
    ['familyName', ''],
    ['email', 'anna'],
    ['email', 'anna@'],
    ['email', `${'a'.repeat(250)}@example.com`],
    ['address', ''],
    ['address', 'x'.repeat(PROFILE_LIMITS.addressLength + 1)],
    ['address', 'Via\tPo'],
  ] as const)('%s "%s": refused with the words of its rule, nothing to send', (fact, text) => {
    const fields = { ...GOOD, [fact]: text };
    expect(profileRefusals(fields)).toEqual({ ...NO_REFUSALS, [fact]: PROFILE_RULES[fact] });
    expect(profileFor(fields)).toEqual({ refusals: { ...NO_REFUSALS, [fact]: PROFILE_RULES[fact] } });
  });

  it('the empty form: each of the four refused', () => {
    expect(anyRefused(profileRefusals(EMPTY_FIELDS))).toBe(true);
    expect(Object.values(profileRefusals(EMPTY_FIELDS)).every((text) => text !== null)).toBe(true);
    expect(anyRefused(NO_REFUSALS)).toBe(false);
  });

  it('the words of each rule say the lengths of the shared rules', () => {
    const fits = (schema: { safeParse: (v: string) => { success: boolean } }, text: string) => schema.safeParse(text).success;
    expect(PROFILE_RULES.givenName).toContain(`1 to ${PROFILE_LIMITS.nameLength}`);
    expect(PROFILE_RULES.familyName).toContain(`1 to ${PROFILE_LIMITS.nameLength}`);
    expect(PROFILE_RULES.email).toContain(`${PROFILE_LIMITS.emailLength}`);
    expect(PROFILE_RULES.address).toContain(`1 to ${PROFILE_LIMITS.addressLength}`);
    expect([fits(PersonName, 'a'.repeat(PROFILE_LIMITS.nameLength)), fits(PersonName, 'a'.repeat(PROFILE_LIMITS.nameLength + 1))]).toEqual([true, false]);
    expect(fits(EmailAddress, 'anna.rossi@example.com')).toBe(true);
    expect([fits(PostalAddress, 'a'.repeat(PROFILE_LIMITS.addressLength)), fits(PostalAddress, 'a'.repeat(PROFILE_LIMITS.addressLength + 1))]).toEqual([true, false]);
  });

  describe('recheck, while the person types', () => {
    it('a field refused and now right: its refusal goes; one still wrong keeps it', () => {
      const shown = profileRefusals({ ...GOOD, givenName: '', email: 'x' });
      expect(recheck({ ...GOOD, email: 'x' }, shown)).toEqual({ ...NO_REFUSALS, email: PROFILE_RULES.email });
    });

    it('a field not refused yet is left alone, even while it is wrong', () => {
      expect(recheck({ ...GOOD, address: '' }, NO_REFUSALS)).toEqual(NO_REFUSALS);
    });
  });

  it('fieldsOf: the facts held, a fact not held yet empty', () => {
    expect(fieldsOf(GOOD)).toEqual(GOOD);
    expect(fieldsOf({ givenName: null, familyName: 'Rossi', email: null, address: null })).toEqual({ ...EMPTY_FIELDS, familyName: 'Rossi' });
  });
});
