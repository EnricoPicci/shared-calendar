import { CALENDAR_LIMITS } from '@shared-calendar/shared';
import { typeCapacityHint, typeNameHint, weekdayChoices } from '../../../src/logic/availability.model';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The words of "Availability" in English, under the names the tests of its models, its screens
// and its views expect them. A helper, not a test file.

const { availability, date } = PAGE_TEXTS_EN;

export const NO_TYPES = availability.noTypes;
export const TYPE_NAME_HINT = typeNameHint(PAGE_TEXTS_EN);
export const TYPE_CAPACITY_HINT = typeCapacityHint(PAGE_TEXTS_EN);
export const WEEKDAY_CHOICES = weekdayChoices(PAGE_TEXTS_EN);
export const NO_TYPE_YET = availability.noTypeYet;
export const END_NOT_LATER = availability.endNotLater;
export const END_NOT_WHOLE_HOURS = availability.endNotWholeHours;
export const TYPE_NOT_CHOSEN = availability.typeNotChosen;
export const NO_PATTERNS = availability.noPatterns;
export const UNKNOWN_TYPE = availability.unknownType;

export const DATE_NEEDED = date.dateNeeded;
export const PAST_DATE = date.pastDate;
export const ZONE_PENDING = date.zonePending;
export const DRAFT_OPEN = date.draftOpen;
export const NO_PATTERN_HOURS = date.noPatternHours;
export const PATTERNS_NOT_KNOWN = date.patternsNotKnown;
export const PATTERNS_APPLY = date.patternsApply;
export const OWN_WINDOWS = date.ownWindows;
export const NOT_AVAILABLE = date.notAvailable;
export const NO_EXTRAS = date.noExtras;
export const DRAFT_EMPTY = date.draftEmpty;
export const OVERLAPS_DRAFT = date.overlapsDraft;
export const DRAFT_FULL = date.draftFull(CALENDAR_LIMITS.overrideWindowsPerDate);

// A date with its weekday and its year: "Monday 23 November 2026".
export const dateWords = PAGE_TEXTS_EN.dates.fullDate;
