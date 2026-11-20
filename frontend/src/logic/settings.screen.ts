import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { CalendarSettingsService } from '../services/calendar-settings.service';
import { settingsFields, settingsFor, settingsInfo, type Refusals, type SettingsFields, type SettingsInfo } from './settings.model';
import { failureText } from './texts';

// The settings screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the calendar's settings read
// when the screen is shown, the save of what the form holds, checked field by field before any
// call, and the settings read again after every save. Shaped like a service: one public
// stream, `void` methods, nothing started by the constructor.

// What the settings view shows.
// - `fields` is what the form's fields are filled with: null until the settings are read, and
//   another object only when the form is to be filled again, at the first read and after a
//   save that succeeded. A read that follows a failed save leaves it, so that what was typed
//   stays.
// - `info` is what the form says beside the fields, brought up to date by every read.
// - `unread` is why the settings could not be read, in plain words, while there is no form.
// - `refusals` names the fields in fault of the last "Save", `failure` says why a save that
//   was sent did not succeed, `saved` that the last one did, until the next save or edit.
export type SettingsState = {
  loading: boolean;
  unread: string | null;
  fields: SettingsFields | null;
  info: SettingsInfo | null;
  saving: boolean;
  refusals: Refusals;
  failure: string | null;
  saved: boolean;
};

// What the screen uses of the CalendarSettingsService: the read and the save, with their
// results.
export type SettingsCalls = Pick<CalendarSettingsService, 'load' | 'settingsResult$' | 'update' | 'updateResult$'>;

const NOTHING: SettingsState = { loading: false, unread: null, fields: null, info: null, saving: false, refusals: {}, failure: null, saved: false };

export class SettingsScreen {
  private started = false;
  // Whether the next settings read fill the form: at the first read of a start, and at every
  // read until one succeeds.
  private toFill = true;
  private readonly state = new BehaviorSubject<SettingsState>(NOTHING);
  readonly settings$: Observable<SettingsState> = this.state.asObservable();

  constructor(private readonly settings: SettingsCalls) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the settings, and from then on takes the saves, until the subscription returned ends. The
  // settings are read again after every result of a save, a failure included: after a failed
  // write the server may still have applied it (docs/SHARED_CALENDAR_SPEC.md section 16.3). The
  // end of the subscription forgets everything: the next start reads again.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start, perhaps asked for by another screen of the session, and is not heard.
    let live = false;
    const subscription = this.settings.settingsResult$.subscribe((result) => {
      if (!live) return;
      if (result.status === 'failure') {
        // With a form on show, a read that fails after a save changes nothing: the save's own
        // outcome is what was said.
        this.patch({ loading: false, unread: this.toFill ? failureText(result.reason) : null });
        return;
      }
      const info = settingsInfo(result.settings);
      if (this.toFill) this.patch({ loading: false, unread: null, info, fields: settingsFields(result.settings) });
      else this.patch({ loading: false, info });
      this.toFill = false;
    });
    subscription.add(
      this.settings.updateResult$.subscribe((result) => {
        if (!live) return;
        if (result.status === 'success') {
          // The form is filled with what the server answers.
          this.patch({ saving: false, saved: true, failure: null, info: settingsInfo(result.settings), fields: settingsFields(result.settings) });
        } else {
          this.patch({ saving: false, failure: failureText(result.reason) });
        }
        this.settings.load();
      }),
    );
    subscription.add(() => {
      this.started = false;
      this.toFill = true;
      this.state.next(NOTHING);
    });
    live = true;
    this.started = true;
    this.read();
    return subscription;
  }

  // Reads the settings again after a read that failed: the way to try again.
  retry(): void {
    if (this.started) this.read();
  }

  // "Save", with the fields as the form holds them. A field in fault is said and nothing is
  // sent; otherwise the four values are saved together (docs/SHARED_CALENDAR_SPEC.md R-SET-02).
  save(fields: SettingsFields): void {
    if (!this.started) return;
    const checked = settingsFor(fields);
    if ('refusals' in checked) {
      this.patch({ refusals: checked.refusals, saved: false });
      return;
    }
    this.patch({ refusals: {}, saved: false, failure: null, saving: true });
    this.settings.update(checked.body);
  }

  // Something was typed or ticked in the form: "saved" no longer describes what it holds.
  edited(): void {
    if (this.state.getValue().saved) this.patch({ saved: false });
  }

  private read(): void {
    this.patch({ loading: true });
    this.settings.load();
  }

  private patch(change: Partial<SettingsState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
