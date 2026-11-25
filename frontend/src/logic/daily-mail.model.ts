import type { MailSettings, MailSettingsBody } from '@shared-calendar/shared';
import { DAILY_MAIL_TEXTS } from './texts';

// The settings' "Daily e-mail" (docs/FRONTEND_ARCHITECTURE.md section 5.1): the daily mail's
// settings as the API answers them (docs/EMAIL_ARCHITECTURE.md section 9.1) turned into what the
// section's two fields hold, and from what they hold to the argument of
// MailSettingsService.updateSettings, or to why not. Pure.

// What the fields hold: the switch, and the hour as text, "07:00".
export type DailyFields = { dailyEnabled: boolean; dailyHour: string };

export function dailyFields(settings: MailSettings): DailyFields {
  return { dailyEnabled: settings.dailyEnabled, dailyHour: DAILY_MAIL_TEXTS.hour(settings.dailyHour) };
}

// A whole hour as a person types it: "7", "07", "7:00" or "07:00", spaces around it aside. Minutes
// other than 00, a sign or a word are refused: the daily mail goes at a whole hour.
const HOUR = /^(\d{1,2})(:00)?$/;

// From what the fields hold to the body of the save, or to the refusal of the hour when it is not
// a whole hour from 00:00 to 23:00. The switch has nothing to refuse; the hour is checked also when
// the mail is switched off, since it is saved with it.
export function dailyFor(fields: DailyFields): { body: MailSettingsBody } | { refusal: string } {
  const match = HOUR.exec(fields.dailyHour.trim());
  const hour = match === null ? Number.NaN : Number(match[1]);
  if (!(hour >= 0 && hour <= 23)) return { refusal: DAILY_MAIL_TEXTS.refusal };
  return { body: { dailyEnabled: fields.dailyEnabled, dailyHour: hour } };
}
