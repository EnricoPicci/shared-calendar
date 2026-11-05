import type { ApiErrorCode, HelloResponse } from '@shared-calendar/shared';
import type { TransportFailureReason } from './api';

// docs/FRONTEND_SERVICES.md section 12.3.

// Architecture section 4: a handler answers 403 forbidden (in neither group) or 500.
export type HelloFailureReason = Extract<ApiErrorCode, 'forbidden' | 'internal_error'> | TransportFailureReason;

export type HelloResult =
  | { status: 'success'; hello: HelloResponse }
  | { status: 'failure'; reason: HelloFailureReason; message: string };

export type HelloState = { status: 'idle' } | { status: 'pending' } | HelloResult;
