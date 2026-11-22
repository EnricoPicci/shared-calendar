import type { ListUsersResponse } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler } from '../../handlers/listUsers';
import type { ReadTool, ToolDefinition } from './tool';

// The tool for GET /users (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the Users an
// appointment can be booked for. The Administrator only; the route refuses anybody else. Claude
// gets the usernames and nothing else of an account.

const Input = z.object({}).strict();

export const listUsersDefinition: ToolDefinition = {
  name: 'list_users',
  description:
    'Lists the usernames of the Users of the calendar: the people an appointment can be booked for. Administrators are not in the list. ' +
    'Use it when the person asks who the Users are, and to find the exact username before booking an appointment for a User.',
  kind: 'read',
  roles: ['admin'],
  input: () => Input,
  reads: 'users',
};

const parts: ReadTool<z.infer<typeof Input>> = {
  definition: listUsersDefinition,
  toHandler: { handler, request: () => ({ routeKey: 'GET /users', path: '/users' }) },
  // When an account was created is not something an answer needs.
  toModel: (body) => ({ fields: {}, list: { name: 'users', items: (body as ListUsersResponse).users.map((user) => user.username) } }),
};
export const listUsers = parts as ReadTool;
