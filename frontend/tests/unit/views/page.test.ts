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
    expect(screens.map((element) => element.id)).toEqual(['week', 'appointments', 'settings', 'users']);
    expect(screens.every((element) => element.hidden)).toBe(true);
    expect(document.querySelector('#app .nav')!.children).toHaveLength(0);
    for (const list of document.querySelectorAll('#week .legend, #week .hours, #week .days, #appointments .list, #users .list')) expect(list.children).toHaveLength(0);
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
      'tpl-user-row',
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

  it('the page has four dialogs, closed, each named by its heading: the book dialog is the week\'s and the two of the users are theirs, outside the regions that are redrawn; the detail belongs to no screen', () => {
    loadPage();
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
    expect(dialogs.map((dialog) => dialog.className)).toEqual(['book', 'created', 'delete', 'detail']);
    for (const dialog of dialogs) {
      expect(dialog.open, dialog.className).toBe(false);
      expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.tagName, dialog.className).toBe('H3');
    }
    const [book, created, remove, detail] = dialogs as [HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement];
    expect(book.parentElement!.id).toBe('week');
    expect(book.closest('.week')).toBeNull();
    for (const dialog of [created, remove]) {
      expect(dialog.parentElement!.id, dialog.className).toBe('users');
      expect(dialog.closest('.list'), dialog.className).toBeNull();
    }
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

  it('the two lists of times of the book dialog are labelled "Start" and "End"; the lines of a change above them say "From:" and "To:"', () => {
    loadPage();
    const label = (name: string) => document.querySelector(`dialog.book [name="${name}"]`)!.closest('label')!.textContent.trim();
    expect([label('start'), label('end')]).toEqual(['Start', 'End']);
    expect(document.querySelector('dialog.book .old')!.parentElement!.textContent).toBe('From: ');
    expect(document.querySelector('dialog.book .what')!.parentElement!.textContent).toBe('To: ');
  });

  it('the settings start with the form hidden and empty: four number fields, each in a field of its own with its label, its range and its refusal, and "No limit"', () => {
    loadPage();
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#settings ${selector}`)!;
    const form = one<HTMLFormElement>('form.settings');
    expect(form.hidden).toBe(true);
    // The script says in words what is wrong with a value: the browser's own check is off.
    expect(form.noValidate).toBe(true);
    const numbers = [...form.querySelectorAll<HTMLInputElement>('input[type="number"]')];
    expect(numbers.map((field) => [field.name, field.closest('label')!.textContent.trim(), field.value])).toEqual([
      ['cancellationNoticeHours', 'Cancellation notice', ''],
      ['minBookingNoticeHours', 'Minimum booking notice', ''],
      ['bookingHorizonDays', 'Booking horizon', ''],
      ['maxFutureAppointmentsPerUser', 'Maximum upcoming appointments per person', ''],
    ]);
    for (const field of numbers) {
      const box = field.closest('.field')!;
      expect(box.querySelectorAll('input[type="number"]'), field.name).toHaveLength(1);
      expect(box.querySelector('.range')!.textContent, field.name).toBe('');
      expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent], field.name).toEqual(['alert', '']);
      // The ranges are the script's to set, from shared/: none is written in the page.
      expect(['min', 'max', 'step', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name)), field.name).toEqual([]);
    }
    const noLimit = one<HTMLInputElement>('[name="noLimit"]');
    expect([noLimit.type, noLimit.checked, noLimit.closest('label')!.textContent.trim()]).toEqual(['checkbox', false, 'No limit']);
    expect(noLimit.closest('.field')).toBe(one('[name="maxFutureAppointmentsPerUser"]').closest('.field'));
    expect([one('.loading').hidden, one('.unread').hidden, one('.saved').hidden]).toEqual([true, true, true]);
    expect([one('.saved').textContent, one('.saved').getAttribute('role'), one('.failure').getAttribute('role')]).toEqual(['Settings saved.', 'status', 'alert']);
    expect([one('.submit').textContent, one('.retry').textContent]).toEqual(['Save', 'Try again']);
    expect([one('.zone-name').textContent, one('.last-saved').textContent]).toEqual(['', '']);
  });

  it('the users start with the form empty and the list empty: one text field in a field of its own, with its label, its hint and its refusal, which a browser neither offers nor corrects', () => {
    loadPage();
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#users ${selector}`)!;
    const form = one<HTMLFormElement>('form.create');
    // The script says in words what is wrong with a username: the browser's own check is off.
    expect(form.noValidate).toBe(true);
    expect(form.closest('.list')).toBeNull();
    const fields = [...document.querySelectorAll<HTMLInputElement>('#users input, #users select, #users textarea')];
    expect(fields.map((field) => [field.name, field.type, field.value, field.closest('label')!.textContent.trim()])).toEqual([['username', 'text', '', 'Username']]);
    const field = fields[0]!;
    expect([field.getAttribute('autocomplete'), field.getAttribute('autocapitalize'), field.getAttribute('spellcheck')]).toEqual(['off', 'none', 'false']);
    // What a username is comes from the script, with the shared rule: no pattern and no length in the page.
    expect(['pattern', 'minlength', 'maxlength', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name))).toEqual([]);
    const box = field.closest('.field')!;
    expect(box.closest('form')).toBe(form);
    expect([box.querySelector('.hint')!.textContent, box.querySelector('.hint')!.id]).toEqual(['', field.getAttribute('aria-describedby')]);
    expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent]).toEqual(['alert', '']);
    expect([one('.failure').getAttribute('role'), one('.failure').textContent, one('.failure').closest('form')]).toEqual(['alert', '', form]);
    expect([one('.submit').textContent, one('.retry').textContent]).toEqual(['Create user', 'Try again']);
    expect([one('.loading').hidden, one('.unread').hidden, one('.empty').hidden]).toEqual([true, true, true]);
    expect([one('.unread .error').getAttribute('role'), one('.empty').textContent]).toEqual(['alert', '']);
  });

  it('a row of the users is the username and one button of type "button", "Delete", and nothing in it can be typed in', () => {
    const row = pageAside().querySelector<HTMLTemplateElement>('#tpl-user-row')!.content.firstElementChild!;
    expect(row.tagName).toBe('LI');
    expect([...row.children].map((part) => [part.tagName, part.textContent])).toEqual([['SPAN', ''], ['BUTTON', 'Delete']]);
    expect(row.querySelector('button')!.getAttribute('type')).toBe('button');
    // Whom it deletes is the script's to say.
    expect(row.querySelector('button')!.hasAttribute('aria-label')).toBe(false);
    expect(row.querySelectorAll('input, select, textarea, a')).toHaveLength(0);
  });

  it('the password dialog starts empty, cannot be closed by the Escape key, and has one button and no field; the keyboard lands on its heading', () => {
    loadPage();
    const dialog = document.querySelector<HTMLDialogElement>('#users dialog.created')!;
    expect(dialog.getAttribute('closedby')).toBe('none');
    // The other dialogs of the page keep closing with Escape.
    expect([...document.querySelectorAll('dialog[closedby]')]).toEqual([dialog]);
    expect([...dialog.querySelectorAll('dd')].map((part) => [part.className, part.textContent])).toEqual([['username', ''], ['password', '']]);
    expect(dialog.querySelector('p')!.textContent).toBe('This password cannot be shown again. Give it to the user now.');
    expect([...dialog.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['I have noted the password']);
    expect(dialog.querySelectorAll('input, select, textarea, form, a')).toHaveLength(0);
    const heading = dialog.querySelector('h3')!;
    expect([heading.textContent, heading.getAttribute('tabindex'), heading.hasAttribute('autofocus')]).toEqual(['User created', '-1', true]);
    expect(document.querySelectorAll('[autofocus]')).toHaveLength(1);
  });

  it('the delete dialog starts empty, with "Keep" before "Delete user", and nothing to type', () => {
    loadPage();
    const dialog = document.querySelector<HTMLDialogElement>('#users dialog.delete')!;
    expect(dialog.querySelector('h3')!.textContent).toBe('Delete user');
    expect([dialog.querySelector('.question')!.textContent, dialog.querySelector('.error')!.textContent, dialog.querySelector('.error')!.getAttribute('role')]).toEqual(['', '', 'alert']);
    expect([...dialog.querySelectorAll('button')].map((button) => [button.textContent, button.disabled])).toEqual([['Keep', false], ['Delete user', false]]);
    expect(dialog.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
  });
});
