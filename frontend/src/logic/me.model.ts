import type { MeResponse } from '@shared-calendar/shared';
import { fieldsOf, type ProfileFields } from './profile.model';

// "My details" (docs/FRONTEND_ARCHITECTURE.md section 5.1): the person's own facts as GET /me
// answers them (docs/EMAIL_ARCHITECTURE.md section 9.1), turned into the texts of the screen. Pure.

/** What the screen shows, one text per line of its list. */
export type MeDetails = { username: string; role: string; givenName: string; familyName: string; email: string; address: string };

// What stands in the place of a fact the account does not hold yet: the Administrator's account
// has none until the Administrator types them (docs/EMAIL_ARCHITECTURE.md section 4.3).
export const NOT_SET = 'Not set';

const ROLE_IN_WORDS = { admin: 'Administrator', user: 'User' } as const;

/** The texts of the screen. */
export function meDetails(me: MeResponse): MeDetails {
  return {
    username: me.username,
    role: ROLE_IN_WORDS[me.role],
    givenName: me.givenName ?? NOT_SET,
    familyName: me.familyName ?? NOT_SET,
    email: me.email ?? NOT_SET,
    address: me.address ?? NOT_SET,
  };
}

/** The fields of the Edit dialog, filled with the facts held, a fact not held yet empty. */
export function meFields(me: MeResponse): ProfileFields {
  return fieldsOf(me);
}
