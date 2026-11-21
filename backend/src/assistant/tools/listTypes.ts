import type { ListTypesResponse } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler } from '../../handlers/listAvailabilityTypes';
import type { ReadTool, ToolDefinition } from './tool';

// The tool for GET /calendar/types (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the kinds of
// appointment the Administrator offers. Both roles; the route answers them alike.

const Input = z.object({}).strict();

export const listTypesDefinition: ToolDefinition = {
  name: 'list_types',
  description:
    'Lists the appointment types of the calendar (for example "Visit" or "Phone call"), each with its id and its name. ' +
    'Every bookable time belongs to one type. Use it when the person asks which kinds of appointment exist.',
  kind: 'read',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'types',
};

const parts: ReadTool<z.infer<typeof Input>> = {
  definition: listTypesDefinition,
  toHandler: { handler, request: () => ({ routeKey: 'GET /calendar/types', path: '/calendar/types' }) },
  toModel: (body) => ({
    fields: {},
    list: { name: 'types', items: (body as ListTypesResponse).types.map((type) => ({ id: type.typeId, name: type.name })) },
  }),
};
export const listTypes = parts as ReadTool;
