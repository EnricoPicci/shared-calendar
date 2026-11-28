import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, type ApiErrorCode, type AssistantMessage, type AssistantProposal, type AssistantReply } from '@shared-calendar/shared';
import { ReplaySubject } from 'rxjs';
import { AssistantScreen, type AssistantCalls, type AssistantState } from '../../../src/logic/assistant.screen';
import { failureText } from '../../../src/logic/texts';
import type {
  AssistantConfirmFailureReason,
  AssistantContinueFailureReason,
  AssistantDeclineFailureReason,
  AssistantEndFailureReason,
  AssistantLoadFailureReason,
  AssistantOutcome,
  AssistantSendFailureReason,
} from '../../../src/services/assistant.types';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';
import { PAGE_TEXTS_IT } from '../../../src/texts/texts.it';

// A fake AssistantService: one stream that replays its last outcome, as the real one does, and
// six spies. No network, no DOM.

const START: AssistantState = { open: false, messages: [], progress: null, proposal: null, failure: null, remaining: '', canSend: false, canEnd: false, accepted: 0, news: '' };
const CONVERSATION = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const PROPOSAL_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const BUSY = failureText(PAGE_TEXTS_EN.failures, 'assistant_busy');

const message = (seq: number, from: AssistantMessage['from'], text: string): AssistantMessage => ({ seq, from, text, at: '2026-11-22T09:00:00.000Z' });
const proposal = (...outcomes: (null | 'done' | 'unknown')[]): AssistantProposal => ({
  proposalId: PROPOSAL_ID,
  question: 'Shall I make this change?',
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: outcomes.map((outcome, i) => ({ summary: `change ${i + 1}`, outcome, error: null })),
});
const reply = (over: Partial<AssistantReply> = {}): AssistantReply => ({
  conversationId: CONVERSATION,
  language: 'en',
  status: 'idle',
  messages: [],
  activity: null,
  proposal: null,
  remainingToday: 9,
  ...over,
});
const NONE = reply({ conversationId: null, language: null, remainingToday: 10 });
const working = (over: Partial<AssistantReply> = {}) => reply({ status: 'working', activity: 'Looking at the calendar…', ...over });
const waiting = (over: Partial<AssistantReply> = {}) => reply({ status: 'awaiting_confirmation', proposal: proposal(null), ...over });

function screenOf(role: 'admin' | 'user' = 'user', texts = PAGE_TEXTS_EN) {
  const outcome$ = new ReplaySubject<AssistantOutcome>(1);
  const service = {
    outcome$: outcome$.asObservable(),
    load: vi.fn<AssistantCalls['load']>(),
    end: vi.fn<AssistantCalls['end']>(),
    send: vi.fn<AssistantCalls['send']>(),
    continue: vi.fn<AssistantCalls['continue']>(),
    confirm: vi.fn<AssistantCalls['confirm']>(),
    decline: vi.fn<AssistantCalls['decline']>(),
  };
  const screen = new AssistantScreen(service, role, texts);
  const states: AssistantState[] = [];
  screen.assistant$.subscribe((s) => states.push(s)); // the view subscribes first
  let changes = 0;
  screen.changed$.subscribe(() => changes++);
  const answered = (call: 'load' | 'send' | 'continue' | 'confirm' | 'decline', body: AssistantReply) => outcome$.next({ call, status: 'success', reply: body });
  const failed = {
    load: (reason: AssistantLoadFailureReason) => outcome$.next({ call: 'load', status: 'failure', reason, message: 'for a developer' }),
    end: (reason: AssistantEndFailureReason) => outcome$.next({ call: 'end', status: 'failure', reason, message: 'for a developer' }),
    send: (reason: AssistantSendFailureReason) => outcome$.next({ call: 'send', status: 'failure', reason, message: 'for a developer' }),
    continue: (reason: AssistantContinueFailureReason) => outcome$.next({ call: 'continue', status: 'failure', reason, message: 'for a developer' }),
    confirm: (reason: AssistantConfirmFailureReason) => outcome$.next({ call: 'confirm', status: 'failure', reason, message: 'for a developer' }),
    decline: (reason: AssistantDeclineFailureReason) => outcome$.next({ call: 'decline', status: 'failure', reason, message: 'for a developer' }),
  };
  const ended = () => outcome$.next({ call: 'end', status: 'success' });
  // Started and opened, with the conversation read.
  const opened = (first: AssistantReply = NONE) => {
    const started = screen.start();
    screen.open();
    answered('load', first);
    return started;
  };
  // How many times each call was made.
  const calls = () => ({
    load: service.load.mock.calls.length,
    end: service.end.mock.calls.length,
    send: service.send.mock.calls.length,
    continue: service.continue.mock.calls.length,
    confirm: service.confirm.mock.calls.length,
    decline: service.decline.mock.calls.length,
  });
  return { screen, service, outcome$, states, answered, failed, ended, opened, calls, changes: () => changes, last: () => states.at(-1)! };
}
const NO_CALLS = { load: 0, end: 0, send: 0, continue: 0, confirm: 0, decline: 0 };
const texts = (state: AssistantState) => state.messages.map((m) => m.text);

