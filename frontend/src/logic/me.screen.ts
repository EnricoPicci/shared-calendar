import type { Language, Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { LanguageService } from '../services/language.service';
import type { MeService } from '../services/me.service';
import type { UsersService } from '../services/users.service';
import type { PageTexts } from '../texts/texts';
import { meDetails, meFields, type MeDetails } from './me.model';
import { NO_REFUSALS, profileFor, recheck, type ProfileFields } from './profile.model';
import { failureText } from './texts';
import type { EditState, UpdateOutcome } from './users.screen';

// "My details" (docs/FRONTEND_ARCHITECTURE.md section 5.1), a screen of both roles: the person's
// own four facts, read when the screen is shown and every time the page becomes visible, and for
// the Administrator the Edit dialog, whose save goes through PUT /users/{username} on their own
// account (docs/EMAIL_ARCHITECTURE.md decision M12). A User reads, and asks the Administrator for
// a change (docs/EMAIL_ARCHITECTURE.md section 4.2). Both roles choose their own language, saved
// at once in their account (docs/MULTILANGUAGE_PLAN.md finding F11): once it is saved the shell
// enters the frame again in it, so this screen ends. Shaped like a service: one public stream,
// `void` methods, nothing started by the constructor.

// What the view shows.
// - `details` are the texts of the last read, null until there is one and after a read that
//   failed; `unread` is why it failed, in plain words, in its place.
// - `fields` is what the Edit dialog is filled with when it opens; `canEdit` whether it is offered.
// - `edit`: the Edit dialog, as on the users screen.
// - `language`: the language the list shows, whether a save is under way, and why the last one
//   failed.
export type LanguageChoice = { value: Language; saving: boolean; failure: string | null };
export type MeState = {
  loading: boolean;
  unread: string | null;
  details: MeDetails | null;
  fields: ProfileFields | null;
  canEdit: boolean;
  edit: EditState;
  language: LanguageChoice;
};

// What the screen uses: the read of GET /me, and of the UsersService the update and its result.
export type MeCalls = Pick<MeService, 'getMe' | 'meResult$'>;
export type MeUpdateCalls = Pick<UsersService, 'updateUser'> & { updateUserResult$: Observable<UpdateOutcome> };
// And of the LanguageService, the write and its result.
export type MeLanguageCalls = Pick<LanguageService, 'write' | 'writeResult$'>;

const NO_EDIT: EditState = { saving: false, refusals: NO_REFUSALS, failure: null, saved: null };

export class MeScreen {
  private started = false;
  // Whether the update under way was asked for from this screen's dialog: the service is shared
  // with the users screen.
  private editAsked = false;
  // Whether the write under way was asked for from this screen.
  private languageAsked = false;
  private username: string | null = null;
  private readonly state: BehaviorSubject<MeState>;
  readonly me$: Observable<MeState>;

  constructor(
    private readonly me: MeCalls,
    private readonly users: MeUpdateCalls,
    private readonly role: Role,
    private readonly visible$: Observable<unknown>,
    private readonly language: MeLanguageCalls,
    // The page texts of the language in use, kept for the screen's life
    // (docs/MULTILANGUAGE_PLAN.md decision D2).
    private readonly texts: PageTexts,
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
        this.patch({ loading: false, unread: failureText(this.texts.failures, result.reason), details: null, fields: null });
        return;
      }
      this.username = result.me.username;
      this.patch({ loading: false, unread: null, details: meDetails(this.texts, result.me), fields: meFields(result.me) });
    });
    subscription.add(
      this.users.updateUserResult$.subscribe((result) => {
        if (!live || !this.editAsked) return;
        this.editAsked = false;
        const edit = this.state.getValue().edit;
        if (result.status === 'success') this.patch({ edit: { ...edit, saving: false, saved: {} } });
        else this.patch({ edit: { ...edit, saving: false, failure: failureText(this.texts.failures, result.reason) } });
        this.read();
      }),
    );
    // A save of the language that failed: the list goes back to the language in use, with why. A
    // success leaves the list as it is, saving: the shell enters the frame again in the language.
    subscription.add(
      this.language.writeResult$.subscribe((result) => {
        if (!live || !this.languageAsked) return;
        this.languageAsked = false;
        if (result.status === 'failure') {
          this.patch({ language: { value: this.texts.locale, saving: false, failure: this.texts.profile.languageNotSaved(failureText(this.texts.failures, result.reason)) } });
        }
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
      this.languageAsked = false;
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
    this.patch({ edit: { ...edit, refusals: recheck(this.texts.profile, fields, edit.refusals) } });
  }

  // "Save": the Administrator's own four facts, checked, then sent. Nothing for a User, nothing
  // before the details were read, and a save under way is not asked for twice.
  save(fields: ProfileFields): void {
    if (!this.started || this.role !== 'admin' || this.username === null) return;
    const edit = this.state.getValue().edit;
    if (edit.saving) return;
    const checked = profileFor(this.texts.profile, fields);
    if ('refusals' in checked) {
      this.patch({ edit: { ...edit, refusals: checked.refusals, failure: null } });
      return;
    }
    this.editAsked = true;
    this.patch({ edit: { ...edit, saving: true, refusals: NO_REFUSALS, failure: null } });
    this.users.updateUser(this.username, checked.profile);
  }

  // Another language chosen in the list: saved at once. The language in use, or a save under way,
  // asks for nothing.
  chooseLanguage(language: Language): void {
    if (!this.started) return;
    const now = this.state.getValue().language;
    if (now.saving || language === this.texts.locale) return;
    this.languageAsked = true;
    this.patch({ language: { value: language, saving: true, failure: null } });
    this.language.write(language);
  }

  private nothing(): MeState {
    return {
      loading: false,
      unread: null,
      details: null,
      fields: null,
      canEdit: this.role === 'admin',
      edit: NO_EDIT,
      language: { value: this.texts.locale, saving: false, failure: null },
    };
  }

  private read(): void {
    this.patch({ loading: true });
    this.me.getMe();
  }

  private patch(change: Partial<MeState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
