import { startSetsEnd, timeLists, windowTimes, type TimeLists } from '../../../src/views/time.parts';
import { choose, chooseTime, find, choicesOf, timeIn, useRealPage } from './page';

// The DOM test of the two lists of a time (docs/FRONTEND_ARCHITECTURE.md section 8), on the
// real index.html: the book dialog's form, which holds a start and an end; and the two times of a
// form of a window, wired on the same lists. What each view does with them is in its own test;
// the end a start sets is computed in src/logic/times.ts.

const form = () => find<HTMLFormElement>('#week dialog.book form');
const option = (text: string) => {
  const element = find<HTMLTemplateElement>('#week #tpl-option').content.firstElementChild!.cloneNode(true) as HTMLElement;
  element.textContent = text;
  return element;
};
const HOURS = ['08', '09', '10', '11', '12'];

function wired(last = '12:00'): { start: TimeLists; end: TimeLists } {
  const start = timeLists(form(), 'start', option);
  const end = timeLists(form(), 'end', option);
  start.offer(HOURS.slice(0, -1));
  end.offer(HOURS.concat('24'));
  startSetsEnd(start, end, () => last);
  return { start, end };
}

// Test names: S… decisions and F… findings are those of docs/SLOT_STEP_PLAN.md, except the D…
// decision of the block on a form of a window, one of docs/SHARED_CALENDAR_SPEC.md.
describe('the two lists of a time', () => {
  useRealPage();

  it('the hours offered, each with the minutes of its hour: all twelve, and only 00 with 24', () => {
    const { start, end } = wired();
    expect([choicesOf(start.lists[0]), choicesOf(start.lists[1])]).toEqual([['08', '09', '10', '11'], ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']]);
    end.write('24:00');
    expect([choicesOf(end.lists[1]), end.read()]).toEqual([['00'], '24:00']);
  });

  it('written by the script and read back as one time; nothing chosen reads as an empty time', () => {
    const { start } = wired();
    start.write('10:05');
    expect([start.read(), start.lists[0].value, start.lists[1].value]).toEqual(['10:05', '10', '05']);
    start.lists[0].value = '';
    expect(start.read()).toBe('');
  });

  it('S1: a start chosen sets the end one hour later; chosen twice, sets it twice', () => {
    const { end } = wired('24:00');
    chooseTime(form(), 'start', '09:05');
    expect(end.read()).toBe('10:05');
    chooseTime(form(), 'start', '10:10');
    expect(end.read()).toBe('11:10');
  });

  it('S1: the hour alone or the minute alone sets the end too', () => {
    const { start, end } = wired('24:00');
    start.write('09:00');
    choose(start.lists[0], '10');
    expect(end.read()).toBe('11:00');
    choose(start.lists[1], '25');
    expect(end.read()).toBe('11:25');
  });

  it('S1: an end chosen leaves the start alone', () => {
    const { start } = wired();
    start.write('09:00');
    chooseTime(form(), 'end', '11:30');
    expect([timeIn(form(), 'start'), timeIn(form(), 'end')]).toEqual(['09:00', '11:30']);
  });

  it('S3: never past the last time allowed: 11:40 gives 12:00 when the window ends there', () => {
    wired('12:00');
    chooseTime(form(), 'start', '11:40');
    expect(timeIn(form(), 'end')).toBe('12:00');
  });

  it('S4: a time set by the script sets nothing else', () => {
    const { start, end } = wired();
    end.write('11:00');
    start.write('08:05');
    expect(end.read()).toBe('11:00');
  });

  it('the hour of an end becomes 24: its minutes are only 00; back to another hour: all twelve, 00 kept', () => {
    const { end } = wired();
    end.write('11:35');
    choose(end.lists[0], '24');
    expect([choicesOf(end.lists[1]), end.read()]).toEqual([['00'], '24:00']);
    choose(end.lists[0], '12');
    expect([choicesOf(end.lists[1]).length, end.read()]).toEqual([12, '12:00']);
  });

  it('another hour keeps the minute chosen', () => {
    const { end } = wired();
    end.write('10:35');
    choose(end.lists[0], '11');
    expect(end.read()).toBe('11:35');
  });

  it('a start with nothing chosen sets nothing', () => {
    const { start, end } = wired();
    end.write('11:00');
    start.lists[0].replaceChildren();
    choose(start.lists[1], '05');
    expect(end.read()).toBe('11:00');
  });

  it('a time written by the script that the lists do not offer is shown as it is, its hour and its minute added', () => {
    const { end } = wired();
    end.offer(['10', '11'], () => ['05']);
    end.write('09:45');
    expect([end.read(), choicesOf(end.lists[0]), choicesOf(end.lists[1])]).toEqual(['09:45', ['09', '10', '11'], ['05', '45']]);
    choose(end.lists[0], '10');
    expect([end.read(), choicesOf(end.lists[1])]).toEqual(['10:05', ['05']]);
  });

  describe('the two times of a form of a window (D33)', () => {
    const window = () => {
      const start = timeLists(form(), 'start', option);
      const end = timeLists(form(), 'end', option);
      windowTimes(start, end);
      return { start, end };
    };

    it('the end follows a start set by the script, so a window opened is shown as it is', () => {
      const { start, end } = window();
      start.write('08:05');
      end.write('12:05');
      expect([start.read(), end.read(), choicesOf(end.lists[0])[0], choicesOf(end.lists[1])]).toEqual(['08:05', '12:05', '09', ['05']]);
    });

    it('the book dialog\'s lists, wired alone, keep all twelve minutes', () => {
      const { start } = wired();
      expect(choicesOf(start.lists[1]).length).toBe(12);
    });
  });
});
