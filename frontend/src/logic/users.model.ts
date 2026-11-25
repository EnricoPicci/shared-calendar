import { Username, type UserStatus, type UserSummary } from '@shared-calendar/shared';
import type { ProfileFields } from './profile.model';

// The users screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the list of users as the API
// answers it (docs/SHARED_CALENDAR_SPEC.md section 10.1) turned into rows ready to draw, from
// what the username field holds to the argument of UsersService.createUser or to why not, the
// words of the invitation's dialog and of the dialog that confirms a deletion. Pure.

// A row of the list: the username, the first and last name, the e-mail, the state of the account
// (`invited` until the first sign-in, then `active`, docs/EMAIL_ARCHITECTURE.md section 5.3); the
// four facts as the Edit dialog is filled with them; the names a screen reader says for its
// buttons, which tell whom they edit, invite again and delete. `resendLabel` is null for an
// active User, who is offered no "Resend invitation". The postal address is shown only in the
// Edit dialog (docs/EMAIL_ARCHITECTURE.md section 11).
export type UserRow = {
  username: string;
  name: string;
  email: string;
  status: UserStatus;
  facts: ProfileFields;
  editLabel: string;
  resendLabel: string | null;
  deleteLabel: string;
};

// The rows, in the order the server gives: sorted by username, never an administrator
// (docs/SHARED_CALENDAR_SPEC.md section 10.1).
export function userRows(users: readonly UserSummary[]): UserRow[] {
  return users.map(({ username, status, givenName, familyName, email, address }) => ({
    username,
    name: `${givenName} ${familyName}`,
    email,
    status,
    facts: { givenName, familyName, email, address },
    editLabel: `Edit ${username}`,
    resendLabel: status === 'invited' ? `Resend the invitation to ${username}` : null,
    deleteLabel: `Delete ${username}`,
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

// The last look before an invitation goes, from the create form or from "Resend invitation": the
// address it goes to, which the Administrator typed and may have mistyped
// (docs/EMAIL_ARCHITECTURE.md section 5.3.1).
export function inviteQuestion(email: string): string {
  return `An invitation will be sent to ${email}.`;
}

// The answer once the invitation went: the address again.
export function invitedAnswer(email: string): string {
  return `An invitation was sent to ${email}.`;
}

// What the dialog says when the server failed a creation: the route deletes an account it made
// but could not finish, so nothing is kept and the same username can be tried again
// (docs/EMAIL_ARCHITECTURE.md section 5.1).
export const CREATE_FAILED = 'The user could not be created, and nothing was kept. Please try again in a moment.';

// The title of the Edit dialog: whose facts it changes.
export function editTitle(username: string): string {
  return `Edit ${username}`;
}

// The sentence of a list with no row.
export const NO_USERS = 'There are no users yet.';

// What a username is (docs/ARCHITECTURE.md section 4). The words stand under the field as its
// hint and are also the refusal of a text that is not one. What decides is the shared schema,
// below: these are its words, and the test of this file holds the two together.
export const USERNAME_HINT = 'A username has 3 to 32 characters: lowercase letters, digits, ".", "_" and "-", starting with a letter or a digit.';

// From what the field holds to the username to create, or to the refusal of the field. Spaces
// around the name are removed, as a name pasted with one would have them; nothing else is
// changed, so a capital letter is refused, not lowered. A name that exists already is the
// server's to say.
export function usernameFor(text: string): { username: string } | { refusal: string } {
  const username = text.trim();
  return Username.safeParse(username).success ? { username } : { refusal: USERNAME_HINT };
}

// What the dialog asks before a user is deleted: whom, what happens to their appointments
// (docs/SHARED_CALENDAR_SPEC.md section 10.2), and that there is no way back.
export function deleteQuestion(username: string): string {
  return `Delete ${username}? Their future appointments will be cancelled. This cannot be undone.`;
}
