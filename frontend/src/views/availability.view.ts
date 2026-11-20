import type { Subscription } from 'rxjs';
import {
  deletePatternQuestion,
  deleteTypeQuestion,
  END_CHOICES,
  PATTERN_FIELDS,
  START_CHOICES,
  TYPE_NAME_HINT,
  WEEKDAY_CHOICES,
  type Choice,
  type PatternFields,
  type PatternGroup,
  type PatternRow,
  type TypeRow,
} from '../logic/availability.model';
import type { AskName, AvailabilityScreen } from '../logic/availability.screen';
import { failureText } from '../logic/texts';
import type { AvailabilityRulesService } from '../services/availability-rules.service';
import type { DeletePatternState } from '../services/availability-rules.types';
import type { AvailabilityTypesService } from '../services/availability-types.service';
import type { RemoveTypeState } from '../services/availability-types.types';
import { availabilityParts, type Confirm, type Tell } from './availability.parts';

// What the availability view uses: of the AvailabilityScreen its stream, the four writes it
// checks, the two new tries after a read that failed, and the appointments in the way of a
// failure made ready to draw; of the two services the two deletes with their states; and the
// dialog that confirms them, which the screen's other view opens too.
export type AvailabilityDeps = {
  screen: Pick<AvailabilityScreen, 'availability$' | 'createType' | 'rename' | 'createPattern' | 'change' | 'retryTypes' | 'retryPatterns' | 'conflicts'>;
  types: Pick<AvailabilityTypesService, 'remove' | 'removeState$'>;
  rules: Pick<AvailabilityRulesService, 'deletePattern' | 'deletePatternState$'>;
  confirm: Pick<Confirm, 'open'>;
};

