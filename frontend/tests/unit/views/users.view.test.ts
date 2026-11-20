import { BehaviorSubject } from 'rxjs';
import { deleteQuestion, USERNAME_HINT, userRows, usernameFor } from '../../../src/logic/users.model';
import type { UsersState } from '../../../src/logic/users.screen';
import type { CreateUserState, DeleteUserState } from '../../../src/services/users.types';
import { mountUsers, type UsersDeps } from '../../../src/views/users.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the users view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html, a fake UsersScreen whose stream the test controls, and the part of the
// UsersService the view uses, with two state streams that keep their last value, as the real
// ones do. What a username is and the words of a refusal are checked in the logic layer's
// tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
// Made for this file: no server generated it.
const PASSWORD = 'Xk3-made.up_Pass!7';
const OTHER_PASSWORD = 'Zq9-other.one_Pass?2';

// The field's object stays the same from one state to the next unless a test brings another:
// another object is what tells the view to fill the field again.
const FIELD = { username: '' };
const state = (over: Partial<UsersState> = {}): UsersState => ({ loading: false, unread: null, rows: null, empty: null, field: FIELD, creating: false, refusal: null, failure: null, created: null, ...over });
const rows = (...usernames: string[]) => userRows(usernames.map((username) => ({ username, createdAt: '2026-11-01T10:00:00.000Z' })));
const TWO = rows('alice', 'bob');
const listed = (over: Partial<UsersState> = {}) => state({ rows: TWO, ...over });
const createdAs = (username: string, password = PASSWORD): CreateUserState => ({ status: 'success', user: { username, password } });

