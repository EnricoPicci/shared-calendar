import type { Language } from '@shared-calendar/shared';
import type { HtmlTexts } from '../texts/texts';

// The fixed texts of index.html, which holds keys instead of words
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L11): an element whose whole content is a text
// carries `data-text="<key>"`, and one whose name for a screen reader is a text carries
// `data-label="<key>"`; the key is the path of the text under `html` in the page texts
// (frontend/src/texts/texts.ts). The shell fills them before it shows anything; everything starts
// hidden, so nothing is seen before it is filled.

// The text of a key. A key that names no text, or names a group of texts, is a mistake of the
// page: said at once, rather than a blank on the screen. The page's keys' test finds it first.
export function htmlText(texts: HtmlTexts, key: string): string {
  const text = key.split('.').reduce<unknown>((group, part) => (typeof group === 'object' && group !== null ? (group as Record<string, unknown>)[part] : undefined), texts);
  if (typeof text !== 'string') throw new Error(`index.html: the key "${key}" names no text`);
  return text;
}

// Every key under `root` and in its templates, which a view copies later: a copy then carries
// its words already.
export function fillTexts(root: ParentNode, texts: HtmlTexts): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-text]')) element.textContent = htmlText(texts, element.dataset.text!);
  for (const element of root.querySelectorAll<HTMLElement>('[data-label]')) element.setAttribute('aria-label', htmlText(texts, element.dataset.label!));
  for (const template of root.querySelectorAll('template')) fillTexts(template.content, texts);
}

// Fills the whole page in one language: every key, the browser tab's title, and the page's
// language, so that a screen reader pronounces it rightly.
export function fillPage(document: Document, texts: HtmlTexts, language: Language): void {
  fillTexts(document, texts);
  document.title = texts.frame.title;
  document.documentElement.lang = language;
}
