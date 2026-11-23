import type { Subscription } from 'rxjs';
import type { PasswordFields } from '../logic/password.model';
import type { PasswordScreen } from '../logic/password.screen';

// What the password view uses of the PasswordScreen: its stream, the hints at each keystroke and
// the change.
export type PasswordDeps = Pick<PasswordScreen, 'password$' | 'typed' | 'change'>;

// The password view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #password
// of index.html. The three passwords stay in their fields: they are read at each keystroke and at
// "Change password" and go straight into the call's argument, never into an attribute, a text of
// the page, a log or the address (docs/FRONTEND_SERVICES.md section 2, rule 6).
export function mountPassword(root: HTMLElement, screen: PasswordDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>('form.change-password');
  const current = find<HTMLInputElement>('[name="current"]');
  const next = find<HTMLInputElement>('[name="next"]');
  const again = find<HTMLInputElement>('[name="again"]');
  const currentHint = find('.current-field .hint');
  const wrongCurrent = find('.current-field .refusal');
  const needs = find('.new-field .needs');
  const againHint = find('.again-field .hint');
  const failure = find('form.change-password .failure');
  const submit = find<HTMLButtonElement>('form.change-password .submit');
  const needTemplate = find<HTMLTemplateElement>('#tpl-password-need');

  const fields = (): PasswordFields => ({ current: current.value, next: next.value, again: again.value });

  // 2. The user's actions become calls: what follows on screen comes from the stream. Without
  // preventDefault the browser would send the form itself and load the page again.
  form.oninput = () => screen.typed(fields());
  form.onsubmit = (event) => {
    event.preventDefault();
    screen.change(fields());
  };

  // 3. The stream's notifications fill the elements. The list of what the new password misses is
  // redrawn only when it changes, as a list of copies of its template.
  let drawn: readonly string[] | null = null;
  let emptied: object | null = null;
  const subscription = screen.password$.subscribe((state) => {
    // The fields are emptied when the stream brings another object for it: after a wrong current
    // password and after a change. The first object is the starting one, and a field typed in
    // before the mount is left alone.
    if (emptied !== null && state.emptied !== emptied) form.reset();
    emptied = state.emptied;
    currentHint.textContent = state.hints.current ?? '';
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
    wrongCurrent.textContent = state.wrongCurrent ?? '';
    if (state.wrongCurrent === null) current.removeAttribute('aria-invalid');
    else current.setAttribute('aria-invalid', 'true');
    failure.textContent = state.failure ?? '';
    submit.disabled = state.blocked;
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so the three passwords and
  // every sentence are removed before the next screen, or the next person
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    needs.replaceChildren();
    current.removeAttribute('aria-invalid');
    submit.disabled = false;
    for (const text of [currentHint, wrongCurrent, againHint, failure]) text.textContent = '';
  });
  return subscription;
}
