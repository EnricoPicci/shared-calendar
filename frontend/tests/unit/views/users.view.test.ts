import { BehaviorSubject } from 'rxjs';
import { NO_REFUSALS, PROFILE_RULES } from '../../../src/logic/profile.model';
import { deleteQuestion, editTitle, invitedAnswer, inviteQuestion, USERNAME_HINT, userRows, usernameFor } from '../../../src/logic/users.model';
import type { EditState, InviteState, UsersState } from '../../../src/logic/users.screen';
import type { DeleteUserState } from '../../../src/services/users.types';
import { mountUsers, type UsersDeps } from '../../../src/views/users.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the users view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html, a fake UsersScreen whose stream the test controls, and the part of the
// UsersService the view uses, with the delete's state stream, which keeps its last value, as the
// real one does. What a username is and the words of a refusal are checked in the logic layer's
// tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';

// The field's object stays the same from one state to the next unless a test brings another:
// another object is what tells the view to fill the field again.
const EMPTY = { givenName: '', familyName: '', email: '', address: '' };
const FIELD = { username: '', ...EMPTY };
const NO_EDIT: EditState = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };
const state = (over: Partial<UsersState> = {}): UsersState => ({
  loading: false,
  unread: null,
  rows: null,
  empty: null,
  field: FIELD,
  refusal: null,
  refusals: NO_REFUSALS,
  invite: null,
  edit: NO_EDIT,
  ...over,
});
// Each user's facts are made from the username, so that each row holds texts of its own.
const factsOf = (username: string) => ({ givenName: `Given-${username}`, familyName: `Family-${username}`, email: `${username}@example.com`, address: `Street of ${username}\nTown` });
// A User is invited when its username starts with "new", active otherwise.
const rows = (...usernames: string[]) =>
  userRows(usernames.map((username) => ({ username, createdAt: '2026-11-01T10:00:00.000Z', status: username.startsWith('new') ? ('invited' as const) : ('active' as const), ...factsOf(username) })));
const TWO = rows('alice', 'bob');
const listed = (over: Partial<UsersState> = {}) => state({ rows: TWO, ...over });
// The invitation's dialog as the logic layer describes it: asking, sending, gone, failed.
const ASKING: InviteState = { question: inviteQuestion('carol@example.com'), sending: false, answer: null, failure: null };
const SENDING: InviteState = { ...ASKING, sending: true };
const WENT: InviteState = { ...ASKING, answer: invitedAnswer('carol@example.com') };
const FAILED: InviteState = { ...ASKING, failure: FAILURE };

