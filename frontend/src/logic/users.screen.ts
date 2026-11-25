import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { NewUser, UsersService } from '../services/users.service';
import type { CreateUserFailureReason, ResendInvitationFailureReason, UpdateUserFailureReason } from '../services/users.types';
import { EMPTY_FIELDS, NO_REFUSALS, profileFor, recheck, type ProfileFields, type ProfileRefusals } from './profile.model';
import { failureText } from './texts';
import { CREATE_FAILED, invitedAnswer, inviteQuestion, NO_USERS, sameRow, userRows, usernameFor, type UserRow } from './users.model';

// The users screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the list of users read when
// the screen is shown; a user created from what the form holds, after a last look at the address
// the invitation goes to; an invitation sent again, after the same look; the four facts of a user
// changed from the Edit dialog; each checked before any call, and the list read again after every
// create, resend, edit and delete and every time the page becomes visible. Shaped like a service:
// one public stream, `void` methods, nothing started by the constructor.

/** What the create form holds: the username and the four facts. */
export type NewUserFields = { username: string } & ProfileFields;

// What the form is filled with: another object only when the form is to be filled again, which is
// after a create that succeeded, with nothing.
export type UsernameField = NewUserFields;

// What the Edit dialog shows. `refusals` stand under its fields, `failure` under the form, both
// until the next save or opening; `saving` while a save is under way; `saved` is another object
// each time a save asked for from the dialog succeeded, when the dialog closes.
export type EditState = { saving: boolean; refusals: ProfileRefusals; failure: string | null; saved: object | null };

// What the invitation's dialog shows (docs/EMAIL_ARCHITECTURE.md section 5.3.1): the last look
// at the address (`question`); `sending` while the creation or the resend is under way; then
// either `answer`, where the invitation went, or `failure`, why it did not go, in plain words.
export type InviteState = { question: string; sending: boolean; answer: string | null; failure: string | null };

// What the users view shows.
// - `rows` is the last list read, null until there is one and after a read that failed;
//   another object only when the list read differs from the one on show. `empty` is the
//   sentence of a list with no row. `unread` is why the list could not be read, in plain
//   words, in its place.
// - `refusal` is why the username was not sent, `refusals` why each fact was not. They last until
//   the next "Create user".
// - `invite`: the invitation's dialog, null while it is closed.
// - `edit`: the Edit dialog.
export type UsersState = {
  loading: boolean;
  unread: string | null;
  rows: readonly UserRow[] | null;
  empty: string | null;
  field: UsernameField;
  refusal: string | null;
  refusals: ProfileRefusals;
  invite: InviteState | null;
  edit: EditState;
};

// What the screen reads of a create's result: that it succeeded, or why it failed.
export type CreateOutcome = { status: 'success' } | { status: 'failure'; reason: CreateUserFailureReason };
// What the screen reads of a resend's result: that it succeeded, or why it failed.
export type ResendOutcome = { status: 'success' } | { status: 'failure'; reason: ResendInvitationFailureReason };
// What the screen reads of an edit's result: that it succeeded, or why it failed.
export type UpdateOutcome = { status: 'success' } | { status: 'failure'; reason: UpdateUserFailureReason };

// What the screen uses of the UsersService: the read of the list, the create, the resend, the
// update, and the results of the five calls. The delete itself is called by the view, from its
// dialog.
export type UsersCalls = Pick<UsersService, 'listUsers' | 'listUsersResult$' | 'createUser' | 'resendInvitation' | 'deleteUserResult$' | 'updateUser'> & {
  createUserResult$: Observable<CreateOutcome>;
  resendInvitationResult$: Observable<ResendOutcome>;
  updateUserResult$: Observable<UpdateOutcome>;
};

// What the invitation's dialog will send at "Confirm": a new User, or an invitation again.
type Invitation = { kind: 'create'; user: NewUser; email: string } | { kind: 'resend'; username: string; email: string };

const NO_EDIT: EditState = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };
const NOTHING: UsersState = {
  loading: false,
  unread: null,
  rows: null,
  empty: null,
  field: { username: '', ...EMPTY_FIELDS },
  refusal: null,
  refusals: NO_REFUSALS,
  invite: null,
  edit: NO_EDIT,
};

export class UsersScreen {
  private started = false;
  // Whether the update under way was asked for from this screen's dialog: the service is shared
  // with "My details", whose own edits are not this screen's to show.
  private editAsked = false;
  // What the invitation's dialog shows the look for, and which of the two calls was sent from it
  // and not answered yet: only that one's result is shown there.
  private invitation: Invitation | null = null;
  private inviteAsked: Invitation['kind'] | null = null;
  private readonly state = new BehaviorSubject<UsersState>(NOTHING);
  readonly users$: Observable<UsersState> = this.state.asObservable();

