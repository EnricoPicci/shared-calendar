import type { Subscription } from 'rxjs';
import { failureText } from '../logic/texts';
import type { LoginService } from '../services/login.service';

// What the login view uses of the LoginService: one method and one stream.
export type LoginDeps = Pick<LoginService, 'login' | 'loginState$'>;

// The login view (docs/FRONTEND_ARCHITECTURE.md section 4): wires the element #login of
// index.html. The password is read from the form at submit and goes straight into the call's
// argument (docs/FRONTEND_SERVICES.md section 2, rule 6).
export function mountLogin(root: HTMLElement, login: LoginDeps): Subscription {
  // 1. Find the elements, once.
  const form = root.querySelector('form')!;
  const button = root.querySelector('button')!;
  const error = root.querySelector('.error')!;

  // 2. The user's action becomes a call. Without preventDefault the browser would send the form
  // itself and load the page again.
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    login.login(String(data.get('username')), String(data.get('password')));
  };

  // 3. The stream's notifications fill the elements. A failure is shown in plain words, by its
  // reason: the service's own message is written for a developer.
  const subscription = login.loginState$.subscribe((state) => {
    button.disabled = state.status === 'pending';
    error.textContent = state.status === 'failure' ? failureText(state.reason) : '';
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so what was typed and the
  // last failure are wiped (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    error.textContent = '';
  });
  return subscription;
}
