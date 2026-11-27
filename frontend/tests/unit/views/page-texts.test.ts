import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';
import { padded, PADDED_CLOSE, PADDED_OPEN } from '../../../src/texts/padded';
import { fillPage, fillTexts, htmlText } from '../../../src/views/page-texts';
import { find, pageAside, useRealPage } from './page';

// The page's keys (docs/MULTILANGUAGE_ARCHITECTURE.md section 5.2 and decision L11): index.html
// holds keys and no words; every key names a text of `html` in the page texts and every such text
// is used by a key; the shell fills them all.

// Every key of the page as written, of its elements and of its templates, text and label alike.
function keysOf(root: ParentNode): string[] {
  const own = [...root.querySelectorAll<HTMLElement>('[data-text]')].map((element) => element.dataset.text!);
  const labels = [...root.querySelectorAll<HTMLElement>('[data-label]')].map((element) => element.dataset.label!);
  const inTemplates = [...root.querySelectorAll('template')].flatMap((template) => keysOf(template.content));
  return [...own, ...labels, ...inTemplates];
}

// Every text of `html`, by its path.
function textKeys(value: unknown, path = ''): string[] {
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, inner]) => textKeys(inner, path === '' ? key : `${path}.${key}`));
  return [path];
}

// The parts of the page whose words have not been moved to keys yet
// (docs/MULTILANGUAGE_PLAN.md decision D6): the list only shortens, and goes with the last group.
const NOT_YET_MOVED = ['#week', '#appointments', '#settings', '#users', '#availability', '#me', '#detail', '#assistant'];

// The texts of a part of the page that a person could read: its text nodes, comments not
// included, and the names for a screen reader written straight into it. Inside a template too.
function wordsOf(root: ParentNode, skip: readonly string[]): string[] {
  const words: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof Element && skip.some((selector) => node.matches(selector))) return;
    if (node.nodeType === 3 && /\p{L}/u.test(node.textContent ?? '')) words.push(node.textContent!.trim());
    if (node instanceof Element) {
      for (const name of ['aria-label', 'placeholder', 'title', 'alt']) if (node.hasAttribute(name)) words.push(`${name}="${node.getAttribute(name)}"`);
      if (node instanceof HTMLTemplateElement) walk(node.content);
    }
    node.childNodes.forEach(walk);
  };
  walk(root as Node);
  return words;
}

describe('the keys of index.html', () => {
  useRealPage();

  it('each name a text of the page texts', () => {
    const page = pageAside(false);
    const keys = keysOf(page);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(() => htmlText(PAGE_TEXTS_EN.html, key), key).not.toThrow();
  });

  it('use every text of the page texts that is for the page', () => {
    const used = new Set(keysOf(pageAside(false)));
    for (const key of textKeys(PAGE_TEXTS_EN.html)) expect(used.has(key), `${key} is used by no element`).toBe(true);
  });

  it('stand where the words stood: no element with a key holds words of its own', () => {
    for (const element of pageAside(false).querySelectorAll('[data-text]')) expect(element.textContent, (element as HTMLElement).dataset.text).toBe('');
  });

  it('the page as written holds no words outside the parts not yet moved, and its title is empty', () => {
    const page = pageAside(false);
    expect(wordsOf(page, NOT_YET_MOVED)).toEqual([]);
    expect(page.querySelector('title')!.textContent).toBe('');
  });

  it('each part not yet moved is in the page', () => {
    const page = pageAside(false);
    for (const selector of NOT_YET_MOVED) expect(page.querySelector(selector), selector).not.toBeNull();
  });
});

describe('fillPage', () => {
  useRealPage();

  it('puts every text in its place: the words, the names for a screen reader, the title and the language', () => {
    document.title = '';
    document.documentElement.lang = '';
    fillPage(document, PAGE_TEXTS_EN.html, 'it');
    expect(find('#app .sign-out').textContent).toBe('Sign out');
    expect(find('#app .title').textContent).toBe('Shared calendar');
    expect(find('#app .nav').getAttribute('aria-label')).toBe('Screens');
    expect(document.title).toBe('Shared calendar');
    expect(document.documentElement.lang).toBe('it');
  });

  it('fills the copies a view makes later: the keys inside a template', () => {
    const template = document.createElement('template');
    template.innerHTML = '<p data-text="frame.signOut"></p><nav data-label="frame.screens"></nav>';
    document.body.append(template);
    fillTexts(document, PAGE_TEXTS_EN.html);
    expect(template.content.querySelector('p')!.textContent).toBe('Sign out');
    expect(template.content.querySelector('nav')!.getAttribute('aria-label')).toBe('Screens');
  });

  it('in the padded test language, every filled text is marked', () => {
    fillPage(document, padded(PAGE_TEXTS_EN).html, 'en');
    for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) expect(element.textContent).toMatch(new RegExp(`^${PADDED_OPEN}.+${PADDED_CLOSE}$`));
    expect(document.title.startsWith(PADDED_OPEN)).toBe(true);
  });

  it('a key that names no text, or a group of texts, is refused at once', () => {
    expect(() => htmlText(PAGE_TEXTS_EN.html, 'frame.nothing')).toThrow('index.html: the key "frame.nothing" names no text');
    expect(() => htmlText(PAGE_TEXTS_EN.html, 'frame')).toThrow('names no text');
    expect(() => htmlText(PAGE_TEXTS_EN.html, 'frame.title.more')).toThrow('names no text');
  });
});
