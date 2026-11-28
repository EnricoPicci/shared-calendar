import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { LoginService } from '../services/login.service';
import type { LoginState } from '../services/login.types';
import type { PageTexts } from '../texts/texts';
import { emptyNewHints, newHintStands, newPasswordHints, problemTexts, type NewPasswordFields, type NewPasswordHints } from './password.model';
import { failureText } from './texts';

// The screen "Choose your password" of a first sign-in (docs/FRONTEND_ARCHITECTURE.md section
// 5.1): shown in place of the login while the LoginService waits for a new password, with the
// hints of the password screen's two new fields as the person types, the new password sent only
// when no hint stands, and "Cancel" back to the sign-in. Shaped like a service: one public
// stream, `void` methods, nothing started by the constructor. No password is kept here: each
// method receives the fields as the form holds them and passes the new one straight on
// (docs/FRONTEND_SERVICES.md section 2, rule 6).

// What the view shows.
// - `username` is the account that signed in with a temporary password; `null` while no new
//   password is asked for, when the screen is hidden.
// - `hints` stand under the two fields; `failure` under the form, until the next attempt.
// - `blocked` disables "Choose password": a hint stands, or a new password is on its way.
// - `emptied` is another object each time the view must empty the two fields: when the screen
//   opens and when it closes (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
export type ChoosePasswordState = {
  username: string | null;
  hints: NewPasswordHints;
  pending: boolean;
  blocked: boolean;
  failure: string | null;
  emptied: object;
};

// What the screen uses of the LoginService: its state, the new password, and reset() for Cancel.
export type ChoosePasswordCalls = Pick<LoginService, 'loginState$' | 'choosePassword' | 'reset'>;

function nothing(texts: PageTexts): ChoosePasswordState {
  return { username: null, hints: emptyNewHints(texts.password), pending: false, blocked: true, failure: null, emptied: {} };
}

// The account a state asks a new password for, the attempt under way included.
function asking(state: LoginState): string | null {
  return state.status === 'new_password_required' || state.status === 'answering' ? state.username : null;
}

export class ChoosePasswordScreen {
  private started = false;
  private readonly state: BehaviorSubject<ChoosePasswordState>;
  readonly choose$: Observable<ChoosePasswordState>;

  // `textsOf` gives the page texts of the language in use. The screen lives as long as the page,
  // and the language may be chosen on the sign-in screen before it asks for a password; it is
  // never chosen while the screen is on show (docs/MULTILANGUAGE_PLAN.md finding F4), so every
  // sentence of one asking is in one language.
  constructor(
    private readonly login: ChoosePasswordCalls,
    private readonly textsOf: () => PageTexts,
  ) {
    this.state = new BehaviorSubject(nothing(textsOf()));
    this.choose$ = this.state.asObservable();
  }

  // The page texts of the language in use now.
  private get texts(): PageTexts {
    return this.textsOf();
  }

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): from
  // then on the screen follows the LoginService's state, whose present value comes at once, until
  // the subscription returned ends, which forgets everything.
  start(): Subscription {
    const subscription = this.login.loginState$.subscribe((state) => this.follow(state));
    subscription.add(() => {
      this.started = false;
      this.state.next(nothing(this.texts));
    });
    this.started = true;
    return subscription;
  }

  // At every change of a field: the hints of what the two hold.
  typed(fields: NewPasswordFields): void {
    if (this.started && this.state.getValue().username !== null) this.patch({ hints: newPasswordHints(this.texts.password, fields) });
  }

  // "Choose password": the new password is sent only when no hint stands and none is on its way.
  choose(fields: NewPasswordFields): void {
    if (!this.started || this.state.getValue().username === null) return;
    const hints = newPasswordHints(this.texts.password, fields);
    this.patch({ hints });
    if (newHintStands(hints) || this.state.getValue().pending) return;
    this.patch({ failure: null });
    this.login.choosePassword(fields.next);
  }

  // "Cancel": back to the sign-in, nothing changed at Cognito.
  cancel(): void {
    if (this.started) this.login.reset();
  }

  private follow(state: LoginState): void {
    const username = asking(state);
    const before = this.state.getValue();
    if (username === null) {
      // Closed: a sign-in, a success, a failure (the 3 minutes over among them), or Cancel. The
      // fields are emptied when the screen was open.
      if (before.username !== null) this.state.next({ ...nothing(this.texts), emptied: {} });
      return;
    }
    if (before.username !== username) {
      // Opened, for this account: empty fields and no sentence.
      this.patch({ username, hints: emptyNewHints(this.texts.password), pending: false, failure: null, emptied: {} });
    }
    if (state.status === 'answering') return this.patch({ pending: true });
    const refusal = state.status === 'new_password_required' ? state.refusal : undefined;
    if (refusal === undefined) return this.patch({ pending: false });
    // The shared rule's refusal shows as the new field's hints; any other refusal under the form.
    if (refusal.reason === 'new_password_refused') this.patch({ pending: false, hints: { ...this.state.getValue().hints, next: problemTexts(this.texts.password, refusal.problems) } });
    else this.patch({ pending: false, failure: failureText(this.texts.failures, refusal.reason) });
  }

  private patch(change: Partial<ChoosePasswordState>): void {
    const next = { ...this.state.getValue(), ...change };
    this.state.next({ ...next, blocked: next.pending || newHintStands(next.hints) });
  }
}
