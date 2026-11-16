import type { Subscription } from 'rxjs';
import type { LoginService } from '../../frontend/src/services/login.service';

// The login view, plain: the markup is the section #login of index.html.
export function mountLogin(root: HTMLElement, login: LoginService): Subscription {
  const form = root.querySelector('form')!;
  const button = root.querySelector('button')!;
  const error = root.querySelector('.error')!;

  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    login.login(String(data.get('username')), String(data.get('password')));
  };

  const subscription = login.loginState$.subscribe((state) => {
    button.disabled = state.status === 'pending';
    error.textContent = state.status === 'failure' ? state.message : '';
  });
  // Leaving the view: the section stays in the page, so what was typed is wiped by hand.
  subscription.add(() => {
    form.reset();
    error.textContent = '';
  });
  return subscription;
}
