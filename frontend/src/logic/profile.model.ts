import { EmailAddress, PersonName, PostalAddress, PROFILE_LIMITS, type UserProfile } from '@shared-calendar/shared';

// The four facts about a person (docs/EMAIL_ARCHITECTURE.md section 4.1) as the forms of the users
// screen and of "My details" hold them, checked by the shared rules before anything is sent, with
// the words of each refusal. Pure.

/** The four fields as typed. */
export type ProfileFields = { givenName: string; familyName: string; email: string; address: string };

/** Why each field is refused, or null for a field that is right. */
export type ProfileRefusals = { [Fact in keyof ProfileFields]: string | null };

export const FACTS = ['givenName', 'familyName', 'email', 'address'] as const satisfies readonly (keyof ProfileFields)[];

export const EMPTY_FIELDS: ProfileFields = { givenName: '', familyName: '', email: '', address: '' };
export const NO_REFUSALS: ProfileRefusals = { givenName: null, familyName: null, email: null, address: null };

// The words of each fact's rule. They stand under a field that does not follow it; what decides
// is the shared schema of the same fact, which the test of this file holds them to.
export const PROFILE_RULES: Record<keyof ProfileFields, string> = {
  givenName: `A first name has 1 to ${PROFILE_LIMITS.nameLength} characters, on one line.`,
  familyName: `A last name has 1 to ${PROFILE_LIMITS.nameLength} characters, on one line.`,
  email: `An e-mail address, such as anna.rossi@example.com, of at most ${PROFILE_LIMITS.emailLength} characters.`,
  address: `A postal address has 1 to ${PROFILE_LIMITS.addressLength} characters, on one or more lines.`,
};

const SCHEMAS = { givenName: PersonName, familyName: PersonName, email: EmailAddress, address: PostalAddress };

// Why one field is refused, or null.
function refusalOf(fact: keyof ProfileFields, text: string): string | null {
  return SCHEMAS[fact].safeParse(text).success ? null : PROFILE_RULES[fact];
}

/** The refusal of each field. */
export function profileRefusals(fields: ProfileFields): ProfileRefusals {
  return { givenName: refusalOf('givenName', fields.givenName), familyName: refusalOf('familyName', fields.familyName), email: refusalOf('email', fields.email), address: refusalOf('address', fields.address) };
}

/**
 * While the person types: the fields already refused are checked again, so that a refusal goes
 * as soon as the field is right; a field not refused yet is left alone until the form is sent.
 */
export function recheck(fields: ProfileFields, shown: ProfileRefusals): ProfileRefusals {
  const now = profileRefusals(fields);
  return { givenName: shown.givenName && now.givenName, familyName: shown.familyName && now.familyName, email: shown.email && now.email, address: shown.address && now.address };
}

/** Whether a refusal stands. */
export function anyRefused(refusals: ProfileRefusals): boolean {
  return FACTS.some((fact) => refusals[fact] !== null);
}

/** The facts to send, as the shared rules make them (trimmed, the e-mail lower-cased), or the refusals. */
export function profileFor(fields: ProfileFields): { profile: UserProfile } | { refusals: ProfileRefusals } {
  const refusals = profileRefusals(fields);
  if (anyRefused(refusals)) return { refusals };
  return { profile: { givenName: PersonName.parse(fields.givenName), familyName: PersonName.parse(fields.familyName), email: EmailAddress.parse(fields.email), address: PostalAddress.parse(fields.address) } };
}

/** The fields filled with facts held, a fact not held yet empty. */
export function fieldsOf(facts: { [Fact in keyof ProfileFields]: string | null }): ProfileFields {
  return { givenName: facts.givenName ?? '', familyName: facts.familyName ?? '', email: facts.email ?? '', address: facts.address ?? '' };
}
