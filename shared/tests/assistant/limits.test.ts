import { ASSISTANT_LIMITS } from '../../src/index';

// The values of docs/CONVERSATIONAL_ARCHITECTURE.md section 4.4, written out: changing a limit
// is a change of the contract, and this test is where it shows.
describe('ASSISTANT_LIMITS', () => {
  it('holds the limits of the architecture and nothing else', () => {
    expect(ASSISTANT_LIMITS).toEqual({
      messageLength: 2000,
      messagesPerDay: 30,
      messagesPerConversation: 40,
      conversationBytes: 100000,
      modelRequestsPerMessage: 8,
      readsPerAnswer: 5,
      changesPerProposal: 5,
    });
  });
});
