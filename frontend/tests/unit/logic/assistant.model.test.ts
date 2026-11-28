import { ASSISTANT_LIMITS, ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, type ApiErrorCode, type AssistantMessage, type AssistantProposal, type AssistantReply } from '@shared-calendar/shared';
import {
  changeMade,
  confirmTrouble,
  continueTrouble,
  dayLimitText,
  declineTrouble,
  joined,
  lastOfPerson,
  loadTrouble,
  MESSAGE_LENGTH,
  messageRows,
  newsOf,
  proposalShown,
  remainingText,
  sendTrouble,
  STEPS_AT_MOST,
  type Trouble,
} from '../../../src/logic/assistant.model';
import { failureText } from '../../../src/logic/texts';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The pure functions of the assistant's panel. No network, no DOM.

const message = (seq: number, from: AssistantMessage['from'], text: string): AssistantMessage => ({ seq, from, text, at: '2026-11-22T09:00:00.000Z' });
const PROPOSAL: AssistantProposal = {
  proposalId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  question: 'Shall I make this change?',
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: [{ summary: 'Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).', outcome: null, error: null }],
};
const reply = (over: Partial<AssistantReply> = {}): AssistantReply => ({
  conversationId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  language: 'en',
  status: 'idle',
  messages: [],
  activity: null,
  proposal: null,
  remainingToday: 9,
  ...over,
});

const TRANSPORT = ['not_signed_in', 'session_rejected', 'network', 'server', 'unexpected'] as const;
const plain = (say: string): Trouble => ({ say, then: 'nothing', stop: 'no', made: false });

