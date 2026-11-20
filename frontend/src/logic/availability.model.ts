import { CALENDAR_LIMITS, LocalDate, TypeName, type AvailabilityType, type PatternBody, type WeeklyPattern } from '@shared-calendar/shared';
import { longDateText } from './texts';

// The availability screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the availability types
// and the weekly patterns as the API answers them (docs/SHARED_CALENDAR_SPEC.md sections 6.1
// and 6.2) turned into rows ready to draw, the choices of the pattern form's lists, from what
// a form holds to the argument of a call or to why not, and the words of the dialog that
// confirms a deletion. Pure. What only the server knows is not checked here: a name that
// exists, an overlap, a conflict, a limit.

// ── The types ───────────────────────────────────────────────────────────────────────────────

// A row of the list of types: the name, and the names a screen reader says for its two
// buttons, which tell which type they rename and delete.
export type TypeRow = { typeId: string; name: string; renameLabel: string; deleteLabel: string };

// The rows, in the order the server gives: by name (docs/FRONTEND_SERVICES.md section 16.1).
export function typeRows(types: readonly AvailabilityType[]): TypeRow[] {
  return types.map(({ typeId, name }) => ({ typeId, name, renameLabel: `Rename ${name}`, deleteLabel: `Delete ${name}` }));
}

// The sentence of a list of types with no row.
export const NO_TYPES = 'There are no types yet.';

// What a type's name is (docs/SHARED_CALENDAR_SPEC.md section 6.1). The words stand under the
// field as its hint and are also the refusal of a text that is not one. What decides is the
// shared schema, below; the length is the one of shared/.
export const TYPE_NAME_HINT = `A name has 1 to ${CALENDAR_LIMITS.typeNameLength} characters, with no tab in it.`;

// From what the name field holds to the name to create or to rename to, or to the refusal of
// the field. Spaces around the name are removed, by the schema; nothing else is changed. A
// name that exists already, whatever its capitals, is the server's to say.
export function typeNameFor(text: string): { name: string } | { refusal: string } {
  const parsed = TypeName.safeParse(text);
  return parsed.success ? { name: parsed.data } : { refusal: TYPE_NAME_HINT };
}

// What the dialog asks before a type is deleted.
export function deleteTypeQuestion(row: TypeRow): string {
  return `Delete the type ${row.name}? This cannot be undone.`;
}

// ── The choices of the pattern form ─────────────────────────────────────────────────────────

// A choice of a list: what is sent, and what a person reads.
export type Choice = { value: string; label: string };

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_MINUTES = 24 * 60;
const GRID = 15; // a window starts and ends on 15-minute steps (docs/SHARED_CALENDAR_SPEC.md section 6.2)
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const steps = (from: number, to: number) => Array.from({ length: (to - from) / GRID + 1 }, (_, i) => clock(from + i * GRID)).map((time) => ({ value: time, label: time }));

// The weekdays, Monday to Sunday, as the API numbers them: 1 to 7.
export const WEEKDAY_CHOICES: readonly Choice[] = WEEKDAYS.map((label, i) => ({ value: String(i + 1), label }));
// The local times a window may start at, 00:00 to 23:45, and end at, 00:15 to 24:00: nothing
// off the grid can be chosen.
export const START_CHOICES: readonly Choice[] = steps(0, DAY_MINUTES - GRID);
export const END_CHOICES: readonly Choice[] = steps(GRID, DAY_MINUTES);

// The types to choose from, by name, in the server's order.
export function typeChoices(types: readonly AvailabilityType[]): Choice[] {
  return types.map(({ typeId, name }) => ({ value: typeId, label: name }));
}

// Said under the list of types of the pattern form while no type exists.
export const NO_TYPE_YET = 'Create a type first: a pattern needs one.';

// ── The pattern form ────────────────────────────────────────────────────────────────────────

// The six fields of a pattern, in the form's order, and what they hold, as text. `validUntil`
// is empty for a pattern with no end.
export const PATTERN_FIELDS = ['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil'] as const;
export type PatternField = (typeof PATTERN_FIELDS)[number];
export type PatternFields = Record<PatternField, string>;

// What the form that creates a pattern starts with: Monday, 09:00 to 10:00, no type chosen,
// valid from `today` (the calendar's own, empty while it is not known) with no end. "Today"
// is a convenience, not a rule: a pattern may start in the past
// (docs/SHARED_CALENDAR_SPEC.md R-PAT-03).
export function startingFields(today: string | null): PatternFields {
  return { weekday: '1', start: '09:00', end: '10:00', typeId: '', validFrom: today ?? '', validUntil: '' };
}

// The fields of an existing pattern, as the dialog that changes it shows them.
export function patternFields(pattern: PatternBody): PatternFields {
  return {
    weekday: String(pattern.weekday),
    start: pattern.start,
    end: pattern.end,
    typeId: pattern.typeId,
    validFrom: pattern.validFrom,
    validUntil: pattern.validUntil ?? '',
  };
}

