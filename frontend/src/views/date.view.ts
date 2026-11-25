import type { Subscription } from 'rxjs';
import type { Choice } from '../logic/availability.model';
import { WINDOW_FIELDS, type DayModel, type DraftModel, type WindowFields, type WindowRow } from '../logic/date.model';
import type { DateScreen } from '../logic/date.screen';
import { availabilityParts, type Confirm, type Tell } from './availability.parts';
import { windowTimes } from './time.parts';

// What the view of a single date uses: of the DateScreen its stream and its methods, and the
// dialog that confirms, which the screen's other view opens too.
export type DateDeps = {
  screen: Pick<DateScreen, 'date$' | 'show' | 'retry' | 'edit' | 'add' | 'remove' | 'discard' | 'save' | 'addWindow' | 'close' | 'back' | 'removeWindow'>;
  confirm: Pick<Confirm, 'open'>;
};

// The view of a single date (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the part
// `.one-date` of the element #availability of index.html, the screen's third part. It is
// mounted on the screen's element, beside the view of the types and of the patterns, because
// the templates of a choice and of a conflict and the dialog that confirms belong to the
// whole screen. It draws the day and the windows being put together as the logic layer hands
// them over, sends the fields of its three forms as text, and asks before a deletion and
// before a day is made not available.
export function mountDate(root: HTMLElement, { screen, confirm }: DateDeps): Subscription {
  // 1. Find the elements, once. The three forms have the shape of the screen's other forms.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(`.one-date ${selector}`)!;
  const { copy, choices, showConflicts, form } = availabilityParts(root);
  const forms = { choose: form('.one-date .choose', ['date']), add: form('.one-date .add-draft', WINDOW_FIELDS), window: form('.one-date .add-window', WINDOW_FIELDS) };
  const windowForms = [forms.add, forms.window];
  const typeLists = windowForms.map(({ fields }) => fields[2]!.inputs[0]!);
  const loading = find('.loading');
  const unread = find('.unread');
  const why = find('.unread .error');
  const shown = find('.shown');
  const texts = { date: find('.date-words'), given: find('.given .none'), which: find('.which'), extras: find('.extras .none'), draft: find('.draft-empty'), failure: find('.save-failure') };
  const lists = { given: find('.given-rows'), own: find('.own-rows'), extras: find('.extra-rows'), draft: find('.draft-rows') };
  const offered = { edit: find('.edit'), close: find('.make-closed'), back: find('.back') };
  const draft = find('.draft');
  const draftConflicts = find('.draft > .conflicts');
  const save = find<HTMLButtonElement>('.save');
  const discard = find<HTMLButtonElement>('.discard');

  // The hours a window may start at never change; the types follow the stream. The end is
  // chosen as an hour, its minute the start's, and a start chosen by the person sets the end
  // (windowTimes of src/views/time.parts.ts).
  for (const { times } of windowForms) windowTimes(times.start!, times.end!);

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): what this view last
  // opened the dialog that confirms for, as the stream names it, and how to tell that opening
  // of its action; and the dialog's questions about the day on show, which the stream brings.
  let asking: { about: string; tell: Tell } | null = null;
  let busy = false;
  let questions = { close: '', back: '' };
  const ask = (about: string, question: string, confirmed: () => void) => {
    asking = { about, tell: confirm.open(question, busy, confirmed) };
  };

  // 3. Drawing: one copy of a template per window, filled with textContent. A button's name
  // for a screen reader says which window it is of.
  const row = (template: string, window: WindowRow) => {
    const item = copy(template);
    item.querySelector('.time')!.textContent = window.time;
    item.querySelector('.type-name')!.textContent = window.typeName;
    return item;
  };
  const button = (item: HTMLElement, label: string, onclick: () => void) => {
    const element = item.querySelector('button')!;
    element.setAttribute('aria-label', label);
    element.onclick = onclick;
    return item;
  };
  const drawDay = (day: DayModel | null) => {
    texts.date.textContent = day?.date ?? '';
    texts.given.textContent = day?.patternsNone ?? '';
    texts.which.textContent = day?.which ?? '';
    texts.extras.textContent = day?.extrasNone ?? '';
    lists.given.replaceChildren(...(day?.patterns ?? []).map((window) => row('tpl-date-window', window)));
    lists.own.replaceChildren(...(day?.own ?? []).map((window) => row('tpl-date-window', window)));
    // A row's "Delete" only opens the dialog.
    lists.extras.replaceChildren(...(day?.extras ?? []).map((extra) => button(row('tpl-extra-row', extra), extra.deleteLabel, () => ask(extra.windowId, extra.question, () => screen.removeWindow(extra.windowId)))));
    questions = { close: day?.closeQuestion ?? '', back: day?.reopenQuestion ?? '' };
  };
  const drawDraft = (model: DraftModel | null) => {
    texts.draft.textContent = model?.empty ?? '';
    lists.draft.replaceChildren(...(model?.rows ?? []).map((window, index) => button(row('tpl-draft-row', window), window.removeLabel, () => screen.remove(index))));
  };
  // What is now in the page: a list is rebuilt, and a form filled, only when the stream
  // brings another object for it, so the keyboard stays on a row's button and what is being
  // chosen is left alone.
  let drawn: { day: DayModel | null; draft: DraftModel | null; choices: readonly Choice[] | null } = { day: null, draft: null, choices: null };
  let filled: { field: object | null; add: object | null; window: object | null } = { field: null, add: null, window: null };

  // 4. The user's actions become calls: what follows on screen comes from the stream. Without
  // preventDefault the browser would send a form itself and load the page again. The fields
  // go as they are, as text: the logic layer checks them.
  forms.choose.form.onsubmit = (event) => {
    event.preventDefault();
    screen.show(forms.choose.held().date!);
  };
  forms.add.form.onsubmit = (event) => {
    event.preventDefault();
    screen.add(forms.add.held() as WindowFields);
  };
  forms.window.form.onsubmit = (event) => {
    event.preventDefault();
    screen.addWindow(forms.window.held() as WindowFields);
  };
  find('.retry').onclick = () => screen.retry();
  offered.edit.onclick = () => screen.edit();
  save.onclick = () => screen.save();
  discard.onclick = () => screen.discard();
  // The two buttons of the day that ask first.
  offered.close.onclick = () => ask('close', questions.close, () => screen.close());
  offered.back.onclick = () => ask('back', questions.back, () => screen.back());

  // 5. The stream's notifications fill the elements.
  const subscription = screen.date$.subscribe((state) => {
    loading.hidden = !state.loading;
    if (state.field !== filled.field) forms.choose.fill(state.field);
    forms.choose.say({ refusals: state.refusal === null ? {} : { date: state.refusal }, failure: null, conflicts: null });
    unread.hidden = state.unread === null;
    why.textContent = state.unread ?? '';
    shown.hidden = state.day === null;
    if (state.day !== drawn.day) drawDay(state.day);
    if (state.draft !== drawn.draft) drawDraft(state.draft);
    // The types to choose from: a list that arrives leaves what is chosen as it is; a chosen
    // type that is no longer there leaves none chosen.
    if (state.choices !== drawn.choices) {
      for (const select of typeLists) {
        const chosen = select.value;
        choices(select, state.choices);
        select.value = chosen;
      }
    }
    drawn = { day: state.day, draft: state.draft, choices: state.choices };
    if (state.addFields !== filled.add) forms.add.fill(state.addFields);
    if (state.windowFields !== filled.window) forms.window.fill(state.windowFields);
    filled = { field: state.field, add: state.addFields, window: state.windowFields };
    offered.edit.hidden = offered.close.hidden = !state.offers.change;
    offered.back.hidden = !state.offers.back;
    // The windows being put together, with what "Add" and "Save this day" say. While the
    // save is under way its buttons are disabled.
    draft.hidden = state.draft === null;
    forms.add.say(state.add);
    texts.failure.textContent = state.save.failure ?? '';
    showConflicts(draftConflicts, state.save.conflicts);
    forms.add.submit.disabled = save.disabled = discard.disabled = state.save.busy;
    forms.window.say(state.window);
    forms.window.submit.disabled = state.window.busy;
    // The dialog shows an outcome only when it is about what this view opened it for: the
    // button is disabled while any action of the dialog is under way.
    busy = state.confirm.busy;
    if (asking !== null) {
      const mine = state.confirm.about === asking.about;
      asking.tell({ busy, failure: mine ? state.confirm.failure : null, conflicts: mine ? state.confirm.conflicts : null, done: mine && state.confirm.done });
    }
  });

  // 6. Leaving the view: the part stays in the page, only hidden, so the date, the windows,
  // the appointments in the way and what was chosen are removed before the next screen, or
  // the next person (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9). The dialog that
  // confirms is emptied by whoever mounted it.
  subscription.add(() => {
    drawDay(null);
    drawDraft(null);
    showConflicts(draftConflicts, null);
    for (const each of Object.values(forms)) {
      each.say(null);
      each.form.reset();
      each.submit.disabled = false;
      for (const { inputs } of each.fields) for (const input of inputs) if (input instanceof HTMLSelectElement) choices(input, []);
    }
    for (const element of [loading, unread, shown, draft]) element.hidden = true;
    for (const element of Object.values(offered)) element.hidden = false;
    save.disabled = discard.disabled = false;
    why.textContent = texts.failure.textContent = '';
  });
  return subscription;
}
