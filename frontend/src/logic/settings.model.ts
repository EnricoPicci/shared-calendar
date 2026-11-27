import { SETTINGS_RANGES, type CalendarSettings, type UpdateSettingsBody } from '@shared-calendar/shared';
import { dateTimeText } from './texts';
import { PAGE_TEXTS_EN } from '../texts/texts.en';

// The settings form (docs/FRONTEND_ARCHITECTURE.md section 5.1): the calendar's settings as the
// API answers them (docs/SHARED_CALENDAR_SPEC.md section 9) turned into what the form's fields
// hold and what it says beside them, the range of each field in words, and from what the fields
// hold to the argument of CalendarSettingsService.update, or to why not, field by field. Pure.

// The four settings the Administrator changes, in the order of the form: each is the `name` of
// its field.
export const SETTING_FIELDS = ['cancellationNoticeHours', 'minBookingNoticeHours', 'bookingHorizonDays', 'maxFutureAppointmentsPerUser'] as const;
export type SettingField = (typeof SETTING_FIELDS)[number];

// What the fields hold: the four values as text, and whether "No limit" is checked, in which
// case the limit's field counts for nothing.
export type SettingsFields = Record<SettingField, string> & { noLimit: boolean };

// What the form says beside the fields: the calendar's time zone, which is read-only
// (docs/SHARED_CALENDAR_SPEC.md R-TIME-01), and who saved the settings last and when.
export type SettingsInfo = { timeZone: string; lastSaved: string };

// The settings as the fields hold them: no limit is the checkbox, with an empty field.
export function settingsFields(settings: CalendarSettings): SettingsFields {
  const limit = settings.maxFutureAppointmentsPerUser;
  return {
    cancellationNoticeHours: String(settings.cancellationNoticeHours),
    minBookingNoticeHours: String(settings.minBookingNoticeHours),
    bookingHorizonDays: String(settings.bookingHorizonDays),
    maxFutureAppointmentsPerUser: limit === null ? '' : String(limit),
    noLimit: limit === null,
  };
}

// Until the Administrator first saves them the settings are the defaults, and nobody saved
// them (docs/SHARED_CALENDAR_SPEC.md R-SET-01). The moment is said in the calendar's zone.
export function settingsInfo(settings: CalendarSettings): SettingsInfo {
  const { timeZone, updatedAt, updatedBy } = settings;
  const lastSaved =
    updatedAt === null || updatedBy === null
      ? 'These are the default settings: nobody has saved them yet.'
      : `Last saved by ${updatedBy.username} on ${dateTimeText(PAGE_TEXTS_EN.dates, updatedAt, timeZone)}`;
  return { timeZone, lastSaved };
}

// A field's name in the words of its label in index.html, and what it counts.
const IN_WORDS: Record<SettingField, { name: string; unit: string }> = {
  cancellationNoticeHours: { name: 'Cancellation notice', unit: 'hours' },
  minBookingNoticeHours: { name: 'Minimum booking notice', unit: 'hours' },
  bookingHorizonDays: { name: 'Booking horizon', unit: 'days' },
  maxFutureAppointmentsPerUser: { name: 'Maximum upcoming appointments per person', unit: 'appointments' },
};

// The range of a field: its two ends, which are those of shared/ and of the API
// (docs/SHARED_CALENDAR_SPEC.md section 9), and the words under the field: "hours, from 0 to
// 720".
export type SettingRange = { min: number; max: number; words: string };

export function settingRange(field: SettingField): SettingRange {
  const { min, max } = SETTINGS_RANGES[field];
  return { min, max, words: `${IN_WORDS[field].unit}, from ${min} to ${max}` };
}

// Why a save is not asked for: one sentence per field in fault, each naming its field.
export type Refusals = Partial<Record<SettingField, string>>;

// A whole number written with digits only, spaces around it aside: twenty-four typed alone,
// between spaces or after zeros. A sign, a decimal point or an exponent make the text something
// else than a whole number typed on purpose, also when its value would be one, and it is
// refused like an empty field or a word.
const WHOLE_NUMBER = /^\d+$/;

// From what the fields hold to the body of the save, or to the refusals when a field is empty,
// is not a whole number or is outside its range: every field in fault is said, not the first
// only. With "No limit" checked the limit is null and its field is not looked at.
export function settingsFor(fields: SettingsFields): { body: UpdateSettingsBody } | { refusals: Refusals } {
  const refusals: Refusals = {};
  const valueOf = (field: SettingField): number => {
    const { min, max } = SETTINGS_RANGES[field];
    const text = fields[field].trim();
    const value = WHOLE_NUMBER.test(text) ? Number(text) : Number.NaN;
    if (!(value >= min && value <= max)) refusals[field] = `${IN_WORDS[field].name} must be a whole number from ${min} to ${max}.`;
    return value;
  };
  const body: UpdateSettingsBody = {
    cancellationNoticeHours: valueOf('cancellationNoticeHours'),
    minBookingNoticeHours: valueOf('minBookingNoticeHours'),
    bookingHorizonDays: valueOf('bookingHorizonDays'),
    maxFutureAppointmentsPerUser: fields.noLimit ? null : valueOf('maxFutureAppointmentsPerUser'),
  };
  return Object.keys(refusals).length > 0 ? { refusals } : { body };
}
