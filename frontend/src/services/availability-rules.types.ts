import type {
  ApiErrorCode,
  DateOverride,
  OneOffWindowBody,
  OneOffWindow,
  PatternBody,
  WeeklyPattern,
  WindowBody,
} from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// docs/FRONTEND_SERVICES.md section 17.3. Routes 7–14, admin only; their codes are architecture
// section 4's (decision 32): updatePattern has no `limit_reached` (as spec v14), deletePattern no
// `availability_overlap` (spec 11.1 lists it; footnote 1: never answered). A failure with `availability_conflict`
// carries `conflicts` (section 10.2).

type Common = 'forbidden' | 'internal_error';
type Write = Common | 'invalid_request' | 'concurrent_update';

// GET /calendar/patterns.
type LoadPatternsCode = Extract<ApiErrorCode, Common>;
export type PatternsFailureReason = LoadPatternsCode | TransportFailureReason;
export type PatternsResult = { status: 'success'; patterns: WeeklyPattern[] } | ApiFailure<LoadPatternsCode>;
export type PatternsState = { status: 'idle' } | { status: 'pending' } | PatternsResult;

// POST /calendar/patterns.
type CreatePatternCode = Extract<
  ApiErrorCode,
  Write | 'invalid_json' | 'type_not_found' | 'limit_reached' | 'availability_overlap' | 'availability_conflict'
>;
export type CreatePatternFailureReason = CreatePatternCode | TransportFailureReason;
export type CreatePatternResult = { status: 'success'; pattern: WeeklyPattern } | ApiFailure<CreatePatternCode>;
export type CreatePatternState = { status: 'idle' } | { status: 'pending'; pattern: PatternBody } | CreatePatternResult;

// PUT /calendar/patterns/{patternId}.
type UpdatePatternCode = Extract<
  ApiErrorCode,
  Write | 'invalid_json' | 'pattern_not_found' | 'type_not_found' | 'availability_overlap' | 'availability_conflict'
>;
export type UpdatePatternFailureReason = UpdatePatternCode | TransportFailureReason;
export type UpdatePatternResult = { status: 'success'; pattern: WeeklyPattern } | ApiFailure<UpdatePatternCode>;
export type UpdatePatternState =
  | { status: 'idle' }
  | { status: 'pending'; patternId: string; pattern: PatternBody }
  | UpdatePatternResult;

// DELETE /calendar/patterns/{patternId}.
type DeletePatternCode = Extract<ApiErrorCode, Write | 'pattern_not_found' | 'availability_conflict'>;
export type DeletePatternFailureReason = DeletePatternCode | TransportFailureReason;
export type DeletePatternResult = { status: 'success'; patternId: string } | ApiFailure<DeletePatternCode>;
export type DeletePatternState = { status: 'idle' } | { status: 'pending'; patternId: string } | DeletePatternResult;

// PUT /calendar/overrides/{date}.
type SetOverrideCode = Extract<
  ApiErrorCode,
  Write | 'invalid_json' | 'date_in_past' | 'type_not_found' | 'availability_overlap' | 'availability_conflict'
>;
export type SetOverrideFailureReason = SetOverrideCode | TransportFailureReason;
export type SetOverrideResult = { status: 'success'; override: DateOverride } | ApiFailure<SetOverrideCode>;
export type SetOverrideState =
  | { status: 'idle' }
  | { status: 'pending'; date: string; windows: WindowBody[] }
  | SetOverrideResult;

// DELETE /calendar/overrides/{date}.
type DeleteOverrideCode = Extract<
  ApiErrorCode,
  Write | 'override_not_found' | 'date_in_past' | 'availability_overlap' | 'availability_conflict'
>;
export type DeleteOverrideFailureReason = DeleteOverrideCode | TransportFailureReason;
export type DeleteOverrideResult = { status: 'success'; date: string } | ApiFailure<DeleteOverrideCode>;
export type DeleteOverrideState = { status: 'idle' } | { status: 'pending'; date: string } | DeleteOverrideResult;

// POST /calendar/windows.
type CreateWindowCode = Extract<
  ApiErrorCode,
  Write | 'invalid_json' | 'date_in_past' | 'type_not_found' | 'limit_reached' | 'availability_overlap'
>;
export type CreateWindowFailureReason = CreateWindowCode | TransportFailureReason;
export type CreateWindowResult = { status: 'success'; window: OneOffWindow } | ApiFailure<CreateWindowCode>;
export type CreateWindowState = { status: 'idle' } | { status: 'pending'; window: OneOffWindowBody } | CreateWindowResult;

// DELETE /calendar/windows/{windowId}.
type DeleteWindowCode = Extract<ApiErrorCode, Write | 'window_not_found' | 'date_in_past' | 'availability_conflict'>;
export type DeleteWindowFailureReason = DeleteWindowCode | TransportFailureReason;
export type DeleteWindowResult = { status: 'success'; windowId: string } | ApiFailure<DeleteWindowCode>;
export type DeleteWindowState = { status: 'idle' } | { status: 'pending'; windowId: string } | DeleteWindowResult;
