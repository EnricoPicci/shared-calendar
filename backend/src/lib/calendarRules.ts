import { CALENDAR_LIMITS, type ApiErrorCode, type AppointmentStatus } from '@shared-calendar/shared';

// The calendar's server-side checks (docs/SHARED_CALENDAR_SPEC.md 14.2): pure functions over what
// calendarDb read inside the locked attempt, with "today" and "now" passed in (R-TIME-04). No AWS,
// no clock, no item layout. A failed check names the contract's error code; the handler maps it to
// the status of spec 11.3. calendarDb runs these as the `check` of its locked writes.

/** A failed check: the error code to answer with. Nothing is written. */
export type Refusal<C extends ApiErrorCode = ApiErrorCode> = { error: C };

const refuse = <C extends ApiErrorCode>(error: C): Refusal<C> => ({ error });

// ── Availability types (spec 6.1) ────────────────────────────────────────────────────────────

/**
 * The key two type names are compared by (spec 6.1, "compared case-insensitively"): the name,
 * already trimmed by the TypeName schema, lower-cased without a locale. Stored as `nameKey`
 * (13.2), and the order of GET /calendar/types.
 */
export function typeNameKey(name: string): string {
  return name.toLowerCase();
}

/** What a name check needs of each existing type. */
export type NamedType = { typeId: string; nameKey: string };

/**
 * R-TYPE-01 (create) and R-TYPE-02 (rename): the name must be unique among all types, and a
 * create must not make more than CALENDAR_LIMITS.types. `renaming` is the id of the type being
 * renamed: its own name never counts as taken, so a rename that keeps its name, or changes only
 * its case, is allowed. A rename never changes the count, so the limit applies to a create only.
 */
export function checkTypeName(name: string, types: readonly NamedType[]): Refusal<'type_name_exists' | 'limit_reached'> | null;
export function checkTypeName(name: string, types: readonly NamedType[], renaming: string): Refusal<'type_name_exists'> | null;
export function checkTypeName(
  name: string,
  types: readonly NamedType[],
  renaming?: string,
): Refusal<'type_name_exists' | 'limit_reached'> | null {
  const key = typeNameKey(name);
  if (types.some((t) => t.nameKey === key && t.typeId !== renaming)) return refuse('type_name_exists');
  if (renaming === undefined && types.length >= CALENDAR_LIMITS.types) return refuse('limit_reached');
  return null;
}

/**
 * What can refer to a type (13.2), as calendarDb read it: only the fields the delete check needs.
 * calendarDb already leaves out what lies in the past (overrides and windows before today,
 * appointments that started more than 24 h ago); checkTypeDelete does not rely on that.
 */
export type TypeReferences = {
  patterns: readonly { typeId: string }[];
  overrides: readonly { date: string; windows: readonly { typeId: string }[] }[];
  windows: readonly { date: string; typeId: string }[];
  appointments: readonly { typeId: string; status: AppointmentStatus; end: string }[];
};

/**
 * R-TYPE-03: a type cannot be deleted while a weekly pattern refers to it (whatever its
 * validity), an override or one-off window dated today or later, or a booked appointment that has
 * not ended (`end > now`; one in progress counts). Past references do not block: an appointment
 * keeps a snapshot of the type name. `today` is a local date, `now` an instant; both compare as
 * strings (R-TIME-02).
 */
export function checkTypeDelete(
  typeId: string,
  refs: TypeReferences,
  today: string,
  now: string,
): Refusal<'type_in_use'> | null {
  const inUse =
    refs.patterns.some((p) => p.typeId === typeId) ||
    refs.overrides.some((o) => o.date >= today && o.windows.some((w) => w.typeId === typeId)) ||
    refs.windows.some((w) => w.date >= today && w.typeId === typeId) ||
    refs.appointments.some((a) => a.typeId === typeId && a.status === 'booked' && a.end > now);
  return inUse ? refuse('type_in_use') : null;
}
