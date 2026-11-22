import {
  all,
  asked,
  askedInOrder,
  askedNothing,
  askedOnly,
  askedWith,
  atMostSteps,
  either,
  failures,
  holds,
  language,
  noProposal,
  outcomes,
  proposalStarts,
  proposes,
  readsDay,
  status,
  type Seen,
} from '../../eval/checks';

// The checks the evaluation applies to an exchange (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3).
const TYPE = '01JTYPE0000000000000000000';
const seen = (over: Partial<Seen> = {}): Seen => ({ requests: [], proposal: null, outcomes: null, status: 'idle', language: 'en', steps: 1, ...over });
const read: Seen = seen({
  requests: [
    { name: 'list_types', input: {} },
    { name: 'get_calendar', input: { from: '2026-11-24', to: '2026-11-24' } },
  ],
  steps: 3,
});
const block: Seen = seen({
  requests: [
    { name: 'get_calendar', input: { from: '2026-11-24', to: '2026-11-24' } },
    { name: 'set_date_override', input: {} },
  ],
  status: 'awaiting_confirmation',
  proposal: [
    {
      tool: 'set_date_override',
      call: { routeKey: 'PUT /calendar/overrides/{date}', path: '/calendar/overrides/2026-11-24', body: { windows: [{ start: '16:00', end: '18:00', typeId: TYPE }, { start: '09:00', end: '13:00', typeId: TYPE }] } },
      summary: 'Change the hours of Tuesday 24 November 2026.',
    },
  ],
});

