import { MailSettingsService } from '../../src/services/mail-settings.service';
import type { SessionStore } from '../../src/services/session.store';
import { API, outcome, signedIn } from './local';

// The daily mail's settings of docs/EMAIL_ARCHITECTURE.md section 9.1: MailSettingsService against
// the back end's local stack (docs/FRONTEND_SERVICES.md section 25), where e-mail is switched on.
// Runs only with RUN_INTEGRATION=1.
//
// The settings are one for the whole calendar: the file reads those it finds, changes them, and
// writes back what it found at the end, as the calendar journeys do with the calendar's settings.
// It sends no mail: the daily run itself is the back end's journey.

let admin: SessionStore;
let alice: SessionStore;
let found: { dailyEnabled: boolean; dailyHour: number } | undefined;

const read = (store: SessionStore) => {
  const service = new MailSettingsService(API, store);
  return outcome(service.settingsResult$, () => service.getSettings());
};
const save = (store: SessionStore, settings: { dailyEnabled: boolean; dailyHour: number }) => {
  const service = new MailSettingsService(API, store);
  return outcome(service.updateResult$, () => service.updateSettings(settings));
};

// Explained in simple words in docs/journeys/frontend/mail-settings.md.
describe('the daily mail settings', () => {
  beforeAll(async () => {
    admin = await signedIn('admin');
    alice = await signedIn('alice');
    const result = await read(admin);
    if (result.status !== 'success') throw new Error(`could not read the mail settings: ${JSON.stringify(result)}`);
    found = result.settings;
  });
  afterAll(async () => {
    if (found !== undefined) expect(await save(admin, found)).toEqual({ status: 'success', settings: found });
    for (const store of [admin, alice]) store.clear(); // stops the expiry timers
  });

  it('the Administrator saves another hour, switched off, and reads it back', async () => {
    const other = { dailyEnabled: !found!.dailyEnabled, dailyHour: (found!.dailyHour + 5) % 24 };
    expect(await save(admin, other)).toEqual({ status: 'success', settings: other });
    expect(await read(admin)).toEqual({ status: 'success', settings: other });
  });

  it('an hour of 24 is refused before any request; the settings are unchanged', async () => {
    const before = await read(admin);
    const refused = await save(admin, { dailyEnabled: true, dailyHour: 24 });
    expect(refused).toMatchObject({ status: 'failure', reason: 'invalid_request' });
    expect(await read(admin)).toEqual(before);
  });

  it('a User is refused both: forbidden', async () => {
    expect(await read(alice)).toMatchObject({ status: 'failure', reason: 'forbidden' });
    expect(await save(alice, { dailyEnabled: true, dailyHour: 7 })).toMatchObject({ status: 'failure', reason: 'forbidden' });
  });
});
