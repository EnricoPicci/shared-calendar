import { Username, type UserStatus, type UserSummary } from '@shared-calendar/shared';
import type { UsersTexts } from '../texts/texts';
import type { ProfileFields } from './profile.model';

// The users screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the list of users as the API
// answers it (docs/SHARED_CALENDAR_SPEC.md section 10.1) turned into rows ready to draw, from
// what the username field holds to the argument of UsersService.createUser or to why not, the
// words of the invitation's dialog and of the dialog that confirms a deletion. Pure: the words
// are the page texts' `users`, handed in first.

// A row of the list: the username, the first and last name, the e-mail, the state of the account
// (`invited` until the first sign-in, then `active`, docs/EMAIL_ARCHITECTURE.md section 5.3) and
// that state in words; the
// four facts as the Edit dialog is filled with them; the names a screen reader says for its
// buttons, which tell whom they edit, invite again and delete. `resendLabel` is null for an
// active User, who is offered no "Resend invitation". The postal address is shown only in the
// Edit dialog (docs/EMAIL_ARCHITECTURE.md section 11).
export type UserRow = {
  username: string;
  name: string;
  email: string;
  status: UserStatus;
  statusText: string;
  facts: ProfileFields;
  editLabel: string;
  resendLabel: string | null;
  deleteLabel: string;
};

// The rows, in the order the server gives: sorted by username, never an administrator
// (docs/SHARED_CALENDAR_SPEC.md section 10.1).
export function userRows(texts: UsersTexts, users: readonly UserSummary[]): UserRow[] {
  return users.map(({ username, status, givenName, familyName, email, address }) => ({
    username,
    name: `${givenName} ${familyName}`,
    email,
    status,
    statusText: texts.status[status],
    facts: { givenName, familyName, email, address },
    editLabel: texts.edit(username),
    resendLabel: status === 'invited' ? texts.resend(username) : null,
    deleteLabel: texts.remove(username),
  }));
}

// Whether two rows show and hold the same.
export function sameRow(a: UserRow, b: UserRow): boolean {
  return (
    a.username === b.username &&
    a.status === b.status &&
    a.facts.givenName === b.facts.givenName &&
    a.facts.familyName === b.facts.familyName &&
    a.facts.email === b.facts.email &&
    a.facts.address === b.facts.address
  );
}

// The invitation's dialog says the address an invitation goes to before it goes, from the create
// form or from "Resend invitation", since the Administrator typed it and may have mistyped it
// (docs/EMAIL_ARCHITECTURE.md section 5.3.1), and again once it went: `inviteQuestion` and
// `invitedAnswer` of the texts. The title of the Edit dialog is the edit button's name, `edit`.

// From what the field holds to the username to create, or to the refusal of the field. Spaces
// around the name are removed, as a name pasted with one would have them; nothing else is
// changed, so a capital letter is refused, not lowered. A name that exists already is the
// server's to say. The refusal is the field's hint, what a username is (docs/ARCHITECTURE.md
// section 4), whose words the test of this file holds to the shared schema.
export function usernameFor(texts: UsersTexts, text: string): { username: string } | { refusal: string } {
  const username = text.trim();
  return Username.safeParse(username).success ? { username } : { refusal: texts.usernameHint };
}
