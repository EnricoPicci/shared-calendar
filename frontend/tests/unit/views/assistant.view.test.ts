import { BehaviorSubject } from 'rxjs';
import type { ShownMessage, ShownProposal } from '../../../src/logic/assistant.model';
import type { AssistantState } from '../../../src/logic/assistant.screen';
import { mountAssistant, type AssistantDeps } from '../../../src/views/assistant.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the assistant's panel (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html and a fake AssistantScreen whose stream the test controls and whose methods are
// spies. What is shown when, and every sentence, are checked in the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The assistant is not available at the moment. Please try again in a little while.';

const state = (over: Partial<AssistantState> = {}): AssistantState => ({ open: false, messages: [], progress: null, proposal: null, failure: null, remaining: '', canSend: false, canEnd: false, accepted: 0, news: '', ...over });
const opened = (over: Partial<AssistantState> = {}) => state({ open: true, canSend: true, remaining: '10 messages left today', ...over });
const TALK: ShownMessage[] = [
  { seq: 1, from: 'person', who: 'You', text: 'book me Tuesday at 10' },
  { seq: 2, from: 'assistant', who: 'Assistant', text: 'One moment.\nI will look.' },
  { seq: 3, from: 'notice', who: 'Notice', text: 'Nothing was changed.' },
];
const proposal = (over: Partial<ShownProposal> = {}): ShownProposal => ({
  question: 'Shall I make this change?',
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: [{ summary: 'Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).', outcome: '' }],
  buttons: 'offered',
  ...over,
});

function mounted(first: AssistantState = state()) {
  const assistant$ = new BehaviorSubject<AssistantState>(first);
  const screen = {
    assistant$: assistant$.asObservable(),
    open: vi.fn<AssistantDeps['open']>(),
    close: vi.fn<AssistantDeps['close']>(),
    toggle: vi.fn<AssistantDeps['toggle']>(),
    send: vi.fn<AssistantDeps['send']>(),
    confirm: vi.fn<AssistantDeps['confirm']>(),
    decline: vi.fn<AssistantDeps['decline']>(),
    end: vi.fn<AssistantDeps['end']>(),
  };
  const root = find('#assistant');
  root.hidden = false; // as the shell does before mounting
  const subscription = mountAssistant(root, screen);
  return { assistant$, screen, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#assistant ${selector}`);
const field = () => one<HTMLInputElement>('[name="message"]');
const form = () => one<HTMLFormElement>('.compose');
const rows = () => [...one('.messages').children] as HTMLElement[];
const changes = () => [...one('.changes').children] as HTMLElement[];
const html = () => document.documentElement.outerHTML;
const key = (name: string) => find('#assistant').dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
// How many calls each spy got.
const calls = (screen: ReturnType<typeof mounted>['screen']) => Object.fromEntries(Object.entries(screen).filter(([name]) => name !== 'assistant$').map(([name, spy]) => [name, (spy as ReturnType<typeof vi.fn>).mock.calls.length]));
const NO_CALLS = { open: 0, close: 0, toggle: 0, send: 0, confirm: 0, decline: 0, end: 0 };

describe('mountAssistant', () => {
  useRealPage();

  describe('collapsed and open', () => {
    it('collapsed: one bar, the heading and the field with "Send"; the conversation\'s part, "New conversation" and "Close" hidden', () => {
      const { root } = mounted();
      expect(root.classList.contains('open')).toBe(false);
      expect(one('.toggle').getAttribute('aria-expanded')).toBe('false');
      expect([one('.talk').hidden, one('.end').hidden, one('.collapse').hidden]).toEqual([true, true, true]);
      expect([field().closest('#assistant [hidden]'), one('.send').closest('#assistant [hidden]'), one('.toggle').closest('#assistant [hidden]')]).toEqual([null, null, null]);
      // Nothing that can take the keyboard is left reachable in what is hidden.
      const reachable = [...root.querySelectorAll<HTMLElement>('button, input')].filter((element) => element.closest('#assistant [hidden]') === null);
      expect(reachable.map((element) => element.className || element.getAttribute('name'))).toEqual(['toggle', 'message', 'primary send']);
    });

    it('open: the class for the style sheet, the heading says it is expanded, and every part shows', () => {
      const { root, assistant$ } = mounted();
      assistant$.next(opened());
      expect(root.classList.contains('open')).toBe(true);
      expect(one('.toggle').getAttribute('aria-expanded')).toBe('true');
      expect([one('.talk').hidden, one('.end').hidden, one('.collapse').hidden]).toEqual([false, false, false]);
      assistant$.next(state());
      expect(root.classList.contains('open')).toBe(false);
      expect([one('.talk').hidden, one('.end').hidden, one('.collapse').hidden]).toEqual([true, true, true]);
    });

    it('the field has the length of a message as its limit', () => {
      mounted();
      expect(field().maxLength).toBe(2000);
    });
  });

  describe('the person\'s actions', () => {
    it('the field taking the keyboard opens the panel; the heading toggles it; "Close" and the Escape key collapse it', () => {
      const { screen } = mounted();
      field().focus();
      expect(calls(screen)).toEqual({ ...NO_CALLS, open: 1 });
      one('.toggle').click();
      expect(calls(screen)).toEqual({ ...NO_CALLS, open: 1, toggle: 1 });
      one('.collapse').click();
      expect(calls(screen)).toEqual({ ...NO_CALLS, open: 1, toggle: 1, close: 1 });
      key('Escape');
      expect(calls(screen)).toEqual({ ...NO_CALLS, open: 1, toggle: 1, close: 2 });
      key('Enter');
      key('a');
      expect(screen.close).toHaveBeenCalledTimes(2);
    });

    it('"Send" and the Enter key send the form: the text as the field holds it, the browser\'s own sending stopped, the field kept until the server took the message', () => {
      const { screen } = mounted(opened());
      field().value = '  hello  ';
      expect(submit(form())).toEqual({ prevented: true });
      expect(screen.send).toHaveBeenCalledTimes(1);
      expect(screen.send).toHaveBeenCalledWith('  hello  ');
      expect(field().value).toBe('  hello  ');
      expect(document.activeElement).toBe(field());
    });

    it('the proposal\'s two buttons call confirm and decline, with nothing of the page\'s own, and the keyboard goes to the field', () => {
      const { screen } = mounted(opened({ proposal: proposal() }));
      one('.confirm').click();
      expect(calls(screen)).toMatchObject({ confirm: 1, decline: 0 });
      expect(screen.confirm).toHaveBeenCalledWith();
      expect(document.activeElement).toBe(field());
      one('.decline').focus();
      one('.decline').click();
      expect(calls(screen)).toMatchObject({ confirm: 1, decline: 1 });
      expect(document.activeElement).toBe(field());
    });

    it('"New conversation" calls end at once, with no question, and the keyboard goes to the field', () => {
      const { screen } = mounted(opened({ canEnd: true, messages: TALK }));
      one('.end').click();
      expect(screen.end).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(field());
      // The conversation is still on show: it goes when the stream says so.
      expect(rows()).toHaveLength(3);
    });

    it('no handler changes the panel by itself: after every action the page is as the last state made it', () => {
      const { screen } = mounted(opened({ canEnd: true, messages: TALK, proposal: proposal() }));
      const before = html();
      one('.toggle').click();
      one('.collapse').click();
      key('Escape');
      one('.confirm').click();
      one('.decline').click();
      one('.end').click();
      submit(form());
      expect(html()).toBe(before);
      expect(calls(screen)).toMatchObject({ toggle: 1, close: 2, confirm: 1, decline: 1, end: 1, send: 1 });
    });
  });

  describe('where the keyboard is when the panel collapses', () => {
    it('it goes back to where it was before it came into the panel', () => {
      const { assistant$ } = mounted();
      const signOut = find<HTMLButtonElement>('#app .sign-out');
      signOut.focus();
      field().dispatchEvent(new FocusEvent('focus', { relatedTarget: signOut }));
      field().focus();
      assistant$.next(opened());
      // Moving inside the panel does not change where it came from.
      one('.collapse').focus();
      one('.send').dispatchEvent(new FocusEvent('focus', { relatedTarget: one('.collapse') }));
      one('.send').focus();
      assistant$.next(state());
      expect(document.activeElement).toBe(signOut);
    });

    it('with nowhere to go back to, or an element that is no longer in the page, it leaves the panel', () => {
      const { assistant$ } = mounted();
      field().dispatchEvent(new FocusEvent('focus', { relatedTarget: null }));
      field().focus();
      assistant$.next(opened());
      assistant$.next(state());
      expect(find('#assistant').contains(document.activeElement)).toBe(false);

      // It came from a button that a redraw removed meanwhile.
      const gone = document.createElement('button');
      document.body.append(gone);
      one('.toggle').dispatchEvent(new FocusEvent('focus', { relatedTarget: gone }));
      one('.toggle').focus();
      assistant$.next(opened());
      gone.remove();
      assistant$.next(state());
      expect(find('#assistant').contains(document.activeElement)).toBe(false);
    });

    it('a keyboard that is elsewhere in the page is left where it is', () => {
      const { assistant$ } = mounted(opened());
      const signOut = find<HTMLButtonElement>('#app .sign-out');
      signOut.focus();
      assistant$.next(state());
      expect(document.activeElement).toBe(signOut);
    });
  });

  describe('the states of assistant$', () => {
    it('the conversation: one row per message, in order, its kind as a class and in words, the text with its line breaks', () => {
      mounted(opened({ messages: TALK }));
      expect(rows().map((row) => [row.className, row.querySelector('.author')!.textContent, row.querySelector('.text')!.textContent])).toEqual([
        ['message from-person', 'You', 'book me Tuesday at 10'],
        ['message from-assistant', 'Assistant', 'One moment.\nI will look.'],
        ['message from-notice', 'Notice', 'Nothing was changed.'],
      ]);
      // The line break is a character of the text, not markup.
      expect(rows()[1]!.querySelector('.text')!.children).toHaveLength(0);
    });

    it('the list is rebuilt only when the stream brings another one, and scrolled to its end then and at an opening', () => {
      const { assistant$ } = mounted(state({ messages: TALK }));
      const list = one('.messages');
      const tall = (height: number) => Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => height });
      const first = rows()[0];
      tall(500);
      assistant$.next(opened({ messages: TALK }));
      expect(rows()[0]).toBe(first);
      expect(list.scrollTop).toBe(500);

      list.scrollTop = 120; // the person scrolled back
      assistant$.next(opened({ messages: TALK, progress: '…' }));
      expect(rows()[0]).toBe(first);
      expect(list.scrollTop).toBe(120);

      tall(800);
      assistant$.next(opened({ messages: [...TALK, { seq: 4, from: 'assistant', who: 'Assistant', text: 'Here.' }] }));
      expect(rows()).toHaveLength(4);
      expect(rows()[0]).not.toBe(first);
      expect(list.scrollTop).toBe(800);
    });

    it('a proposal or a line that appears under a list at its end leaves the last message in sight; a person who scrolled back is left there', () => {
      const { assistant$ } = mounted(opened({ messages: TALK }));
      const list = one('.messages');
      Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 500 });
      // The proposal's block takes its room from the list.
      Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => (one('.proposal').hidden ? 200 : 120) });
      list.scrollTop = 300; // at its end
      assistant$.next(opened({ messages: TALK, proposal: proposal() }));
      expect(list.scrollTop).toBe(500);

      list.scrollTop = 100; // the person scrolled back
      assistant$.next(opened({ messages: TALK, proposal: proposal({ buttons: 'disabled' }), failure: FAILURE }));
      expect(list.scrollTop).toBe(100);
    });

    it('the progress line, the news for a screen reader, and the messages left', () => {
      const { assistant$ } = mounted(opened({ progress: 'Looking at the calendar…', news: 'Looking at the calendar…' }));
      expect([one('.progress').textContent, one('.news').textContent, one('.remaining').textContent]).toEqual(['Looking at the calendar…', 'Looking at the calendar…', '10 messages left today']);
      assistant$.next(opened({ news: 'Tuesday is open.', remaining: '9 messages left today' }));
      expect([one('.progress').textContent, one('.news').textContent, one('.remaining').textContent]).toEqual(['', 'Tuesday is open.', '9 messages left today']);
    });

    it('"Send" and "New conversation" are in use as the state says; the field stays writable whatever it says', () => {
      const { assistant$ } = mounted(opened({ canSend: false, canEnd: false, progress: '…' }));
      expect([one<HTMLButtonElement>('.send').disabled, one<HTMLButtonElement>('.end').disabled, field().disabled, field().readOnly]).toEqual([true, true, false, false]);
      field().value = 'typed while the assistant is working';
      assistant$.next(opened({ canEnd: true }));
      expect([one<HTMLButtonElement>('.send').disabled, one<HTMLButtonElement>('.end').disabled]).toEqual([false, false]);
      expect(field().value).toBe('typed while the assistant is working');
    });

    it('a proposal waiting: the question, each change, the two buttons with the server\'s labels', () => {
      mounted(opened({ proposal: proposal({ actions: [{ summary: 'first', outcome: '' }, { summary: 'second', outcome: '' }] }) }));
      expect([one('.proposal').hidden, one('.asks').textContent]).toEqual([false, 'Shall I make this change?']);
      expect(changes().map((row) => [row.querySelector('.summary')!.textContent, row.querySelector('.outcome')!.textContent])).toEqual([['first', ''], ['second', '']]);
      expect([one('.proposal .actions').hidden, one('.confirm').textContent, one('.decline').textContent]).toEqual([false, 'Confirm', "Don't"]);
      expect([one<HTMLButtonElement>('.confirm').disabled, one<HTMLButtonElement>('.decline').disabled]).toEqual([false, false]);
    });

    it('a confirmation under way: the two buttons out of use; settled: no button, each change with what became of it, in the same place', () => {
      const { assistant$ } = mounted(opened({ proposal: proposal() }));
      const block = one('.proposal');
      assistant$.next(opened({ proposal: proposal({ buttons: 'disabled' }) }));
      expect([one('.proposal .actions').hidden, one<HTMLButtonElement>('.confirm').disabled, one<HTMLButtonElement>('.decline').disabled]).toEqual([false, true, true]);
      assistant$.next(opened({ proposal: proposal({ buttons: 'none', actions: [{ summary: 'first', outcome: 'Done' }, { summary: 'second', outcome: 'Not done. This time is full: there is no place left.' }] }) }));
      expect(one('.proposal')).toBe(block);
      expect([block.hidden, one('.proposal .actions').hidden]).toEqual([false, true]);
      expect(changes().map((row) => [row.querySelector('.summary')!.textContent, row.querySelector('.outcome')!.textContent])).toEqual([['first', 'Done'], ['second', 'Not done. This time is full: there is no place left.']]);
    });

    it('no proposal any more: the block is hidden and empty, its buttons ready for the next one', () => {
      const { assistant$ } = mounted(opened({ proposal: proposal({ buttons: 'none', actions: [{ summary: 'first', outcome: 'Done' }] }) }));
      assistant$.next(opened());
      expect([one('.proposal').hidden, one('.asks').textContent, changes().length, one('.confirm').textContent, one('.decline').textContent]).toEqual([true, '', 0, '', '']);
      expect([one('.proposal .actions').hidden, one<HTMLButtonElement>('.confirm').disabled]).toEqual([false, false]);
    });

    it('a failure is one line, announced, under the conversation; it goes when the state has none', () => {
      const { assistant$ } = mounted(opened({ failure: FAILURE }));
      expect([one('.error').textContent, one('.error').getAttribute('role')]).toEqual([FAILURE, 'alert']);
      expect(one('.messages').compareDocumentPosition(one('.error')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      assistant$.next(opened());
      expect(one('.error').textContent).toBe('');
    });

    it('a message the server took empties the field; one it did not take leaves it', () => {
      const { assistant$ } = mounted(opened());
      field().value = 'hello';
      submit(form());
      assistant$.next(opened({ canSend: false, progress: '…' }));
      assistant$.next(opened({ failure: FAILURE }));
      expect(field().value).toBe('hello');
      submit(form());
      assistant$.next(opened({ accepted: 1 }));
      expect(field().value).toBe('');
    });

    it('what the person typed after sending is not emptied when the answer arrives', () => {
      const { assistant$ } = mounted(opened());
      field().value = 'hello';
      submit(form());
      field().value = 'and another thing';
      assistant$.next(opened({ accepted: 1 }));
      expect(field().value).toBe('and another thing');
    });
  });

  describe('a text is a text', () => {
    it('markup in a message, a notice, the progress line, the question, a summary, an outcome, a label, a failure and the count is shown as written, in every place', () => {
      const places = (): [string, Element][] => [
        ...rows().map((row, i): [string, Element] => [`message ${i}`, row.querySelector('.text')!]),
        ...rows().map((row, i): [string, Element] => [`author ${i}`, row.querySelector('.author')!]),
        ['progress', one('.progress')],
        ['news', one('.news')],
        ['question', one('.asks')],
        ['summary', changes()[0]!.querySelector('.summary')!],
        ['outcome', changes()[0]!.querySelector('.outcome')!],
        ['confirm', one('.confirm .words')],
        ['decline', one('.decline .words')],
        ['failure', one('.error')],
        ['remaining', one('.remaining')],
      ];
      mounted(
        opened({
          messages: (['person', 'assistant', 'notice'] as const).map((from, i) => ({ seq: i + 1, from, who: SCRIPT, text: SCRIPT })),
          progress: SCRIPT,
          news: SCRIPT,
          proposal: proposal({ question: SCRIPT, confirmLabel: SCRIPT, declineLabel: SCRIPT, actions: [{ summary: SCRIPT, outcome: SCRIPT }] }),
          failure: SCRIPT,
          remaining: SCRIPT,
        }),
      );
      expect(places()).toHaveLength(15);
      for (const [name, place] of places()) {
        expect(place.textContent, name).toBe(SCRIPT);
        expect(place.children, name).toHaveLength(0);
      }
      expect(document.querySelectorAll('script, b')).toHaveLength(0);
      expect((window as { hacked?: boolean }).hacked).toBeUndefined();
    });
  });

  describe('unmounting', () => {
    it('leaves nothing behind: the page is the one before the mount, and the field is empty', () => {
      const before = html();
      const { subscription, assistant$, root } = mounted();
      field().value = 'a text typed and never sent';
      assistant$.next(opened({ canEnd: true, messages: TALK, progress: 'Looking…', news: 'Nothing was changed.', proposal: proposal({ buttons: 'disabled' }), failure: FAILURE, accepted: 3 }));
      expect(html()).toContain('book me Tuesday at 10');

      subscription.unsubscribe();
      root.hidden = true; // as the shell does after unmounting
      expect(html()).toBe(before);
      expect(field().value).toBe('');
      expect(html()).not.toContain('book me Tuesday');
      expect(assistant$.observed).toBe(false);
    });

    it('unmounted while collapsed, with a settled proposal on show: the same', () => {
      const before = html();
      const { subscription, assistant$, root } = mounted();
      assistant$.next(state({ messages: TALK, proposal: proposal({ buttons: 'none', actions: [{ summary: 'first', outcome: 'Done' }] }) }));
      subscription.unsubscribe();
      root.hidden = true;
      expect(html()).toBe(before);
    });

    it('a second mount on the same element starts clean and answers once', () => {
      const first = mounted(opened({ messages: TALK }));
      first.subscription.unsubscribe();
      const second = mounted();
      expect(rows()).toHaveLength(0);
      one('.toggle').click();
      expect(first.screen.toggle).not.toHaveBeenCalled();
      expect(second.screen.toggle).toHaveBeenCalledTimes(1);
    });
  });
});
