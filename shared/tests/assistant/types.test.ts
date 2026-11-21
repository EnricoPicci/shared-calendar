import { assistantTexts, type AssistantProposalAction, type AssistantReply } from '../../src/index';

// The answer of the assistant's routes, written as docs/CONVERSATIONAL_ARCHITECTURE.md section 6
// gives it. What is checked here is checked by `npm run typecheck`: these values must compile.
describe('AssistantReply', () => {
  it('is the shape of the architecture, with a proposal waiting', () => {
    const texts = assistantTexts('en');
    const reply: AssistantReply = {
      conversationId: '01JD4Z8Q6E3W9R7T5Y1U2K3M4N',
      language: 'en',
      status: 'awaiting_confirmation',
      messages: [{ seq: 1, from: 'person', text: 'Book me Tuesday at 10', at: '2026-11-21T09:00:00.000Z' }],
      activity: null,
      proposal: {
        proposalId: '01JD4Z8Q6E3W9R7T5Y1U2K3M4P',
        question: texts.proposalQuestion(1),
        confirmLabel: texts.confirmLabel,
        declineLabel: texts.declineLabel,
        actions: [{ summary: 'Book Tuesday 24 November, 10:00–11:00 (Visit)', outcome: null, error: null }],
      },
      remainingToday: 29,
    };
    expect(reply.proposal?.actions).toHaveLength(1);
  });

  it('is empty when the person has no conversation', () => {
    const reply: AssistantReply = {
      conversationId: null,
      language: null,
      status: 'idle',
      messages: [],
      activity: null,
      proposal: null,
      remainingToday: 30,
    };
    expect(reply.messages).toEqual([]);
  });

  it('carries a line of progress while working, and the three kinds of message', () => {
    const reply: AssistantReply = {
      conversationId: '01JD4Z8Q6E3W9R7T5Y1U2K3M4N',
      language: 'it',
      status: 'working',
      messages: [
        { seq: 1, from: 'person', text: 'no, alle undici', at: '2026-11-21T09:00:00.000Z' },
        { seq: 2, from: 'notice', text: assistantTexts('it').nothingChanged, at: '2026-11-21T09:00:00.100Z' },
        { seq: 3, from: 'assistant', text: 'Va bene.', at: '2026-11-21T09:00:03.000Z' },
      ],
      activity: assistantTexts('it').working,
      proposal: null,
      remainingToday: 12,
    };
    expect(reply.messages.map((m) => m.from)).toEqual(['person', 'notice', 'assistant']);
  });
});

describe('AssistantProposalAction', () => {
  it('carries the error code of its route when refused, and null otherwise', () => {
    const actions: AssistantProposalAction[] = [
      { summary: 'Cancel Tuesday 24 November, 10:00', outcome: 'done', error: null },
      { summary: 'Book Friday 27 November, 10:00', outcome: 'refused', error: 'slot_taken' },
      { summary: 'Book Friday 27 November, 11:00', outcome: 'unknown', error: null },
    ];
    // @ts-expect-error a refused change without the error code of its route
    const withoutCode: AssistantProposalAction = { summary: 'x', outcome: 'refused', error: null };
    // @ts-expect-error a change that was made cannot carry an error code
    const withCode: AssistantProposalAction = { summary: 'x', outcome: 'done', error: 'slot_taken' };
    expect([...actions, withoutCode, withCode]).toHaveLength(5);
  });
});
