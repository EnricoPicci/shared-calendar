import { localDateOf, type AppointmentConflict, type AvailabilityType, type PatternBody, type WeeklyPattern } from '@shared-calendar/shared';
import { BehaviorSubject, Subscription, type Observable } from 'rxjs';
import type { AvailabilityRulesService } from '../services/availability-rules.service';
import type { AvailabilityTypesService } from '../services/availability-types.service';
import type { CalendarSettingsService } from '../services/calendar-settings.service';
import {
  NO_PATTERNS,
  NO_TYPE_YET,
  NO_TYPES,
  patternFor,
  patternGroups,
  startingFields,
  typeChoices,
  typeNameFor,
  typeRows,
  type Choice,
  type PatternField,
  type PatternFields,
  type PatternGroup,
  type TypeRow,
} from './availability.model';
import { conflictList, type ConflictList } from './conflicts';
import { failureText, type Attempt } from './texts';

// The availability screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the availability types
// and the weekly patterns read when the screen is shown, the four writes that have a check
// (a type created and renamed, a pattern created and changed), and both lists read again after
// every write and every time the page becomes visible. Shaped like a service: one public
// stream, `void` methods, nothing started by the constructor.

// What one of the four writes says to the form or the dialog that asked for it, replaced
// whole at every new ask: `about`, the id of the type renamed or of the pattern changed, empty
// for a create; `busy` while its call is under way; `refusals`, why a field was not accepted,
// with no call made (a field named with an empty sentence is in fault without words of its
// own: another field's sentence names it); `failure`, why a call that was made did not succeed, with `conflicts`,
// the appointments in the way, when the server named some; `done` once it succeeded. A dialog
// shows it only while it is about what the dialog is about.
export type Ask<F extends string> = {
  about: string;
  busy: boolean;
  refusals: Partial<Record<F, string>>;
  failure: string | null;
  conflicts: ConflictList | null;
  done: boolean;
};
// The four writes, by the names their outcomes have in the state.
export type AskName = 'typeCreate' | 'rename' | 'patternCreate' | 'change';

// What the availability view shows.
// - `types` and `groups` are the two lists as last read: null until there is one and after a
//   read that failed; another object only when what was read differs from what is on show.
//   `typesUnread` and `patternsUnread` say why a list could not be read, in its place;
//   `typesEmpty` and `patternsEmpty` are the sentences of a list with no row.
// - `choices` are the types to choose from in the two pattern forms, and `typeHint` says,
//   while no type exists, that one must be created first.
// - `typeField` and `patternFields` are what the two forms that create are filled with:
//   another object only when the form is to be filled again.
// - `typeCreate`, `rename`, `patternCreate` and `change` are the outcomes of the four writes.
export type AvailabilityState = {
  loading: boolean;
  typesUnread: string | null;
  types: readonly TypeRow[] | null;
  typesEmpty: string | null;
  patternsUnread: string | null;
  groups: readonly PatternGroup[] | null;
  patternsEmpty: string | null;
  choices: readonly Choice[];
  typeHint: string;
  typeField: { name: string };
  patternFields: PatternFields;
  typeCreate: Ask<'name'>;
  rename: Ask<'name'>;
  patternCreate: Ask<PatternField>;
  change: Ask<PatternField>;
};

// What the screen knows that the part of a single date needs too (the DateScreen): the
// calendar's time zone, null until the settings are read, with why they could not be read,
// null while they are being read; the types as last read, for their names and for the choices
// of a list; the patterns as last read, null after a read that failed.
export type Known = { zone: string | null; zoneWhy: string | null; types: readonly AvailabilityType[] | null; patterns: readonly WeeklyPattern[] | null };
const NOT_KNOWN: Known = { zone: null, zoneWhy: null, types: null, patterns: null };

