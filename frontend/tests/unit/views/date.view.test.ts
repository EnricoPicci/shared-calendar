import { toInstant, type AppointmentConflict, type AvailabilityType, type CalendarDay, type CalendarWindow } from '@shared-calendar/shared';
import { BehaviorSubject } from 'rxjs';
import { typeChoices } from '../../../src/logic/availability.model';
import type { Ask } from '../../../src/logic/availability.screen';
import { conflictList } from '../../../src/logic/conflicts';
import { dateFor, dayModel, draftAdd, draftModel, DRAFT_FULL, DRAFT_OPEN, OVERLAPS_DRAFT, PAST_DATE, STARTING_WINDOW, windowFor, type WindowFields } from '../../../src/logic/date.model';
import type { DateState } from '../../../src/logic/date.screen';
import { mountConfirm } from '../../../src/views/availability.parts';
import { mountDate, type DateDeps } from '../../../src/views/date.view';
import { POOL, STUDIO } from '../logic/fixtures';
import { find, loadPage, submit, useRealPage } from './page';

// The DOM test of the view of a single date (docs/FRONTEND_ARCHITECTURE.md section 8): the
// real index.html, a fake DateScreen whose stream the test controls, and the real dialog that
// confirms, mounted as the shell mounts it. What a day's windows are, whether a date or a
// window is accepted, what the draft holds and the words of a refusal are checked in the logic
// layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const CONFLICT = 'This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.';
const ROME = 'Europe/Rome';
const MONDAY = '2026-11-23';
const W1 = '01M6W1ND0W0000000000000001';
const W2 = '01M6W1ND0W0000000000000002';
const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const TYPES: AvailabilityType[] = [
  { typeId: POOL, name: 'Piscina', ...STAMPS },
  { typeId: STUDIO, name: 'Studio', ...STAMPS },
];
const PATTERN = { patternId: '01M6PATTERN000000000000001', weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS };
const CONFLICTS: AppointmentConflict[] = [
  { appointmentId: 'appt-2', username: 'bob', start: '2026-11-23T09:00:00.000Z', end: '2026-11-23T10:00:00.000Z' },
  { appointmentId: 'appt-1', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' },
];
const IN_THE_WAY = conflictList(CONFLICTS, ROME)!;
const SHOWN_CONFLICTS = ['2 appointments are in the way:', 'Mon 23 Nov | 09:00–10:00 | alice', 'Mon 23 Nov | 10:00–11:00 | bob'];

const seen = (start: string, end: string, typeId: string, typeName: string, source: CalendarWindow['source'], sourceId = MONDAY): CalendarWindow => ({ start: toInstant(MONDAY, start, ROME), end: toInstant(MONDAY, end, ROME), typeId, typeName, source, sourceId });
const dayOf = (windows: CalendarWindow[], hasOverride = false, types = TYPES) => {
  const day: CalendarDay = { date: MONDAY, weekday: 1, windows, slots: [], busy: [], hasOverride };
  return dayModel(MONDAY, [PATTERN], types, day, ROME);
};
// The days these tests show: as the pattern gives it; with its own windows and two extra
// ones; not available.
const PLAIN = dayOf([seen('09:00', '13:00', STUDIO, 'Studio', 'pattern', PATTERN.patternId)]);
const OWN = dayOf([seen('10:00', '12:00', STUDIO, 'Studio', 'override'), seen('14:00', '16:00', POOL, 'Piscina', 'override'), seen('18:00', '20:00', POOL, 'Piscina', 'one_off', W1), seen('20:00', '24:00', STUDIO, 'Studio', 'one_off', W2)], true);
const CLOSED = dayOf([], true);
const DRAFT = draftModel([{ start: '09:00', end: '13:00', typeId: STUDIO }, { start: '14:00', end: '16:00', typeId: POOL }], TYPES);

// The objects of the state stay the same from one state to the next unless a test brings
// another: another object is what tells the view to draw a list or to fill a form again.
const QUIET: Ask<never> = { about: '', busy: false, refusals: {}, failure: null, conflicts: null, done: false };
const ask = (over: Partial<Ask<string>>): Ask<never> => ({ ...QUIET, ...over }) as Ask<never>;
const CHOICES = typeChoices(TYPES);
const FIELD = { date: '2026-11-20' };
const state = (over: Partial<DateState> = {}): DateState => ({
  loading: false,
  field: FIELD,
  refusal: null,
  unread: null,
  day: null,
  offers: { change: false, back: false },
  choices: CHOICES,
  draft: null,
  addFields: STARTING_WINDOW,
  add: QUIET,
  save: QUIET,
  windowFields: STARTING_WINDOW,
  window: QUIET,
  confirm: QUIET,
  ...over,
});
// A day on show, with the actions the logic layer offers for it.
const showing = (day = PLAIN, over: Partial<DateState> = {}) => state({ day, offers: { change: true, back: day.hasOverride }, ...over });
const editing = (over: Partial<DateState> = {}) => showing(PLAIN, { draft: DRAFT, offers: { change: false, back: false }, ...over });

function mounted(first: DateState = state()) {
  const date$ = new BehaviorSubject<DateState>(first);
  const screen = {
    date$: date$.asObservable(),
    show: vi.fn<DateDeps['screen']['show']>(),
    retry: vi.fn<DateDeps['screen']['retry']>(),
    edit: vi.fn<DateDeps['screen']['edit']>(),
    add: vi.fn<DateDeps['screen']['add']>(),
    remove: vi.fn<DateDeps['screen']['remove']>(),
    discard: vi.fn<DateDeps['screen']['discard']>(),
    save: vi.fn<DateDeps['screen']['save']>(),
    addWindow: vi.fn<DateDeps['screen']['addWindow']>(),
    close: vi.fn<DateDeps['screen']['close']>(),
    back: vi.fn<DateDeps['screen']['back']>(),
    removeWindow: vi.fn<DateDeps['screen']['removeWindow']>(),
  };
  // The dialog that confirms is mounted by whoever shows the screen and ends with it.
  const confirm = mountConfirm(find('#availability'));
  const subscription = mountDate(find('#availability'), { screen, confirm });
  subscription.add(confirm.subscription);
  const calls = () => Object.fromEntries(Object.entries(screen).filter(([name]) => name !== 'date$').map(([name, spy]) => [name, (spy as ReturnType<typeof vi.fn>).mock.calls.length]));
  const NONE = Object.fromEntries(Object.keys(calls()).map((name) => [name, 0]));
  return { date$, screen, confirm, subscription, calls, NONE };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#availability .one-date ${selector}`);
const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...find('#availability .one-date').querySelectorAll<T>(selector)];
const html = () => document.documentElement.outerHTML;
const everyField = () => [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')];
// Whether a text is anywhere in the page: in its source, attributes included, or in a field.
const anywhere = (text: string) => html().includes(text) || everyField().some((held) => held.value.includes(text));

const CHOOSE = 'form.choose';
const ADD = 'form.add-draft';
const WINDOW = 'form.add-window';
const form = (selector: string) => one<HTMLFormElement>(selector);
const field = (selector: string, name: string) => one<HTMLInputElement | HTMLSelectElement>(`${selector} [name="${name}"]`);
const refusalOf = (selector: string, name: string) => field(selector, name).closest('.field')!.querySelector('.refusal')!;
const THREE = ['start', 'end', 'typeId'] as const;
const held = (selector: string) => Object.fromEntries(THREE.map((name) => [name, field(selector, name).value])) as WindowFields;
const set = (selector: string, values: Partial<WindowFields>) => {
  for (const [name, value] of Object.entries(values)) field(selector, name).value = value;
};
const marked = (selector: string) => THREE.filter((name) => field(selector, name).getAttribute('aria-invalid') === 'true');
const options = (selector: string, name: string) => [...field(selector, name).querySelectorAll('option')].map((option) => [option.value, option.textContent]);
const rows = (list: string) => all(`.${list} > li`).map((item) => [...item.querySelectorAll('span')].map((part) => part.textContent).join(' | '));
const buttonsOf = (list: string) => all<HTMLButtonElement>(`.${list} > li button`);
const shownButtons = () => all<HTMLButtonElement>('.as-now .actions button').filter((button) => !button.hidden).map((button) => button.textContent);
const conflictsOf = (box: HTMLElement) => (box.hidden ? null : [box.querySelector('.conflicts-count')!.textContent, ...[...box.querySelectorAll('.conflicts-list li')].map((row) => [...row.children].map((part) => part.textContent).join(' | '))]);
const draftConflicts = () => conflictsOf(one('.draft > .conflicts'));
// The dialog that confirms, which is the screen's, outside the part.
const dialog = () => find<HTMLDialogElement>('#availability dialog.delete');
const inDialog = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#availability dialog.delete ${selector}`);
const dialogConflicts = () => conflictsOf(inDialog('.conflicts'));

describe('mountDate', () => {
  useRealPage();

  describe('at the mount', () => {
    it('the lists of the two times get their choices in both forms that add a window; no call is made and the dialog is closed', () => {
      const { calls, NONE } = mounted(state({ choices: [] }));
      for (const selector of [ADD, WINDOW]) {
        const starts = options(selector, 'start');
        const ends = options(selector, 'end');
        expect([starts.length, starts[0], starts.at(-1), ends.length, ends[0], ends.at(-1)]).toEqual([96, ['00:00', '00:00'], ['23:45', '23:45'], 96, ['00:15', '00:15'], ['24:00', '24:00']]);
        expect(options(selector, 'typeId')).toEqual([]);
        expect(held(selector)).toEqual({ start: '09:00', end: '10:00', typeId: '' });
      }
      expect([calls(), dialog().open]).toEqual([NONE, false]);
    });

    it('it touches nothing of the screen\'s other parts: their lists stay empty', () => {
      mounted();
      expect([...find('#availability').querySelectorAll('.types select option, .patterns select option, dialog.change select option')]).toHaveLength(0);
    });
  });

  describe('the states of date$', () => {
    it('nothing shown yet: the date field as the stream fills it, no day, no draft, no "Loading…", no failure', () => {
      mounted();
      expect([field(CHOOSE, 'date').value, one('.shown').hidden, one('.draft').hidden, one('.loading').hidden, one('.unread').hidden, refusalOf(CHOOSE, 'date').textContent]).toEqual(['2026-11-20', true, true, true, true, '']);
    });

    it('reading: "Loading…" is shown, announced', () => {
      const { date$ } = mounted();
      date$.next(state({ loading: true }));
      expect([one('.loading').hidden, one('.loading').getAttribute('role')]).toEqual([false, 'status']);
      date$.next(state());
      expect(one('.loading').hidden).toBe(true);
    });

    it('the date field is filled only when the stream brings another object for it: what is being typed is left alone', () => {
      const { date$ } = mounted();
      field(CHOOSE, 'date').value = '2026-12-01';
      date$.next(state({ loading: true }));
      expect(field(CHOOSE, 'date').value).toBe('2026-12-01');
      date$.next(state({ field: { date: '2026-11-21' } }));
      expect(field(CHOOSE, 'date').value).toBe('2026-11-21');
    });

    it('a refusal of the date: its sentence under the field, announced, the field marked; gone when the stream says so, what was typed kept', () => {
      const { date$ } = mounted();
      field(CHOOSE, 'date').value = '2026-11-01';
      date$.next(state({ refusal: PAST_DATE }));
      expect([refusalOf(CHOOSE, 'date').textContent, refusalOf(CHOOSE, 'date').getAttribute('role'), field(CHOOSE, 'date').getAttribute('aria-invalid'), field(CHOOSE, 'date').value]).toEqual([PAST_DATE, 'alert', 'true', '2026-11-01']);
      expect(one('.shown').hidden).toBe(true);
      date$.next(state());
      expect([refusalOf(CHOOSE, 'date').textContent, field(CHOOSE, 'date').hasAttribute('aria-invalid'), field(CHOOSE, 'date').value]).toEqual(['', false, '2026-11-01']);
    });

    it('a read that failed: why, announced, in the place of the day, with "Try again"; gone when the stream says so', () => {
      const { date$ } = mounted();
      date$.next(state({ unread: FAILURE }));
      expect([one('.unread').hidden, one('.unread .error').textContent, one('.unread .error').getAttribute('role'), one('.shown').hidden]).toEqual([false, FAILURE, 'alert', true]);
      date$.next(showing());
      expect([one('.unread').hidden, one('.unread .error').textContent, one('.shown').hidden]).toEqual([true, '', false]);
    });

    it('a day as the weekly patterns give it: the date in words, the two descriptions, no extra window, and the two actions of every day', () => {
      mounted(showing());
      expect(one('.date-words').textContent).toBe('Monday 23 November 2026');
      expect([rows('given-rows'), one('.given .none').textContent]).toEqual([['09:00 – 13:00 | Studio'], '']);
      expect([one('.which').textContent, rows('own-rows')]).toEqual(['The weekly patterns apply on this day.', []]);
      expect([rows('extra-rows'), one('.extras .none').textContent]).toEqual([[], 'This day has no extra windows.']);
      expect(shownButtons()).toEqual(['This day only…', 'Not available on this day']);
      expect(one('.draft').hidden).toBe(true);
    });

    it('a day with its own windows and extra ones: each kind in its list, "Delete" on each extra one saying which, and the way back offered', () => {
      mounted(showing(OWN));
      expect([one('.which').textContent, rows('own-rows')]).toEqual(['This day has its own windows, in the place of the weekly patterns.', ['10:00 – 12:00 | Studio', '14:00 – 16:00 | Piscina']]);
      expect([rows('extra-rows'), one('.extras .none').textContent]).toEqual([['18:00 – 20:00 | Piscina', '20:00 – 24:00 | Studio'], '']);
      expect(buttonsOf('extra-rows').map((button) => [button.textContent, button.getAttribute('aria-label')])).toEqual([
        ['Delete', 'Delete the extra window 18:00 – 20:00 Piscina'],
        ['Delete', 'Delete the extra window 20:00 – 24:00 Studio'],
      ]);
      // The patterns' description is unchanged by what the day has now.
      expect(rows('given-rows')).toEqual(['09:00 – 13:00 | Studio']);
      expect(shownButtons()).toEqual(['This day only…', 'Not available on this day', 'Back to the weekly patterns']);
    });

    it('a day that is not available says so, with no window of its own', () => {
      mounted(showing(CLOSED));
      expect([one('.which').textContent, rows('own-rows'), shownButtons()]).toEqual(['This day is not available: the weekly patterns do not apply.', [], ['This day only…', 'Not available on this day', 'Back to the weekly patterns']]);
    });

    it('a day the patterns give nothing: the sentence in the place of the list', () => {
      const day: CalendarDay = { date: MONDAY, weekday: 1, windows: [], slots: [], busy: [], hasOverride: false };
      mounted(showing(dayModel(MONDAY, [], TYPES, day, ROME)));
      expect([rows('given-rows'), one('.given .none').textContent]).toEqual([[], 'The weekly patterns give no hours on this day.']);
    });

    it('which buttons are shown is the stream\'s to say: none of the three while it offers none', () => {
      const { date$ } = mounted(showing(OWN));
      date$.next(showing(OWN, { offers: { change: false, back: false } }));
      expect(shownButtons()).toEqual([]);
      date$.next(showing(OWN, { offers: { change: true, back: false } }));
      expect(shownButtons()).toEqual(['This day only…', 'Not available on this day']);
    });

    it('the day taken away by the stream is taken off the page', () => {
      const { date$ } = mounted(showing(OWN));
      date$.next(state({ unread: FAILURE }));
      expect([one('.shown').hidden, one('.date-words').textContent, rows('own-rows'), rows('extra-rows'), rows('given-rows')]).toEqual([true, '', [], [], []]);
    });

    it('the types to choose from fill the list of both forms that add a window; none is chosen', () => {
      mounted();
      for (const selector of [ADD, WINDOW]) {
        expect(options(selector, 'typeId')).toEqual([[POOL, 'Piscina'], [STUDIO, 'Studio']]);
        expect([field(selector, 'typeId').value, (field(selector, 'typeId') as HTMLSelectElement).selectedIndex]).toEqual(['', -1]);
      }
    });

    it('a list of types that arrives leaves the type chosen as it is; a chosen type that is gone leaves none chosen', () => {
      const { date$ } = mounted();
      set(ADD, { typeId: STUDIO });
      set(WINDOW, { typeId: POOL });
      date$.next(state({ choices: typeChoices([TYPES[1]!, { typeId: '01M6NEW0000000000000000000', name: 'Sala', ...STAMPS }]) }));
      expect([field(ADD, 'typeId').value, field(WINDOW, 'typeId').value, options(ADD, 'typeId').length]).toEqual([STUDIO, '', 2]);
    });
  });

  describe('the date\'s form', () => {
    it('"Show" calls show() with the field as it is, once, and changes nothing on screen by itself', () => {
      const { screen, calls, NONE } = mounted();
      field(CHOOSE, 'date').value = MONDAY;
      expect(submit(form(CHOOSE)).prevented).toBe(true);
      expect(screen.show.mock.calls).toEqual([[MONDAY]]);
      expect([calls(), one('.shown').hidden, one('.loading').hidden]).toEqual([{ ...NONE, show: 1 }, true, true]);
    });

    it('an empty field and a past date go as they are: the view checks nothing', () => {
      const { screen } = mounted();
      field(CHOOSE, 'date').value = '';
      submit(form(CHOOSE));
      field(CHOOSE, 'date').value = '2020-01-01';
      submit(form(CHOOSE));
      expect(screen.show.mock.calls).toEqual([[''], ['2020-01-01']]);
      // What the logic layer would say of them is its own to decide.
      expect([dateFor('', '2026-11-20'), dateFor('2020-01-01', '2026-11-20')]).toEqual([{ refusal: 'Choose a date.' }, { refusal: PAST_DATE }]);
    });

    it('"Try again" calls retry(), once', () => {
      const { screen, calls, NONE } = mounted(state({ unread: FAILURE }));
      one('.retry').click();
      expect([screen.retry.mock.calls, calls()]).toEqual([[[]], { ...NONE, retry: 1 }]);
    });
  });

  describe('the windows being put together', () => {
    it('shown only while the stream carries them: a row each, with its hours, its type and a "Remove" that says which', () => {
      const { date$ } = mounted(showing());
      expect(one('.draft').hidden).toBe(true);
      date$.next(editing());
      expect([one('.draft').hidden, rows('draft-rows'), one('.draft-empty').textContent]).toEqual([false, ['09:00 – 13:00 | Studio', '14:00 – 16:00 | Piscina'], '']);
      expect(buttonsOf('draft-rows').map((button) => [button.textContent, button.getAttribute('aria-label')])).toEqual([
        ['Remove', 'Remove 09:00 – 13:00 Studio'],
        ['Remove', 'Remove 14:00 – 16:00 Piscina'],
      ]);
      expect(shownButtons()).toEqual([]);
      date$.next(showing());
      expect([one('.draft').hidden, rows('draft-rows')]).toEqual([true, []]);
    });

    it('none left: the sentence of an empty list', () => {
      mounted(editing({ draft: draftModel([], TYPES) }));
      expect([rows('draft-rows'), one('.draft-empty').textContent]).toEqual([[], 'No window is left: saved like this, the day is not available.']);
    });

    it('no row holds a field: only texts and one button', () => {
      mounted(editing());
      expect(all('.draft-rows input, .draft-rows select, .draft-rows textarea, .extra-rows input, .extra-rows select')).toHaveLength(0);
    });

    it('"This day only…" calls edit(), once, and shows nothing by itself', () => {
      const { screen, calls, NONE } = mounted(showing());
      one('.edit').click();
      expect([screen.edit.mock.calls, calls(), one('.draft').hidden]).toEqual([[[]], { ...NONE, edit: 1 }, true]);
    });

    it('a row\'s "Remove" calls remove() with its place in the list, once, and removes nothing by itself', () => {
      const { screen, calls, NONE } = mounted(editing());
      buttonsOf('draft-rows')[1]!.click();
      expect([screen.remove.mock.calls, calls(), rows('draft-rows').length]).toEqual([[[1]], { ...NONE, remove: 1 }, 2]);
    });

    it('"Add" calls add() with the three fields as they are, as text, once', () => {
      const { screen, calls, NONE } = mounted(editing());
      set(ADD, { start: '17:00', end: '18:15', typeId: POOL });
      expect(submit(form(ADD)).prevented).toBe(true);
      expect([screen.add.mock.calls, calls()]).toEqual([[[{ start: '17:00', end: '18:15', typeId: POOL }]], { ...NONE, add: 1 }]);
    });

    it('fields that would be refused go as they are: no type, an end before the start; the view checks nothing', () => {
      const { screen } = mounted(editing());
      set(ADD, { start: '17:00', end: '16:00' });
      submit(form(ADD));
      expect(screen.add.mock.calls).toEqual([[{ start: '17:00', end: '16:00', typeId: '' }]]);
    });

    it('the refusals of "Add": each field in fault has its sentence under it, announced, and is marked; gone when the stream says so, what was chosen kept', () => {
      const { date$ } = mounted(editing());
      set(ADD, { start: '12:00', end: '15:00', typeId: POOL });
      date$.next(editing({ add: ask({ refusals: { start: OVERLAPS_DRAFT, end: OVERLAPS_DRAFT } }) }));
      expect([marked(ADD), refusalOf(ADD, 'start').textContent, refusalOf(ADD, 'end').textContent, refusalOf(ADD, 'typeId').textContent, refusalOf(ADD, 'end').getAttribute('role')]).toEqual([['start', 'end'], OVERLAPS_DRAFT, OVERLAPS_DRAFT, '', 'alert']);
      // The form that adds an extra window shows none of it.
      expect([marked(WINDOW), refusalOf(WINDOW, 'start').textContent]).toEqual([[], '']);
      date$.next(editing({ add: ask({ refusals: { typeId: 'Type must be chosen.' } }) }));
      expect([marked(ADD), refusalOf(ADD, 'start').textContent, refusalOf(ADD, 'typeId').textContent]).toEqual([['typeId'], '', 'Type must be chosen.']);
      date$.next(editing());
      expect([marked(ADD), held(ADD)]).toEqual([[], { start: '12:00', end: '15:00', typeId: POOL }]);
    });

    it('every refusal of the logic layer names its field in the words of the field\'s label: at its start, or, for the one sentence that stands under two fields, both labels at its start', () => {
      mounted(editing());
      const refused = draftAdd([], { start: '10:00', end: '09:00', typeId: '' });
      const overlap = draftAdd([{ start: '09:00', end: '12:00', typeId: STUDIO }], { start: '10:00', end: '11:00', typeId: STUDIO });
      const window = windowFor(MONDAY, { start: '10:00', end: '09:00', typeId: '' });
      for (const [selector, made] of [[ADD, refused], [ADD, overlap], [WINDOW, window]] as const) {
        const refusals = 'refusals' in made ? made.refusals : {};
        expect(Object.keys(refusals).length).toBeGreaterThan(0);
        for (const [name, sentence] of Object.entries(refusals)) {
          const label = field(selector, name).closest('label')!.childNodes[0]!.textContent!.trim();
          expect(sentence === OVERLAPS_DRAFT ? sentence.startsWith('Start and End ') && sentence.includes(label) : sentence.startsWith(label), `${name}: ${sentence}`).toBe(true);
        }
      }
    });

    it('the limit of windows is the failure of the form that adds, announced, no field marked', () => {
      const { date$ } = mounted(editing());
      date$.next(editing({ add: ask({ failure: DRAFT_FULL }) }));
      expect([one(`${ADD} .failure`).textContent, one(`${ADD} .failure`).getAttribute('role'), marked(ADD)]).toEqual([DRAFT_FULL, 'alert', []]);
    });

    it('the form that adds is put back only when the stream brings another object for its fields', () => {
      const { date$ } = mounted(editing());
      set(ADD, { start: '17:00', end: '18:00', typeId: POOL });
      date$.next(editing({ loading: true }));
      expect(held(ADD)).toEqual({ start: '17:00', end: '18:00', typeId: POOL });
      date$.next(editing({ addFields: { ...STARTING_WINDOW } }));
      expect([held(ADD), (field(ADD, 'typeId') as HTMLSelectElement).selectedIndex]).toEqual([{ start: '09:00', end: '10:00', typeId: '' }, -1]);
    });

    it('"Save this day" and "Discard" call save() and discard(), once each, and change nothing by themselves', () => {
      const { screen, calls, NONE } = mounted(editing());
      one('.save').click();
      expect([screen.save.mock.calls, calls()]).toEqual([[[]], { ...NONE, save: 1 }]);
      one('.discard').click();
      expect([screen.discard.mock.calls, calls(), one('.draft').hidden]).toEqual([[[]], { ...NONE, save: 1, discard: 1 }, false]);
    });

    it('while the save is under way "Save this day", "Discard" and "Add" are disabled; they come back with the stream', () => {
      const { date$ } = mounted(editing());
      const three = () => [one<HTMLButtonElement>('.save').disabled, one<HTMLButtonElement>('.discard').disabled, one<HTMLButtonElement>(`${ADD} .submit`).disabled];
      date$.next(editing({ save: ask({ busy: true }) }));
      expect(three()).toEqual([true, true, true]);
      date$.next(editing({ save: ask({ failure: FAILURE }) }));
      expect(three()).toEqual([false, false, false]);
    });

    it('a save that failed: why, announced, under the windows, which stay; the conflicts list under it; both gone at the next try', () => {
      const { date$ } = mounted(editing());
      date$.next(editing({ save: ask({ failure: CONFLICT, conflicts: IN_THE_WAY }) }));
      expect([one('.save-failure').textContent, one('.save-failure').getAttribute('role'), draftConflicts(), rows('draft-rows').length]).toEqual([CONFLICT, 'alert', SHOWN_CONFLICTS, 2]);
      // The form that adds says nothing of it.
      expect(one(`${ADD} .failure`).textContent).toBe('');
      date$.next(editing({ save: ask({ busy: true }) }));
      expect([one('.save-failure').textContent, draftConflicts()]).toEqual(['', null]);
    });

    it('a failure that names no appointment shows its sentence alone', () => {
      const { date$ } = mounted(editing());
      date$.next(editing({ save: ask({ failure: FAILURE }) }));
      expect([one('.save-failure').textContent, draftConflicts()]).toEqual([FAILURE, null]);
    });

    it('a refusal of "Show" while they are open stands under the date field, and they keep their rows', () => {
      const { date$ } = mounted(editing());
      date$.next(editing({ refusal: DRAFT_OPEN }));
      expect([refusalOf(CHOOSE, 'date').textContent, rows('draft-rows').length]).toEqual([DRAFT_OPEN, 2]);
    });
  });

  describe('an extra window', () => {
    it('"Add window" calls addWindow() with the three fields as they are, as text, once, and changes nothing on screen by itself', () => {
      const { screen, calls, NONE } = mounted(showing());
      set(WINDOW, { start: '18:00', end: '24:00', typeId: POOL });
      expect(submit(form(WINDOW)).prevented).toBe(true);
      expect([screen.addWindow.mock.calls, calls(), rows('extra-rows')]).toEqual([[[{ start: '18:00', end: '24:00', typeId: POOL }]], { ...NONE, addWindow: 1 }, []]);
    });

    it('its refusals stand under its fields, announced, the fields marked; the form of the draft shows none of them', () => {
      const { date$ } = mounted(editing());
      date$.next(editing({ window: ask({ refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.' } }) }));
      expect([marked(WINDOW), refusalOf(WINDOW, 'end').textContent, refusalOf(WINDOW, 'typeId').textContent, refusalOf(WINDOW, 'typeId').getAttribute('role'), marked(ADD)]).toEqual([['end', 'typeId'], 'End must be later than Start.', 'Type must be chosen.', 'alert', []]);
    });

    it('a create under way disables its button; a failure is said in its form, announced, with what was chosen kept; gone when the stream says so', () => {
      const { date$ } = mounted(showing());
      set(WINDOW, { start: '18:00', end: '20:00', typeId: POOL });
      date$.next(showing(PLAIN, { window: ask({ busy: true }) }));
      expect(one<HTMLButtonElement>(`${WINDOW} .submit`).disabled).toBe(true);
      date$.next(showing(PLAIN, { window: ask({ failure: FAILURE }) }));
      expect([one<HTMLButtonElement>(`${WINDOW} .submit`).disabled, one(`${WINDOW} .failure`).textContent, one(`${WINDOW} .failure`).getAttribute('role'), held(WINDOW)]).toEqual([false, FAILURE, 'alert', { start: '18:00', end: '20:00', typeId: POOL }]);
      date$.next(showing(PLAIN, { window: ask({ done: true }) }));
      expect(one(`${WINDOW} .failure`).textContent).toBe('');
    });

    it('its form is put back only when the stream brings another object for its fields', () => {
      const { date$ } = mounted(showing());
      set(WINDOW, { start: '18:00', end: '20:00', typeId: POOL });
      date$.next(showing(OWN));
      expect(held(WINDOW)).toEqual({ start: '18:00', end: '20:00', typeId: POOL });
      date$.next(showing(OWN, { windowFields: { ...STARTING_WINDOW } }));
      expect(held(WINDOW)).toEqual({ start: '09:00', end: '10:00', typeId: '' });
    });
  });

  describe('the dialog that confirms', () => {
    const CLOSE_QUESTION = 'Make Monday 23 November 2026 not available? No hours of the weekly patterns, and none of its own, will be open for booking on this day. Its extra windows stay.';
    const BACK_QUESTION = 'Back to the weekly patterns for Monday 23 November 2026? What was set for this day only will be removed. Its extra windows stay.';
    const WINDOW_QUESTION = 'Delete the extra window 18:00 – 20:00 Piscina of Monday 23 November 2026? Its hours will no longer be open for booking. This cannot be undone.';
    // The three kinds: how each is opened, what the stream calls it, its question and its call.
    const KINDS = [
      { kind: 'not available', open: () => one('.make-closed').click(), about: 'close', question: CLOSE_QUESTION, method: 'close', args: [] as string[] },
      { kind: 'back to the weekly patterns', open: () => one('.back').click(), about: 'back', question: BACK_QUESTION, method: 'back', args: [] as string[] },
      { kind: 'an extra window', open: () => buttonsOf('extra-rows')[0]!.click(), about: W1, question: WINDOW_QUESTION, method: 'removeWindow', args: [W1] },
    ] as const;

    describe.each(KINDS)('for $kind', ({ open, about, question, method, args }) => {
      it('opens with its question under neutral words, "Keep" before "Confirm", nothing said yet, and no call', () => {
        const { calls, NONE } = mounted(showing(OWN));
        open();
        expect([dialog().open, inDialog('h3').textContent, inDialog('.question').textContent, inDialog('.error').textContent, dialogConflicts()]).toEqual([true, 'Please confirm', question, '', null]);
        expect([...dialog().querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Keep', 'Confirm']);
        expect(calls()).toEqual(NONE);
      });

      it('"Keep" and the Escape key close it with no call', () => {
        const { calls, NONE } = mounted(showing(OWN));
        open();
        inDialog('.keep').click();
        expect(dialog().open).toBe(false);
        open();
        dialog().close(); // the Escape key
        expect(calls()).toEqual(NONE);
      });

      it('"Confirm" makes its call, once, and changes nothing by itself', () => {
        const { screen, calls, NONE } = mounted(showing(OWN));
        open();
        inDialog('.submit').click();
        expect([screen[method].mock.calls, calls(), dialog().open]).toEqual([[args], { ...NONE, [method]: 1 }, true]);
      });

      it('pending: the button is disabled while an action of the dialog is under way, and when it opens during one', () => {
        const { date$ } = mounted(showing(OWN));
        open();
        date$.next(showing(OWN, { confirm: ask({ about, busy: true }) }));
        expect(inDialog<HTMLButtonElement>('.submit').disabled).toBe(true);
        date$.next(showing(OWN));
        expect(inDialog<HTMLButtonElement>('.submit').disabled).toBe(false);
        dialog().close();
        date$.next(showing(OWN, { confirm: ask({ about: 'another', busy: true }) }));
        open();
        expect(inDialog<HTMLButtonElement>('.submit').disabled).toBe(true);
      });

      it('a failure: in plain words, announced, in the dialog, which stays open; the button works again', () => {
        const { date$, screen } = mounted(showing(OWN));
        open();
        inDialog('.submit').click();
        date$.next(showing(OWN, { confirm: ask({ about, failure: FAILURE }) }));
        expect([dialog().open, inDialog('.error').textContent, inDialog('.error').getAttribute('role'), dialogConflicts(), inDialog<HTMLButtonElement>('.submit').disabled]).toEqual([true, FAILURE, 'alert', null, false]);
        inDialog('.submit').click();
        expect(screen[method].mock.calls).toHaveLength(2);
      });

      it('appointments in the way: the sentence, and under it the conflicts list; gone at the next try and at the next opening', () => {
        const { date$ } = mounted(showing(OWN));
        open();
        inDialog('.submit').click();
        date$.next(showing(OWN, { confirm: ask({ about, failure: CONFLICT, conflicts: IN_THE_WAY }) }));
        expect([inDialog('.error').textContent, dialogConflicts()]).toEqual([CONFLICT, SHOWN_CONFLICTS]);
        date$.next(showing(OWN, { confirm: ask({ about, busy: true }) }));
        expect([inDialog('.error').textContent, dialogConflicts()]).toEqual(['', null]);
        date$.next(showing(OWN, { confirm: ask({ about, failure: CONFLICT, conflicts: IN_THE_WAY }) }));
        dialog().close();
        open();
        expect([inDialog('.error').textContent, dialogConflicts()]).toEqual(['', null]);
      });

      it('a success closes it', () => {
        const { date$ } = mounted(showing(OWN));
        open();
        inDialog('.submit').click();
        date$.next(showing(OWN, { confirm: ask({ about, done: true }) }));
        expect(dialog().open).toBe(false);
      });

      it('an outcome this opening did not ask for changes nothing in it: an earlier one\'s failure or success', () => {
        const { date$ } = mounted(showing(OWN, { confirm: ask({ about, failure: FAILURE, conflicts: IN_THE_WAY }) }));
        open();
        expect([inDialog('.error').textContent, dialogConflicts()]).toEqual(['', null]);
        date$.next(showing(OWN, { confirm: ask({ about, done: true }) }));
        expect(dialog().open).toBe(true);
      });

      it('an outcome about something else changes nothing in a dialog that asked: no failure said, and it stays open', () => {
        const { date$ } = mounted(showing(OWN));
        open();
        inDialog('.submit').click();
        date$.next(showing(OWN, { confirm: ask({ about: 'something else', failure: FAILURE, conflicts: IN_THE_WAY }) }));
        expect([inDialog('.error').textContent, dialogConflicts(), dialog().open]).toEqual(['', null, true]);
        date$.next(showing(OWN, { confirm: ask({ about: 'something else', done: true }) }));
        expect(dialog().open).toBe(true);
      });

      it('a close event that arrives after the dialog was opened again changes nothing: it still acts on what it shows, and closes on its success', () => {
        const { date$, screen } = mounted(showing(OWN));
        open();
        dialog().close();
        open();
        dialog().dispatchEvent(new Event('close')); // the browser's late event of the first close
        inDialog('.submit').click();
        expect(screen[method].mock.calls).toEqual([args]);
        date$.next(showing(OWN, { confirm: ask({ about, done: true }) }));
        expect(dialog().open).toBe(false);
      });
    });

    it('opened for another thing, nothing is left of the one before: its question, its failure, its conflicts, and the outcome of the first is not the second\'s', () => {
      const { date$, screen } = mounted(showing(OWN));
      one('.make-closed').click();
      inDialog('.submit').click();
      date$.next(showing(OWN, { confirm: ask({ about: 'close', failure: CONFLICT, conflicts: IN_THE_WAY }) }));
      dialog().close();
      buttonsOf('extra-rows')[1]!.click();
      expect([inDialog('.question').textContent.includes('20:00 – 24:00 Studio'), inDialog('.error').textContent, dialogConflicts()]).toEqual([true, '', null]);
      inDialog('.submit').click();
      expect(screen.removeWindow.mock.calls).toEqual([[W2]]);
      // The stream still says what "not available" said: it is not shown in this opening.
      expect(inDialog('.error').textContent).toBe('');
    });

    it('a day that arrives behind it leaves it as it is', () => {
      const { date$ } = mounted(showing(OWN));
      one('.back').click();
      date$.next(showing(CLOSED, { loading: true }));
      expect([dialog().open, inDialog('.question').textContent.startsWith('Back to the weekly patterns for Monday 23 November 2026?')]).toEqual([true, true]);
    });

    it('opened by the screen\'s other view afterwards, it is no longer this view\'s: what the stream says changes nothing in it', () => {
      const { date$, confirm } = mounted(showing(OWN));
      one('.make-closed').click();
      inDialog('.submit').click();
      dialog().close();
      const other = vi.fn();
      confirm.open('Delete the type Studio? This cannot be undone.', false, other);
      inDialog('.submit').click();
      date$.next(showing(OWN, { confirm: ask({ about: 'close', failure: FAILURE, done: true }) }));
      expect([dialog().open, inDialog('.error').textContent, inDialog('.question').textContent, other.mock.calls.length]).toEqual([true, '', 'Delete the type Studio? This cannot be undone.', 1]);
    });
  });

  describe('what is redrawn, and when', () => {
    it('the rows are redrawn only when their object changed: a button keeps being the same element through other notifications', () => {
      const { date$ } = mounted(editing({ day: OWN }));
      const before = [buttonsOf('extra-rows')[0], buttonsOf('draft-rows')[0], all('.own-rows > li')[0]];
      date$.next(editing({ day: OWN, loading: true, refusal: DRAFT_OPEN, save: ask({ failure: FAILURE }), window: ask({ busy: true }), confirm: ask({ about: 'close', busy: true }) }));
      expect([buttonsOf('extra-rows')[0], buttonsOf('draft-rows')[0], all('.own-rows > li')[0]]).toEqual(before);
      expect(before.every((element, i) => element === [buttonsOf('extra-rows')[0], buttonsOf('draft-rows')[0], all('.own-rows > li')[0]][i])).toBe(true);
      // Another draft object redraws the draft's rows only; another day the day's only.
      date$.next(editing({ day: OWN, draft: draftModel([], TYPES) }));
      expect([buttonsOf('extra-rows')[0] === before[0], buttonsOf('draft-rows').length]).toEqual([true, 0]);
      date$.next(editing({ day: dayOf([seen('18:00', '20:00', POOL, 'Piscina', 'one_off', W1)], true) }));
      expect([buttonsOf('extra-rows')[0] === before[0], rows('extra-rows')]).toEqual([false, ['18:00 – 20:00 | Piscina']]);
    });
  });

  describe('a text typed by one person and shown to another', () => {
    it('a type\'s name containing <script> is shown as text in every place it appears: the three lists of the day, the draft, the names of the buttons, the choices and the dialog', () => {
      const types: AvailabilityType[] = [{ typeId: STUDIO, name: SCRIPT, ...STAMPS }];
      const day = dayOf([seen('10:00', '12:00', STUDIO, SCRIPT, 'override'), seen('18:00', '20:00', STUDIO, SCRIPT, 'one_off', W1)], true, types);
      mounted(showing(day, { draft: draftModel([{ start: '10:00', end: '12:00', typeId: STUDIO }], types), choices: typeChoices(types) }));
      expect([rows('given-rows'), rows('own-rows'), rows('extra-rows'), rows('draft-rows')]).toEqual([[`09:00 – 13:00 | ${SCRIPT}`], [`10:00 – 12:00 | ${SCRIPT}`], [`18:00 – 20:00 | ${SCRIPT}`], [`10:00 – 12:00 | ${SCRIPT}`]]);
      expect([buttonsOf('extra-rows')[0]!.getAttribute('aria-label'), buttonsOf('draft-rows')[0]!.getAttribute('aria-label')]).toEqual([`Delete the extra window 18:00 – 20:00 ${SCRIPT}`, `Remove 10:00 – 12:00 ${SCRIPT}`]);
      expect(options(ADD, 'typeId')).toEqual([[STUDIO, SCRIPT]]);
      buttonsOf('extra-rows')[0]!.click();
      expect(inDialog('.question').textContent).toContain(SCRIPT);
      expect(find('#availability').querySelectorAll('script, b')).toHaveLength(0);
      expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
    });

    it('a username containing <script> in a conflicts list is shown as text, in the draft and in the dialog', () => {
      const list = conflictList([{ appointmentId: 'appt-1', username: SCRIPT, start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }], ROME)!;
      const { date$ } = mounted(editing({ save: ask({ failure: CONFLICT, conflicts: list }) }));
      expect(draftConflicts()).toEqual(['1 appointment is in the way:', `Mon 23 Nov | 09:00–10:00 | ${SCRIPT}`]);
      one('.discard').click();
      date$.next(showing(OWN));
      one('.make-closed').click();
      inDialog('.submit').click();
      date$.next(showing(OWN, { confirm: ask({ about: 'close', failure: CONFLICT, conflicts: list }) }));
      expect(dialogConflicts()).toEqual(['1 appointment is in the way:', `Mon 23 Nov | 09:00–10:00 | ${SCRIPT}`]);
      expect(find('#availability').querySelectorAll('script, b')).toHaveLength(0);
    });
  });

  describe('after unsubscribing', () => {
    it('nothing is left in the page: no row, no choice, no date, no conflict, the dialog closed and empty, the forms as index.html has them, no field in fault', () => {
      const untouched = html();
      const { date$, subscription } = mounted(showing(OWN));
      // Everything at once: a date typed, values chosen, refusals, failures, two conflicts lists, the dialog open.
      field(CHOOSE, 'date').value = '2026-12-24';
      set(ADD, { start: '17:00', end: '18:00', typeId: POOL });
      set(WINDOW, { start: '21:00', end: '22:00', typeId: STUDIO });
      buttonsOf('extra-rows')[0]!.click();
      inDialog('.submit').click();
      date$.next(
        editing({
          day: OWN,
          loading: true,
          refusal: DRAFT_OPEN,
          unread: FAILURE,
          add: ask({ refusals: { start: OVERLAPS_DRAFT, end: OVERLAPS_DRAFT }, failure: DRAFT_FULL }),
          save: ask({ busy: true, failure: CONFLICT, conflicts: IN_THE_WAY }),
          window: ask({ busy: true, refusals: { typeId: 'Type must be chosen.' }, failure: FAILURE }),
          confirm: ask({ about: W1, busy: true, failure: CONFLICT, conflicts: IN_THE_WAY }),
        }),
      );
      expect([dialog().open, draftConflicts(), dialogConflicts(), one('.draft').hidden]).toEqual([true, SHOWN_CONFLICTS, SHOWN_CONFLICTS, false]);

      subscription.unsubscribe();
      expect(dialog().open).toBe(false);
      expect(find('#availability').querySelectorAll('li, option')).toHaveLength(0);
      for (const gone of ['Studio', 'Piscina', 'alice', 'bob', 'Monday', '2026-12-24', 'Mon 23 Nov', 'appointments are in the way', '09:00', 'Delete the', FAILURE, DRAFT_OPEN, DRAFT_FULL, STUDIO, POOL, W1]) expect(anywhere(gone), gone).toBe(false);
      const fields = all<HTMLInputElement | HTMLSelectElement>('input, select, textarea');
      expect([fields.length, fields.map((each) => each.value).join('')]).toEqual([7, '']);
      expect(find('#availability').querySelectorAll('[aria-invalid], :disabled')).toHaveLength(0);
      // The page is the one index.html has.
      expect(html()).toBe(untouched);
    });

    it('the stream is no longer listened to, and a late notification draws nothing', () => {
      const { date$, subscription } = mounted();
      subscription.unsubscribe();
      expect(date$.observed).toBe(false);
      date$.next(editing({ unread: FAILURE }));
      expect([one('.shown').hidden, one('.unread').hidden, rows('draft-rows'), rows('given-rows')]).toEqual([true, true, [], []]);
    });

    it('mounted again on the same page, it starts clean and works', () => {
      const first = mounted(editing({ day: OWN }));
      one('.make-closed').click();
      first.subscription.unsubscribe();
      const { screen } = mounted(showing(OWN));
      expect([dialog().open, rows('draft-rows'), rows('own-rows').length, options(ADD, 'start').length, held(WINDOW)]).toEqual([false, [], 2, 96, { start: '09:00', end: '10:00', typeId: '' }]);
      one('.back').click();
      inDialog('.submit').click();
      expect([screen.back.mock.calls.length, first.screen.back.mock.calls.length, first.screen.close.mock.calls.length]).toEqual([1, 0, 0]);
    });
  });

  it('the page of these tests is the real one: loaded again, it has the part the view wires', () => {
    loadPage();
    expect([find('#availability').hidden, find('#availability .one-date .shown').hidden]).toEqual([true, true]);
  });
});
