import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { UsersService } from '../services/users.service';
import type { CreateUserFailureReason } from '../services/users.types';
import { failureText } from './texts';
import { NO_USERS, userRows, usernameFor, type UserRow } from './users.model';

// The users screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the list of users read when
// the screen is shown, a user created from what the username field holds, checked before any
// call, and the list read again after every create and delete and every time the page becomes
// visible. Shaped like a service: one public stream, `void` methods, nothing started by the
// constructor.

// What the username field is filled with: another object only when the field is to be filled
// again, which is after a create that succeeded, with nothing.
export type UsernameField = { username: string };

// What the users view shows.
// - `rows` is the last list read, null until there is one and after a read that failed;
//   another object only when the list read differs from the one on show. `empty` is the
//   sentence of a list with no row. `unread` is why the list could not be read, in plain
//   words, in its place.
// - `refusal` is why the text of the field was not sent; `failure` is why a create that was
//   sent did not succeed; `created` is the username of the last create that succeeded. The
//   three last until the next "Create user".
// The generated password is not here and never passes through this object: the view takes it
// from the service's own result (docs/FRONTEND_SERVICES.md section 13.7).
export type UsersState = {
  loading: boolean;
  unread: string | null;
  rows: readonly UserRow[] | null;
  empty: string | null;
  field: UsernameField;
  creating: boolean;
  refusal: string | null;
  failure: string | null;
  created: string | null;
};

// What the screen reads of a create's result: that it succeeded and for which username, or
// why it failed. The service's own result fits it; the password it also carries is not named
// here, so nothing in this file can read it.
export type CreateOutcome = { status: 'success'; user: { username: string } } | { status: 'failure'; reason: CreateUserFailureReason };

// What the screen uses of the UsersService: the read of the list, the create, and the results
// of the three calls. The delete itself is called by the view, from its dialog.
export type UsersCalls = Pick<UsersService, 'listUsers' | 'listUsersResult$' | 'createUser' | 'deleteUserResult$'> & {
  createUserResult$: Observable<CreateOutcome>;
};

const NOTHING: UsersState = { loading: false, unread: null, rows: null, empty: null, field: { username: '' }, creating: false, refusal: null, failure: null, created: null };

export class UsersScreen {
  private started = false;
  private readonly state = new BehaviorSubject<UsersState>(NOTHING);
  readonly users$: Observable<UsersState> = this.state.asObservable();

  // `visible$` notifies each time the page becomes visible again: nothing here reads the
  // document by itself (docs/FRONTEND_ARCHITECTURE.md section 5, rule 1).
  constructor(
    private readonly users: UsersCalls,
    private readonly visible$: Observable<unknown>,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the list, and from then on takes the creates, until the subscription returned ends. Until
  // then it also reads the list again:
  // - at every result of a create or of a delete, a failure included: after a failed write the
  //   server may still have applied it (docs/SHARED_CALENDAR_SPEC.md section 16.3), and a
  //   delete answered "no such user" means the list on show is old;
  // - every time the page becomes visible.
  // The end of the subscription forgets everything: the next start reads again.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start, perhaps a list the book dialog of the week asked for, and is not heard.
    let live = false;
    const subscription = this.users.listUsersResult$.subscribe((result) => {
      if (!live) return;
      if (result.status === 'failure') {
        // A list that could not be read again is not left on show as if it were the present one.
        this.patch({ loading: false, unread: failureText(result.reason), rows: null, empty: null });
        return;
      }
      const read = userRows(result.users);
      // The same users as on show keep the same object, so that the view redraws nothing.
      const shown = this.state.getValue().rows;
      const same = shown !== null && shown.length === read.length && read.every((row, i) => row.username === shown[i]!.username);
      const rows = same ? shown : read;
      this.patch({ loading: false, unread: null, rows, empty: rows.length === 0 ? NO_USERS : null });
    });
    subscription.add(
      this.users.createUserResult$.subscribe((result) => {
        if (!live) return;
        // On a success the field is emptied; on a failure what was typed stays.
        if (result.status === 'success') this.patch({ creating: false, created: result.user.username, field: { username: '' } });
        else this.patch({ creating: false, failure: failureText(result.reason) });
        this.read();
      }),
    );
    const again = () => {
      if (live) this.read();
    };
    subscription.add(this.users.deleteUserResult$.subscribe(again));
    subscription.add(this.visible$.subscribe(again));
    subscription.add(() => {
      this.started = false;
      this.state.next(NOTHING);
    });
    live = true;
    this.started = true;
    this.read();
    return subscription;
  }

  // Reads the list again after a read that failed: the way to try again.
  retry(): void {
    if (this.started) this.read();
  }

  // "Create user", with the field as the form holds it. A text that is not a username is said
  // and nothing is sent; otherwise the user is created (docs/ARCHITECTURE.md section 4).
  create(text: string): void {
    if (!this.started) return;
    const checked = usernameFor(text);
    if ('refusal' in checked) {
      this.patch({ refusal: checked.refusal, failure: null, created: null });
      return;
    }
    this.patch({ refusal: null, failure: null, created: null, creating: true });
    this.users.createUser(checked.username);
  }

  private read(): void {
    this.patch({ loading: true });
    this.users.listUsers();
  }

  private patch(change: Partial<UsersState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
