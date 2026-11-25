import { calendarMailText, dailyMailText, MAIL_FOOTER, mineMailText } from '../../src/index';

// Test names: the section number is that of docs/EMAIL_ARCHITECTURE.md.
describe('the texts of the mails (6.6)', () => {
  it('words the daily mail, with the footer last', () => {
    const mail = dailyMailText({ date: '2026-11-26', nextCount: 1, backupFrom: '2026-10-01', nextFile: 'next-7-days.xlsx', backupFile: 'backup.xlsx' });
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
    const mail = calendarMailText({ from: '2026-12-01', to: '2026-12-07', count: 12, file: 'calendar.xlsx' });
    expect(mail.subject).toBe('Calendar, Tue 1 Dec 2026 to Mon 7 Dec 2026');
    expect(mail.text).toContain('holds 12 appointments, booked and cancelled.');
    expect(mail.text).toContain('Attached: calendar.xlsx.');
  });

  it("lists a User's appointments in the body", () => {
    const mail = mineMailText({
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
    const mail = mineMailText({ from: '2026-12-01', to: '2026-12-01', file: 'my-appointments.xlsx', appointments: [] });
    expect(mail.text.startsWith('You have no appointments in this period.\n\nAttached: my-appointments.xlsx.')).toBe(true);
    expect(mail.html).not.toContain('<ul>');
  });

  it('escapes the characters HTML gives a meaning', () => {
    const mail = calendarMailText({ from: '2026-12-01', to: '2026-12-01', count: 0, file: 'a&b"c.xlsx' });
    expect(mail.html).toContain('Attached: a&amp;b&quot;c.xlsx.');
  });
});
