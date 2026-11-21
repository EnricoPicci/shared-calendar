import type { AssistantTexts } from './texts';

// The fixed texts in English. The three sentences of `cannotAnswer` are those of
// docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1, word for word.
export const ASSISTANT_TEXTS_EN: AssistantTexts = {
  cannotAnswer: {
    assistant_limit_reached:
      "You have reached today's limit of messages to the assistant. It will be available again tomorrow. Everything can still be done from the other pages.",
    assistant_budget_reached:
      'The assistant has reached its spending limit and cannot answer for now. Your calendar is not affected: everything can still be done from the other pages.',
    assistant_unavailable:
      'The assistant is not available at the moment. Please try again in a little while. Everything can still be done from the other pages.',
  },
  nothingChanged: 'Nothing was changed.',
  answerCutShort: 'The answer was cut short.',
  tooManySteps:
    'The assistant could not complete this request. Please try putting it differently, for example by asking for one thing at a time.',
  refused: 'The assistant cannot answer this request. This conversation has ended: your next message will start a new one.',
  conversationFull: 'This conversation is full. To continue, start a new one.',
  proposalQuestion: (changes) => (changes === 1 ? 'Make this change?' : `Make these ${changes} changes?`),
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  working: 'Working…',
};