function mounted(first: UsersState = state(), remove: DeleteUserState = { status: 'idle' }) {
  const users$ = new BehaviorSubject<UsersState>(first);
  const deleteUserState$ = new BehaviorSubject<DeleteUserState>(remove);
  const screen = {
    users$: users$.asObservable(),
    create: vi.fn<UsersDeps['screen']['create']>(),
    typed: vi.fn<UsersDeps['screen']['typed']>(),
    retry: vi.fn<UsersDeps['screen']['retry']>(),
    resend: vi.fn<UsersDeps['screen']['resend']>(),
    confirm: vi.fn<UsersDeps['screen']['confirm']>(),
    closeInvite: vi.fn<UsersDeps['screen']['closeInvite']>(),
    editOpened: vi.fn<UsersDeps['screen']['editOpened']>(),
    editTyped: vi.fn<UsersDeps['screen']['editTyped']>(),
    save: vi.fn<UsersDeps['screen']['save']>(),
  };
  const users = { deleteUser: vi.fn<UsersDeps['users']['deleteUser']>(), deleteUserState$: deleteUserState$.asObservable() };
  const root = find('#users');
  const subscription = mountUsers(root, { screen, users });
  return { users$, deleteUserState$, screen, users, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#users ${selector}`);
const form = () => one<HTMLFormElement>('form.create');
const field = () => one<HTMLInputElement>('[name="username"]');
const refusal = () => one('.username-field .refusal');
const items = () => [...document.querySelectorAll<HTMLElement>('#users .list > li')];
const names = () => items().map((item) => item.querySelector('.username')!.textContent);
const rowOf = (username: string) => items().find((item) => item.querySelector('.username')!.textContent === username)!;
const deleteOf = (username: string) => rowOf(username).querySelector<HTMLButtonElement>('.ask-delete')!;
const editOf = (username: string) => rowOf(username).querySelector<HTMLButtonElement>('.ask-edit')!;
const resendOf = (username: string) => rowOf(username).querySelector<HTMLButtonElement>('.ask-resend')!;
const edit = () => one<HTMLDialogElement>('dialog.edit');
const editField = (name: string) => one<HTMLInputElement | HTMLTextAreaElement>(`dialog.edit [name="${name}"]`);
const editFields = () => ['givenName', 'familyName', 'email', 'address'].map((name) => editField(name).value);
const createField = (name: string) => one<HTMLInputElement | HTMLTextAreaElement>(`form.create [name="${name}"]`);
const invite = () => one<HTMLDialogElement>('dialog.invite');
const inviteButton = (name: string) => one<HTMLButtonElement>(`dialog.invite .${name}`);
// Which of the dialog's three buttons are offered, and whether "Confirm" is off.
const offered = () => ['back', 'submit', 'done'].filter((name) => !inviteButton(name).hidden);
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
      expect([field().value, field().hasAttribute('aria-invalid'), refusal().textContent, invite().open]).toEqual(['', false, '', false]);
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

    it('the list: one row per user, in the order given, each with the username, the name, the e-mail, the state, and an "Edit" and a "Delete" that say whom; never the postal address', () => {
      mounted(listed({ rows: rows('alice', 'newbie') }));
      expect(names()).toEqual(['alice', 'newbie']);
      expect(items().map((item) => ['.name', '.email', '.status'].map((part) => item.querySelector(part)!.textContent))).toEqual([
        ['Given-alice Family-alice', 'alice@example.com', 'active'],
        ['Given-newbie Family-newbie', 'newbie@example.com', 'invited'],
      ]);
      expect(items().map((item) => item.classList.contains('is-invited'))).toEqual([false, true]);
      const visible = (item: HTMLElement) => [...item.querySelectorAll('button')].filter((button) => !button.hidden);
      expect(items().map((item) => visible(item).map((button) => [button.textContent, button.getAttribute('aria-label')]))).toEqual([
        [['Edit', 'Edit alice'], ['Delete', 'Delete alice']],
        [['Edit', 'Edit newbie'], ['Resend invitation', 'Resend the invitation to newbie'], ['Delete', 'Delete newbie']],
      ]);
      expect(one('.list').textContent).not.toContain('Street of');
      expect([one('.unread').hidden, one('.empty').hidden]).toEqual([true, true]);
    });

    it('an empty list: its sentence, and no row', () => {
      mounted(state({ rows: [], empty: 'There are no users yet.' }));
      expect([one('.empty').hidden, one('.empty').textContent]).toEqual([false, 'There are no users yet.']);
      expect(items()).toHaveLength(0);
    });

    it('a creation under way: "Create user" and "Confirm" are disabled, and what is typed stays', () => {
      const { users$ } = mounted(listed());
      field().value = 'carol';
      users$.next(listed({ invite: SENDING }));
      expect([one<HTMLButtonElement>('form.create .submit').disabled, inviteButton('submit').disabled]).toEqual([true, true]);
      expect(field().value).toBe('carol');
      users$.next(listed({ invite: FAILED }));
      expect([one<HTMLButtonElement>('form.create .submit').disabled, inviteButton('submit').disabled]).toEqual([false, false]);
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
      expect(screen.create).toHaveBeenCalledWith({ ...FIELD, username: ' Carol ' });
      expect(html()).toBe(before);
      expect([field().value, one<HTMLButtonElement>('.submit').disabled, refusal().textContent]).toEqual([' Carol ', false, '']);
    });

    it('an empty field goes as an empty text: the view checks nothing', () => {
      const { screen } = mounted(listed());
      submit(form());
      expect(screen.create).toHaveBeenCalledWith(FIELD);
      expect([refusal().textContent, field().hasAttribute('aria-invalid')]).toEqual(['', false]);
    });

    it('the field is emptied only when the stream brings another object for it', () => {
      const { users$ } = mounted(listed());
      field().value = 'carol';
      users$.next(listed({ invite: SENDING }));
      users$.next(listed({ invite: FAILED }));
      users$.next(listed({ rows: rows('alice') }));
      expect(field().value).toBe('carol');
      users$.next(listed({ field: { ...FIELD }, invite: WENT }));
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

  describe('the invitation\'s dialog', () => {
    it('opens when the logic layer asks: the address in its question, which describes it; "Back" and "Confirm" offered; no answer, no failure', () => {
      const { users$, screen } = mounted(listed());
      ask('carol');
      expect(invite().open).toBe(false); // the view opens nothing by itself
      users$.next(listed({ invite: ASKING }));
      expect(invite().open).toBe(true);
      expect(one('dialog.invite .question').textContent).toBe('An invitation will be sent to carol@example.com.');
      expect(document.getElementById(invite().getAttribute('aria-describedby')!)).toBe(one('dialog.invite .question'));
      expect(document.getElementById(invite().getAttribute('aria-labelledby')!)!.textContent).toBe('Send an invitation');
      expect([one('dialog.invite .answer').textContent, one('dialog.invite .error').textContent]).toEqual(['', '']);
      expect(offered()).toEqual(['back', 'submit']);
      expect(inviteButton('submit').disabled).toBe(false);
      expect(screen.confirm).not.toHaveBeenCalled();
    });

    it('"Confirm" calls confirm(), once; "Back" calls closeInvite(); neither changes anything by itself', () => {
      const { screen } = mounted(listed({ invite: ASKING }));
      inviteButton('submit').click();
      expect(screen.confirm).toHaveBeenCalledTimes(1);
      expect(invite().open).toBe(true);
      inviteButton('back').click();
      expect(screen.closeInvite).toHaveBeenCalledTimes(1);
      expect(invite().open).toBe(true);
    });

    it('the Escape key tells the logic layer: the cancel event calls closeInvite(), and is not refused', () => {
      const { screen } = mounted(listed({ invite: ASKING }));
      const cancel = new Event('cancel', { cancelable: true });
      invite().dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(false);
      expect(screen.closeInvite).toHaveBeenCalledTimes(1);
    });

    it('closes when the logic layer says so, and opens again at the next asking', () => {
      const { users$ } = mounted(listed({ invite: ASKING }));
      users$.next(listed());
      expect(invite().open).toBe(false);
      users$.next(listed({ invite: ASKING }));
      expect(invite().open).toBe(true);
    });

    it('a failure: its sentence, announced, the dialog still open with "Back" and "Confirm"', () => {
      mounted(listed({ invite: FAILED }));
      expect(one('dialog.invite .error').textContent).toBe(FAILURE);
      expect(one('dialog.invite .error').getAttribute('role')).toBe('alert');
      expect([invite().open, offered()]).toEqual([true, ['back', 'submit']]);
    });

    it('the invitation went: where, as a status, in the question\'s place; "Close" alone, which has the keyboard and calls closeInvite()', () => {
      const { users$, screen } = mounted(listed({ invite: ASKING }));
      inviteButton('submit').focus();
      users$.next(listed({ invite: SENDING }));
      expect(one('dialog.invite .question').hidden).toBe(false);
      users$.next(listed({ invite: WENT }));
      expect(one('dialog.invite .question').hidden).toBe(true);
      expect(one('dialog.invite .answer').textContent).toBe('An invitation was sent to carol@example.com.');
      expect(one('dialog.invite .answer').getAttribute('role')).toBe('status');
      expect(offered()).toEqual(['done']);
      expect(document.activeElement).toBe(inviteButton('done'));
      users$.next(listed({ invite: WENT, rows: rows('alice', 'bob', 'carol') }));
      expect(document.activeElement).toBe(inviteButton('done'));
      inviteButton('done').click();
      expect(screen.closeInvite).toHaveBeenCalledTimes(1);
      // Asked again afterwards, it offers "Back" and "Confirm" again.
      users$.next(listed());
      users$.next(listed({ invite: ASKING }));
      expect(offered()).toEqual(['back', 'submit']);
    });

    it('a row\'s "Resend invitation" calls resend() with that row, and opens nothing by itself', () => {
      const { users$, screen } = mounted(listed({ rows: rows('alice', 'newbie') }));
      expect(resendOf('alice').hidden).toBe(true);
      resendOf('newbie').click();
      expect(screen.resend).toHaveBeenCalledTimes(1);
      expect(screen.resend).toHaveBeenCalledWith(rows('newbie')[0]);
      expect(invite().open).toBe(false);
      users$.next(listed({ rows: rows('alice', 'newbie'), invite: ASKING }));
      expect(invite().open).toBe(true);
    });

    it('a list that arrives behind the open dialog redraws the rows and leaves the dialog as it is', () => {
      const { users$ } = mounted(listed({ invite: WENT }));
      users$.next(listed({ invite: WENT, rows: rows('alice', 'bob', 'carol') }));
      expect(names()).toEqual(['alice', 'bob', 'carol']);
      expect([invite().open, one('dialog.invite .answer').textContent]).toEqual([true, WENT.answer]);
    });

    it('after the view is left with the dialog open, it is closed and its texts are gone', () => {
      const before = html();
      const { subscription } = mounted(listed({ invite: WENT }));
      subscription.unsubscribe();
      expect(invite().open).toBe(false);
      expect(anywhere('carol@example.com')).toBe(false);
      expect(offered()).toEqual(['back', 'submit']);
      expect(html()).toBe(before);
    });
  });

  describe('the four facts of the create form', () => {
    it('each field typed in goes to typed() with the whole form as text', () => {
      const { screen } = mounted(listed());
      field().value = 'carol';
      createField('email').value = 'Carol@';
      form().dispatchEvent(new Event('input', { bubbles: true }));
      expect(screen.typed).toHaveBeenLastCalledWith({ ...FIELD, username: 'carol', email: 'Carol@' });
    });

    it('"Create user" sends the four facts as typed, the address with its lines', () => {
      const { screen } = mounted(listed());
      field().value = 'carol';
      createField('givenName').value = ' Carol';
      createField('familyName').value = 'Conti';
      createField('email').value = 'carol@example.com';
      createField('address').value = 'Via Po 2\nTorino';
      submit(form());
      expect(screen.create).toHaveBeenCalledWith({ username: 'carol', givenName: ' Carol', familyName: 'Conti', email: 'carol@example.com', address: 'Via Po 2\nTorino' });
    });

    it('a fact in fault: its sentence under its field, announced, the field marked; gone when the stream says so, the text kept', () => {
      const { users$ } = mounted(listed());
      createField('email').value = 'carol@';
      users$.next(listed({ refusals: { ...NO_REFUSALS, email: PROFILE_RULES.email, address: PROFILE_RULES.address } }));
      const box = (name: string) => createField(name).closest('.field')!;
      expect([box('email').querySelector('.refusal')!.textContent, createField('email').getAttribute('aria-invalid')]).toEqual([PROFILE_RULES.email, 'true']);
      expect([box('address').querySelector('.refusal')!.textContent, createField('address').getAttribute('aria-invalid')]).toEqual([PROFILE_RULES.address, 'true']);
      expect([box('givenName').querySelector('.refusal')!.textContent, createField('givenName').hasAttribute('aria-invalid')]).toEqual(['', false]);
      users$.next(listed());
      expect([box('email').querySelector('.refusal')!.textContent, createField('email').hasAttribute('aria-invalid'), createField('email').value]).toEqual(['', false, 'carol@']);
    });

    it('the four facts are emptied with the username when the stream brings another object for the form', () => {
      const { users$ } = mounted(listed());
      for (const name of ['givenName', 'familyName', 'email', 'address']) createField(name).value = 'x';
      users$.next(listed({ invite: SENDING }));
      expect(createField('email').value).toBe('x');
      users$.next(listed({ field: { ...FIELD }, invite: WENT }));
      expect(['givenName', 'familyName', 'email', 'address'].map((name) => createField(name).value)).toEqual(['', '', '', '']);
    });
  });

  describe('the Edit dialog', () => {
    it('a row\'s "Edit" opens it with that user\'s name in its heading and four facts in its fields, and tells the logic layer', () => {
      const { screen } = mounted(listed());
      editOf('bob').click();
      expect(edit().open).toBe(true);
      expect(one('dialog.edit h3').textContent).toBe(editTitle('bob'));
      expect(editFields()).toEqual(Object.values(factsOf('bob')));
      expect(screen.editOpened).toHaveBeenCalledTimes(1);
      expect(screen.save).not.toHaveBeenCalled();
    });

    it('typing calls editTyped() with the fields; "Save" calls save() with the user and the fields, once', () => {
      const { screen } = mounted(listed());
      editOf('bob').click();
      editField('email').value = 'bobby@example.com';
      one('dialog.edit form').dispatchEvent(new Event('input', { bubbles: true }));
      expect(screen.editTyped).toHaveBeenLastCalledWith({ ...factsOf('bob'), email: 'bobby@example.com' });
      const { prevented } = submit(one<HTMLFormElement>('dialog.edit form'));
      expect(prevented).toBe(true);
      expect(screen.save).toHaveBeenCalledTimes(1);
      expect(screen.save).toHaveBeenCalledWith('bob', { ...factsOf('bob'), email: 'bobby@example.com' });
    });

    it('a save under way disables "Save"; a failure is said in the dialog; a refused fact is marked; the dialog stays open', () => {
      const { users$ } = mounted(listed());
      editOf('bob').click();
      users$.next(listed({ edit: { ...NO_EDIT, saving: true } }));
      expect(one<HTMLButtonElement>('dialog.edit .submit').disabled).toBe(true);
      users$.next(listed({ edit: { ...NO_EDIT, failure: FAILURE, refusals: { ...NO_REFUSALS, givenName: PROFILE_RULES.givenName } } }));
      expect([one<HTMLButtonElement>('dialog.edit .submit').disabled, one('dialog.edit .failure').textContent, edit().open]).toEqual([false, FAILURE, true]);
      expect([editField('givenName').closest('.field')!.querySelector('.refusal')!.textContent, editField('givenName').getAttribute('aria-invalid')]).toEqual([PROFILE_RULES.givenName, 'true']);
    });

    it('a save that succeeds closes it; a "saved" there before it opened does not', () => {
      const saved = {};
      const { users$ } = mounted(listed({ edit: { ...NO_EDIT, saved } }));
      editOf('bob').click();
      users$.next(listed({ edit: { ...NO_EDIT, saved } }));
      expect(edit().open).toBe(true);
      users$.next(listed({ edit: { ...NO_EDIT, saved: {} } }));
      expect(edit().open).toBe(false);
    });

    it('"Cancel" closes it with no call; opened again for another user, it shows that user and no failure', () => {
      const { users$, screen } = mounted(listed());
      editOf('bob').click();
      editField('givenName').value = 'typed';
      users$.next(listed({ edit: { ...NO_EDIT, failure: FAILURE } }));
      one('dialog.edit .cancel').click();
      expect(edit().open).toBe(false);
      expect(screen.save).not.toHaveBeenCalled();
      editOf('alice').click();
      expect(one('dialog.edit .failure').textContent).toBe('');
      expect(editFields()).toEqual(Object.values(factsOf('alice')));
      submit(one<HTMLFormElement>('dialog.edit form'));
      expect(screen.save).toHaveBeenCalledWith('alice', factsOf('alice'));
    });

    it('a list that arrives behind the open dialog leaves it and what is typed as they are', () => {
      const { users$ } = mounted(listed());
      editOf('bob').click();
      editField('familyName').value = 'Typed';
      users$.next(listed({ rows: rows('alice', 'bob', 'carol') }));
      expect([edit().open, editField('familyName').value]).toEqual([true, 'Typed']);
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
      const { deleteUserState$ } = mounted(listed(), { status: 'failure', reason: 'network', message: 'for a developer' });
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
      users$.next(listed({ refusal: USERNAME_HINT }));
      users$.next(listed({ invite: FAILED }));
      users$.next(listed());
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

  it('a username containing <script> is shown as text in its row, in its buttons\' names and in the delete dialog; so are the sentences', () => {
    const odd = `new${SCRIPT}`;
    mounted(state({ rows: rows(odd), invite: { question: SCRIPT, sending: false, answer: SCRIPT, failure: SCRIPT }, refusal: SCRIPT, empty: SCRIPT, unread: SCRIPT }));
    expect(names()).toEqual([odd]);
    expect(items()[0]!.querySelector('.username')!.children).toHaveLength(0);
    expect(deleteOf(odd).getAttribute('aria-label')).toBe(`Delete ${odd}`);
    expect(resendOf(odd).getAttribute('aria-label')).toBe(`Resend the invitation to ${odd}`);
    deleteOf(odd).click();
    expect(one('dialog.delete .question').textContent).toBe(deleteQuestion(odd));
    const shown = ['dialog.delete .question', 'dialog.invite .question', 'dialog.invite .answer', 'dialog.invite .error', '.empty', '.unread .error'].map((selector) => one(selector));
    for (const element of [...shown, refusal()]) {
      expect(element.textContent).toContain(SCRIPT);
      expect(element.children).toHaveLength(0);
    }
    expect(document.querySelectorAll('#users script, #users b')).toHaveLength(0);
  });

  it('a name and an e-mail containing <script> are shown as text in the row and in the Edit dialog\'s fields', () => {
    const [first] = rows('alice');
    const odd = { ...first!, name: SCRIPT, email: SCRIPT, facts: { ...first!.facts, givenName: SCRIPT, address: SCRIPT } };
    mounted(state({ rows: [odd] }));
    expect([items()[0]!.querySelector('.name')!.textContent, items()[0]!.querySelector('.email')!.textContent]).toEqual([SCRIPT, SCRIPT]);
    editOf('alice').click();
    expect([editField('givenName').value, editField('address').value]).toEqual([SCRIPT, SCRIPT]);
    expect(document.querySelectorAll('#users script, #users b')).toHaveLength(0);
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it: no row, no name, both dialogs closed and empty, the field emptied and not in fault', () => {
      const before = html();
      const { subscription, users$, deleteUserState$ } = mounted(listed({ rows: rows('alice', 'bob', 'newbie'), loading: true, invite: { ...WENT, failure: FAILURE }, refusal: USERNAME_HINT }));
      ask('carol');
      deleteOf('bob').click(); // the emulated page lets a click through a modal dialog
      removeSubmit().click();
      deleteUserState$.next({ status: 'pending', username: 'bob' });
      field().value = 'dave';
      createField('givenName').value = 'Anna';
      editOf('alice').click();
      users$.next(listed({ rows: rows('alice', 'bob', 'newbie'), invite: SENDING, refusals: { ...NO_REFUSALS, email: PROFILE_RULES.email }, edit: { ...NO_EDIT, saving: true, failure: FAILURE, refusals: { ...NO_REFUSALS, email: PROFILE_RULES.email } } }));
      expect([invite().open, remove().open, edit().open]).toEqual([true, true, true]);
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(items()).toHaveLength(0);
      expect([invite().open, remove().open, edit().open]).toEqual([false, false, false]);
      expect([field().value, field().hasAttribute('aria-invalid')]).toEqual(['', false]);
      expect(editFields()).toEqual(['', '', '', '']);
      expect([one<HTMLButtonElement>('.submit').disabled, removeSubmit().disabled, inviteButton('submit').disabled]).toEqual([false, false, false]);
      for (const gone of ['alice', 'bob', 'carol', 'dave', 'newbie', 'Given-', 'Family-', 'Street of', 'Anna', 'An invitation', 'A username has', PROFILE_RULES.email])
        expect(anywhere(gone), gone).toBe(false);
      expect(html()).toBe(before);
    });

    it('after unsubscribing with the invitation answered: the question and the buttons are as index.html has them', () => {
      const before = html();
      const { subscription } = mounted(listed({ invite: WENT }));
      expect(one('dialog.invite .question').hidden).toBe(true);
      subscription.unsubscribe();
      expect(html()).toBe(before);
    });

    it('after a read that failed and after an empty list: the sentences are gone', () => {
      const before = html();
      mounted(state({ unread: FAILURE, loading: true })).subscription.unsubscribe();
      expect(html()).toBe(before);
      mounted(state({ rows: [], empty: 'There are no users yet.' })).subscription.unsubscribe();
      expect(html()).toBe(before);
    });

    it('the streams are no longer heard: a state that arrives later opens nothing', () => {
      const { users$, deleteUserState$, subscription } = mounted(listed());
      ask('carol');
      subscription.unsubscribe();
      expect([users$.observed, deleteUserState$.observed]).toEqual([false, false]);
      users$.next(listed({ invite: WENT }));
      expect(invite().open).toBe(false);
      expect(items()).toHaveLength(0);
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(listed());
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new objects only', () => {
      const first = mounted(listed());
      ask('carol');
      first.subscription.unsubscribe();
      const second = mounted(listed({ rows: rows('zoe') }));
      expect(names()).toEqual(['zoe']);
      expect(invite().open).toBe(false);
      ask('dave');
      expect(first.screen.create).toHaveBeenCalledTimes(1);
      expect(second.screen.create).toHaveBeenCalledWith({ ...FIELD, username: 'dave' });
      deleteOf('zoe').click();
      removeSubmit().click();
      expect(first.users.deleteUser).not.toHaveBeenCalled();
      expect(second.users.deleteUser).toHaveBeenCalledWith('zoe');
    });
  });
});
