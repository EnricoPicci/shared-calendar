import { CALENDAR_LIMITS, lastsWholeHours, LocalDate, TYPE_CAPACITY, TypeName, type AvailabilityType, type PatternBody, type WeeklyPattern } from '@shared-calendar/shared';
import type { PageTexts } from '../texts/texts';

// The availability screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the availability types
// and the weekly patterns as the API answers them (docs/SHARED_CALENDAR_SPEC.md sections 6.1
// and 6.2) turned into rows ready to draw, the choices of the pattern form's lists, from what
// a form holds to the argument of a call or to why not, and the words of the dialog that
// confirms a deletion. Pure: the words are the page texts', handed in first. What only the server knows is not checked here: a name that
// exists, an overlap, a conflict, a limit.

// ── The types ───────────────────────────────────────────────────────────────────────────────

// The two fields of a type, as text: what the form that creates one and the dialog that edits
// one hold.
export type TypeFields = { name: string; capacity: string };
// What the form that creates a type starts with: no name, and the default capacity
// (docs/SHARED_CALENDAR_SPEC.md decision D24).
export const STARTING_TYPE: TypeFields = { name: '', capacity: String(TYPE_CAPACITY.default) };

// A row of the list of types: the name; its places beside it, "· 3 places", only for a
// capacity above one, which is every type's until it is changed; the names a screen reader says
// for its two buttons, which tell which type they edit and delete; and its fields for the
// dialog that edits it.
export type TypeRow = { typeId: string; name: string; places: string; editLabel: string; deleteLabel: string; fields: TypeFields };

// The rows, in the order the server gives: by name (docs/FRONTEND_SERVICES.md section 16.1).
export function typeRows(texts: PageTexts, types: readonly AvailabilityType[]): TypeRow[] {
  const words = texts.availability;
  return types.map(({ typeId, name, capacity }) => ({
    typeId,
    name,
    places: capacity > 1 ? `· ${words.places(capacity)}` : '',
    editLabel: words.editLabel(name),
    deleteLabel: words.deleteLabel(name),
    fields: { name, capacity: String(capacity) },
  }));
}

// What a type's name is (docs/SHARED_CALENDAR_SPEC.md section 6.1). The words stand under the
// field as its hint and are also the refusal of a text that is not one. What decides is the
// shared schema, below; the length is the one of shared/.
export function typeNameHint(texts: PageTexts): string {
  return texts.availability.typeNameHint(CALENDAR_LIMITS.typeNameLength);
}

// From what the name field holds to the name to create or to rename to, or to the refusal of
// the field. Spaces around the name are removed, by the schema; nothing else is changed. A
// name that exists already, whatever its capitals, is the server's to say.
export function typeNameFor(texts: PageTexts, text: string): { name: string } | { refusal: string } {
  const parsed = TypeName.safeParse(text);
  return parsed.success ? { name: parsed.data } : { refusal: typeNameHint(texts) };
}

// What a type's capacity is (docs/SHARED_CALENDAR_SPEC.md decision D24), with the shared
// bounds: the hint under the field, and the refusal of a text that is not one.
export function typeCapacityHint(texts: PageTexts): string {
  return texts.availability.typeCapacityHint(TYPE_CAPACITY.min, TYPE_CAPACITY.max);
}

// From what the two fields hold to the name and the capacity to send, or to the refusals of
// the fields in fault, both said when both are. The capacity is written with digits only,
// spaces around it aside, so that a fraction, an empty field and a text are refused, and it is
// within the shared bounds. Both are always sent: the capacity the field holds, never left to the server.
export function typeFor(texts: PageTexts, fields: TypeFields): { type: { name: string; capacity: number } } | { refusals: Partial<Record<keyof TypeFields, string>> } {
  const name = typeNameFor(texts, fields.name);
  const text = fields.capacity.trim();
  const capacity = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  const refusals: Partial<Record<keyof TypeFields, string>> = {};
  if ('refusal' in name) refusals.name = name.refusal;
  if (!(capacity >= TYPE_CAPACITY.min && capacity <= TYPE_CAPACITY.max)) refusals.capacity = typeCapacityHint(texts);
  return 'name' in name && refusals.capacity === undefined ? { type: { name: name.name, capacity } } : { refusals };
}

// What the dialog asks before a type is deleted.
export function deleteTypeQuestion(texts: PageTexts, row: TypeRow): string {
  return texts.availability.deleteType(row.name);
}

// ── The choices of the pattern form ─────────────────────────────────────────────────────────

// A choice of a list: what is sent, and what a person reads.
export type Choice = { value: string; label: string };

