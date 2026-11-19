import { CALENDAR_LIMITS } from '@shared-calendar/shared';
import { loadPage, pageAside } from './page';

// index.html itself: what docs/FRONTEND_ARCHITECTURE.md section 3, rules 2 and 6 ask of the page,
// checked on the file every view's test loads.
describe('index.html', () => {
  it('loads one module script and one style sheet, by the names the build writes', () => {
    const page = pageAside();
    const scripts = [...page.querySelectorAll('script')];
    expect(scripts.map((s) => [s.getAttribute('type'), s.getAttribute('src'), s.textContent])).toEqual([['module', 'app.js', '']]);
    expect([...page.querySelectorAll('link')].map((l) => [l.getAttribute('rel'), l.getAttribute('href')])).toEqual([['stylesheet', 'style.css']]);
  });

  it('has nothing inline: no <style>, no style attribute, no handler attribute', () => {
    const page = pageAside();
    expect(page.querySelectorAll('style')).toHaveLength(0);
    const attributes = [...page.querySelectorAll('*')].flatMap((element) => element.getAttributeNames());
    expect(attributes.filter((name) => name === 'style' || name.startsWith('on'))).toEqual([]);
  });

  it('starts with everything hidden: the script decides what is shown', () => {
    loadPage();
    const top = [...document.body.children];
    expect(top.map((element) => element.id)).toEqual(['login', 'app']);
    expect(top.every((element) => (element as HTMLElement).hidden)).toBe(true);
  });

  it('every screen of the frame has an id and starts hidden; the navigation and the lists start empty', () => {
    loadPage();
    const screens = [...document.querySelectorAll<HTMLElement>('#app main.screen > :not(template)')];
    expect(screens.map((element) => element.id)).toEqual(['week', 'appointments']);
    expect(screens.every((element) => element.hidden)).toBe(true);
    expect(document.querySelector('#app .nav')!.children).toHaveLength(0);
    for (const list of document.querySelectorAll('#week .legend, #week .hours, #week .days, #appointments .list')) expect(list.children).toHaveLength(0);
  });

  it('every <template> has an id of its own and holds exactly one element', () => {
    const templates = [...pageAside().querySelectorAll('template')];
    expect(templates.map((template) => template.id)).toEqual([
      'tpl-nav-link',
      'tpl-legend-item',
      'tpl-hour',
      'tpl-day',
      'tpl-window',
      'tpl-busy',
      'tpl-slot',
      'tpl-appointment',
      'tpl-option',
      'tpl-appointment-row',
    ]);
    for (const template of templates) expect(template.content.children, template.id).toHaveLength(1);
  });

  it('no id is used twice', () => {
    const ids = [...pageAside().querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('of the week\'s templates only a slot and an appointment can be clicked: each is one button of type "button"; nothing in a template can be typed in', () => {
    const templates = [...pageAside().querySelectorAll<HTMLTemplateElement>('#week template')];
    const clickable = templates.filter((template) => template.content.querySelector('button, a') !== null).map((template) => template.id);
    expect(clickable).toEqual(['tpl-slot', 'tpl-appointment']);
    for (const id of clickable) {
      const block = pageAside().querySelector<HTMLTemplateElement>(`#${id}`)!.content.firstElementChild!;
      expect([block.tagName, block.getAttribute('type')], id).toEqual(['BUTTON', 'button']);
      expect(block.querySelectorAll('button, a'), id).toHaveLength(0);
    }
    for (const template of templates) expect(template.content.querySelectorAll('input, select, textarea'), template.id).toHaveLength(0);
  });

  it('the page has two dialogs, closed, each named by its heading: the book dialog is the week\'s, outside the region that is redrawn; the detail belongs to no screen', () => {
    loadPage();
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
    expect(dialogs.map((dialog) => dialog.className)).toEqual(['book', 'detail']);
    for (const dialog of dialogs) {
      expect(dialog.open, dialog.className).toBe(false);
      expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.tagName, dialog.className).toBe('H3');
    }
    const [book, detail] = dialogs as [HTMLDialogElement, HTMLDialogElement];
    expect(book.parentElement!.id).toBe('week');
    expect(book.closest('.week')).toBeNull();
    // The detail is opened from two screens: it is in the frame, after the screens, with an id
    // of its own for the views that mount it.
    expect(detail.id).toBe('detail');
    expect(detail.parentElement!.id).toBe('app');
    expect(detail.closest('main')).toBeNull();
  });

  it('the book dialog starts with no choice in its lists and the Administrator\'s part hidden; the note is limited to 500 characters', () => {
    loadPage();
    for (const select of document.querySelectorAll('dialog.book select')) expect(select.children).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('dialog.book .choices')!.hidden).toBe(true);
    expect(document.querySelector('dialog.book textarea')!.getAttribute('maxlength')).toBe(String(CALENDAR_LIMITS.noteLength));
    expect(document.querySelector<HTMLElement>('dialog.detail .cancel')!.hidden).toBe(true);
  });

  it('every button outside a form says its type, so that none sends a form by accident', () => {
    const outside = [...pageAside().querySelectorAll('button')].filter((button) => button.closest('form') === null);
    for (const button of [...outside, ...[...pageAside().querySelectorAll('template')].flatMap((t) => [...t.content.querySelectorAll('button')])]) {
      expect(button.getAttribute('type'), button.className).toBe('button');
    }
  });
  it('the detail starts with the note as a text, its form hidden, and neither "Change" nor "Cancel appointment"; its field is limited like the book dialog\'s', () => {
    loadPage();
    expect(document.querySelector<HTMLElement>('dialog.detail .note-form')!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('dialog.detail .noted')!.hidden).toBe(false);
    expect(document.querySelector('dialog.detail textarea')!.getAttribute('maxlength')).toBe(String(CALENDAR_LIMITS.noteLength));
    expect(document.querySelector<HTMLElement>('dialog.detail .change')!.hidden).toBe(true);
    // The two actions of the detail that are not in its form do not send it.
    expect(document.querySelector('dialog.detail .note-form')!.querySelectorAll('button')).toHaveLength(1);
  });

  it('the book dialog starts in its first mode: the texts of a booking shown, those of a change hidden, each mode with its title and its button', () => {
    loadPage();
    const texts = (selector: string) => [...document.querySelectorAll<HTMLElement>(`dialog.book ${selector}`)].map((element) => [element.textContent, element.hidden]);
    expect(texts('h3 span')).toEqual([['Book an appointment', false], ['Change appointment', true]]);
    expect(texts('.submit span')).toEqual([['Book', false], ['Change', true]]);
    expect([...document.querySelectorAll<HTMLElement>('dialog.book .in-change')].every((element) => element.hidden)).toBe(true);
    expect([...document.querySelectorAll<HTMLElement>('dialog.book .in-booking')].some((element) => element.hidden)).toBe(false);
    // The choice of User is a booking's only.
    expect(document.querySelector('dialog.book [name="username"]')!.closest('.in-booking')).not.toBeNull();
    expect(document.querySelector('dialog.book [name="start"]')!.closest('.in-booking')).toBeNull();
  });

  it('the banner of a move starts hidden and empty, outside the region that is redrawn, with its fixed words and its button', () => {
    loadPage();
    const banner = document.querySelector<HTMLElement>('#week .moving')!;
    expect(banner.hidden).toBe(true);
    expect(banner.closest('.week')).toBeNull();
    expect(banner.querySelector('p')!.textContent).toBe('Moving: . Choose a free time.');
    expect(banner.querySelector('button')!.textContent).toBe('Keep the appointment as it is');
  });

  it('no class of the page holds the word "admin": the shell\'s test looks for that name in the whole document', () => {
    const classes = [...pageAside().querySelectorAll('[class]')].flatMap((element) => [...element.classList]);
    expect(classes.filter((name) => name.includes('admin'))).toEqual([]);
  });

  it('"My appointments" starts on neither mode, with the period\'s form hidden and empty, outside the list that is redrawn, and nothing shown', () => {
    loadPage();
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#appointments ${selector}`)!;
    expect([one('.upcoming'), one('.history')].map((button) => [button.textContent, button.getAttribute('aria-pressed')])).toEqual([
      ['Upcoming', 'false'],
      ['History', 'false'],
    ]);
    const period = one<HTMLFormElement>('.period');
    expect(period.hidden).toBe(true);
    expect(period.closest('.list')).toBeNull();
    expect([...period.querySelectorAll('input')].map((field) => [field.type, field.name, field.value])).toEqual([
      ['date', 'from', ''],
      ['date', 'to', ''],
    ]);
    expect(period.querySelector('button')!.textContent).toBe('Show');
    // The script says in words what is wrong with the dates: the browser's own check is off.
    expect(period.noValidate).toBe(true);
    expect([one('.loading').hidden, one('.failure').hidden, one('.empty').hidden]).toEqual([true, true, true]);
    for (const alert of [one('.refusal'), one('.failure')]) expect([alert.getAttribute('role'), alert.textContent]).toEqual(['alert', '']);
  });

  it('a row of the list is one button of type "button" with its five texts, and nothing in it can be typed in', () => {
    const row = pageAside().querySelector<HTMLTemplateElement>('#tpl-appointment-row')!.content.firstElementChild!;
    expect(row.tagName).toBe('LI');
    const buttons = row.querySelectorAll('button, a');
    expect(buttons).toHaveLength(1);
    expect([buttons[0]!.tagName, buttons[0]!.getAttribute('type')]).toEqual(['BUTTON', 'button']);
    expect([...buttons[0]!.children].map((part) => part.className)).toEqual(['date', 'time', 'type-name', 'note', 'status']);
    expect(row.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });
});
