import type { Subscription } from 'rxjs';
import { dailyRange, type DailyFields } from '../logic/daily-mail.model';
import type { DailyMailScreen } from '../logic/daily-mail.screen';
import { SETTING_FIELDS, settingRange, type SettingsFields } from '../logic/settings.model';
import type { SettingsScreen } from '../logic/settings.screen';
import type { PageTexts } from '../texts/texts';

// What the view uses of the SettingsScreen: its stream, the save, the notice of an edit and
// the new try after a read that failed.
export type SettingsDeps = Pick<SettingsScreen, 'settings$' | 'save' | 'edited' | 'retry'>;

// The settings view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element
// #settings of index.html, one fixed form. It fills the fields with what the logic layer hands
// over, sends them back as text at "Save", and shows under each field why it was refused.
// `texts` are the page texts of the language in use, for the range under each field.
export function mountSettings(root: HTMLElement, screen: SettingsDeps, texts: PageTexts): Subscription {
  // 1. Find the elements, once. A field of the form is its input with, in the same .field, the
  // words of its range and its refusal.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loading = find('.loading');
  const unread = find('.unread');
  const unreadWhy = find('.unread .error');
  const form = find<HTMLFormElement>('form.settings');
  const fields = SETTING_FIELDS.map((name) => {
    const input = find<HTMLInputElement>(`[name="${name}"]`);
    const box = input.closest('.field')!;
    return { name, input, range: box.querySelector('.range')!, refusal: box.querySelector('.refusal')! };
  });
  const limit = find<HTMLInputElement>('[name="maxFutureAppointmentsPerUser"]');
  const noLimit = find<HTMLInputElement>('[name="noLimit"]');
  const zoneName = find('.zone-name');
  const lastSaved = find('.last-saved');
  const failure = find('.failure');
  const saved = find('.saved');
  const submit = find<HTMLButtonElement>('.submit');

  // The range of each field, in words and as the native field's own limits: a convenience (the
  // arrows of the field stop there). The check that counts is the logic layer's, at "Save".
  for (const { name, input, range } of fields) {
    const { min, max, words } = settingRange(texts.settings, name);
    range.textContent = words;
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
  }

  // 2. The user's actions become calls: what follows on screen comes from the stream. The one
  // pure view action is "No limit", which takes its number field out of use.
  // Without preventDefault the browser would send the form itself and load the page again. The
  // values go as the fields hold them, as text: the logic layer checks them.
  form.onsubmit = (event) => {
    event.preventDefault();
    const typed = Object.fromEntries(fields.map(({ name, input }) => [name, input.value])) as Omit<SettingsFields, 'noLimit'>;
    screen.save({ ...typed, noLimit: noLimit.checked });
  };
  // An edit, typed or ticked: the checkbox says so itself too, for the documents in which a
  // click on it sends no input event.
  form.oninput = () => screen.edited();
  noLimit.onchange = () => {
    limit.disabled = noLimit.checked;
    screen.edited();
  };
  find('.retry').onclick = () => screen.retry();

  // What the form was last filled with: it is filled again only when the stream brings another
  // object, so that a value being typed is left alone by a notification that arrives meanwhile.
  let filled: SettingsFields | null = null;

  // 3. The stream's notifications fill the elements.
  const subscription = screen.settings$.subscribe((state) => {
    loading.hidden = !state.loading;
    unread.hidden = state.unread === null;
    unreadWhy.textContent = state.unread ?? '';
    form.hidden = state.fields === null;
    if (state.fields !== filled) {
      filled = state.fields;
      for (const { name, input } of fields) input.value = filled?.[name] ?? '';
      noLimit.checked = filled?.noLimit ?? false;
      limit.disabled = noLimit.checked;
    }
    zoneName.textContent = state.info?.timeZone ?? '';
    lastSaved.textContent = state.info?.lastSaved ?? '';
    // A field in fault: marked for a screen reader and for the style sheet, its sentence under it.
    for (const { name, input, refusal } of fields) {
      const why = state.refusals[name];
      refusal.textContent = why ?? '';
      if (why === undefined) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    }
    failure.textContent = state.failure ?? '';
    saved.hidden = !state.saved;
    submit.disabled = state.saving;
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so the values, typed or
  // read, and the name of who saved last are removed before the next person signs in
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    form.hidden = true;
    loading.hidden = true;
    unread.hidden = true;
    saved.hidden = true;
    submit.disabled = false;
    limit.disabled = false;
    for (const text of [unreadWhy, zoneName, lastSaved, failure]) text.textContent = '';
    for (const { input, range, refusal } of fields) {
      range.textContent = '';
      refusal.textContent = '';
      for (const attribute of ['min', 'max', 'step', 'aria-invalid']) input.removeAttribute(attribute);
    }
  });
  return subscription;
}

