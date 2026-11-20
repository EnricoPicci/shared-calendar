import { localDateOf, type AppointmentConflict, type CalendarDay, type WindowBody } from '@shared-calendar/shared';
import { BehaviorSubject, Subscription, type Observable } from 'rxjs';
import type { AvailabilityRulesService } from '../services/availability-rules.service';
import type { AvailabilityTypesService } from '../services/availability-types.service';
import type { CalendarService } from '../services/calendar.service';
import { typeChoices, type Choice } from './availability.model';
import { kept, QUIET, type Ask, type Known } from './availability.screen';
import { conflictList } from './conflicts';
import {
  dateFor,
  dayModel,
  DRAFT_OPEN,
  draftAdd,
  draftModel,
  STARTING_WINDOW,
  startingWindows,
  windowFor,
  ZONE_PENDING,
  type DayModel,
  type DraftModel,
  type WindowField,
  type WindowFields,
} from './date.model';
import { failureText, type Attempt } from './texts';

// A single date of the availability screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the
// date chosen, its day read from the calendar view, the windows of "this day only" while they
// are being put together, and the five writes on a date: those windows saved, the day made not
// available, the day back to the weekly patterns, an extra window added and one deleted. The
// screen's second logic object, beside the AvailabilityScreen, which hands it what it knows.
// Shaped like a service: one public stream, `void` methods, nothing started by the constructor.

// What the part of a single date shows.
// - `field` is what the date field is filled with: another object only when it is to be
//   filled. `refusal` says, under it, why "Show" was not followed.
// - `day` is the day on show: null until a date is shown and after a read that failed, and
//   another object only when what it says differs. `unread` says why it could not be read.
//   `offers` says which of the day's actions are offered: "This day only" and "Not available
//   on this day" (`change`), and "Back to the weekly patterns" (`back`).
// - `choices` are the types to choose from in the two forms that add a window.
// - `draft` is the windows of "this day only" being put together, null while there are none;
//   `addFields` what the form that adds one to them is filled with, `add` what its "Add" says,
//   `save` what "Save this day" says.
// - `windowFields` is what the form that adds an extra window is filled with, `window` what
//   its "Add window" says.
// - `confirm` is what the action the dialog confirmed says: `about` is 'close', 'back' or the
//   id of the extra window deleted.
export type DateState = {
  loading: boolean;
  field: { date: string };
  refusal: string | null;
  unread: string | null;
  day: DayModel | null;
  offers: { change: boolean; back: boolean };
  choices: readonly Choice[];
  draft: DraftModel | null;
  addFields: WindowFields;
  add: Ask<WindowField>;
  save: Ask<never>;
  windowFields: WindowFields;
  window: Ask<WindowField>;
  confirm: Ask<never>;
};

// What the object uses of the services: the calendar view of one date, the four writes of a
// date with their results, and the results of the writes to a type and to a pattern, after
// which a day may be another.
export type DateCalendar = Pick<CalendarService, 'load' | 'calendarResult$'>;
export type DateTypes = Pick<AvailabilityTypesService, 'createResult$' | 'renameResult$' | 'removeResult$'>;
export type DateRules = Pick<
  AvailabilityRulesService,
  | 'setOverride'
  | 'setOverrideResult$'
  | 'deleteOverride'
  | 'deleteOverrideResult$'
  | 'createWindow'
  | 'createWindowResult$'
  | 'deleteWindow'
  | 'deleteWindowResult$'
  | 'createPatternResult$'
  | 'updatePatternResult$'
  | 'deletePatternResult$'
>;

// The result of a write, as far as this object reads it.
type Outcome = { status: 'success' } | { status: 'failure'; reason: string; conflicts?: AppointmentConflict[] };

const NOT_KNOWN: Known = { zone: null, zoneWhy: null, types: null, patterns: null };
const NOTHING: DateState = {
  loading: false,
  field: { date: '' },
  refusal: null,
  unread: null,
  day: null,
  offers: { change: false, back: false },
  choices: [],
  draft: null,
  addFields: STARTING_WINDOW,
  add: QUIET,
  save: QUIET,
  windowFields: STARTING_WINDOW,
  window: QUIET,
  confirm: QUIET,
};

