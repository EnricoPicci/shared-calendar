import type { Subscription } from 'rxjs';
import { failureText } from '../logic/texts';
import type { LoginService } from '../services/login.service';

// What the login view uses of the LoginService: one method and one stream.
export type LoginDeps = Pick<LoginService, 'login' | 'loginState$'>;

// The login view (docs/FRONTEND_ARCHITECTURE.md section 4): wires the element #login of
// index.html. The password is read from the form at submit and goes straight into the call's
// argument (docs/FRONTEND_SERVICES.md section 2, rule 6). `notice` is what the shell has the login
// say when it is shown, "Password changed" after a change of password and nothing otherwise
// (docs/FRONTEND_ARCHITECTURE.md section 6); it stays until the next "Sign in".
export function mountLogin(root: HTMLElement, login: LoginDeps, notice = ''): Subscription {
  // 1. Find the elements, once.
  const form = root.querySelector<HTMLFormElement>('form.sign-in')!;
  const button = form.querySelector('button')!;
  const error = form.querySelector('.error')!;
  const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
  const said = root.querySelector('.notice')!;
  said.textContent = notice;

  // 2. The user's action becomes a call. Without preventDefault the browser would send the form
  // itself and load the page again.
  form.onsubmit = (event) => {
    event.preventDefault();
    said.textContent = '';
    const data = new FormData(form);
    login.login(String(data.get('username')), String(data.get('password')));
  };

  // 3. The stream's notifications fill the elements. A failure is shown in plain words, by its
  // reason: the service's own message is written for a developer. While a new password is asked
  // for, "Choose your password" stands in place of the form (docs/FRONTEND_ARCHITECTURE.md section
  // 4): the temporary password is wiped from its field, and the username stays for the way back,
  // where the keyboard is put on the password.
  let choosing = false;
  const subscription = login.loginState$.subscribe((state) => {
    const asking = state.status === 'new_password_required' || state.status === 'answering';
    if (asking && !choosing) password.value = '';
    if (!asking && choosing) password.focus();
    choosing = asking;
    form.hidden = asking;
    button.disabled = state.status === 'pending';
    error.textContent = state.status === 'failure' ? failureText(state.reason) : '';
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so what was typed and the
  // last failure are wiped (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    form.hidden = false;
    error.textContent = '';
    said.textContent = '';
  });
  return subscription;
}
