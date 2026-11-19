import { BehaviorSubject } from 'rxjs';
import type { DayModel, Placed, WeekModel } from '../../../src/logic/week.model';
import type { WeekState } from '../../../src/logic/week.screen';
import { mountWeek, type WeekDeps } from '../../../src/views/week.view';
import { find, useRealPage } from './page';

// The DOM test of the week view (docs/FRONTEND_ARCHITECTURE.md section 8): the real index.html,
// and a fake WeekScreen whose stream the test controls and whose methods are spies. The weeks
// are written by hand: what the view does with a week is checked here, how a week is made is
// checked in the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';

const at = (top: string, height: string, time: string, lane: 0 | 1 = 0, lanes: 1 | 2 = 1): Placed => ({ top, height, time, lane, lanes });
const day = (date: string, label: string, over: Partial<DayModel> = {}): DayModel => ({
  date,
  label,
  today: false,
  windows: [],
  slots: [],
  busy: [],
  appointments: [],
  ...over,
});

// A week with one of everything on Monday, and the two repeated slots side by side.
const WEEK: WeekModel = {
  timeZone: 'Europe/Rome',
  hours: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  legend: [
    { name: 'Studio', colour: 2 },
    { name: 'Swimming Pool', colour: 5 },
  ],
  days: [
    day('2026-11-16', 'Mon 16 Nov', {
      windows: [{ ...at('0%', '40%', '08:00–12:00'), typeName: 'Studio', colour: 2 }],
      slots: [
        { ...at('0%', '10%', '08:00–09:00'), colour: 2 },
        { ...at('60%', '10%', '02:00 +02:00 – 02:00 +01:00', 0, 2), colour: 5 },
        { ...at('60%', '10%', '02:00 +01:00 – 03:00 +01:00', 1, 2), colour: 5 },
      ],
      busy: [at('10%', '10%', '09:00–10:00')],
      appointments: [{ ...at('30%', '12.5%', '11:00–12:15'), who: 'You', typeName: 'Studio', note: 'First lesson', colour: 2 }],
    }),
    day('2026-11-17', 'Tue 17 Nov', { today: true }),
    ...['Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov'].map((label, i) => day(`2026-11-${18 + i}`, label)),
  ],
};

// Another week, with other names, to see that nothing of the first one is left.
const OTHER: WeekModel = {
  timeZone: 'Asia/Kolkata',
  hours: ['06:00', '07:00'],
  legend: [{ name: 'Piscina', colour: 1 }],
  days: [
    day('2026-11-23', 'Mon 23 Nov', {
      appointments: [{ ...at('0%', '50%', '06:00–07:00'), who: 'bob', typeName: 'Piscina', note: '', colour: 1 }],
    }),
  ],
};

const state = (over: Partial<WeekState> = {}): WeekState => ({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: null, ...over });

function mounted(first: WeekState = state()) {
  const week$ = new BehaviorSubject<WeekState>(first);
  const screen = {
    week$: week$.asObservable(),
    previous: vi.fn<WeekDeps['previous']>(),
    next: vi.fn<WeekDeps['next']>(),
    today: vi.fn<WeekDeps['today']>(),
  };
  const root = find('#week');
  const subscription = mountWeek(root, screen);
  return { week$, screen, root, subscription };
}

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(`#week ${selector}`)];
const texts = (selector: string) => all(selector).map((element) => element.textContent);
const html = () => document.documentElement.outerHTML;