function mounted(first: UsersState = state(), create: CreateUserState = { status: 'idle' }, remove: DeleteUserState = { status: 'idle' }) {
  const users$ = new BehaviorSubject<UsersState>(first);
  const createUserState$ = new BehaviorSubject<CreateUserState>(create);
  const deleteUserState$ = new BehaviorSubject<DeleteUserState>(remove);
  const screen = { users$: users$.asObservable(), create: vi.fn<UsersDeps['screen']['create']>(), retry: vi.fn<UsersDeps['screen']['retry']>() };
  const users = { createUserState$: createUserState$.asObservable(), deleteUser: vi.fn<UsersDeps['users']['deleteUser']>(), deleteUserState$: deleteUserState$.asObservable() };
  const root = find('#users');
  const subscription = mountUsers(root, { screen, users });
  return { users$, createUserState$, deleteUserState$, screen, users, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#users ${selector}`);
const form = () => one<HTMLFormElement>('form.create');
const field = () => one<HTMLInputElement>('[name="username"]');
const refusal = () => one('.field .refusal');
const items = () => [...document.querySelectorAll<HTMLElement>('#users .list > li')];
const names = () => items().map((item) => item.querySelector('.username')!.textContent);
const deleteOf = (username: string) => items().find((item) => item.querySelector('.username')!.textContent === username)!.querySelector<HTMLButtonElement>('button')!;
const created = () => one<HTMLDialogElement>('dialog.created');
const remove = () => one<HTMLDialogElement>('dialog.delete');
const removeSubmit = () => one<HTMLButtonElement>('dialog.delete .submit');
const html = () => document.documentElement.outerHTML;
// Whether a text is anywhere in the page: in its source, attributes included, in what a field
// holds, or in the address.
const anywhere = (text: string) =>
  html().includes(text) ||
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')].some((held) => held.value.includes(text)) ||
  window.location.href.includes(text) ||
  document.title.includes(text);
// Types a name and presses "Create user".
const ask = (text: string) => {
  field().value = text;
  return submit(form());
};

describe('mountUsers', () => {
  useRealPage();

  describe('the states of users$', () => {
    it('nothing yet: the form, usable, with the hint under its field; no row, no "Loading…", no failure', () => {
      mounted();
      expect([one('.loading').hidden, one('.unread').hidden, one('.empty').hidden]).toEqual([true, true, true]);
      expect(items()).toHaveLength(0);
      expect(form().hidden).toBe(false);
      expect(one('.field .hint').textContent).toBe(USERNAME_HINT);
      expect([field().value, field().hasAttribute('aria-invalid'), refusal().textContent, one('.failure').textContent]).toEqual(['', false, '', '']);
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(false);
    });

    it('reading: "Loading…" is shown, announced', () => {
      mounted(state({ loading: true }));
      expect(one('.loading').hidden).toBe(false);
      expect(one('.loading').getAttribute('role')).toBe('status');
    });

    it('a read that failed: why, announced, in the place of the list, with "Try again"; the form stays usable', () => {
      mounted(state({ unread: FAILURE }));
      expect(one('.unread').hidden).toBe(false);
      expect(one('.unread .error').textContent).toBe(FAILURE);
      expect(one('.unread .error').getAttribute('role')).toBe('alert');
      expect(items()).toHaveLength(0);
      expect([form().hidden, one<HTMLButtonElement>('.submit').disabled]).toEqual([false, false]);
    });

    it('the list: one row per user, in the order given, each with the username and a "Delete" that says whom', () => {
      mounted(listed());
      expect(names()).toEqual(['alice', 'bob']);
      expect(items().map((item) => [item.querySelector('button')!.textContent, item.querySelector('button')!.getAttribute('aria-label')])).toEqual([
        ['Delete', 'Delete alice'],
        ['Delete', 'Delete bob'],
      ]);
      expect([one('.unread').hidden, one('.empty').hidden]).toEqual([true, true]);
    });

    it('an empty list: its sentence, and no row', () => {
      mounted(state({ rows: [], empty: 'There are no users yet.' }));
      expect([one('.empty').hidden, one('.empty').textContent]).toEqual([false, 'There are no users yet.']);
      expect(items()).toHaveLength(0);
    });

    it('a create under way: "Create user" is disabled, and what is typed stays', () => {
      const { users$ } = mounted(listed());
      field().value = 'carol';
      users$.next(listed({ creating: true }));
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(true);
      expect(field().value).toBe('carol');
      users$.next(listed());
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(false);
    });

    it('a create that failed: why, announced, in the form, and the field not marked; gone when the stream says so', () => {
      const { users$ } = mounted(listed({ failure: FAILURE }));
      expect(one('.failure').textContent).toBe(FAILURE);
      expect(one('.failure').getAttribute('role')).toBe('alert');
      expect(one('.failure').closest('form')).toBe(form());
      expect([field().hasAttribute('aria-invalid'), refusal().textContent]).toEqual([false, '']);
      users$.next(listed());
      expect(one('.failure').textContent).toBe('');
    });

    it('a create that succeeded changes nothing by its username alone: the dialog is the service\'s result\'s to open', () => {
      mounted(listed({ created: 'carol' }));
      expect(created().open).toBe(false);
      expect(names()).toEqual(['alice', 'bob']);
    });
  });

  describe('the username field in fault', () => {
    it('its sentence is under it, announced, and the field is marked', () => {
      mounted(listed({ refusal: USERNAME_HINT }));
      expect(refusal().textContent).toBe(USERNAME_HINT);
      expect(refusal().getAttribute('role')).toBe('alert');
      expect(refusal().closest('.field')).toBe(field().closest('.field'));
      expect(field().getAttribute('aria-invalid')).toBe('true');
    });

    it('it goes when the stream says so, and what was typed stays all along', () => {
      const { users$ } = mounted(listed());
      field().value = 'Bob';
      users$.next(listed({ refusal: USERNAME_HINT }));
      expect(field().value).toBe('Bob');
      users$.next(listed());
      expect([refusal().textContent, field().hasAttribute('aria-invalid'), field().value]).toEqual(['', false, 'Bob']);
    });

    it('the refusal of the logic layer is the hint that stands under the field', () => {
      mounted();
      const checked = usernameFor('Bob');
      expect('refusal' in checked && checked.refusal).toBe(one('.field .hint').textContent);
    });
  });

  describe('"Create user"', () => {
    it('calls create() with the field\'s text as it is, once, and changes nothing on screen by itself', () => {
      const { screen } = mounted(listed());
      field().value = ' Carol ';
      const before = html();
      const { prevented } = submit(form());
      expect(prevented).toBe(true);
      expect(screen.create).toHaveBeenCalledTimes(1);
      expect(screen.create).toHaveBeenCalledWith(' Carol ');
      expect(html()).toBe(before);
      expect([field().value, one<HTMLButtonElement>('.submit').disabled, refusal().textContent]).toEqual([' Carol ', false, '']);
    });

    it('an empty field goes as an empty text: the view checks nothing', () => {
      const { screen } = mounted(listed());
      submit(form());
      expect(screen.create).toHaveBeenCalledWith('');
      expect([refusal().textContent, field().hasAttribute('aria-invalid')]).toEqual(['', false]);
    });

    it('the field is emptied only when the stream brings another object for it', () => {
      const { users$ } = mounted(listed());
      field().value = 'carol';
      users$.next(listed({ creating: true }));
      users$.next(listed({ failure: FAILURE }));
      users$.next(listed({ rows: rows('alice') }));
      expect(field().value).toBe('carol');
      users$.next(listed({ field: { username: '' }, created: 'carol' }));
      expect(field().value).toBe('');
    });

    it('"Try again" calls retry(), once, and nothing else', () => {
      const { screen } = mounted(state({ unread: FAILURE }));
      one('.retry').click();
      expect(screen.retry).toHaveBeenCalledTimes(1);
      expect(screen.create).not.toHaveBeenCalled();
      expect(one('.unread').hidden).toBe(false);
    });
  });

  describe('the password dialog', () => {
    it('a create this mount asked for succeeds: the dialog opens with the username and the password as text, and its sentence', () => {
      const { createUserState$ } = mounted(listed());
      ask('carol');
      createUserState$.next({ status: 'pending', username: 'carol' });
      expect(created().open).toBe(false);
      createUserState$.next(createdAs('carol'));
      expect(created().open).toBe(true);
      expect(one('dialog.created .username').textContent).toBe('carol');
      expect(one('dialog.created .password').textContent).toBe(PASSWORD);
      expect(created().textContent).toContain('This password cannot be shown again. Give it to the user now.');
      expect(document.getElementById(created().getAttribute('aria-labelledby')!)!.textContent).toBe('User created');
    });

    it('the password is in one element, as its text, and nowhere else: no attribute, no field, no address, no title', () => {
      const { createUserState$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      const holders = [...document.querySelectorAll('*')].filter((element) => element.children.length === 0 && element.textContent.includes(PASSWORD));
      expect(holders).toEqual([one('dialog.created .password')]);
      const attributes = [...document.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().map((name) => element.getAttribute(name)!));
      expect(attributes.filter((value) => value.includes(PASSWORD))).toEqual([]);
      expect([...document.querySelectorAll<HTMLInputElement>('input, textarea, select')].filter((held) => held.value.includes(PASSWORD))).toEqual([]);
      expect([window.location.href.includes(PASSWORD), document.title.includes(PASSWORD)]).toEqual([false, false]);
    });

    it('a username and a password containing <script> are shown as text', () => {
      const { createUserState$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs(SCRIPT, SCRIPT));
      for (const element of [one('dialog.created .username'), one('dialog.created .password')]) {
        expect(element.textContent).toBe(SCRIPT);
        expect(element.children).toHaveLength(0);
      }
      expect(document.querySelectorAll('#users script, #users b')).toHaveLength(0);
    });

    it('a success that was already there at the mount, an earlier visit\'s, does not open it and reaches no element', () => {
      const { createUserState$ } = mounted(listed(), createdAs('carol'));
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      // Nor does a "Create user" the check refuses, after which the service says nothing new.
      ask('Bob');
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      // The next create's own success does.
      createUserState$.next({ status: 'pending', username: 'dave' });
      createUserState$.next(createdAs('dave', OTHER_PASSWORD));
      expect(created().open).toBe(true);
      expect(one('dialog.created .password').textContent).toBe(OTHER_PASSWORD);
      expect(anywhere(PASSWORD)).toBe(false);
    });

    it('a create that fails opens nothing', () => {
      const { createUserState$ } = mounted(listed());
      ask('alice');
      createUserState$.next({ status: 'pending', username: 'alice' });
      createUserState$.next({ status: 'failure', reason: 'user_exists', message: 'for a developer' });
      expect(created().open).toBe(false);
      expect(html()).not.toContain('for a developer');
    });

    it('the cancel event, which the Escape key sends, is refused: the dialog stays open with the password', () => {
      const { createUserState$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      for (let press = 0; press < 5; press++) {
        const cancel = new Event('cancel', { cancelable: true });
        created().dispatchEvent(cancel);
        expect(cancel.defaultPrevented).toBe(true);
      }
      expect(created().open).toBe(true);
      expect(one('dialog.created .password').textContent).toBe(PASSWORD);
      expect(created().getAttribute('closedby')).toBe('none');
    });

    it('its button closes it, and after the close the password is nowhere in the document', () => {
      const { createUserState$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      expect(anywhere(PASSWORD)).toBe(true);
      one('dialog.created .understood').click();
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      expect([one('dialog.created .username').textContent, one('dialog.created .password').textContent]).toEqual(['', '']);
    });

    it('closed, it is not opened again by what the streams say next; the next create opens it with its own password only', () => {
      const { createUserState$, users$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      one('dialog.created .understood').click();
      users$.next(listed({ rows: rows('alice', 'bob', 'carol'), field: { username: '' }, created: 'carol' }));
      users$.next(listed({ rows: rows('alice', 'bob', 'carol'), loading: true, created: 'carol' }));
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);

      ask('dave');
      createUserState$.next({ status: 'pending', username: 'dave' });
      createUserState$.next(createdAs('dave', OTHER_PASSWORD));
      expect(created().open).toBe(true);
      expect([one('dialog.created .username').textContent, one('dialog.created .password').textContent]).toEqual(['dave', OTHER_PASSWORD]);
      expect(anywhere(PASSWORD)).toBe(false);
    });

    it('a list that arrives behind the open dialog redraws the rows and leaves the dialog and its password as they are', () => {
      const { createUserState$, users$ } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      users$.next(listed({ loading: true, field: { username: '' }, created: 'carol' }));
      users$.next(listed({ rows: rows('alice', 'bob', 'carol'), created: 'carol' }));
      expect(names()).toEqual(['alice', 'bob', 'carol']);
      expect(created().open).toBe(true);
      expect(one('dialog.created .password').textContent).toBe(PASSWORD);
    });

    it('after the view is left with the dialog open, it is closed and the password is nowhere in the document', () => {
      const before = html();
      const { createUserState$, subscription } = mounted(listed());
      ask('carol');
      createUserState$.next(createdAs('carol'));
      expect(anywhere(PASSWORD)).toBe(true);
      subscription.unsubscribe();
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      expect(anywhere('carol')).toBe(false);
      expect(html()).toBe(before);
    });
  });

  describe('the delete dialog', () => {
    it('a row\'s "Delete" opens it with that user\'s words, and calls nothing', () => {
      const { users } = mounted(listed());
      deleteOf('bob').click();
      expect(remove().open).toBe(true);
      expect(one('dialog.delete .question').textContent).toBe(deleteQuestion('bob'));
      expect(one('dialog.delete .question').textContent).toBe('Delete bob? Their future appointments will be cancelled. This cannot be undone.');
      expect([one('dialog.delete .error').textContent, removeSubmit().disabled]).toEqual(['', false]);
      expect(users.deleteUser).not.toHaveBeenCalled();
    });

    it('"Keep" closes it with no call; so does the Escape key', () => {
      const { users } = mounted(listed());
      deleteOf('bob').click();
      one('dialog.delete .keep').click();
      expect(remove().open).toBe(false);
      deleteOf('alice').click();
      remove().close(); // the Escape key, which the emulated page does not have
      expect(remove().open).toBe(false);
      expect(users.deleteUser).not.toHaveBeenCalled();
      expect(names()).toEqual(['alice', 'bob']);
    });

    it('"Delete user" calls deleteUser() with the user the dialog is about, once, and changes nothing by itself', () => {
      const { users } = mounted(listed());
      deleteOf('bob').click();
      removeSubmit().click();
      expect(users.deleteUser).toHaveBeenCalledTimes(1);
      expect(users.deleteUser).toHaveBeenCalledWith('bob');
      expect([remove().open, removeSubmit().disabled, one('dialog.delete .error').textContent]).toEqual([true, false, '']);
      expect(names()).toEqual(['alice', 'bob']);
    });

    it('while a delete is under way "Delete user" is disabled, and the dialog stays open', () => {
      const { deleteUserState$ } = mounted(listed());
      deleteOf('bob').click();
      removeSubmit().click();
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      expect([removeSubmit().disabled, remove().open]).toEqual([true, true]);
    });

    it.each([
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['user_not_found', 'This user no longer exists.'],
      ['cannot_delete_admin', 'An Administrator cannot be deleted.'],
      ['network', FAILURE],
      ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
    ] as const)('a delete that fails with %s: its sentence, announced, the dialog still open, and "Delete user" works again', (reason, sentence) => {
      const { deleteUserState$, users } = mounted(listed());
      deleteOf('bob').click();
      removeSubmit().click();
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      deleteUserState$.next({ status: 'failure', reason, message: 'for a developer' });
      expect(one('dialog.delete .error').textContent).toBe(sentence);
      expect(one('dialog.delete .error').getAttribute('role')).toBe('alert');
      expect([remove().open, removeSubmit().disabled]).toEqual([true, false]);
      expect(html()).not.toContain('for a developer');

      removeSubmit().click();
      expect(users.deleteUser).toHaveBeenCalledTimes(2);
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      expect(one('dialog.delete .error').textContent).toBe('');
      deleteUserState$.next({ status: 'success', username: 'bob' });
      expect(remove().open).toBe(false);
    });

    it('its success closes it; the row goes when the stream brings the list without it', () => {
      const { deleteUserState$, users$ } = mounted(listed());
      deleteOf('bob').click();
      removeSubmit().click();
      deleteUserState$.next({ status: 'success', username: 'bob' });
      expect(remove().open).toBe(false);
      expect(names()).toEqual(['alice', 'bob']);
      users$.next(listed({ rows: rows('alice') }));
      expect(names()).toEqual(['alice']);
    });

    it('a result of a delete this dialog did not ask for changes nothing in it: one that was there at the mount, one of an earlier opening', () => {
      const { deleteUserState$ } = mounted(listed(), { status: 'idle' }, { status: 'failure', reason: 'network', message: 'for a developer' });
      deleteOf('bob').click();
      expect([remove().open, one('dialog.delete .error').textContent]).toEqual([true, '']);
      // Asked for, then closed while it was under way: its answer finds another opening.
      removeSubmit().click();
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      one('dialog.delete .keep').click();
      deleteOf('alice').click();
      expect(removeSubmit().disabled).toBe(true); // a delete is under way, whoever asked
      deleteUserState$.next({ status: 'failure', reason: 'concurrent_update', message: 'for a developer' });
      expect([remove().open, one('dialog.delete .error').textContent, removeSubmit().disabled]).toEqual([true, '', false]);
      deleteUserState$.next({ status: 'success', username: 'bob' });
      expect(remove().open).toBe(true);
      expect(one('dialog.delete .question').textContent).toBe(deleteQuestion('alice'));
    });

    it('opened a second time, it shows nothing of the first: the other user, and no failure', () => {
      const { deleteUserState$, users } = mounted(listed());
      deleteOf('bob').click();
      removeSubmit().click();
      deleteUserState$.next({ status: 'failure', reason: 'network', message: 'for a developer' });
      one('dialog.delete .keep').click();
      deleteOf('alice').click();
      expect([one('dialog.delete .question').textContent, one('dialog.delete .error').textContent]).toEqual([deleteQuestion('alice'), '']);
      removeSubmit().click();
      expect(users.deleteUser).toHaveBeenLastCalledWith('alice');
    });

    it('a close event that arrives late, after the dialog was opened again, changes nothing: it still deletes the user it names and closes on its success', () => {
      const { deleteUserState$, users } = mounted(listed());
      deleteOf('bob').click();
      remove().close(); // the Escape key
      deleteOf('bob').click(); // opened again at once
      // A browser sends the close event a moment after the close: here, after the new opening.
      remove().dispatchEvent(new Event('close'));
      removeSubmit().click();
      expect(users.deleteUser).toHaveBeenCalledWith('bob');
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      remove().dispatchEvent(new Event('close'));
      deleteUserState$.next({ status: 'success', username: 'bob' });
      expect(remove().open).toBe(false);
    });

    it('a list that arrives behind the open dialog leaves it as it is, and it still deletes the user it named', () => {
      const { users$, users } = mounted(listed());
      deleteOf('bob').click();
      users$.next(listed({ rows: rows('alice') }));
      expect(remove().open).toBe(true);
      removeSubmit().click();
      expect(users.deleteUser).toHaveBeenCalledWith('bob');
    });
  });

  describe('drawing the rows', () => {
    it('the rows are redrawn only when the list is another object: a notification that brings nothing new leaves the elements, and the keyboard, where they are', () => {
      const { users$ } = mounted(listed());
      const before = items();
      deleteOf('bob').focus();
      users$.next(listed({ loading: true }));
      users$.next(listed({ creating: true, refusal: USERNAME_HINT }));
      users$.next(listed({ failure: FAILURE }));
      expect(items()).toEqual(before);
      expect(items().every((item, i) => item === before[i])).toBe(true);
      expect(document.activeElement).toBe(deleteOf('bob'));

      users$.next(listed({ rows: rows('alice', 'bob') })); // the same users, another object
      expect(items().some((item, i) => item === before[i])).toBe(false);
      expect(names()).toEqual(['alice', 'bob']);
    });

    it('no list any more: the rows go', () => {
      const { users$ } = mounted(listed());
      users$.next(state({ unread: FAILURE }));
      expect(items()).toHaveLength(0);
    });
  });

  it('a username containing <script> is shown as text in its row, in its button\'s name and in the delete dialog; so are the sentences', () => {
    mounted(state({ rows: rows(SCRIPT), failure: SCRIPT, refusal: SCRIPT, empty: SCRIPT, unread: SCRIPT }));
    expect(names()).toEqual([SCRIPT]);
    expect(items()[0]!.querySelector('.username')!.children).toHaveLength(0);
    expect(deleteOf(SCRIPT).getAttribute('aria-label')).toBe(`Delete ${SCRIPT}`);
    deleteOf(SCRIPT).click();
    expect(one('dialog.delete .question').textContent).toBe(deleteQuestion(SCRIPT));
    for (const element of [one('dialog.delete .question'), one('.failure'), refusal(), one('.empty'), one('.unread .error')]) {
      expect(element.textContent).toContain(SCRIPT);
      expect(element.children).toHaveLength(0);
    }
    expect(document.querySelectorAll('#users script, #users b')).toHaveLength(0);
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it: no row, no name, both dialogs closed and empty, the field emptied and not in fault', () => {
      const before = html();
      const { subscription, createUserState$, deleteUserState$ } = mounted(listed({ loading: true, creating: true, failure: FAILURE, refusal: USERNAME_HINT, created: 'carol' }));
      ask('carol');
      createUserState$.next(createdAs('carol'));
      deleteOf('bob').click(); // the emulated page lets a click through a modal dialog
      removeSubmit().click();
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      field().value = 'dave';
      expect([created().open, remove().open]).toEqual([true, true]);
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(items()).toHaveLength(0);
      expect([created().open, remove().open]).toEqual([false, false]);
      expect([field().value, field().hasAttribute('aria-invalid')]).toEqual(['', false]);
      expect([one<HTMLButtonElement>('.submit').disabled, removeSubmit().disabled]).toEqual([false, false]);
      for (const gone of ['alice', 'bob', 'carol', 'dave', PASSWORD, 'A username has']) expect(anywhere(gone), gone).toBe(false);
      expect(html()).toBe(before);
    });

    it('after a read that failed and after an empty list: the sentences are gone', () => {
      const before = html();
      mounted(state({ unread: FAILURE, loading: true })).subscription.unsubscribe();
      expect(html()).toBe(before);
      mounted(state({ rows: [], empty: 'There are no users yet.' })).subscription.unsubscribe();
      expect(html()).toBe(before);
    });

    it('the streams are no longer heard: a success that arrives later opens nothing', () => {
      const { users$, createUserState$, deleteUserState$, subscription } = mounted(listed());
      ask('carol');
      subscription.unsubscribe();
      expect([users$.observed, createUserState$.observed, deleteUserState$.observed]).toEqual([false, false, false]);
      createUserState$.next(createdAs('carol'));
      users$.next(listed({ failure: FAILURE }));
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      expect(items()).toHaveLength(0);
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(listed());
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new objects only: the first mount\'s create opens nothing in the second', () => {
      const first = mounted(listed());
      ask('carol');
      first.subscription.unsubscribe();
      // The service is the session's: its state, with the first mount's success, is still there.
      const second = mounted(listed({ rows: rows('zoe') }), createdAs('carol'));
      expect(names()).toEqual(['zoe']);
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      ask('dave');
      expect(first.screen.create).toHaveBeenCalledTimes(1);
      expect(second.screen.create).toHaveBeenCalledWith('dave');
      deleteOf('zoe').click();
      removeSubmit().click();
      expect(first.users.deleteUser).not.toHaveBeenCalled();
      expect(second.users.deleteUser).toHaveBeenCalledWith('zoe');
    });
  });
});
