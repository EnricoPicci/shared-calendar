import { CALENDAR_LIMITS } from '@shared-calendar/shared';
import { readFileSync } from 'node:fs';
import { loadPage, PAGE_FILE, pageAside } from './page';

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
    expect(screens.map((element) => element.id)).toEqual(['week', 'appointments', 'settings', 'users', 'availability', 'password', 'me']);
    expect(screens.every((element) => element.hidden)).toBe(true);
    expect(document.querySelector('#app .nav')!.children).toHaveLength(0);
    for (const list of document.querySelectorAll('#week .legend, #week .hours, #week .days, #appointments .list, #users .list, #availability .list, #availability .groups, #availability .conflicts-list, #password .needs')) expect(list.children).toHaveLength(0);
  });

  it('every <template> has an id of its own and holds exactly one element', () => {
    const templates = [...pageAside().querySelectorAll('template')];
    expect(templates.map((template) => template.id)).toEqual([
      'tpl-first-password-need',
      'tpl-nav-link',
      'tpl-legend-item',
      'tpl-hour',
      'tpl-day',
      'tpl-window',
      'tpl-busy',
      'tpl-slot',
      'tpl-appointment',
      'tpl-group',
      'tpl-person',
      'tpl-option',
      'tpl-appointment-row',
      'tpl-user-row',
      'tpl-type-row',
      'tpl-pattern-group',
      'tpl-pattern-row',
      'tpl-conflict',
      'tpl-choice',
      'tpl-date-window',
      'tpl-draft-row',
      'tpl-extra-row',
      'tpl-password-need',
      'tpl-message',
      'tpl-proposed',
    ]);
    for (const template of templates) expect(template.content.children, template.id).toHaveLength(1);
  });

  // Reading the page without a mouse (docs/FRONTEND_VIEW_PLAN.md step 69): what a screen
  // reader says of a field, of a button and of a dialog that asks.
  describe('without a mouse', () => {
    // The words of a label, without those of the field it holds (a list's choices are in the
    // label's text): its own text and the text of its other elements, such as the words "Hour"
    // and "Minute" that only a screen reader says.
    const words = (label: Element) => [...label.childNodes].filter((node) => !(node instanceof Element && node.matches('input, select, textarea'))).map((node) => node.textContent).join('').trim();
    const everywhere = (selector: string) => {
      const page = pageAside();
      return [...page.querySelectorAll<HTMLElement>(selector), ...[...page.querySelectorAll('template')].flatMap((template) => [...template.content.querySelectorAll<HTMLElement>(selector)])];
    };

    it('every field has its label: a <label> around it, with words of its own', () => {
      const fields = everywhere('input, select, textarea');
      // A start and an end are two lists each, an hour and a minute: five places, ten lists more.
      // The sign-in screen's choice of language is one of them.
      expect(fields).toHaveLength(71);
      for (const field of fields) {
        const label = field.closest('label');
        expect(label, field.getAttribute('name')!).not.toBeNull();
        expect(words(label!), field.getAttribute('name')!).not.toBe('');
        // One field per label: the words are of this field only.
        expect(label!.querySelectorAll('input, select, textarea'), field.getAttribute('name')!).toHaveLength(1);
      }
    });

    it('every time is a group named by its legend, "Start" or "End", of two lists whose words "Hour" and "Minute" only a screen reader says, the colon between them hidden from it', () => {
      const groups = everywhere('fieldset.clock');
      // The pattern's two forms, the two window forms of a date and the book dialog.
      expect(groups).toHaveLength(10);
      for (const group of groups) {
        const legend = group.querySelector('legend')!.textContent;
        expect(['Start', 'End'], legend).toContain(legend);
        const name = legend.toLowerCase();
        expect([...group.querySelectorAll('select')].map((list) => [list.name, words(list.closest('label')!), list.closest('label')!.querySelector('.unseen')!.textContent])).toEqual([
          [`${name}-hour`, 'Hour', 'Hour'],
          [`${name}-minute`, 'Minute', 'Minute'],
        ]);
        const colon = [...group.children].find((part) => part.textContent === ':')!;
        expect([colon.tagName, colon.getAttribute('aria-hidden')]).toEqual(['SPAN', 'true']);
        expect(group.querySelectorAll('input, select, textarea')).toHaveLength(2);
      }
      // The class that hides words from the eye is used for those words only.
      expect(everywhere('.unseen').map((part) => part.textContent).sort()).toEqual([...Array(10).fill('Hour'), ...Array(10).fill('Minute')].sort());
    });

    it('every button has words, or a name for a screen reader; the two arrows of the week and every "Try again" say what they act on', () => {
      // A slot's, an appointment's and a row's button are filled by the script: they hold the places of their texts.
      for (const button of everywhere('button')) expect(button.textContent.trim() !== '' || button.hasAttribute('aria-label') || button.children.length > 0, button.className).toBe(true);
      const named = everywhere('button[aria-label]').map((button) => [button.textContent, button.getAttribute('aria-label')]);
      expect(named).toEqual([
        ['‹', 'Previous week'],
        ['›', 'Next week'],
        ['Try again', 'Try again to read the settings'],
        ["Try again", "Try again to read the daily e-mail's settings"],
        ['Try again', 'Try again to read the users'],
        ['Try again', 'Try again to read the types'],
        ['Try again', 'Try again to read the weekly patterns'],
        ['Try again', 'Try again to read this date'],
        ['Try again', 'Try again to read your details'],
      ]);
      expect(everywhere('.retry')).toHaveLength(7);
    });

    it('a dialog that asks before an action is described by its question, which a screen reader says when it opens', () => {
      loadPage();
      const asking = [...document.querySelectorAll('dialog[aria-describedby]')];
      expect(asking.map((dialog) => [dialog.parentElement!.id, dialog.className])).toEqual([['users', 'invite'], ['users', 'delete'], ['availability', 'delete']]);
      for (const dialog of asking) expect(document.getElementById(dialog.getAttribute('aria-describedby')!)).toBe(dialog.querySelector('.question'));
    });

    it('every failure and every refusal is announced at once (role "alert"), every "Loading…" and every other news when the reader is free (role "status")', () => {
      const place = (element: Element) => [...element.classList].join('.');
      const alerts = everywhere('[role="alert"]');
      const failures = everywhere('.error');
      expect(failures).toHaveLength(73);
      expect(alerts).toEqual(failures);
      for (const alert of alerts) expect(['P', alert.textContent], place(alert)).toEqual(['P', '']);
      const loading = everywhere('.loading');
      expect(loading.map((element) => [element.getAttribute('role'), element.textContent, element.hidden])).toEqual(Array.from({ length: 8 }, () => ['status', 'Loading…', true]));
      // What else is news: "Password changed" at the login, the appointment being moved, the
      // list of Users being read for the book dialog, where a mail asked for goes,
      // "Settings saved.", "E-mail is not available yet", "Daily e-mail saved.", where an
      // invitation went, and what the assistant answers.
      expect(everywhere('[role="status"]:not(.loading)').map((element) => place(element) || place(element.parentElement!))).toEqual(['notice', 'moving', 'users-message', 'mail-sent', 'saved', 'unavailable', 'saved', 'answer', 'news']);
    });
  });

  it('no id is used twice', () => {
    const ids = [...pageAside().querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('of the week\'s templates only a slot, an appointment, a group and a row of a group\'s list can be clicked: each block is one button of type "button", the row a list item holding one; nothing in a template can be typed in', () => {
    const templates = [...pageAside().querySelectorAll<HTMLTemplateElement>('#week template')];
    const clickable = templates.filter((template) => template.content.querySelector('button, a') !== null).map((template) => template.id);
    expect(clickable).toEqual(['tpl-slot', 'tpl-appointment', 'tpl-group', 'tpl-person']);
    const first = (id: string) => pageAside().querySelector<HTMLTemplateElement>(`#${id}`)!.content.firstElementChild!;
    for (const id of ['tpl-slot', 'tpl-appointment', 'tpl-group']) {
      const block = first(id);
      expect([block.tagName, block.getAttribute('type')], id).toEqual(['BUTTON', 'button']);
      expect(block.querySelectorAll('button, a'), id).toHaveLength(0);
    }
    const row = first('tpl-person');
    expect([row.tagName, row.querySelectorAll('button').length, row.querySelector('button')!.getAttribute('type'), row.querySelectorAll('a').length]).toEqual(['LI', 1, 'button', 0]);
    for (const template of templates) expect(template.content.querySelectorAll('input, select, textarea'), template.id).toHaveLength(0);
  });

  it('the page has eleven dialogs, closed, each named by its heading: the book dialog, the mail\'s and the list of a group are the week\'s, three are the users\', three the availability\'s and one is "My details", outside the regions that are redrawn; the detail belongs to no screen', () => {
    loadPage();
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
    expect(dialogs.map((dialog) => dialog.className)).toEqual(['book', 'mail', 'group', 'edit', 'invite', 'delete', 'rename', 'change', 'delete', 'edit', 'detail']);
    for (const dialog of dialogs) {
      expect(dialog.open, dialog.className).toBe(false);
      expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.tagName, dialog.className).toBe('H3');
    }
    const [book, mail, group, edit, invite, remove, rename, change, removeAvailability, editMe, detail] = dialogs as HTMLDialogElement[] as [HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement, HTMLDialogElement];
    for (const dialog of [book, group, mail]) {
      expect(dialog.parentElement!.id, dialog.className).toBe('week');
      expect(dialog.closest('.week'), dialog.className).toBeNull();
    }
    expect(editMe.parentElement!.id).toBe('me');
    for (const dialog of [invite, remove, edit]) {
      expect(dialog.parentElement!.id, dialog.className).toBe('users');
      expect(dialog.closest('.list'), dialog.className).toBeNull();
    }
    for (const dialog of [rename, change, removeAvailability]) {
      expect(dialog.parentElement!.id, dialog.className).toBe('availability');
      expect(dialog.closest('.list, .groups'), dialog.className).toBeNull();
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

  it('the book dialog\'s "Book anyway" starts hidden, after the failure and before the dialog\'s own buttons; its button sends no form and is described by its question', () => {
    loadPage();
    const anyway = document.querySelector<HTMLElement>('dialog.book .anyway')!;
    const force = anyway.querySelector('button')!;
    expect(anyway.hidden).toBe(true);
    expect([anyway.previousElementSibling!.className, anyway.nextElementSibling!.className]).toEqual(['error', 'actions']);
    expect([force.className, force.getAttribute('type'), document.getElementById(force.getAttribute('aria-describedby')!)]).toEqual(['danger force', 'button', anyway.querySelector('p')]);
    // Its words in the two modes of the dialog, the second hidden as the dialog opens.
    const words = (element: Element) => [...element.children].map((part) => [part.className, part.textContent, part.hasAttribute('hidden')]);
    expect(words(anyway.querySelector('p')!)).toEqual([['in-booking', 'Book anyway, over the capacity?', false], ['in-change', 'Change anyway, over the capacity?', true]]);
    expect(words(force)).toEqual([['in-booking', 'Book anyway', false], ['in-change', 'Change anyway', true]]);
  });

  it('the list of a group starts empty, with its heading and "Close" and nothing to type', () => {
    loadPage();
    const group = document.querySelector<HTMLDialogElement>('dialog.group')!;
    expect([group.querySelector('.what')!.textContent, group.querySelector('.when')!.textContent, group.querySelector('.people')!.children.length]).toEqual(['', '', 0]);
    expect([...group.querySelectorAll('button')].map((button) => [button.textContent, button.className])).toEqual([['Close', 'close']]);
    expect(group.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
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
    expect(document.querySelector('dialog.book [name="start-hour"]')!.closest('.in-booking')).toBeNull();
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

  it('the two times of the book dialog are named "Start" and "End", two lists each; the lines of a change above them say "From:" and "To:"', () => {
    loadPage();
    const group = (name: string) => document.querySelector(`dialog.book [name="${name}-hour"]`)!.closest('fieldset')!;
    expect([group('start').querySelector('legend')!.textContent, group('end').querySelector('legend')!.textContent]).toEqual(['Start', 'End']);
    expect([...document.querySelectorAll<HTMLSelectElement>('dialog.book .times select')].map((list) => list.name)).toEqual(['start-hour', 'start-minute', 'end-hour', 'end-minute']);
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

  it('the settings\' "Daily e-mail" is a part of its own after the form, hidden and empty: a switch and the hour, its range and its refusal; "not available yet" is the script\'s to say', () => {
    loadPage();
    const part = document.querySelector<HTMLElement>('#settings .daily-mail')!;
    expect(part.previousElementSibling).toBe(document.querySelector('#settings form.settings'));
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => part.querySelector<T>(selector)!;
    expect(one('h3').textContent).toBe('Daily e-mail');
    const form = one<HTMLFormElement>('form.daily');
    expect([form.hidden, form.noValidate]).toEqual([true, true]);
    const fields = [...form.querySelectorAll<HTMLInputElement>('input, select, textarea')];
    expect(fields.map((field) => [field.name, field.type, field.checked, field.value, field.closest('label')!.textContent.trim()])).toEqual([
      ['dailyEnabled', 'checkbox', false, 'on', 'Send the daily e-mail'],
      ['dailyHour', 'text', false, '', 'Hour'],
    ]);
    const hour = fields[1]!;
    expect(['min', 'max', 'pattern', 'required', 'aria-invalid'].filter((name) => hour.hasAttribute(name))).toEqual([]);
    expect([one('.range').textContent, one('.refusal').textContent, one('.refusal').getAttribute('role')]).toEqual(['', '', 'alert']);
    expect([one('.loading').hidden, one('.unavailable').hidden, one('.unread').hidden, one('.saved').hidden]).toEqual([true, true, true, true]);
    expect([one('.unavailable').textContent, one('.unavailable').getAttribute('role')]).toEqual(['', 'status']);
    expect([one('.saved').textContent, one('.submit').textContent, one('.retry').textContent]).toEqual(['Daily e-mail saved.', 'Save daily e-mail', 'Try again']);
  });

  it('the login has a place for its notice, empty, read when the reader is free, before the form', () => {
    loadPage();
    const notice = document.querySelector('#login .notice')!;
    expect([notice.tagName, notice.getAttribute('role'), notice.textContent]).toEqual(['P', 'status', '']);
    expect(notice.nextElementSibling!.tagName).toBe('FORM');
  });

  it('the password screen is one form of three password fields, each in a field of its own with its label and its hint; the browser offers to save the new one', () => {
    loadPage();
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#password ${selector}`)!;
    const form = one<HTMLFormElement>('form.change-password');
    // The script says in words what a new password still misses: the browser's own check is off.
    expect(form.noValidate).toBe(true);
    const fields = [...document.querySelectorAll<HTMLInputElement>('#password input, #password select, #password textarea')];
    expect(fields.map((field) => [field.name, field.type, field.value, field.getAttribute('autocomplete'), field.closest('label')!.textContent.trim()])).toEqual([
      ['current', 'password', '', 'current-password', 'Current password'],
      ['next', 'password', '', 'new-password', 'New password'],
      ['again', 'password', '', 'new-password', 'New password again'],
    ]);
    for (const field of fields) {
      // What a password must be comes from the script, with the shared rule: nothing in the page.
      expect(['pattern', 'minlength', 'maxlength', 'required', 'value', 'aria-invalid'].filter((name) => field.hasAttribute(name)), field.name).toEqual([]);
      const box = field.closest('.field')!;
      expect(box.closest('form'), field.name).toBe(form);
      const hint = document.getElementById(field.getAttribute('aria-describedby')!)!;
      expect([hint.closest('.field'), hint.classList.contains('hint'), hint.textContent], field.name).toEqual([box, true, '']);
    }
    expect(one('.new-field .needs').tagName).toBe('UL');
    expect([one('.current-field .refusal').getAttribute('role'), one('.current-field .refusal').textContent]).toEqual(['alert', '']);
    expect([one('.failure').getAttribute('role'), one('.failure').textContent, one('.failure').closest('form')]).toEqual(['alert', '', form]);
    expect([...form.querySelectorAll('button')].map((button) => [button.textContent, button.getAttribute('type')])).toEqual([['Change password', null]]);
    expect(document.querySelector<HTMLTemplateElement>('#tpl-password-need')!.content.firstElementChild!.outerHTML).toBe('<li class="need"></li>');
  });

  it('the users start with the form empty and the list empty: the username in a field of its own, with its label, its hint and its refusal, which a browser neither offers nor corrects', () => {
    loadPage();
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#users ${selector}`)!;
    const form = one<HTMLFormElement>('form.create');
    // The script says in words what is wrong with a username: the browser's own check is off.
    expect(form.noValidate).toBe(true);
    expect(form.closest('.list')).toBeNull();
    const fields = [...form.querySelectorAll<HTMLInputElement>('input, select, textarea')];
    expect(fields.map((field) => field.name)).toEqual(['username', 'givenName', 'familyName', 'email', 'address']);
    expect([fields[0]!.name, fields[0]!.type, fields[0]!.value, fields[0]!.closest('label')!.textContent.trim()]).toEqual(['username', 'text', '', 'Username']);
    const field = fields[0]!;
    expect([field.getAttribute('autocomplete'), field.getAttribute('autocapitalize'), field.getAttribute('spellcheck')]).toEqual(['off', 'none', 'false']);
    // What a username is comes from the script, with the shared rule: no pattern and no length in the page.
    expect(['pattern', 'minlength', 'maxlength', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name))).toEqual([]);
    const box = field.closest('.field')!;
    expect(box.closest('form')).toBe(form);
    expect([box.querySelector('.hint')!.textContent, box.querySelector('.hint')!.id]).toEqual(['', field.getAttribute('aria-describedby')]);
    expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent]).toEqual(['alert', '']);
    // A creation's failure is said in the invitation's dialog, not in the form.
    expect(form.querySelector('.failure')).toBeNull();
    expect([one('form.create .submit').textContent, one('.retry').textContent]).toEqual(['Create user', 'Try again']);
    expect([one('.loading').hidden, one('.unread').hidden, one('.empty').hidden]).toEqual([true, true, true]);
    expect([one('.unread .error').getAttribute('role'), one('.empty').textContent]).toEqual(['alert', '']);
  });

  it('a row of the users is the username, the name, the e-mail, the state and three buttons of type "button", "Edit", "Resend invitation" (hidden) and "Delete", and nothing in it can be typed in', () => {
    const row = pageAside().querySelector<HTMLTemplateElement>('#tpl-user-row')!.content.firstElementChild!;
    expect(row.tagName).toBe('LI');
    expect([...row.children].map((part) => [part.tagName, part.className, part.textContent, part.hasAttribute('hidden')])).toEqual([
      ['SPAN', 'username', '', false],
      ['SPAN', 'name', '', false],
      ['SPAN', 'email', '', false],
      ['SPAN', 'status', '', false],
      ['BUTTON', 'ask-edit', 'Edit', false],
      ['BUTTON', 'ask-resend', 'Resend invitation', true],
      ['BUTTON', 'danger ask-delete', 'Delete', false],
    ]);
    // Whom they edit, invite again and delete is the script's to say.
    for (const button of row.querySelectorAll('button')) expect([button.getAttribute('type'), button.hasAttribute('aria-label')]).toEqual(['button', false]);
    expect(row.querySelectorAll('input, select, textarea, a')).toHaveLength(0);
  });

  // The fields of the four facts of docs/EMAIL_ARCHITECTURE.md section 4.1, in the three forms
  // that hold them.
  it.each([
    ['#users form.create', 'off'],
    ['#users dialog.edit form.profile', 'off'],
    ['#me dialog.edit form.profile', 'own'],
  ])('the four facts of %s: each in a .field with its label and its refusal, the address on lines, no length or pattern in the page', (selector, autocomplete) => {
    loadPage();
    const form = document.querySelector<HTMLFormElement>(selector)!;
    expect(form.noValidate).toBe(true);
    const facts = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.given-name-field *, .family-name-field *, .email-field *, .address-field *')].filter((element) => ['INPUT', 'TEXTAREA'].includes(element.tagName));
    expect(facts.map((field) => [field.name, field.tagName, field.closest('label')!.firstChild!.textContent!.trim(), field.value])).toEqual([
      ['givenName', 'INPUT', 'First name', ''],
      ['familyName', 'INPUT', 'Last name', ''],
      ['email', 'INPUT', 'E-mail', ''],
      ['address', 'TEXTAREA', 'Postal address', ''],
    ]);
    // Another person's facts are never offered from the Administrator's own; one's own are.
    const offered = facts.map((field) => field.getAttribute('autocomplete'));
    expect(offered).toEqual(autocomplete === 'off' ? ['off', 'off', 'off', 'off'] : ['given-name', 'family-name', 'email', 'street-address']);
    for (const field of facts) {
      expect(['pattern', 'minlength', 'maxlength', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name)), field.name).toEqual([]);
      const refusal = field.closest('.field')!.querySelector('.refusal')!;
      expect([refusal.getAttribute('role'), refusal.textContent]).toEqual(['alert', '']);
    }
  });

  it('the Edit dialogs: "Cancel" of type "button" first, "Save" the form\'s; the users\' heading the script\'s, "My details"\' its own', () => {
    loadPage();
    for (const dialog of document.querySelectorAll('dialog.edit')) {
      expect([...dialog.querySelectorAll('button')].map((button) => [button.textContent, button.getAttribute('type')])).toEqual([['Cancel', 'button'], ['Save', null]]);
      expect(dialog.querySelector('.failure')!.closest('form')).toBe(dialog.querySelector('form'));
    }
    expect(document.querySelector('#users dialog.edit h3')!.textContent).toBe('');
    expect(document.querySelector('#me dialog.edit h3')!.textContent).toBe('Edit my details');
  });

  it('"My details" starts with its list hidden and empty, Edit and the sentence for a User hidden', () => {
    loadPage();
    const one = (selector: string) => document.querySelector<HTMLElement>(`#me ${selector}`)!;
    expect([one('.details').hidden, one('.ask-edit').hidden, one('.user-only').hidden, one('.unread').hidden, one('.loading').hidden]).toEqual([true, true, true, true, true]);
    expect([...one('.details').querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Username', 'Role', 'First name', 'Last name', 'E-mail', 'Postal address']);
    expect([...one('.details').querySelectorAll('dd')].map((value) => [value.className, value.textContent])).toEqual([
      ['username', ''],
      ['role', ''],
      ['given-name', ''],
      ['family-name', ''],
      ['email', ''],
      ['address', ''],
    ]);
    expect(one('.ask-edit').getAttribute('type')).toBe('button');
  });

  it('the invitation\'s dialog starts empty, with "Back" before "Confirm" and "Close" hidden, and nothing to type; no dialog of the page refuses the Escape key, and nothing is focused by the page itself', () => {
    loadPage();
    const dialog = document.querySelector<HTMLDialogElement>('#users dialog.invite')!;
    expect(dialog.querySelector('h3')!.textContent).toBe('Send an invitation');
    expect(['.question', '.answer', '.error'].map((part) => dialog.querySelector(part)!.textContent)).toEqual(['', '', '']);
    expect([dialog.querySelector('.answer')!.getAttribute('role'), dialog.querySelector('.error')!.getAttribute('role')]).toEqual(['status', 'alert']);
    expect([...dialog.querySelectorAll('button')].map((button) => [button.textContent, button.getAttribute('type'), button.hidden])).toEqual([
      ['Back', 'button', false],
      ['Confirm', 'button', false],
      ['Close', 'button', true],
    ]);
    expect(dialog.querySelectorAll('input, select, textarea, form, a')).toHaveLength(0);
    expect(document.querySelectorAll('dialog[closedby]')).toHaveLength(0);
    expect(document.querySelectorAll('[autofocus]')).toHaveLength(0);
  });

  it('the delete dialog starts empty, with "Keep" before "Delete user", and nothing to type', () => {
    loadPage();
    const dialog = document.querySelector<HTMLDialogElement>('#users dialog.delete')!;
    expect(dialog.querySelector('h3')!.textContent).toBe('Delete user');
    expect([dialog.querySelector('.question')!.textContent, dialog.querySelector('.error')!.textContent, dialog.querySelector('.error')!.getAttribute('role')]).toEqual(['', '', 'alert']);
    expect([...dialog.querySelectorAll('button')].map((button) => [button.textContent, button.disabled])).toEqual([['Keep', false], ['Delete user', false]]);
    expect(dialog.querySelectorAll('input, select, textarea, form')).toHaveLength(0);
  });
  describe('the availability', () => {
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(`#availability ${selector}`.trim())!;
    const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(`#availability ${selector}`)];
    // A time is two lists, whose labels say "Hour" and "Minute" to a screen reader; its group's
    // legend says "Start" or "End" (the test "every time is a group" above).
    const SIX = [
      ['weekday', 'SELECT', 'Weekday'],
      ['start-hour', 'SELECT', 'Hour'],
      ['start-minute', 'SELECT', 'Minute'],
      ['end-hour', 'SELECT', 'Hour'],
      ['end-minute', 'SELECT', 'Minute'],
      ['typeId', 'SELECT', 'Type'],
      ['validFrom', 'INPUT', 'Valid from'],
      ['validUntil', 'INPUT', 'Valid until'],
    ];

    it('has three parts, each under its heading; the first two with their form, the failure of their read with "Try again", their empty sentence and their list, all starting empty', () => {
      loadPage();
      expect([...one('').children].filter((part) => part.tagName === 'SECTION').map((part) => [part.className, part.querySelector('h3')!.textContent])).toEqual([['types', 'Types'], ['patterns', 'Weekly patterns'], ['one-date', 'A single date']]);
      for (const part of ['.types', '.patterns']) {
        expect([one(`${part} .unread`).hidden, one(`${part} .empty`).hidden, one(`${part} .empty`).textContent], part).toEqual([true, true, '']);
        expect([one(`${part} .unread .error`).getAttribute('role'), one(`${part} .unread .error`).textContent, one(`${part} .retry`).textContent], part).toEqual(['alert', '', 'Try again']);
        // The form is before the list, and outside it.
        expect(one(`${part} form`).closest('.list, .groups'), part).toBeNull();
        expect(one<HTMLFormElement>(`${part} form`).noValidate, part).toBe(true);
      }
      expect([one('.loading').hidden, one('.loading').getAttribute('role')]).toEqual([true, 'status']);
      expect([one('.types form .submit').textContent, one('.patterns form .submit').textContent]).toEqual(['Create type', 'Create pattern']);
    });

    it('a name is typed in one text field, in the form that creates a type and in the dialog that edits one: its label, its hint, its refusal, and no length or pattern in the page', () => {
      loadPage();
      const fields = [one<HTMLInputElement>('form.create-type [name="name"]'), one<HTMLInputElement>('dialog.rename [name="name"]')];
      for (const field of fields) {
        expect([field.type, field.value, field.closest('label')!.textContent.trim(), field.getAttribute('autocomplete')]).toEqual(['text', '', 'Name', 'off']);
        expect(['pattern', 'minlength', 'maxlength', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name))).toEqual([]);
        const box = field.closest('.field')!;
        expect([box.querySelector('.hint')!.textContent, box.querySelector('.hint')!.id]).toEqual(['', field.getAttribute('aria-describedby')]);
        expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent]).toEqual(['alert', '']);
        const form = field.closest('form')!;
        expect([form.noValidate, form.querySelector('.failure')!.getAttribute('role'), form.querySelector('.failure')!.textContent]).toEqual([true, 'alert', '']);
        expect(form.querySelectorAll('input, select, textarea')).toHaveLength(2);
      }
    });

    it('a capacity is typed in one number field, beside the name, in the same two places: its label, its hint, its refusal, and no range in the page', () => {
      loadPage();
      for (const field of [one<HTMLInputElement>('form.create-type [name="capacity"]'), one<HTMLInputElement>('dialog.rename [name="capacity"]')]) {
        expect([field.type, field.value, field.closest('label')!.textContent.trim(), field.getAttribute('inputmode')]).toEqual(['number', '', 'Capacity', 'numeric']);
        expect(['min', 'max', 'step', 'required', 'aria-invalid'].filter((name) => field.hasAttribute(name))).toEqual([]);
        const box = field.closest('.field')!;
        expect([box.querySelector('.hint')!.textContent, box.querySelector('.hint')!.id]).toEqual(['', field.getAttribute('aria-describedby')]);
        expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent]).toEqual(['alert', '']);
      }
    });

    it.each([['the form that creates a pattern', 'form.create-pattern'], ['the dialog that changes one', 'dialog.change form']])('%s has the six fields of a pattern, each in a field of its own with its label and its refusal; every list starts with no choice', (_what, selector) => {
      loadPage();
      const form = one<HTMLFormElement>(selector);
      expect(form.noValidate).toBe(true);
      const fields = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select, textarea')];
      expect(fields.map((field) => [field.name, field.tagName, field.closest('label')!.textContent.trim()])).toEqual(SIX);
      for (const field of fields) {
        const box = field.closest('.field')!;
        // A time's two lists share its field, its refusal under its group.
        expect(box.querySelectorAll('input, select'), field.name).toHaveLength(field.closest('fieldset.clock') ? 2 : 1);
        expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent], field.name).toEqual(['alert', '']);
        expect([field.children.length, field.value, field.hasAttribute('aria-invalid'), field.hasAttribute('required')], field.name).toEqual([0, '', false, false]);
        if (field instanceof HTMLInputElement) expect(field.type, field.name).toBe('date');
      }
      // The two hints: that a type must exist, the script's to say, and that no end is an empty field.
      const hint = (name: string) => form.querySelector(`#${form.querySelector(`[name="${name}"]`)!.getAttribute('aria-describedby')}`)!;
      expect([hint('typeId').textContent, hint('validUntil').textContent]).toEqual(['', 'Leave empty for no end.']);
      expect([form.querySelector('.failure')!.getAttribute('role'), form.querySelector('.failure')!.textContent]).toEqual(['alert', '']);
    });

    it('the conflicts list has four places, hidden and empty: the form that creates a pattern, the windows of "this day only", the dialog that changes a pattern and the dialog that confirms; one template serves the four', () => {
      loadPage();
      const boxes = all('.conflicts');
      expect(boxes.map((box) => box.closest('form.create-pattern, .draft, dialog')!.className)).toEqual(['create-pattern', 'draft', 'change', 'delete']);
      for (const box of boxes) {
        expect([box.hidden, box.querySelector('.conflicts-count')!.textContent, box.querySelector('.conflicts-list')!.children.length]).toEqual([true, '', 0]);
      }
      const row = pageAside().querySelector<HTMLTemplateElement>('#tpl-conflict')!.content.firstElementChild!;
      expect([row.tagName, [...row.children].map((part) => part.className)]).toEqual(['LI', ['date', 'time', 'username']]);
      expect(row.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    });

    it('a row of the types is the name, its places and two buttons of type "button", "Edit" and "Delete"; a row of the patterns its three texts, "ended", hidden, and "Change" and "Delete"; nothing in either can be typed in', () => {
      const template = (id: string) => pageAside().querySelector<HTMLTemplateElement>(`#${id}`)!.content.firstElementChild!;
      const parts = (row: Element) => [...row.children].map((part) => [part.tagName, part.className, part.textContent]);
      expect(parts(template('tpl-type-row'))).toEqual([['SPAN', 'name', ''], ['SPAN', 'places', ''], ['BUTTON', 'ask-rename', 'Edit'], ['BUTTON', 'danger ask-delete', 'Delete']]);
      expect(parts(template('tpl-pattern-row'))).toEqual([
        ['SPAN', 'time', ''],
        ['SPAN', 'type-name', ''],
        ['SPAN', 'validity', ''],
        ['SPAN', 'ended', 'ended'],
        ['BUTTON', 'ask-change', 'Change'],
        ['BUTTON', 'danger ask-delete', 'Delete'],
      ]);
      expect(template('tpl-pattern-row').querySelector('.ended')!.hasAttribute('hidden')).toBe(true);
      for (const id of ['tpl-type-row', 'tpl-pattern-row', 'tpl-pattern-group']) {
        const row = template(id);
        expect(row.querySelectorAll('input, select, textarea, a'), id).toHaveLength(0);
        // Which row a button is of is the script's to say.
        for (const button of row.querySelectorAll('button')) expect([button.getAttribute('type'), button.hasAttribute('aria-label')], id).toEqual(['button', false]);
      }
      expect(parts(template('tpl-pattern-group')).map(([tag, name]) => [tag, name])).toEqual([['H4', ''], ['UL', 'list']]);
      expect(template('tpl-choice').tagName).toBe('OPTION');
    });

    it('the dialogs that edit and change are forms with "Close" before their action; the one that confirms has neutral words, "Keep" before "Confirm", and nothing to type; all close with the Escape key', () => {
      loadPage();
      const buttons = (selector: string) => all<HTMLButtonElement>(`${selector} button`).map((button) => [button.textContent, button.getAttribute('type'), button.disabled]);
      expect([one('dialog.rename h3').textContent, one('dialog.change h3').textContent, one('dialog.delete h3').textContent]).toEqual(['Edit type', 'Change pattern', 'Please confirm']);
      expect(buttons('dialog.rename')).toEqual([['Close', 'button', false], ['Save', null, false]]);
      expect(buttons('dialog.change')).toEqual([['Close', 'button', false], ['Change', null, false]]);
      expect(buttons('dialog.delete')).toEqual([['Keep', 'button', false], ['Confirm', 'button', false]]);
      expect(one('dialog.delete').querySelectorAll('input, select, textarea, form')).toHaveLength(0);
      expect([one('dialog.delete .question').textContent, one('dialog.delete .error').textContent, one('dialog.delete .error').getAttribute('role')]).toEqual(['', '', 'alert']);
      expect(all('dialog[closedby]')).toHaveLength(0);
    });

    describe('a single date', () => {
      const part = <T extends HTMLElement = HTMLElement>(selector: string) => one<T>(`.one-date ${selector}`);
      const parts = <T extends HTMLElement = HTMLElement>(selector: string) => all<T>(`.one-date ${selector}`);

      it('the date is chosen in one native date field with its label and its refusal, and "Show"; nothing of a day is shown at the start', () => {
        loadPage();
        const form = part<HTMLFormElement>('form.choose');
        const fields = [...form.querySelectorAll<HTMLInputElement>('input, select, textarea')];
        expect(fields.map((field) => [field.name, field.type, field.value, field.closest('label')!.textContent.trim()])).toEqual([['date', 'date', '', 'Date']]);
        expect(['min', 'max', 'required', 'aria-invalid'].filter((name) => fields[0]!.hasAttribute(name))).toEqual([]);
        const refusal = fields[0]!.closest('.field')!.querySelector('.refusal')!;
        expect([form.noValidate, refusal.getAttribute('role'), refusal.textContent, form.querySelector('.submit')!.textContent]).toEqual([true, 'alert', '', 'Show']);
        expect([part('.loading').hidden, part('.loading').getAttribute('role'), part('.unread').hidden, part('.unread .error').getAttribute('role'), part('.retry').textContent]).toEqual([true, 'status', true, 'alert', 'Try again']);
        expect([part('.shown').hidden, part('.draft').hidden, part('.shown').contains(part('.draft'))]).toEqual([true, true, true]);
      });

      it('the day has its two descriptions, the windows being put together and the extra windows, each under its words and each with an empty list; its three buttons do not send a form', () => {
        loadPage();
        expect(parts('.shown h4').map((heading) => heading.textContent)).toEqual(['As the weekly patterns give it', 'As it is now', 'This day only', 'Extra windows']);
        expect(parts('.shown ul').map((list) => [list.className, list.children.length])).toEqual([['list given-rows', 0], ['list own-rows', 0], ['list draft-rows', 0], ['conflicts-list', 0], ['list extra-rows', 0]]);
        expect(parts('.shown p:not(.error)').map((text) => text.textContent).join('')).toBe('');
        expect(parts<HTMLButtonElement>('.as-now button').map((button) => [button.className, button.textContent, button.type])).toEqual([
          ['edit', 'This day only…', 'button'],
          ['make-closed', 'Not available on this day', 'button'],
          ['back', 'Back to the weekly patterns', 'button'],
        ]);
      });

      it.each([['the form that adds a window to "this day only"', 'form.add-draft', 'Add'], ['the form that adds an extra window', 'form.add-window', 'Add window']])('%s has three lists, "Start", "End" and "Type", each in a field of its own with its refusal, and a failure; it is outside every list', (_what, selector, action) => {
        loadPage();
        const form = part<HTMLFormElement>(selector);
        const fields = [...form.querySelectorAll<HTMLSelectElement>('input, select, textarea')];
        expect(fields.map((field) => [field.name, field.tagName, field.closest('label')!.textContent.trim()])).toEqual([
          ['start-hour', 'SELECT', 'Hour'],
          ['start-minute', 'SELECT', 'Minute'],
          ['end-hour', 'SELECT', 'Hour'],
          ['end-minute', 'SELECT', 'Minute'],
          ['typeId', 'SELECT', 'Type'],
        ]);
        expect([...form.querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual(['Start', 'End']);
        for (const field of fields) {
          const box = field.closest('.field')!;
          expect(box.querySelectorAll('input, select'), field.name).toHaveLength(field.closest('fieldset.clock') ? 2 : 1);
          expect([box.querySelector('.refusal')!.getAttribute('role'), box.querySelector('.refusal')!.textContent, field.children.length, field.hasAttribute('aria-invalid')], field.name).toEqual(['alert', '', 0, false]);
        }
        expect([form.noValidate, form.querySelector('.failure')!.getAttribute('role'), form.querySelector('.failure')!.textContent, form.querySelector('.submit')!.textContent]).toEqual([true, 'alert', '', action]);
        expect(form.closest('ul, ol')).toBeNull();
      });

      it('the windows being put together are saved or dropped by two buttons that send no form, "Discard" before "Save this day", under a failure of their own', () => {
        loadPage();
        expect(parts<HTMLButtonElement>('.draft > .actions button').map((button) => [button.className, button.textContent, button.type, button.disabled])).toEqual([
          ['discard', 'Discard', 'button', false],
          ['primary save', 'Save this day', 'button', false],
        ]);
        expect([part('.save-failure').getAttribute('role'), part('.save-failure').textContent, part('.save-failure').closest('form')]).toEqual(['alert', '', null]);
      });

      it('a window to read is its hours and its type; one being put together has "Remove" and an extra one "Delete", buttons of type "button"; nothing in any of them can be typed in', () => {
        const template = (id: string) => pageAside().querySelector<HTMLTemplateElement>(`#${id}`)!.content.firstElementChild!;
        const texts = (row: Element) => [...row.children].map((each) => [each.tagName, each.className, each.textContent]);
        const TWO = [['SPAN', 'time', ''], ['SPAN', 'type-name', '']];
        expect(texts(template('tpl-date-window'))).toEqual(TWO);
        expect(texts(template('tpl-draft-row'))).toEqual([...TWO, ['BUTTON', 'remove', 'Remove']]);
        expect(texts(template('tpl-extra-row'))).toEqual([...TWO, ['BUTTON', 'danger ask-delete', 'Delete']]);
        for (const id of ['tpl-date-window', 'tpl-draft-row', 'tpl-extra-row']) {
          const row = template(id);
          expect([row.tagName, row.className], id).toEqual(['LI', 'window-row']);
          expect(row.querySelectorAll('input, select, textarea, a'), id).toHaveLength(0);
          // Which window a button is of is the script's to say.
          for (const button of row.querySelectorAll('button')) expect([button.getAttribute('type'), button.hasAttribute('aria-label')], id).toEqual(['button', false]);
        }
      });
    });
  });

  describe('the assistant\'s panel', () => {
    beforeEach(loadPage);
    const panel = () => document.querySelector<HTMLElement>('#assistant')!;
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => panel().querySelector<T>(selector)!;

    it('is in the frame, after the screens and in none of them, hidden, a region with a name of its own', () => {
      expect(panel().parentElement!.id).toBe('app');
      expect(panel().closest('main')).toBeNull();
      expect(document.querySelector('main.screen')!.compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Its name is the words of its own button, which opens and closes it.
      const name = document.getElementById(panel().getAttribute('aria-labelledby')!)!;
      expect([panel().tagName, name.textContent, panel().contains(name), panel().hidden, panel().className]).toEqual(['SECTION', 'Assistant', true, true, 'assistant']);
      // It is no screen: the navigation is filled by the script from the table of screens, and
      // no link of the page leads to it.
      expect(document.querySelectorAll('a[href*="assistant"]')).toHaveLength(0);
    });

    it('starts collapsed: the heading is a button that says so, and the conversation\'s part with "New conversation" and "Close" is hidden', () => {
      const toggle = one('.toggle');
      expect([toggle.textContent, toggle.getAttribute('aria-expanded'), toggle.parentElement!.tagName]).toEqual(['Assistant', 'false', 'H2']);
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBe(one('.talk'));
      expect([one('.talk').hidden, one('.end').hidden, one('.collapse').hidden]).toEqual([true, true, true]);
      expect([one('.end').textContent, one('.collapse').textContent]).toEqual(['New conversation', 'Close']);
      // What is hidden holds everything of a conversation: collapsed, none of it is reached.
      for (const part of ['.processed', '.messages', '.progress', '.news', '.proposal', '.error', '.remaining']) expect(one('.talk').contains(one(part)), part).toBe(true);
    });

    it('the arrow the style sheet draws beside the heading has no words for a screen reader: the button is named "Assistant" alone', () => {
      const sheet = readFileSync(PAGE_FILE.replace('index.html', 'style.css'), 'utf8');
      const arrows = sheet.split('\n').filter((line) => line.startsWith('.assistant .toggle') && line.includes('::after'));
      expect(arrows).toHaveLength(2);
      // The last declaration of each rule is the one a browser that knows the slash applies.
      for (const rule of arrows) expect(rule.slice(rule.lastIndexOf('content:')), rule).toMatch(/^content: ' [▴▾]' \/ ''; \}$/);
      expect(one('.toggle').hasAttribute('aria-label')).toBe(false);
    });

    it('says who processes the conversation, in fixed words, at the top of the open part', () => {
      expect(one('.talk').firstElementChild).toBe(one('.processed'));
      expect(one('.processed').textContent).toBe("This conversation is processed by Anthropic's Claude.");
    });

    it('the conversation starts empty; the proposal is hidden and empty, its two buttons after the list, "Confirm" first, with no words of the page', () => {
      expect([one('.messages').children.length, one('.progress').textContent, one('.news').textContent, one('.remaining').textContent]).toEqual([0, '', '', '']);
      expect([one('.proposal').hidden, one('.asks').textContent, one('.changes').children.length]).toEqual([true, '', 0]);
      const buttons = [...one('.proposal').querySelectorAll('button')];
      expect(buttons.map((button) => [button.className, button.textContent, button.getAttribute('type')])).toEqual([['primary confirm', '', 'button'], ['decline', '', 'button']]);
      expect(one('.messages').compareDocumentPosition(one('.proposal')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect([one('.error').getAttribute('role'), one('.news').getAttribute('role'), one('.progress').hasAttribute('role')]).toEqual(['alert', 'status', false]);
    });

    it('the field is one line with its label and "Send", in a form outside the part that is hidden; its length is the script\'s to set', () => {
      const field = one<HTMLInputElement>('[name="message"]');
      expect([field.tagName, field.type, field.hasAttribute('maxlength'), field.getAttribute('autocomplete')]).toEqual(['INPUT', 'text', false, 'off']);
      expect(field.closest('form')).toBe(one('.compose'));
      expect(one('.talk').contains(field)).toBe(false);
      expect(one('.compose').querySelectorAll('button')).toHaveLength(1);
      expect(one('.send').textContent).toBe('Send');
    });

    it('a message and a change of a proposal are rows that nothing can be typed or pressed in', () => {
      const template = (id: string) => one<HTMLTemplateElement>(`#${id}`).content.firstElementChild!;
      expect([...template('tpl-message').children].map((part) => [part.tagName, part.className])).toEqual([['SPAN', 'author'], ['P', 'text']]);
      expect([...template('tpl-proposed').children].map((part) => part.className)).toEqual(['summary', 'outcome']);
      for (const id of ['tpl-message', 'tpl-proposed']) expect(template(id).querySelectorAll('button, a, input, select, textarea'), id).toHaveLength(0);
    });
  });
});
