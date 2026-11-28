import { calendarMailText, dailyMailText, EXCEL_COLUMNS, invitationMailText, mailTexts, mineMailText, SUPPORTED_LANGUAGES, type Language } from '../../src/index';

const MAIL_FOOTER = mailTexts('en').footer;

// Test names: the section number is that of docs/EMAIL_ARCHITECTURE.md.
describe('the texts of the mails (6.6)', () => {
  it('words the daily mail, with the footer last', () => {
    const mail = dailyMailText('en', { date: '2026-11-26', nextCount: 1, backupFrom: '2026-10-01', nextFile: 'next-7-days.xlsx', backupFile: 'backup.xlsx' });
    expect(mail.subject).toBe('Calendar: next 7 days and backup, Thu 26 Nov 2026');
    expect(mail.text).toBe(
      'The next 7 days hold 1 appointment.\n\n' +
        'Attached: next-7-days.xlsx, the appointments booked from today for 7 days; backup.xlsx, the backup.\n\n' +
        'The backup covers every appointment from Thu 1 Oct 2026 onwards.\n\n' +
        `${MAIL_FOOTER}\n`,
    );
    expect(mail.html.split('\n')).toHaveLength(4);
    expect(mail.html).toContain("<p>This is an automatic e-mail. Replies reach the calendar&#39;s Administrator.</p>");
  });

  it('words the calendar for the Administrator, the count in the plural', () => {
    const mail = calendarMailText('en', { from: '2026-12-01', to: '2026-12-07', count: 12, file: 'calendar.xlsx' });
    expect(mail.subject).toBe('Calendar, Tue 1 Dec 2026 to Mon 7 Dec 2026');
    expect(mail.text).toContain('holds 12 appointments, booked and cancelled.');
    expect(mail.text).toContain('Attached: calendar.xlsx.');
  });

  it("lists a User's appointments in the body", () => {
    const mail = mineMailText('en', {
      from: '2026-12-01',
      to: '2026-12-07',
      file: 'my-appointments.xlsx',
      appointments: [
        { date: '2026-12-01', start: '10:00', end: '11:00', type: 'Visit', status: 'booked' },
        { date: '2026-12-03', start: '09:00', end: '09:30', type: 'Call <short>', status: 'cancelled' },
      ],
    });
    expect(mail.subject).toBe('Your appointments, Tue 1 Dec 2026 to Mon 7 Dec 2026');
    expect(mail.text).toBe(
      'Your appointments from Tue 1 Dec 2026 to Mon 7 Dec 2026:\n\n' +
        '- Tue 1 Dec 2026, 10:00–11:00, Visit, booked\n- Thu 3 Dec 2026, 09:00–09:30, Call <short>, cancelled\n\n' +
        'Attached: my-appointments.xlsx, the same list.\n\n' +
        `${MAIL_FOOTER}\n`,
    );
    expect(mail.html).toContain('<ul><li>Tue 1 Dec 2026, 10:00–11:00, Visit, booked</li><li>Thu 3 Dec 2026, 09:00–09:30, Call &lt;short&gt;, cancelled</li></ul>');
  });

  it('says when a User has no appointment in the period', () => {
    const mail = mineMailText('en', { from: '2026-12-01', to: '2026-12-01', file: 'my-appointments.xlsx', appointments: [] });
    expect(mail.text.startsWith('You have no appointments in this period.\n\nAttached: my-appointments.xlsx.')).toBe(true);
    expect(mail.html).not.toContain('<ul>');
  });

  it('escapes the characters HTML gives a meaning', () => {
    const mail = calendarMailText('en', { from: '2026-12-01', to: '2026-12-01', count: 0, file: 'a&b"c.xlsx' });
    expect(mail.html).toContain('Attached: a&amp;b&quot;c.xlsx.');
  });
});

