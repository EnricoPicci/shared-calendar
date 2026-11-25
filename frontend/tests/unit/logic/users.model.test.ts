import { Username } from '@shared-calendar/shared';
import { deleteQuestion, editTitle, invitedAnswer, inviteQuestion, NO_USERS, sameRow, USERNAME_HINT, userRows, usernameFor } from '../../../src/logic/users.model';
import { useFarBrowserZone } from './zone';

const SCRIPT = '<script>window.hacked = true</script>';
const FACTS = { givenName: 'Anna', familyName: 'Rossi', email: 'anna@example.com', address: 'Via Po 2\n10100 Torino' };
const user = (username: string, facts = FACTS, status: 'invited' | 'active' = 'active') => ({ username, createdAt: '2026-11-01T10:00:00.000Z', status, ...facts });
const row = (username: string, facts = FACTS, status: 'invited' | 'active' = 'active') => ({
  username,
  name: `${facts.givenName} ${facts.familyName}`,
  email: facts.email,
  status,
  facts,
  editLabel: `Edit ${username}`,
  resendLabel: status === 'invited' ? `Resend the invitation to ${username}` : null,
  deleteLabel: `Delete ${username}`,
});

describe('the users screen\'s model', () => {
  useFarBrowserZone();

  describe('userRows', () => {
    it('several users: one row each, in the server\'s order, with the username, the name, the e-mail, the facts and whom its buttons edit and delete', () => {
      expect(userRows([user('alice'), user('bob'), user('zoe.2')])).toEqual([row('alice'), row('bob'), row('zoe.2')]);
      // The order is the server's, not this function's.
      expect(userRows([user('zoe'), user('alice')]).map((row) => row.username)).toEqual(['zoe', 'alice']);
    });

    it('one user: one row, and nothing of the creation date in it', () => {
      const rows = userRows([user('alice')]);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain('2026');
    });

    it('the state of each account; an invited User is offered "Resend invitation", an active one is not', () => {
      const [invited, active] = userRows([user('newbie', FACTS, 'invited'), user('alice')]);
      expect(invited).toEqual(row('newbie', FACTS, 'invited'));
      expect(invited!.resendLabel).toBe('Resend the invitation to newbie');
      expect(active!.status).toBe('active');
      expect(active!.resendLabel).toBeNull();
    });

    it('the postal address is held for the Edit dialog only: it is not in the texts of the row', () => {
      const [first] = userRows([user('alice')]);
      expect([first!.username, first!.name, first!.email].join(' ')).not.toContain('Via Po');
      expect(first!.facts.address).toBe(FACTS.address);
    });

    it('no user: no row; the sentence of an empty list is a sentence', () => {
      expect(userRows([])).toEqual([]);
      expect(NO_USERS).toBe('There are no users yet.');
    });

    it('a username containing <script> is kept as text, as it is', () => {
      expect(userRows([user(SCRIPT)])).toEqual([row(SCRIPT)]);
      expect(userRows([user('alice', { ...FACTS, givenName: SCRIPT })])[0]!.name).toBe(`${SCRIPT} Rossi`);
    });
  });

  describe('sameRow', () => {
    const [a] = userRows([user('alice')]);
    it('the same user with the same facts: the same row', () => {
      expect(sameRow(a!, userRows([user('alice')])[0]!)).toBe(true);
    });
    it.each([
      ['another username', user('bob')],
      ['another first name', user('alice', { ...FACTS, givenName: 'Anne' })],
      ['another last name', user('alice', { ...FACTS, familyName: 'Russo' })],
      ['another e-mail', user('alice', { ...FACTS, email: 'a@example.com' })],
      ['another address', user('alice', { ...FACTS, address: 'Via Po 3' })],
      ['another state', user('alice', FACTS, 'invited')],
    ])('%s: another row', (_name, other) => {
      expect(sameRow(a!, userRows([other])[0]!)).toBe(false);
    });
  });

  it('the invitation\'s question and answer name the address', () => {
    expect(inviteQuestion('anna@example.com')).toBe('An invitation will be sent to anna@example.com.');
    expect(invitedAnswer('anna@example.com')).toBe('An invitation was sent to anna@example.com.');
  });

  it('editTitle names the user', () => {
    expect(editTitle('alice')).toBe('Edit alice');
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
