import { Username } from '@shared-calendar/shared';
import { deleteQuestion, NO_USERS, USERNAME_HINT, userRows, usernameFor } from '../../../src/logic/users.model';
import { useFarBrowserZone } from './zone';

const SCRIPT = '<script>window.hacked = true</script>';
const user = (username: string) => ({ username, createdAt: '2026-11-01T10:00:00.000Z' });

describe('the users screen\'s model', () => {
  useFarBrowserZone();

  describe('userRows', () => {
    it('several users: one row each, in the server\'s order, with the username and whom its button deletes', () => {
      expect(userRows([user('alice'), user('bob'), user('zoe.2')])).toEqual([
        { username: 'alice', deleteLabel: 'Delete alice' },
        { username: 'bob', deleteLabel: 'Delete bob' },
        { username: 'zoe.2', deleteLabel: 'Delete zoe.2' },
      ]);
      // The order is the server's, not this function's.
      expect(userRows([user('zoe'), user('alice')]).map((row) => row.username)).toEqual(['zoe', 'alice']);
    });

    it('one user: one row, and nothing of the creation date in it', () => {
      const rows = userRows([user('alice')]);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain('2026');
    });

    it('no user: no row; the sentence of an empty list is a sentence', () => {
      expect(userRows([])).toEqual([]);
      expect(NO_USERS).toBe('There are no users yet.');
    });

    it('a username containing <script> is kept as text, as it is', () => {
      expect(userRows([user(SCRIPT)])).toEqual([{ username: SCRIPT, deleteLabel: `Delete ${SCRIPT}` }]);
    });
  });

  describe('usernameFor', () => {
    const THIRTY_TWO = 'a'.repeat(32);
    const THIRTY_THREE = 'a'.repeat(33);

    it.each([
      ['a.b_c-1', 'a.b_c-1'],
      ['abc', 'abc'],
      ['1st', '1st'],
      [THIRTY_TWO, THIRTY_TWO],
      // Spaces around the name are removed, and nothing else is changed.
      [' carol ', 'carol'],
      ['\tcarol\n', 'carol'],
      // A name that exists passes the check: the server says so.
      ['admin', 'admin'],
      ['alice', 'alice'],
    ])('"%s" is accepted and sent as "%s", which the shared schema accepts too', (text, username) => {
      expect(usernameFor(text)).toEqual({ username });
      expect(Username.safeParse(username).success).toBe(true);
    });

    it.each([
      ['', 'empty'],
      ['   ', 'spaces only'],
      ['ab', 'two characters'],
      ['Bob', 'a capital letter: refused, not lowered'],
      ['alice smith', 'a space inside'],
      ['-alice', 'starting with "-"'],
      ['.alice', 'starting with "."'],
      ['_alice', 'starting with "_"'],
      ['alice!', 'another sign'],
      ['álice', 'a letter with an accent'],
      [THIRTY_THREE, '33 characters'],
      [SCRIPT, 'markup'],
    ])('"%s" is refused (%s), with the words of the hint, and nothing to send', (text) => {
      expect(usernameFor(text)).toEqual({ refusal: USERNAME_HINT });
      expect(Username.safeParse(text.trim()).success).toBe(false);
    });

    it('the hint says what the shared schema accepts: the two lengths and the three signs it names are the schema\'s', () => {
      expect(USERNAME_HINT).toBe('A username has 3 to 32 characters: lowercase letters, digits, ".", "_" and "-", starting with a letter or a digit.');
      const [, shortest, longest] = /(\d+) to (\d+) characters/.exec(USERNAME_HINT)!.map(Number);
      const ofLength = (n: number) => Username.safeParse('a'.repeat(n)).success;
      expect([ofLength(shortest! - 1), ofLength(shortest!), ofLength(longest!), ofLength(longest! + 1)]).toEqual([false, true, true, false]);
      for (const sign of ['.', '_', '-']) {
        expect(USERNAME_HINT).toContain(`"${sign}"`);
        expect([Username.safeParse(`a${sign}b`).success, Username.safeParse(`${sign}ab`).success], sign).toEqual([true, false]);
      }
    });
  });

  describe('deleteQuestion', () => {
    it('names the user, says that their future appointments will be cancelled and that it cannot be undone', () => {
      expect(deleteQuestion('alice')).toBe('Delete alice? Their future appointments will be cancelled. This cannot be undone.');
    });

    it('a username containing <script> is kept as text', () => {
      expect(deleteQuestion(SCRIPT)).toBe(`Delete ${SCRIPT}? Their future appointments will be cancelled. This cannot be undone.`);
    });
  });
});