// What the screen uses of the three services: the reads, the four writes it checks, and the
// results of every write. The two deletes themselves are called by the view, from its dialog.
export type AvailabilitySettings = Pick<CalendarSettingsService, 'load' | 'settingsResult$'>;
export type AvailabilityTypes = Pick<AvailabilityTypesService, 'load' | 'typesResult$' | 'create' | 'createResult$' | 'rename' | 'renameResult$' | 'removeResult$'>;
export type AvailabilityRules = Pick<
  AvailabilityRulesService,
  'loadPatterns' | 'patternsResult$' | 'createPattern' | 'createPatternResult$' | 'updatePattern' | 'updatePatternResult$' | 'deletePatternResult$'
>;

// The result of one of the four writes, as far as the screen reads it.
type Outcome = { status: 'success' } | { status: 'failure'; reason: string; conflicts?: AppointmentConflict[] };
type Read = 'settings' | 'types' | 'patterns';

export const QUIET: Ask<never> = { about: '', busy: false, refusals: {}, failure: null, conflicts: null, done: false };
const NOTHING: AvailabilityState = {
  loading: false,
  typesUnread: null,
  types: null,
  typesEmpty: null,
  patternsUnread: null,
  groups: null,
  patternsEmpty: null,
  choices: [],
  typeHint: '',
  typeField: { name: '' },
  patternFields: startingFields(null),
  typeCreate: QUIET,
  rename: QUIET,
  patternCreate: QUIET,
  change: QUIET,
};

// What was read again when it is what is on show keeps the object on show, so that the view
// redraws nothing and the keyboard stays where it is. Rows and choices are plain data.
export const kept = <T>(shown: T, read: T): T => (JSON.stringify(shown) === JSON.stringify(read) ? shown : read);

export class AvailabilityScreen {
  private started = false;
  private readonly reading = new Set<Read>();
  // The calendar's time zone, from the settings; null until they are read. And why not.
  private zone: string | null = null;
  private zoneWhy: string | null = null;
  // The types on show, null after a read that failed, and the types as last read, which stay
  // for the names in the patterns' rows and for the choices of the pattern forms.
  private listed: AvailabilityType[] | null = null;
  private known: AvailabilityType[] | null = null;
  private typesWhy: string | null = null;
  private patterns: WeeklyPattern[] | null = null;
  private patternsWhy: string | null = null;
  private readonly state = new BehaviorSubject<AvailabilityState>(NOTHING);
  readonly availability$: Observable<AvailabilityState> = this.state.asObservable();
  // What is known, for the part of a single date: notified after every read that was
  // answered, and with nothing known when the subscription of start() ends.
  private readonly knownSubject = new BehaviorSubject<Known>(NOT_KNOWN);
  readonly known$: Observable<Known> = this.knownSubject.asObservable();