// The mails and the files in every language of the calendar (docs/MULTILANGUAGE_ARCHITECTURE.md
// section 8).
describe('the mails and the files in each language', () => {
  const LINES = [
    { date: '2026-12-01', start: '10:00', end: '11:00', type: 'Visit <b>', status: 'booked' as const },
    { date: '2026-12-03', start: '09:00', end: '09:30', type: 'Call', status: 'cancelled' as const },
  ];
  const mails = (language: Language) => [
    dailyMailText(language, { date: '2026-11-26', nextCount: 1, backupFrom: '2026-10-01', nextFile: 'a&b.xlsx', backupFile: 'backup.xlsx' }),
    dailyMailText(language, { date: '2026-11-26', nextCount: 4, backupFrom: '2026-10-01', nextFile: 'next.xlsx', backupFile: 'backup.xlsx' }),
    calendarMailText(language, { from: '2026-12-01', to: '2026-12-07', count: 1, file: 'calendar.xlsx' }),
    calendarMailText(language, { from: '2026-12-01', to: '2026-12-07', count: 12, file: 'calendar.xlsx' }),
    mineMailText(language, { from: '2026-12-01', to: '2026-12-07', file: 'mine.xlsx', appointments: LINES }),
    mineMailText(language, { from: '2026-12-01', to: '2026-12-07', file: 'mine.xlsx', appointments: [] }),
  ];
  // The HTML read back as text: the tags gone, the entities written out, a list item as the plain text writes it.
  const readBack = (html: string) =>
    html
      .replace(/<li>/g, '\n- ')
      .replace(/<\/p>\n?/g, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const words = (text: string) => text.replace(/\s+/g, ' ').trim();

  describe.each(SUPPORTED_LANGUAGES)('%s', (language) => {
    it('every mail has a subject and a body; the HTML says what the plain text says, marked with the language, its values escaped', () => {
      for (const mail of mails(language)) {
        expect(mail.subject).not.toBe('');
        expect(mail.text.endsWith(`${mailTexts(language).footer}\n`)).toBe(true);
        expect(mail.html.startsWith(`<div lang="${language}"><p>`)).toBe(true);
        expect(mail.html).not.toMatch(/<b>|a&b/);
        expect(words(readBack(mail.html))).toBe(words(mail.text));
      }
    });

    it('every text of the files is there; the sheet\'s name within Excel\'s 31 characters; the file names in plain letters, digits and "-"', () => {
      const texts = mailTexts(language);
      for (const text of [...Object.values(texts.headings), ...Object.values(texts.statuses), ...Object.values(texts.reasons), texts.sheet]) expect(text).not.toBe('');
      expect(Object.keys(texts.headings)).toEqual([...EXCEL_COLUMNS]);
      expect(texts.sheet.length).toBeLessThanOrEqual(31);
      const names = [texts.files.calendar('2026-12-01', '2026-12-07'), texts.files.mine('2026-12-01', '2026-12-07'), texts.files.next7Days('2026-11-26'), texts.files.backup('2026-10-01')];
      for (const name of names) expect(name).toMatch(/^[a-z0-9-]+\.xlsx$/);
      expect(new Set(names).size).toBe(4);
    });
  });

  it('Italian: one and several, the dates in Italian, the list of a User\'s appointments with its statuses', () => {
    const [one, four, calendarOne, calendarMany, mine, none] = mails('it');
    expect(one!.text.startsWith("Nei prossimi 7 giorni c'è 1 appuntamento.\n\n")).toBe(true);
    expect(four!.text.startsWith('Nei prossimi 7 giorni ci sono 4 appuntamenti.\n\n')).toBe(true);
    expect(one!.subject).toBe('Calendario: prossimi 7 giorni e copia di sicurezza, gio 26 nov 2026');
    expect(calendarOne!.text).toContain('contiene 1 appuntamento, prenotati e annullati.');
    expect(calendarMany!.subject).toBe('Calendario, dal mar 1 dic 2026 al lun 7 dic 2026');
    expect(mine!.text).toContain('- mar 1 dic 2026, 10:00–11:00, Visit <b>, prenotato\n- gio 3 dic 2026, 09:00–09:30, Call, annullato');
    expect(none!.text.startsWith('Non ha appuntamenti in questo periodo.')).toBe(true);
    expect(mailTexts('it').files.mine('2026-12-01', '2026-12-07')).toBe('miei-appuntamenti-dal-2026-12-01-al-2026-12-07.xlsx');
  });
});

// The invitation, which the invitation function answers to Cognito (docs/MULTILANGUAGE_ARCHITECTURE.md section 7).
describe('the invitation', () => {
  const FACTS = { username: '{username}', password: '{####}', page: 'https://calendar.example.com' };

  it('in English: the words of the pool\'s own template, the two placeholders and the link', () => {
    const mail = invitationMailText('en', FACTS);
    expect(mail.subject).toBe('Your account on the shared calendar');
    expect(mail.html).toBe(
      '<div lang="en"><p>Hello, an account was created for you.</p>\n' +
        '<p>Username: {username}<br>Temporary password: {####}</p>\n' +
        '<p>Sign in at <a href="https://calendar.example.com">https://calendar.example.com</a>: you will be asked to choose your own password. The temporary password works once and expires in 7 days.</p>\n' +
        '<p>If you did not expect this e-mail, ignore it.</p>\n' +
        "<p>This is an automatic e-mail. Replies reach the calendar&#39;s Administrator.</p></div>",
    );
  });

  it.each(SUPPORTED_LANGUAGES)('%s: each placeholder once, the body within 20 000 characters and the subject within 140, marked with its language', (language) => {
    const mail = invitationMailText(language, FACTS);
    expect(mail.html.split('{username}')).toHaveLength(2);
    expect(mail.html.split('{####}')).toHaveLength(2);
    expect(mail.html.length).toBeLessThanOrEqual(20_000);
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.subject.length).toBeLessThanOrEqual(140);
    expect(mail.html.startsWith(`<div lang="${language}">`)).toBe(true);
  });

  it('in Italian, with the "lei"', () => {
    const mail = invitationMailText('it', FACTS);
    expect(mail.subject).toBe('Il suo account sul calendario condiviso');
    expect(mail.html).toContain('<p>Nome utente: {username}<br>Password temporanea: {####}</p>');
    expect(mail.html).toContain('<p>Acceda da <a href="https://calendar.example.com">https://calendar.example.com</a>: le verrà chiesto');
  });

  it('a page address with markup is written as text', () => {
    expect(invitationMailText('en', { ...FACTS, page: 'https://x.example/"><b>' }).html).toContain('href="https://x.example/&quot;&gt;&lt;b&gt;"');
  });
});
