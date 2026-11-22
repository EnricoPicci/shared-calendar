import type { AssistantLanguage, AssistantMessage, AssistantProposal, AssistantReply, AssistantStatus } from '@shared-calendar/shared';
import { BehaviorSubject, Subject, type Observable, type Subscription } from 'rxjs';
import type { AssistantService } from '../services/assistant.service';
import type { AssistantOutcome } from '../services/assistant.types';
import {
  changeMade,
  confirmTrouble,
  continueTrouble,
  COULD_NOT_FINISH,
  dayLimitText,
  declineTrouble,
  joined,
  lastOfPerson,
  loadTrouble,
  messageRows,
  newsOf,
  NO_ACTIVITY,
  proposalShown,
  remainingText,
  sendTrouble,
  STEPS_AT_MOST,
  type ShownMessage,
  type ShownProposal,
  type Trouble,
} from './assistant.model';

// The assistant's panel (docs/FRONTEND_ARCHITECTURE.md section 5.1): whether it is open, the
// person's conversation put together from the server's replies, the exchange carried on with
// `continue` while the server says it is working, the proposal waiting or settled, what is said
// when a call fails, what the person may do at each moment, and the notice to the screens that
// a change was made. It is not a screen: it lives beside whichever screen is on show, for the
// whole of a person's session. Shaped like a service: one public stream of state, `void`
// methods, nothing started by the constructor.

// What the panel's view shows.
// - `messages` is the conversation in order; another array only when it changed.
// - `progress` is the line shown while a call is away, null otherwise.
// - `failure` is the line of the last call that failed, or of a day with no message left.
// - `remaining` counts the messages left today, empty until the server said.
// - `accepted` grows by one each time the server took a message: the field is then emptied.
// - `news` is the last thing a screen reader should say: an answer, a notice, a line of progress.
export type AssistantState = {
  open: boolean;
  messages: readonly ShownMessage[];
  progress: string | null;
  proposal: ShownProposal | null;
  failure: string | null;
  remaining: string;
  canSend: boolean;
  canEnd: boolean;
  accepted: number;
  news: string;
};

// What the panel uses of the AssistantService: its one stream and its six calls.
export type AssistantCalls = Pick<AssistantService, 'outcome$' | 'load' | 'end' | 'send' | 'continue' | 'confirm' | 'decline'>;

const NOTHING: AssistantState = {
  open: false,
  messages: [],
  progress: null,
  proposal: null,
  failure: null,
  remaining: '',
  canSend: false,
  canEnd: false,
  accepted: 0,
  news: '',
};

export class AssistantScreen {
  private started = false;
  private opened = false;
  // Whether the conversation was asked of the server: not yet, asked and not answered, or read.
  private read: 'no' | 'asked' | 'yes' = 'no';
  // A call is away, or an exchange is going on between two of them.
  private away = false;
  // The steps asked for with `continue` in the exchange under way.
  private steps = 0;
  // Whether the conversation was read again after a failure in the exchange under way: once.
  private readAgain = false;
  // Whether a conversation that is read and waits for a step is continued.
  private goOn = true;
  // The text of the message that is away, until the server took it or refused it.
  private sent: string | null = null;
  // The proposal whose changes the screens were last told about, so that each is told once.
  private told: string | null = null;
  // Why the field is closed whatever else happens: the day's limit, or a full conversation.
  private stop: Trouble['stop'] = 'no';

  // The conversation as the server last said it.
  private conversationId: string | null = null;
  private language: AssistantLanguage | null = null;
  private status: AssistantStatus = 'idle';
  private held: readonly AssistantMessage[] = [];
  private rows: readonly ShownMessage[] = NOTHING.messages;
  private activity: string | null = null;
  private proposal: AssistantProposal | null = null;
  private left: number | null = null;

  private failure: string | null = null;
  private accepted = 0;
  private news = '';

