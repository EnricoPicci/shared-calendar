import { ReplaySubject, Subject } from 'rxjs';
import { NO_USERS, USERNAME_HINT } from '../../../src/logic/users.model';
import { UsersScreen, type CreateOutcome, type UsersCalls, type UsersState } from '../../../src/logic/users.screen';
import type { DeleteUserResult, ListUsersResult } from '../../../src/services/users.types';
import { useFarBrowserZone } from './zone';

// A fake UsersService: three result streams that replay their last value, as the real ones
// do, and two spies. No network, no DOM. A create's success is given as the screen reads it,
// with the username only: nothing in this file stands for a generated password.

const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const START: UsersState = { loading: false, unread: null, rows: null, empty: null, field: { username: '' }, creating: false, refusal: null, failure: null, created: null };
const user = (username: string) => ({ username, createdAt: '2026-11-01T10:00:00.000Z' });
const row = (username: string) => ({ username, deleteLabel: `Delete ${username}` });

function screenOf() {
  const listUsersResult$ = new ReplaySubject<ListUsersResult>(1);
  const createUserResult$ = new ReplaySubject<CreateOutcome>(1);
  const deleteUserResult$ = new ReplaySubject<DeleteUserResult>(1);
  const visible$ = new Subject<void>();
  const listUsers = vi.fn<UsersCalls['listUsers']>();
  const createUser = vi.fn<UsersCalls['createUser']>();
  const screen = new UsersScreen(
    { listUsers, createUser, listUsersResult$: listUsersResult$.asObservable(), createUserResult$: createUserResult$.asObservable(), deleteUserResult$: deleteUserResult$.asObservable() },
    visible$,
  );
  const states: UsersState[] = [];
  screen.users$.subscribe((s) => states.push(s)); // the view subscribes first
  const listed = (...usernames: string[]) => listUsersResult$.next({ status: 'success', users: usernames.map(user) });
  const unread = (reason: 'network' | 'forbidden' | 'internal_error' = 'network') => listUsersResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const created = (username: string) => createUserResult$.next({ status: 'success', user: { username } });
  const notCreated = (reason: Extract<CreateOutcome, { status: 'failure' }>['reason']) => createUserResult$.next({ status: 'failure', reason });
  const deleted = (username: string) => deleteUserResult$.next({ status: 'success', username });
  const notDeleted = (reason: Extract<DeleteUserResult, { status: 'failure' }>['reason']) => deleteUserResult$.next({ status: 'failure', reason, message: 'for a developer' });
  // Started, with the list read.
  const shown = (...usernames: string[]) => {
    const started = screen.start();
    listed(...usernames);
    return started;
  };
  const streams = { listUsersResult$, createUserResult$, deleteUserResult$, visible$ };
  return { screen, ...streams, listUsers, createUser, states, listed, unread, created, notCreated, deleted, notDeleted, shown, last: () => states.at(-1)! };
}