// The availability view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element
// #availability of index.html. It draws the rows the logic layer hands over, sends the fields
// of its four forms as text, shows under each field why it was refused and under a refused
// change the appointments in the way, and asks before a delete.
export function mountAvailability(root: HTMLElement, { screen, types, rules, confirm }: AvailabilityDeps): Subscription {
  // 1. Find the elements, once. The four forms have one shape: the fields, each with the
  // refusal of its .field, the failure, the appointments in the way (the two forms of a
  // pattern), and the button.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const { copy, choices, form } = availabilityParts(root);
  const forms: Record<AskName, ReturnType<typeof form>> = {
    typeCreate: form('form.create-type', ['name']),
    rename: form('dialog.rename form', ['name']),
    patternCreate: form('form.create-pattern', PATTERN_FIELDS),
    change: form('dialog.change form', PATTERN_FIELDS),
  };
  const loading = find('.loading');
  const lists = {
    types: { unread: find('.types .unread'), why: find('.types .unread .error'), empty: find('.types .empty'), rows: find('.types .list') },
    patterns: { unread: find('.patterns .unread'), why: find('.patterns .unread .error'), empty: find('.patterns .empty'), rows: find('.patterns .groups') },
  };
  const nameHints = [...root.querySelectorAll('.name-hint')];
  const typeHints = [...root.querySelectorAll('.type-hint')];
  const typeLists = [forms.patternCreate, forms.change].map(({ fields }) => fields[3]!.input);
  const dialogs = { rename: find<HTMLDialogElement>('dialog.rename'), change: find<HTMLDialogElement>('dialog.change') };

  // The choices of the weekday and of the two times never change; those of the type follow
  // the stream. What a name is stands under its field.
  for (const { fields } of [forms.patternCreate, forms.change]) [WEEKDAY_CHOICES, START_CHOICES, END_CHOICES].forEach((list, i) => choices(fields[i]!.input, list));
  for (const hint of nameHints) hint.textContent = TYPE_NAME_HINT;

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): which type or
  // pattern each open dialog is about, and whether its action was asked for since it opened.
  // A result is shown only in the dialog that asked for it: a state keeps its last value,
  // which may be an earlier opening's. Of the dialog that confirms: the kind of what this
  // view last opened it for, and how to tell that opening of its delete.
  const open = { rename: { about: '', asked: false }, change: { about: '', asked: false } };
  let deleting: { kind: 'type' | 'pattern'; tell: Tell } | null = null;
  const deletePending = { type: false, pattern: false };

  // 3. The dialogs: opening one is a pure view action, and it starts clean, with the values
  // of the row. Nothing is done when one closes: what it was about is replaced at the next
  // opening (a browser sends the close event late, perhaps after that opening).
  const openForm = (name: 'rename' | 'change', about: string, values: Record<string, string>) => {
    open[name] = { about, asked: false };
    forms[name].fill(values);
    forms[name].say(null);
    dialogs[name].showModal();
  };
  // The two deletes have nothing to check: the dialog's button calls the service that deletes.
  const openDelete = (kind: 'type' | 'pattern', id: string, words: string) => {
    deleting = { kind, tell: confirm.open(words, deletePending[kind], () => (kind === 'type' ? types.remove(id) : rules.deletePattern(id))) };
  };
  for (const name of ['rename', 'change'] as const) find(`dialog.${name} .close`).onclick = () => dialogs[name].close();

  // 4. Drawing the lists: one copy of a template per row, filled with textContent. A button's
  // name for a screen reader says which row it is of; a click only opens a dialog.
  const button = (item: HTMLElement, selector: string, label: string, onclick: () => void) => {
    const element = item.querySelector<HTMLElement>(selector)!;
    element.setAttribute('aria-label', label);
    element.onclick = onclick;
  };
  const typeRow = (row: TypeRow) => {
    const item = copy('tpl-type-row');
    item.querySelector('.name')!.textContent = row.name;
    button(item, '.ask-rename', row.renameLabel, () => openForm('rename', row.typeId, { name: row.name }));
    button(item, '.ask-delete', row.deleteLabel, () => openDelete('type', row.typeId, deleteTypeQuestion(row)));
    return item;
  };
  const patternRow = (row: PatternRow) => {
    const item = copy('tpl-pattern-row');
    for (const key of ['time', 'typeName', 'validity'] as const) item.querySelector(`.${key === 'typeName' ? 'type-name' : key}`)!.textContent = row[key];
    item.querySelector<HTMLElement>('.ended')!.hidden = !row.ended;
    item.classList.toggle('is-ended', row.ended);
    button(item, '.ask-change', row.changeLabel, () => openForm('change', row.patternId, row.fields));
    button(item, '.ask-delete', row.deleteLabel, () => openDelete('pattern', row.patternId, deletePatternQuestion(row)));
    return item;
  };
  const groupFor = (group: PatternGroup) => {
    const section = copy('tpl-pattern-group');
    section.querySelector('h4')!.textContent = group.weekday;
    section.querySelector('.list')!.replaceChildren(...group.rows.map(patternRow));
    return section;
  };
  // What is now in the page: a list is rebuilt, and a form that creates is filled, only when
  // the stream brings another object for it, so the keyboard stays on a row's button and
  // what is being typed or chosen is left alone.
  let drawn: { types: readonly TypeRow[] | null; groups: readonly PatternGroup[] | null; choices: readonly Choice[] | null } = { types: null, groups: null, choices: null };
  let filled: { typeField: object | null; patternFields: object | null } = { typeField: null, patternFields: null };

  // 5. The user's actions become calls: what follows on screen comes from the streams. Without
  // preventDefault the browser would send a form itself and load the page again. The fields go
  // as they are, as text: the logic layer checks them.
  const onSubmit = (name: AskName, send: (values: Record<string, string>) => void) => {
    forms[name].form.onsubmit = (event) => {
      event.preventDefault();
      if (name === 'rename' || name === 'change') open[name].asked = true;
      send(forms[name].held());
    };
  };
  onSubmit('typeCreate', ({ name }) => screen.createType(name!));
  onSubmit('rename', ({ name }) => screen.rename(open.rename.about, name!));
  onSubmit('patternCreate', (fields) => screen.createPattern(fields as PatternFields));
  onSubmit('change', (fields) => screen.change(open.change.about, fields as PatternFields));
  find('.types .retry').onclick = () => screen.retryTypes();
  find('.patterns .retry').onclick = () => screen.retryPatterns();

  // 6. The streams' notifications fill the elements.
  const subscription = screen.availability$.subscribe((state) => {
    loading.hidden = !state.loading;
    for (const [list, unread, empty] of [[lists.types, state.typesUnread, state.typesEmpty], [lists.patterns, state.patternsUnread, state.patternsEmpty]] as const) {
      list.unread.hidden = unread === null;
      list.why.textContent = unread ?? '';
      list.empty.hidden = empty === null;
      list.empty.textContent = empty ?? '';
    }
    if (state.types !== drawn.types) lists.types.rows.replaceChildren(...(state.types ?? []).map(typeRow));
    if (state.groups !== drawn.groups) lists.patterns.rows.replaceChildren(...(state.groups ?? []).map(groupFor));
    // The types to choose from: a list that arrives leaves what is chosen as it is, in the
    // form and in the open dialog; a chosen type that is no longer there leaves none chosen.
    if (state.choices !== drawn.choices) {
      for (const select of typeLists) {
        const chosen = select.value;
        choices(select, state.choices);
        select.value = chosen;
      }
    }
    drawn = { types: state.types, groups: state.groups, choices: state.choices };
    for (const hint of typeHints) hint.textContent = state.typeHint;
    if (state.typeField !== filled.typeField) forms.typeCreate.fill(state.typeField);
    if (state.patternFields !== filled.patternFields) forms.patternCreate.fill(state.patternFields);
    filled = { typeField: state.typeField, patternFields: state.patternFields };
    // A button is disabled while a write of its kind is under way, whoever asked for it.
    for (const name of ['typeCreate', 'rename', 'patternCreate', 'change'] as const) forms[name].submit.disabled = state[name].busy;
    forms.typeCreate.say(state.typeCreate);
    forms.patternCreate.say(state.patternCreate);
    // A dialog shows an outcome only when it asked for it since it opened and the outcome is
    // about what the dialog is about; it stays open on a refusal and a failure, and closes
    // once the write is done.
    for (const name of ['rename', 'change'] as const) {
      if (!open[name].asked || state[name].about !== open[name].about) continue;
      forms[name].say(state[name]);
      if (state[name].done) dialogs[name].close();
    }
  });
  // A delete: the button of the dialog is disabled while one of its kind is under way; the
  // dialog that asked for it closes on its success and shows its failure in plain words, with
  // the appointments in the way of a pattern's, staying open. A state of the other kind is
  // not this dialog's.
  const deleted = (kind: 'type' | 'pattern') => (state: RemoveTypeState | DeletePatternState) => {
    deletePending[kind] = state.status === 'pending';
    if (deleting?.kind !== kind) return;
    const failed = state.status === 'failure';
    deleting.tell({ busy: deletePending[kind], failure: failed ? failureText(state.reason) : null, conflicts: failed ? screen.conflicts(state.conflicts) : null, done: state.status === 'success' });
  };
  subscription.add(types.removeState$.subscribe(deleted('type')));
  subscription.add(rules.deletePatternState$.subscribe(deleted('pattern')));

  // 7. Leaving the view: the element stays in the page, only hidden, so the names, the
  // patterns, the appointments in the way and what was typed are removed before the next
  // screen, or the next person (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9). The dialog
  // that confirms is emptied by whoever mounted it.
  subscription.add(() => {
    for (const dialog of [dialogs.rename, dialogs.change]) dialog.close();
    for (const name of ['typeCreate', 'rename', 'patternCreate', 'change'] as const) {
      forms[name].say(null);
      forms[name].form.reset();
      forms[name].submit.disabled = false;
      for (const { input } of forms[name].fields) if (input instanceof HTMLSelectElement) choices(input, []);
    }
    for (const list of [lists.types, lists.patterns]) {
      list.unread.hidden = list.empty.hidden = true;
      list.rows.replaceChildren();
    }
    loading.hidden = true;
    for (const text of [...nameHints, ...typeHints, lists.types.why, lists.types.empty, lists.patterns.why, lists.patterns.empty]) text.textContent = '';
  });
  return subscription;
}
