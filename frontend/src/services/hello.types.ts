import type { ApiErrorCode, HelloResponse } from '@shared-calendar/shared';
import type { TransportFailureReason } from './api';

// The result and state types of HelloService (docs/FRONTEND_SERVICES.md section 12.3).

// Besides the transport failures, the handler answers only 403 `forbidden` (a token in neither
// group) or 500 `internal_error` (docs/ARCHITECTURE.md section 4).
export type HelloFailureReason = Extract<ApiErrorCode, 'forbidden' | 'internal_error'> | TransportFailureReason;

export type HelloResult =
  | { status: 'success'; hello: HelloResponse }
  | { status: 'failure'; reason: HelloFailureReason; message: string };

export type HelloState = { status: 'idle' } | { status: 'pending' } | HelloResult;