// What the daily e-mail's part uses of the DailyMailScreen: its stream, the save, the notice of an
// edit and the new try after a read that failed.
export type DailyMailDeps = Pick<DailyMailScreen, 'daily$' | 'save' | 'edited' | 'retry'>;

// The settings' "Daily e-mail" (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element
// .daily-mail inside #settings, a part of its own with its own form, mounted beside the settings
// view so that a failure of one hides nothing of the other. It fills the switch and the hour with
// what the logic layer hands over, sends them back at "Save daily e-mail", says under the hour why
// it was refused, and says "E-mail is not available yet" in place of the form when that is so.
// `texts` are the page texts of the language in use, for the range under the hour.
export function mountDailyMail(root: HTMLElement, screen: DailyMailDeps, texts: PageTexts): Subscription {
  // 1. Find the elements, once, inside the part only: the settings form above has elements of the
  // same classes.
  const part = root.querySelector<HTMLElement>('.daily-mail')!;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => part.querySelector<T>(selector)!;
  const loading = find('.loading');
  const unavailable = find('.unavailable');
  const unread = find('.unread');
  const unreadWhy = find('.unread .error');
  const form = find<HTMLFormElement>('form.daily');
  const enabled = find<HTMLInputElement>('[name="dailyEnabled"]');
  const hour = find<HTMLInputElement>('[name="dailyHour"]');
  const range = find('.range');
  const refusal = find('.refusal');
  const failure = find('.failure');
  const saved = find('.saved');
  const submit = find<HTMLButtonElement>('.submit');

  // 2. The user's actions become calls. Without preventDefault the browser would send the form
  // itself and load the page again. The hour goes as typed: the logic layer checks it.
  form.onsubmit = (event) => {
    event.preventDefault();
    screen.save({ dailyEnabled: enabled.checked, dailyHour: hour.value });
  };
  // An edit, typed or switched: the checkbox says so itself too, for the documents in which a
  // click on it sends no input event.
  form.oninput = () => screen.edited();
  enabled.onchange = () => screen.edited();
  find('.retry').onclick = () => screen.retry();

  // What the fields were last filled with: filled again only when the stream brings another
  // object, so that an hour being typed is left alone by a notification that arrives meanwhile.
  let filled: DailyFields | null = null;

  // 3. The stream's notifications fill the elements.
  const subscription = screen.daily$.subscribe((state) => {
    loading.hidden = !state.loading;
    unavailable.hidden = state.unavailable === null;
    unavailable.textContent = state.unavailable ?? '';
    unread.hidden = state.unread === null;
    unreadWhy.textContent = state.unread ?? '';
    form.hidden = state.fields === null;
    if (state.fields !== filled) {
      filled = state.fields;
      enabled.checked = filled?.dailyEnabled ?? false;
      hour.value = filled?.dailyHour ?? '';
    }
    range.textContent = dailyRange(texts.settings, state.timeZone);
    refusal.textContent = state.refusal ?? '';
    if (state.refusal === null) hour.removeAttribute('aria-invalid');
    else hour.setAttribute('aria-invalid', 'true');
    failure.textContent = state.failure ?? '';
    saved.hidden = !state.saved;
    submit.disabled = state.saving;
  });

  // 4. Leaving the view: the element stays in the page, only hidden, so what was read or typed is
  // removed before the next person signs in (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    form.reset();
    form.hidden = true;
    loading.hidden = true;
    unavailable.hidden = true;
    unread.hidden = true;
    saved.hidden = true;
    submit.disabled = false;
    hour.removeAttribute('aria-invalid');
    for (const text of [unavailable, unreadWhy, range, refusal, failure]) text.textContent = '';
  });
  return subscription;
}
