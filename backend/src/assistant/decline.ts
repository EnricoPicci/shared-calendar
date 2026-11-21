import { assistantTexts } from '@shared-calendar/shared';
import { AssistantBusyError, saveStep, type NewMessage } from '../lib/assistantDb';
import { coreConfig } from './config';
import { currentConversation, remaining, replyOf, type CoreResult, type Identity } from './conversation';
import { proposalOf, settledWithout, takenState } from './proposal';
import { DEFINITIONS } from './tools/list';
import type { ToolDefinition } from './tools/tool';

// Declining a proposal (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5): the part of the core
// behind POST /assistant/proposals/{proposalId}/decline. It asks nothing of Claude and calls no
// route of the calendar: one read and one write of the assistant table.

/**
 * The person pressed the button to decline. The proposal must be the one waiting, and not taken
 * by a confirmation: otherwise there is no such proposal. Claude's request is answered with
 * "declined, nothing was changed" for each change, together with the results that were kept
 * back, so that the conversation is again one Claude can be given; the person reads the fixed
 * sentence that nothing was changed, and the conversation waits for them.
 */
export async function declineProposal(identity: Identity, proposalId: string, now: string, definitions: readonly ToolDefinition[] = DEFINITIONS): Promise<CoreResult> {
  const config = coreConfig();
  const current = await currentConversation(identity, now, config, definitions);
  const { conversation } = current;
  const conversationId = conversation?.conversationId ?? null;
  const waiting = conversation?.status === 'awaiting_confirmation' ? proposalOf(conversation) : null;
  if (!conversation || waiting?.proposalId !== proposalId || takenState(conversation, now) !== 'free') {
    return { ok: false, refusal: 'proposal_not_found', log: { conversationId, outcome: 'proposal_not_found' } };
  }

  const messages: NewMessage[] = [settledWithout(waiting, 'declined'), { kind: 'notice', content: assistantTexts(conversation.language).nothingChanged }];
  try {
    const saved = await saveStep(identity.sub, conversation, { messages, status: 'idle', proposal: null, timeZone: config.timeZone }, now);
    const firstSeq = saved.nextSeq - messages.length;
    const stored = messages.map((message, i) => ({ ...message, seq: firstSeq + i, at: now }));
    return {
      ok: true,
      reply: replyOf({ ...saved, proposal: null }, stored, remaining(config, current.usedToday)),
      log: { conversationId, outcome: 'declined', proposalId },
    };
  } catch (err) {
    // Another request of the same person wrote first, a confirmation among them: the proposal is
    // no longer this request's to decline.
    if (!(err instanceof AssistantBusyError)) throw err;
    return { ok: false, refusal: 'proposal_not_found', log: { conversationId, outcome: 'lost_the_race', proposalId } };
  }
}