describe('holds', () => {
  it('takes an object that holds more than wanted, and refuses one that holds less or another value', () => {
    expect(holds({ a: 1, b: 2 }, { a: 1 })).toBe(true);
    expect(holds({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(holds({ a: 1 }, { a: 2 })).toBe(false);
    expect(holds(null, { a: 1 })).toBe(false);
    expect(holds([1], { a: 1 })).toBe(false);
    expect(holds({ a: null }, { a: null })).toBe(true);
  });

  it('takes a list of the same length in any order, each wanted item in an item of its own', () => {
    expect(holds([{ n: 2 }, { n: 1 }], [{ n: 1 }, { n: 2 }])).toBe(true);
    expect(holds([{ n: 1 }, { n: 1 }], [{ n: 1 }, { n: 2 }])).toBe(false);
    expect(holds([{ n: 1 }], [{ n: 1 }, { n: 1 }])).toBe(false);
    expect(holds([], [])).toBe(true);
    expect(holds('no list', [])).toBe(false);
  });

  it('takes a text a pattern matches and a value a function accepts', () => {
    expect(holds('eval Visit', /^eval /)).toBe(true);
    expect(holds(7, /7/)).toBe(false);
    expect(holds(7, (value: unknown) => value === 7)).toBe(true);
    expect(holds(8, (value: unknown) => value === 7)).toBe(false);
  });
});

describe('the checks on the tools asked for', () => {
  it('asked, askedOnly, askedNothing and askedInOrder', () => {
    expect(asked('get_calendar', 'list_appointments').failed(read)).toBeNull();
    expect(asked('list_users').failed(read)).toBe('asked for ["list_types","get_calendar"]');
    expect(askedOnly('get_calendar', 'list_types').failed(read)).toBeNull();
    expect(askedOnly('get_calendar').failed(read)).toBe('also asked for ["list_types"]');
    expect(askedNothing().failed(seen())).toBeNull();
    expect(askedNothing().failed(read)).toBe('asked for ["list_types","get_calendar"]');
    expect(askedInOrder('list_types', 'get_calendar').failed(read)).toBeNull();
    expect(askedInOrder('get_calendar', 'list_types').failed(read)).toBe('asked for ["list_types","get_calendar"]');
  });

  it('askedWith takes one of several inputs, of one of several tools', () => {
    expect(askedWith('get_calendar', { from: '2026-11-24' }).failed(read)).toBeNull();
    expect(askedWith(['list_appointments', 'get_calendar'], { from: '2026-11-25' }, { to: '2026-11-24' }).failed(read)).toBeNull();
    expect(askedWith('get_calendar', { from: '2026-11-25' }).failed(read)).toBe('the inputs were [{"from":"2026-11-24","to":"2026-11-24"}]');
    expect(askedWith('list_appointments', {}).failed(read)).toBe('the inputs were []');
  });

  it('readsDay takes a period that holds the day and is short enough', () => {
    const week = seen({ requests: [{ name: 'get_calendar', input: { from: '2026-11-23', to: '2026-11-29' } }] });

    expect(readsDay('get_calendar', '2026-11-24', 1).failed(read)).toBeNull();
    expect(readsDay('get_calendar', '2026-11-24').failed(week)).toBeNull();
    expect(readsDay('get_calendar', '2026-11-24', 1).failed(week)).toContain('the inputs were');
    expect(readsDay(['get_calendar'], '2026-11-30').failed(week)).toContain('the inputs were');
    expect(readsDay('get_calendar', '2026-11-24').failed(seen({ requests: [{ name: 'get_calendar', input: {} }] }))).toContain('the inputs were');
  });
});

describe('the checks on the proposal', () => {
  it('noProposal', () => {
    expect(noProposal().failed(read)).toBeNull();
    expect(noProposal().failed(block)).toBe('proposed ["set_date_override"]');
  });

  it('proposes takes exactly the wanted changes, by tool, part of the path and what the body holds', () => {
    const windows = [{ start: '09:00', end: '13:00', typeId: TYPE }, { start: '16:00', end: '18:00', typeId: TYPE }];

    expect(proposes({ tool: 'set_date_override', path: '/calendar/overrides/2026-11-24', body: { windows } }).failed(block)).toBeNull();
    expect(proposes({ tool: 'set_date_override' }).failed(block)).toBeNull();
    expect(proposes({ tool: 'set_date_override', body: { windows: [windows[0]] } }).failed(block)).toContain('wanted');
    expect(proposes({ tool: 'set_date_override', path: '2026-11-25' }).failed(block)).toContain('wanted');
    expect(proposes({ tool: 'set_date_override' }, { tool: 'delete_one_off_window' }).failed(block)).toContain('wanted');
    expect(proposes({ tool: 'set_date_override' }).failed(read)).toBe('proposed nothing');
  });

  it('a change with no body is stored with none', () => {
    const cancel = seen({ proposal: [{ tool: 'cancel_appointment', call: { routeKey: 'POST …/cancel', path: '/calendar/appointments/01A/cancel' }, summary: 'Cancel.' }] });

    expect(proposes({ tool: 'cancel_appointment', path: '01A' }).failed(cancel)).toBeNull();
    expect(proposes({ tool: 'cancel_appointment', body: { note: 'x' } }).failed(cancel)).toContain('wanted');
  });

  it('proposalStarts and outcomes', () => {
    expect(proposalStarts('Change the hours').failed(block)).toBeNull();
    expect(proposalStarts('Modificare').failed(block)).toContain('the sentence was');
    expect(proposalStarts('Modificare').failed(read)).toBe('the sentence was null');
    expect(outcomes('refused:availability_conflict').failed(seen({ outcomes: ['refused:availability_conflict'] }))).toBeNull();
    expect(outcomes('refused:availability_conflict').failed(seen({ outcomes: ['done'] }))).toBe('the outcomes were ["done"]');
    expect(outcomes('done').failed(block)).toBe('the outcomes were null');
  });
});

describe('the other checks, and their combinations', () => {
  it('status, language and atMostSteps', () => {
    expect(status('idle').failed(read)).toBeNull();
    expect(status('idle').failed(block)).toBe('ended awaiting_confirmation');
    expect(language('en').failed(read)).toBeNull();
    expect(language('it').failed(read)).toBe('the language was "en"');
    expect(atMostSteps(3).failed(read)).toBeNull();
    expect(atMostSteps(2).failed(read)).toBe('took 3 steps');
  });

  it('either passes when one way passes, all when every check does', () => {
    expect(either(askedNothing(), asked('get_calendar')).failed(read)).toBeNull();
    expect(either(askedNothing(), asked('list_users')).failed(read)).toBe('asked for ["list_types","get_calendar"]; and asked for ["list_types","get_calendar"]');
    expect(all(asked('get_calendar'), noProposal()).failed(read)).toBeNull();
    expect(all(asked('get_calendar'), status('working')).failed(read)).toBe('ended idle');
    expect(either(all(asked('list_users'), noProposal()), noProposal()).what).toBe('asks for list_users and proposes nothing, or proposes nothing');
  });

  it('failures lists what failed, each with what was checked', () => {
    expect(failures([asked('get_calendar'), noProposal(), status('working')], read)).toEqual(['ends working: ended idle']);
    expect(failures([askedWith('get_calendar', /x/, (value: unknown) => value === 1)], read)[0]).toContain('asks get_calendar with "/x/" or');
  });
});
