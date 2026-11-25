import type { AppointmentConflict, AvailabilityType, WeeklyPattern } from '@shared-calendar/shared';
import { BehaviorSubject } from 'rxjs';
import { NO_TYPE_YET, patternFor, patternGroups, startingFields, TYPE_CAPACITY_HINT, TYPE_NAME_HINT, typeChoices, typeRows, type PatternFields } from '../../../src/logic/availability.model';
import type { Ask, AvailabilityState } from '../../../src/logic/availability.screen';
import { conflictList } from '../../../src/logic/conflicts';
import type { DeletePatternState } from '../../../src/services/availability-rules.types';
import type { RemoveTypeState } from '../../../src/services/availability-types.types';
import { mountConfirm } from '../../../src/views/availability.parts';
import { mountAvailability, type AvailabilityDeps } from '../../../src/views/availability.view';
import { POOL, STUDIO } from '../logic/fixtures';
import { choicesOf, choose, chooseTime, clock, find, loadPage, setTime, submit, timeIn, useRealPage } from './page';

// The DOM test of the availability view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html, a fake AvailabilityScreen whose stream the test controls, and the parts of the
// two services the view uses, with state streams that keep their last value, as the real ones
// do. What a name or a pattern is, the order of the rows and the words of a refusal are
// checked in the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const IN_USE = 'This type is in use, so it cannot be deleted. A type is in use while a weekly pattern, a date of today or later or an upcoming appointment uses it.';
const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const type = (typeId: string, name: string): AvailabilityType => ({ typeId, name, capacity: 1, ...STAMPS });
const TYPES = [type(POOL, 'Piscina'), type(STUDIO, 'Studio')];
const P1 = '01M6PATTERN000000000000001';
const P2 = '01M6PATTERN000000000000002';
const P3 = '01M6PATTERN000000000000003';
const pattern = (patternId: string, over: Partial<WeeklyPattern> = {}): WeeklyPattern => ({ patternId, weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS, ...over });
const PATTERNS = [pattern(P1), pattern(P2, { weekday: 2, start: '15:00', end: '18:00', typeId: POOL, validUntil: '2027-01-19' }), pattern(P3, { weekday: 2, start: '07:00', end: '08:00', validFrom: '2026-01-01', validUntil: '2026-06-30' })];
const CONFLICTS: AppointmentConflict[] = [
  { appointmentId: 'appt-2', username: 'bob', start: '2026-11-30T08:00:00.000Z', end: '2026-11-30T09:00:00.000Z' },
  { appointmentId: 'appt-1', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' },
];
const IN_THE_WAY = conflictList(CONFLICTS, 'Europe/Rome')!;

// The objects of the state stay the same from one state to the next unless a test brings
// another: another object is what tells the view to draw a list or to fill a form again.
const QUIET: Ask<never> = { about: '', busy: false, refusals: {}, failure: null, conflicts: null, done: false };
const ROWS = typeRows(TYPES);
const GROUPS = patternGroups(PATTERNS, TYPES, '2026-11-20');
const CHOICES = typeChoices(TYPES);
const TYPE_FIELDS = { name: '', capacity: '1' };
const STARTING = startingFields('2026-11-20');
const state = (over: Partial<AvailabilityState> = {}): AvailabilityState => ({
  loading: false,
  typesUnread: null,
  types: null,
  typesEmpty: null,
  patternsUnread: null,
  groups: null,
  patternsEmpty: null,
  choices: [],
  typeHint: '',
  typeFields: TYPE_FIELDS,
  patternFields: STARTING,
  typeCreate: QUIET,
  rename: QUIET,
  patternCreate: QUIET,
  change: QUIET,
  ...over,
});
const listed = (over: Partial<AvailabilityState> = {}) => state({ types: ROWS, groups: GROUPS, choices: CHOICES, ...over });

function mounted(first: AvailabilityState = listed(), removed: RemoveTypeState = { status: 'idle' }, deleted: DeletePatternState = { status: 'idle' }) {
  const availability$ = new BehaviorSubject<AvailabilityState>(first);
  const removeState$ = new BehaviorSubject<RemoveTypeState>(removed);
  const deletePatternState$ = new BehaviorSubject<DeletePatternState>(deleted);
  const screen = {
    availability$: availability$.asObservable(),
    createType: vi.fn<AvailabilityDeps['screen']['createType']>(),
    rename: vi.fn<AvailabilityDeps['screen']['rename']>(),
    createPattern: vi.fn<AvailabilityDeps['screen']['createPattern']>(),
    change: vi.fn<AvailabilityDeps['screen']['change']>(),
    retryTypes: vi.fn<AvailabilityDeps['screen']['retryTypes']>(),
    retryPatterns: vi.fn<AvailabilityDeps['screen']['retryPatterns']>(),
    // The fake screen knows the zone of these tests' calendar.
    conflicts: vi.fn<AvailabilityDeps['screen']['conflicts']>((conflicts) => conflictList(conflicts, 'Europe/Rome')),
  };
  const types = { remove: vi.fn<AvailabilityDeps['types']['remove']>(), removeState$: removeState$.asObservable() };
  const rules = { deletePattern: vi.fn<AvailabilityDeps['rules']['deletePattern']>(), deletePatternState$: deletePatternState$.asObservable() };
  // The dialog that confirms is mounted by whoever shows the screen and ends with it.
  const confirm = mountConfirm(find('#availability'));
  const subscription = mountAvailability(find('#availability'), { screen, types, rules, confirm });
  subscription.add(confirm.subscription);
  const writes = () => [screen.createType, screen.rename, screen.createPattern, screen.change, types.remove, rules.deletePattern].map((spy) => spy.mock.calls.length);
  return { availability$, removeState$, deletePatternState$, screen, types, rules, subscription, writes };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#availability ${selector}`);
const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(`#availability ${selector}`)];
const html = () => document.documentElement.outerHTML;
const everyField = () => [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')];
// Whether a text is anywhere in the page: in its source, attributes included, or in a field.
const anywhere = (text: string) => html().includes(text) || everyField().some((held) => held.value.includes(text));

// The four forms, by where they are.
const CREATE_TYPE = 'form.create-type';
const RENAME = 'dialog.rename form';
const CREATE_PATTERN = 'form.create-pattern';
const CHANGE = 'dialog.change form';
const form = (selector: string) => one<HTMLFormElement>(selector);
// A start and an end are two lists each, an hour and a minute (src/views/time.parts.ts); the
// helpers below read and set them as one `HH:mm` text, as the view hands them on.
const isTime = (name: string) => name === 'start' || name === 'end';
const lists = (selector: string, name: string): (HTMLInputElement | HTMLSelectElement)[] => (isTime(name) ? clock(form(selector), name) : [one<HTMLInputElement | HTMLSelectElement>(`${selector} [name="${name}"]`)]);
const field = (selector: string, name: string) => lists(selector, name)[0]!;
const value = (selector: string, name: string) => (isTime(name) ? timeIn(form(selector), name) : field(selector, name).value);
const refusalOf = (selector: string, name: string) => field(selector, name).closest('.field')!.querySelector('.refusal')!;
const failureOf = (selector: string) => one(`${selector} .failure`);
const submitOf = (selector: string) => one<HTMLButtonElement>(`${selector} .submit`);
const SIX = ['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil'] as const;
const held = (selector: string) => Object.fromEntries(SIX.map((name) => [name, value(selector, name)])) as PatternFields;
// Fields set as a script sets them, with no event: a time set so sets nothing else.
const set = (selector: string, values: Partial<PatternFields>) => {
  for (const [name, text] of Object.entries(values)) {
    if (isTime(name)) setTime(form(selector), name, text);
    else field(selector, name).value = text;
  }
};
// The fields marked in fault: a time is marked when both its lists are.
const marked = (selector: string) => SIX.filter((name) => lists(selector, name).every((list) => list.getAttribute('aria-invalid') === 'true'));
// The conflicts list of a place, as texts: its sentence, then one line per row; null while hidden.
const conflictsOf = (place: string) => {
  const box = one(`${place} .conflicts`);
  return box.hidden ? null : [box.querySelector('.conflicts-count')!.textContent, ...[...box.querySelectorAll('.conflicts-list li')].map((row) => [...row.children].map((part) => part.textContent).join(' | '))];
};
const SHOWN_CONFLICTS = ['2 appointments are in the way:', 'Mon 23 Nov | 09:00–10:00 | alice', 'Mon 30 Nov | 09:00–10:00 | bob'];

const typeItems = () => all('.types .list > li');
const typeNames = () => typeItems().map((item) => item.querySelector('.name')!.textContent);
const typeButton = (name: string, which: '.ask-rename' | '.ask-delete') => typeItems().find((item) => item.querySelector('.name')!.textContent === name)!.querySelector<HTMLButtonElement>(which)!;
const groups = () => all('.patterns .groups > section').map((section) => [section.querySelector('h4')!.textContent, [...section.querySelectorAll('.list > li')].map((item) => [...item.querySelectorAll<HTMLElement>('span')].filter((part) => !part.hidden).map((part) => part.textContent).join(' | '))]);
const patternItems = () => all('.patterns .groups .list > li');
const patternButton = (index: number, which: '.ask-change' | '.ask-delete') => patternItems()[index]!.querySelector<HTMLButtonElement>(which)!;
const options = (selector: string, name: string) => [...field(selector, name).querySelectorAll('option')].map((option) => [option.value, option.textContent]);
const dialog = (name: 'rename' | 'change' | 'delete') => one<HTMLDialogElement>(`dialog.${name}`);
const removeSubmit = () => one<HTMLButtonElement>('dialog.delete .submit');
const ask = (over: Partial<Ask<string>>): Ask<string> => ({ ...QUIET, ...over });

// Test names: section numbers and D… decisions are those of docs/SHARED_CALENDAR_SPEC.md.
describe('mountAvailability', () => {
  useRealPage();

  describe('at the mount', () => {
    it('the lists of the weekday and of the two times get their choices, in both pattern forms; the hint of a name stands under its two fields', () => {
      mounted(state());
      for (const selector of [CREATE_PATTERN, CHANGE]) {
        expect(options(selector, 'weekday')).toEqual([['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['7', 'Sunday']]);
        const [startHour, startMinute] = clock(form(selector), 'start');
        const [endHour, endMinute] = clock(form(selector), 'end');
        expect([choicesOf(startHour).length, choicesOf(startHour)[0], choicesOf(startHour).at(-1)]).toEqual([24, '00', '23']);
        expect(choicesOf(startMinute)).toEqual(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
        expect([...startMinute.options].map((option) => option.value)).toEqual(choicesOf(startMinute));
        // The end's hours are those after the start's, up to 24 since the start is on the hour,
        // and its one minute is the start's.
        expect([choicesOf(endHour)[0], choicesOf(endHour).at(-1), choicesOf(endMinute)]).toEqual([String(Number(startHour.value) + 1).padStart(2, '0'), '24', ['00']]);
        expect(options(selector, 'typeId')).toEqual([]);
      }
      expect(all('.name-hint').map((hint) => hint.textContent)).toEqual([TYPE_NAME_HINT, TYPE_NAME_HINT]);
    });

    it('no call is made, and no dialog is open', () => {
      const { writes, screen } = mounted();
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
      expect([screen.retryTypes.mock.calls.length, screen.retryPatterns.mock.calls.length]).toEqual([0, 0]);
      expect([dialog('rename').open, dialog('change').open, dialog('delete').open]).toEqual([false, false, false]);
    });
  });

  describe('the states of availability$', () => {
    it('nothing yet: both forms, usable; no row, no "Loading…", no failure; the pattern form on its starting values with no type chosen', () => {
      mounted(state());
      expect([one('.loading').hidden, one('.types .unread').hidden, one('.types .empty').hidden, one('.patterns .unread').hidden, one('.patterns .empty').hidden]).toEqual([true, true, true, true, true]);
      expect([typeItems().length, groups().length]).toEqual([0, 0]);
      expect([field(CREATE_TYPE, 'name').value, submitOf(CREATE_TYPE).disabled, submitOf(CREATE_PATTERN).disabled]).toEqual(['', false, false]);
      expect(held(CREATE_PATTERN)).toEqual({ weekday: '1', start: '09:00', end: '10:00', typeId: '', validFrom: '2026-11-20', validUntil: '' });
      expect(marked(CREATE_PATTERN)).toEqual([]);
    });

    it('reading: "Loading…" is shown, announced', () => {
      mounted(state({ loading: true }));
      expect([one('.loading').hidden, one('.loading').getAttribute('role')]).toEqual([false, 'status']);
    });

    it('the types: one row each, in the order given, with the name and two buttons that say which type', () => {
      mounted();
      expect(typeNames()).toEqual(['Piscina', 'Studio']);
      expect(typeItems().map((item) => [...item.querySelectorAll('button')].map((button) => [button.textContent, button.getAttribute('aria-label')]))).toEqual([
        [['Edit', 'Edit Piscina'], ['Delete', 'Delete Piscina']],
        [['Edit', 'Edit Studio'], ['Delete', 'Delete Studio']],
      ]);
    });

    it('the patterns: one group per weekday under its name, a row with its hours, its type and its validity, "ended" on the one that has', () => {
      mounted();
      expect(groups()).toEqual([
        ['Monday', ['09:00 – 13:00 | Studio | from 20 November 2026']],
        ['Tuesday', ['07:00 – 08:00 | Studio | from 1 January 2026 to 30 June 2026 | ended', '15:00 – 18:00 | Piscina | from 20 November 2026 to 19 January 2027']],
      ]);
      expect(patternItems().map((item) => item.classList.contains('is-ended'))).toEqual([false, true, false]);
      expect([...patternItems()[2]!.querySelectorAll('button')].map((button) => [button.textContent, button.getAttribute('aria-label')])).toEqual([
        ['Change', 'Change Tuesday 15:00 – 18:00 Piscina'],
        ['Delete', 'Delete Tuesday 15:00 – 18:00 Piscina'],
      ]);
    });

    it('the types to choose from fill the list of both pattern forms; in the form that creates, none is chosen', () => {
      mounted();
      for (const selector of [CREATE_PATTERN, CHANGE]) expect(options(selector, 'typeId')).toEqual([[POOL, 'Piscina'], [STUDIO, 'Studio']]);
      expect(field(CREATE_PATTERN, 'typeId').value).toBe('');
    });

    it('two empty lists: their sentences, no row, and under the list of types of the pattern forms that a type must be created first', () => {
      mounted(state({ types: [], typesEmpty: 'There are no types yet.', groups: [], patternsEmpty: 'There are no weekly patterns yet.', typeHint: NO_TYPE_YET }));
      expect([one('.types .empty').hidden, one('.types .empty').textContent]).toEqual([false, 'There are no types yet.']);
      expect([one('.patterns .empty').hidden, one('.patterns .empty').textContent]).toEqual([false, 'There are no weekly patterns yet.']);
      expect(all('.type-hint').map((hint) => hint.textContent)).toEqual([NO_TYPE_YET, NO_TYPE_YET]);
      expect([typeItems().length, groups().length]).toEqual([0, 0]);
    });

    it('the hint about the types goes when the stream says so', () => {
      const { availability$ } = mounted(state({ typeHint: NO_TYPE_YET }));
      availability$.next(listed());
      expect(all('.type-hint').map((hint) => hint.textContent)).toEqual(['', '']);
    });

    it('a read of the types that failed: why, announced, in the place of their list, with "Try again"; the patterns and both forms stay', () => {
      mounted(listed({ types: null, typesUnread: FAILURE }));
      expect([one('.types .unread').hidden, one('.types .unread .error').textContent, one('.types .unread .error').getAttribute('role')]).toEqual([false, FAILURE, 'alert']);
      expect([typeItems().length, groups().length, one('.patterns .unread').hidden]).toEqual([0, 2, true]);
      expect([form(CREATE_TYPE).hidden, submitOf(CREATE_TYPE).disabled, submitOf(CREATE_PATTERN).disabled]).toEqual([false, false, false]);
    });

    it('a read of the patterns that failed: why, announced, in the place of their list; the types stay', () => {
      mounted(listed({ groups: null, patternsUnread: FAILURE }));
      expect([one('.patterns .unread').hidden, one('.patterns .unread .error').textContent, one('.patterns .unread .error').getAttribute('role')]).toEqual([false, FAILURE, 'alert']);
      expect([groups().length, typeNames(), one('.types .unread').hidden]).toEqual([0, ['Piscina', 'Studio'], true]);
    });

    it('a failure goes, and the list is back, when the stream says so', () => {
      const { availability$ } = mounted(listed({ types: null, typesUnread: FAILURE, groups: null, patternsUnread: FAILURE }));
      availability$.next(listed());
      expect([one('.types .unread').hidden, one('.types .unread .error').textContent, one('.patterns .unread').hidden, one('.patterns .unread .error').textContent]).toEqual([true, '', true, '']);
      expect([typeItems().length, groups().length]).toEqual([2, 2]);
    });

    it.each([
      ['typeCreate', CREATE_TYPE],
      ['rename', RENAME],
      ['patternCreate', CREATE_PATTERN],
      ['change', CHANGE],
    ] as const)('a write of the kind %s under way disables its own button, whoever asked, and no other', (name, selector) => {
      const { availability$ } = mounted();
      availability$.next(listed({ [name]: ask({ busy: true }) }));
      expect([CREATE_TYPE, RENAME, CREATE_PATTERN, CHANGE].filter((each) => submitOf(each).disabled)).toEqual([selector]);
      availability$.next(listed());
      expect(submitOf(selector).disabled).toBe(false);
    });

    it('a create of a type that failed: why, announced, in its form, and the field not marked; gone when the stream says so', () => {
      const { availability$ } = mounted(listed({ typeCreate: ask({ failure: FAILURE }) }));
      expect([failureOf(CREATE_TYPE).textContent, failureOf(CREATE_TYPE).getAttribute('role')]).toEqual([FAILURE, 'alert']);
      expect([field(CREATE_TYPE, 'name').hasAttribute('aria-invalid'), refusalOf(CREATE_TYPE, 'name').textContent]).toEqual([false, '']);
      // Nothing of it in the dialog that renames, nor in the form of the patterns.
      expect([failureOf(RENAME).textContent, failureOf(CREATE_PATTERN).textContent]).toEqual(['', '']);
      availability$.next(listed());
      expect(failureOf(CREATE_TYPE).textContent).toBe('');
    });

    it('a create of a pattern that failed: why, announced, in its form, no field marked; gone when the stream says so', () => {
      const { availability$ } = mounted(listed({ patternCreate: ask({ failure: FAILURE }) }));
      expect([failureOf(CREATE_PATTERN).textContent, failureOf(CREATE_PATTERN).getAttribute('role'), marked(CREATE_PATTERN), conflictsOf(CREATE_PATTERN)]).toEqual([FAILURE, 'alert', [], null]);
      expect(failureOf(CHANGE).textContent).toBe('');
      availability$.next(listed());
      expect(failureOf(CREATE_PATTERN).textContent).toBe('');
    });

    it('a write that is done changes nothing in a form that creates by itself: the list and the field follow their own objects', () => {
      mounted(listed({ typeCreate: ask({ done: true }), patternCreate: ask({ done: true }) }));
      expect([typeNames(), groups().length, failureOf(CREATE_TYPE).textContent, failureOf(CREATE_PATTERN).textContent]).toEqual([['Piscina', 'Studio'], 2, '', '']);
    });

    it('an outcome of a rename or of a change with no dialog that asked for it shows nowhere and opens nothing', () => {
      mounted(listed({ rename: ask({ about: STUDIO, failure: FAILURE, refusals: { name: TYPE_NAME_HINT } }), change: ask({ about: P1, done: true, conflicts: IN_THE_WAY, failure: FAILURE }) }));
      expect([dialog('rename').open, dialog('change').open]).toEqual([false, false]);
      expect([failureOf(RENAME).textContent, refusalOf(RENAME, 'name').textContent, failureOf(CHANGE).textContent, conflictsOf(CHANGE)]).toEqual(['', '', '', null]);
    });
  });

  describe('a field in fault', () => {
    it('the name of a new type: its sentence under it, announced, the field marked; gone when the stream says so, what was typed kept all along', () => {
      const { availability$ } = mounted();
      field(CREATE_TYPE, 'name').value = '   ';
      availability$.next(listed({ typeCreate: ask({ refusals: { name: TYPE_NAME_HINT } }) }));
      const refusal = refusalOf(CREATE_TYPE, 'name');
      expect([refusal.textContent, refusal.getAttribute('role'), field(CREATE_TYPE, 'name').getAttribute('aria-invalid'), field(CREATE_TYPE, 'name').value]).toEqual([TYPE_NAME_HINT, 'alert', 'true', '   ']);
      availability$.next(listed());
      expect([refusal.textContent, field(CREATE_TYPE, 'name').hasAttribute('aria-invalid'), field(CREATE_TYPE, 'name').value]).toEqual(['', false, '   ']);
    });

    it('the refusal of a name is the hint that stands under its field', () => {
      mounted();
      expect(one(`${CREATE_TYPE} .hint`).textContent).toBe(TYPE_NAME_HINT);
    });

    it('the fields of a new pattern: each one in fault has its sentence beside it, announced, and is marked; the others are not', () => {
      const { availability$ } = mounted();
      const refusals = { end: 'End must be later than Start.', validFrom: 'Valid from must be a date.' };
      availability$.next(listed({ patternCreate: ask({ refusals }) }));
      expect(marked(CREATE_PATTERN)).toEqual(['end', 'validFrom']);
      expect(SIX.map((name) => refusalOf(CREATE_PATTERN, name).textContent)).toEqual(['', '', refusals.end, '', refusals.validFrom, '']);
      for (const name of SIX) {
        expect(refusalOf(CREATE_PATTERN, name).getAttribute('role'), name).toBe('alert');
        expect(refusalOf(CREATE_PATTERN, name).closest('.field'), name).toBe(field(CREATE_PATTERN, name).closest('.field'));
      }
      // The dialog that changes a pattern has the same fields and shows none of it.
      expect(marked(CHANGE)).toEqual([]);
      availability$.next(listed({ patternCreate: ask({ refusals: { typeId: 'Type must be chosen.' } }) }));
      expect(marked(CREATE_PATTERN)).toEqual(['typeId']);
      availability$.next(listed());
      expect([marked(CREATE_PATTERN), SIX.map((name) => refusalOf(CREATE_PATTERN, name).textContent).join('')]).toEqual([[], '']);
    });

    it('every refusal of the logic layer names its field in the words of the field\'s label', () => {
      mounted();
      const checked = patternFor({ weekday: '1', start: '10:00', end: '10:00', typeId: '', validFrom: '', validUntil: 'x' });
      const before = patternFor({ weekday: '1', start: '09:00', end: '10:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '2026-11-19' });
      if (!('refusals' in checked) || !('refusals' in before)) throw new Error('accepted');
      // The words of a label: its own text, before the field (a list's choices are text of the
      // label too); for a time, the name of its group of two lists.
      const label = (selector: string, name: string) => (isTime(name) ? field(selector, name).closest('fieldset')!.querySelector('legend')!.textContent!.trim() : field(selector, name).closest('label')!.firstChild!.textContent!.trim());
      for (const [name, sentence] of [...Object.entries(checked.refusals), ...Object.entries(before.refusals)]) {
        expect(sentence.startsWith(`${label(CREATE_PATTERN, name)} `), sentence).toBe(true);
        expect(label(CHANGE, name)).toBe(label(CREATE_PATTERN, name));
      }
      expect(Object.keys(checked.refusals)).toEqual(['end', 'typeId', 'validFrom', 'validUntil']);
      // "End must be later than Start." and "… before Valid from." name the other field by its label too.
      expect(checked.refusals.end).toContain(label(CREATE_PATTERN, 'start'));
      expect(before.refusals.validUntil).toContain(label(CREATE_PATTERN, 'validFrom'));
    });
  });

  describe('"Create type"', () => {
    it('calls createType() with the field\'s text as it is, once, and changes nothing on screen by itself', () => {
      const { screen, writes } = mounted();
      field(CREATE_TYPE, 'name').value = ' Sala ';
      const before = html();
      expect(submit(form(CREATE_TYPE)).prevented).toBe(true);
      expect(screen.createType.mock.calls).toEqual([[{ name: ' Sala ', capacity: '1' }]]);
      expect(writes()).toEqual([1, 0, 0, 0, 0, 0]);
      expect(html()).toBe(before);
      expect(field(CREATE_TYPE, 'name').value).toBe(' Sala ');
    });

    it('an empty field goes as an empty text: the view checks nothing', () => {
      const { screen } = mounted();
      submit(form(CREATE_TYPE));
      expect(screen.createType).toHaveBeenCalledWith({ name: '', capacity: '1' });
      expect(field(CREATE_TYPE, 'name').hasAttribute('aria-invalid')).toBe(false);
    });

    it('the field is emptied only when the stream brings another object for it', () => {
      const { availability$ } = mounted();
      field(CREATE_TYPE, 'name').value = 'Sala';
      availability$.next(listed({ typeCreate: ask({ busy: true }) }));
      availability$.next(listed({ typeCreate: ask({ failure: FAILURE }) }));
      availability$.next(listed({ types: typeRows([type(STUDIO, 'Studio')]), typeCreate: ask({ done: true }) }));
      expect(field(CREATE_TYPE, 'name').value).toBe('Sala');
      availability$.next(listed({ typeFields: { name: '', capacity: '1' }, typeCreate: ask({ done: true }) }));
      expect(field(CREATE_TYPE, 'name').value).toBe('');
    });

    it('the two "Try again" call retryTypes() and retryPatterns(), each its own, once', () => {
      const { screen, writes } = mounted(listed({ types: null, typesUnread: FAILURE, groups: null, patternsUnread: FAILURE }));
      one('.types .retry').click();
      expect([screen.retryTypes.mock.calls.length, screen.retryPatterns.mock.calls.length]).toEqual([1, 0]);
      one('.patterns .retry').click();
      expect([screen.retryTypes.mock.calls.length, screen.retryPatterns.mock.calls.length]).toEqual([1, 1]);
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe('the capacity of a type (6.1, D24)', () => {
    // Piscina holds 3 people, Studio 1.
    const WITH_THREE = typeRows([{ ...type(POOL, 'Piscina'), capacity: 3 }, type(STUDIO, 'Studio')]);
    const placesOf = () => typeItems().map((item) => item.querySelector('.places')!.textContent);

    it('a number field in the form that creates and in the dialog that edits, each with the hint of the bounds under it', () => {
      mounted(state());
      for (const selector of [CREATE_TYPE, RENAME]) {
        const input = field(selector, 'capacity');
        expect([input.type, input.closest('label')!.firstChild!.textContent!.trim(), one(`${selector} .capacity-hint`).textContent]).toEqual(['number', 'Capacity', TYPE_CAPACITY_HINT]);
        expect(input.getAttribute('aria-describedby')).toBe(one(`${selector} .capacity-hint`).id);
      }
      expect(field(CREATE_TYPE, 'capacity').value).toBe('1');
    });

    it('a row says its places beside the name only for a capacity above one', () => {
      mounted(listed({ types: WITH_THREE }));
      expect(placesOf()).toEqual(['· 3 places', '']);
    });

    it('"Create type" sends the capacity the field holds, as text', () => {
      const { screen } = mounted();
      field(CREATE_TYPE, 'name').value = 'Vasca';
      field(CREATE_TYPE, 'capacity').value = '3';
      submit(form(CREATE_TYPE));
      expect(screen.createType.mock.calls).toEqual([[{ name: 'Vasca', capacity: '3' }]]);
    });

    it('"Edit" opens with the type\'s own capacity; "Save" sends the field as it holds it', () => {
      const { screen } = mounted(listed({ types: WITH_THREE }));
      typeButton('Piscina', '.ask-rename').click();
      expect(field(RENAME, 'capacity').value).toBe('3');
      field(RENAME, 'capacity').value = '2';
      submit(form(RENAME));
      expect(screen.rename.mock.calls).toEqual([[POOL, { name: 'Piscina', capacity: '2' }]]);
    });

    it('a capacity refused: its sentence under its field, announced, the field marked, the name not; in the form and in the dialog', () => {
      const { availability$ } = mounted();
      availability$.next(listed({ typeCreate: ask({ refusals: { capacity: TYPE_CAPACITY_HINT } }) }));
      expect([refusalOf(CREATE_TYPE, 'capacity').textContent, refusalOf(CREATE_TYPE, 'capacity').getAttribute('role'), field(CREATE_TYPE, 'capacity').getAttribute('aria-invalid'), field(CREATE_TYPE, 'name').hasAttribute('aria-invalid')]).toEqual([
        TYPE_CAPACITY_HINT,
        'alert',
        'true',
        false,
      ]);
      typeButton('Studio', '.ask-rename').click();
      field(RENAME, 'capacity').value = '0';
      submit(form(RENAME));
      availability$.next(listed({ rename: ask({ about: STUDIO, refusals: { capacity: TYPE_CAPACITY_HINT } }) }));
      expect([refusalOf(RENAME, 'capacity').textContent, field(RENAME, 'capacity').getAttribute('aria-invalid'), dialog('rename').open, field(RENAME, 'capacity').value]).toEqual([TYPE_CAPACITY_HINT, 'true', true, '0']);
    });

    it('after a create the form is filled again with the capacity the stream brings', () => {
      const { availability$ } = mounted();
      field(CREATE_TYPE, 'capacity').value = '7';
      availability$.next(listed({ typeFields: { name: '', capacity: '1' }, typeCreate: ask({ done: true }) }));
      expect(field(CREATE_TYPE, 'capacity').value).toBe('1');
    });
  });

  describe('"Create pattern"', () => {
    it('calls createPattern() with the six fields as they are, as text, once, and changes nothing on screen by itself', () => {
      const { screen, writes } = mounted();
      set(CREATE_PATTERN, { weekday: '6', start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' });
      const before = html();
      expect(submit(form(CREATE_PATTERN)).prevented).toBe(true);
      expect(screen.createPattern.mock.calls).toEqual([[{ weekday: '6', start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' }]]);
      expect(writes()).toEqual([0, 0, 1, 0, 0, 0]);
      expect(html()).toBe(before);
    });

    it('fields that would be refused go as they are: no type chosen, no date; the view checks nothing', () => {
      const { screen } = mounted();
      set(CREATE_PATTERN, { start: '09:00', end: '12:00', validFrom: '' });
      submit(form(CREATE_PATTERN));
      expect(screen.createPattern).toHaveBeenCalledWith({ weekday: '1', start: '09:00', end: '12:00', typeId: '', validFrom: '', validUntil: '' });
      expect(marked(CREATE_PATTERN)).toEqual([]);
    });

    it('the form is put back only when the stream brings another object for its fields', () => {
      const { availability$ } = mounted();
      const chosen = { weekday: '6', start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' };
      set(CREATE_PATTERN, chosen);
      availability$.next(listed({ patternCreate: ask({ busy: true }) }));
      availability$.next(listed({ patternCreate: ask({ failure: FAILURE, conflicts: IN_THE_WAY }) }));
      availability$.next(listed({ loading: true, groups: patternGroups(PATTERNS.slice(0, 1), TYPES, '2026-11-20') }));
      expect(held(CREATE_PATTERN)).toEqual(chosen);
      availability$.next(listed({ patternFields: startingFields('2026-11-21'), patternCreate: ask({ done: true }) }));
      expect(held(CREATE_PATTERN)).toEqual({ weekday: '1', start: '09:00', end: '10:00', typeId: '', validFrom: '2026-11-21', validUntil: '' });
    });

    it('a list of types that arrives leaves the type chosen in the form as it is; a chosen type that is gone leaves none chosen', () => {
      const { availability$ } = mounted();
      set(CREATE_PATTERN, { typeId: STUDIO });
      availability$.next(listed({ choices: typeChoices([type('01M6SALA000000000000000000', 'Sala'), ...TYPES]) }));
      expect([options(CREATE_PATTERN, 'typeId').length, field(CREATE_PATTERN, 'typeId').value]).toEqual([3, STUDIO]);
      availability$.next(listed({ choices: typeChoices([type(POOL, 'Piscina')]) }));
      expect([options(CREATE_PATTERN, 'typeId'), field(CREATE_PATTERN, 'typeId').value]).toEqual([[[POOL, 'Piscina']], '']);
    });
  });

  describe('the two times of the pattern forms: hours and minutes, the end chosen as an hour (D33)', () => {
    // Opens the dialog that changes the first pattern, Monday 09:00–13:00, when asked.
    const ready = (selector: string) => {
      const view = mounted();
      if (selector === CHANGE) patternButton(0, '.ask-change').click();
      return view;
    };
    // Opens the dialog that changes a pattern of the given times, the only one listed.
    const openedOn = (start: string, end: string) => {
      const view = mounted(listed({ groups: patternGroups([pattern(P1, { start, end })], TYPES, '2026-11-20') }));
      patternButton(0, '.ask-change').click();
      return view;
    };
    const endChoices = (selector: string) => clock(form(selector), 'end').map(choicesOf);
    const PLACES = [
      ['the form that creates a pattern', CREATE_PATTERN],
      ['the dialog that changes one', CHANGE],
    ] as const;

    it.each(PLACES)('%s: a start chosen sets the end one hour later; chosen twice, sets it twice', (_what, selector) => {
      ready(selector);
      chooseTime(form(selector), 'start', '09:05');
      expect([value(selector, 'start'), value(selector, 'end')]).toEqual(['09:05', '10:05']);
      chooseTime(form(selector), 'start', '14:10');
      expect([value(selector, 'start'), value(selector, 'end')]).toEqual(['14:10', '15:10']);
    });

    it.each(PLACES)('%s: a start 08:05 offers the end\'s hours 09 to 23 and one minute, 05; the end\'s hour 12 gives 12:05, the start kept', (_what, selector) => {
      ready(selector);
      chooseTime(form(selector), 'start', '08:05');
      const [hours, minutes] = endChoices(selector);
      expect([hours![0], hours!.at(-1), hours!.length, minutes, value(selector, 'end')]).toEqual(['09', '23', 15, ['05'], '09:05']);
      choose(clock(form(selector), 'end')[0], '12');
      expect([value(selector, 'start'), value(selector, 'end')]).toEqual(['08:05', '12:05']);
    });

    it.each(PLACES)('%s: a start 08:00 offers the end\'s hour 24; its minute changed to 05 takes it away', (_what, selector) => {
      ready(selector);
      chooseTime(form(selector), 'start', '08:00');
      choose(clock(form(selector), 'end')[0], '24');
      expect([endChoices(selector)[0]!.at(-1), value(selector, 'end')]).toEqual(['24', '24:00']);
      choose(clock(form(selector), 'start')[1], '05');
      expect([endChoices(selector)[0]!.at(-1), value(selector, 'end')]).toEqual(['23', '09:05']);
    });

    it.each(PLACES)('%s: the start\'s minute changed alone keeps the end\'s hour, with the new minute: 08:05–11:05 becomes 08:30–11:30', (_what, selector) => {
      ready(selector);
      chooseTime(form(selector), 'start', '08:05');
      choose(clock(form(selector), 'end')[0], '11');
      choose(clock(form(selector), 'start')[1], '30');
      expect([value(selector, 'start'), value(selector, 'end'), endChoices(selector)[1]]).toEqual(['08:30', '11:30', ['30']]);
    });

    it.each(PLACES)('%s: the start\'s hour 23 offers the minute 00 only, and the end 24:00 alone', (_what, selector) => {
      ready(selector);
      chooseTime(form(selector), 'start', '10:30');
      choose(clock(form(selector), 'start')[0], '23');
      expect([choicesOf(clock(form(selector), 'start')[1]), value(selector, 'start'), endChoices(selector), value(selector, 'end')]).toEqual([['00'], '23:00', [['24'], ['00']], '24:00']);
      choose(clock(form(selector), 'start')[0], '22');
      expect(choicesOf(clock(form(selector), 'start')[1]).length).toBe(12);
    });

    it.each(PLACES)('%s: what is sent is each time as `HH:mm`', (_what, selector) => {
      const { screen } = ready(selector);
      chooseTime(form(selector), 'start', '08:05');
      choose(clock(form(selector), 'end')[0], '11');
      submit(form(selector));
      const sent = selector === CHANGE ? screen.change.mock.lastCall![1] : screen.createPattern.mock.lastCall![0];
      expect([sent.start, sent.end]).toEqual(['08:05', '11:05']);
    });

    it('the dialog that changes a pattern opens with its times as they are: nothing sets the end', () => {
      ready(CHANGE);
      expect([value(CHANGE, 'start'), value(CHANGE, 'end')]).toEqual(['09:00', '13:00']);
    });

    it('the dialog opened on 08:05–12:05 shows it as it is, the end\'s lists those of its start', () => {
      openedOn('08:05', '12:05');
      expect([value(CHANGE, 'start'), value(CHANGE, 'end'), endChoices(CHANGE)[0]![0], endChoices(CHANGE)[1]]).toEqual(['08:05', '12:05', '09', ['05']]);
    });

    it('the dialog opened on a window stored that is not whole hours, 08:30–09:45, shows 09:45 as it is; the save sends it and the model refuses it', () => {
      const { screen } = openedOn('08:30', '09:45');
      expect([value(CHANGE, 'start'), value(CHANGE, 'end'), endChoices(CHANGE)[1]]).toEqual(['08:30', '09:45', ['30', '45']]);
      submit(form(CHANGE));
      expect(patternFor(screen.change.mock.lastCall![1])).toEqual({ refusals: { end: 'End must be a whole number of hours after Start.' } });
    });

    it('the dialog opened on a window stored with a start after 23:00, 23:30–24:00, shows it as it is', () => {
      openedOn('23:30', '24:00');
      expect([value(CHANGE, 'start'), value(CHANGE, 'end')]).toEqual(['23:30', '24:00']);
    });

    it('the form put back by the stream after a create shows 09:00 and 10:00 as they are, whatever the end was', () => {
      const { availability$ } = mounted();
      chooseTime(form(CREATE_PATTERN), 'start', '20:00');
      chooseTime(form(CREATE_PATTERN), 'end', '24:00');
      availability$.next(listed({ patternFields: startingFields('2026-11-21'), patternCreate: ask({ done: true }) }));
      expect([value(CREATE_PATTERN, 'start'), value(CREATE_PATTERN, 'end')]).toEqual(['09:00', '10:00']);
    });

    it('a refusal of the end marks both its lists and stands under its group; the start\'s lists are not marked', () => {
      const { availability$ } = mounted();
      availability$.next(listed({ patternCreate: ask({ refusals: { end: 'End must be later than Start.' } }) }));
      expect([lists(CREATE_PATTERN, 'end').map((list) => list.getAttribute('aria-invalid')), lists(CREATE_PATTERN, 'start').map((list) => list.hasAttribute('aria-invalid'))]).toEqual([['true', 'true'], [false, false]]);
      expect(refusalOf(CREATE_PATTERN, 'end').previousElementSibling!.matches('fieldset.clock')).toBe(true);
    });
  });

  describe('the conflicts list of the form that creates a pattern', () => {
    it('under the failure: the sentence that counts them, then one row each with its date, its time and its User', () => {
      mounted(listed({ patternCreate: ask({ failure: 'This would leave booked appointments outside.', conflicts: IN_THE_WAY }) }));
      expect(failureOf(CREATE_PATTERN).textContent).toBe('This would leave booked appointments outside.');
      expect(conflictsOf(CREATE_PATTERN)).toEqual(SHOWN_CONFLICTS);
      // Not in the two dialogs.
      expect([conflictsOf(CHANGE), conflictsOf('dialog.delete')]).toEqual([null, null]);
    });

    it('gone at the next try: when the stream no longer carries it', () => {
      const { availability$ } = mounted(listed({ patternCreate: ask({ failure: FAILURE, conflicts: IN_THE_WAY }) }));
      availability$.next(listed({ patternCreate: ask({ busy: true }) }));
      expect(conflictsOf(CREATE_PATTERN)).toBeNull();
      expect(one(`${CREATE_PATTERN} .conflicts-list`).children).toHaveLength(0);
      expect(anywhere('alice')).toBe(false);
    });

    it('a username containing <script> is shown as text', () => {
      const conflicts = { sentence: '1 appointment is in the way:', rows: [{ date: 'Mon 23 Nov', time: '09:00–10:00', username: SCRIPT }] };
      mounted(listed({ patternCreate: ask({ failure: FAILURE, conflicts }) }));
      expect(one(`${CREATE_PATTERN} .conflicts-list .username`).textContent).toBe(SCRIPT);
      expect(one(`${CREATE_PATTERN} .conflicts-list`).querySelectorAll('script, b')).toHaveLength(0);
    });
  });

  describe('the dialog that edits a type', () => {
    const opened = (name = 'Studio', first: AvailabilityState = listed()) => {
      const made = mounted(first);
      typeButton(name, '.ask-rename').click();
      return made;
    };
    const rename = (text: string) => {
      field(RENAME, 'name').value = text;
      return submit(form(RENAME));
    };

    it('"Edit" on a row opens it with the type\'s name and capacity in their fields, and no call', () => {
      const { writes } = opened();
      expect([dialog('rename').open, field(RENAME, 'name').value, field(RENAME, 'capacity').value, one('dialog.rename h3').textContent]).toEqual([true, 'Studio', '1', 'Edit type']);
      expect(one(`${RENAME} .hint`).textContent).toBe(TYPE_NAME_HINT);
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('"Close" and the Escape key close it with no call', () => {
      const { writes } = opened();
      one('dialog.rename .close').click();
      expect(dialog('rename').open).toBe(false);
      typeButton('Studio', '.ask-rename').click();
      dialog('rename').close(); // the Escape key
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('"Save" calls rename() with the type\'s id and the two fields as they are, once, and changes nothing by itself', () => {
      const { screen, writes } = opened();
      expect(rename(' Sala ').prevented).toBe(true);
      expect(screen.rename.mock.calls).toEqual([[STUDIO, { name: ' Sala ', capacity: '1' }]]);
      expect(writes()).toEqual([0, 1, 0, 0, 0, 0]);
      expect([dialog('rename').open, field(RENAME, 'name').value, failureOf(RENAME).textContent]).toEqual([true, ' Sala ', '']);
    });

    it('a refusal: under the field of the dialog, announced, the field marked; the dialog stays open, and the form that creates a type shows none of it', () => {
      const { availability$ } = opened();
      rename('  ');
      availability$.next(listed({ rename: ask({ about: STUDIO, refusals: { name: TYPE_NAME_HINT } }) }));
      expect([refusalOf(RENAME, 'name').textContent, refusalOf(RENAME, 'name').getAttribute('role'), field(RENAME, 'name').getAttribute('aria-invalid'), dialog('rename').open, field(RENAME, 'name').value]).toEqual([TYPE_NAME_HINT, 'alert', 'true', true, '  ']);
      expect([refusalOf(CREATE_TYPE, 'name').textContent, field(CREATE_TYPE, 'name').hasAttribute('aria-invalid')]).toEqual(['', false]);
      // The next try that is sent takes it away.
      availability$.next(listed({ rename: ask({ about: STUDIO, busy: true }) }));
      expect([refusalOf(RENAME, 'name').textContent, field(RENAME, 'name').hasAttribute('aria-invalid'), submitOf(RENAME).disabled]).toEqual(['', false, true]);
    });

    it('a failure: in the dialog, announced, which stays open with what was typed; the button works again', () => {
      const { availability$, screen } = opened();
      rename('Piscina');
      availability$.next(listed({ rename: ask({ about: STUDIO, failure: 'A type with this name exists already. Choose another name.' }) }));
      expect([failureOf(RENAME).textContent, failureOf(RENAME).getAttribute('role'), dialog('rename').open, field(RENAME, 'name').value, submitOf(RENAME).disabled]).toEqual(['A type with this name exists already. Choose another name.', 'alert', true, 'Piscina', false]);
      expect(failureOf(CREATE_TYPE).textContent).toBe('');
      rename('Sala');
      expect(screen.rename).toHaveBeenLastCalledWith(STUDIO, { name: 'Sala', capacity: '1' });
    });

    it('a success closes it', () => {
      const { availability$ } = opened();
      rename('Sala');
      availability$.next(listed({ rename: ask({ about: STUDIO, busy: true }) }));
      expect(dialog('rename').open).toBe(true);
      availability$.next(listed({ rename: ask({ about: STUDIO, done: true }) }));
      expect(dialog('rename').open).toBe(false);
    });

    it('an outcome this opening did not ask for changes nothing in it: an earlier one\'s failure, refusal or success', () => {
      const { availability$ } = opened('Studio', listed({ rename: ask({ about: STUDIO, failure: FAILURE }) }));
      expect([dialog('rename').open, failureOf(RENAME).textContent]).toEqual([true, '']);
      availability$.next(listed({ rename: ask({ about: STUDIO, refusals: { name: TYPE_NAME_HINT } }) }));
      availability$.next(listed({ rename: ask({ about: STUDIO, done: true }) }));
      expect([dialog('rename').open, failureOf(RENAME).textContent, refusalOf(RENAME, 'name').textContent, field(RENAME, 'name').value]).toEqual([true, '', '', 'Studio']);
    });

    it('an outcome about another type changes nothing in a dialog that asked: the answer of a rename left under way', () => {
      const { availability$ } = opened('Studio');
      rename('Sala');
      availability$.next(listed({ rename: ask({ about: POOL, failure: FAILURE }) }));
      availability$.next(listed({ rename: ask({ about: POOL, done: true }) }));
      expect([dialog('rename').open, failureOf(RENAME).textContent, field(RENAME, 'name').value]).toEqual([true, '', 'Sala']);
    });

    it('opened for another row, nothing is left of the one before: its name, its refusal, its failure', () => {
      const { availability$, screen } = opened();
      rename('  ');
      availability$.next(listed({ rename: ask({ about: STUDIO, refusals: { name: TYPE_NAME_HINT }, failure: FAILURE }) }));
      dialog('rename').close();
      typeButton('Piscina', '.ask-rename').click();
      expect([field(RENAME, 'name').value, refusalOf(RENAME, 'name').textContent, field(RENAME, 'name').hasAttribute('aria-invalid'), failureOf(RENAME).textContent]).toEqual(['Piscina', '', false, '']);
      // And the state of the first opening, which the stream still holds, does not come back.
      availability$.next(listed({ loading: true, rename: ask({ about: STUDIO, refusals: { name: TYPE_NAME_HINT }, failure: FAILURE }) }));
      expect([refusalOf(RENAME, 'name').textContent, failureOf(RENAME).textContent]).toEqual(['', '']);
      rename('Vasca');
      expect(screen.rename).toHaveBeenLastCalledWith(POOL, { name: 'Vasca', capacity: '1' });
    });

    it('a close event that arrives after the dialog was opened again changes nothing: the dialog still acts on what it shows', () => {
      const { availability$, screen } = opened();
      dialog('rename').close();
      typeButton('Piscina', '.ask-rename').click();
      dialog('rename').dispatchEvent(new Event('close')); // the browser's late event of the first close
      rename('Vasca');
      expect(screen.rename).toHaveBeenLastCalledWith(POOL, { name: 'Vasca', capacity: '1' });
      availability$.next(listed({ rename: ask({ about: POOL, done: true }) }));
      expect(dialog('rename').open).toBe(false);
    });

    it('a list that arrives behind it leaves it as it is', () => {
      const { availability$ } = opened();
      field(RENAME, 'name').value = 'Sal';
      availability$.next(listed({ types: typeRows([type(STUDIO, 'Studio')]), loading: true }));
      expect([dialog('rename').open, field(RENAME, 'name').value, typeNames()]).toEqual([true, 'Sal', ['Studio']]);
    });

    it('a name containing <script> is shown as text in the row, in the names of its buttons and in the dialog\'s field', () => {
      const rows = typeRows([type(STUDIO, SCRIPT)]);
      mounted(listed({ types: rows, choices: typeChoices([type(STUDIO, SCRIPT)]) }));
      expect(typeNames()).toEqual([SCRIPT]);
      expect(typeButton(SCRIPT, '.ask-rename').getAttribute('aria-label')).toBe(`Edit ${SCRIPT}`);
      expect(options(CREATE_PATTERN, 'typeId')).toEqual([[STUDIO, SCRIPT]]);
      typeButton(SCRIPT, '.ask-rename').click();
      expect(field(RENAME, 'name').value).toBe(SCRIPT);
      typeButton(SCRIPT, '.ask-delete').click();
      expect(one('dialog.delete .question').textContent).toBe(`Delete the type ${SCRIPT}? This cannot be undone.`);
      expect(document.querySelectorAll('#availability script, #availability b')).toHaveLength(0);
      expect((window as { hacked?: boolean }).hacked).toBeUndefined();
    });
  });

  describe('the dialog that changes a pattern', () => {
    const TUESDAY_POOL = { weekday: '2', start: '15:00', end: '18:00', typeId: POOL, validFrom: '2026-11-20', validUntil: '2027-01-19' };
    // The third row drawn: Tuesday 15:00 – 18:00 Piscina.
    const opened = (index = 2, first: AvailabilityState = listed()) => {
      const made = mounted(first);
      patternButton(index, '.ask-change').click();
      return made;
    };

    it('"Change" on a row opens it with the pattern\'s six values, and no call; the form that creates is left alone', () => {
      const { writes } = opened();
      expect([dialog('change').open, one('dialog.change h3').textContent]).toEqual([true, 'Change pattern']);
      expect(held(CHANGE)).toEqual(TUESDAY_POOL);
      expect(held(CREATE_PATTERN)).toEqual(STARTING);
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('a pattern with no end opens with "valid until" empty', () => {
      opened(0);
      expect(held(CHANGE)).toEqual({ weekday: '1', start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '' });
    });

    it('"Close" and the Escape key close it with no call', () => {
      const { writes } = opened();
      one('dialog.change .close').click();
      expect(dialog('change').open).toBe(false);
      patternButton(2, '.ask-change').click();
      dialog('change').close(); // the Escape key
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('"Change" calls change() with the pattern\'s id and the six fields as they are, once; sent back untouched they are the pattern\'s own', () => {
      const { screen, writes } = opened();
      expect(submit(form(CHANGE)).prevented).toBe(true);
      expect(screen.change.mock.calls).toEqual([[P2, TUESDAY_POOL]]);
      set(CHANGE, { end: '19:00', validUntil: '' });
      submit(form(CHANGE));
      expect(screen.change).toHaveBeenLastCalledWith(P2, { ...TUESDAY_POOL, end: '19:00', validUntil: '' });
      expect(writes()).toEqual([0, 0, 0, 2, 0, 0]);
      expect(dialog('change').open).toBe(true);
    });

    it('refusals: beside their fields in the dialog, announced, the fields marked; the dialog stays open and the form that creates shows none of it', () => {
      const { availability$ } = opened();
      set(CHANGE, { end: '16:00' });
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P2, refusals: { end: 'End must be a whole number of hours after Start.', validUntil: 'Valid until must not be before Valid from.' } }) }));
      expect(marked(CHANGE)).toEqual(['end', 'validUntil']);
      expect([refusalOf(CHANGE, 'end').textContent, refusalOf(CHANGE, 'end').getAttribute('role'), dialog('change').open, value(CHANGE, 'end')]).toEqual(['End must be a whole number of hours after Start.', 'alert', true, '16:00']);
      expect(marked(CREATE_PATTERN)).toEqual([]);
      availability$.next(listed({ change: ask({ about: P2, busy: true }) }));
      expect([marked(CHANGE), submitOf(CHANGE).disabled]).toEqual([[], true]);
    });

    it('a failure: in the dialog, announced, which stays open with what was chosen; the button works again', () => {
      const { availability$, screen } = opened();
      set(CHANGE, { start: '09:00' });
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P2, failure: FAILURE }) }));
      expect([failureOf(CHANGE).textContent, failureOf(CHANGE).getAttribute('role'), dialog('change').open, value(CHANGE, 'start'), submitOf(CHANGE).disabled]).toEqual([FAILURE, 'alert', true, '09:00', false]);
      expect(failureOf(CREATE_PATTERN).textContent).toBe('');
      submit(form(CHANGE));
      expect(screen.change).toHaveBeenCalledTimes(2);
    });

    it('the conflicts list: under the failure of the dialog; gone at the next try and at the next opening', () => {
      const { availability$ } = opened();
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P2, failure: 'This would leave booked appointments outside.', conflicts: IN_THE_WAY }) }));
      expect([failureOf(CHANGE).textContent, conflictsOf(CHANGE), dialog('change').open]).toEqual(['This would leave booked appointments outside.', SHOWN_CONFLICTS, true]);
      expect([conflictsOf(CREATE_PATTERN), conflictsOf('dialog.delete')]).toEqual([null, null]);
      // The next try.
      availability$.next(listed({ change: ask({ about: P2, busy: true }) }));
      expect([conflictsOf(CHANGE), anywhere('alice')]).toEqual([null, false]);
      // Refused again, closed, and opened again: nothing of it is left.
      availability$.next(listed({ change: ask({ about: P2, failure: FAILURE, conflicts: IN_THE_WAY }) }));
      expect(conflictsOf(CHANGE)).toEqual(SHOWN_CONFLICTS);
      dialog('change').close();
      patternButton(2, '.ask-change').click();
      expect([conflictsOf(CHANGE), failureOf(CHANGE).textContent, anywhere('alice'), anywhere('bob')]).toEqual([null, '', false, false]);
    });

    it('a success closes it', () => {
      const { availability$ } = opened();
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P2, done: true }) }));
      expect(dialog('change').open).toBe(false);
    });

    it('an outcome this opening did not ask for, or about another pattern, changes nothing in it', () => {
      const { availability$ } = opened(2, listed({ change: ask({ about: P2, failure: FAILURE, conflicts: IN_THE_WAY }) }));
      expect([failureOf(CHANGE).textContent, conflictsOf(CHANGE)]).toEqual(['', null]);
      availability$.next(listed({ change: ask({ about: P2, done: true }) }));
      expect(dialog('change').open).toBe(true);
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P1, failure: FAILURE, refusals: { end: 'End must be later than Start.' } }) }));
      availability$.next(listed({ change: ask({ about: P1, done: true }) }));
      expect([dialog('change').open, failureOf(CHANGE).textContent, marked(CHANGE)]).toEqual([true, '', []]);
    });

    it('opened for another row, nothing is left of the one before: its values, its refusals, its failure', () => {
      const { availability$, screen } = opened();
      set(CHANGE, { end: '14:00', weekday: '7' });
      submit(form(CHANGE));
      availability$.next(listed({ change: ask({ about: P2, refusals: { end: 'End must be later than Start.' }, failure: FAILURE, conflicts: IN_THE_WAY }) }));
      dialog('change').close();
      patternButton(0, '.ask-change').click();
      expect(held(CHANGE)).toEqual({ weekday: '1', start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '' });
      expect([marked(CHANGE), refusalOf(CHANGE, 'end').textContent, failureOf(CHANGE).textContent, conflictsOf(CHANGE)]).toEqual([[], '', '', null]);
      availability$.next(listed({ loading: true, change: ask({ about: P2, refusals: { end: 'End must be later than Start.' }, failure: FAILURE, conflicts: IN_THE_WAY }) }));
      expect([marked(CHANGE), failureOf(CHANGE).textContent, conflictsOf(CHANGE)]).toEqual([[], '', null]);
      submit(form(CHANGE));
      expect(screen.change).toHaveBeenLastCalledWith(P1, expect.objectContaining({ weekday: '1' }));
    });

    it('a close event that arrives after the dialog was opened again changes nothing: the dialog still acts on what it shows', () => {
      const { availability$, screen } = opened();
      dialog('change').close();
      patternButton(0, '.ask-change').click();
      dialog('change').dispatchEvent(new Event('close')); // the browser's late event of the first close
      submit(form(CHANGE));
      expect(screen.change).toHaveBeenLastCalledWith(P1, expect.objectContaining({ typeId: STUDIO }));
      availability$.next(listed({ change: ask({ about: P1, done: true }) }));
      expect(dialog('change').open).toBe(false);
    });

    it('lists that arrive behind it leave what is chosen in it as it is, the type too; the rows behind are redrawn', () => {
      const { availability$ } = opened();
      set(CHANGE, { weekday: '5', typeId: STUDIO, validUntil: '' });
      const more = [type('01M6SALA000000000000000000', 'Sala'), ...TYPES];
      availability$.next(listed({ types: typeRows(more), choices: typeChoices(more), groups: patternGroups(PATTERNS.slice(0, 1), more, '2026-11-20') }));
      expect(dialog('change').open).toBe(true);
      expect(held(CHANGE)).toEqual({ ...TUESDAY_POOL, weekday: '5', typeId: STUDIO, validUntil: '' });
      expect([options(CHANGE, 'typeId').length, typeNames().length, patternItems().length]).toEqual([3, 3, 1]);
    });

    it('the chosen type gone from the list that arrives: none is chosen in the dialog, which says nothing by itself', () => {
      const { availability$, screen } = opened();
      availability$.next(listed({ choices: typeChoices([type(STUDIO, 'Studio')]) }));
      expect([field(CHANGE, 'typeId').value, options(CHANGE, 'typeId'), marked(CHANGE)]).toEqual(['', [[STUDIO, 'Studio']], []]);
      // "Change" then sends no type: the logic layer refuses it.
      submit(form(CHANGE));
      expect(screen.change).toHaveBeenLastCalledWith(P2, { ...TUESDAY_POOL, typeId: '' });
    });

    it('a pattern whose type is not among the choices opens with none chosen', () => {
      const lonely = patternGroups([pattern(P1, { typeId: '01M6ZZZZZZZZZZZZZZZZZZZZZZ' })], TYPES, '2026-11-20');
      opened(0, listed({ groups: lonely }));
      expect([field(CHANGE, 'typeId').value, patternItems()[0]!.querySelector('.type-name')!.textContent]).toEqual(['', 'Unknown type']);
    });

    it('a type\'s name containing <script> is shown as text in the row, in the names of its buttons and in the dialog\'s list', () => {
      const scripted = [type(STUDIO, SCRIPT)];
      mounted(listed({ groups: patternGroups(PATTERNS.slice(0, 1), scripted, '2026-11-20'), choices: typeChoices(scripted) }));
      expect(patternItems()[0]!.querySelector('.type-name')!.textContent).toBe(SCRIPT);
      expect(patternButton(0, '.ask-change').getAttribute('aria-label')).toBe(`Change Monday 09:00 – 13:00 ${SCRIPT}`);
      patternButton(0, '.ask-change').click();
      expect(options(CHANGE, 'typeId')).toEqual([[STUDIO, SCRIPT]]);
      dialog('change').close();
      patternButton(0, '.ask-delete').click();
      expect(one('dialog.delete .question').textContent).toContain(SCRIPT);
      expect(document.querySelectorAll('#availability script, #availability b')).toHaveLength(0);
    });
  });

  describe('the dialog that confirms a deletion', () => {
    const TYPE_QUESTION = 'Delete the type Studio? This cannot be undone.';
    const PATTERN_QUESTION = 'Delete the pattern Tuesday 15:00 – 18:00 Piscina, from 20 November 2026 to 19 January 2027? Its hours will no longer be open for booking. This cannot be undone.';
    const aboutType = (removed: RemoveTypeState = { status: 'idle' }, deleted: DeletePatternState = { status: 'idle' }) => {
      const made = mounted(listed(), removed, deleted);
      typeButton('Studio', '.ask-delete').click();
      return made;
    };
    const aboutPattern = (removed: RemoveTypeState = { status: 'idle' }, deleted: DeletePatternState = { status: 'idle' }) => {
      const made = mounted(listed(), removed, deleted);
      patternButton(2, '.ask-delete').click();
      return made;
    };

    it('"Delete" on a type opens it with the question about that type, "Keep" before "Confirm", and no call', () => {
      const { writes } = aboutType();
      expect([dialog('delete').open, one('dialog.delete .question').textContent, one('dialog.delete .error').textContent, conflictsOf('dialog.delete')]).toEqual([true, TYPE_QUESTION, '', null]);
      expect(all('dialog.delete button').map((button) => button.textContent)).toEqual(['Keep', 'Confirm']);
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('"Delete" on a pattern opens it with the question about that pattern', () => {
      const { writes } = aboutPattern();
      expect([dialog('delete').open, one('dialog.delete .question').textContent]).toEqual([true, PATTERN_QUESTION]);
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('"Keep" and the Escape key close it with no call, for a type and for a pattern', () => {
      const { writes } = aboutType();
      one('dialog.delete .keep').click();
      expect(dialog('delete').open).toBe(false);
      patternButton(0, '.ask-delete').click();
      dialog('delete').close(); // the Escape key
      expect(writes()).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('the button deletes what the dialog is about: a type through its service, a pattern through the other, once each', () => {
      const { types, rules, writes } = aboutType();
      removeSubmit().click();
      expect(types.remove.mock.calls).toEqual([[STUDIO]]);
      expect(writes()).toEqual([0, 0, 0, 0, 1, 0]);
      dialog('delete').close();
      patternButton(2, '.ask-delete').click();
      removeSubmit().click();
      expect(rules.deletePattern.mock.calls).toEqual([[P2]]);
      expect(writes()).toEqual([0, 0, 0, 0, 1, 1]);
      // Nothing changes by the click itself.
      expect([dialog('delete').open, one('dialog.delete .error').textContent]).toEqual([true, '']);
    });

    it('pending: the button is disabled while a delete of the kind the dialog is about is under way, and not by one of the other kind', () => {
      const { removeState$, deletePatternState$ } = aboutType();
      deletePatternState$.next({ status: 'pending', patternId: P1 });
      expect(removeSubmit().disabled).toBe(false);
      removeState$.next({ status: 'pending', typeId: STUDIO });
      expect(removeSubmit().disabled).toBe(true);
      expect(one<HTMLButtonElement>('dialog.delete .keep').disabled).toBe(false);
      removeState$.next({ status: 'failure', reason: 'network', message: 'for a developer' });
      expect(removeSubmit().disabled).toBe(false);
      // Opened about a pattern while a pattern's delete is still under way: disabled from the start.
      dialog('delete').close();
      patternButton(0, '.ask-delete').click();
      expect(removeSubmit().disabled).toBe(true);
      deletePatternState$.next({ status: 'success', patternId: P1 });
      expect([removeSubmit().disabled, dialog('delete').open]).toEqual([false, true]);
    });

    it('a type in use: the server\'s refusal in plain words, announced, in the dialog, which stays open; never the service\'s message', () => {
      const { removeState$ } = aboutType();
      removeSubmit().click();
      removeState$.next({ status: 'failure', reason: 'type_in_use', message: 'for a developer' });
      expect([one('dialog.delete .error').textContent, one('dialog.delete .error').getAttribute('role'), dialog('delete').open, removeSubmit().disabled, conflictsOf('dialog.delete')]).toEqual([IN_USE, 'alert', true, false, null]);
      expect(html()).not.toContain('for a developer');
    });

    it.each([
      ['type_not_found', 'This type no longer exists.'],
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['network', FAILURE],
    ] as const)('a delete of a type that fails with %s is said in the dialog, which stays open; the button works again', (reason, sentence) => {
      const { removeState$, types } = aboutType();
      removeSubmit().click();
      removeState$.next({ status: 'failure', reason, message: 'for a developer' });
      expect([one('dialog.delete .error').textContent, dialog('delete').open]).toEqual([sentence, true]);
      removeSubmit().click();
      expect(types.remove).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['pattern_not_found', 'This pattern no longer exists.'],
      ['network', FAILURE],
    ] as const)('a delete of a pattern that fails with %s is said in the dialog, which stays open', (reason, sentence) => {
      const { deletePatternState$ } = aboutPattern();
      removeSubmit().click();
      deletePatternState$.next({ status: 'failure', reason, message: 'for a developer' });
      expect([one('dialog.delete .error').textContent, dialog('delete').open, conflictsOf('dialog.delete')]).toEqual([sentence, true, null]);
    });

    it('a pattern with appointments in the way: the sentence, and under it the conflicts list, made by the screen; gone at the next try and at the next opening', () => {
      const { deletePatternState$, screen } = aboutPattern();
      removeSubmit().click();
      deletePatternState$.next({ status: 'failure', reason: 'availability_conflict', message: 'for a developer', conflicts: CONFLICTS });
      expect(screen.conflicts).toHaveBeenLastCalledWith(CONFLICTS);
      expect([one('dialog.delete .error').textContent, conflictsOf('dialog.delete'), dialog('delete').open]).toEqual(['This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.', SHOWN_CONFLICTS, true]);
      expect([conflictsOf(CREATE_PATTERN), conflictsOf(CHANGE)]).toEqual([null, null]);
      expect(html()).not.toContain('appt-1');
      // The next try.
      removeSubmit().click();
      deletePatternState$.next({ status: 'pending', patternId: P2 });
      expect([conflictsOf('dialog.delete'), one('dialog.delete .error').textContent, anywhere('alice')]).toEqual([null, '', false]);
      // Refused again, then closed and opened about another row.
      deletePatternState$.next({ status: 'failure', reason: 'availability_conflict', message: 'for a developer', conflicts: CONFLICTS });
      dialog('delete').close();
      patternButton(0, '.ask-delete').click();
      expect([conflictsOf('dialog.delete'), one('dialog.delete .error').textContent, anywhere('alice'), anywhere('bob')]).toEqual([null, '', false, false]);
    });

    it('availability_conflict with no list shows the sentence alone', () => {
      const { deletePatternState$ } = aboutPattern();
      removeSubmit().click();
      deletePatternState$.next({ status: 'failure', reason: 'availability_conflict', message: 'for a developer' });
      expect([one('dialog.delete .error').textContent.startsWith('This would leave booked appointments'), conflictsOf('dialog.delete')]).toEqual([true, null]);
    });

    it('a success closes it, for a type and for a pattern; the row goes only with the list the stream brings', () => {
      const { removeState$, deletePatternState$ } = aboutType();
      removeSubmit().click();
      removeState$.next({ status: 'success', typeId: STUDIO });
      expect([dialog('delete').open, typeNames()]).toEqual([false, ['Piscina', 'Studio']]);
      patternButton(2, '.ask-delete').click();
      removeSubmit().click();
      deletePatternState$.next({ status: 'success', patternId: P2 });
      expect([dialog('delete').open, patternItems().length]).toEqual([false, 3]);
    });

    it('a result this opening did not ask for changes nothing in it: an earlier failure or success, of either kind', () => {
      const { removeState$, deletePatternState$ } = aboutType({ status: 'failure', reason: 'type_in_use', message: 'm' }, { status: 'success', patternId: P1 });
      expect([dialog('delete').open, one('dialog.delete .error').textContent]).toEqual([true, '']);
      removeState$.next({ status: 'success', typeId: POOL });
      deletePatternState$.next({ status: 'failure', reason: 'availability_conflict', message: 'm', conflicts: CONFLICTS });
      expect([dialog('delete').open, one('dialog.delete .error').textContent, conflictsOf('dialog.delete')]).toEqual([true, '', null]);
    });

    it('asked about a type, the result of a pattern\'s delete is not its own: nothing is said and it stays open', () => {
      const { deletePatternState$ } = aboutType();
      removeSubmit().click();
      deletePatternState$.next({ status: 'failure', reason: 'network', message: 'm' });
      deletePatternState$.next({ status: 'success', patternId: P1 });
      expect([dialog('delete').open, one('dialog.delete .error').textContent]).toEqual([true, '']);
    });

    it('a close event that arrives after the dialog was opened again changes nothing: it still deletes what it shows, and closes on its success', () => {
      const { rules, deletePatternState$ } = aboutType();
      dialog('delete').close();
      patternButton(2, '.ask-delete').click();
      dialog('delete').dispatchEvent(new Event('close')); // the browser's late event of the first close
      removeSubmit().click();
      expect(rules.deletePattern.mock.calls).toEqual([[P2]]);
      deletePatternState$.next({ status: 'success', patternId: P2 });
      expect(dialog('delete').open).toBe(false);
    });

    it('lists that arrive behind it leave it as it is', () => {
      const { availability$ } = aboutPattern();
      availability$.next(listed({ loading: true, groups: patternGroups(PATTERNS.slice(0, 1), TYPES, '2026-11-20') }));
      expect([dialog('delete').open, one('dialog.delete .question').textContent, patternItems().length]).toEqual([true, PATTERN_QUESTION, 1]);
    });
  });

  describe('what is redrawn, and when', () => {
    it('the rows are redrawn only when their list object changed: a button keeps being the same element through other notifications', () => {
      const { availability$ } = mounted();
      const [rename, change] = [typeButton('Studio', '.ask-rename'), patternButton(0, '.ask-change')];
      const option = field(CREATE_PATTERN, 'typeId').querySelector('option');
      availability$.next(listed({ loading: true }));
      availability$.next(listed({ typeCreate: ask({ failure: FAILURE }), patternCreate: ask({ refusals: { typeId: 'Type must be chosen.' } }) }));
      availability$.next(listed({ typeFields: { name: '', capacity: '1' }, patternFields: startingFields('2026-11-20') }));
      expect([typeButton('Studio', '.ask-rename'), patternButton(0, '.ask-change'), field(CREATE_PATTERN, 'typeId').querySelector('option')]).toEqual([rename, change, option]);
      expect(typeButton('Studio', '.ask-rename')).toBe(rename);
      expect(patternButton(0, '.ask-change')).toBe(change);
      // Another list of types leaves the patterns' rows, and the other way round.
      availability$.next(listed({ types: typeRows(TYPES) }));
      expect([typeButton('Studio', '.ask-rename') === rename, patternButton(0, '.ask-change') === change]).toEqual([false, true]);
      availability$.next(listed({ types: typeRows(TYPES), groups: patternGroups(PATTERNS, TYPES, '2026-11-20') }));
      expect(patternButton(0, '.ask-change')).not.toBe(change);
    });

    it('a list taken away by the stream is taken off the page', () => {
      const { availability$ } = mounted();
      availability$.next(state());
      expect([typeItems().length, groups().length, options(CREATE_PATTERN, 'typeId').length]).toEqual([0, 0, 0]);
    });
  });

  describe('after unsubscribing', () => {
    it('nothing is left in the page: no row, no option, no name, no conflict, every dialog closed and empty, the forms as index.html has them, no field in fault', () => {
      const untouched = html();
      const { availability$, deletePatternState$, subscription } = mounted();
      // Everything at once: values typed, refusals, failures, the three conflicts lists, the three dialogs open.
      field(CREATE_TYPE, 'name').value = 'Sala nuova';
      set(CREATE_PATTERN, { weekday: '4', typeId: POOL, validUntil: '2027-05-05' });
      typeButton('Studio', '.ask-rename').click();
      submit(form(RENAME));
      patternButton(2, '.ask-change').click();
      submit(form(CHANGE));
      patternButton(2, '.ask-delete').click();
      removeSubmit().click();
      deletePatternState$.next({ status: 'failure', reason: 'availability_conflict', message: 'm', conflicts: CONFLICTS });
      availability$.next(
        listed({
          loading: true,
          typesEmpty: 'There are no types yet.',
          patternsUnread: FAILURE,
          typeHint: NO_TYPE_YET,
          typeCreate: ask({ busy: true, refusals: { name: TYPE_NAME_HINT }, failure: FAILURE }),
          rename: ask({ about: STUDIO, busy: true, refusals: { name: TYPE_NAME_HINT }, failure: FAILURE }),
          patternCreate: ask({ busy: true, refusals: { end: 'End must be later than Start.' }, failure: FAILURE, conflicts: IN_THE_WAY }),
          change: ask({ about: P2, busy: true, refusals: { validFrom: 'Valid from must be a date.' }, failure: FAILURE, conflicts: IN_THE_WAY }),
        }),
      );
      expect([dialog('rename').open, dialog('change').open, dialog('delete').open]).toEqual([true, true, true]);
      expect([conflictsOf(CREATE_PATTERN), conflictsOf(CHANGE), conflictsOf('dialog.delete')]).toEqual([SHOWN_CONFLICTS, SHOWN_CONFLICTS, SHOWN_CONFLICTS]);

      subscription.unsubscribe();
      expect([dialog('rename').open, dialog('change').open, dialog('delete').open]).toEqual([false, false, false]);
      expect(all('li, option, .groups section')).toHaveLength(0);
      for (const gone of ['Studio', 'Piscina', 'alice', 'bob', 'Sala nuova', 'Mon 23 Nov', 'appointments are in the way', 'Monday', TYPE_NAME_HINT, FAILURE, 'Delete the', STUDIO, POOL, P2]) expect(anywhere(gone), gone).toBe(false);
      const fields = [...find('#availability').querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select, textarea')];
      // The 20 fields of this view's four forms, and the 11 of the part about a single date: a
      // start and an end are two lists each.
      expect([fields.length, fields.map((each) => each.value).join('')]).toEqual([31, '']);
      expect(all('[aria-invalid], :disabled')).toHaveLength(0);
      // The page is the one index.html has.
      expect(html()).toBe(untouched);
    });

    it('the streams are no longer listened to, and a late notification draws nothing', () => {
      const { availability$, removeState$, deletePatternState$, subscription } = mounted(state());
      subscription.unsubscribe();
      expect([availability$.observed, removeState$.observed, deletePatternState$.observed]).toEqual([false, false, false]);
      availability$.next(listed({ typeCreate: ask({ failure: FAILURE }) }));
      expect([typeItems().length, groups().length, failureOf(CREATE_TYPE).textContent]).toEqual([0, 0, '']);
    });

    it('mounted again on the same page, it starts clean and works', () => {
      const first = mounted();
      typeButton('Studio', '.ask-rename').click();
      first.subscription.unsubscribe();
      const { screen } = mounted();
      expect([typeNames(), dialog('rename').open, options(CREATE_PATTERN, 'weekday').length]).toEqual([['Piscina', 'Studio'], false, 7]);
      typeButton('Piscina', '.ask-rename').click();
      submit(form(RENAME));
      expect(screen.rename.mock.calls).toEqual([[POOL, { name: 'Piscina', capacity: '1' }]]);
      expect(first.screen.rename).not.toHaveBeenCalled();
    });
  });

  it('the page of these tests is the real one: loaded again, it has the element the view is mounted on', () => {
    loadPage();
    expect(find('#availability').hidden).toBe(true);
  });
});
