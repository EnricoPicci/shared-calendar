import type { Subscription } from 'rxjs';
import type { ChoosePasswordScreen } from '../logic/choose-password.screen';
import type { NewPasswordFields } from '../logic/password.model';

// What the view uses of the ChoosePasswordScreen: its stream, the hints at each keystroke, the
// new password and Cancel.
export type ChoosePasswordDeps = Pick<ChoosePasswordScreen, 'choose$' | 'typed' | 'choose' | 'cancel'>;

// The view "Choose your password" (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the
// element .first-password inside #login of index.html, shown in place of the sign-in form while a
// new password is asked for. The two passwords stay in their fields: they are read at each
// keystroke and at "Choose password" and go straight into the call's argument, never into an
// attribute, a text of the page, a log or the address (docs/FRONTEND_SERVICES.md section 2, rule 6).
export function mountChoosePassword(root: HTMLElement, screen: ChoosePasswordDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const section = find('.first-password');
  const account = find('.first-password .account');
  const form = find<HTMLFormElement>('form.new-password');
  const next = find<HTMLInputElement>('form.new-password [name="next"]');
  const again = find<HTMLInputElement>('form.new-password [name="again"]');
  const needs = find('form.new-password .needs');
  const againHint = find('form.new-password .again-field .hint');
  const failure = find('form.new-password .failure');
  const submit = find<HTMLButtonElement>('form.new-password .submit');
  const needTemplate = find<HTMLTemplateElement>('#tpl-first-password-need');

  const fields = (): NewPasswordFields => ({ next: next.value, again: again.value });

  // 2. The user's actions become calls: what follows on screen comes from the stream. Without
  // preventDefault the browser would send the form itself and load the page again.
  form.oninput = () => screen.typed(fields());
  form.onsubmit = (event) => {
    event.preventDefault();
    screen.choose(fields());
  };
  find<HTMLButtonElement>('form.new-password .cancel').onclick = () => screen.cancel();

  // 3. The stream's notifications fill the elements. The fields are emptied when the stream
  // brings another object for it, when the screen opens and when it closes; on opening the
  // keyboard goes to the new password. The list of what the new password misses is redrawn only
  // when it changes.
  let drawn: readonly string[] | null = null;
  let emptied: object | null = null;
  const subscription = screen.choose$.subscribe((state) => {
    if (emptied !== null && state.emptied !== emptied) form.reset();
    emptied = state.emptied;
    const opening = section.hidden && state.username !== null;
    section.hidden = state.username === null;
    account.textContent = state.username ?? '';
    if (state.hints.next !== drawn) {
      drawn = state.hints.next;
      needs.replaceChildren(
        ...drawn.map((text) => {
          const item = needTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
          item.textContent = text;
          return item;
        }),
      );
    }
    againHint.textContent = state.hints.again ?? '';
    failure.textContent = state.failure ?? '';
    submit.disabled = state.blocked;
    if (opening) next.focus();
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so the two passwords, the
  // account's name and every sentence are removed (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    section.hidden = true;
    account.textContent = '';
    needs.replaceChildren();
    submit.disabled = false;
    againHint.textContent = '';
    failure.textContent = '';
  });
  return subscription;
}
