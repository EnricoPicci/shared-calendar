import { ReplaySubject, Subject } from 'rxjs';
import { NO_REFUSALS, PROFILE_RULES } from '../../../src/logic/profile.model';
import { invitedAnswer, inviteQuestion, NO_USERS, USERNAME_HINT } from '../../../src/logic/users.model';
import { UsersScreen, type CreateOutcome, type ResendOutcome, type UpdateOutcome, type UsersCalls, type UsersState } from '../../../src/logic/users.screen';
import type { DeleteUserResult, ListUsersResult } from '../../../src/services/users.types';
import { useFarBrowserZone } from './zone';

// A fake UsersService: five result streams that replay their last value, as the real ones
// do, and four spies. No network, no DOM. A create's and a resend's success are given as the
// screen reads them, with nothing else.

const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const FACTS = { givenName: 'Anna', familyName: 'Rossi', email: 'anna@example.com', address: 'Via Po 2\n10100 Torino' };
const EMPTY = { givenName: '', familyName: '', email: '', address: '' };
const NO_EDIT = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };
const START: UsersState = { loading: false, unread: null, rows: null, empty: null, field: { username: '', ...EMPTY }, refusal: null, refusals: NO_REFUSALS, invite: null, edit: NO_EDIT };
// A User is invited when its username starts with "new", active otherwise.
const statusOf = (username: string) => (username.startsWith('new') ? ('invited' as const) : ('active' as const));
const user = (username: string) => ({ username, createdAt: '2026-11-01T10:00:00.000Z', status: statusOf(username), ...FACTS });
const row = (username: string) => ({
  username,
  name: 'Anna Rossi',
  email: FACTS.email,
  status: statusOf(username),
  facts: FACTS,
  editLabel: `Edit ${username}`,
  resendLabel: statusOf(username) === 'invited' ? `Resend the invitation to ${username}` : null,
  deleteLabel: `Delete ${username}`,
});
// The invitation's dialog as it opens, as it waits, and after its answer.
const ASKING = { question: inviteQuestion(FACTS.email), sending: false, answer: null, failure: null };
const SENDING = { ...ASKING, sending: true };
const WENT = { ...ASKING, answer: invitedAnswer(FACTS.email) };
// The create form with a username typed and four good facts; what the service is then given.
const form = (username: string) => ({ username, ...FACTS });
const sent = (username: string) => ({ username, ...FACTS });