  private readonly state = new BehaviorSubject<AssistantState>(NOTHING);
  readonly assistant$: Observable<AssistantState> = this.state.asObservable();
  // Notifies each time a confirmation made a change, or may have: the screens that show the
  // calendar's data load it again.
  private readonly changed = new Subject<void>();
  readonly changed$: Observable<void> = this.changed.asObservable();

  constructor(private readonly assistant: AssistantCalls) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5):
  // from then on the panel can be opened and used, until the subscription returned ends.
  // Nothing is asked of the server here: the conversation is read at the first opening. The end
  // of the subscription forgets everything.
  start(): Subscription {
    // The stream hands its last outcome to a new subscriber at once: that one came before this
    // start and is not heard.
    let live = false;
    const subscription = this.assistant.outcome$.subscribe((outcome) => {
      if (live) this.heard(outcome);
    });
    subscription.add(() => {
      this.started = false;
      this.opened = false;
      this.read = 'no';
      this.away = false;
      this.sent = null;
      this.told = null;
      this.stop = 'no';
      this.forget();
      this.left = null;
      this.failure = null;
      this.accepted = 0;
      this.news = '';
      this.state.next(NOTHING);
    });
    live = true;
    this.started = true;
    return subscription;
  }

  // Opens the panel. The first time, and again after a read that failed, the conversation is
  // asked of the server; a conversation found in the middle of an exchange is carried on.
  open(): void {
    if (!this.started || this.opened) return;
    this.opened = true;
    if (this.read !== 'no') {
      this.show();
      return;
    }
    this.read = 'asked';
    this.begin();
    this.show();
    this.assistant.load();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.show();
  }

  // The heading pressed: open when collapsed, collapsed when open.
  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  // "Send", with the field as it is. Nothing is sent while the field is closed, nor for a text
  // of spaces only; a message sent opens the panel. While a proposal waits the message is sent
  // all the same: the server then drops the proposal and says so.
  send(text: string): void {
    const trimmed = text.trim();
    if (!this.canSend() || trimmed === '') return;
    this.opened = true;
    this.sent = trimmed;
    this.begin();
    this.show();
    this.assistant.send(text);
  }

  // The proposal's first button: the only way a change is made.
  confirm(): void {
    const proposalId = this.offered();
    if (proposalId === null) return;
    this.begin();
    this.show();
    this.assistant.confirm(proposalId);
  }

  // The proposal's second button: nothing is changed.
  decline(): void {
    const proposalId = this.offered();
    if (proposalId === null) return;
    this.begin();
    this.show();
    this.assistant.decline(proposalId);
  }

  // "New conversation": ends the one there is, at once.
  end(): void {
    if (!this.canEnd()) return;
    this.begin();
    this.show();
    this.assistant.end();
  }

  // A call leaves on the person's request: an exchange starts from nothing.
  private begin(): void {
    this.away = true;
    this.steps = 0;
    this.readAgain = false;
    this.goOn = true;
    this.failure = null;
  }

  private canSend(): boolean {
    return this.started && this.read === 'yes' && !this.away && this.stop === 'no' && this.left !== 0;
  }

  private canEnd(): boolean {
    return !this.away && this.conversationId !== null;
  }

  // The id of the proposal whose buttons are offered at this moment, or null.
  private offered(): string | null {
    return this.proposal !== null && this.status === 'awaiting_confirmation' && !this.away ? this.proposal.proposalId : null;
  }

  // One outcome of the service's stream, told apart by its call.
  private heard(outcome: AssistantOutcome): void {
    switch (outcome.call) {
      case 'load':
        if (outcome.status === 'failure') {
          // A first read that failed is asked again at the next opening.
          if (this.read === 'asked') this.read = 'no';
          this.troubled(loadTrouble(outcome.reason));
          return;
        }
        // A message that the server refused as busy and holds already was taken after all.
        if (this.sent !== null && lastOfPerson(outcome.reply.messages) === this.sent) this.accepted += 1;
        this.sent = null;
        this.read = 'yes';
        this.take(outcome.reply, true);
        this.settle();
        return;
      case 'end':
        if (outcome.status === 'failure') {
          this.troubled(loadTrouble(outcome.reason));
          return;
        }
        this.forget();
        if (this.stop === 'full') this.stop = 'no';
        this.away = false;
        this.show();
        return;
      case 'send':
        if (outcome.status === 'failure') {
          this.troubled(sendTrouble(outcome.reason, this.language));
          return;
        }
        this.accepted += 1;
        this.sent = null;
        this.take(outcome.reply, false);
        this.settle();
        return;
      case 'continue':
        if (outcome.status === 'failure') {
          this.troubled(continueTrouble(outcome.reason, this.language));
          return;
        }
        this.take(outcome.reply, false);
        this.settle();
        return;
      case 'confirm':
        if (outcome.status === 'failure') {
          this.troubled(confirmTrouble(outcome.reason, this.language));
          return;
        }
        this.take(outcome.reply, false);
        this.settle();
        return;
      case 'decline':
        if (outcome.status === 'failure') {
          this.troubled(declineTrouble(outcome.reason));
          return;
        }
        this.take(outcome.reply, false);
        this.settle();
        return;
    }
  }

  // A reply of the server becomes the conversation on show. `whole` says that the reply holds
  // every message; so does a reply of another conversation than the one held, whose messages
  // would otherwise be mixed with it. Any other reply adds its messages.
  private take(reply: AssistantReply, whole: boolean): void {
    const replace = whole || reply.conversationId !== this.conversationId;
    if (!whole) this.news = newsOf(replace ? [] : this.held, reply) ?? this.news;
    this.held = replace ? [...reply.messages].sort((a, b) => a.seq - b.seq) : joined(this.held, reply.messages);
    this.rows = messageRows(this.held);
    this.conversationId = reply.conversationId;
    this.language = reply.language ?? this.language;
    this.status = reply.status;
    this.activity = reply.activity;
    this.proposal = reply.proposal;
    this.left = reply.remainingToday;
    // A settled proposal stays in every reply until the next message: its changes are told once.
    if (reply.proposal !== null && changeMade(reply) && reply.proposal.proposalId !== this.told) {
      this.told = reply.proposal.proposalId;
      this.changed.next();
    }
  }

  // After a reply: the next step is asked for while the server says it is working, up to the
  // steps one message may take; otherwise the exchange is over.
  private settle(): void {
    if (this.status !== 'working' || !this.goOn) {
      this.away = false;
      this.show();
      return;
    }
    if (this.steps === STEPS_AT_MOST) {
      this.failure = COULD_NOT_FINISH;
      this.away = false;
      this.show();
      return;
    }
    this.steps += 1;
    this.show();
    this.assistant.continue();
  }

  // A call failed: its sentence, and what follows it. The exchange is over unless the
  // conversation is read again, which happens once in an exchange.
  private troubled(trouble: Trouble): void {
    this.failure = trouble.say;
    if (trouble.stop !== 'no') this.stop = trouble.stop;
    if (trouble.made) this.changed.next();
    if (trouble.then !== 'nothing' && !this.readAgain) {
      this.readAgain = true;
      this.goOn = trouble.then === 'read-on';
      this.show();
      this.assistant.load();
      return;
    }
    this.sent = null;
    this.away = false;
    this.show();
  }

  // No conversation: what "New conversation" leaves, and the end of a session.
  private forget(): void {
    this.conversationId = null;
    this.language = null;
    this.status = 'idle';
    this.held = [];
    this.rows = NOTHING.messages;
    this.activity = null;
    this.proposal = null;
  }

  private show(): void {
    this.state.next({
      open: this.opened,
      messages: this.rows,
      progress: this.away ? (this.activity ?? NO_ACTIVITY) : null,
      proposal: proposalShown(this.proposal, this.status, this.away),
      failure: this.failure ?? (this.left === 0 ? dayLimitText(this.language) : null),
      remaining: this.left === null ? '' : remainingText(this.left),
      canSend: this.canSend(),
      canEnd: this.canEnd(),
      accepted: this.accepted,
      news: this.news,
    });
  }
}
