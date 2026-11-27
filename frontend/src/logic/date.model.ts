import {
  CALENDAR_LIMITS,
  definedWindows,
  LocalDate,
  localDateOf,
  localTimeOf,
  overlaps,
  type AvailabilityType,
  type CalendarDay,
  type OneOffWindowBody,
  type WeeklyPattern,
  type WindowBody,
} from '@shared-calendar/shared';
import type { PageTexts } from '../texts/texts';
import { endRefusal } from './availability.model';

// A single date of the availability screen (docs/FRONTEND_ARCHITECTURE.md section 5.1): the
// check of the date chosen, the day as the weekly patterns give it and as it is now, the
// windows of "this day only" while they are being put together, an extra window's body, and
// the words of the three questions. Pure: the words are the page texts', handed in first. A date override and a one-off window
// (docs/SHARED_CALENDAR_SPEC.md sections 6.3 and 6.4) are called here, as on the page, a day's
// own windows and an extra window.

// ── The date ────────────────────────────────────────────────────────────────────────────────

// From what the date field holds to the date to show, or to why not, said under the field. A
// date before `today`, the calendar's own, cannot be changed (docs/SHARED_CALENDAR_SPEC.md
// R-AV-02) and is not read; today itself is accepted. Two dates written alike: the earlier one
// is the smaller text. Two other refusals are the screen's: while the calendar's time zone is
// still being read ("today" is not known), and while the windows of "this day only" are being put
// together.
export function dateFor(texts: PageTexts, text: string, today: string): { date: string } | { refusal: string } {
  if (!LocalDate.safeParse(text).success) return { refusal: texts.date.dateNeeded };
  return text < today ? { refusal: texts.date.pastDate } : { date: text };
}

// ── The day ─────────────────────────────────────────────────────────────────────────────────

// A window of a day as a line: its hours, written as a pattern's are, and the name of its type.
export type WindowRow = { time: string; typeName: string };
// An extra window: the same, with its id, the name of its "Delete" button for a screen reader
// and what the dialog asks before it is deleted.
export type ExtraRow = WindowRow & { windowId: string; deleteLabel: string; question: string };

// What the part shows for a date.
// - `patterns` is the day as the weekly patterns give it, and `patternsNone` the sentence in
//   the place of an empty list.
// - `which` says which of the three the day is now: the patterns apply, it has its own
//   windows, or it is not available; `own` are its own windows; `extras` its extra windows,
//   `extrasNone` the sentence of none.
// - `hasOverride` says whether "Back to the weekly patterns" is offered; the two questions
//   are what the dialog asks before the day is made not available and before it goes back.
export type DayModel = {
  date: string;
  patterns: WindowRow[];
  patternsNone: string | null;
  which: string;
  own: WindowRow[];
  extras: ExtraRow[];
  extrasNone: string | null;
  hasOverride: boolean;
  closeQuestion: string;
  reopenQuestion: string;
};

const hours = (window: { start: string; end: string }) => `${window.start} – ${window.end}`;

// A window of the calendar view, whose times are instants, as local times of its date in the
// calendar's zone; an end at the midnight that closes the date is "24:00", the way the end of
// a window is written (docs/SHARED_CALENDAR_SPEC.md R-TIME-02).
function localWindow(date: string, window: { start: string; end: string }, zone: string): { start: string; end: string } {
  return { start: localTimeOf(window.start, zone), end: localDateOf(window.end, zone) > date ? '24:00' : localTimeOf(window.end, zone) };
}

// The day, from what is known and what was read.
// - As the weekly patterns give it: `shared/`'s `definedWindows` over `patterns`, with no
//   override and no one-off window (docs/SHARED_CALENDAR_SPEC.md section 6.5); the names from
//   `types`. `patterns` is null while the list of patterns could not be read.
// - As it is now: `day`, the date's day of the Administrator's calendar view, whose windows
//   say where they come from (docs/SHARED_CALENDAR_SPEC.md section 11.6), in `zone`. A window
//   with no `source` (a User's view, which cannot arrive here) is in neither list, and a day
//   with no `hasOverride` has none.
export function dayModel(
  texts: PageTexts,
  date: string,
  patterns: readonly WeeklyPattern[] | null,
  types: readonly AvailabilityType[] | null,
  day: CalendarDay,
  zone: string,
): DayModel {
  const said = texts.date;
  const unknown = texts.availability.unknownType;
  const names = new Map((types ?? []).map((type) => [type.typeId, type.name]));
  // The date with its weekday and its year: "Monday 23 November 2026".
  const words = texts.dates.fullDate(date);
  const given = definedWindows(date, patterns ?? [], null, []).map((window) => ({ time: hours(window), typeName: names.get(window.typeId) ?? unknown }));
  const from = (source: string) => day.windows.filter((window) => window.source === source).map((window) => ({ ...window, time: hours(localWindow(date, window, zone)) }));
  const hasOverride = day.hasOverride === true;
  const own = from('override').map(({ time, typeName }) => ({ time, typeName }));
  const extras = from('one_off').map(({ time, typeName, sourceId }) => ({
    windowId: sourceId ?? '',
    time,
    typeName,
    deleteLabel: said.deleteExtraLabel(time, typeName),
    question: said.deleteExtraQuestion(time, typeName, words),
  }));
  return {
    date: words,
    patterns: given,
    patternsNone: patterns === null ? said.patternsNotKnown : given.length === 0 ? said.noPatternHours : null,
    which: !hasOverride ? said.patternsApply : own.length > 0 ? said.ownWindows : said.notAvailable,
    own,
    extras,
    extrasNone: extras.length === 0 ? said.noExtras : null,
    hasOverride,
    closeQuestion: said.closeQuestion(words),
    reopenQuestion: said.reopenQuestion(words),
  };
}