function screenOf() {
  const listUsersResult$ = new ReplaySubject<ListUsersResult>(1);
  const createUserResult$ = new ReplaySubject<CreateOutcome>(1);
  const deleteUserResult$ = new ReplaySubject<DeleteUserResult>(1);
  const updateUserResult$ = new ReplaySubject<UpdateOutcome>(1);
  const resendInvitationResult$ = new ReplaySubject<ResendOutcome>(1);
  const visible$ = new Subject<void>();
  const listUsers = vi.fn<UsersCalls['listUsers']>();
  const createUser = vi.fn<UsersCalls['createUser']>();
  const resendInvitation = vi.fn<UsersCalls['resendInvitation']>();
  const updateUser = vi.fn<UsersCalls['updateUser']>();
  const screen = new UsersScreen(
    {
      listUsers,
      createUser,
      resendInvitation,
      updateUser,
      listUsersResult$: listUsersResult$.asObservable(),
      createUserResult$: createUserResult$.asObservable(),
      resendInvitationResult$: resendInvitationResult$.asObservable(),
      deleteUserResult$: deleteUserResult$.asObservable(),
      updateUserResult$: updateUserResult$.asObservable(),
    },
    visible$,
  );
  const states: UsersState[] = [];
  screen.users$.subscribe((s) => states.push(s)); // the view subscribes first
  const listed = (...usernames: string[]) => listUsersResult$.next({ status: 'success', users: usernames.map(user) });
  const unread = (reason: 'network' | 'forbidden' | 'internal_error' = 'network') => listUsersResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const created = () => createUserResult$.next({ status: 'success' });
  const resent = () => resendInvitationResult$.next({ status: 'success' });
  const notResent = (reason: Extract<ResendOutcome, { status: 'failure' }>['reason']) => resendInvitationResult$.next({ status: 'failure', reason });
  // "Create user" with good fields, then "Confirm".
  const confirmed = (username: string) => {
    screen.create(form(username));
    screen.confirm();
  };
  const notCreated = (reason: Extract<CreateOutcome, { status: 'failure' }>['reason']) => createUserResult$.next({ status: 'failure', reason });
  const deleted = (username: string) => deleteUserResult$.next({ status: 'success', username });
  const notDeleted = (reason: Extract<DeleteUserResult, { status: 'failure' }>['reason']) => deleteUserResult$.next({ status: 'failure', reason, message: 'for a developer' });
  // Started, with the list read.
  const shown = (...usernames: string[]) => {
    const started = screen.start();
    listed(...usernames);
    return started;
  };
  const updated = () => updateUserResult$.next({ status: 'success' });
  const notUpdated = (reason: Extract<UpdateOutcome, { status: 'failure' }>['reason']) => updateUserResult$.next({ status: 'failure', reason });
  const streams = { listUsersResult$, createUserResult$, resendInvitationResult$, deleteUserResult$, updateUserResult$, visible$ };
  return {
    screen,
    ...streams,
    listUsers,
    createUser,
    resendInvitation,
    updateUser,
    updated,
    notUpdated,
    states,
    listed,
    unread,
    created,
    notCreated,
    resent,
    notResent,
    confirmed,
    deleted,
    notDeleted,
    shown,
    last: () => states.at(-1)!,
  };
}

