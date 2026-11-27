import { LANGUAGE_OWN_NAMES, readLanguage, SUPPORTED_LANGUAGES } from '@shared-calendar/shared';
import { combineLatest, type Subscription } from 'rxjs';
import type { PageLanguage } from '../logic/language';
import { failureText } from '../logic/texts';
import type { LoginService } from '../services/login.service';
import type { PageTexts } from '../texts/texts';

// What the login view uses of the LoginService: one method and one stream.
export type LoginDeps = Pick<LoginService, 'login' | 'loginState$'>;

// What the login view uses of the page's language: the language in use, and the person's choice.
export type LoginLanguage = Pick<PageLanguage, 'state$' | 'choose'>;

// The login view (docs/FRONTEND_ARCHITECTURE.md section 4): wires the element #login of
// index.html. The password is read from the form at submit and goes straight into the call's
// argument (docs/FRONTEND_SERVICES.md section 2, rule 6). `notice` is what the shell has the login
// say when it is shown, in the words of the language in use: "Password changed" after a change of
// password and nothing otherwise (docs/FRONTEND_ARCHITECTURE.md section 6); it stays until the
// next "Sign in". The choice of language, each language under its own name, changes the page's
// language: the shell fills the page's fixed texts again, and this view words its notice and its
// failure line again, keeping what was typed (docs/MULTILANGUAGE_PLAN.md finding F4). It is not
// offered while "Choose your password" stands in place of the form.
export function mountLogin(root: HTMLElement, login: LoginDeps, language: LoginLanguage, notice: (texts: PageTexts) => string = () => ''): Subscription {
  // 1. Find the elements, once.
  const form = root.querySelector<HTMLFormElement>('form.sign-in')!;
  const button = form.querySelector('button')!;
  const error = form.querySelector('.error')!;
  const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
  const said = root.querySelector('.notice')!;
  const choice = root.querySelector<HTMLElement>('label.language')!;
  const languages = choice.querySelector('select')!;
  // Whether the notice is still said: until the next "Sign in".
  let noticed = true;
  // The languages, each under its own name and marked as being in it.
  languages.replaceChildren(
    ...SUPPORTED_LANGUAGES.map((code) => {
      const option = root.ownerDocument.createElement('option');
      option.value = code;
      option.lang = code;
      option.textContent = LANGUAGE_OWN_NAMES[code];
      return option;
    }),
  );
  languages.onchange = () => {
    const chosen = readLanguage(languages.value);
    if (chosen !== null) language.choose(chosen);
  };

  // 2. The user's action becomes a call. Without preventDefault the browser would send the form
  // itself and load the page again.
  form.onsubmit = (event) => {
    event.preventDefault();
    noticed = false;
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
  const subscription = combineLatest([login.loginState$, language.state$]).subscribe(([state, { language: code, texts }]) => {
    languages.value = code;
    said.textContent = noticed ? notice(texts) : '';
    const asking = state.status === 'new_password_required' || state.status === 'answering';
    if (asking && !choosing) password.value = '';
    const back = !asking && choosing;
    choosing = asking;
    form.hidden = asking;
    choice.hidden = asking;
    // The form is shown first: a browser gives no keyboard to a field of a hidden form.
    if (back) password.focus();
    button.disabled = state.status === 'pending';
    error.textContent = state.status === 'failure' ? failureText(texts.failures, state.reason) : '';
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so what was typed and the
  // last failure are wiped (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    form.hidden = false;
    choice.hidden = false;
    languages.onchange = null;
    languages.replaceChildren();
    error.textContent = '';
    said.textContent = '';
  });
  return subscription;
}
