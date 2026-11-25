import { readFileSync } from 'node:fs';

// The real page for the views' tests (docs/FRONTEND_ARCHITECTURE.md section 8): a selector of a
// view that does not match the markup of index.html fails here, since nothing checks it when the
// code is compiled. A helper, not a test file. Tests may use Node's fs; the views may not.

// The folder of this file, not import.meta.url: under happy-dom a URL is resolved against the
// emulated page's address, not the disk.
export const PAGE_FILE = `${import.meta.dirname}/../../../index.html`;

// The whole text of index.html, as it is on the disk.
export function pageSource(): string {
  return readFileSync(PAGE_FILE, 'utf8');
}

// The whole page as elements that are kept aside, in a <template>: nothing of it is loaded or
// run, so its <script> and <link> can be looked at.
export function pageAside(): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = pageSource();
  return template.content;
}

// Replaces the emulated document's <body> with the one of index.html: every test starts from the
// page as the browser has it before the script runs. Only the body: the <head>'s script and
// style sheet are never loaded.
export function loadPage(): void {
  const source = pageSource();
  const start = source.indexOf('<body>');
  const end = source.lastIndexOf('</body>');
  if (start < 0 || end < start) throw new Error('index.html has no <body>…</body>');
  document.body.innerHTML = source.slice(start + '<body>'.length, end);
}

// Call once in a test file: the page is loaded again before each of its tests.
export function useRealPage(): void {
  beforeEach(loadPage);
}

export function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`index.html has no element for "${selector}"`);
  return element;
}

// Types into a field of a form, as a person would.
export function type(form: HTMLFormElement, name: string, value: string): void {
  find<HTMLInputElement>(`#${form.closest('[id]')!.id} [name="${name}"]`).value = value;
}

// Sends the form as the browser does on a click of its button, and says whether the handler
// stopped the browser's own sending, which would load the page again.
export function submit(form: HTMLFormElement): { prevented: boolean } {
  const event = new Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return { prevented: event.defaultPrevented };
}

// A choice in a list, as a person makes it: the value, then the `change` event, which a value
// set by a script never sends.
export function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// The two lists of a time inside `scope`, named `<name>-hour` and `<name>-minute`.
export function clock(scope: Element, name: string): [HTMLSelectElement, HTMLSelectElement] {
  const list = (part: string) => {
    const select = scope.querySelector<HTMLSelectElement>(`[name="${name}-${part}"]`);
    if (select === null) throw new Error(`no list "${name}-${part}" there`);
    return select;
  };
  return [list('hour'), list('minute')];
}

// A time chosen by a person: its hour, then its minute, each a choice of its own.
export function chooseTime(scope: Element, name: string, time: string): void {
  const [hour, minute] = clock(scope, name);
  choose(hour, time.slice(0, 2));
  choose(minute, time.slice(3, 5));
}

// What the two lists of a time hold, as "HH:mm", or "" while one holds nothing.
export function timeIn(scope: Element, name: string): string {
  const [hour, minute] = clock(scope, name);
  return hour.value === '' || minute.value === '' ? '' : `${hour.value}:${minute.value}`;
}

// The two lists of a time set as a script sets them: no event.
export function setTime(scope: Element, name: string, time: string): void {
  const [hour, minute] = clock(scope, name);
  hour.value = time.slice(0, 2);
  minute.value = time.slice(3, 5);
}

// The texts of the choices of a list.
export function choicesOf(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.textContent);
}
