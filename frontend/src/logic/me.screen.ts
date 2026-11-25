import type { Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { MeService } from '../services/me.service';
import type { UsersService } from '../services/users.service';
import { meDetails, meFields, type MeDetails } from './me.model';
import { NO_REFUSALS, profileFor, recheck, type ProfileFields } from './profile.model';
import { failureText } from './texts';
import type { EditState, UpdateOutcome } from './users.screen';

// "My details" (docs/FRONTEND_ARCHITECTURE.md section 5.1), a screen of both roles: the person's
// own four facts, read when the screen is shown and every time the page becomes visible, and for
// the Administrator the Edit dialog, whose save goes through PUT /users/{username} on their own
// account (docs/EMAIL_ARCHITECTURE.md decision M12). A User reads, and asks the Administrator for
// a change (docs/EMAIL_ARCHITECTURE.md section 4.2). Shaped like a service: one public stream,
// `void` methods, nothing started by the constructor.

// What the view shows.
// - `details` are the texts of the last read, null until there is one and after a read that
//   failed; `unread` is why it failed, in plain words, in its place.
// - `fields` is what the Edit dialog is filled with when it opens; `canEdit` whether it is offered.
// - `edit`: the Edit dialog, as on the users screen.
export type MeState = {
  loading: boolean;
  unread: string | null;
  details: MeDetails | null;
  fields: ProfileFields | null;
  canEdit: boolean;
  edit: EditState;
};

// What the screen uses: the read of GET /me, and of the UsersService the update and its result.
export type MeCalls = Pick<MeService, 'getMe' | 'meResult$'>;
export type MeUpdateCalls = Pick<UsersService, 'updateUser'> & { updateUserResult$: Observable<UpdateOutcome> };

const NO_EDIT: EditState = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };

export class MeScreen {
  private started = false;
  // Whether the update under way was asked for from this screen's dialog: the service is shared
  // with the users screen.
  private editAsked = false;
  private username: string | null = null;
  private readonly state: BehaviorSubject<MeState>;
  readonly me$: Observable<MeState>;

  constructor(
    private readonly me: MeCalls,
    private readonly users: MeUpdateCalls,
    private readonly role: Role,
    private readonly visible$: Observable<unknown>,
  ) {
    this.state = new BehaviorSubject<MeState>(this.nothing());
    this.me$ = this.state.asObservable();
  }

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the details, then reads them again after a save asked for here, a failed one included, and
  // every time the page becomes visible, until the subscription returned ends, which forgets
  // everything.
  start(): Subscription {
    // The result stream hands its last result to a new subscriber at once: that one came before
    // this start and is not heard.
    let live = false;
    const subscription = this.me.meResult$.subscribe((result) => {
      if (!live) return;
      if (result.status === 'failure') {
        this.username = null;
        this.patch({ loading: false, unread: failureText(result.reason), details: null, fields: null });
        return;
      }
      this.username = result.me.username;
      this.patch({ loading: false, unread: null, details: meDetails(result.me), fields: meFields(result.me) });
    });
    subscription.add(
      this.users.updateUserResult$.subscribe((result) => {
        if (!live || !this.editAsked) return;
        this.editAsked = false;
        const edit = this.state.getValue().edit;
        if (result.status === 'success') this.patch({ edit: { ...edit, saving: false, saved: {} } });
        else this.patch({ edit: { ...edit, saving: false, failure: failureText(result.reason) } });
        this.read();
      }),
    );
    subscription.add(
      this.visible$.subscribe(() => {
        if (live) this.read();
      }),
    );
    subscription.add(() => {
      this.started = false;
      this.editAsked = false;
      this.username = null;
      this.state.next(this.nothing());
    });
    live = true;
    this.started = true;
    this.read();
    return subscription;
  }

  // Reads the details again after a read that failed: the way to try again.
  retry(): void {
    if (this.started) this.read();
  }

  // The Edit dialog opened: it starts clean.
  editOpened(): void {
    if (this.started) this.patch({ edit: { ...NO_EDIT, saving: this.state.getValue().edit.saving } });
  }

  // At every change of the dialog's fields: a refused fact is checked again.
  editTyped(fields: ProfileFields): void {
    if (!this.started) return;
    const edit = this.state.getValue().edit;
    this.patch({ edit: { ...edit, refusals: recheck(fields, edit.refusals) } });
  }

  // "Save": the Administrator's own four facts, checked, then sent. Nothing for a User, nothing
  // before the details were read, and a save under way is not asked for twice.
  save(fields: ProfileFields): void {
    if (!this.started || this.role !== 'admin' || this.username === null) return;
    const edit = this.state.getValue().edit;
    if (edit.saving) return;
    const checked = profileFor(fields);
    if ('refusals' in checked) {
      this.patch({ edit: { ...edit, refusals: checked.refusals, failure: null } });
      return;
    }
    this.editAsked = true;
    this.patch({ edit: { ...edit, saving: true, refusals: NO_REFUSALS, failure: null } });
    this.users.updateUser(this.username, checked.profile);
  }

  private nothing(): MeState {
    return { loading: false, unread: null, details: null, fields: null, canEdit: this.role === 'admin', edit: NO_EDIT };
  }

  private read(): void {
    this.patch({ loading: true });
    this.me.getMe();
  }

  private patch(change: Partial<MeState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
