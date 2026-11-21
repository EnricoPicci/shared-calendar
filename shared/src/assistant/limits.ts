// The limits of a conversation with the assistant (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 4.4). They bound what one person can cost and keep a conversation small enough to be read
// whole at every step.
export const ASSISTANT_LIMITS = {
  // The characters of one message of the person, counted after trimming.
  messageLength: 2000,
  // The messages of one person in one day of the calendar's time zone: the default of the
  // deployment parameter AssistantDailyMessageLimit.
  messagesPerDay: 30,
  // The messages of the person in one conversation.
  messagesPerConversation: 40,
  // The stored size of one conversation, in bytes (100 KB): the other bound that makes it full.
  conversationBytes: 100_000,
  // The requests to Claude that one message of the person may take before the exchange is stopped.
  modelRequestsPerMessage: 8,
  // The changes one proposal may hold.
  changesPerProposal: 5,
} as const;
