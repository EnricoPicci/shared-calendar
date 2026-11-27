import type { MeResponse } from '@shared-calendar/shared';
import { ReplaySubject, Subject } from 'rxjs';

import { MeScreen, type MeCalls, type MeState, type MeUpdateCalls } from '../../../src/logic/me.screen';
import { NO_REFUSALS, profileRules } from '../../../src/logic/profile.model';
import type { UpdateOutcome } from '../../../src/logic/users.screen';
import type { MeResult } from '../../../src/services/me.types';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// A fake MeService and the part of a fake UsersService "My details" uses: result streams that
// replay their last value, as the real ones do, and spies. No network, no DOM.

const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const FACTS = { givenName: 'Ada', familyName: 'Lovelace', email: 'admin@example.com', address: 'Via dei Calcoli 1\n00100 Roma' };
const ADMIN: MeResponse = { username: 'admin', role: 'admin', ...FACTS };
const BARE_ADMIN: MeResponse = { username: 'admin', role: 'admin', givenName: null, familyName: null, email: null, address: null };
const ALICE: MeResponse = { username: 'alice', role: 'user', givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Piazza 7' };
const NO_EDIT = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };

function screenOf(role: 'admin' | 'user' = 'admin') {
  const meResult$ = new ReplaySubject<MeResult>(1);
  const updateUserResult$ = new ReplaySubject<UpdateOutcome>(1);
  const visible$ = new Subject<void>();
  const getMe = vi.fn<MeCalls['getMe']>();
  const updateUser = vi.fn<MeUpdateCalls['updateUser']>();
  const screen = new MeScreen({ getMe, meResult$: meResult$.asObservable() }, { updateUser, updateUserResult$: updateUserResult$.asObservable() }, role, visible$, PAGE_TEXTS_EN);
  const states: MeState[] = [];
  screen.me$.subscribe((s) => states.push(s));
  const read = (me: MeResponse) => meResult$.next({ status: 'success', me });
  const unread = (reason: 'network' | 'user_not_found' = 'network') => meResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const shown = (me: MeResponse) => {
    const started = screen.start();
    read(me);
    return started;
  };
  return { screen, meResult$, updateUserResult$, visible$, getMe, updateUser, states, read, unread, shown, last: () => states.at(-1)! };
}

