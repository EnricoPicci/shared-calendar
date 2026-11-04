import type { Role } from './roles';

// Architecture section 4. The error codes the handlers answer with; API Gateway's own
// 401/403/500 bodies ({ "message": "…" }) are not in this shape.
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_json'
  | 'invalid_request'
  | 'user_exists'
  | 'user_not_found'
  | 'cannot_delete_admin'
  | 'internal_error';
export type ApiErrorBody = { error: ApiErrorCode; message: string };

// 201 of POST /hello.
export type HelloResponse = { messageId: string; role: Role; message: string; createdAt: string };
// 201 of POST /users. The password is shown only in this response.
export type CreateUserResponse = { username: string; password: string };
