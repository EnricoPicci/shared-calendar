import type { Subscription } from 'rxjs';
import { MESSAGE_LENGTH, type ShownMessage, type ShownProposal } from '../logic/assistant.model';
import type { AssistantScreen } from '../logic/assistant.screen';

// What the view uses of the AssistantScreen: its stream of state and its seven actions.
export type AssistantDeps = Pick<AssistantScreen, 'assistant$' | 'open' | 'close' | 'toggle' | 'send' | 'confirm' | 'decline' | 'end'>;

// The view of the assistant's panel (docs/FRONTEND_ARCHITECTURE.md sections 3 and 6.1): wires the
// element #assistant of index.html, which belongs to no screen and stays mounted for a person's
// whole session, beside whichever screen is on show. It draws what the logic layer hands over
// and forwards the person's actions; every text of a conversation goes in through textContent.
export function mountAssistant(root: HTMLElement, screen: AssistantDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const copy = (id: string) => find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as HTMLElement;
  const toggle = find<HTMLButtonElement>('.toggle');
  const end = find<HTMLButtonElement>('.end');
  const collapse = find<HTMLButtonElement>('.collapse');
  const talk = find('.talk');
  const messages = find('.messages');
  const progress = find('.progress');
  const news = find('.news');
  const proposal = find('.proposal');
  const asks = find('.asks');
  const changes = find('.changes');
  const buttons = find('.proposal .actions');
  const confirm = find<HTMLButtonElement>('.confirm');
  const decline = find<HTMLButtonElement>('.decline');
  const failure = find('.error');
  const remaining = find('.remaining');
  const form = find<HTMLFormElement>('.compose');
  const field = find<HTMLInputElement>('[name="message"]');
  const send = find<HTMLButtonElement>('.send');

  // The field's own limit: a convenience. The check that counts is made before the request.
  field.maxLength = MESSAGE_LENGTH;

  // Pure view state: where the keyboard was before it came into the panel, to give it back when
  // the panel collapses; what the field held when it was last sent, so that only that text is
  // emptied when the server took it; and what is drawn.
  let cameFrom: HTMLElement | null = null;
  let asked: string | null = null;
  let open = false;
  let accepted = 0;
  let drawn: readonly ShownMessage[] | null = null;

  // 2. The person's actions become calls: what follows on screen comes from the stream. The
  // one pure view action is where the keyboard goes: back to the field after an action.
  const entered = (event: FocusEvent) => {
    const from = event.relatedTarget as HTMLElement | null;
    if (from === null || !root.contains(from)) cameFrom = from;
  };
  toggle.onfocus = entered;
  send.onfocus = entered;
  // The field taking the keyboard opens the panel.
  field.onfocus = (event) => {
    entered(event);
    screen.open();
  };
  toggle.onclick = () => screen.toggle();
  collapse.onclick = () => screen.close();
  // The Escape key collapses the panel. While a dialog of the page is open the keyboard cannot
  // be in the panel, so the key is the dialog's.
  root.onkeydown = (event) => {
    if (event.key === 'Escape') screen.close();
  };
  end.onclick = () => {
    screen.end();
    field.focus();
  };
  // Without preventDefault the browser would send the form itself and load the page again. The
  // Enter key in the field arrives here too. The text goes as the field holds it.
  form.onsubmit = (event) => {
    event.preventDefault();
    asked = field.value;
    screen.send(field.value);
    field.focus();
  };
  confirm.onclick = () => {
    screen.confirm();
    field.focus();
  };
  decline.onclick = () => {
    screen.decline();
    field.focus();
  };

  // One copy of the template per message, filled with textContent; its kind is a class.
  const messageFor = (message: ShownMessage) => {
    const item = copy('tpl-message');
    item.classList.add(`from-${message.from}`);
    item.querySelector('.author')!.textContent = message.who;
    item.querySelector('.text')!.textContent = message.text;
    return item;
  };
  const changeFor = (action: ShownProposal['actions'][number]) => {
    const item = copy('tpl-proposed');
    item.querySelector('.summary')!.textContent = action.summary;
    item.querySelector('.outcome')!.textContent = action.outcome;
    return item;
  };

  // 3. The stream's notifications fill the elements.
  const subscription = screen.assistant$.subscribe((state) => {
    // Where the keyboard is, read before anything is hidden: a browser takes it away from a
    // button that is hidden under it.
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    root.classList.toggle('open', state.open);
    toggle.setAttribute('aria-expanded', String(state.open));
    for (const part of [talk, end, collapse]) part.hidden = !state.open;
    // Collapsing gives the keyboard back to where it was before the panel, when it was in the
    // panel; with nowhere to give it back to, it leaves the panel.
    if (open && !state.open && active !== null && root.contains(active)) {
      if (cameFrom?.isConnected) cameFrom.focus();
      else active.blur();
    }
    // The list is rebuilt only when the stream brings another one, and scrolled to its end
    // then and when the panel opens.
    const redrawn = state.messages !== drawn;
    if (redrawn) {
      drawn = state.messages;
      messages.replaceChildren(...drawn.map(messageFor));
    }
    if (redrawn || (state.open && !open)) messages.scrollTop = messages.scrollHeight;
    open = state.open;

    progress.textContent = state.progress ?? '';
    news.textContent = state.news;
    proposal.hidden = state.proposal === null;
    asks.textContent = state.proposal?.question ?? '';
    changes.replaceChildren(...(state.proposal?.actions ?? []).map(changeFor));
    confirm.querySelector('.words')!.textContent = state.proposal?.confirmLabel ?? '';
    decline.querySelector('.words')!.textContent = state.proposal?.declineLabel ?? '';
    buttons.hidden = state.proposal?.buttons === 'none';
    confirm.disabled = state.proposal?.buttons === 'disabled';
    decline.disabled = state.proposal?.buttons === 'disabled';
    failure.textContent = state.failure ?? '';
    remaining.textContent = state.remaining;
    send.disabled = !state.canSend;
    end.disabled = !state.canEnd;
    // The server took a message: the field is emptied, unless the person has typed on since.
    if (state.accepted !== accepted) {
      accepted = state.accepted;
      if (field.value === asked) field.value = '';
    }
  });

  // 4. The end of the session: the element stays in the page, only hidden, so the conversation,
  // what was typed and everything the view set are removed before the next person signs in
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    root.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    for (const part of [talk, end, collapse, proposal]) part.hidden = true;
    buttons.hidden = false;
    messages.replaceChildren();
    changes.replaceChildren();
    for (const text of [progress, news, asks, failure, remaining, confirm.querySelector('.words')!, decline.querySelector('.words')!]) text.textContent = '';
    for (const button of [confirm, decline, send, end]) button.disabled = false;
    form.reset();
    field.removeAttribute('maxlength');
    cameFrom = null;
  });
  return subscription;
}