describe('AssistantScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is asked, the stream is not listened to, and the state is empty and collapsed', () => {
      const { states, calls, outcome$ } = screenOf();
      expect(calls()).toEqual(NO_CALLS);
      expect(outcome$.observed).toBe(false);
      expect(states).toEqual([START]);
    });

    it('no method does anything', () => {
      const { screen, states, calls } = screenOf();
      screen.open();
      screen.toggle();
      screen.close();
      screen.send('hello');
      screen.confirm();
      screen.decline();
      screen.end();
      expect(calls()).toEqual(NO_CALLS);
      expect(states).toEqual([START]);
    });
  });

  describe('open and collapsed', () => {
    it('start() asks nothing: a person who never opens the panel makes no request', () => {
      const { screen, states, calls, outcome$ } = screenOf();
      screen.start();
      expect(outcome$.observed).toBe(true);
      expect(calls()).toEqual(NO_CALLS);
      expect(states).toEqual([START]);
    });

    it('the first opening reads the conversation, once: open, the progress line, nothing to send yet', () => {
      const { screen, calls, last } = screenOf();
      screen.start();
      screen.open();
      expect(calls()).toEqual({ ...NO_CALLS, load: 1 });
      expect(last()).toEqual({ ...START, open: true, progress: '…' });
      screen.open(); // already open
      expect(calls().load).toBe(1);
    });

    it('no conversation: an empty panel, the field in use, "New conversation" not, the messages left', () => {
      const { opened, last } = screenOf();
      opened();
      expect(last()).toEqual({ ...START, open: true, canSend: true, remaining: '10 messages left today' });
    });

    it('a conversation: every message in order, with who wrote it, and "New conversation" in use', () => {
      const { opened, last } = screenOf();
      opened(reply({ messages: [message(2, 'assistant', 'Hello.'), message(1, 'person', 'hi'), message(3, 'notice', 'Nothing was changed.')] }));
      expect(last()).toEqual({
        ...START,
        open: true,
        canSend: true,
        canEnd: true,
        remaining: '9 messages left today',
        messages: [
          { seq: 1, from: 'person', who: 'You', text: 'hi' },
          { seq: 2, from: 'assistant', who: 'Assistant', text: 'Hello.' },
          { seq: 3, from: 'notice', who: 'Notice', text: 'Nothing was changed.' },
        ],
      });
      // What is read at an opening is not news to say aloud.
      expect(last().news).toBe('');
    });

    it('close() collapses and keeps everything; the later openings read nothing', () => {
      const { screen, opened, calls, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'hi')] }));
      const { messages } = last();
      screen.close();
      expect(last()).toMatchObject({ open: false, canSend: true, canEnd: true });
      expect(last().messages).toBe(messages);
      screen.close(); // already collapsed
      screen.open();
      expect(last().open).toBe(true);
      expect(last().messages).toBe(messages);
      expect(calls()).toEqual({ ...NO_CALLS, load: 1 });
    });

    it('toggle() opens when collapsed and collapses when open', () => {
      const { screen, calls, last } = screenOf();
      screen.start();
      screen.toggle();
      expect(last().open).toBe(true);
      expect(calls().load).toBe(1);
      screen.toggle();
      expect(last().open).toBe(false);
      screen.toggle();
      expect(last().open).toBe(true);
      expect(calls().load).toBe(1);
    });

    it.each(['network', 'server', 'unexpected', 'forbidden', 'internal_error', 'not_signed_in', 'session_rejected'] as const)('a first read that fails (%s): the sentence, nothing to send; the next opening reads again', (reason) => {
      const { screen, failed, answered, calls, last } = screenOf();
      screen.start();
      screen.open();
      failed.load(reason);
      expect(last()).toEqual({ ...START, open: true, failure: failureText(PAGE_TEXTS_EN.failures, reason) });
      expect(JSON.stringify(last())).not.toContain('for a developer');
      screen.close();
      screen.open();
      expect(calls().load).toBe(2);
      expect(last()).toEqual({ ...START, open: true, progress: '…' });
      answered('load', NONE);
      expect(last()).toMatchObject({ failure: null, canSend: true });
    });

    it('an outcome that was already there before start() is not this session\'s', () => {
      const { screen, answered, states } = screenOf();
      answered('load', reply({ messages: [message(1, 'person', 'somebody else')] }));
      screen.start();
      expect(states).toEqual([START]);
    });
  });

  describe('send(text)', () => {
    it('the text goes as the field holds it, once; "Send" is out of use and the progress line shows', () => {
      const { screen, service, opened, calls, last } = screenOf();
      opened();
      screen.send('  hello  ');
      expect(service.send).toHaveBeenCalledWith('  hello  ', 'en');
      expect(calls()).toEqual({ ...NO_CALLS, load: 1, send: 1 });
      expect(last()).toMatchObject({ canSend: false, canEnd: false, progress: '…', accepted: 0 });
    });

    it('an empty text, or one of spaces and line breaks, sends nothing and says nothing', () => {
      const { screen, opened, calls, states } = screenOf();
      opened();
      const before = states.length;
      screen.send('');
      screen.send(' \n\t ');
      expect(calls().send).toBe(0);
      expect(states).toHaveLength(before);
    });

    it('nothing is sent while a call is away, and nothing is kept to send later', () => {
      const { screen, opened, answered, calls } = screenOf();
      opened();
      screen.send('first');
      screen.send('second');
      expect(calls().send).toBe(1);
      answered('send', reply({ messages: [message(1, 'person', 'first'), message(2, 'assistant', 'Yes?')] }));
      expect(calls().send).toBe(1);
    });

    it('nothing is sent before the conversation was read', () => {
      const { screen, calls } = screenOf();
      screen.start();
      screen.send('hello');
      screen.open();
      screen.send('hello'); // the read is still away
      expect(calls().send).toBe(0);
    });

    it('a message sent from the collapsed bar opens the panel', () => {
      const { screen, opened, last } = screenOf();
      opened();
      screen.close();
      screen.send('hello');
      expect(last()).toMatchObject({ open: true, progress: '…' });
    });

    it('an answer in words: both messages added, the field to empty, the count, the answer as news, everything in use again', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened();
      screen.send('hello');
      answered('send', reply({ messages: [message(1, 'person', 'hello'), message(2, 'assistant', 'Hello.\nHow can I help?')] }));
      expect(last()).toEqual({
        ...START,
        open: true,
        canSend: true,
        canEnd: true,
        accepted: 1,
        remaining: '9 messages left today',
        news: 'Hello.\nHow can I help?',
        messages: [
          { seq: 1, from: 'person', who: 'You', text: 'hello' },
          { seq: 2, from: 'assistant', who: 'Assistant', text: 'Hello.\nHow can I help?' },
        ],
      });
      expect(calls().continue).toBe(0);
    });

    it('a message never appears twice, whatever the replies repeat', () => {
      const { screen, opened, answered, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'a'), message(2, 'assistant', 'b')] }));
      screen.send('c');
      answered('send', working({ messages: [message(2, 'assistant', 'b'), message(3, 'person', 'c')] }));
      answered('continue', reply({ messages: [message(3, 'person', 'c'), message(4, 'assistant', 'd')] }));
      expect(texts(last())).toEqual(['a', 'b', 'c', 'd']);
    });

    it('a reply of another conversation than the one on show replaces it', () => {
      const { screen, opened, answered, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'old'), message(2, 'assistant', 'old answer')] }));
      screen.send('new');
      // The conversation on show had run out: the message started another, whose numbers start again.
      answered('send', reply({ conversationId: '01ARZ3NDEKTSV4RRFFQ69G5FAX', messages: [message(1, 'person', 'new'), message(2, 'assistant', 'new answer')] }));
      expect(texts(last())).toEqual(['new', 'new answer']);
      expect(last().news).toBe('new answer');
    });
  });

  describe('the loop on "working"', () => {
    it('a reply that says working is continued, once: the server\'s line of progress, then the answer, and no further step', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      answered('send', working({ messages: [message(1, 'person', 'what is open?')] }));
      expect(calls().continue).toBe(1);
      expect(last()).toMatchObject({ progress: 'Looking at the calendar…', news: 'Looking at the calendar…', canSend: false, canEnd: false, accepted: 1 });
      answered('continue', reply({ messages: [message(2, 'assistant', 'Tuesday is open.')] }));
      expect(calls().continue).toBe(1);
      expect(last()).toMatchObject({ progress: null, news: 'Tuesday is open.', canSend: true, canEnd: true });
      expect(texts(last())).toEqual(['what is open?', 'Tuesday is open.']);
    });

    it('a step with no line of its own shows "…"', () => {
      const { screen, opened, answered, last } = screenOf();
      opened();
      screen.send('hello');
      answered('send', working({ activity: null }));
      expect(last().progress).toBe('…');
    });

    it('it stops after the steps one message may take, and says the assistant could not finish', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened();
      screen.send('a long one');
      answered('send', working());
      for (let step = 1; step < 8; step++) {
        expect(calls().continue).toBe(step);
        answered('continue', working());
      }
      expect(calls().continue).toBe(8);
      expect(last().failure).toBeNull();
      answered('continue', working());
      expect(calls().continue).toBe(8);
      expect(last()).toMatchObject({ failure: PAGE_TEXTS_EN.assistant.couldNotFinish, progress: null, canSend: true, canEnd: true });
    });

    it('the next message starts its count again', () => {
      const { screen, opened, answered, failed, calls } = screenOf();
      opened();
      screen.send('one');
      answered('send', working());
      for (let step = 0; step < 8; step++) answered('continue', working());
      expect(calls().continue).toBe(8);
      // The server holds a step that waits: the next message is refused as busy, the
      // conversation is read again and that step asked for.
      screen.send('two');
      failed.send('assistant_busy');
      answered('load', working());
      expect(calls().continue).toBe(9);
    });

    it('a conversation found working at the first opening is continued in the same way', () => {
      const { opened, answered, calls, last } = screenOf();
      opened(working({ messages: [message(1, 'person', 'asked before the page was loaded again')] }));
      expect(calls().continue).toBe(1);
      expect(last()).toMatchObject({ progress: 'Looking at the calendar…', canSend: false });
      answered('continue', reply({ messages: [message(2, 'assistant', 'Here it is.')] }));
      expect(texts(last())).toEqual(['asked before the page was loaded again', 'Here it is.']);
      expect(last().canSend).toBe(true);
    });

    it.each([
      ['assistant_budget_reached', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_budget_reached],
      ['assistant_unavailable', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable],
      ['network', UNREACHABLE],
      ['server', failureText(PAGE_TEXTS_EN.failures, 'server')],
      ['unexpected', failureText(PAGE_TEXTS_EN.failures, 'unexpected')],
      ['forbidden', failureText(PAGE_TEXTS_EN.failures, 'forbidden')],
      ['internal_error', failureText(PAGE_TEXTS_EN.failures, 'internal_error')],
      ['not_signed_in', failureText(PAGE_TEXTS_EN.failures, 'not_signed_in')],
      ['session_rejected', failureText(PAGE_TEXTS_EN.failures, 'session_rejected')],
    ] as const)('a step that fails with %s stops the loop: the sentence, no further step and no read', (reason, sentence) => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      answered('send', working({ messages: [message(1, 'person', 'what is open?')] }));
      failed.continue(reason);
      expect(calls()).toEqual({ ...NO_CALLS, load: 1, send: 1, continue: 1 });
      expect(last()).toMatchObject({ failure: sentence, progress: null, canSend: true, canEnd: true });
      expect(texts(last())).toEqual(['what is open?']);
    });

    it.each(['nothing_to_continue', 'assistant_busy'] as const)('a step answered %s reads the conversation again, once, and shows what the server holds', (reason) => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      answered('send', working({ messages: [message(1, 'person', 'what is open?')] }));
      failed.continue(reason);
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1, continue: 1 });
      expect(last()).toMatchObject({ failure: failureText(PAGE_TEXTS_EN.failures, reason), progress: 'Looking at the calendar…', canSend: false });
      // Another tab got the answer meanwhile.
      answered('load', reply({ messages: [message(1, 'person', 'what is open?'), message(2, 'assistant', 'Tuesday is open.')] }));
      expect(texts(last())).toEqual(['what is open?', 'Tuesday is open.']);
      expect(last()).toMatchObject({ failure: failureText(PAGE_TEXTS_EN.failures, reason), progress: null, canSend: true });
      expect(calls().continue).toBe(1);
    });

    it('the conversation is read again once in an exchange: a second such answer only says its sentence', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      answered('send', working());
      failed.continue('assistant_busy');
      answered('load', working());
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1, continue: 2 });
      failed.continue('assistant_busy');
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1, continue: 2 });
      expect(last()).toMatchObject({ failure: BUSY, progress: null, canSend: true });
    });

    it('a read made after a failure that fails too says its own sentence and ends the exchange', () => {
      const { screen, opened, answered, failed, last } = screenOf();
      opened();
      screen.send('what is open?');
      answered('send', working());
      failed.continue('nothing_to_continue');
      failed.load('network');
      expect(last()).toMatchObject({ failure: UNREACHABLE, progress: null, canSend: true });
    });
  });

  describe('a message the server does not take', () => {
    it.each([
      ['invalid_request', 'A message can be 2000 characters long at most, and cannot be empty.'],
      ['invalid_json', failureText(PAGE_TEXTS_EN.failures, 'invalid_json')],
      ['forbidden', failureText(PAGE_TEXTS_EN.failures, 'forbidden')],
      ['internal_error', failureText(PAGE_TEXTS_EN.failures, 'internal_error')],
      ['network', UNREACHABLE],
      ['server', failureText(PAGE_TEXTS_EN.failures, 'server')],
      ['unexpected', failureText(PAGE_TEXTS_EN.failures, 'unexpected')],
      ['not_signed_in', failureText(PAGE_TEXTS_EN.failures, 'not_signed_in')],
      ['session_rejected', failureText(PAGE_TEXTS_EN.failures, 'session_rejected')],
    ] as const)('%s: its sentence, the field not emptied, no step and no read, and "Send" in use again', (reason, sentence) => {
      const { screen, opened, failed, calls, last } = screenOf();
      opened();
      screen.send('hello');
      failed.send(reason);
      expect(calls()).toEqual({ ...NO_CALLS, load: 1, send: 1 });
      expect(last()).toEqual({ ...START, open: true, failure: sentence, canSend: true, remaining: '10 messages left today' });
      expect(JSON.stringify(last())).not.toContain('for a developer');
    });

    it.each([
      ['assistant_budget_reached', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_budget_reached],
      ['assistant_unavailable', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable],
    ] as const)('%s on the first message, saved by the server: its sentence, then one read and no step; the count is the server\'s, "New conversation" in use, the field not emptied', (reason, sentence) => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      failed.send(reason);
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toMatchObject({ failure: sentence, remaining: '10 messages left today', canSend: false, canEnd: false });
      // The server saved the message and counted it, and the conversation waits for a step.
      answered('load', working({ activity: null, messages: [message(1, 'person', 'what is open?')] }));
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toMatchObject({ failure: sentence, progress: null, remaining: '9 messages left today', canSend: true, canEnd: true, accepted: 0 });
      expect(texts(last())).toEqual(['what is open?']);
      expect(JSON.stringify(last())).not.toContain('for a developer');
    });

    it('such an answer when the server saved nothing (the language could not be asked): the read shows no conversation, and nothing else changes', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('hello');
      failed.send('assistant_unavailable');
      answered('load', NONE);
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toEqual({ ...START, open: true, failure: ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable, canSend: true, remaining: '10 messages left today' });
    });

    it('the same text sent again after such an answer: refused as busy, read back, taken and answered', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened();
      screen.send('what is open?');
      failed.send('assistant_unavailable');
      answered('load', working({ activity: null, messages: [message(1, 'person', 'what is open?')] }));
      screen.send('what is open?');
      failed.send('assistant_busy');
      expect(calls()).toEqual({ ...NO_CALLS, load: 3, send: 2 });
      answered('load', working({ messages: [message(1, 'person', 'what is open?')] }));
      expect(calls().continue).toBe(1);
      expect(last().accepted).toBe(1);
      answered('continue', reply({ remainingToday: 9, messages: [message(2, 'assistant', 'Tuesday.')] }));
      expect(texts(last())).toEqual(['what is open?', 'Tuesday.']);
      expect(last()).toMatchObject({ canSend: true, remaining: '9 messages left today' });
    });

    it('such an answer while a proposal waited: the read shows what the server holds, and no step is asked for', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.send('no, at eleven');
      failed.send('assistant_budget_reached');
      answered('load', working({ activity: null, remainingToday: 8, messages: [message(1, 'person', 'book it'), message(2, 'person', 'no, at eleven')] }));
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toMatchObject({ proposal: null, remaining: '8 messages left today', canSend: true, canEnd: true, accepted: 0 });
    });

    it('the read after such an answer fails too: its own sentence, and the exchange is over', () => {
      const { screen, opened, failed, calls, last } = screenOf();
      opened();
      screen.send('hello');
      failed.send('assistant_unavailable');
      failed.load('network');
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toMatchObject({ failure: UNREACHABLE, progress: null, canSend: true });
    });

    it('the three sentences of shared/ are said in the conversation\'s language', () => {
      const { screen, opened, answered, failed, last } = screenOf();
      opened(reply({ language: 'it', messages: [message(1, 'person', 'ciao')] }));
      const held = reply({ language: 'it', messages: [message(1, 'person', 'ciao')] });
      screen.send('ancora');
      failed.send('assistant_unavailable');
      expect(last().failure).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_unavailable);
      answered('load', held);
      screen.send('ancora');
      failed.send('assistant_budget_reached');
      expect(last().failure).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_budget_reached);
      answered('load', held);
      screen.send('ancora');
      failed.send('assistant_limit_reached');
      expect(last().failure).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_limit_reached);
    });

    it('before a conversation, the three sentences of shared/ are said in the page\'s language, and the page\'s language goes with the message', () => {
      const { screen, service, opened, answered, failed, last } = screenOf('user', PAGE_TEXTS_IT);
      opened();
      screen.send('Guten Tag');
      expect(service.send).toHaveBeenCalledWith('Guten Tag', 'it');
      failed.send('assistant_unavailable');
      expect(last().failure).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_unavailable);
      answered('load', NONE);
      screen.send('Guten Tag');
      failed.send('assistant_limit_reached');
      expect(last().failure).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_limit_reached);
    });

    it('a conversation in English on an Italian page: its sentences in English', () => {
      const { screen, opened, failed, last } = screenOf('user', PAGE_TEXTS_IT);
      opened(reply({ language: 'en', messages: [message(1, 'person', 'hello')] }));
      screen.send('again');
      failed.send('assistant_budget_reached');
      expect(last().failure).toBe(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_budget_reached);
    });

    it('the daily limit: its sentence, and "Send" out of use from then on; reading, confirming and declining still work', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.send('one more');
      failed.send('assistant_limit_reached');
      expect(last()).toMatchObject({ failure: ASSISTANT_TEXTS_EN.cannotAnswer.assistant_limit_reached, canSend: false, canEnd: true });
      expect(last().proposal!.buttons).toBe('offered');
      screen.send('again');
      expect(calls().send).toBe(1);
      screen.decline();
      answered('decline', reply({ messages: [message(2, 'notice', 'Nothing was changed.')] }));
      expect(texts(last())).toEqual(['book it', 'Nothing was changed.']);
      expect(last().canSend).toBe(false);
    });

    it('a reply that counts no message left: the sentence of the daily limit and "Send" out of use, with no call refused', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened(reply({ remainingToday: 1, messages: [message(1, 'person', 'a')] }));
      expect(last()).toMatchObject({ remaining: '1 message left today', canSend: true, failure: null });
      screen.send('the last one');
      answered('send', reply({ remainingToday: 0, messages: [message(2, 'person', 'the last one'), message(3, 'assistant', 'Done.')] }));
      expect(last()).toMatchObject({ remaining: 'No messages left today', canSend: false, canEnd: true, failure: ASSISTANT_TEXTS_EN.cannotAnswer.assistant_limit_reached });
      expect(texts(last())).toEqual(['a', 'the last one', 'Done.']);
      screen.send('one too many');
      expect(calls().send).toBe(1);
    });

    it('a full conversation: its sentence, and "Send" out of use until "New conversation"', () => {
      const { screen, opened, failed, ended, calls, last } = screenOf();
      opened(reply({ language: 'it', messages: [message(1, 'person', 'ciao')] }));
      screen.send('ancora');
      failed.send('conversation_full');
      expect(last()).toMatchObject({ failure: ASSISTANT_TEXTS_IT.conversationFull, canSend: false, canEnd: true });
      screen.send('ancora');
      expect(calls().send).toBe(1);
      screen.end();
      ended();
      expect(last()).toMatchObject({ failure: null, canSend: true, canEnd: false, messages: [] });
    });

    it('busy: the conversation is read again and the step that waits is asked for', () => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'earlier')] }));
      screen.send('now');
      failed.send('assistant_busy');
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, send: 1 });
      expect(last()).toMatchObject({ failure: BUSY, canSend: false });
      answered('load', working({ messages: [message(1, 'person', 'earlier'), message(2, 'person', 'another tab')] }));
      expect(calls().continue).toBe(1);
      answered('continue', reply({ messages: [message(3, 'assistant', 'Answered.')] }));
      expect(texts(last())).toEqual(['earlier', 'another tab', 'Answered.']);
      // The message refused is not with the server: the field keeps it.
      expect(last()).toMatchObject({ accepted: 0, failure: BUSY, canSend: true });
    });

    it('busy, and the server already holds that very message (sent before an outage): it counts as taken', () => {
      const { screen, opened, answered, failed, last } = screenOf();
      opened();
      screen.send(' what is open? ');
      failed.send('assistant_unavailable'); // saved by the server, which could not ask Claude
      answered('load', working({ messages: [message(1, 'person', 'what is open?')] }));
      expect(last().accepted).toBe(0);
      screen.send(' what is open? ');
      failed.send('assistant_busy');
      answered('load', working({ messages: [message(1, 'person', 'what is open?')] }));
      expect(last().accepted).toBe(1);
      answered('continue', reply({ messages: [message(2, 'assistant', 'Tuesday.')] }));
      expect(last()).toMatchObject({ accepted: 1, canSend: true });
      expect(texts(last())).toEqual(['what is open?', 'Tuesday.']);
    });
  });

  describe('a proposal', () => {
    it('waiting: the block with its two buttons, the field in use, no step asked for', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened();
      screen.send('book me Tuesday at 10');
      answered('send', waiting({ messages: [message(1, 'person', 'book me Tuesday at 10')] }));
      expect(calls().continue).toBe(0);
      expect(last()).toMatchObject({ canSend: true, canEnd: true, progress: null });
      expect(last().proposal).toEqual({ question: 'Shall I make this change?', confirmLabel: 'Confirm', declineLabel: "Don't", actions: [{ summary: 'change 1', outcome: '' }], buttons: 'offered' });
    });

    it('confirm(): the call with the proposal\'s id, the buttons out of use meanwhile; settled, the outcomes and no button, then the closing words', () => {
      const { screen, service, opened, answered, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.confirm();
      expect(service.confirm).toHaveBeenCalledWith(PROPOSAL_ID);
      expect(last()).toMatchObject({ canSend: false, canEnd: false, progress: '…' });
      expect(last().proposal!.buttons).toBe('disabled');
      screen.confirm();
      screen.decline();
      expect(calls()).toEqual({ ...NO_CALLS, load: 1, confirm: 1 });

      // The changes are made; the closing words take one more step.
      answered('confirm', working({ activity: null, proposal: proposal('done') }));
      expect(calls().continue).toBe(1);
      expect(last().proposal).toMatchObject({ buttons: 'none', actions: [{ summary: 'change 1', outcome: 'Done' }] });
      answered('continue', reply({ proposal: proposal('done'), messages: [message(2, 'assistant', 'Booked.')] }));
      expect(last()).toMatchObject({ canSend: true, progress: null, news: 'Booked.' });
      expect(last().proposal).toMatchObject({ buttons: 'none', actions: [{ outcome: 'Done' }] });
      // Settled: its buttons do nothing more.
      screen.confirm();
      screen.decline();
      expect(calls()).toEqual({ ...NO_CALLS, load: 1, confirm: 1, continue: 1 });
    });

    it('decline(): the call with the proposal\'s id; the notice, and the block gone', () => {
      const { screen, service, opened, answered, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.decline();
      expect(service.decline).toHaveBeenCalledWith(PROPOSAL_ID);
      expect(last().proposal!.buttons).toBe('disabled');
      answered('decline', reply({ messages: [message(2, 'notice', 'Nothing was changed.')] }));
      expect(last()).toMatchObject({ proposal: null, news: 'Nothing was changed.', canSend: true });
      expect(texts(last())).toEqual(['book it', 'Nothing was changed.']);
    });

    it('a message while it waits is sent, and the block goes with the reply that carries no proposal', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.send('no, something else');
      expect(calls().send).toBe(1);
      answered('send', reply({ messages: [message(2, 'notice', 'Nothing was changed.'), message(3, 'person', 'no, something else'), message(4, 'assistant', 'What then?')] }));
      expect(last()).toMatchObject({ proposal: null, news: 'Nothing was changed.\nWhat then?' });
    });

    it('with no proposal, or one that no longer waits, confirm() and decline() do nothing', () => {
      const { screen, opened, calls } = screenOf();
      opened(working({ proposal: proposal(null) })); // a confirmation is under way elsewhere
      screen.confirm();
      screen.decline();
      expect(calls()).toMatchObject({ confirm: 0, decline: 0 });
    });

    it.each([
      ['assistant_budget_reached', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_budget_reached],
      ['assistant_unavailable', ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable],
    ] as const)('a confirmation answered %s: the changes were made, so the conversation is read again to show them, and Claude is not asked again', (reason, sentence) => {
      const { screen, opened, answered, failed, calls, changes, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.confirm();
      failed.confirm(reason);
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, confirm: 1 });
      answered('load', working({ activity: null, proposal: proposal('done'), messages: [message(1, 'person', 'book it')] }));
      expect(calls().continue).toBe(0);
      expect(changes()).toBe(1);
      expect(last()).toMatchObject({ failure: sentence, progress: null, canSend: true, canEnd: true });
      expect(last().proposal).toMatchObject({ buttons: 'none', actions: [{ outcome: 'Done' }] });
    });

    it('a confirmation answered busy: the changes were made and not saved, so the screens load again and the conversation is read', () => {
      const { screen, opened, answered, failed, calls, changes, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.confirm();
      failed.confirm('assistant_busy');
      expect(changes()).toBe(1);
      expect(calls()).toEqual({ ...NO_CALLS, load: 2, confirm: 1 });
      answered('load', NONE); // the conversation was ended meanwhile
      expect(last()).toMatchObject({ failure: BUSY, proposal: null, messages: [], canSend: true });
    });

    it.each(['confirm', 'decline'] as const)('%s answered proposal_not_found reads the conversation again and shows what the server holds', (call) => {
      const { screen, opened, answered, failed, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen[call]();
      failed[call]('proposal_not_found');
      expect(calls().load).toBe(2);
      answered('load', reply({ messages: [message(1, 'person', 'book it'), message(2, 'notice', 'Nothing was changed.')] }));
      expect(last()).toMatchObject({ failure: failureText(PAGE_TEXTS_EN.failures, 'proposal_not_found'), proposal: null, canSend: true });
      expect(texts(last())).toEqual(['book it', 'Nothing was changed.']);
    });

    it.each([
      ['confirm', ['invalid_request', 'forbidden', 'internal_error', 'network', 'server', 'unexpected', 'not_signed_in', 'session_rejected']],
      ['decline', ['invalid_request', 'forbidden', 'internal_error', 'network', 'server', 'unexpected', 'not_signed_in', 'session_rejected']],
    ] as const)('%s failing for another reason: its sentence, the proposal still waiting with its buttons', (call, reasons) => {
      for (const reason of reasons) {
        const { screen, opened, failed, calls, changes, last } = screenOf();
        opened(waiting());
        screen[call]();
        failed[call](reason);
        expect(last(), reason).toMatchObject({ failure: failureText(PAGE_TEXTS_EN.failures, reason), canSend: true });
        expect(last().proposal!.buttons, reason).toBe('offered');
        expect([calls().load, changes()], reason).toEqual([1, 0]);
      }
    });
  });

  describe('the screens told to load again', () => {
    it('once for a proposal with a change made, whatever the replies that still carry it', () => {
      const { screen, opened, answered, changes } = screenOf();
      opened(waiting());
      expect(changes()).toBe(0);
      screen.confirm();
      answered('confirm', working({ proposal: proposal('unknown', 'done') }));
      expect(changes()).toBe(1);
      answered('continue', reply({ proposal: proposal('unknown', 'done'), messages: [message(2, 'assistant', 'Done.')] }));
      expect(changes()).toBe(1);
    });

    it('not for a proposal that waits, was declined, or of which no change was made', () => {
      const { screen, opened, answered, changes } = screenOf();
      opened(waiting());
      screen.confirm();
      answered('confirm', reply({ proposal: { ...proposal(null), actions: [{ summary: 'change 1', outcome: 'refused', error: 'slot_taken' }] }, messages: [message(2, 'assistant', 'Taken.')] }));
      expect(changes()).toBe(0);
    });

    it('a settled proposal found at the first opening tells them once', () => {
      const { screen, opened, changes } = screenOf();
      opened(reply({ proposal: proposal('done') }));
      expect(changes()).toBe(1);
      screen.close();
      screen.open();
      expect(changes()).toBe(1);
    });
  });

  describe('end()', () => {
    it('ends the conversation at once: the call, then an empty panel, still open, the count kept', () => {
      const { screen, opened, ended, calls, last } = screenOf();
      opened(waiting({ messages: [message(1, 'person', 'book it')] }));
      screen.end();
      expect(calls().end).toBe(1);
      expect(last()).toMatchObject({ canSend: false, canEnd: false, progress: '…' });
      ended();
      expect(last()).toEqual({ ...START, open: true, canSend: true, remaining: '9 messages left today' });
    });

    it('does nothing with no conversation, nor while a call is away', () => {
      const { screen, opened, calls } = screenOf();
      opened();
      screen.end();
      expect(calls().end).toBe(0);
      screen.send('hello');
      screen.end();
      expect(calls().end).toBe(0);
    });

    it('the sentences after it are English again, whatever the language of the conversation ended', () => {
      const { screen, opened, ended, failed, last } = screenOf();
      opened(reply({ language: 'it', messages: [message(1, 'person', 'ciao')] }));
      screen.end();
      ended();
      screen.send('hello');
      failed.send('assistant_unavailable');
      expect(last().failure).toBe(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable);
    });

    it.each(['network', 'server', 'unexpected', 'forbidden', 'internal_error', 'not_signed_in', 'session_rejected'] as const)('failing with %s: its sentence, and the conversation as it was', (reason) => {
      const { screen, opened, failed, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'hi')] }));
      screen.end();
      failed.end(reason);
      expect(last()).toMatchObject({ failure: failureText(PAGE_TEXTS_EN.failures, reason), canSend: true, canEnd: true });
      expect(texts(last())).toEqual(['hi']);
    });
  });

  describe('the end of the session', () => {
    it('ending the subscription of start() forgets everything: the state is the empty one, collapsed, and nothing more is heard', () => {
      const { screen, opened, answered, failed, outcome$, states, last } = screenOf();
      const started = opened(waiting({ remainingToday: 0, messages: [message(1, 'person', 'a secret')] }));
      screen.send('x');
      failed.send('assistant_limit_reached');
      started.unsubscribe();
      expect(last()).toEqual(START);
      expect(outcome$.observed).toBe(false);
      const before = states.length;
      answered('load', reply({ messages: [message(1, 'person', 'a secret')] }));
      screen.open();
      expect(states).toHaveLength(before);
    });

    it('a second start begins from nothing: the conversation is read again at the next opening', () => {
      const { screen, opened, answered, calls, last } = screenOf();
      opened(reply({ messages: [message(1, 'person', 'hi')] })).unsubscribe();
      screen.start();
      screen.open();
      expect(calls().load).toBe(2);
      expect(last()).toEqual({ ...START, open: true, progress: '…' });
      answered('load', NONE);
      expect(last()).toEqual({ ...START, open: true, canSend: true, remaining: '10 messages left today' });
    });
  });
});

describe('AssistantScreen: the outcome of a refused change, for the role', () => {
  const refusedWith = (error: ApiErrorCode) => reply({ proposal: { ...proposal(null), actions: [{ summary: 'change 1', outcome: 'refused', error }] }, messages: [message(2, 'assistant', 'Not done.')] });

  it("the Administrator's panel says user_busy and a full time in the Administrator's words", () => {
    const { screen, opened, answered, last } = screenOf('admin');
    opened(waiting());
    screen.confirm();
    answered('confirm', refusedWith('user_busy'));
    expect(last().proposal!.actions[0]!.outcome).toBe('Not done. This User already has an appointment at this time.');
    answered('confirm', refusedWith('slot_taken'));
    expect(last().proposal!.actions[0]!.outcome).toBe('Not done. This time is full: there is no place left.');
  });

  it("a User's panel keeps the User's sentences", () => {
    const { screen, opened, answered, last } = screenOf('user');
    opened(waiting());
    screen.confirm();
    answered('confirm', refusedWith('slot_taken'));
    expect(last().proposal!.actions[0]!.outcome).toBe('Not done. This time is full: there is no place left. The calendar has been refreshed: please choose another time.');
  });
});
