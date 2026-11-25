import { endFor, minutesOf, partsOf, timeOf } from '../logic/times';

// The two lists of a time, its hour and its minute, in a form of index.html: the group
// `fieldset.clock` whose lists are named `<name>-hour` and `<name>-minute`
// (docs/FRONTEND_ARCHITECTURE.md section 4). Towards the logic layer a time stays one `HH:mm`
// text: the lists are put together and a time is taken apart with src/logic/times.ts. Used by
// the two views of the availability and by the week's book dialog. Nothing here decides
// anything: the choices and the end a start sets come from the logic layer.

export type TimeLists = {
  // The hour list and the minute list, in that order.
  lists: readonly [HTMLSelectElement, HTMLSelectElement];
  // The hours offered; the minutes follow the hour chosen.
  offer: (hours: readonly string[]) => void;
  // What the two lists hold, as one time, or '' when one of them holds nothing.
  read: () => string;
  // The two lists set to a time, by the script.
  write: (time: string) => void;
  // What a choice of the hour or of the minute by the person does besides, or nothing.
  chosen: (then: () => void) => void;
};

// `option` makes one <option> with its text, from a template of the view's screen.
export function timeLists(form: HTMLElement, name: string, option: (text: string) => HTMLElement): TimeLists {
  const hour = form.querySelector<HTMLSelectElement>(`[name="${name}-hour"]`)!;
  const minute = form.querySelector<HTMLSelectElement>(`[name="${name}-minute"]`)!;
  const fill = (select: HTMLSelectElement, texts: readonly string[]) => select.replaceChildren(...texts.map(option));
  // The minutes of the hour chosen: only 00 with the hour 24, all twelve otherwise. The minute
  // chosen is kept where the new list has it, and is 00 where it does not.
  const minutes = () => {
    const kept = minute.value;
    fill(minute, minutesOf(hour.value));
    minute.value = minutesOf(hour.value).includes(kept) ? kept : '00';
  };
  let then = () => {};
  // A value set by the script sends no `change` event; only a choice by the person does. So a
  // form that opens or is filled with times shows them as they are, and only the person's
  // choice of a start sets the end (docs/FRONTEND_ARCHITECTURE.md section 11, decision 197).
  // Properties, not listeners: the lists stay in the page, and a view mounted again replaces
  // them.
  hour.onchange = () => {
    minutes();
    then();
  };
  minute.onchange = () => then();
  return {
    lists: [hour, minute],
    offer: (hours) => {
      fill(hour, hours);
      minutes();
    },
    read: () => timeOf(hour.value, minute.value),
    write: (time) => {
      const parts = partsOf(time);
      hour.value = parts.hour;
      minutes();
      minute.value = parts.minute;
    },
    chosen: (next) => {
      then = next;
    },
  };
}

// A start chosen by the person, its hour or its minute, sets the end to the logic layer's
// answer: one hour later, never past `last()`, the last time allowed. A change of the end does
// nothing else.
export function startSetsEnd(start: TimeLists, end: TimeLists, last: () => string): void {
  start.chosen(() => {
    const time = start.read();
    if (time !== '') end.write(endFor(time, last()));
  });
}
