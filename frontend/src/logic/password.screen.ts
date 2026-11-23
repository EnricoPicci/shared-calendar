import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { ChangePasswordService } from '../services/change-password.service';
import { EMPTY_HINTS, failurePlace, hintStands, passwordHints, problemTexts, type PasswordFields, type PasswordHints } from './password.model';
import { failureText } from './texts';

// The password screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the hints under the three
// fields while the person types, the change asked for only when no hint stands, and what the
// change's outcome means for the form. Shaped like a service: one public stream, `void` methods,
// nothing started by the constructor. No password is kept here: each method receives the fields
// as the form holds them and passes the two the service needs straight on
// (docs/FRONTEND_SERVICES.md section 2, rule 6).

// What the password view shows.
// - `hints` stand under the fields; `wrongCurrent` is said under the current password, `failure`
//   under the form; both last until the next change asked for.
// - `blocked` disables the button: a hint stands, or a change is under way (`pending`), which
//   must not be asked for twice (docs/FRONTEND_SERVICES.md section 8, decision 68).
// - `emptied` is another object each time the view must empty the three fields: after a wrong
//   current password and after a change (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
export type PasswordState = {
  hints: PasswordHints;
  pending: boolean;
  blocked: boolean;
  wrongCurrent: string | null;
  failure: string | null;
  emptied: object;
};

// What the screen uses of the ChangePasswordService.
export type PasswordCalls = Pick<ChangePasswordService, 'changePassword' | 'changePasswordResult$' | 'changePasswordState$'>;

function nothing(): PasswordState {
  return { hints: EMPTY_HINTS, pending: false, blocked: true, wrongCurrent: null, failure: null, emptied: {} };
}

export class PasswordScreen {
  private started = false;
  private readonly state = new BehaviorSubject<PasswordState>(nothing());
  readonly password$: Observable<PasswordState> = this.state.asObservable();

  constructor(private readonly changes: PasswordCalls) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): from
  // then on the hints follow the fields, a change can be asked for, and its outcome is heard,
  // until the subscription returned ends, which forgets everything.
  start(): Subscription {
    // The state stream gives its present value at once: a change asked for before the screen
    // was left and still under way keeps the button disabled when the screen is shown again.
    const subscription = this.changes.changePasswordState$.subscribe((state) => this.patch({ pending: state.status === 'pending' }));
    // The result stream hands its last result to a new subscriber at once: that one came before
    // this start and is not heard.
    let live = false;
    subscription.add(
      this.changes.changePasswordResult$.subscribe((result) => {
        if (!live) return;
        if (result.status === 'success') this.patch({ hints: EMPTY_HINTS, emptied: {} });
        else if (result.reason === 'new_password_refused') this.patch({ hints: { ...this.state.getValue().hints, next: problemTexts(result.problems) } });
        else if (failurePlace(result.reason) === 'current') this.patch({ hints: EMPTY_HINTS, wrongCurrent: failureText(result.reason), emptied: {} });
        else this.patch({ failure: failureText(result.reason) });
      }),
    );
    subscription.add(() => {
      this.started = false;
      this.state.next(nothing());
    });
    live = true;
    this.started = true;
    return subscription;
  }

  // At every change of a field: the hints of what the three hold.
  typed(fields: PasswordFields): void {
    if (this.started) this.patch({ hints: passwordHints(fields) });
  }

  // "Change password": asked of the service only when no hint stands and no change is under way.
  change(fields: PasswordFields): void {
    if (!this.started) return;
    const hints = passwordHints(fields);
    this.patch({ hints });
    if (hintStands(hints) || this.state.getValue().pending) return;
    this.patch({ wrongCurrent: null, failure: null });
    this.changes.changePassword(fields.current, fields.next);
  }

  private patch(change: Partial<PasswordState>): void {
    const next = { ...this.state.getValue(), ...change };
    this.state.next({ ...next, blocked: next.pending || hintStands(next.hints) });
  }
}
