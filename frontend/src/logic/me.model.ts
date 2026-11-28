import type { MeResponse } from '@shared-calendar/shared';
import type { PageTexts } from '../texts/texts';
import { fieldsOf, type ProfileFields } from './profile.model';

// "My details" (docs/FRONTEND_ARCHITECTURE.md section 5.1): the person's own facts as GET /me
// answers them (docs/EMAIL_ARCHITECTURE.md section 9.1), turned into the texts of the screen, in
// the page texts handed in. Pure.

/** What the screen shows, one text per line of its list. */
export type MeDetails = { username: string; role: string; givenName: string; familyName: string; email: string; address: string };

/**
 * The texts of the screen. A fact the account does not hold yet reads "Not set": the
 * Administrator's account has none until the Administrator types them
 * (docs/EMAIL_ARCHITECTURE.md section 4.3).
 */
export function meDetails(texts: PageTexts, me: MeResponse): MeDetails {
  const NOT_SET = texts.profile.notSet;
  return {
    username: me.username,
    role: texts.frame.roles[me.role],
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
