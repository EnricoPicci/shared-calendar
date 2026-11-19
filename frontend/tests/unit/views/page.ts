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