  // `visible$` notifies each time the page becomes visible again: nothing here reads the
  // document by itself (docs/FRONTEND_ARCHITECTURE.md section 5, rule 1).
  constructor(
    private readonly users: UsersCalls,
    private readonly visible$: Observable<unknown>,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the list, and from then on takes the creates and the edits, until the subscription returned
  // ends. Until then it also reads the list again:
  // - at every result of a create, a resend, an edit asked for here, or a delete, a failure
  //   included: after
  //   a failed write the server may still have applied it (docs/SHARED_CALENDAR_SPEC.md section
  //   16.3), and a delete answered "no such user" means the list on show is old;
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
      const same = shown !== null && shown.length === read.length && read.every((row, i) => sameRow(row, shown[i]!));
      const rows = same ? shown : read;
      this.patch({ loading: false, unread: null, rows, empty: rows.length === 0 ? NO_USERS : null });
    });
    subscription.add(
      this.users.createUserResult$.subscribe((result) => {
        if (!live) return;
        // On a success the form is emptied; on a failure what was typed stays.
        if (result.status === 'success') this.patch({ field: { username: '', ...EMPTY_FIELDS } });
        this.answered('create', result);
        this.read();
      }),
    );
    subscription.add(
      this.users.resendInvitationResult$.subscribe((result) => {
        if (!live) return;
        this.answered('resend', result);
        this.read();
      }),
    );
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
    const again = () => {
      if (live) this.read();
    };
    subscription.add(this.users.deleteUserResult$.subscribe(again));
    subscription.add(this.visible$.subscribe(again));
    subscription.add(() => {
      this.started = false;
      this.editAsked = false;
      this.invitation = null;
      this.inviteAsked = null;
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

  // At every change of the create form: a refused fact is checked again, so that its refusal goes
  // once it is right.
  typed(fields: NewUserFields): void {
    if (!this.started) return;
    this.patch({ refusals: recheck(fields, this.state.getValue().refusals) });
  }

  // "Create user", with the form as it holds it. A username or a fact that is not one is said
  // under its field and nothing is sent; otherwise the invitation's dialog opens with the address,
  // as the shared rule makes it, and the user is created only at "Confirm" (docs/ARCHITECTURE.md
  // section 4, docs/EMAIL_ARCHITECTURE.md sections 4.1 and 5.3.1).
  create(fields: NewUserFields): void {
    if (!this.started) return;
    const checked = usernameFor(fields.username);
    const profile = profileFor(fields);
    const refusal = 'refusal' in checked ? checked.refusal : null;
    const refusals = 'refusals' in profile ? profile.refusals : NO_REFUSALS;
    if (!('username' in checked) || !('profile' in profile)) {
      this.patch({ refusal, refusals });
      return;
    }
    this.patch({ refusal: null, refusals: NO_REFUSALS });
    this.ask({ kind: 'create', user: { username: checked.username, ...profile.profile }, email: profile.profile.email });
  }

  // "Resend invitation" on a row: the invitation's dialog opens with the User's address.
  resend(row: UserRow): void {
    if (this.started && row.status === 'invited') this.ask({ kind: 'resend', username: row.username, email: row.email });
  }

  // "Confirm" in the invitation's dialog: the creation or the resend is sent, once.
  confirm(): void {
    const invitation = this.invitation;
    const invite = this.state.getValue().invite;
    if (!this.started || invitation === null || invite === null || invite.sending || invite.answer !== null) return;
    this.inviteAsked = invitation.kind;
    this.patch({ invite: { ...invite, sending: true, failure: null } });
    if (invitation.kind === 'create') this.users.createUser(invitation.user);
    else this.users.resendInvitation(invitation.username);
  }

  // "Back", "Close" or the Escape key: the dialog closes. A call already sent goes on, and the list
  // is read again at its result, but the dialog does not open again for it.
  closeInvite(): void {
    if (!this.started) return;
    this.invitation = null;
    this.inviteAsked = null;
    this.patch({ invite: null });
  }

  private ask(invitation: Invitation): void {
    this.invitation = invitation;
    this.inviteAsked = null;
    this.patch({ invite: { question: inviteQuestion(invitation.email), sending: false, answer: null, failure: null } });
  }

  // The result of a creation or a resend, shown in the dialog that sent it, if it is still open.
  private answered(kind: Invitation['kind'], result: CreateOutcome | ResendOutcome): void {
    const invite = this.state.getValue().invite;
    if (this.inviteAsked !== kind || this.invitation === null || invite === null) return;
    this.inviteAsked = null;
    if (result.status === 'success') this.patch({ invite: { ...invite, sending: false, answer: invitedAnswer(this.invitation.email) } });
    else {
      // A creation the server failed says that nothing was kept; any other failure, its own sentence.
      const failure = kind === 'create' && result.reason === 'internal_error' ? CREATE_FAILED : failureText(result.reason);
      this.patch({ invite: { ...invite, sending: false, failure } });
    }
  }

  // The Edit dialog opened: it starts clean.
  editOpened(): void {
    if (this.started) this.patch({ edit: { ...NO_EDIT, saving: this.state.getValue().edit.saving } });
  }

  // At every change of the Edit dialog's fields, as `typed` for the create form.
  editTyped(fields: ProfileFields): void {
    if (!this.started) return;
    const edit = this.state.getValue().edit;
    this.patch({ edit: { ...edit, refusals: recheck(fields, edit.refusals) } });
  }

  // "Save" in the Edit dialog of `username`: the four facts, checked, then sent. A save under way
  // is not asked for twice.
  save(username: string, fields: ProfileFields): void {
    if (!this.started) return;
    const edit = this.state.getValue().edit;
    if (edit.saving) return;
    const checked = profileFor(fields);
    if ('refusals' in checked) {
      this.patch({ edit: { ...edit, refusals: checked.refusals, failure: null } });
      return;
    }
    this.editAsked = true;
    this.patch({ edit: { ...edit, saving: true, refusals: NO_REFUSALS, failure: null } });
    this.users.updateUser(username, checked.profile);
  }

  private read(): void {
    this.patch({ loading: true });
    this.users.listUsers();
  }

  private patch(change: Partial<UsersState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