  // `now` gives the present moment, for "today"; `visible$` notifies each time the page
  // becomes visible again: nothing here reads the clock or the document by itself
  // (docs/FRONTEND_ARCHITECTURE.md section 5, rule 1).
  constructor(
    private readonly settings: AvailabilitySettings,
    private readonly types: AvailabilityTypes,
    private readonly rules: AvailabilityRules,
    private readonly now: () => Date,
    private readonly visible$: Observable<unknown>,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the settings, for the calendar's time zone, the types and the patterns, and from then on
  // takes the writes, until the subscription returned ends. Until then it also reads again:
  // - the types at every result of a create, a rename and a delete of a type, and the patterns
  //   at every result of a create, a change and a delete of a pattern, a failure included:
  //   after a failed write the server may still have applied it
  //   (docs/SHARED_CALENDAR_SPEC.md section 16.3);
  // - both lists every time the page becomes visible.
  // The end of the subscription forgets everything: the next start reads again.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start, perhaps for another screen, and is not heard.
    let live = false;
    const subscription = new Subscription();
    const hear = <R>(result$: Observable<R>, then: (result: R) => void) =>
      subscription.add(
        result$.subscribe((result) => {
          if (live) then(result);
        }),
      );

    hear(this.settings.settingsResult$, (result) => {
      const first = this.zone === null && result.status === 'success';
      if (result.status === 'success') this.zone = result.settings.timeZone;
      this.zoneWhy = result.status === 'failure' ? failureText(result.reason) : null;
      // The form that creates a pattern starts on today, once the zone says which day that is.
      this.haveRead('settings', first ? { patternFields: startingFields(this.today()) } : {});
    });
    hear(this.types.typesResult$, (result) => {
      this.listed = result.status === 'success' ? result.types : null;
      this.known = this.listed ?? this.known;
      this.typesWhy = result.status === 'failure' ? failureText(result.reason) : null;
      this.haveRead('types');
    });
    hear(this.rules.patternsResult$, (result) => {
      this.patterns = result.status === 'success' ? result.patterns : null;
      this.patternsWhy = result.status === 'failure' ? failureText(result.reason) : null;
      this.haveRead('patterns');
    });

    // The four writes that went through the check. On a success of a create its form is to be
    // filled again with its starting values; on a failure what was typed stays.
    hear(this.types.createResult$, (result) => {
      this.answer('typeCreate', result, 'type', result.status === 'success' ? { typeField: { name: '' } } : {});
      this.read('types');
    });
    hear(this.types.renameResult$, (result) => {
      this.answer('rename', result, 'type');
      this.read('types');
    });
    hear(this.rules.createPatternResult$, (result) => {
      this.answer('patternCreate', result, 'pattern', result.status === 'success' ? { patternFields: startingFields(this.today()) } : {});
      this.afterPattern(result);
    });
    hear(this.rules.updatePatternResult$, (result) => {
      this.answer('change', result, 'pattern');
      this.afterPattern(result);
    });
    // The two deletes, which the view calls.
    hear(this.types.removeResult$, () => this.read('types'));
    hear(this.rules.deletePatternResult$, (result) => this.afterPattern(result));
    hear(this.visible$, () => this.readAll());

    subscription.add(() => {
      this.started = false;
      this.reading.clear();
      this.zone = this.zoneWhy = this.typesWhy = this.patternsWhy = null;
      this.listed = this.known = this.patterns = null;
      this.state.next(NOTHING);
      this.knownSubject.next(NOT_KNOWN);
    });
    live = true;
    this.started = true;
    this.read('settings');
    this.readAll();
    return subscription;
  }

  // Reads the types again after a read that failed: the way to try again.
  retryTypes(): void {
    if (this.started) this.read('types');
  }

  // Reads the patterns again after a read that failed, and the settings too while the
  // calendar's time zone is not known: the list of patterns needs both.
  retryPatterns(): void {
    if (this.started) this.readAll('patterns');
  }

  // "Create type", with the name field as the form holds it. A text that is not a name is
  // said and nothing is sent (docs/SHARED_CALENDAR_SPEC.md R-TYPE-01).
  createType(text: string): void {
    this.named('typeCreate', '', text, (name) => this.types.create(name));
  }

  // "Rename", from its dialog, with the name field as it holds it. A rename to the same name
  // is sent like any other (docs/SHARED_CALENDAR_SPEC.md R-TYPE-02).
  rename(typeId: string, text: string): void {
    this.named('rename', typeId, text, (name) => this.types.rename(typeId, name));
  }

  // "Create pattern", with the six fields as the form holds them. Every field in fault is
  // said and nothing is sent (docs/SHARED_CALENDAR_SPEC.md section 6.2).
  createPattern(fields: PatternFields): void {
    this.patterned('patternCreate', '', fields, (pattern) => this.rules.createPattern(pattern));
  }

  // "Change", from its dialog: one call that replaces the pattern's fields
  // (docs/SHARED_CALENDAR_SPEC.md R-PAT-03).
  change(patternId: string, fields: PatternFields): void {
    this.patterned('change', patternId, fields, (pattern) => this.rules.updatePattern(patternId, pattern));
  }

  // The appointments in the way that a failure names, ready to draw in the calendar's time
  // zone, for the view's own call, the delete of a pattern; null when it names none, and
  // while the zone is not known.
  conflicts(conflicts: readonly AppointmentConflict[] | undefined): ConflictList | null {
    return this.zone === null ? null : conflictList(conflicts, this.zone);
  }

