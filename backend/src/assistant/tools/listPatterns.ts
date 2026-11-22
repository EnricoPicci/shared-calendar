import type { ListPatternsResponse, ListTypesResponse } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler as listTypes } from '../../handlers/listAvailabilityTypes';
import { handler } from '../../handlers/listPatterns';
import { WEEKDAY_NAMES } from './result';
import type { ReadTool, ToolDefinition } from './tool';

// The tool for GET /calendar/patterns (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the weekly
// patterns, which give the hours open for appointments week after week. The Administrator only;
// the route refuses anybody else. A pattern holds the id of its type, not its name, so the types
// are read too, through GET /calendar/types, and each pattern is given with the name.

const Input = z.object({}).strict();

export const listPatternsDefinition: ToolDefinition = {
  name: 'list_patterns',
  description:
    'Lists the weekly patterns of the calendar: each opens the same hours on one weekday, every week from its first valid day to its last (null: with no end), for one appointment type. ' +
    'Each pattern has its id, its weekday, its start and end time, the name of its type and its two dates. A date with an override does not follow the patterns: get_calendar shows what a given day really looks like. ' +
    "Use it when the person asks about the regular opening hours. All dates and times are in the calendar's time zone.",
  kind: 'read',
  roles: ['admin'],
  input: () => Input,
  reads: 'patterns',
};

const parts: ReadTool<z.infer<typeof Input>> = {
  definition: listPatternsDefinition,
  toHandler: {
    handler,
    request: () => ({ routeKey: 'GET /calendar/patterns', path: '/calendar/patterns' }),
    also: { handler: listTypes, call: { routeKey: 'GET /calendar/types', path: '/calendar/types' } },
  },
  // A pattern's times are wall-clock times already. When it was created and updated stays out.
  toModel: (body, _context, also) => {
    const names = new Map((also as ListTypesResponse).types.map((type) => [type.typeId, type.name]));
    return {
      fields: {},
      list: {
        name: 'patterns',
        items: (body as ListPatternsResponse).patterns.map((pattern) => ({
          id: pattern.patternId,
          weekday: WEEKDAY_NAMES[pattern.weekday - 1],
          start: pattern.start,
          end: pattern.end,
          type: names.get(pattern.typeId) ?? null,
          validFrom: pattern.validFrom,
          validUntil: pattern.validUntil,
        })),
      },
    };
  },
};
export const listPatterns = parts as ReadTool;
