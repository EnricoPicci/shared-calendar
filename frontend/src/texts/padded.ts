import type { PageTexts } from './texts';

// The padded test language (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 4): every text
// is the English one between two marks and lengthened by about a third, so that a text written
// straight into a view or a model instead of the texts shows without marks, and a place too
// tight for a longer language shows at once. It is never shipped: only the views' tests and the
// development server use it (frontend/scripts/bundle.mjs, the constant TEST_LANGUAGE).

export const PADDED_OPEN = '⟦';
export const PADDED_CLOSE = '⟧';
const PADDING = '·';

// A text between the marks, with one padding character for every three of its own.
export function pad(text: string): string {
  return `${PADDED_OPEN}${text}${PADDING.repeat(Math.ceil(text.length / 3))}${PADDED_CLOSE}`;
}

// Every string padded and every function's answer padded, all the way down; anything else is kept,
// and so is the language of the texts, which is no text.
function padAll(value: unknown, key = ''): unknown {
  if (key === 'locale') return value;
  if (typeof value === 'string') return pad(value);
  if (typeof value === 'function') return (...args: unknown[]) => pad((value as (...a: unknown[]) => string)(...args));
  if (Array.isArray(value)) return value.map((item) => padAll(item));
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, padAll(inner, name)]));
  return value;
}

/** The page texts of the padded test language, made from the English ones. */
export function padded(english: PageTexts): PageTexts {
  return padAll(english) as PageTexts;
}