export class DateScreen {
  private started = false;
  private known = NOT_KNOWN;
  // The date on show, null until one is shown, with the time zone it was judged in; its day
  // as last read, null after a read that failed.
  private shown: string | null = null;
  private zone: string | null = null;
  private read: { day: CalendarDay; zone: string } | null = null;
  // The windows of "this day only" being put together, by start; null while there are none.
  private draft: WindowBody[] | null = null;
  // Why the sentence under the date field is there, to know when it goes.
  private refused: 'date' | 'zone' | 'draft' | null = null;
  // Which write of the day's own windows is under way (a save and "not available" are the
  // same call), and which action of the dialog.
  private overriding: 'save' | 'close' | null = null;
  private confirming: 'close' | 'back' | 'window' | null = null;
  private readonly state = new BehaviorSubject<DateState>(NOTHING);
  readonly date$: Observable<DateState> = this.state.asObservable();

  // `known$` is what the AvailabilityScreen knows: the calendar's time zone, the types and the
  // patterns, which this object never reads itself. `calendar` is a CalendarService of this
  // part's own, not the week's. `now` gives the present moment, for "today"; `visible$`
  // notifies each time the page becomes visible again (docs/FRONTEND_ARCHITECTURE.md
  // section 5, rule 1).
  constructor(
    private readonly known$: Observable<Known>,
    private readonly calendar: DateCalendar,
    private readonly types: DateTypes,
    private readonly rules: DateRules,
    private readonly now: () => Date,
    private readonly visible$: Observable<unknown>,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5).
  // Nothing is read until a date is shown. From then on, and until the subscription returned
  // ends, the date on show is read again:
  // - at every result of a write on a date, a failure included: after a failed write the
  //   server may still have applied it (docs/SHARED_CALENDAR_SPEC.md section 16.3);
  // - at every result of a write to a type or to a pattern, since a day follows them;
  // - every time the page becomes visible.
  // The end of the subscription forgets everything, the windows being put together included.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start, and is not heard.
    let live = false;
    const subscription = new Subscription();
    const hear = <R>(result$: Observable<R>, then: (result: R) => void) =>
      subscription.add(
        result$.subscribe((result) => {
          if (live) then(result);
        }),
      );

    this.started = true;
    // What is known is taken as it is now, and at every change: the date field starts on
    // today once the zone says which day that is, and a "Show" refused for want of the zone
    // is refused no longer.
    subscription.add(
      this.known$.subscribe((known) => {
        const first = this.known.zone === null && known.zone !== null;
        this.known = known;
        const change: Partial<DateState> = first ? { field: { date: this.today(known.zone!) } } : {};
        if (known.zone !== null && this.refused === 'zone') Object.assign(change, this.unrefused());
        this.draw(change);
      }),
    );

    hear(this.calendar.calendarResult$, (result) => {
      // An answer to a load made before this start, with nothing on show, is nobody's.
      if (this.shown === null) return;
      const day = result.status === 'success' ? result.calendar.days.find((each) => each.date === this.shown) : undefined;
      this.read = day === undefined || result.status !== 'success' ? null : { day, zone: result.calendar.timeZone };
      // A view without the date asked for is not what the contract says.
      this.draw({ loading: false, unread: result.status === 'failure' ? failureText(result.reason) : day === undefined ? failureText('unexpected') : null });
    });

