import { endAfter, endFor, minutesOf, partsOf, startMinutesOf, timeOf, WINDOW_STARTS, windowEnds } from '../logic/times';

// The two lists of a time, its hour and its minute, in a form of index.html: the group
// `fieldset.clock` whose lists are named `<name>-hour` and `<name>-minute`
// (docs/FRONTEND_ARCHITECTURE.md section 4). Towards the logic layer a time stays one `HH:mm`
// text: the lists are put together and a time is taken apart with src/logic/times.ts. Used by
// the two views of the availability and by the week's book dialog. Nothing here decides
// anything: the choices and the end a start sets come from the logic layer.

export type TimeLists = {
  // The hour list and the minute list, in that order.
  lists: readonly [HTMLSelectElement, HTMLSelectElement];
  // The hours offered, and the minutes of an hour: all twelve, only 00 with the hour 24, unless
  // `minutes` gives others.
  offer: (hours: readonly string[], minutes?: (hour: string) => readonly string[]) => void;
  // What the two lists hold, as one time, or '' when one of them holds nothing.
  read: () => string;
  // The two lists set to a time, by the script.
  write: (time: string) => void;
  // What a choice of the hour or of the minute by the person does besides, told which one.
  chosen: (then: (changed: 'hour' | 'minute') => void) => void;
  // What a time set by the script does besides.
  written: (then: () => void) => void;
};

// The texts of a list with one more, in order, unless it holds it already.
const withText = (texts: readonly string[], text: string) => (texts.includes(text) ? texts : [...texts, text].sort());

// `option` makes one <option> with its text, from a template of the view's screen.
export function timeLists(form: HTMLElement, name: string, option: (text: string) => HTMLElement): TimeLists {
  const hour = form.querySelector<HTMLSelectElement>(`[name="${name}-hour"]`)!;
  const minute = form.querySelector<HTMLSelectElement>(`[name="${name}-minute"]`)!;
  const fill = (select: HTMLSelectElement, texts: readonly string[]) => select.replaceChildren(...texts.map(option));
  let hours: readonly string[] = [];
  let minutesFor: (hour: string) => readonly string[] = minutesOf;
  // The minutes of the hour chosen. The minute chosen is kept where the new list has it, and is
  // the list's first where it does not. `shown`, a minute set by the script, is added to the list
  // when it is not there, so that a time is always shown as it is.
  const minutes = (shown = '') => {
    const offered = minutesFor(hour.value);
    const list = shown === '' ? offered : withText(offered, shown);
    const kept = shown === '' ? minute.value : shown;
    fill(minute, list);
    minute.value = list.includes(kept) ? kept : list[0]!;
  };
  let then: (changed: 'hour' | 'minute') => void = () => {};
  let afterWrite = () => {};
  // A value set by the script sends no `change` event; only a choice by the person does. So a
  // form that opens or is filled with times shows them as they are, and only the person's
  // choice of a start sets the end (docs/FRONTEND_ARCHITECTURE.md section 11, decision 197).
  // Properties, not listeners: the lists stay in the page, and a view mounted again replaces
  // them.
  hour.onchange = () => {
    minutes();
    then('hour');
  };
  minute.onchange = () => then('minute');
  return {
    lists: [hour, minute],
    offer: (offered, given = minutesOf) => {
      hours = offered;
      minutesFor = given;
      fill(hour, hours);
      minutes();
    },
    read: () => timeOf(hour.value, minute.value),
    // An hour or a minute the lists do not offer is added to them, so a time stored before the
    // lists changed is shown as it is, never corrected without a word.
    write: (time) => {
      const parts = partsOf(time);
      if (!hours.includes(parts.hour)) fill(hour, withText(hours, parts.hour));
      hour.value = parts.hour;
      minutes(parts.minute);
      afterWrite();
    },
    chosen: (next) => {
      then = next;
    },
    written: (next) => {
      afterWrite = next;
    },
  };
}

// A start chosen by the person, its hour or its minute, sets the end to the logic layer's
// answer: one hour later, never past `last()`, the last time allowed. A change of the end does
// nothing else. The book dialog's two times.
export function startSetsEnd(start: TimeLists, end: TimeLists, last: () => string): void {
  start.chosen(() => {
    const time = start.read();
    if (time !== '') end.write(endFor(time, last()));
  });
}

// The two times of a form of a window (docs/FRONTEND_ARCHITECTURE.md section 4): a start from
// 00:00 to 23:00, and an end chosen as an hour, whose one minute is the start's, so that a window
// lasts whole hours (docs/SHARED_CALENDAR_SPEC.md decision D33). The end's lists follow the start
// whether the person chose it or the script set it; a start chosen also sets the end, through
// endAfter of src/logic/times.ts. The script sets the start before the end, so a form that opens
// on a window shows its end as it is.
export function windowTimes(start: TimeLists, end: TimeLists): void {
  start.offer(WINDOW_STARTS, startMinutesOf);
  const follow = () => {
    const ends = windowEnds(start.read());
    end.offer(ends.hours, () => [ends.minute]);
  };
  follow();
  start.written(follow);
  start.chosen((changed) => {
    const before = end.read();
    follow();
    end.write(endAfter(start.read(), before, changed));
  });
}