  // A write with a name. While one of its kind is under way another is not taken.
  private named(ask: 'typeCreate' | 'rename', about: string, text: string, call: (name: string) => void): void {
    if (!this.started || this.state.getValue()[ask].busy) return;
    const checked = typeNameFor(text);
    if ('refusal' in checked) {
      this.patch({ [ask]: { ...QUIET, about, refusals: { name: checked.refusal } } });
      return;
    }
    this.patch({ [ask]: { ...QUIET, about, busy: true } });
    call(checked.name);
  }

  // A write with a pattern's fields. While one of its kind is under way another is not taken.
  private patterned(ask: 'patternCreate' | 'change', about: string, fields: PatternFields, call: (pattern: PatternBody) => void): void {
    if (!this.started || this.state.getValue()[ask].busy) return;
    const checked = patternFor(fields);
    if ('refusals' in checked) {
      this.patch({ [ask]: { ...QUIET, about, refusals: checked.refusals } });
      return;
    }
    this.patch({ [ask]: { ...QUIET, about, busy: true } });
    call(checked.pattern);
  }

  // The outcome of a write, for the form or the dialog that asked for it: done, or why not in
  // plain words, with the appointments in the way when the server named some.
  private answer(ask: AskName, result: Outcome, attempt: Attempt, more: Partial<AvailabilityState> = {}): void {
    // The answer is of the call under way, which is the one the state is about.
    const about = this.state.getValue()[ask].about;
    const outcome = result.status === 'success' ? { ...QUIET, about, done: true } : { ...QUIET, about, failure: failureText(result.reason, attempt), conflicts: this.conflicts(result.conflicts) };
    this.patch({ [ask]: outcome, ...more });
  }

  // After a write to a pattern, whatever its outcome, the patterns are read again; and the
  // types too when the server says that the pattern's type no longer exists: the list of types
  // on show is then an old one.
  private afterPattern(result: Outcome): void {
    this.read('patterns');
    if (result.status === 'failure' && result.reason === 'type_not_found') this.read('types');
  }

  private today(): string | null {
    return this.zone === null ? null : localDateOf(this.now().toISOString(), this.zone);
  }

  private read(what: Read): void {
    this.reading.add(what);
    this.patch({ loading: true });
    if (what === 'settings') this.settings.load();
    else if (what === 'types') this.types.load();
    else this.rules.loadPatterns();
  }

  // Both lists, or only `only`; and the settings while the calendar's time zone is not known.
  private readAll(only?: 'patterns'): void {
    if (this.zone === null && !this.reading.has('settings')) this.read('settings');
    if (only === undefined) this.read('types');
    this.read('patterns');
  }

  // A read was answered: the lists are made again from what is now known. The patterns' rows
  // need the calendar's "today" and take their types' names from the types as last read, so a
  // rename changes them with no read of the patterns.
  private haveRead(what: Read, more: Partial<AvailabilityState> = {}): void {
    this.reading.delete(what);
    this.knownSubject.next({ zone: this.zone, zoneWhy: this.zoneWhy, types: this.known, patterns: this.patterns });
    const shown = this.state.getValue();
    const today = this.today();
    const types = this.listed === null ? null : kept(shown.types, typeRows(this.listed));
    const groups = this.patterns === null || today === null ? null : kept(shown.groups, patternGroups(this.patterns, this.known, today));
    this.patch({
      loading: this.reading.size > 0,
      typesUnread: this.typesWhy,
      types,
      typesEmpty: types?.length === 0 ? NO_TYPES : null,
      patternsUnread: this.patternsWhy ?? this.zoneWhy,
      groups,
      patternsEmpty: groups?.length === 0 ? NO_PATTERNS : null,
      choices: kept(shown.choices, typeChoices(this.known ?? [])),
      typeHint: this.listed?.length === 0 ? NO_TYPE_YET : '',
      ...more,
    });
  }

  private patch(change: Partial<AvailabilityState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