    // A save and "not available" are one call: the answer is of the one under way.
    hear(this.rules.setOverrideResult$, (result) => {
      const asked = this.overriding;
      this.overriding = null;
      if (asked === 'close') this.confirmed(result);
      if (asked === 'save') {
        if (result.status === 'success') {
          this.draft = null;
          this.draw({ save: QUIET, add: QUIET, addFields: { ...STARTING_WINDOW }, ...(this.refused === 'draft' ? this.unrefused() : {}) });
        } else this.draw({ save: this.failed('', result) });
      }
      this.reload();
    });
    hear(this.rules.deleteOverrideResult$, (result) => {
      if (this.confirming === 'back') this.confirmed(result, 'patterns-back');
      this.reload();
    });
    hear(this.rules.deleteWindowResult$, (result) => {
      if (this.confirming === 'window') this.confirmed(result);
      this.reload();
    });
    // On a success the form that adds an extra window goes back to its starting values; on a
    // failure what was chosen stays.
    hear(this.rules.createWindowResult$, (result) => {
      if (this.state.getValue().window.busy) {
        if (result.status === 'success') this.draw({ window: { ...QUIET, done: true }, windowFields: { ...STARTING_WINDOW } });
        else this.draw({ window: this.failed('', result, 'window') });
      }
      this.reload();
    });
    // The writes of the screen's other two parts, and the page shown again.
    for (const result$ of [this.types.createResult$, this.types.renameResult$, this.types.removeResult$, this.rules.createPatternResult$, this.rules.updatePatternResult$, this.rules.deletePatternResult$, this.visible$]) {
      hear<unknown>(result$, () => this.reload());
    }