describe('the assistant\'s model', () => {
  useFarBrowserZone();

  it('the two limits are those of shared/', () => {
    expect([MESSAGE_LENGTH, STEPS_AT_MOST]).toEqual([ASSISTANT_LIMITS.messageLength, ASSISTANT_LIMITS.modelRequestsPerMessage]);
    expect([MESSAGE_LENGTH, STEPS_AT_MOST]).toEqual([2000, 8]);
    expect(PAGE_TEXTS_EN.assistant.couldNotFinish).toBe('The assistant could not finish. Please ask again, in other words.');
  });

  describe('messageRows', () => {
    it('each message with who wrote it in words, the text as given', () => {
      const text = 'two\nlines <b>and markup</b>';
      expect(messageRows(PAGE_TEXTS_EN, [message(1, 'person', 'hello'), message(2, 'assistant', text), message(3, 'notice', 'Nothing was changed.')])).toEqual([
        { seq: 1, from: 'person', who: 'You', text: 'hello' },
        { seq: 2, from: 'assistant', who: 'Assistant', text },
        { seq: 3, from: 'notice', who: 'Notice', text: 'Nothing was changed.' },
      ]);
      expect(messageRows(PAGE_TEXTS_EN, [])).toEqual([]);
    });
  });

  describe('joined', () => {
    it('adds the new messages, never one already held, in the order of seq', () => {
      const held = [message(1, 'person', 'a'), message(2, 'assistant', 'b')];
      const added = [message(4, 'assistant', 'd'), message(2, 'assistant', 'b again'), message(3, 'person', 'c')];
      expect(joined(held, added).map((m) => [m.seq, m.text])).toEqual([[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd']]);
      expect(joined(held, [])).toEqual(held);
      expect(joined([], added).map((m) => m.seq)).toEqual([2, 3, 4]);
    });
  });

  describe('lastOfPerson', () => {
    it('the text of the person\'s last message, or null', () => {
      expect(lastOfPerson([message(1, 'person', 'first'), message(2, 'assistant', 'x'), message(3, 'person', 'second'), message(4, 'notice', 'y')])).toBe('second');
      expect(lastOfPerson([message(1, 'assistant', 'x')])).toBeNull();
      expect(lastOfPerson([])).toBeNull();
    });
  });

  describe('newsOf', () => {
    it('the assistant\'s texts and the notices a reply added, not the person\'s own and not one already held', () => {
      const held = [message(1, 'person', 'a'), message(2, 'assistant', 'old')];
      const added = [message(2, 'assistant', 'old'), message(3, 'person', 'mine'), message(4, 'notice', 'Nothing was changed.'), message(5, 'assistant', 'new')];
      expect(newsOf(held, reply({ messages: added, activity: 'ignored' }))).toBe('Nothing was changed.\nnew');
    });

    it('with no such message, the line of progress; with neither, null', () => {
      expect(newsOf([], reply({ messages: [message(1, 'person', 'mine')], status: 'working', activity: 'Looking at the calendar…' }))).toBe('Looking at the calendar…');
      expect(newsOf([], reply({ messages: [message(1, 'person', 'mine')] }))).toBeNull();
    });
  });

  describe('proposalShown', () => {
    it('no proposal: null', () => {
      expect(proposalShown(PAGE_TEXTS_EN, null, 'idle', false, 'user')).toBeNull();
    });

    it('waiting: the server\'s words, no outcome, the buttons offered; out of use while a call is away', () => {
      expect(proposalShown(PAGE_TEXTS_EN, PROPOSAL, 'awaiting_confirmation', false, 'user')).toEqual({
        question: 'Shall I make this change?',
        confirmLabel: 'Confirm',
        declineLabel: "Don't",
        actions: [{ summary: PROPOSAL.actions[0]!.summary, outcome: '' }],
        buttons: 'offered',
      });
      expect(proposalShown(PAGE_TEXTS_EN, PROPOSAL, 'awaiting_confirmation', true, 'user')!.buttons).toBe('disabled');
    });

    it('settled: no button, and each change with what became of it', () => {
      const settled: AssistantProposal = {
        ...PROPOSAL,
        actions: [
          { summary: 'one', outcome: 'done', error: null },
          { summary: 'two', outcome: 'refused', error: 'slot_taken' },
          { summary: 'three', outcome: 'unknown', error: null },
        ],
      };
      for (const status of ['idle', 'working'] as const) {
        expect(proposalShown(PAGE_TEXTS_EN, settled, status, status === 'working', 'user')).toMatchObject({
          buttons: 'none',
          actions: [
            { summary: 'one', outcome: 'Done' },
            { summary: 'two', outcome: `Not done. ${failureText(PAGE_TEXTS_EN.failures, 'slot_taken')}` },
            { summary: 'three', outcome: 'It is not known whether this was done. Please check the calendar.' },
          ],
        });
      }
    });

    it("a refused change is said for the person's role: the Administrator reads the User booked for is busy, and a full time without the refresh the panel does not do", () => {
      const refused = (error: ApiErrorCode): AssistantProposal => ({ ...PROPOSAL, actions: [{ summary: 'one', outcome: 'refused', error }] });
      const words = (error: ApiErrorCode, role: 'admin' | 'user') => proposalShown(PAGE_TEXTS_EN, refused(error), 'idle', false, role)!.actions[0]!.outcome;
      expect(words('user_busy', 'admin')).toBe('Not done. This User already has an appointment at this time.');
      expect(words('slot_taken', 'admin')).toBe('Not done. This time is full: there is no place left.');
      expect(words('user_busy', 'user')).toBe('Not done. You already have an appointment at this time. To move it, change that appointment instead.');
      expect(words('slot_taken', 'user')).toBe('Not done. This time is full: there is no place left. The calendar has been refreshed: please choose another time.');
      // Every other code reads the same for both roles.
      expect(words('booking_in_past', 'admin')).toBe(words('booking_in_past', 'user'));
    });

    it('a proposal a confirmation took, read while it is under way: no button and no outcome yet', () => {
      expect(proposalShown(PAGE_TEXTS_EN, PROPOSAL, 'working', false, 'user')).toMatchObject({ buttons: 'none', actions: [{ outcome: '' }] });
    });
  });

  describe('changeMade', () => {
    it('true when one change of the reply\'s proposal was made', () => {
      const withOutcomes = (...outcomes: ('done' | 'unknown' | null)[]) => reply({ proposal: { ...PROPOSAL, actions: outcomes.map((outcome) => ({ summary: 's', outcome, error: null })) } });
      expect(changeMade(withOutcomes('unknown', 'done'))).toBe(true);
      expect(changeMade(withOutcomes(null))).toBe(false);
      expect(changeMade(withOutcomes('unknown'))).toBe(false);
      expect(changeMade(reply({ proposal: { ...PROPOSAL, actions: [{ summary: 's', outcome: 'refused', error: 'slot_taken' }] } }))).toBe(false);
      expect(changeMade(reply())).toBe(false);
    });
  });

  describe('remainingText and dayLimitText', () => {
    it('counts the messages left, one and several, and none', () => {
      expect([remainingText(PAGE_TEXTS_EN, 10), remainingText(PAGE_TEXTS_EN, 2), remainingText(PAGE_TEXTS_EN, 1), remainingText(PAGE_TEXTS_EN, 0)]).toEqual(['10 messages left today', '2 messages left today', '1 message left today', 'No messages left today']);
    });

    it('the day\'s limit in the conversation\'s language, in English without one', () => {
      expect(dayLimitText('it')).toBe(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_limit_reached);
      expect(dayLimitText('en')).toBe(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_limit_reached);
      expect(dayLimitText('en')).toBe(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_limit_reached);
    });
  });

  describe('a call that failed, reason by reason', () => {
    it('load and end: the page\'s sentence, nothing after it', () => {
      for (const reason of ['forbidden', 'internal_error', ...TRANSPORT] as const) expect(loadTrouble(PAGE_TEXTS_EN, reason), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason)));
      expect(loadTrouble(PAGE_TEXTS_EN, 'network').say).toBe('The server cannot be reached. Check the connection and try again.');
      expect(loadTrouble(PAGE_TEXTS_EN, 'session_rejected').say).toBe('Your session has ended. Please sign in again.');
    });

    it('send: the three sentences of shared/ in the conversation\'s language, English without one; the day\'s limit closes the field for the day; after the other two the conversation is read, and not continued', () => {
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_limit_reached', 'it')).toEqual({ ...plain(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_limit_reached), stop: 'day' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_limit_reached', 'en')).toEqual({ ...plain(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_limit_reached), stop: 'day' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_budget_reached', 'it')).toEqual({ ...plain(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_budget_reached), then: 'read' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_budget_reached', 'en')).toEqual({ ...plain(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_budget_reached), then: 'read' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_unavailable', 'en')).toEqual({ ...plain(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable), then: 'read' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_unavailable', 'it')).toEqual({ ...plain(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_unavailable), then: 'read' });
    });

    it('send: a full conversation has the sentence of shared/ and closes the field until a new one', () => {
      expect(sendTrouble(PAGE_TEXTS_EN, 'conversation_full', 'it')).toEqual({ ...plain(ASSISTANT_TEXTS_IT.conversationFull), stop: 'full' });
      expect(sendTrouble(PAGE_TEXTS_EN, 'conversation_full', 'en')).toEqual({ ...plain('This conversation is full. To continue, start a new one.'), stop: 'full' });
    });

    it('send: busy reads the conversation again and goes on; a text refused says what a message is; the rest is the page\'s sentence', () => {
      expect(sendTrouble(PAGE_TEXTS_EN, 'assistant_busy', 'it')).toEqual({ ...plain('The assistant was still at work on this conversation. The conversation has been read again: please look at it before going on.'), then: 'read-on' });
      for (const reason of ['invalid_json', 'invalid_request'] as const) expect(sendTrouble(PAGE_TEXTS_EN, reason, 'en'), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason, 'message')));
      expect(sendTrouble(PAGE_TEXTS_EN, 'invalid_request', 'en').say).toBe('A message can be 2000 characters long at most, and cannot be empty.');
      for (const reason of ['forbidden', 'internal_error', ...TRANSPORT] as const) expect(sendTrouble(PAGE_TEXTS_EN, reason, 'it'), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason)));
    });

    it('continue: the two sentences of shared/; nothing to continue and busy read again and go on', () => {
      expect(continueTrouble(PAGE_TEXTS_EN, 'assistant_budget_reached', 'it')).toEqual(plain(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_budget_reached));
      expect(continueTrouble(PAGE_TEXTS_EN, 'assistant_unavailable', 'en')).toEqual(plain(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable));
      expect(continueTrouble(PAGE_TEXTS_EN, 'nothing_to_continue', 'en')).toEqual({ ...plain('The assistant had nothing left to do. The conversation has been read again.'), then: 'read-on' });
      expect(continueTrouble(PAGE_TEXTS_EN, 'assistant_busy', 'en')).toEqual({ ...plain(failureText(PAGE_TEXTS_EN.failures, 'assistant_busy')), then: 'read-on' });
      for (const reason of ['forbidden', 'internal_error', ...TRANSPORT] as const) expect(continueTrouble(PAGE_TEXTS_EN, reason, 'en'), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason)));
    });

    it('confirm: after the two sentences of shared/ the conversation is read again and Claude is not asked; busy says the changes were made', () => {
      expect(confirmTrouble(PAGE_TEXTS_EN, 'assistant_budget_reached', 'it')).toEqual({ ...plain(ASSISTANT_TEXTS_IT.cannotAnswer.assistant_budget_reached), then: 'read' });
      expect(confirmTrouble(PAGE_TEXTS_EN, 'assistant_unavailable', 'en')).toEqual({ ...plain(ASSISTANT_TEXTS_EN.cannotAnswer.assistant_unavailable), then: 'read' });
      expect(confirmTrouble(PAGE_TEXTS_EN, 'assistant_busy', 'en')).toEqual({ ...plain(failureText(PAGE_TEXTS_EN.failures, 'assistant_busy')), then: 'read-on', made: true });
      expect(confirmTrouble(PAGE_TEXTS_EN, 'proposal_not_found', 'en')).toEqual({ ...plain('This proposal was no longer waiting for an answer. The conversation has been read again.'), then: 'read-on' });
      for (const reason of ['invalid_request', 'forbidden', 'internal_error', ...TRANSPORT] as const) expect(confirmTrouble(PAGE_TEXTS_EN, reason, 'en'), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason)));
    });

    it('decline: a proposal not found reads again; the rest is the page\'s sentence', () => {
      expect(declineTrouble(PAGE_TEXTS_EN, 'proposal_not_found')).toEqual({ ...plain(failureText(PAGE_TEXTS_EN.failures, 'proposal_not_found')), then: 'read-on' });
      for (const reason of ['invalid_request', 'forbidden', 'internal_error', ...TRANSPORT] as const) expect(declineTrouble(PAGE_TEXTS_EN, reason), reason).toEqual(plain(failureText(PAGE_TEXTS_EN.failures, reason)));
    });

    it('no sentence is the general one for want of its own', () => {
      const general = failureText(PAGE_TEXTS_EN.failures, 'a reason nobody knows');
      for (const reason of ['assistant_busy', 'proposal_not_found', 'nothing_to_continue', 'forbidden', 'internal_error', 'invalid_request', 'invalid_json', 'not_signed_in', 'session_rejected', 'network', 'server']) {
        expect(failureText(PAGE_TEXTS_EN.failures, reason), reason).not.toBe(general);
      }
    });
  });
});
