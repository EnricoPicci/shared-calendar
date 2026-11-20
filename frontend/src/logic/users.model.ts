import { Username, type UserSummary } from '@shared-calendar/shared';

// The users screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the list of users as the API
// answers it (docs/SHARED_CALENDAR_SPEC.md section 10.1) turned into rows ready to draw, from
// what the username field holds to the argument of UsersService.createUser or to why not, and
// the words of the dialog that confirms a deletion. Pure.

// A row of the list: the username, and the name a screen reader says for its "Delete" button,
// which tells whom it deletes.
export type UserRow = { username: string; deleteLabel: string };

// The rows, in the order the server gives: sorted by username, never an administrator
// (docs/SHARED_CALENDAR_SPEC.md section 10.1). Nothing else of a user is shown.
export function userRows(users: readonly UserSummary[]): UserRow[] {
  return users.map(({ username }) => ({ username, deleteLabel: `Delete ${username}` }));
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