    subscription.add(() => {
      this.started = false;
      this.known = NOT_KNOWN;
      this.shown = this.zone = this.read = this.draft = this.refused = this.overriding = this.confirming = null;
      this.state.next(NOTHING);
    });
    live = true;
    return subscription;
  }

  // "Show", with the date field as it holds it. Refused, with no request: while the windows of
  // "this day only" are being put together; while the calendar's time zone is not known, with
  // the words of the failed read of the settings; and for a text that is not a date or a date
  // before today, the calendar's (docs/SHARED_CALENDAR_SPEC.md R-AV-02). The same date shown
  // again is read again; another one takes the day on show off the screen.
  show(text: string): void {
    if (!this.started) return;
    if (this.draft !== null) return this.refuse('draft', DRAFT_OPEN);
    if (this.known.zone === null) return this.refuse('zone', this.known.zoneWhy ?? ZONE_PENDING);
    const checked = dateFor(text, this.today(this.known.zone));
    if ('refusal' in checked) return this.refuse('date', checked.refusal);
    if (checked.date !== this.shown) this.read = null;
    this.shown = checked.date;
    this.zone = this.known.zone;
    this.calendar.load(checked.date, checked.date);
    this.draw({ loading: true, unread: null, ...this.unrefused() });
  }

  // Reads the date on show again after a read that failed: the way to try again.
  retry(): void {
    this.reload();
  }

  // "This day only": starts from the windows the day on show has by itself, its own or the
  // weekly patterns'. Nothing is sent.
  edit(): void {
    if (!this.started || this.read === null || this.draft !== null) return;
    this.draft = startingWindows(this.shown!, this.read.day, this.read.zone);
    this.draw({ add: QUIET, save: QUIET, addFields: { ...STARTING_WINDOW } });
  }

  // "Add", with the three fields as the form holds them: one window more, or why not. On a
  // success the form goes back to its starting values. While a save is under way the windows
  // are left as they were sent.
  add(fields: WindowFields): void {
    if (this.draft === null || this.overriding === 'save') return;
    const added = draftAdd(this.draft, fields);
    if ('windows' in added) {
      this.draft = added.windows;
      this.draw({ add: QUIET, addFields: { ...STARTING_WINDOW } });
    } else this.draw({ add: { ...QUIET, ...added } });
  }

  // "Remove" on a row, by its place in the list.
  remove(index: number): void {
    if (this.draft === null || this.overriding === 'save') return;
    this.draft = this.draft.filter((_, i) => i !== index);
    this.draw();
  }

  // "Discard": the windows being put together are dropped, and nothing was sent.
  discard(): void {
    if (this.draft === null || this.overriding === 'save') return;
    this.draft = null;
    this.draw({ add: QUIET, save: QUIET, ...(this.refused === 'draft' ? this.unrefused() : {}) });
  }

  // "Save this day": one call with the whole list, which the server judges whole
  // (docs/SHARED_CALENDAR_SPEC.md R-OVR-02). With no window left it makes the day not available.
  save(): void {
    if (this.draft === null || this.overriding !== null) return;
    this.overriding = 'save';
    this.draw({ save: { ...QUIET, busy: true } });
    this.rules.setOverride(this.shown!, this.draft);
  }

  // "Add window", with the three fields as the form holds them: an extra window on the date on
  // show, or which fields are in fault. While one is being added another is not taken.
  addWindow(fields: WindowFields): void {
    if (!this.started || this.shown === null || this.state.getValue().window.busy) return;
    const checked = windowFor(this.shown, fields);
    if ('refusals' in checked) return this.draw({ window: { ...QUIET, refusals: checked.refusals } });
    this.draw({ window: { ...QUIET, busy: true } });
    this.rules.createWindow(checked.window);
  }

  // The three actions the dialog confirms. While one of them is under way another is not
  // taken, whatever it is; the first two are not taken either while the windows of "this day
  // only" are being put together.
  // "Not available on this day": the day's own windows set to none
  // (docs/SHARED_CALENDAR_SPEC.md R-OVR-01).
  close(): void {
    if (this.draft !== null || this.overriding !== null || !this.asks('close', 'close')) return;
    this.overriding = 'close';
    this.rules.setOverride(this.shown!, []);
  }

  // "Back to the weekly patterns": the day's own windows deleted.
  back(): void {
    if (this.draft === null && this.asks('back', 'back')) this.rules.deleteOverride(this.shown!);
  }

  // "Delete" on an extra window.
  removeWindow(windowId: string): void {
    if (this.asks('window', windowId)) this.rules.deleteWindow(windowId);
  }

  // Whether an action of the dialog is taken; when it is, the stream says it is under way.
  private asks(kind: 'close' | 'back' | 'window', about: string): boolean {
    if (!this.started || this.shown === null || this.confirming !== null) return false;
    this.confirming = kind;
    this.draw({ confirm: { ...QUIET, about, busy: true } });
    return true;
  }

  // The outcome of the action the dialog confirmed.
  private confirmed(result: Outcome, attempt?: Attempt): void {
    this.confirming = null;
    const about = this.state.getValue().confirm.about;
    this.draw({ confirm: result.status === 'success' ? { ...QUIET, about, done: true } : this.failed(about, result, attempt) });
  }

  // A write that failed: why, in plain words, with the appointments in the way when the
  // server named some, in the time zone the date was judged in.
  private failed(about: string, result: Outcome & { status: 'failure' }, attempt?: Attempt): Ask<never> {
    return { ...QUIET, about, failure: failureText(result.reason, attempt), conflicts: conflictList(result.conflicts, this.zone!) };
  }

  private today(zone: string): string {
    return localDateOf(this.now().toISOString(), zone);
  }

  private refuse(why: 'date' | 'zone' | 'draft', refusal: string): void {
    this.refused = why;
    this.draw({ refusal });
  }

  // The sentence under the date field goes.
  private unrefused(): Partial<DateState> {
    this.refused = null;
    return { refusal: null };
  }

  private reload(): void {
    if (!this.started || this.shown === null) return;
    this.calendar.load(this.shown, this.shown);
    this.draw({ loading: true });
  }

  // The state made again from what is known, what was read and the windows being put
  // together. What comes out equal to what is on show keeps the object on show, so that the
  // view redraws nothing and the keyboard stays where it is.
  private draw(change: Partial<DateState> = {}): void {
    const shown = this.state.getValue();
    const day = this.read === null ? null : kept(shown.day, dayModel(this.shown!, this.known.patterns, this.known.types, this.read.day, this.read.zone));
    const editing = this.draft !== null;
    this.state.next({
      ...shown,
      day,
      offers: { change: day !== null && !editing, back: day !== null && day.hasOverride && !editing },
      choices: kept(shown.choices, typeChoices(this.known.types ?? [])),
      draft: this.draft === null ? null : kept(shown.draft, draftModel(this.draft, this.known.types)),
      ...change,
    });
  }
}