const isDate = (text: string) => LocalDate.safeParse(text).success;

// The two refusals of a window's fields, which a pattern, a window of one date's own and an
// extra window share: each starts with the words of its field's label.
export const END_NOT_LATER = 'End must be later than Start.';
export const TYPE_NOT_CHOSEN = 'Type must be chosen.';

// From what the form holds to the body of a create or of a change, or to the refusals: one
// sentence per field in fault, each naming its field in the words of its label, and every
// field in fault said. The weekday and the two times come from lists that hold nothing wrong;
// the shared schema, through the service, has the last word on the body
// (docs/FRONTEND_SERVICES.md section 17.4).
export function patternFor(fields: PatternFields): { pattern: PatternBody } | { refusals: Partial<Record<PatternField, string>> } {
  const refusals: Partial<Record<PatternField, string>> = {};
  // Two times of one day, written alike: the later one is the greater text, "24:00" included.
  if (fields.end <= fields.start) refusals.end = END_NOT_LATER;
  if (fields.typeId === '') refusals.typeId = TYPE_NOT_CHOSEN;
  if (!isDate(fields.validFrom)) refusals.validFrom = 'Valid from must be a date.';
  if (fields.validUntil !== '') {
    if (!isDate(fields.validUntil)) refusals.validUntil = 'Valid until must be a date, or left empty.';
    // Two dates written alike: the earlier one is the smaller text.
    else if (isDate(fields.validFrom) && fields.validUntil < fields.validFrom) refusals.validUntil = 'Valid until must not be before Valid from.';
  }
  if (Object.keys(refusals).length > 0) return { refusals };
  return {
    pattern: {
      weekday: Number(fields.weekday),
      start: fields.start,
      end: fields.end,
      typeId: fields.typeId,
      validFrom: fields.validFrom,
      validUntil: fields.validUntil === '' ? null : fields.validUntil,
    },
  };
}

// ── The patterns ────────────────────────────────────────────────────────────────────────────

// A row of the list of patterns: its hours, the name of its type, its validity in words,
// whether that validity has ended, what the pattern is in one line (for the names of its two
// buttons and for the dialog that deletes it), and its fields for the dialog that changes it.
export type PatternRow = {
  patternId: string;
  time: string;
  typeName: string;
  validity: string;
  ended: boolean;
  what: string;
  changeLabel: string;
  deleteLabel: string;
  fields: PatternFields;
};

// The patterns of one weekday, under its name.
export type PatternGroup = { weekday: string; rows: PatternRow[] };

// The sentence of a list of patterns with no row, and the word in the place of the name of a
// type that the list of types does not hold: the two lists are read at different moments.
export const NO_PATTERNS = 'There are no weekly patterns yet.';
export const UNKNOWN_TYPE = 'Unknown type';

// The patterns grouped by weekday, Monday to Sunday, a weekday with no pattern left out; in a
// group by start, then by end, then by the first date of validity. Every pattern the server
// returns is there: one whose validity ended before `today`, the calendar's own, is marked,
// not hidden, since a type cannot be deleted while any pattern uses it
// (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03). A pattern that ends today has not ended
// (docs/SHARED_CALENDAR_SPEC.md section 6.2: `validUntil` is inclusive). The type's name is
// joined from `types`, the list of types as last read, or null while there is none.
export function patternGroups(patterns: readonly WeeklyPattern[], types: readonly AvailabilityType[] | null, today: string): PatternGroup[] {
  const names = new Map((types ?? []).map((type) => [type.typeId, type.name]));
  const order = (a: WeeklyPattern, b: WeeklyPattern) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.validFrom.localeCompare(b.validFrom);
  return WEEKDAYS.map((weekday, i) => {
    const rows = patterns
      .filter((pattern) => pattern.weekday === i + 1)
      .sort(order)
      .map((pattern): PatternRow => {
        const time = `${pattern.start} – ${pattern.end}`;
        const typeName = names.get(pattern.typeId) ?? UNKNOWN_TYPE;
        const what = `${weekday} ${time} ${typeName}`;
        const from = `from ${longDateText(pattern.validFrom)}`;
        return {
          patternId: pattern.patternId,
          time,
          typeName,
          validity: pattern.validUntil === null ? from : `${from} to ${longDateText(pattern.validUntil)}`,
          ended: pattern.validUntil !== null && pattern.validUntil < today,
          what,
          changeLabel: `Change ${what}`,
          deleteLabel: `Delete ${what}`,
          fields: patternFields(pattern),
        };
      });
    return { weekday, rows };
  }).filter((group) => group.rows.length > 0);
}

// What the dialog asks before a pattern is deleted.
export function deletePatternQuestion(row: PatternRow): string {
  return `Delete the pattern ${row.what}, ${row.validity}? Its hours will no longer be open for booking. This cannot be undone.`;
}
