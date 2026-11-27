import readXlsxFile from 'read-excel-file/node';
import type { ViewAppointment } from '../../../src/lib/calendarRules';
import { appointmentsFile } from '../../../src/lib/excel';

// The Excel files of docs/EMAIL_ARCHITECTURE.md section 6.3, read back with read-excel-file.
const ZONE = 'Europe/Rome';
const actor = { username: 'admin', role: 'admin' } as const;

function appointment(userId: string, username: string, more: Partial<ViewAppointment['appointment']> = {}): ViewAppointment {
  return {
    userId,
    appointment: {
      appointmentId: `id-${username}`,
      username,
      start: '2026-12-01T09:00:00.000Z',
      end: '2026-12-01T10:00:00.000Z',
      date: '2026-12-01',
      typeId: 'type-1',
      typeName: 'Visita è',
      note: null,
      status: 'booked',
      createdAt: '2026-11-20T16:05:00.000Z',
      createdBy: actor,
      updatedAt: '2026-11-20T16:05:00.000Z',
      updatedBy: actor,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      replaces: null,
      replacedBy: null,
      ...more,
    },
  };
}

const ANNA = appointment('sub-anna', 'anna', { note: 'Porta il referto' });
const GONE = appointment('sub-gone', 'gone', { status: 'cancelled', cancelReason: 'user_deleted', start: '2026-12-01T13:30:00.000Z', end: '2026-12-01T14:00:00.000Z' });
const MOVED = appointment('sub-anna', 'anna', { status: 'cancelled', cancelReason: 'changed' });
const CANCELLED = appointment('sub-anna', 'anna', { status: 'cancelled', cancelReason: 'cancelled' });

async function sheetOf(file: Buffer, name = 'Appointments') {
  const sheets = await readXlsxFile(file);
  expect(sheets.map((s) => s.sheet)).toEqual([name]);
  return sheets[0]!.data;
}

describe('appointmentsFile', () => {
  it("the Administrator's file: the eleven columns, local times, the names by sub, empty for a deleted account", async () => {
    const names = new Map([['sub-anna', { givenName: 'Anna', familyName: 'Rossi' }]]);

    const rows = await sheetOf(await appointmentsFile('en', [ANNA, GONE], ZONE, names));

    expect(rows).toEqual([
      ['Date', 'Start', 'End', 'Type', 'Username', 'First name', 'Last name', 'Status', 'Cancelled because', 'Note', 'Booked at'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'Anna', 'Rossi', 'booked', null, 'Porta il referto', '2026-11-20 17:05'],
      ['2026-12-01', '14:30', '15:00', 'Visita è', 'gone', null, null, 'cancelled', 'user deleted', null, '2026-11-20 17:05'],
    ]);
  });

  it("a User's file: no name columns, each reason in words", async () => {
    const rows = await sheetOf(await appointmentsFile('en', [MOVED, CANCELLED], ZONE, null));

    expect(rows).toEqual([
      ['Date', 'Start', 'End', 'Type', 'Username', 'Status', 'Cancelled because', 'Note', 'Booked at'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'cancelled', 'changed', null, '2026-11-20 17:05'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'cancelled', 'cancelled', null, '2026-11-20 17:05'],
    ]);
  });

  it('a file of no appointment holds the headings alone', async () => {
    expect(await sheetOf(await appointmentsFile('en', [], ZONE, null))).toHaveLength(1);
  });

  // The file in Italian (docs/MULTILANGUAGE_ARCHITECTURE.md decision L3): the headings, the sheet's
  // name, the statuses and the reasons in words of the language; the dates and the times as they are.
  it('in Italian: the headings, the sheet, the statuses and the reasons in Italian, the dates and times unchanged', async () => {
    const names = new Map([['sub-anna', { givenName: 'Anna', familyName: 'Rossi' }]]);

    const rows = await sheetOf(await appointmentsFile('it', [ANNA, GONE, MOVED, CANCELLED], ZONE, names), 'Appuntamenti');

    expect(rows).toEqual([
      ['Data', 'Inizio', 'Fine', 'Tipo', 'Nome utente', 'Nome', 'Cognome', 'Stato', "Motivo dell'annullamento", 'Nota', 'Prenotato il'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'Anna', 'Rossi', 'prenotato', null, 'Porta il referto', '2026-11-20 17:05'],
      ['2026-12-01', '14:30', '15:00', 'Visita è', 'gone', null, null, 'annullato', 'utente eliminato', null, '2026-11-20 17:05'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'Anna', 'Rossi', 'annullato', 'spostato', null, '2026-11-20 17:05'],
      ['2026-12-01', '10:00', '11:00', 'Visita è', 'anna', 'Anna', 'Rossi', 'annullato', 'annullato', null, '2026-11-20 17:05'],
    ]);
  });
});
