import { html, nothing, render } from 'lit-html';
import type { Subscription } from 'rxjs';
import type { LoginService } from '../../frontend/src/services/login.service';
import type { LoginState } from '../../frontend/src/services/login.types';

// The login view, lit-html: a pure function from the state to the markup.
const loginTemplate = (state: LoginState, onSubmit: (event: SubmitEvent) => void) => html`
  <h1>Shared calendar</h1>
  <form @submit=${onSubmit}>
    <label>Username <input name="username" autocomplete="username" required /></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
    <button class="primary" ?disabled=${state.status === 'pending'}>Sign in</button>
    <p class="error" role="alert">${state.status === 'failure' ? state.message : ''}</p>
  </form>
`;

// The wiring: subscribe, render at every notification, the user's action → a service call.
export function mountLogin(root: HTMLElement, login: LoginService): Subscription {
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    login.login(String(data.get('username')), String(data.get('password')));
  };
  const subscription = login.loginState$.subscribe((state) => render(loginTemplate(state, onSubmit), root));
  // Leaving the view: the markup goes, and what was typed with it.
  subscription.add(() => render(nothing, root));
  return subscription;
}
