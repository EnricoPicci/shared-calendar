import type { ApiErrorCode, MeResponse } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of MeService (docs/FRONTEND_SERVICES.md section 23).

// GET /me: the person's own four facts, for both roles (docs/EMAIL_ARCHITECTURE.md section 9.1).
type MeCode = Extract<ApiErrorCode, 'forbidden' | 'user_not_found' | 'internal_error'>;
export type MeFailureReason = MeCode | TransportFailureReason;
export type MeResult = { status: 'success'; me: MeResponse } | ApiFailure<MeCode>;
export type MeState = { status: 'idle' } | { status: 'pending' } | MeResult;
