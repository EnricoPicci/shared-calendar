import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { CalendarSettingsService } from '../services/calendar-settings.service';
import type { MailSettingsService } from '../services/mail-settings.service';
import { dailyFields, dailyFor, type DailyFields } from './daily-mail.model';
import { failureText } from './texts';
import type { PageTexts } from '../texts/texts';

// The settings' section "Daily e-mail" (docs/FRONTEND_ARCHITECTURE.md section 5.1): the daily
// mail's settings read when the screen is shown, the save of what its two fields hold, checked
// before any call, and the settings read again after every save, as the calendar's settings are.
// It stands apart from the calendar's settings: a failure of one hides nothing of the other. In a
// stack where e-mail is not switched on yet, the section says so in place of its fields
// (docs/EMAIL_PLAN.md finding F13). Shaped like a service: one public stream, `void` methods,
// nothing started by the constructor.

// What the section shows.
// - `fields`: what the two fields are filled with, null until the settings are read; another
//   object only when they are to be filled again, at the first read and after a save that
//   succeeded, so that what was typed stays after a failure.
// - `unavailable`: the sentence that takes the fields' place when e-mail is not available yet.
// - `unread`: why the settings could not be read, otherwise, while there are no fields.
// - `timeZone`: the calendar's, said beside the hour; null until the calendar's settings are read.
// - `refusal`: why the hour typed was not saved; `failure`: why a save sent did not succeed;
//   `saved`: that the last save did, until the next save or edit.
export type DailyMailState = {
  loading: boolean;
  unavailable: string | null;
  unread: string | null;
  fields: DailyFields | null;
  timeZone: string | null;
  saving: boolean;
  refusal: string | null;
  failure: string | null;
  saved: boolean;
};

// What the section uses: the mail settings' read and save with their results, and the calendar
// settings' results, for the time zone; it never asks for those itself, the settings screen does.
export type DailyMailCalls = Pick<MailSettingsService, 'getSettings' | 'settingsResult$' | 'updateSettings' | 'updateResult$'>;
export type CalendarZone = Pick<CalendarSettingsService, 'settingsResult$'>;

const NOTHING: DailyMailState = { loading: false, unavailable: null, unread: null, fields: null, timeZone: null, saving: false, refusal: null, failure: null, saved: false };

export class DailyMailScreen {
  private started = false;
  // Whether the next read fills the fields: at the first read of a start, and at every read
  // until one succeeds.
  private toFill = true;
  private readonly state = new BehaviorSubject<DailyMailState>(NOTHING);
  readonly daily$: Observable<DailyMailState> = this.state.asObservable();

  constructor(
    private readonly mail: DailyMailCalls,
    private readonly calendar: CalendarZone,
    // The page texts of the language in use, kept for the screen's life
    // (docs/MULTILANGUAGE_PLAN.md decision D2).
    private readonly texts: PageTexts,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the settings and from then on takes the saves, until the subscription returned ends, which
  // forgets everything. The settings are read again after every result of a save, a failure
  // included: the server may still have applied it.
  start(): Subscription {
    // A result that comes before this start is not heard, as on the settings screen. The time
    // zone is the exception: the calendar's is the same whoever read it, and the last one known
    // is taken.
    let live = false;
    const subscription = this.calendar.settingsResult$.subscribe((result) => {
      if (result.status === 'success') this.patch({ timeZone: result.settings.timeZone });
    });
    subscription.add(
      this.mail.settingsResult$.subscribe((result) => {
        if (!live) return;
        if (result.status === 'failure') {
          if (result.reason === 'mail_unavailable') this.patch({ loading: false, unavailable: failureText(this.texts.failures, result.reason), unread: null, fields: null });
          // With fields on show, a read that fails after a save changes nothing: the save's own
          // outcome is what was said.
          else this.patch({ loading: false, unread: this.toFill ? failureText(this.texts.failures, result.reason) : null });
          return;
        }
        if (this.toFill) this.patch({ loading: false, unavailable: null, unread: null, fields: dailyFields(result.settings) });
        else this.patch({ loading: false });
        this.toFill = false;
      }),
    );
    subscription.add(
      this.mail.updateResult$.subscribe((result) => {
        if (!live) return;
        if (result.status === 'success') this.patch({ saving: false, saved: true, failure: null, fields: dailyFields(result.settings) });
        else if (result.reason === 'mail_unavailable') this.patch({ saving: false, unavailable: failureText(this.texts.failures, result.reason), fields: null });
        else this.patch({ saving: false, failure: failureText(this.texts.failures, result.reason) });
        this.mail.getSettings();
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

  // "Save", with the two fields as the section holds them. An hour that is not a whole hour is
  // said and nothing is sent; otherwise both values are saved together.
  save(fields: DailyFields): void {
    if (!this.started) return;
    const checked = dailyFor(this.texts.settings, fields);
    if ('refusal' in checked) {
      this.patch({ refusal: checked.refusal, saved: false });
      return;
    }
    this.patch({ refusal: null, saved: false, failure: null, saving: true });
    this.mail.updateSettings(checked.body);
  }

  // Something was typed or switched: "saved" no longer describes what the fields hold.
  edited(): void {
    if (this.state.getValue().saved) this.patch({ saved: false });
  }

  private read(): void {
    this.patch({ loading: true });
    this.mail.getSettings();
  }

  private patch(change: Partial<DailyMailState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
