import type { Subscription } from 'rxjs';
import type { AppointmentBlock, BusyBlock, DayModel, Placed, SlotBlock, WeekModel, WindowBlock } from '../logic/week.model';
import type { WeekScreen } from '../logic/week.screen';

// What the week view uses of the WeekScreen: its stream and the three moves.
export type WeekDeps = Pick<WeekScreen, 'week$' | 'previous' | 'next' | 'today'>;

// The week view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #week of
// index.html. It draws what the logic layer hands over ready (places, times and names as text)
// and forwards three buttons. Slots and appointments are drawn and do nothing.
export function mountWeek(root: HTMLElement, screen: WeekDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  // A copy of the element inside a <template>.
  const copy = (id: string) => find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as HTMLElement;

  const label = find('.week-label');
  const loading = find('.loading');
  const failure = find('.failure');
  const zone = find('.zone');
  const zoneName = find('.zone-name');
  const legend = find('.legend');
  const week = find('.week');
  const hours = find('.hours');
  const days = find('.days');

  // 2. The user's actions become calls.
  find('.previous').onclick = () => screen.previous();
  find('.today').onclick = () => screen.today();
  find('.next').onclick = () => screen.next();

  // 3. Drawing a week: copies of the templates, filled with textContent. A place is set as a
  // property, which a strict Content-Security-Policy allows
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 6).
  // A block's copy, put in its place and in its lane, with its type's colour when it has one.
  const place = (id: string, block: Placed, colour?: number) => {
    const element = copy(id);
    element.style.top = block.top;
    element.style.height = block.height;
    element.classList.add(`lane-${block.lane}-of-${block.lanes}`);
    if (colour !== undefined) element.classList.add(`type-${colour}`);
    return element;
  };
  const windowFor = (block: WindowBlock) => {
    const element = place('tpl-window', block, block.colour);
    element.querySelector('.type-name')!.textContent = block.typeName;
    return element;
  };
  const busyFor = (block: BusyBlock) => {
    const element = place('tpl-busy', block);
    element.querySelector('.time')!.textContent = block.time;
    return element;
  };
  const slotFor = (block: SlotBlock) => {
    const element = place('tpl-slot', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    return element;
  };
  const appointmentFor = (block: AppointmentBlock) => {
    const element = place('tpl-appointment', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    element.querySelector('.who')!.textContent = block.who;
    element.querySelector('.note')!.textContent = block.note;
    return element;
  };

  const dayFor = (day: DayModel, hoursShown: number) => {
    const element = copy('tpl-day');
    element.classList.toggle('today', day.today);
    element.querySelector('h3')!.textContent = day.label;
    const body = element.querySelector<HTMLElement>('.day-body')!;
    body.style.setProperty('--hours', String(hoursShown));
    body.append(...day.windows.map(windowFor), ...day.busy.map(busyFor), ...day.slots.map(slotFor), ...day.appointments.map(appointmentFor));
    return element;
  };
  const itemFor = (id: string, text: string, colour?: number) => {
    const element = copy(id);
    element.textContent = text;
    if (colour !== undefined) element.classList.add(`type-${colour}`);
    return element;
  };

  // The week now in the page: it is rebuilt only when the stream brings another one.
  let drawn: WeekModel | null = null;
  const draw = (model: WeekModel | null) => {
    drawn = model;
    zone.hidden = model === null;
    zoneName.textContent = model?.timeZone ?? '';
    legend.replaceChildren(...(model?.legend ?? []).map((type) => itemFor('tpl-legend-item', type.name, type.colour)));
    hours.replaceChildren(...(model?.hours ?? []).map((hour) => itemFor('tpl-hour', hour)));
    days.replaceChildren(...(model?.days ?? []).map((day) => dayFor(day, model!.hours.length)));
  };

  // 4. The stream's notifications fill the elements.
  const subscription = screen.week$.subscribe((state) => {
    label.textContent = state.label;
    loading.hidden = !state.loading;
    week.classList.toggle('stale', state.loading);
    failure.hidden = state.failure === null;
    failure.textContent = state.failure ?? '';
    if (state.week !== drawn) draw(state.week);
  });

  // 5. Leaving the view: the element stays in the page, only hidden, so one person's week is
  // removed before the next person signs in (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    draw(null);
    label.textContent = '';
    loading.hidden = true;
    week.classList.remove('stale');
    failure.hidden = true;
    failure.textContent = '';
  });
  return subscription;
}