describe('mountWeek', () => {
  useRealPage();

  describe('the states of week$', () => {
    it('nothing yet: the label, no "Loading…", no failure, no time zone, no week', () => {
      mounted();
      expect(find('#week .week-label').textContent).toBe('16 Nov – 22 Nov 2026');
      expect(find('#week .loading').hidden).toBe(true);
      expect(find('#week .failure').hidden).toBe(true);
      expect(find('#week .zone').hidden).toBe(true);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
      expect(all('.day, .hours li, .legend li')).toHaveLength(0);
    });

    it('loading without a week: "Loading…" is shown and the week dimmed', () => {
      mounted(state({ loading: true }));
      expect(find('#week .loading').hidden).toBe(false);
      expect(find('#week .loading').textContent).toBe('Loading…');
      expect(find('#week .week').classList.contains('stale')).toBe(true);
      expect(all('.day')).toHaveLength(0);
    });

    it('a week: the time zone in a sentence, the legend, the hours, the seven days', () => {
      mounted(state({ week: WEEK }));
      expect(find('#week .zone').hidden).toBe(false);
      expect(find('#week .zone').textContent).toBe("Times are in the calendar's time zone, Europe/Rome.");
      expect(texts('.legend li')).toEqual(['Studio', 'Swimming Pool']);
      expect(all('.legend li').map((li) => li.className)).toEqual(['type-2', 'type-5']);
      expect(texts('.hours li')).toEqual(WEEK.hours);
      expect(texts('.day h3')).toEqual(['Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov']);
      expect(all('.day').map((d) => d.classList.contains('today'))).toEqual([false, true, false, false, false, false, false]);
      expect(find('#week .loading').hidden).toBe(true);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
    });

    it('a week: the blocks of a day, each with its texts and its type\'s colour', () => {
      mounted(state({ week: WEEK }));
      const monday = all('.day')[0]!;
      const one = (selector: string) => monday.querySelector<HTMLElement>(selector)!;
      expect(one('.window').textContent).toBe('Studio');
      expect(one('.window').classList.contains('type-2')).toBe(true);
      expect(one('.busy').textContent).toBe('09:00–10:00 busy');
      expect(one('.busy').className).not.toContain('type-');
      expect(one('.slot').textContent).toBe('08:00–09:00 free');
      expect(one('.slot').classList.contains('type-2')).toBe(true);
      expect(one('.appointment .time').textContent).toBe('11:00–12:15');
      expect(one('.appointment .who').textContent).toBe('You');
      expect(one('.appointment .note').textContent).toBe('First lesson');
      expect(one('.appointment').classList.contains('type-2')).toBe(true);
      expect(all('.day')[1]!.querySelectorAll('.block')).toHaveLength(0);
    });

    it('loading with a week: the week stays, dimmed, under the new label', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', loading: true, week: WEEK }));
      expect(find('#week .week-label').textContent).toBe('23 Nov – 29 Nov 2026');
      expect(find('#week .loading').hidden).toBe(false);
      expect(find('#week .week').classList.contains('stale')).toBe(true);
      expect(texts('.day h3')[0]).toBe('Mon 16 Nov');
    });

    it('a failure without a week: the sentence, announced, and no week', () => {
      mounted(state({ failure: FAILURE }));
      const failure = find('#week .failure');
      expect(failure.hidden).toBe(false);
      expect(failure.textContent).toBe(FAILURE);
      expect(failure.getAttribute('role')).toBe('alert');
      expect(all('.day')).toHaveLength(0);
    });

    it('a failure with a week: the sentence, and the last week still on screen', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ failure: FAILURE, week: WEEK }));
      expect(find('#week .failure').textContent).toBe(FAILURE);
      expect(all('.day')).toHaveLength(7);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
    });

    it('a success after a failure removes the sentence', () => {
      const { week$ } = mounted(state({ failure: FAILURE }));
      week$.next(state({ week: WEEK }));
      expect(find('#week .failure').hidden).toBe(true);
      expect(find('#week .failure').textContent).toBe('');
    });
  });

  describe('the user\'s actions', () => {
    it.each([
      ['.previous', 'previous'],
      ['.today', 'today'],
      ['.next', 'next'],
    ] as const)('a click on %s calls %s(), once, and nothing else', (selector, method) => {
      const { screen } = mounted(state({ week: WEEK }));
      find(`#week ${selector}`).click();
      const calls = { previous: screen.previous.mock.calls.length, today: screen.today.mock.calls.length, next: screen.next.mock.calls.length };
      expect(calls).toEqual({ previous: 0, today: 0, next: 0, [method]: 1 });
    });

    it('a click changes nothing on screen by itself: the label and the week wait for the stream', () => {
      mounted(state({ week: WEEK }));
      const before = find('#week').textContent;
      find('#week .next').click();
      expect(find('#week').textContent).toBe(before);
      expect(find('#week .loading').hidden).toBe(true);
    });

    it('slots and appointments are plain elements that do nothing: no button, no handler', () => {
      mounted(state({ week: WEEK }));
      expect(all('.days button, .days a')).toHaveLength(0);
      for (const block of all('.block')) {
        expect(block.tagName).toBe('DIV');
        expect(block.onclick).toBeNull();
      }
    });
  });

  describe('positions and lanes', () => {
    it('top and height are set as the logic layer gives them', () => {
      mounted(state({ week: WEEK }));
      const places = (selector: string) => all(selector).map((element) => [element.style.top, element.style.height]);
      expect(places('.window')).toEqual([['0%', '40%']]);
      expect(places('.busy')).toEqual([['10%', '10%']]);
      expect(places('.slot')).toEqual([
        ['0%', '10%'],
        ['60%', '10%'],
        ['60%', '10%'],
      ]);
      expect(places('.appointment')).toEqual([['30%', '12.5%']]);
    });

    it('every day knows how many hours are shown', () => {
      mounted(state({ week: WEEK }));
      expect(all('.day-body').map((body) => body.style.getPropertyValue('--hours'))).toEqual(Array(7).fill('10'));
    });

    it('two blocks in the same place go side by side by their lane; the others have the whole width', () => {
      mounted(state({ week: WEEK }));
      const lanes = (selector: string) => all(selector).map((element) => [...element.classList].filter((name) => name.startsWith('lane-')));
      expect(lanes('.slot')).toEqual([['lane-0-of-1'], ['lane-0-of-2'], ['lane-1-of-2']]);
      expect(texts('.slot .time').slice(1)).toEqual(['02:00 +02:00 – 02:00 +01:00', '02:00 +01:00 – 03:00 +01:00']);
      expect(lanes('.window, .busy, .appointment')).toEqual([['lane-0-of-1'], ['lane-0-of-1'], ['lane-0-of-1']]);
    });
  });

  it('a type name, a username and a note containing <script> are shown as text', () => {
    const week: WeekModel = {
      ...WEEK,
      timeZone: SCRIPT,
      legend: [{ name: SCRIPT, colour: 0 }],
      days: [
        day('2026-11-16', SCRIPT, {
          windows: [{ ...at('0%', '10%', SCRIPT), typeName: SCRIPT, colour: 0 }],
          slots: [{ ...at('0%', '10%', SCRIPT), colour: 0 }],
          busy: [at('0%', '10%', SCRIPT)],
          appointments: [{ ...at('0%', '10%', SCRIPT), who: SCRIPT, typeName: SCRIPT, note: SCRIPT, colour: 0 }],
        }),
      ],
    };
    mounted(state({ label: SCRIPT, failure: SCRIPT, week }));
    for (const selector of ['.week-label', '.failure', '.zone-name', '.legend li', '.day h3', '.window .type-name', '.slot .time', '.busy .time', '.appointment .time', '.appointment .who', '.appointment .note']) {
      const element = find(`#week ${selector}`);
      expect(element.textContent, selector).toBe(SCRIPT);
      expect(element.children, selector).toHaveLength(0);
    }
    expect(document.querySelectorAll('script, b')).toHaveLength(0);
  });

  describe('redrawing', () => {
    it('a second week replaces the first, with nothing left of it', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', week: OTHER }));
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
      expect(texts('.hours li')).toEqual(['06:00', '07:00']);
      expect(texts('.legend li')).toEqual(['Piscina']);
      expect(find('#week .zone-name').textContent).toBe('Asia/Kolkata');
      expect(texts('.appointment .who')).toEqual(['bob']);
      expect(all('.window, .slot, .busy')).toHaveLength(0);
      const page = find('#week').textContent;
      for (const gone of ['Studio', 'Swimming Pool', 'First lesson', 'You', '16 Nov', 'Europe/Rome']) expect(page).not.toContain(gone);
    });

    it('the days are rebuilt only when the week is another object, not at every notification', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      const first = all('.day');
      week$.next(state({ label: '23 Nov – 29 Nov 2026', loading: true, week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', failure: FAILURE, week: WEEK }));
      expect(all('.day')).toEqual(first);
      expect(all('.day')[0]).toBe(first[0]);

      week$.next(state({ week: { ...WEEK } }));
      expect(all('.day')[0]).not.toBe(first[0]);
    });
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it', () => {
      const before = html();
      const { subscription } = mounted(state({ loading: true, failure: FAILURE, week: WEEK }));
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(all('.day, .hours li, .legend li, .block')).toHaveLength(0);
      expect(find('#week .week-label').textContent).toBe('');
      expect(find('#week .zone-name').textContent).toBe('');
      expect(find('#week .failure').textContent).toBe('');
      expect([find('#week .loading').hidden, find('#week .failure').hidden, find('#week .zone').hidden]).toEqual([true, true, true]);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
      expect(html()).toBe(before);
    });

    it('the stream is no longer heard', () => {
      const { week$, subscription } = mounted();
      subscription.unsubscribe();
      expect(week$.observed).toBe(false);
      week$.next(state({ loading: true, failure: FAILURE, week: WEEK }));
      expect(all('.day')).toHaveLength(0);
      expect(find('#week .failure').textContent).toBe('');
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(state({ week: WEEK }));
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new screen only', () => {
      const first = mounted(state({ week: WEEK }));
      first.subscription.unsubscribe();
      const second = mounted(state({ week: OTHER }));
      find('#week .next').click();
      expect(first.screen.next).not.toHaveBeenCalled();
      expect(second.screen.next).toHaveBeenCalledTimes(1);
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
    });
  });
});