// ── "This day only": the windows being put together ─────────────────────────────────────────

// The three fields of a window, in the form's order, and what they hold, as text.
export const WINDOW_FIELDS = ['start', 'end', 'typeId'] as const;
export type WindowField = (typeof WINDOW_FIELDS)[number];
export type WindowFields = Record<WindowField, string>;

// What a form that adds a window starts with, and goes back to after it added one: 09:00 to
// 10:00, no type chosen, so that a type is always chosen on purpose.
export const STARTING_WINDOW: WindowFields = { start: '09:00', end: '10:00', typeId: '' };

const byStart = (a: WindowBody, b: WindowBody) => a.start.localeCompare(b.start);

// The windows "this day only" starts from: those of the day on show that are not extra ones,
// which are the day's own when it has some and otherwise those the weekly patterns give it,
// as local times, by start. A window that holds no time on the clock is left out: on the
// night the clocks go forward one written inside the missing hour reads back with its end not
// after its start (docs/SHARED_CALENDAR_SPEC.md R-TIME-03), and could not be sent.
export function startingWindows(date: string, day: CalendarDay, zone: string): WindowBody[] {
  return day.windows
    .filter((window) => window.source === 'pattern' || window.source === 'override')
    .map((window) => ({ ...localWindow(date, window, zone), typeId: window.typeId }))
    .filter((window) => window.start < window.end)
    .sort(byStart);
}

// A row of the windows being put together: its hours, its type, and the name of its "Remove"
// button for a screen reader. `empty` is the sentence of a list with no row.
export type DraftRow = WindowRow & { removeLabel: string };
export type DraftModel = { rows: DraftRow[]; empty: string | null };

export function draftModel(texts: PageTexts, windows: readonly WindowBody[], types: readonly AvailabilityType[] | null): DraftModel {
  const names = new Map((types ?? []).map((type) => [type.typeId, type.name]));
  const rows = windows.map((window) => {
    const row = { time: hours(window), typeName: names.get(window.typeId) ?? texts.availability.unknownType };
    return { ...row, removeLabel: texts.date.removeLabel(row.time, row.typeName) };
  });
  return { rows, empty: rows.length === 0 ? texts.date.draftEmpty : null };
}

// A field in fault that has no sentence of its own: another field's sentence names it. The
// form marks it and writes nothing under it.
export const IN_FAULT_TOO = '';

// The refusals of the three fields by themselves: the end not after the start, or not a whole
// number of hours after it (endRefusal of src/logic/availability.model.ts), and no type.
function fieldRefusals(texts: PageTexts, fields: WindowFields): Partial<Record<WindowField, string>> {
  const refusals: Partial<Record<WindowField, string>> = {};
  const end = endRefusal(texts, fields.start, fields.end);
  if (end !== undefined) refusals.end = end;
  if (fields.typeId === '') refusals.typeId = texts.availability.typeNotChosen;
  return refusals;
}

// "Add": the windows with one more, by start, or why not. What only the windows being put
// together can know is checked here, before anything is sent: one more than a day may have
// of its own (the number of shared/), said as the form's failure; and a window that overlaps
// one of them: an overlap is of the two times together, so both fields are in fault and the
// sentence, which names both, is said once, under "Start". Windows that touch do not overlap,
// whatever their types (docs/SHARED_CALENDAR_SPEC.md R-AV-01, through `overlaps` of shared/). The
// extra windows of the day are the server's to compare, at the save.
export function draftAdd(texts: PageTexts, windows: readonly WindowBody[], fields: WindowFields): { windows: WindowBody[] } | { refusals: Partial<Record<WindowField, string>> } | { failure: string } {
  const refusals = fieldRefusals(texts, fields);
  if (Object.keys(refusals).length > 0) return { refusals };
  if (windows.length >= CALENDAR_LIMITS.overrideWindowsPerDate) return { failure: texts.date.draftFull(CALENDAR_LIMITS.overrideWindowsPerDate) };
  if (windows.some((window) => overlaps(window, fields))) return { refusals: { start: texts.date.overlapsDraft, end: IN_FAULT_TOO } };
  return { windows: [...windows, { start: fields.start, end: fields.end, typeId: fields.typeId }].sort(byStart) };
}

// ── An extra window ─────────────────────────────────────────────────────────────────────────

// From what the form holds to the body of the create, on the date on show, or to the
// refusals. An overlap with the day's other windows and the limit of extra windows are the
// server's to say; the shared schema, through the service, has the last word on the body.
export function windowFor(texts: PageTexts, date: string, fields: WindowFields): { window: OneOffWindowBody } | { refusals: Partial<Record<WindowField, string>> } {
  const refusals = fieldRefusals(texts, fields);
  if (Object.keys(refusals).length > 0) return { refusals };
  return { window: { date, start: fields.start, end: fields.end, typeId: fields.typeId } };
}