// The weekdays as the API numbers them, Monday 1 to Sunday 7.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// The weekdays, Monday to Sunday, with their names in the page's language. The two times of the
// form are an hour and a minute each, offered by src/logic/times.ts.
export function weekdayChoices(texts: PageTexts): Choice[] {
  return WEEKDAYS.map((weekday) => ({ value: String(weekday), label: texts.dates.weekdayName(weekday) }));
}

// The types to choose from, by name, in the server's order.
export function typeChoices(types: readonly AvailabilityType[]): Choice[] {
  return types.map(({ typeId, name }) => ({ value: typeId, label: name }));
}

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

// The refusal of a window's two times, or none: an end not after its start (two times of one
// day, written alike: the later one is the greater text, "24:00" included), and only when it is
// after it, an end that is not a whole number of hours later (lastsWholeHours of shared/), so
// one sentence is said. A window lasts a whole number of hours
// (docs/SHARED_CALENDAR_SPEC.md decision D33): the end's lists offer nothing else, but a window
// stored before the rule can still be opened in a form.
export function endRefusal(texts: PageTexts, start: string, end: string): string | undefined {
  if (end <= start) return texts.availability.endNotLater;
  return lastsWholeHours(start, end) ? undefined : texts.availability.endNotWholeHours;
}

// From what the form holds to the body of a create or of a change, or to the refusals: one
// sentence per field in fault, each naming its field in the words of its label, and every
// field in fault said. The weekday and the two times come from lists that hold nothing off the
// step; an end not after its start, or not a whole number of hours after it, is the one fault
// two times can have; the shared schema, through the service, has the last word on the body
// (docs/FRONTEND_SERVICES.md section 17.4).
export function patternFor(texts: PageTexts, fields: PatternFields): { pattern: PatternBody } | { refusals: Partial<Record<PatternField, string>> } {
  const refusals: Partial<Record<PatternField, string>> = {};
  const words = texts.availability;
  const end = endRefusal(texts, fields.start, fields.end);
  if (end !== undefined) refusals.end = end;
  if (fields.typeId === '') refusals.typeId = words.typeNotChosen;
  if (!isDate(fields.validFrom)) refusals.validFrom = words.validFromNotDate;
  if (fields.validUntil !== '') {
    if (!isDate(fields.validUntil)) refusals.validUntil = words.validUntilNotDate;
    // Two dates written alike: the earlier one is the smaller text.
    else if (isDate(fields.validFrom) && fields.validUntil < fields.validFrom) refusals.validUntil = words.validUntilBefore;
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

// The patterns grouped by weekday, Monday to Sunday, a weekday with no pattern left out; in a
// group by start, then by end, then by the first date of validity. Every pattern the server
// returns is there: one whose validity ended before `today`, the calendar's own, is marked,
// not hidden, since a type cannot be deleted while any pattern uses it
// (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03). A pattern that ends today has not ended
// (docs/SHARED_CALENDAR_SPEC.md section 6.2: `validUntil` is inclusive). The type's name is
// joined from `types`, the list of types as last read, or null while there is none; a type that
// list does not hold is "Unknown type", since the two lists are read at different moments.
export function patternGroups(texts: PageTexts, patterns: readonly WeeklyPattern[], types: readonly AvailabilityType[] | null, today: string): PatternGroup[] {
  const words = texts.availability;
  const names = new Map((types ?? []).map((type) => [type.typeId, type.name]));
  const order = (a: WeeklyPattern, b: WeeklyPattern) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.validFrom.localeCompare(b.validFrom);
  return WEEKDAYS.map((number) => {
    const weekday = texts.dates.weekdayName(number);
    const rows = patterns
      .filter((pattern) => pattern.weekday === number)
      .sort(order)
      .map((pattern): PatternRow => {
        const time = `${pattern.start} – ${pattern.end}`;
        const typeName = names.get(pattern.typeId) ?? words.unknownType;
        const what = `${weekday} ${time} ${typeName}`;
        const from = texts.dates.longDate(pattern.validFrom);
        return {
          patternId: pattern.patternId,
          time,
          typeName,
          validity: pattern.validUntil === null ? words.validFrom(from) : words.validFromTo(from, texts.dates.longDate(pattern.validUntil)),
          ended: pattern.validUntil !== null && pattern.validUntil < today,
          what,
          changeLabel: words.changeLabel(what),
          deleteLabel: words.deleteLabel(what),
          fields: patternFields(pattern),
        };
      });
    return { weekday, rows };
  }).filter((group) => group.rows.length > 0);
}

// What the dialog asks before a pattern is deleted.
export function deletePatternQuestion(texts: PageTexts, row: PatternRow): string {
  return texts.availability.deletePattern(row.what, row.validity);
}
