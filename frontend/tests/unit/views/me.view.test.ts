import { BehaviorSubject } from 'rxjs';
import { meDetails, meFields } from '../../../src/logic/me.model';
import type { MeState } from '../../../src/logic/me.screen';
import { NO_REFUSALS, PROFILE_RULES } from '../../../src/logic/profile.model';
import type { EditState } from '../../../src/logic/users.screen';
import { mountMe, type MeDeps } from '../../../src/views/me.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the "My details" view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html and a fake MeScreen whose stream the test controls. What the texts say is checked in
// the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const NO_EDIT: EditState = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };
const ADMIN = { username: 'admin', role: 'admin' as const, givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com', address: 'Via dei Calcoli 1\n00100 Roma' };
const ALICE = { username: 'alice', role: 'user' as const, givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Piazza 7' };
const state = (over: Partial<MeState> = {}): MeState => ({ loading: false, unread: null, details: null, fields: null, canEdit: true, edit: NO_EDIT, ...over });
const admin = (over: Partial<MeState> = {}) => state({ details: meDetails(ADMIN), fields: meFields(ADMIN), ...over });
const alice = (over: Partial<MeState> = {}) => state({ details: meDetails(ALICE), fields: meFields(ALICE), canEdit: false, ...over });

function mounted(first: MeState = state()) {
  const me$ = new BehaviorSubject<MeState>(first);
  const screen = {
    me$: me$.asObservable(),
    retry: vi.fn<MeDeps['retry']>(),
    editOpened: vi.fn<MeDeps['editOpened']>(),
    editTyped: vi.fn<MeDeps['editTyped']>(),
    save: vi.fn<MeDeps['save']>(),
  };
  const root = find('#me');
  const subscription = mountMe(root, screen);
  return { me$, screen, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#me ${selector}`);
const values = () => [...document.querySelectorAll('#me .details dd')].map((value) => value.textContent);
const edit = () => one<HTMLDialogElement>('dialog.edit');
const editField = (name: string) => one<HTMLInputElement | HTMLTextAreaElement>(`dialog.edit [name="${name}"]`);
const editFields = () => ['givenName', 'familyName', 'email', 'address'].map((name) => editField(name).value);
const html = () => document.documentElement.outerHTML;

describe('mountMe', () => {
  useRealPage();

  describe('the states of me$', () => {
    it('nothing yet: no details, no Edit, no sentence, no "Loading…"', () => {
      mounted();
      expect([one('.details').hidden, one('.ask-edit').hidden, one('.user-only').hidden, one('.unread').hidden, one('.loading').hidden]).toEqual([true, true, true, true, true]);
    });

    it('reading: "Loading…" is shown', () => {
      mounted(state({ loading: true }));
      expect(one('.loading').hidden).toBe(false);
    });

    it('a read that failed: why, announced, with "Try again", which calls retry()', () => {
      const { screen } = mounted(state({ unread: FAILURE }));
      expect([one('.unread').hidden, one('.unread .error').textContent, one('.details').hidden]).toEqual([false, FAILURE, true]);
      one('.retry').click();
      expect(screen.retry).toHaveBeenCalledTimes(1);
    });

    it('the Administrator: the six lines, the address on its lines, and "Edit"; no sentence for a User', () => {
      mounted(admin());
      expect(one('.details').hidden).toBe(false);
      expect(values()).toEqual(['admin', 'Administrator', 'Ada', 'Lovelace', 'ada@example.com', 'Via dei Calcoli 1\n00100 Roma']);
      expect([one('.ask-edit').hidden, one('.user-only').hidden]).toEqual([false, true]);
    });

    it('a User: the six lines, no "Edit", and the sentence that says whom to ask', () => {
      mounted(alice());
      expect(values()).toEqual(['alice', 'User', 'Alice', 'Liddell', 'alice@example.com', 'Piazza 7']);
      expect([one('.ask-edit').hidden, one('.user-only').hidden]).toEqual([true, false]);
    });

    it('the details go when the stream takes them away', () => {
      const { me$ } = mounted(admin());
      me$.next(state({ unread: FAILURE }));
      expect([one('.details').hidden, one('.ask-edit').hidden]).toEqual([true, true]);
      expect(values()).toEqual(['', '', '', '', '', '']);
    });
  });

  describe('the Edit dialog', () => {
    it('"Edit" opens it with the facts of the last read, and tells the logic layer', () => {
      const { screen } = mounted(admin());
      one('.ask-edit').click();
      expect(edit().open).toBe(true);
      expect(editFields()).toEqual([ADMIN.givenName, ADMIN.familyName, ADMIN.email, ADMIN.address]);
      expect(screen.editOpened).toHaveBeenCalledTimes(1);
    });

    it('"Edit" with no details read opens nothing', () => {
      const { screen } = mounted(state());
      one('.ask-edit').click();
      expect([edit().open, screen.editOpened.mock.calls.length]).toEqual([false, 0]);
    });

    it('typing calls editTyped(); "Save" calls save() with the fields; a refusal, a failure and a save under way are shown', () => {
      const { me$, screen } = mounted(admin());
      one('.ask-edit').click();
      editField('email').value = 'ada@';
      one('dialog.edit form').dispatchEvent(new Event('input', { bubbles: true }));
      expect(screen.editTyped).toHaveBeenLastCalledWith({ ...meFields(ADMIN), email: 'ada@' });
      submit(one<HTMLFormElement>('dialog.edit form'));
      expect(screen.save).toHaveBeenCalledWith({ ...meFields(ADMIN), email: 'ada@' });
      me$.next(admin({ edit: { ...NO_EDIT, refusals: { ...NO_REFUSALS, email: PROFILE_RULES.email } } }));
      expect([editField('email').closest('.field')!.querySelector('.refusal')!.textContent, editField('email').getAttribute('aria-invalid')]).toEqual([PROFILE_RULES.email, 'true']);
      me$.next(admin({ edit: { ...NO_EDIT, saving: true } }));
      expect(one<HTMLButtonElement>('dialog.edit .submit').disabled).toBe(true);
      me$.next(admin({ edit: { ...NO_EDIT, failure: FAILURE } }));
      expect([one('dialog.edit .failure').textContent, edit().open]).toEqual([FAILURE, true]);
    });

    it('a save that succeeds closes it; "Cancel" closes it with no call', () => {
      const { me$, screen } = mounted(admin());
      one('.ask-edit').click();
      me$.next(admin({ edit: { ...NO_EDIT, saved: {} } }));
      expect(edit().open).toBe(false);
      one('.ask-edit').click();
      one('dialog.edit .cancel').click();
      expect(edit().open).toBe(false);
      expect(screen.save).not.toHaveBeenCalled();
    });
  });

  it('texts with <script> are shown as text', () => {
    mounted(state({ details: { username: SCRIPT, role: SCRIPT, givenName: SCRIPT, familyName: SCRIPT, email: SCRIPT, address: SCRIPT }, unread: SCRIPT }));
    expect(values()).toEqual(Array.from({ length: 6 }, () => SCRIPT));
    expect(document.querySelectorAll('#me script, #me b')).toHaveLength(0);
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it: no fact, the dialog closed and empty', () => {
      const before = html();
      const { me$, subscription } = mounted(admin({ loading: true }));
      one('.ask-edit').click();
      me$.next(admin({ unread: FAILURE, edit: { ...NO_EDIT, saving: true, failure: FAILURE, refusals: { ...NO_REFUSALS, address: PROFILE_RULES.address } } }));
      expect(html()).not.toBe(before);
      subscription.unsubscribe();
      expect(edit().open).toBe(false);
      expect(editFields()).toEqual(['', '', '', '']);
      for (const gone of ['Ada', 'Lovelace', 'ada@example.com', 'Calcoli', FAILURE]) expect(html().includes(gone) || editFields().some((v) => v.includes(gone)), gone).toBe(false);
      expect(html()).toBe(before);
    });

    it('the stream is no longer heard; "Try again" and "Edit" call nothing', () => {
      const { me$, screen, subscription } = mounted(admin());
      subscription.unsubscribe();
      expect(me$.observed).toBe(false);
      one('.retry').click();
      one('.ask-edit').click();
      expect([screen.retry.mock.calls.length, screen.editOpened.mock.calls.length, edit().open]).toEqual([0, 0, false]);
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(admin());
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });
  });
});