describe('UsersScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is read, no stream is listened to, and the state is empty', () => {
      const { listUsers, createUser, states, listUsersResult$, createUserResult$, deleteUserResult$, visible$ } = screenOf();
      expect(listUsers).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect([listUsersResult$.observed, createUserResult$.observed, deleteUserResult$.observed, visible$.observed]).toEqual([false, false, false, false]);
      expect(states).toEqual([START]);
    });

    it('create() and retry() do nothing', () => {
      const { screen, listUsers, createUser, states } = screenOf();
      screen.create('carol');
      screen.create('Bob');
      screen.retry();
      expect([listUsers.mock.calls.length, createUser.mock.calls.length, states.length]).toEqual([0, 0, 1]);
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
      const { screen, createUser, unread, last } = screenOf();
      screen.start();
      unread();
      screen.create('carol');
      expect(createUser).toHaveBeenCalledWith('carol');
      expect(last()).toMatchObject({ creating: true, unread: UNREACHABLE });
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

  describe('create(text)', () => {
    it('a username: it goes to the service, once, and the screen says a create is under way; the list is not read yet', () => {
      const { screen, createUser, listUsers, shown, last } = screenOf();
      shown('alice');
      const { rows, field } = last();
      screen.create('carol');
      expect(createUser).toHaveBeenCalledTimes(1);
      expect(createUser).toHaveBeenCalledWith('carol');
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, rows, creating: true });
      expect(last().field).toBe(field); // what was typed stays while the call is under way
    });

    it('spaces around the name are removed before it is sent', () => {
      const { screen, createUser, shown } = screenOf();
      shown();
      screen.create(' carol ');
      expect(createUser).toHaveBeenCalledWith('carol');
    });

    it('"admin" passes the check: the server is the one to say that it exists', () => {
      const { screen, createUser, shown } = screenOf();
      shown();
      screen.create('admin');
      expect(createUser).toHaveBeenCalledWith('admin');
    });

    it.each(['', 'ab', 'Bob', 'alice smith', '-alice', 'a'.repeat(33)])('"%s" is refused by the check: the refusal, no call, the list kept and not read again', (text) => {
      const { screen, createUser, listUsers, shown, states, last } = screenOf();
      shown('alice');
      const before = last();
      screen.create(text);
      expect(createUser).not.toHaveBeenCalled();
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...before, refusal: USERNAME_HINT });
      expect(last().rows).toBe(before.rows);
      expect(last().field).toBe(before.field); // what was typed stays
      expect(states.filter((s) => s.creating)).toHaveLength(0);
    });

    it('the refusal goes at the next create that is sent; a refusal takes an earlier failure away', () => {
      const { screen, shown, notCreated, last } = screenOf();
      shown();
      screen.create('Bob');
      screen.create('bob');
      expect(last()).toMatchObject({ refusal: null, creating: true });
      notCreated('user_exists');
      expect(last().failure).not.toBeNull();
      screen.create('Bob');
      expect(last()).toMatchObject({ refusal: USERNAME_HINT, failure: null });
    });

    it('a create that succeeds: its username in the stream, the field to empty, and the list read again', () => {
      const { screen, listUsers, shown, created, listed, last } = screenOf();
      shown('alice');
      const { rows, field } = last();
      screen.create('carol');
      created('carol');
      expect(last()).toEqual({ ...START, rows, loading: true, created: 'carol' });
      expect(last().field).not.toBe(field); // another object: the view empties the field
      expect(last().field).toEqual({ username: '' });
      expect(listUsers).toHaveBeenCalledTimes(2);
      const emptied = last().field;
      listed('alice', 'carol');
      expect(last()).toEqual({ ...START, rows: [row('alice'), row('carol')], created: 'carol' });
      expect(last().field).toBe(emptied); // the read fills nothing
    });

    it('no state of the stream has a place for a password: a create is known by its username only', () => {
      const { screen, shown, created, listed, states } = screenOf();
      shown('alice');
      screen.create('carol');
      created('carol');
      listed('alice', 'carol');
      const keys = new Set(states.flatMap((s) => Object.keys(s)));
      expect([...keys].sort()).toEqual(['created', 'creating', 'empty', 'failure', 'field', 'loading', 'refusal', 'rows', 'unread']);
      expect(JSON.stringify(states)).not.toMatch(/password/i);
    });

    it.each([
      ['user_exists', 'A user with this username exists already. Choose another username.'],
      ['network', UNREACHABLE],
      ['invalid_request', 'The request was not accepted. Check what you entered and try again.'],
      ['forbidden', 'Your account is not allowed to do this.'],
      ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
    ] as const)('a create that fails with %s: its sentence, the field not marked and not emptied, the list read again all the same, and the next create can be made', (reason, sentence) => {
      const { screen, createUser, listUsers, shown, notCreated, created, listed, last } = screenOf();
      shown('alice');
      const { field } = last();
      screen.create('alice');
      notCreated(reason);
      expect(last()).toMatchObject({ creating: false, failure: sentence, refusal: null, created: null, loading: true });
      expect(last().field).toBe(field);
      expect(listUsers).toHaveBeenCalledTimes(2);
      // The server had applied it: the list says so, and the failure stays said.
      listed('alice', 'carol');
      expect(last()).toMatchObject({ rows: [row('alice'), row('carol')], failure: sentence });

      screen.create('dave');
      expect(createUser).toHaveBeenCalledTimes(2);
      expect(last()).toMatchObject({ creating: true, failure: null });
      created('dave');
      expect(last()).toMatchObject({ creating: false, failure: null, created: 'dave' });
    });

    it('a second create while one is under way goes to the service, which keeps the last', () => {
      const { screen, createUser, shown, created, last } = screenOf();
      shown();
      screen.create('carol');
      screen.create('dave');
      expect(createUser).toHaveBeenCalledTimes(2);
      expect(createUser).toHaveBeenLastCalledWith('dave');
      expect(last().creating).toBe(true);
      created('dave');
      expect(last()).toMatchObject({ creating: false, created: 'dave' });
    });

    it('"created" goes at the next create, sent or refused', () => {
      const { screen, shown, created, last } = screenOf();
      shown();
      screen.create('carol');
      created('carol');
      screen.create('Bob');
      expect(last().created).toBeNull();
      screen.create('dave');
      created('dave');
      screen.create('erin');
      expect(last().created).toBeNull();
    });

    it('a create answered before start() is not this start\'s: nothing is said and nothing read for it', () => {
      const { screen, listUsers, created, listed, last } = screenOf();
      created('carol');
      screen.start();
      listed('alice', 'carol');
      expect(listUsers).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, rows: [row('alice'), row('carol')] });
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
      screen.create('Bob');
      visible$.next();
      visible$.next();
      expect(listUsers).toHaveBeenCalledTimes(3);
      expect(last()).toMatchObject({ loading: true, rows: [row('alice')], refusal: USERNAME_HINT });
    });
  });

  describe('after the subscription of start() ends', () => {
    it('everything is forgotten, no stream is heard, and nothing is read or created', () => {
      const { screen, listUsersResult$, createUserResult$, deleteUserResult$, visible$, listUsers, createUser, shown, created, deleted, listed, last } = screenOf();
      const started = shown('alice');
      screen.create('Bob');
      started.unsubscribe();
      expect(last()).toEqual(START);
      expect([listUsersResult$.observed, createUserResult$.observed, deleteUserResult$.observed, visible$.observed]).toEqual([false, false, false, false]);
      screen.create('carol');
      screen.retry();
      created('carol');
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
      const { screen, listUsers, shown, created, listed, last } = screenOf();
      const started = shown();
      screen.create('carol');
      started.unsubscribe();
      created('carol');
      screen.start();
      listed('carol');
      expect(last()).toMatchObject({ created: null, creating: false });
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
