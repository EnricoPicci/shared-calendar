import { ASSISTANT_LIMITS, isValidTimeZone } from '@shared-calendar/shared';

// What the assistant's core reads from its function's environment: the calendar's time zone, in
// which a person's day is counted and the time is told to Claude, and how many messages a person
// may send in a day (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.4).

export type CoreConfig = { timeZone: string; dailyMessageLimit: number };

// A broken deployment. Thrown on use, never at import: a module that fails to load makes the
// Lambda crash instead of answering.
export class CoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreConfigError';
  }
}

let config: CoreConfig | CoreConfigError | undefined;

function readConfig(): CoreConfig | CoreConfigError {
  const timeZone = process.env.CALENDAR_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) {
    return new CoreConfigError(`CALENDAR_TIME_ZONE is not a valid time zone: ${JSON.stringify(timeZone ?? null)}`);
  }
  // Empty means the default of the shared limits; the template always gives a value.
  const limit = process.env.ASSISTANT_DAILY_MESSAGE_LIMIT ? Number(process.env.ASSISTANT_DAILY_MESSAGE_LIMIT) : ASSISTANT_LIMITS.messagesPerDay;
  if (!Number.isInteger(limit) || limit < 1) {
    return new CoreConfigError('ASSISTANT_DAILY_MESSAGE_LIMIT is not a whole number of messages, 1 or more');
  }
  return { timeZone: timeZone as string, dailyMessageLimit: limit };
}

// Read once per container, on first use; a failure is kept too, so every request fails alike.
export function coreConfig(): CoreConfig {
  config ??= readConfig();
  if (config instanceof CoreConfigError) throw config;
  return config;
}