describe('UsersScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is read, no stream is listened to, and the state is empty', () => {
      const { listUsers, createUser, states, listUsersResult$, createUserResult$, resendInvitationResult$, deleteUserResult$, visible$ } = screenOf();
      expect(listUsers).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect([listUsersResult$.observed, createUserResult$.observed, resendInvitationResult$.observed, deleteUserResult$.observed, visible$.observed]).toEqual([
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(states).toEqual([START]);
    });

    it('create(), typed(), retry(), the invitation\'s three and the Edit dialog\'s three do nothing', () => {
      const { screen, listUsers, createUser, resendInvitation, updateUser, states } = screenOf();
      screen.create(form('carol'));
      screen.confirm();
      screen.resend(row('newbie'));
      screen.closeInvite();
      screen.create(form('Bob'));
      screen.typed(form('carol'));
      screen.retry();
      screen.editOpened();
      screen.editTyped(FACTS);
      screen.save('alice', FACTS);
      expect([listUsers.mock.calls.length, createUser.mock.calls.length, resendInvitation.mock.calls.length, updateUser.mock.calls.length, states.length]).toEqual([
        0, 0, 0, 0, 1,
      ]);
    });
  });

  describe('reading the list', () => {
    it('start() reads the list, once, and says it is loading, with no row yet', () => {
      const { screen, listUsers, last } = screenOf();
      screen.start();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('the list arrives: its rows, in the server\'s order', () => {
      const { shown, last } = screenOf();
      shown('alice', 'bob');
      expect(last()).toEqual({ ...START, rows: [row('alice'), row('bob')] });
    });

    it('an empty list: no row, and its sentence', () => {
      const { shown, last } = screenOf();
      shown();
      expect(last()).toEqual({ ...START, rows: [], empty: NO_USERS });
    });

    it('a failed read: why, in plain words, never the service\'s message, and no list', () => {
      const { screen, unread, last } = screenOf();
      screen.start();
      unread('network');
      expect(last()).toEqual({ ...START, unread: UNREACHABLE });
      expect(JSON.stringify(last())).not.toContain('for a developer');
    });

    it('retry() reads again; the failure stays while it is under way, and goes when the list arrives', () => {
      const { screen, listUsers, unread, listed, last } = screenOf();
      screen.start();
      unread('internal_error');
      screen.retry();
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, loading: true, unread: 'Something went wrong on the server. Please try again in a moment.' });
      unread('forbidden');
      expect(last()).toEqual({ ...START, unread: 'Your account is not allowed to do this.' });
      screen.retry();
      listed('alice');
      expect(last()).toEqual({ ...START, rows: [row('alice')] });
    });

    it('a read that fails with a list on show takes the list away: it is no longer known to be true', () => {
      const { shown, unread, last, visible$ } = screenOf();
      shown('alice');
      visible$.next();
      unread('network');
      expect(last()).toEqual({ ...START, unread: UNREACHABLE });
    });

    it('a failed read leaves the form usable: a create still goes', () => {
      const { screen, createUser, unread, confirmed, last } = screenOf();
      screen.start();
      unread();
      confirmed('carol');
      expect(createUser).toHaveBeenCalledWith(sent('carol'));
      expect(last()).toMatchObject({ invite: SENDING, unread: UNREACHABLE });
    });

    it('a list that was already answered before start() is not this start\'s: the read is made and waited for', () => {
      const { screen, listUsers, listed, last } = screenOf();
      listed('zoe'); // asked for by the book dialog of the week, earlier
      screen.start();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, loading: true });
      listed('alice');
      expect(last().rows).toEqual([row('alice')]);
    });

    it('the same users read again keep the same rows object; other users are another object', () => {
      const { shown, listed, last, visible$ } = screenOf();
      shown('alice', 'bob');
      const first = last().rows;
      visible$.next();
      expect(last()).toMatchObject({ loading: true });
      expect(last().rows).toBe(first);
      listed('alice', 'bob');
      expect(last().rows).toBe(first);
      expect(last().loading).toBe(false);
      for (const others of [['alice'], ['alice', 'carol'], ['alice', 'bob', 'carol'], []]) {
        listed(...others);
        expect(last().rows).not.toBe(first);
        expect(last().rows).toEqual(others.map(row));
      }
      expect(last().empty).toBe(NO_USERS);
      listed('alice');
      expect(last().empty).toBeNull();
    });
  });

  describe('create(text), the last look, and confirm()', () => {
    it('good fields: nothing is sent yet; the invitation\'s dialog opens with the address the shared rule makes', () => {
      const { screen, createUser, listUsers, shown, last } = screenOf();
      shown('alice');
      const { rows, field } = last();
      screen.create({ ...form('carol'), email: ' Anna@Example.com ' });
      expect(createUser).not.toHaveBeenCalled();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, rows, invite: ASKING });
      expect(last().field).toBe(field); // what was typed stays
    });

    it('confirm(): the user goes to the service, once, and the dialog says it is under way; a second press sends nothing', () => {
      const { screen, createUser, listUsers, shown, last } = screenOf();
      shown('alice');
      screen.create(form('carol'));
      screen.confirm();
      expect(createUser).toHaveBeenCalledTimes(1);
      expect(createUser).toHaveBeenCalledWith(sent('carol'));
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last().invite).toEqual(SENDING);
      screen.confirm();
      expect(createUser).toHaveBeenCalledTimes(1);
    });

    it('closeInvite() before confirm(): the dialog closes, nothing is sent, what was typed stays', () => {
      const { screen, createUser, shown, last } = screenOf();
      shown();
      screen.create(form('carol'));
      const { field } = last();
      screen.closeInvite();
      screen.confirm();
      expect(createUser).not.toHaveBeenCalled();
      expect(last().invite).toBeNull();
      expect(last().field).toBe(field);
    });

    it('spaces around the name are removed before it is sent', () => {
      const { screen, createUser, shown } = screenOf();
      shown();
      screen.create(form(' carol '));
      screen.confirm();
      expect(createUser).toHaveBeenCalledWith(sent('carol'));
    });

    it('"admin" passes the check: the server is the one to say that it exists', () => {
      const { createUser, shown, confirmed } = screenOf();
      shown();
      confirmed('admin');
      expect(createUser).toHaveBeenCalledWith(sent('admin'));
    });

    it.each(['', 'ab', 'Bob', 'alice smith', '-alice', 'a'.repeat(33)])('"%s" is refused by the check: the refusal, no dialog, no call, the list kept and not read again', (text) => {
      const { screen, createUser, listUsers, shown, states, last } = screenOf();
      shown('alice');
      const before = last();
      screen.create(form(text));
      screen.confirm();
      expect(createUser).not.toHaveBeenCalled();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...before, refusal: USERNAME_HINT });
      expect(last().rows).toBe(before.rows);
      expect(last().field).toBe(before.field); // what was typed stays
      expect(states.filter((s) => s.invite !== null)).toHaveLength(0);
    });

    it('the refusal goes at the next create whose fields are good', () => {
      const { screen, shown, last } = screenOf();
      shown();
      screen.create(form('Bob'));
      screen.create(form('bob'));
      expect(last()).toMatchObject({ refusal: null, invite: ASKING });
    });

    it('a create that succeeds: where the invitation went, in the dialog; the field to empty, and the list read again', () => {
      const { listUsers, shown, created, confirmed, listed, last } = screenOf();
      shown('alice');
      const { rows, field } = last();
      confirmed('newcarol');
      created();
      expect(last()).toEqual({ ...START, rows, loading: true, invite: WENT });
      expect(last().field).not.toBe(field); // another object: the view empties the field
      expect(last().field).toEqual({ username: '', ...EMPTY });
      expect(listUsers).toHaveBeenCalledTimes(2);
      const emptied = last().field;
      listed('alice', 'newcarol');
      expect(last()).toEqual({ ...START, rows: [row('alice'), row('newcarol')], invite: WENT });
      expect(last().field).toBe(emptied); // the read fills nothing
    });

    it('after the answer, confirm() sends nothing more and closeInvite() closes the dialog', () => {
      const { screen, createUser, shown, created, confirmed, last } = screenOf();
      shown();
      confirmed('carol');
      created();
      screen.confirm();
      expect(createUser).toHaveBeenCalledTimes(1);
      screen.closeInvite();
      expect(last().invite).toBeNull();
    });

    it('no state of the stream has a place for a password', () => {
      const { shown, created, confirmed, listed, states } = screenOf();
      shown('alice');
      confirmed('carol');
      created();
      listed('alice', 'carol');
      const keys = new Set(states.flatMap((s) => Object.keys(s)));
      expect([...keys].sort()).toEqual(['edit', 'empty', 'field', 'invite', 'loading', 'refusal', 'refusals', 'rows', 'unread']);
      expect(JSON.stringify(states)).not.toMatch(/password/i);
    });

    it.each([
      ['mail_unavailable', 'E-mail is not available yet.'],
      ['user_exists', 'A user with this username exists already. Choose another username.'],
      ['network', UNREACHABLE],
      ['invalid_request', 'The request was not accepted. Check what you entered and try again.'],
      ['forbidden', 'Your account is not allowed to do this.'],
      ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
    ] as const)('a create that fails with %s: its sentence in the dialog, which stays open, the field not emptied, the list read again all the same, and Confirm can be pressed again', (reason, sentence) => {
      const { screen, createUser, listUsers, shown, notCreated, created, confirmed, listed, last } = screenOf();
      shown('alice');
      const { field } = last();
      confirmed('alice');
      notCreated(reason);
      expect(last()).toMatchObject({ invite: { ...ASKING, failure: sentence }, refusal: null, loading: true });
      expect(last().field).toBe(field);
      expect(listUsers).toHaveBeenCalledTimes(2);
      // The server had applied it: the list says so, and the failure stays said.
      listed('alice', 'carol');
      expect(last()).toMatchObject({ rows: [row('alice'), row('carol')], invite: { failure: sentence } });

      screen.confirm();
      expect(createUser).toHaveBeenCalledTimes(2);
      expect(last().invite).toEqual(SENDING);
      created();
      expect(last().invite).toEqual(WENT);
    });

    it('closed while the create is under way: the call goes on and the list is read at its answer, but the dialog does not open again', () => {
      const { screen, listUsers, shown, created, confirmed, last } = screenOf();
      shown();
      confirmed('carol');
      screen.closeInvite();
      created();
      expect(last().invite).toBeNull();
      expect(last().field).toEqual({ username: '', ...EMPTY });
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    it('a create answered before start() is not this start\'s: nothing is said and nothing read for it', () => {
      const { screen, listUsers, created, listed, last } = screenOf();
      created();
      screen.start();
      listed('alice', 'carol');
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, rows: [row('alice'), row('carol')] });
    });
  });

  describe('resend(row): the invitation sent again', () => {
    it('an invited User: the dialog opens with its address; confirm() sends the resend, once', () => {
      const { screen, resendInvitation, createUser, shown, last } = screenOf();
      shown('newbie');
      screen.resend(row('newbie'));
      expect(resendInvitation).not.toHaveBeenCalled();
      expect(last().invite).toEqual(ASKING);
      screen.confirm();
      screen.confirm();
      expect(resendInvitation).toHaveBeenCalledTimes(1);
      expect(resendInvitation).toHaveBeenCalledWith('newbie');
      expect(createUser).not.toHaveBeenCalled();
      expect(last().invite).toEqual(SENDING);
    });

    it('an active User is offered no resend: nothing opens', () => {
      const { screen, shown, last } = screenOf();
      shown('alice');
      screen.resend(row('alice'));
      expect(last().invite).toBeNull();
    });

    it('a resend that succeeds: where it went, and the list read again', () => {
      const { screen, listUsers, shown, resent, last } = screenOf();
      shown('newbie');
      screen.resend(row('newbie'));
      screen.confirm();
      resent();
      expect(last().invite).toEqual(WENT);
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['mail_unavailable', 'E-mail is not available yet.'],
      ['not_invited', 'This user has already chosen a password: there is no invitation to send again.'],
      ['user_not_found', 'This user no longer exists.'],
      ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
    ] as const)('a resend that fails with %s: its sentence in the dialog, and the list read again', (reason, sentence) => {
      const { screen, listUsers, shown, notResent, last } = screenOf();
      shown('newbie');
      screen.resend(row('newbie'));
      screen.confirm();
      notResent(reason);
      expect(last().invite).toEqual({ ...ASKING, failure: sentence });
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    it('a create\'s answer is not shown in a resend\'s dialog, nor a resend\'s in a create\'s', () => {
      const { screen, shown, created, resent, confirmed, last } = screenOf();
      shown('newbie');
      confirmed('carol');
      screen.closeInvite();
      screen.resend(row('newbie'));
      screen.confirm();
      created();
      expect(last().invite).toEqual(SENDING);
      resent();
      expect(last().invite).toEqual(WENT);
      screen.closeInvite();
      confirmed('dave');
      resent();
      expect(last().invite).toEqual(SENDING);
    });

    it('a resend answered before start() is not this start\'s: nothing is read for it', () => {
      const { screen, listUsers, resent } = screenOf();
      resent();
      screen.start();
      expect(listUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('the four facts of the create form', () => {
    it('a fact that does not follow its rule: its refusal, no call; a username refused at the same time is said too', () => {
      const { screen, createUser, shown, last } = screenOf();
      shown();
      screen.create({ ...form('Bob'), email: 'anna', address: '' });
      expect(createUser).not.toHaveBeenCalled();
      expect(last()).toMatchObject({ refusal: USERNAME_HINT, refusals: { ...NO_REFUSALS, email: PROFILE_RULES.email, address: PROFILE_RULES.address }, invite: null });
    });

    it('a good username with one fact refused: nothing is sent, the username not refused', () => {
      const { screen, createUser, shown, last } = screenOf();
      shown();
      screen.create({ ...form('carol'), givenName: ' ' });
      expect(createUser).not.toHaveBeenCalled();
      expect(last()).toMatchObject({ refusal: null, refusals: { ...NO_REFUSALS, givenName: PROFILE_RULES.givenName } });
    });

    it('while typing, a refused fact that becomes right loses its refusal; one not refused yet is left alone', () => {
      const { screen, shown, last } = screenOf();
      shown();
      screen.create({ ...form('carol'), email: 'anna', familyName: '' });
      screen.typed({ ...form('carol'), email: 'anna@example.com', familyName: '', givenName: '' });
      expect(last().refusals).toEqual({ ...NO_REFUSALS, familyName: PROFILE_RULES.familyName });
    });

    it('the facts go as the shared rules make them, and the refusals go at the create that is sent', () => {
      const { screen, createUser, shown, last } = screenOf();
      shown();
      screen.create({ ...form('carol'), email: 'x' });
      screen.create({ username: 'carol', givenName: ' Anna ', familyName: 'Rossi', email: 'Anna@Example.com', address: 'Via Po 2\r\n10100 Torino' });
      expect(last()).toMatchObject({ refusals: NO_REFUSALS, invite: ASKING });
      screen.confirm();
      expect(createUser).toHaveBeenCalledWith(sent('carol'));
    });

    it('a create that succeeds empties the four facts too', () => {
      const { shown, created, confirmed, last } = screenOf();
      shown();
      confirmed('carol');
      created();
      expect(last().field).toEqual({ username: '', ...EMPTY });
    });
  });

  describe('the Edit dialog', () => {
    it('a save with four good facts: the update of that user, once; saving while it is under way', () => {
      const { screen, updateUser, shown, last } = screenOf();
      shown('alice');
      screen.editOpened();
      screen.save('alice', { ...FACTS, email: ' Anna@Example.com ' });
      expect(updateUser).toHaveBeenCalledTimes(1);
      expect(updateUser).toHaveBeenCalledWith('alice', FACTS);
      expect(last().edit).toEqual({ ...NO_EDIT, saving: true });
      screen.save('alice', FACTS); // a second press while under way
      expect(updateUser).toHaveBeenCalledTimes(1);
    });

    it('a save that succeeds: another "saved" object, the list read again', () => {
      const { screen, listUsers, shown, updated, last } = screenOf();
      shown('alice');
      screen.save('alice', FACTS);
      updated();
      expect(last().edit).toEqual({ ...NO_EDIT, saved: expect.any(Object) });
      const first = last().edit.saved;
      expect(listUsers).toHaveBeenCalledTimes(2);
      screen.save('alice', FACTS);
      updated();
      expect(last().edit.saved).not.toBe(first);
    });

    it.each([
      ['cannot_edit_admin', "Another Administrator's details cannot be changed."],
      ['user_not_found', 'This user no longer exists.'],
      ['network', UNREACHABLE],
    ] as const)('a save that fails with %s: its sentence in the dialog, nothing "saved", the list read again', (reason, sentence) => {
      const { screen, listUsers, shown, notUpdated, last } = screenOf();
      shown('alice');
      screen.save('alice', FACTS);
      notUpdated(reason);
      expect(last().edit).toEqual({ ...NO_EDIT, failure: sentence });
      expect(listUsers).toHaveBeenCalledTimes(2);
    });

    it('a fact refused: no call, its refusal in the dialog; typing it right takes it away', () => {
      const { screen, updateUser, shown, last } = screenOf();
      shown('alice');
      screen.save('alice', { ...FACTS, familyName: '' });
      expect(updateUser).not.toHaveBeenCalled();
      expect(last().edit).toEqual({ ...NO_EDIT, refusals: { ...NO_REFUSALS, familyName: PROFILE_RULES.familyName } });
      screen.editTyped(FACTS);
      expect(last().edit.refusals).toEqual(NO_REFUSALS);
    });

    it('opened again: refusals and failure gone; a save still under way stays under way', () => {
      const { screen, shown, notUpdated, last } = screenOf();
      shown('alice');
      screen.save('alice', FACTS);
      notUpdated('internal_error');
      screen.save('alice', { ...FACTS, email: '' });
      screen.editOpened();
      expect(last().edit).toEqual(NO_EDIT);
      screen.save('alice', FACTS);
      screen.editOpened();
      expect(last().edit).toEqual({ ...NO_EDIT, saving: true });
    });

    it('an update not asked for here (from "My details") is not this screen\'s: nothing said, nothing read', () => {
      const { listUsers, shown, updated, notUpdated, last } = screenOf();
      shown('alice');
      updated();
      notUpdated('internal_error');
      expect(last().edit).toEqual(NO_EDIT);
      expect(listUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('after a delete', () => {
    it('a delete that succeeds: the list is read again, and the row goes with the list that arrives', () => {
      const { listUsers, shown, deleted, listed, last } = screenOf();
      shown('alice', 'bob');
      deleted('bob');
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(last()).toMatchObject({ loading: true, rows: [row('alice'), row('bob')] });
      listed('alice');
      expect(last()).toEqual({ ...START, rows: [row('alice')] });
    });

    it.each(['user_not_found', 'cannot_delete_admin', 'concurrent_update', 'network', 'internal_error'] as const)('a delete that fails with %s: the list is read again all the same, and nothing is said here (the dialog says it)', (reason) => {
      const { listUsers, shown, notDeleted, listed, last } = screenOf();
      shown('alice', 'bob');
      const { rows } = last();
      notDeleted(reason);
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, rows, loading: true });
      // The list on show was old: the user was gone already.
      listed('alice');
      expect(last()).toEqual({ ...START, rows: [row('alice')] });
    });

    it('a delete answered before start() is not this start\'s: nothing is read for it', () => {
      const { screen, listUsers, deleted } = screenOf();
      deleted('bob');
      screen.start();
      expect(listUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('the page becomes visible', () => {
    it('the list is read again, each time, and what the form says stays', () => {
      const { screen, listUsers, shown, visible$, last } = screenOf();
      shown('alice');
      screen.create(form('Bob'));
      visible$.next();
      visible$.next();
      expect(listUsers).toHaveBeenCalledTimes(3);
      expect(last()).toMatchObject({ loading: true, rows: [row('alice')], refusal: USERNAME_HINT });
    });
  });

  describe('after the subscription of start() ends', () => {
    it('everything is forgotten, no stream is heard, and nothing is read or created', () => {
      const { screen, listUsersResult$, createUserResult$, resendInvitationResult$, deleteUserResult$, updateUserResult$, visible$, listUsers, createUser, shown, created, deleted, listed, last } =
        screenOf();
      const started = shown('alice');
      screen.create(form('carol'));
      started.unsubscribe();
      expect(last()).toEqual(START);
      expect([listUsersResult$.observed, createUserResult$.observed, resendInvitationResult$.observed, deleteUserResult$.observed, updateUserResult$.observed, visible$.observed]).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
      screen.create(form('carol'));
      screen.confirm();
      screen.retry();
      created();
      deleted('alice');
      visible$.next();
      listed('carol');
      expect([listUsers.mock.calls.length, createUser.mock.calls.length]).toEqual([1, 0]);
      expect(last()).toEqual(START);
    });

    it('started again, the list is read again', () => {
      const { screen, listUsers, shown, listed, last } = screenOf();
      shown('alice').unsubscribe();
      screen.start();
      expect(listUsers).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, loading: true });
      listed('alice', 'carol');
      expect(last().rows).toEqual([row('alice'), row('carol')]);
    });

    it('left while a create was under way, its late answer is not the next start\'s', () => {
      const { screen, listUsers, shown, created, confirmed, listed, last } = screenOf();
      const started = shown();
      confirmed('carol');
      started.unsubscribe();
      created();
      screen.start();
      listed('carol');
      expect(last()).toMatchObject({ invite: null });
      expect(listUsers).toHaveBeenCalledTimes(2);
    });
  });

  it('a late subscriber gets the current state at once', () => {
    const { screen, shown } = screenOf();
    shown('alice');
    const late: UsersState[] = [];
    screen.users$.subscribe((s) => late.push(s));
    expect(late).toHaveLength(1);
    expect(late[0]!.rows).toEqual([row('alice')]);
  });
});