describe('MeScreen', () => {
  useFarBrowserZone();

  it('before start(): nothing read, no stream heard, nothing done; Edit offered to the Administrator only', () => {
    const { screen, getMe, updateUser, meResult$, updateUserResult$, visible$, states } = screenOf();
    screen.retry();
    screen.editOpened();
    screen.editTyped(FACTS);
    screen.save(FACTS);
    expect([getMe.mock.calls.length, updateUser.mock.calls.length, states.length]).toEqual([0, 0, 1]);
    expect([meResult$.observed, updateUserResult$.observed, visible$.observed]).toEqual([false, false, false]);
    expect(states[0]).toEqual({ loading: false, unread: null, details: null, fields: null, canEdit: true, edit: NO_EDIT });
    expect(screenOf('user').last().canEdit).toBe(false);
  });

  it('start() reads, once, and says it is loading; the details arrive in words, with the fields of the dialog', () => {
    const { screen, getMe, read, last } = screenOf();
    screen.start();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ loading: true, details: null });
    read(ADMIN);
    expect(last()).toEqual({ loading: false, unread: null, details: { ...FACTS, username: 'admin', role: 'Administrator' }, fields: FACTS, canEdit: true, edit: NO_EDIT });
  });

  it('an Administrator without facts yet: "Not set" for each, the dialog empty', () => {
    const { shown, last } = screenOf();
    shown(BARE_ADMIN);
    expect(last().details).toMatchObject({ givenName: PAGE_TEXTS_EN.profile.notSet, familyName: PAGE_TEXTS_EN.profile.notSet, email: PAGE_TEXTS_EN.profile.notSet, address: PAGE_TEXTS_EN.profile.notSet });
    expect(last().fields).toEqual({ givenName: '', familyName: '', email: '', address: '' });
  });

  it('a User: the details, no Edit', () => {
    const { shown, last } = screenOf('user');
    shown(ALICE);
    expect(last()).toMatchObject({ canEdit: false, details: { username: 'alice', role: 'User', givenName: 'Alice' } });
  });

  it('a failed read: why in plain words, no details; retry() reads again', () => {
    const { screen, getMe, unread, read, last } = screenOf();
    screen.start();
    unread('user_not_found');
    expect(last()).toMatchObject({ loading: false, unread: 'This user no longer exists.', details: null, fields: null });
    expect(JSON.stringify(last())).not.toContain('for a developer');
    screen.retry();
    expect(getMe).toHaveBeenCalledTimes(2);
    read(ADMIN);
    expect(last()).toMatchObject({ unread: null, details: { username: 'admin' } });
  });

  it('the page becomes visible: read again; a result from before start() is not this start\'s', () => {
    const { screen, getMe, read, visible$, last } = screenOf();
    read(ALICE);
    screen.start();
    expect(last().details).toBeNull();
    visible$.next();
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  describe('the Administrator\'s Edit dialog', () => {
    it('a save: the update of the own account, with the facts as the rules make them; not twice while under way', () => {
      const { screen, updateUser, shown, last } = screenOf();
      shown(BARE_ADMIN);
      screen.editOpened();
      screen.save({ ...FACTS, givenName: ' Ada ' });
      expect(updateUser).toHaveBeenCalledWith('admin', FACTS);
      expect(last().edit).toEqual({ ...NO_EDIT, saving: true });
      screen.save(FACTS);
      expect(updateUser).toHaveBeenCalledTimes(1);
    });

    it('a save that succeeds: another "saved" object, and the details read again', () => {
      const { screen, getMe, updateUserResult$, shown, last } = screenOf();
      shown(BARE_ADMIN);
      screen.save(FACTS);
      updateUserResult$.next({ status: 'success' });
      expect(last().edit).toEqual({ ...NO_EDIT, saved: expect.any(Object) });
      expect(getMe).toHaveBeenCalledTimes(2);
    });

    it('a save that fails: its sentence, the details read again all the same', () => {
      const { screen, getMe, updateUserResult$, shown, last } = screenOf();
      shown(ADMIN);
      screen.save(FACTS);
      updateUserResult$.next({ status: 'failure', reason: 'network' });
      expect(last().edit).toEqual({ ...NO_EDIT, failure: UNREACHABLE });
      expect(getMe).toHaveBeenCalledTimes(2);
    });

    it('a fact refused: no call, its refusal; typing it right takes it away; opening again starts clean', () => {
      const { screen, updateUser, shown, last } = screenOf();
      shown(ADMIN);
      screen.save({ ...FACTS, email: 'ada' });
      expect(updateUser).not.toHaveBeenCalled();
      expect(last().edit.refusals).toEqual({ ...NO_REFUSALS, email: profileRules(PAGE_TEXTS_EN.profile).email });
      screen.editTyped(FACTS);
      expect(last().edit.refusals).toEqual(NO_REFUSALS);
      screen.save({ ...FACTS, email: 'ada' });
      screen.editOpened();
      expect(last().edit).toEqual(NO_EDIT);
    });

    it('an update not asked for here (from the users screen) is not this screen\'s', () => {
      const { getMe, updateUserResult$, shown, last } = screenOf();
      shown(ADMIN);
      updateUserResult$.next({ status: 'success' });
      expect(last().edit).toEqual(NO_EDIT);
      expect(getMe).toHaveBeenCalledTimes(1);
    });

    it('nothing is saved before the details are read, after a failed read, or by a User', () => {
      const admin = screenOf();
      admin.screen.start();
      admin.screen.save(FACTS);
      admin.unread();
      admin.screen.save(FACTS);
      expect(admin.updateUser).not.toHaveBeenCalled();
      const user = screenOf('user');
      user.shown(ALICE);
      user.screen.save(FACTS);
      expect(user.updateUser).not.toHaveBeenCalled();
    });
  });

  it('after the subscription of start() ends: everything forgotten, no stream heard', () => {
    const { screen, meResult$, updateUserResult$, visible$, getMe, updateUser, shown, states, last } = screenOf();
    const started = shown(ADMIN);
    screen.save(FACTS);
    started.unsubscribe();
    expect(last()).toEqual(states[0]);
    expect([meResult$.observed, updateUserResult$.observed, visible$.observed]).toEqual([false, false, false]);
    screen.save(FACTS);
    screen.retry();
    expect([getMe.mock.calls.length, updateUser.mock.calls.length]).toEqual([1, 1]);
  });
});
